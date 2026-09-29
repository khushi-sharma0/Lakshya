/**
 * Simulation Viewport & Workspace
 * Desktop workstation layout:
 * - Resizable docked SplitPane (Main workspace on left, Inspector on right)
 * - Dual viewports: Virtual Scene + Camera Sensor
 * - Multi-beacon tracking toolbar & table
 * - Technical telemetry charts
 * - Presentation layer only: zero changes to simulation or tracking logic.
 */

import React, { useState } from 'react';
import {
  CameraConfig,
  CentroidResult,
  DisturbancesConfig,
  DetectionEngine,
  KalmanState,
  PerformanceMetrics,
  PidConfig,
  TargetConfig,
  TargetPrioritization,
  ThresholdEvaluation,
  TrackingState,
  LossLocation,
  BeaconTrack,
} from '../types';
import { SceneCanvas } from '../components/SceneCanvas';
import { CameraFeedCanvas } from '../components/CameraFeedCanvas';
import { LiveCharts } from '../components/LiveCharts';
import { ControlPanels } from '../components/ControlPanels';
import { SplitPane } from '../components/shell/SplitPane';
import { SlidersHorizontal, ChevronRight, ChevronLeft } from 'lucide-react';

interface SimulationPageProps {
  targets: TargetConfig[];
  cameraConfig: CameraConfig;
  onUpdateCameraConfig: (cfg: Partial<CameraConfig>) => void;
  cameraCenter: { x: number; y: number };
  fovRect: { x: number; y: number; width: number; height: number };
  onSetCustomPath: (points: Array<{ x: number; y: number }>) => void;
  onClearCustomPath: () => void;
  onSetTargetPos: (x: number, y: number) => void;
  isCustomPathActive: boolean;

  disturbances: DisturbancesConfig;
  onUpdateDisturbances: (cfg: Partial<DisturbancesConfig>) => void;

  pidConfig: PidConfig;
  onUpdatePid: (cfg: Partial<PidConfig>) => void;

  primaryTarget: TargetConfig;
  onUpdateTarget: (cfg: Partial<TargetConfig>) => void;

  detectionEngine: DetectionEngine;
  onSetDetectionEngine: (engine: DetectionEngine) => void;

  useAdaptiveThreshold: boolean;
  onToggleAdaptiveThreshold: () => void;
  adaptiveK: number;
  onSetAdaptiveK: (k: number) => void;
  manualThreshold: number;
  onSetManualThreshold: (t: number) => void;

  isMultiTarget: boolean;
  onToggleMultiTarget: () => void;
  targetPriority: TargetPrioritization;
  onSetTargetPriority: (p: TargetPrioritization) => void;

  adaptiveExplanation: string;

  centroidResult: CentroidResult;
  kalmanState: KalmanState;
  trackingState: TrackingState;
  panCmdDegS: number;
  tiltCmdDegS: number;
  feedImageData: ImageData | null;
  onToggleMonochrome: () => void;
  errorPx: number;

  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
  errorHistory: number[];
  fpsHistory: number[];
  lossLocations: LossLocation[];

  beaconCount?: number;
  onSetBeaconCount?: (count: number) => void;
  selectedPrimaryBeaconId?: string;
  onSetPrimaryBeaconId?: (id: string) => void;
  onUpdateBeacon?: (id: string, updates: Partial<TargetConfig>) => void;
  beaconTracks?: BeaconTrack[];
}

