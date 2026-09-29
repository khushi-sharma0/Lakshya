/**
 * Performance Report Modal
 * Conforms to ISRO PS 26169 benchmark metrics:
 * Displays summary scorecard, per-metric pass/fail status, frame log preview,
 * and allows instant export as JSON or CSV.
 * Desktop workstation presentation:
 * - 2-4px corner radii, 1px borders, neutral palette
 * - Status dots instead of pill badges
 * - Tabular numbers and plain technical copy
 */

import React from 'react';
import { PerformanceLogger } from '../core/logger';
import { PerformanceMetrics, ThresholdEvaluation } from '../types';
import { X, FileSpreadsheet, FileCode } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  logger: PerformanceLogger;
  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  logger,
  metrics,
  thresholds,
}) => {
  if (!isOpen) return null;

  const handleDownloadJson = () => {
    const jsonStr = logger.exportJson(metrics, thresholds);
    logger.downloadFile(`lakshya-fsoc-report-${Date.now()}.json`, jsonStr, 'application/json');
  };

  const handleDownloadCsv = () => {
    const csvStr = logger.exportCsv(metrics);
    logger.downloadFile(`lakshya-fsoc-telemetry-${Date.now()}.csv`, csvStr, 'text/csv');
  };

  const hasAcquired = metrics.acquisitionTimeSec > 0;
  const hasLocked = metrics.lockedFrames > 0;
  const hasTotal = metrics.totalFrames > 0;

  const acqPassed = hasAcquired && metrics.acquisitionTimeSec <= 2.0;
  const errPassed = hasLocked && metrics.avgErrorPx <= 10.0;
  const lossPassed = hasTotal && metrics.targetLossRatePct < 5.0;
  const reacqPassed = metrics.reacquisitionTimeSec <= 1.0;
  const speedPassed = metrics.fps >= 20.0;
  const lockRetPassed = hasTotal && metrics.lockRetentionRatePct >= 85.0;

  const evalList = [
    { name: 'Acquisition time', spec: '≤ 2.0 s', actual: hasAcquired ? `${metrics.acquisitionTimeSec.toFixed(2)} s` : '--', evaluated: hasAcquired, passed: acqPassed },
    { name: 'Tracking error', spec: '≤ 10.0 px', actual: hasLocked ? `${metrics.avgErrorPx.toFixed(2)} px` : '--', evaluated: hasLocked, passed: errPassed },
    { name: 'Target loss rate', spec: '< 5.0 %', actual: hasTotal ? `${metrics.targetLossRatePct.toFixed(1)} %` : '--', evaluated: hasTotal, passed: lossPassed },
    { name: 'Re-acquisition time', spec: '≤ 1.0 s', actual: `${metrics.reacquisitionTimeSec.toFixed(2)} s`, evaluated: true, passed: reacqPassed },
    { name: 'Processing rate', spec: '≥ 20 FPS', actual: `${metrics.fps.toFixed(1)} FPS`, evaluated: metrics.fps > 0, passed: speedPassed },
    { name: 'Lock retention rate', spec: '≥ 85.0 %', actual: hasTotal ? `${metrics.lockRetentionRatePct.toFixed(1)} %` : '--', evaluated: hasTotal, passed: lockRetPassed },
  ];

  const totalEval = evalList.filter((e) => e.evaluated).length;
  const passedCount = evalList.filter((e) => e.evaluated && e.passed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] rounded-sm border border-line bg-panel flex flex-col shadow-xl overflow-hidden text-[12px]"
      >
        {/* Modal Header */}
        <div className="flex h-9 items-center justify-between border-b border-line pl-3 pr-1">
          <div className="flex items-center gap-2">
            <h2 id="report-modal-title" className="text-[13px] font-semibold text-fg">
              Performance report & telemetry log
            </h2>
            <span className="font-mono-tabular text-[11px] text-dim">ISRO PS 26169</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-panel-hover hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Summary Status Strip */}
          <div className="flex items-center justify-between p-2.5 rounded-sm border border-line bg-panel-2">
            <span className="text-fg font-medium">
              Specification pass count: <strong className="font-mono-tabular">{passedCount}</strong> / {totalEval} evaluated
            </span>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  passedCount === totalEval && totalEval > 0
                    ? 'bg-ok'
                    : passedCount > 0
                    ? 'bg-warn'
                    : 'bg-err'
                }`}
              />
              <span className="text-muted">
                {passedCount === totalEval && totalEval > 0 ? 'Compliant' : 'Non-compliant'}
              </span>
            </div>
          </div>

          {/* Specifications Table */}
          <div className="rounded-sm border border-line overflow-hidden">
            <table className="w-full text-left">
              <thead className="border-b border-line bg-panel-2 text-[11px] text-muted">
                <tr>
                  <th className="py-1 px-3">Metric</th>
                  <th className="py-1 px-3">Requirement</th>
                  <th className="py-1 px-3 text-right">Measured value</th>
                  <th className="py-1 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {evalList.map((item) => (
                  <tr key={item.name} className="hover:bg-panel-hover">
                    <td className="py-1 px-3 text-fg">{item.name}</td>
                    <td className="py-1 px-3 text-dim font-mono-tabular">{item.spec}</td>
                    <td className="py-1 px-3 text-right font-mono-tabular text-fg">{item.actual}</td>
                    <td className="py-1 px-3">
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

          {/* Telemetry Preview Table */}
          <div>
            <div className="text-[12px] font-semibold text-fg mb-1.5 flex items-center justify-between">
              <span>Recorded frames ({logger.frameLogs.length} samples)</span>
              <span className="text-[11px] text-muted font-normal">Last 20 frames shown</span>
            </div>
            <div className="rounded-sm border border-line overflow-x-auto max-h-48">
              <table className="w-full text-left font-mono-tabular text-[11px]">
                <thead className="sticky top-0 border-b border-line bg-panel-2 text-muted">
                  <tr>
                    <th className="py-1 px-2.5">Time (s)</th>
                    <th className="py-1 px-2.5">Frame</th>
                    <th className="py-1 px-2.5">State</th>
                    <th className="py-1 px-2.5 text-right">Error (px)</th>
                    <th className="py-1 px-2.5 text-right">Centroid Δ (px)</th>
                    <th className="py-1 px-2.5 text-right">R² fit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {logger.frameLogs.slice(-20).map((log, i) => (
                    <tr key={i} className="hover:bg-panel-hover">
                      <td className="py-0.5 px-2.5">{log.timestampSec.toFixed(2)}</td>
                      <td className="py-0.5 px-2.5">{log.frameIndex}</td>
                      <td className="py-0.5 px-2.5">{log.state}</td>
                      <td className="py-0.5 px-2.5 text-right">{log.trackingErrorPx.toFixed(2)}</td>
                      <td className="py-0.5 px-2.5 text-right">{log.centroidingErrorPx.toFixed(3)}</td>
                      <td className="py-0.5 px-2.5 text-right">{log.gaussianRSquared.toFixed(3)}</td>
                    </tr>
                  ))}
                  {logger.frameLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-center text-muted">
                        No frames logged yet. Start recording or run simulation to log telemetry.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer with Export Buttons */}
        <div className="flex h-10 shrink-0 items-center justify-between border-t border-line bg-panel px-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="flex h-7 items-center gap-1.5 rounded-sm border border-line bg-panel-2 px-2.5 text-fg hover:bg-panel-hover"
            >
              <FileCode className="size-3.5" aria-hidden="true" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex h-7 items-center gap-1.5 rounded-sm border border-line bg-panel-2 px-2.5 text-fg hover:bg-panel-hover"
            >
              <FileSpreadsheet className="size-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-sm border border-line bg-panel-2 hover:bg-panel-hover text-fg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
