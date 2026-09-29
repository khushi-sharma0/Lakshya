/**
 * Automated Benchmark Suite View
 * Evaluates the 4 mandatory motion types across multiple disturbance tiers.
 * Produces an automated scored evaluation matrix against ISRO PS 26169 specifications.
 * Desktop workstation presentation:
 * - 2-4px corner radii, 1px borders, neutral palette
 * - Sticky table headers, right-aligned tabular numerals
 * - Status dots instead of pill badges
 * - Standardized 32px buttons and controls
 */

import React, { useState } from 'react';
import { BENCHMARK_SUITE_CASES, SuiteResult, SuiteTestCase } from '../core/benchmarkSuite';
import { Play, Download, RefreshCw } from 'lucide-react';

interface AutomatedSuiteViewProps {
  onRunCase: (testCase: SuiteTestCase) => Promise<SuiteResult>;
}

export const AutomatedSuiteView: React.FC<AutomatedSuiteViewProps> = ({ onRunCase }) => {
  const [results, setResults] = useState<SuiteResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  const runAllCases = async () => {
    setIsRunning(true);
    const newResults: SuiteResult[] = [];
    const total = BENCHMARK_SUITE_CASES.length;

    for (let i = 0; i < total; i++) {
      const tc = BENCHMARK_SUITE_CASES[i];
      setCurrentProgress({ current: i + 1, total, name: tc.name });
      const res = await onRunCase(tc);
      newResults.push(res);
      setResults([...newResults]);
    }

    setIsRunning(false);
    setCurrentProgress(null);
  };

  const exportSuiteCsv = () => {
    if (results.length === 0) return;
    const headers = [
      'Case_ID',
      'Motion_Pattern',
      'Noise_Level',
      'Acquisition_Time_Sec',
      'Avg_Error_Px',
      'Max_Error_Px',
      'Lock_Retention_Pct',
      'Loss_Rate_Pct',
      'Reacquisition_Time_Sec',
      'Centroiding_Error_Px',
      'FPS',
      'Status',
    ];
    const rows = results.map((r) =>
      [
        r.caseId,
        r.motionPattern,
        `"${r.noiseLevel}"`,
        r.acquisitionTimeSec.toFixed(2),
        r.avgTrackingErrorPx.toFixed(2),
        r.maxTrackingErrorPx.toFixed(2),
        r.lockRetentionPct.toFixed(1),
        r.targetLossRatePct.toFixed(1),
        r.reacquisitionTimeSec.toFixed(2),
        r.centroidingErrorPx.toFixed(3),
        r.fps.toFixed(1),
        r.passed ? 'PASS' : 'FAIL',
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lakshya_ISRO_Benchmark_Suite_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fullPassCount = results.filter((r) => r.passed).length;

  return (
    <div className="space-y-3 text-[12px]">
      {/* Control Toolbar */}
      <div className="p-3 rounded-sm bg-panel border border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-fg flex items-center gap-2">
            <span>Automated benchmark suite</span>
            <span className="font-mono-tabular text-[11px] text-dim">ISRO PS 26169</span>
          </div>
          <div className="text-[11px] text-muted">
            Matrix testing across 4 motion trajectories and 5 disturbance levels
          </div>
        </div>

        <div className="flex items-center gap-2">
          {results.length > 0 && (
            <button
              type="button"
              onClick={exportSuiteCsv}
              className="h-8 px-3 rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover text-[12px] flex items-center gap-1.5 transition-colors duration-100"
            >
              <Download className="size-3.5" />
              <span>Export matrix (.csv)</span>
            </button>
          )}

          <button
            type="button"
            onClick={runAllCases}
            disabled={isRunning}
            className="h-8 px-3.5 rounded-sm border border-accent bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 text-[12px] font-medium flex items-center gap-2 transition-colors duration-100"
          >
            {isRunning ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            <span>{isRunning ? 'Running suite...' : 'Execute benchmark suite'}</span>
          </button>
        </div>
      </div>

      {/* Progress Indicator */}
      {currentProgress && (
        <div className="p-2.5 rounded-sm border border-line bg-panel flex items-center justify-between text-[11px] text-muted">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-3.5 animate-spin text-accent" />
            <span>
              Executing test case {currentProgress.current} of {currentProgress.total}:{' '}
              <strong className="text-fg">{currentProgress.name}</strong>
            </span>
          </div>
          <span className="font-mono-tabular text-fg">
            {Math.round((currentProgress.current / currentProgress.total) * 100)}%
          </span>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-panel rounded-sm border border-line overflow-hidden">
        <div className="flex h-8 items-center justify-between border-b border-line px-3 text-[12px]">
          <span className="font-semibold text-fg">Evaluation matrix results</span>
          {results.length > 0 && (
            <span className="font-mono-tabular text-muted">
              Compliant: <strong className="text-fg">{fullPassCount}</strong> / {results.length} cases
            </span>
          )}
        </div>

        <div className="overflow-x-auto max-h-[440px]">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 border-b border-line bg-panel-2 text-[11px] text-muted font-mono-tabular">
              <tr>
                <th className="py-1 px-3">Case</th>
                <th className="py-1 px-3">Motion</th>
                <th className="py-1 px-3">Disturbance</th>
                <th className="py-1 px-3 text-right">Acq. time (≤2s)</th>
                <th className="py-1 px-3 text-right">Mean err. (≤10px)</th>
                <th className="py-1 px-3 text-right">Loss rate (&lt;5%)</th>
                <th className="py-1 px-3 text-right">Lock ret. (≥85%)</th>
                <th className="py-1 px-3 text-right">Rate (≥20 FPS)</th>
                <th className="py-1 px-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono-tabular text-[11px]">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted font-sans text-[12px]">
                    No benchmark matrix run yet. Click "Execute benchmark suite" to begin automated testing.
                  </td>
                </tr>
              ) : (
                results.map((r) => {
                  const acqPass = r.acquisitionTimeSec <= 2.0;
                  const errPass = r.avgTrackingErrorPx <= 10.0;
                  const lossPass = r.targetLossRatePct < 5.0;
                  const lockPass = r.lockRetentionPct >= 85.0;
                  const fpsPass = r.fps >= 20.0;

                  const metricsRow = [acqPass, errPass, lossPass, lockPass, fpsPass];
                  const passedInRow = metricsRow.filter(Boolean).length;
                  const rowOverall =
                    passedInRow === metricsRow.length
                      ? 'Pass'
                      : passedInRow === 0
                      ? 'Fail'
                      : 'Partial';

                  return (
                    <tr key={r.caseId} className="hover:bg-panel-hover transition-colors duration-100">
                      <td className="py-1 px-3 font-medium text-fg">{r.caseId}</td>
                      <td className="py-1 px-3 capitalize font-sans text-muted">
                        {r.motionPattern.replace('_', ' ')}
                      </td>
                      <td className="py-1 px-3 font-sans text-muted">{r.noiseLevel}</td>

                      {/* Acq Time */}
                      <td className="py-1 px-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{r.acquisitionTimeSec.toFixed(2)}s</span>
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${acqPass ? 'bg-ok' : 'bg-err'}`}
                          />
                        </span>
                      </td>

                      {/* Error */}
                      <td className="py-1 px-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-semibold text-fg">{r.avgTrackingErrorPx.toFixed(2)} px</span>
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${errPass ? 'bg-ok' : 'bg-err'}`}
                          />
                        </span>
                      </td>

                      {/* Loss Rate */}
                      <td className="py-1 px-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{r.targetLossRatePct.toFixed(1)}%</span>
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${lossPass ? 'bg-ok' : 'bg-err'}`}
                          />
                        </span>
                      </td>

                      {/* Lock Retention */}
                      <td className="py-1 px-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{r.lockRetentionPct.toFixed(1)}%</span>
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${lockPass ? 'bg-ok' : 'bg-err'}`}
                          />
                        </span>
                      </td>

                      {/* FPS */}
                      <td className="py-1 px-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{r.fps.toFixed(1)}</span>
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${fpsPass ? 'bg-ok' : 'bg-err'}`}
                          />
                        </span>
                      </td>

                      {/* Overall Row Result */}
                      <td className="py-1 px-3 font-sans">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${
                              rowOverall === 'Pass'
                                ? 'bg-ok'
                                : rowOverall === 'Partial'
                                ? 'bg-warn'
                                : 'bg-err'
                            }`}
                          />
                          <span className="text-[11px] text-fg font-medium">
                            {rowOverall} ({passedInRow}/5)
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
