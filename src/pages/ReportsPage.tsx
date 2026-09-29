/**
 * Reports Page: Evaluation & Multi-Run Time-Series History
 * - Multi-run history selector
 * - Conforms to ISRO PS 26169 benchmark metrics
 * - Non-gradient 1.5px time-series charts
 * - Clean desktop layout with status dots instead of pill badges
 * - Instant JSON, CSV, and Python script export
 * - Automated benchmark matrix runner
 */

import React, { useState, useRef, useEffect } from 'react';
import { PerformanceLogger } from '../core/logger';
import { PerformanceMetrics, ThresholdEvaluation, RunRecord } from '../types';
import { AutomatedSuiteView } from '../components/AutomatedSuiteView';
import { SuiteTestCase, SuiteResult } from '../core/benchmarkSuite';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Terminal,
} from 'lucide-react';

interface ReportsPageProps {
  logger: PerformanceLogger;
  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
  onRunSuiteCase: (tc: SuiteTestCase) => Promise<SuiteResult>;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  logger,
  metrics,
  thresholds,
  onRunSuiteCase,
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string>('current');

  const historyChartRef = useRef<HTMLCanvasElement | null>(null);
  const dynamicsChartRef = useRef<HTMLCanvasElement | null>(null);

  const selectedRun: RunRecord | null =
    selectedRunId === 'current'
      ? null
      : logger.runs.find((r) => r.id === selectedRunId) || null;

  const displayMetrics = selectedRun ? selectedRun.metrics : metrics;
  const displayThresholds = selectedRun ? selectedRun.thresholds : thresholds;
  const displayLogs = selectedRun ? selectedRun.frameLogs : logger.frameLogs;

  const hasAcquired = displayMetrics.acquisitionTimeSec > 0;
  const hasLockedFrames = displayMetrics.lockedFrames > 0;
  const hasTotalFrames = displayMetrics.totalFrames > 0;

  const acqEvaluated = hasAcquired;
  const acqPassed = acqEvaluated && displayMetrics.acquisitionTimeSec <= 2.0;

  const errEvaluated = hasLockedFrames || (hasAcquired && displayMetrics.avgErrorPx > 0);
  const errPassed = errEvaluated && displayMetrics.avgErrorPx <= 10.0;

  const lossEvaluated = hasTotalFrames;
  const lossPassed = lossEvaluated && displayMetrics.targetLossRatePct < 5.0;

  const reacqEvaluated = displayMetrics.reacquisitionTimeSec > 0;
  const reacqPassed = !reacqEvaluated || displayMetrics.reacquisitionTimeSec <= 1.0;

  const speedEvaluated = displayMetrics.fps > 0;
  const speedPassed = speedEvaluated && displayMetrics.fps >= 20.0;

  const lockRetEvaluated = hasTotalFrames;
  const lockRetPassed = lockRetEvaluated && displayMetrics.lockRetentionRatePct >= 85.0;

  const evalList = [
    { name: 'Acquisition time', spec: '≤ 2.0 s', actual: hasAcquired ? `${displayMetrics.acquisitionTimeSec.toFixed(2)} s` : '--', evaluated: acqEvaluated, passed: acqPassed },
    { name: 'Tracking error', spec: '≤ 10.0 px', actual: errEvaluated ? `${displayMetrics.avgErrorPx.toFixed(2)} px` : '--', evaluated: errEvaluated, passed: errPassed },
    { name: 'Target loss rate', spec: '< 5.0 %', actual: lossEvaluated ? `${displayMetrics.targetLossRatePct.toFixed(1)} %` : '--', evaluated: lossEvaluated, passed: lossPassed },
    { name: 'Re-acquisition time', spec: '≤ 1.0 s', actual: reacqEvaluated ? `${displayMetrics.reacquisitionTimeSec.toFixed(2)} s` : '--', evaluated: reacqEvaluated, passed: reacqPassed },
    { name: 'Processing rate', spec: '≥ 20 FPS', actual: `${displayMetrics.fps.toFixed(1)} FPS`, evaluated: speedEvaluated, passed: speedPassed },
    { name: 'Lock retention rate', spec: '≥ 85.0 %', actual: lockRetEvaluated ? `${displayMetrics.lockRetentionRatePct.toFixed(1)} %` : '--', evaluated: lockRetEvaluated, passed: lockRetPassed },
  ];

  const evaluatedCount = evalList.filter((e) => e.evaluated).length;
  const passedCount = evalList.filter((e) => e.evaluated && e.passed).length;

  const handleDownloadJson = () => {
    const jsonStr = logger.exportJson(displayMetrics, displayThresholds, displayLogs);
    logger.downloadFile(
      `lakshya-fsoc-${selectedRunId}-report-${Date.now()}.json`,
      jsonStr,
      'application/json'
    );
  };

  const handleDownloadCsv = () => {
    const csvStr = logger.exportCsv(displayMetrics, displayLogs);
    logger.downloadFile(
      `lakshya-fsoc-${selectedRunId}-telemetry-${Date.now()}.csv`,
      csvStr,
      'text/csv'
    );
  };