export const SimulationPage: React.FC<SimulationPageProps> = ({
  targets,
  cameraConfig,
  onUpdateCameraConfig,
  cameraCenter,
  fovRect,
  onSetCustomPath,
  onClearCustomPath,
  onSetTargetPos,
  isCustomPathActive,

  disturbances,
  onUpdateDisturbances,

  pidConfig,
  onUpdatePid,

  primaryTarget,
  onUpdateTarget,

  detectionEngine,
  onSetDetectionEngine,

  useAdaptiveThreshold,
  onToggleAdaptiveThreshold,
  adaptiveK,
  onSetAdaptiveK,
  manualThreshold,
  onSetManualThreshold,

  isMultiTarget,
  onToggleMultiTarget,
  targetPriority,
  onSetTargetPriority,

  adaptiveExplanation,

  centroidResult,
  kalmanState,
  trackingState,
  panCmdDegS,
  tiltCmdDegS,
  feedImageData,
  onToggleMonochrome,
  errorPx,

  metrics,
  thresholds,
  errorHistory,
  fpsHistory,
  lossLocations,

  beaconCount = 1,
  onSetBeaconCount,
  selectedPrimaryBeaconId = 'B1',
  onSetPrimaryBeaconId,
  onUpdateBeacon,
  beaconTracks = [],
}) => {
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  return (
    <div className="flex h-full w-full flex-1 overflow-hidden">
      <SplitPane
        direction="row"
        fixed="second"
        defaultSize={380}
        minSize={280}
        maxSize={520}
        collapsed={!isInspectorOpen}
        label="Inspector sidebar"
        className="h-full w-full"
      >
        {/* Left Pane: Main Workspace */}
        <div className="flex h-full flex-col overflow-y-auto p-3 space-y-3">
          {/* Multi-Beacon Toolbar */}
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel px-3 rounded-sm">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-fg">Optical beacons:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => onSetBeaconCount && onSetBeaconCount(cnt)}
                    className={`h-6 min-w-6 rounded-sm border px-2 font-mono-tabular text-[11px] transition-colors duration-100 ${
                      beaconCount === cnt
                        ? 'border-accent bg-accent text-accent-fg font-medium'
                        : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
                    }`}
                    title={`Configure ${cnt} beacon${cnt > 1 ? 's' : ''}`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>

              <div className="mx-1 h-3.5 w-px bg-line" aria-hidden="true" />

              <button
                type="button"
                onClick={() => onSetBeaconCount && onSetBeaconCount(Math.min(5, (beaconCount || 1) + 1))}
                disabled={(beaconCount || 1) >= 5}
                className="h-6 rounded-sm border border-line bg-panel-2 px-2 text-[11px] text-fg hover:bg-panel-hover disabled:opacity-40"
              >
                + Add
              </button>

              {(beaconCount || 1) > 1 && (
                <button
                  type="button"
                  onClick={() => onSetBeaconCount && onSetBeaconCount(Math.max(1, (beaconCount || 1) - 1))}
                  className="h-6 rounded-sm border border-line bg-panel-2 px-2 text-[11px] text-fg hover:bg-panel-hover"
                >
                  - Remove
                </button>
              )}
            </div>

            {/* Gimbal lock beacon selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Gimbal lock:</span>
              <div className="flex items-center gap-1">
                {targets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSetPrimaryBeaconId && onSetPrimaryBeaconId(t.id)}
                    className={`h-6 rounded-sm border px-2 font-mono-tabular text-[11px] transition-colors duration-100 ${
                      t.id === selectedPrimaryBeaconId
                        ? 'border-accent bg-accent text-accent-fg font-medium'
                        : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
                    }`}
                    title={`Lock camera gimbal to beacon ${t.id}`}
                  >
                    {t.id}
                  </button>
                ))}
              </div>

              <div className="mx-1 h-3.5 w-px bg-line" aria-hidden="true" />

              <button
                type="button"
                onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                className="flex h-6 items-center gap-1 rounded-sm border border-line bg-panel-2 px-2 text-[11px] text-fg hover:bg-panel-hover"
                title={isInspectorOpen ? 'Hide inspector' : 'Show inspector'}
              >
                <SlidersHorizontal className="size-3" aria-hidden="true" />
                <span>{isInspectorOpen ? 'Hide inspector' : 'Inspector'}</span>
                {isInspectorOpen ? (
                  <ChevronRight className="size-3" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="size-3" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Dual Viewports */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[360px]">
            <SceneCanvas
              targets={targets}
              cameraConfig={cameraConfig}
              cameraCenter={cameraCenter}
              fovRect={fovRect}
              primaryBeaconId={selectedPrimaryBeaconId}
              onSelectBeacon={onSetPrimaryBeaconId}
              onSetCustomPath={onSetCustomPath}
              onClearCustomPath={onClearCustomPath}
              onSetTargetPos={onSetTargetPos}
              isCustomPathActive={isCustomPathActive}
            />

            <CameraFeedCanvas
              cameraConfig={cameraConfig}
              centroidResult={centroidResult}
              tracks={beaconTracks}
              primaryBeaconId={selectedPrimaryBeaconId}
              onSelectBeacon={onSetPrimaryBeaconId}
              kalmanState={kalmanState}
              trackingState={trackingState}
              panCmdDegS={panCmdDegS}
              tiltCmdDegS={tiltCmdDegS}
              feedImageData={feedImageData}
              isMonochrome={cameraConfig.isMonochrome}
              onToggleMonochrome={onToggleMonochrome}
              errorPx={errorPx}
              targetShape={primaryTarget.shape}
            />
          </div>

          {/* Multi-Beacon Status Table */}
          {beaconTracks && beaconTracks.length > 0 && (
            <div className="rounded-sm border border-line bg-panel overflow-hidden">
              <div className="flex h-7 items-center justify-between border-b border-line px-3 text-[12px]">
                <span className="font-semibold text-fg">Active tracks ({beaconTracks.length})</span>
                <span className="font-mono-tabular text-muted">
                  Primary track: <strong className="text-fg">{selectedPrimaryBeaconId}</strong> ({targetPriority})
                </span>
              </div>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 border-b border-line bg-panel-2 text-[11px] text-muted">
                    <tr>
                      <th className="py-1 px-3">Track ID</th>
                      <th className="py-1 px-3">Status</th>
                      <th className="py-1 px-3 text-right">Boresight error</th>
                      <th className="py-1 px-3">FOV status</th>
                      <th className="py-1 px-3 text-right">Lock retention</th>
                      <th className="py-1 px-3">Gimbal role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {beaconTracks.map((b) => {
                      const isPrimary = b.id === selectedPrimaryBeaconId;
                      return (
                        <tr
                          key={b.id}
                          onClick={() => onSetPrimaryBeaconId && onSetPrimaryBeaconId(b.id)}
                          className={`cursor-pointer transition-colors duration-100 ${
                            isPrimary
                              ? 'bg-accent-subtle font-medium text-fg'
                              : 'hover:bg-panel-hover text-fg'
                          }`}
                          title="Click to select as primary gimbal track"
                        >
                          <td className="py-1 px-3 flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: b.color }}
                              aria-hidden="true"
                            />
                            <span className="font-mono-tabular">{b.id}</span>
                          </td>
                          <td className="py-1 px-3">
                            <span className="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`size-1.5 shrink-0 rounded-full ${
                                  b.state === 'TRACKING'
                                    ? 'bg-ok'
                                    : b.state === 'COASTING'
                                    ? 'bg-warn'
                                    : 'bg-err'
                                }`}
                              />
                              <span className="text-[11px]">{b.state}</span>
                            </span>
                          </td>
                          <td className="py-1 px-3 text-right font-mono-tabular">
                            {b.errorFromBoresightPx.toFixed(1)} px
                          </td>
                          <td className="py-1 px-3 text-[11px] text-muted">
                            {b.inFov ? 'In FOV' : 'Predicted (out of FOV)'}
                          </td>
                          <td className="py-1 px-3 text-right font-mono-tabular">
                            {b.lockRetentionPct.toFixed(1)}%
                          </td>
                          <td className="py-1 px-3 text-[11px]">
                            {isPrimary ? (
                              <span className="text-accent font-medium">Primary (gimbal)</span>
                            ) : (
                              <span className="text-dim">Secondary</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Technical Telemetry Charts */}
          <LiveCharts
            errorHistory={errorHistory}
            fpsHistory={fpsHistory}
            lossLocations={lossLocations}
            screenWidth={cameraConfig.screenWidth}
            screenHeight={cameraConfig.screenHeight}
            currentError={errorPx}
            currentFps={metrics.fps}
          />
        </div>

        {/* Right Pane: Docked Inspector Property Grid */}
        <aside className="flex h-full flex-col overflow-hidden bg-panel border-l border-line">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3 text-[12px]">
            <span className="font-semibold text-fg">Inspector</span>
            <button
              type="button"
              onClick={() => setIsInspectorOpen(false)}
              className="flex size-6 items-center justify-center rounded-sm text-muted hover:bg-panel-hover hover:text-fg"
              title="Close inspector"
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <ControlPanels
              cameraConfig={cameraConfig}
              onUpdateCameraConfig={onUpdateCameraConfig}
              disturbances={disturbances}
              onUpdateDisturbances={onUpdateDisturbances}
              pidConfig={pidConfig}
              onUpdatePid={onUpdatePid}
              primaryTarget={primaryTarget}
              targets={targets}
              onUpdateTarget={onUpdateTarget}
              onUpdateBeacon={onUpdateBeacon}
              beaconCount={beaconCount}
              onSetBeaconCount={onSetBeaconCount}
              selectedPrimaryBeaconId={selectedPrimaryBeaconId}
              onSetPrimaryBeaconId={onSetPrimaryBeaconId}
              detectionEngine={detectionEngine}
              onSetDetectionEngine={onSetDetectionEngine}
              useAdaptiveThreshold={useAdaptiveThreshold}
              onToggleAdaptiveThreshold={onToggleAdaptiveThreshold}
              adaptiveK={adaptiveK}
              onSetAdaptiveK={onSetAdaptiveK}
              manualThreshold={manualThreshold}
              onSetManualThreshold={onSetManualThreshold}
              isMultiTarget={isMultiTarget}
              onToggleMultiTarget={onToggleMultiTarget}
              targetPriority={targetPriority}
              onSetTargetPriority={onSetTargetPriority}
              adaptiveExplanation={adaptiveExplanation}
            />
          </div>
        </aside>
      </SplitPane>
    </div>
  );
};
