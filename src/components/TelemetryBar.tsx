/**
 * Telemetry Ribbon & ISRO Specification Evaluation Strip
 * Displays real-time metrics, tracking status, and 5 official ISRO PS 26169 thresholds.
 * Uses compact technical layout with status dots and muted spec thresholds (no pill badges).
 */

import React from 'react';
import { PerformanceMetrics, ThresholdEvaluation, TrackingState } from '../types';

interface TelemetryBarProps {
  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
  explanation: string;
}

const stateDot: Record<TrackingState, string> = {
  TRACKING: 'bg-ok',
  ACQUIRED: 'bg-ok',
  SEARCHING: 'bg-warn',
  REACQUIRING: 'bg-warn',
  LOST: 'bg-err',
};

const stateLabel: Record<TrackingState, string> = {
  TRACKING: 'Tracking',
  ACQUIRED: 'Acquired',
  SEARCHING: 'Searching',
  REACQUIRING: 'Re-acquiring',
  LOST: 'Lost',
};

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  metrics,
  thresholds,
  explanation,
}) => {
  const hasFrames = metrics.totalFrames > 0;
  const isLocked = metrics.trackingState === 'TRACKING' || metrics.trackingState === 'ACQUIRED';
  const hasAcquired = metrics.acquisitionTimeSec > 0;
  const hasError = hasFrames && (isLocked || (metrics.lockedFrames > 0 && metrics.avgErrorPx > 0));
  const hasLossRate = hasFrames && hasAcquired;
  const hasReacquired = metrics.reacquisitionTimeSec > 0;
  const hasFps = hasFrames && metrics.fps > 0;

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-panel px-3 text-[12px]">
      {/* Left: State & Mission Timer */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5" title={`Tracker State: ${hasFrames ? metrics.trackingState : 'IDLE'}`}>
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${hasFrames ? stateDot[metrics.trackingState] : 'bg-dim'}`}
          />
          <span className="font-semibold text-fg">
            {hasFrames ? stateLabel[metrics.trackingState] : '--'}
          </span>
        </div>

        <span className="text-line" aria-hidden="true">|</span>

        <div className="flex items-center gap-1 text-muted">
          <span>T+</span>
          {hasFrames ? (
            <>
              <span className="font-mono-tabular text-fg">{metrics.simDurationSec.toFixed(1)}s</span>
              <span className="text-dim">({metrics.totalFrames} f)</span>
            </>
          ) : (
            <span className="font-mono-tabular text-dim">--</span>
          )}
        </div>
      </div>

      {/* Middle: 5 ISRO PS 26169 Thresholds */}
      <div className="flex items-center gap-4">
        {/* Threshold 1: Acquisition Time <= 2.0s */}
        <div className="flex items-center gap-1.5" title="Acquisition time (ISRO spec: ≤ 2.0 s)">
          <span className="text-muted">Acq:</span>
          {hasAcquired ? (
            <>
              <span className="font-mono-tabular font-medium text-fg">
                {metrics.acquisitionTimeSec.toFixed(2)}s
              </span>
              <span className="text-[11px] text-dim">≤ 2.0s</span>
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  thresholds.acquisitionTimePass ? 'bg-ok' : 'bg-err'
                }`}
              />
            </>
          ) : (
            <>
              <span className="font-mono-tabular text-dim">--</span>
              <span className="text-[11px] text-dim">≤ 2.0s</span>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-dim" />
            </>
          )}
        </div>

        <span className="text-line" aria-hidden="true">|</span>

        {/* Threshold 2: Tracking Error <= 10 px */}
        <div className="flex items-center gap-1.5" title="Mean tracking error from boresight (ISRO spec: ≤ 10.0 px)">
          <span className="text-muted">Error:</span>
          {hasError ? (
            <>
              <span className="font-mono-tabular font-medium text-fg">
                {metrics.avgErrorPx.toFixed(1)} px
              </span>
              <span className="text-[11px] text-dim">≤ 10 px</span>
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  thresholds.trackingErrorPass ? 'bg-ok' : 'bg-err'
                }`}
              />
            </>
          ) : (
            <>
              <span className="font-mono-tabular text-dim">--</span>
              <span className="text-[11px] text-dim">≤ 10 px</span>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-dim" />
            </>
          )}
        </div>

        <span className="text-line" aria-hidden="true">|</span>

        {/* Threshold 3: Target Loss Rate < 5% */}
        <div className="flex items-center gap-1.5" title="Target loss rate (ISRO spec: < 5.0 %)">
          <span className="text-muted">Loss rate:</span>
          {hasLossRate ? (
            <>
              <span className="font-mono-tabular font-medium text-fg">
                {metrics.targetLossRatePct.toFixed(1)}%
              </span>
              <span className="text-[11px] text-dim">&lt; 5.0%</span>
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  thresholds.targetLossRatePass ? 'bg-ok' : 'bg-err'
                }`}
              />
            </>
          ) : (
            <>
              <span className="font-mono-tabular text-dim">--</span>
              <span className="text-[11px] text-dim">&lt; 5.0%</span>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-dim" />
            </>
          )}
        </div>

        <span className="text-line" aria-hidden="true">|</span>

        {/* Threshold 4: Re-acquisition Time <= 1.0s */}
        <div className="flex items-center gap-1.5" title="Re-acquisition time after loss (ISRO spec: ≤ 1.0 s)">
          <span className="text-muted">Re-acq:</span>
          {hasReacquired ? (
            <>
              <span className="font-mono-tabular font-medium text-fg">
                {metrics.reacquisitionTimeSec.toFixed(2)}s
              </span>
              <span className="text-[11px] text-dim">≤ 1.0s</span>
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  thresholds.reacquisitionTimePass ? 'bg-ok' : 'bg-err'
                }`}
              />
            </>
          ) : (
            <>
              <span className="font-mono-tabular text-dim">--</span>
              <span className="text-[11px] text-dim">≤ 1.0s</span>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-dim" />
            </>
          )}
        </div>

        <span className="text-line" aria-hidden="true">|</span>

        {/* Threshold 5: Processing Rate >= 20 FPS */}
        <div className="flex items-center gap-1.5" title="Detection loop frame rate (ISRO spec: ≥ 20 FPS)">
          <span className="text-muted">Rate:</span>
          {hasFps ? (
            <>
              <span className="font-mono-tabular font-medium text-fg">{metrics.fps.toFixed(1)} FPS</span>
              <span className="text-[11px] text-dim">≥ 20</span>
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  thresholds.processingSpeedPass ? 'bg-ok' : 'bg-err'
                }`}
              />
            </>
          ) : (
            <>
              <span className="font-mono-tabular text-dim">--</span>
              <span className="text-[11px] text-dim">≥ 20</span>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-dim" />
            </>
          )}
        </div>
      </div>

      {/* Right: Adaptive Threshold Explanation */}
      <div className="hidden 2xl:flex items-center max-w-xs truncate text-[11px] font-mono-tabular text-muted" title={explanation}>
        <span className="truncate">{explanation}</span>
      </div>
    </div>
  );
};