  const handleDownloadPythonScript = async () => {
    try {
      const response = await fetch('/isro_fsoc_tracker.py');
      const text = await response.text();
      logger.downloadFile('isro_fsoc_tracker.py', text, 'text/x-python');
    } catch {
      logger.downloadFile(
        'isro_fsoc_tracker.py',
        '# Refer to project root /isro_fsoc_tracker.py',
        'text/x-python'
      );
    }
  };

  const getThemePalette = () => {
    const isDark =
      document.documentElement.dataset.theme !== 'light' &&
      !document.documentElement.classList.contains('light');
    return {
      bg: isDark ? '#111214' : '#ffffff',
      grid: isDark ? 'rgba(154, 157, 163, 0.12)' : 'rgba(213, 216, 221, 0.65)',
      border: isDark ? '#34363b' : '#d5d8dd',
      textDim: isDark ? '#80848b' : '#6b6f76',
      errorLine: isDark ? '#5b8ac0' : '#3a6699',
      panLine: isDark ? '#5b8ac0' : '#3a6699',
      tiltLine: isDark ? '#d19a2a' : '#a86f0c',
      threshLine: isDark ? '#e05252' : '#c23a3a',
    };
  };

  // Render Historical Tracking Error Chart (1.5px solid line, no gradient)
  useEffect(() => {
    const canvas = historyChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const palette = getThemePalette();

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    if (displayLogs.length === 0) {
      ctx.fillStyle = palette.textDim;
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No recorded telemetry in this run yet. Run simulation to log data.', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }

    const maxVal = 25;
    const toY = (val: number) => h - (Math.min(maxVal, val) / maxVal) * (h - 24) - 12;

    // Faint Gridlines
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    [5, 10, 15, 20].forEach((lvl) => {
      const y = toY(lvl);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = palette.textDim;
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`${lvl}`, 4, y - 2);
    });

    // 10px ISRO Threshold line
    const threshY = toY(10);
    ctx.strokeStyle = palette.threshLine;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = palette.threshLine;
    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('10 px (spec max)', w - 100, threshY - 3);

    // Plot tracking error curve (1.5px, no gradient fill)
    ctx.strokeStyle = palette.errorLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = w / Math.max(1, displayLogs.length - 1);
    for (let i = 0; i < displayLogs.length; i++) {
      const x = i * step;
      const y = toY(displayLogs[i].trackingErrorPx);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [displayLogs, selectedRunId]);

  // Render Servo Dynamics Chart
  useEffect(() => {
    const canvas = dynamicsChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const palette = getThemePalette();

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    if (displayLogs.length === 0) {
      ctx.fillStyle = palette.textDim;
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No servo velocity commands recorded for this run.', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }

    const maxCmd = 8;
    const toY = (val: number) => h / 2 - (Math.max(-maxCmd, Math.min(maxCmd, val)) / maxCmd) * (h / 2 - 12);

    // Center zero line
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.fillStyle = palette.textDim;
    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('0°/s', 4, h / 2 - 3);

    const step = w / Math.max(1, displayLogs.length - 1);

    // Pan command curve
    ctx.strokeStyle = palette.panLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < displayLogs.length; i++) {
      const x = i * step;
      const y = toY(displayLogs[i].panCmd);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Tilt command curve
    ctx.strokeStyle = palette.tiltLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < displayLogs.length; i++) {
      const x = i * step;
      const y = toY(displayLogs[i].tiltCmd);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [displayLogs, selectedRunId]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Export Actions */}
      <div className="p-3 rounded-sm bg-panel border border-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileText className="size-4 text-accent" />
          <div>
            <div className="text-[13px] font-semibold text-fg flex items-center gap-2">
              <span>Historical analysis & evaluation</span>
              <span className="font-mono-tabular text-[11px] text-dim">ISRO PS 26169</span>
            </div>
            <div className="text-[11px] text-muted">
              Time-series logs per scenario run; pass/fail evaluations and telemetry exports
            </div>
          </div>
        </div>

        {/* Global Downloads */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPythonScript}
            className="h-7 px-2.5 rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover text-[12px] flex items-center gap-1.5 transition-colors duration-100"
            title="Download standalone Python evaluation script"
          >
            <Terminal className="size-3.5" />
            <span>Python script (.py)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="h-7 px-2.5 rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover text-[12px] flex items-center gap-1.5 transition-colors duration-100"
          >
            <FileSpreadsheet className="size-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="h-7 px-2.5 rounded-sm border border-accent bg-accent text-accent-fg hover:bg-accent-hover text-[12px] flex items-center gap-1.5 transition-colors duration-100"
          >
            <FileCode className="size-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Run Selector & Historical Runs Tray */}
      <div className="p-3 rounded-sm border border-line bg-panel space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-fg">Session runs ({logger.runs.length + 1} available)</span>
          <span className="text-[11px] text-muted">Select run to inspect recorded frames</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedRunId('current')}
            className={`h-7 px-2.5 rounded-sm border text-[12px] font-mono-tabular transition-colors duration-100 whitespace-nowrap ${
              selectedRunId === 'current'
                ? 'border-accent bg-accent-subtle text-fg font-medium'
                : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
            }`}
          >
            Active run ({logger.frameLogs.length} frames)
          </button>

          {logger.runs.map((r) => {
            const rPassed =
              r.thresholds.acquisitionTimePass &&
              r.thresholds.trackingErrorPass &&
              r.thresholds.processingSpeedPass;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRunId(r.id)}
                className={`h-7 px-2.5 rounded-sm border text-[12px] font-mono-tabular transition-colors duration-100 whitespace-nowrap flex items-center gap-1.5 ${
                  selectedRunId === r.id
                    ? 'border-accent bg-accent-subtle text-fg font-medium'
                    : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
                }`}
              >
                <span>{r.id} ({r.durationSec}s)</span>
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${rPassed ? 'bg-ok' : 'bg-warn'}`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Specifications Score Table */}
      <div className="rounded-sm border border-line bg-panel overflow-hidden">
        <div className="flex h-8 items-center justify-between border-b border-line px-3 text-[12px]">
          <span className="font-semibold text-fg">Specification compliance</span>
          <span className="font-mono-tabular text-muted">
            Passed: <strong className="text-fg">{passedCount}</strong> / {evaluatedCount} evaluated
          </span>
        </div>

        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-line bg-panel-2 text-[11px] text-muted">
            <tr>
              <th className="py-1 px-3">Metric</th>
              <th className="py-1 px-3">Requirement</th>
              <th className="py-1 px-3 text-right">Measured</th>
              <th className="py-1 px-3">Evaluation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {evalList.map((item) => (
              <tr key={item.name} className="hover:bg-panel-hover">
                <td className="py-1.5 px-3 text-fg">{item.name}</td>
                <td className="py-1.5 px-3 text-dim font-mono-tabular">{item.spec}</td>
                <td className="py-1.5 px-3 text-right font-mono-tabular text-fg">{item.actual}</td>
                <td className="py-1.5 px-3">
                  {item.evaluated ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${item.passed ? 'bg-ok' : 'bg-err'}`}
                      />
                      <span className="text-[11px] text-muted">{item.passed ? 'Pass' : 'Fail'}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-dim">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Time-Series Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-2 rounded-sm border border-line bg-panel space-y-1">
          <div className="flex items-center justify-between text-[12px] px-1">
            <span className="text-muted">Tracking error (px)</span>
            <span className="font-mono-tabular text-muted">
              Mean: {displayMetrics.avgErrorPx.toFixed(2)} px
            </span>
          </div>
          <div className="h-32 rounded-sm overflow-hidden border border-line bg-canvas-bg">
            <canvas ref={historyChartRef} width={520} height={128} className="w-full h-full" />
          </div>
        </div>

        <div className="p-2 rounded-sm border border-line bg-panel space-y-1">
          <div className="flex items-center justify-between text-[12px] px-1">
            <span className="text-muted">Gimbal slew rates (Pan & Tilt °/s)</span>
            <div className="flex items-center gap-3 text-[11px] font-mono-tabular text-dim">
              <span>Pan: blue</span>
              <span>Tilt: amber</span>
            </div>
          </div>
          <div className="h-32 rounded-sm overflow-hidden border border-line bg-canvas-bg">
            <canvas ref={dynamicsChartRef} width={520} height={128} className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Frame Log Preview */}
      <div className="p-3 rounded-sm border border-line bg-panel space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-fg">Frame log ({displayLogs.length} entries)</span>
          <span className="text-[11px] text-muted">Boresight offset & gimbal telemetry</span>
        </div>

        <div className="max-h-48 overflow-y-auto rounded-sm border border-line bg-panel-2 p-2 font-mono-tabular text-[11px] text-muted divide-y divide-line">
          {displayLogs.length === 0 ? (
            <div className="py-4 text-center text-muted">
              No frames recorded in this run. Run the simulation to log telemetry.
            </div>
          ) : (
            displayLogs.slice(-25).reverse().map((f, idx) => (
              <div key={idx} className="py-1 flex items-center justify-between">
                <span>#{f.frameIndex} (T+{f.timestampSec.toFixed(2)}s)</span>
                <span className="text-fg">{f.state}</span>
                <span>Err: {f.trackingErrorPx.toFixed(2)} px</span>
                <span>Centroid Δ: ±{f.centroidingErrorPx.toFixed(3)} px</span>
                <span>R²: {f.gaussianRSquared.toFixed(3)}</span>
                <span>Cmd: ({f.panCmd.toFixed(1)}°, {f.tiltCmd.toFixed(1)}°)</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Automated Benchmark Suite Section */}
      <div className="space-y-2">
        <div className="text-[13px] font-semibold text-fg">
          ISRO PS 26169 benchmark matrix (4 motion patterns × 5 noise tiers)
        </div>
        <AutomatedSuiteView onRunCase={onRunSuiteCase} />
      </div>
    </div>
  );
};
