import React from 'react';
import { PerformanceMetrics, ThresholdEvaluation, TrackingState } from '../../types';

const stateTone: Record<TrackingState, string> = {
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

function Cell({
  label,
  children,
  title,
  className = '',
}: {
  label?: string;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div title={title} className={`flex h-full shrink-0 items-center gap-1.5 border-r border-line px-2.5 ${className}`}>
      {label && <span className="text-muted">{label}</span>}
      {children}
    </div>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono-tabular text-fg">{children}</span>
);

export function StatusBar({
  metrics,
  thresholds,
  isRunning,
  isRecording,
  message,
}: {
  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
  isRunning: boolean;
  isRecording: boolean;
  message: string;
}) {
  const hasAcquired = metrics.acquisitionTimeSec > 0;
  const hasReacquired = metrics.reacquisitionTimeSec > 0;
  const checks = [
    { label: 'Acquisition time ≤ 2 s', evaluated: hasAcquired, pass: thresholds.acquisitionTimePass },
    { label: 'Tracking error ≤ 10 px', evaluated: hasAcquired, pass: thresholds.trackingErrorPass },
    { label: 'Target loss rate < 5 %', evaluated: hasAcquired, pass: thresholds.targetLossRatePass },
    { label: 'Re-acquisition time ≤ 1 s', evaluated: hasReacquired, pass: thresholds.reacquisitionTimePass },
    { label: 'Processing rate ≥ 20 FPS', evaluated: true, pass: thresholds.processingSpeedPass },
  ];
  const evaluated = checks.filter((c) => c.evaluated);
  const passed = evaluated.filter((c) => c.pass).length;
  const failed = evaluated.length - passed;
  const pending = checks.length - evaluated.length;
  const specTone = failed > 0 ? 'bg-err' : pending > 0 ? 'bg-dim' : 'bg-ok';
  const specTitle = checks
    .map((c) => `${c.evaluated ? (c.pass ? 'Pass' : 'Fail') : 'Pending'} — ${c.label}`)
    .join('\n');

  return (
    <footer
      role="status"
      aria-label="Simulation status"
      className="flex h-6 shrink-0 items-stretch overflow-hidden border-t border-line bg-panel text-[12px]"
    >
      <Cell title={isRunning ? 'Simulation loop running' : 'Simulation loop paused'}>
        <span className="text-fg">{isRunning ? 'Running' : 'Paused'}</span>
      </Cell>
      <Cell label="State" title="Tracker state">
        <span aria-hidden="true" className={`size-2 rounded-full ${stateTone[metrics.trackingState]}`} />
        <span className="text-fg">{stateLabel[metrics.trackingState]}</span>
      </Cell>
      <Cell label="FPS">
        <Num>{metrics.fps.toFixed(1)}</Num>
      </Cell>
      <Cell label="Frame">
        <Num>{metrics.totalFrames}</Num>
      </Cell>
      <Cell label="Sim time">
        <Num>{metrics.simDurationSec.toFixed(1)} s</Num>
      </Cell>
      <Cell label="Seed" title="The simulator uses Math.random and is not seeded">
        <span className="text-dim">unseeded</span>
      </Cell>
      <Cell label="Spec" title={specTitle}>
        <span aria-hidden="true" className={`size-2 rounded-full ${specTone}`} />
        <Num>
          {passed}/{checks.length}
        </Num>
        <span className="text-muted">pass</span>
        {pending > 0 && <span className="text-dim">· {pending} pending</span>}
      </Cell>
      {isRecording && (
        <Cell title="Recording frames to the session log">
          <span aria-hidden="true" className="size-2 rounded-full bg-err" />
          <span className="text-fg">Recording</span>
        </Cell>
      )}
      <div className="flex min-w-0 flex-1 items-center px-2.5" title={message}>
        <span className="truncate font-mono-tabular text-[11px] text-muted">{message}</span>
      </div>
    </footer>
  );
}
