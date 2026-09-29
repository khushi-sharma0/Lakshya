/**
 * Inspector property grid for the simulation page.
 * Every control maps 1:1 to the handlers passed in from App; no simulation
 * logic lives here.
 */

import React, { useState } from 'react';
import {
  CameraConfig,
  DisturbancesConfig,
  PidConfig,
  TargetConfig,
  TargetMotionPattern,
  TargetShape,
  AtmosphericPreset,
  PlatformMotionType,
  DetectionEngine,
  TargetPrioritization,
} from '../types';
import {
  PropRow,
  PropSection,
  Segmented,
  SelectField,
  SliderField,
  Stepper,
  ToggleLabel,
} from './shell/PropertyGrid';

interface ControlPanelsProps {
  cameraConfig: CameraConfig;
  onUpdateCameraConfig: (cfg: Partial<CameraConfig>) => void;
  disturbances: DisturbancesConfig;
  onUpdateDisturbances: (cfg: Partial<DisturbancesConfig>) => void;
  pidConfig: PidConfig;
  onUpdatePid: (cfg: Partial<PidConfig>) => void;
  primaryTarget: TargetConfig;
  targets?: TargetConfig[];
  onUpdateTarget: (cfg: Partial<TargetConfig>) => void;
  onUpdateBeacon?: (id: string, cfg: Partial<TargetConfig>) => void;
  beaconCount?: number;
  onSetBeaconCount?: (count: number) => void;
  selectedPrimaryBeaconId?: string;
  onSetPrimaryBeaconId?: (id: string) => void;
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
}

const RESOLUTIONS = [
  { value: '640x480', label: '640 × 480' },
  { value: '800x600', label: '800 × 600' },
  { value: '1024x768', label: '1024 × 768' },
  { value: '1280x720', label: '1280 × 720' },
] as const;

const MOTION_PATTERNS: ReadonlyArray<{ value: TargetMotionPattern; label: string }> = [
  { value: 'straight_line', label: 'Straight line (PS)' },
  { value: 'circular', label: 'Circular (PS)' },
  { value: 'figure_eight', label: 'Figure-eight (PS)' },
  { value: 'random', label: 'Random walk (PS)' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'sinusoidal', label: 'Sinusoidal' },
  { value: 'custom_path', label: 'Custom path' },
];

const SHAPES: ReadonlyArray<{ value: TargetShape; label: string }> = [
  { value: 'square', label: 'Square' },
  { value: 'circle', label: 'Circle' },
  { value: 'gaussian_spot', label: 'Gaussian' },
  { value: 'cross', label: 'Cross' },
];

const ATMOSPHERE: ReadonlyArray<{ value: AtmosphericPreset; label: string }> = [
  { value: 'clear', label: 'Clear' },
  { value: 'haze', label: 'Haze' },
  { value: 'fog', label: 'Fog' },
  { value: 'rain', label: 'Rain' },
  { value: 'low_light', label: 'Low light' },
];

const PLATFORM_MOTION: ReadonlyArray<{ value: PlatformMotionType; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'circular', label: 'Circular' },
  { value: 'random', label: 'Random' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'figure_eight', label: 'Figure-eight' },
];

export const ControlPanels: React.FC<ControlPanelsProps> = ({
  cameraConfig,
  onUpdateCameraConfig,
  disturbances,
  onUpdateDisturbances,
  pidConfig,
  onUpdatePid,
  primaryTarget,
  targets = [],
  onUpdateTarget,
  onUpdateBeacon,
  beaconCount = 1,
  onSetBeaconCount,
  selectedPrimaryBeaconId = 'B1',
  onSetPrimaryBeaconId,
  detectionEngine,
  onSetDetectionEngine,
  useAdaptiveThreshold,
  onToggleAdaptiveThreshold,
  adaptiveK,
  onSetAdaptiveK,
  manualThreshold,
  onSetManualThreshold,
  targetPriority,
  onSetTargetPriority,
  adaptiveExplanation,
}) => {
  const [selectedBeaconTab, setSelectedBeaconTab] = useState<string>('B1');

  const editingBeacon = targets.find((t) => t.id === selectedBeaconTab) || primaryTarget;
  const updateEditingBeacon = (cfg: Partial<TargetConfig>) => {
    if (onUpdateBeacon) onUpdateBeacon(editingBeacon.id, cfg);
    if (editingBeacon.id === primaryTarget.id) onUpdateTarget(cfg);
  };
  const isEditingPrimary = editingBeacon.id === selectedPrimaryBeaconId;

  const d = disturbances;

  return (
    <div className="text-[12px]">
      <PropSection title="Detection">
        <PropRow label="Method">
          <Segmented
            ariaLabel="Detection method"
            value={detectionEngine}
            onChange={onSetDetectionEngine}
            options={[
              { value: 'traditional_cv', label: 'Moment + Gaussian', title: 'Image moments with 2D Gaussian sub-pixel fit' },
              { value: 'ai_detector', label: 'Saliency kernel', title: 'Spatial matched saliency kernel' },
            ]}
          />
        </PropRow>
        <PropRow label={<ToggleLabel label="Adaptive threshold" checked={useAdaptiveThreshold} onChange={onToggleAdaptiveThreshold} />}>
          <span className="text-dim">mean + k·σ of background</span>
        </PropRow>
        {useAdaptiveThreshold ? (
          <PropRow label="Threshold k" htmlFor="prop-adaptive-k">
            <SliderField id="prop-adaptive-k" label="Threshold k" value={adaptiveK} min={1} max={4.5} step={0.1} decimals={1} unit="σ" onChange={onSetAdaptiveK} />
          </PropRow>
        ) : (
          <PropRow label="Fixed threshold" htmlFor="prop-manual-threshold">
            <SliderField id="prop-manual-threshold" label="Fixed threshold" value={manualThreshold} min={20} max={240} step={1} unit="DN" onChange={(v) => onSetManualThreshold(Math.round(v))} />
          </PropRow>
        )}
        <div className="px-3 pt-1">
          <div className="rounded-sm border border-line bg-panel-2 px-2 py-1 font-mono-tabular text-[11px] leading-4 text-muted">
            {adaptiveExplanation}
          </div>
        </div>
      </PropSection>

      <PropSection title="Sensor">
        <PropRow label="Resolution" htmlFor="prop-resolution">
          <SelectField
            id="prop-resolution"
            value={`${cameraConfig.resolutionWidth}x${cameraConfig.resolutionHeight}` as (typeof RESOLUTIONS)[number]['value']}
            options={RESOLUTIONS}
            onChange={(v) => {
              const [w, h] = v.split('x').map(Number);
              onUpdateCameraConfig({ resolutionWidth: w, resolutionHeight: h });
            }}
          />
        </PropRow>
        <PropRow label="Horizontal FOV" htmlFor="prop-fov-x">
          <SliderField id="prop-fov-x" label="Horizontal FOV" value={cameraConfig.fovXDeg} min={2} max={8} step={0.5} decimals={1} unit="°" onChange={(v) => onUpdateCameraConfig({ fovXDeg: v })} />
        </PropRow>
        <PropRow label="Vertical FOV" htmlFor="prop-fov-y">
          <SliderField id="prop-fov-y" label="Vertical FOV" value={cameraConfig.fovYDeg} min={1.5} max={6} step={0.5} decimals={1} unit="°" onChange={(v) => onUpdateCameraConfig({ fovYDeg: v })} />
        </PropRow>
      </PropSection>

      <PropSection title="Target" aside={`Primary ${selectedPrimaryBeaconId}`}>
        <PropRow label="Beacons">
          <Stepper
            ariaLabel="Beacon count"
            value={beaconCount || 1}
            min={1}
            max={5}
            onChange={(n) => onSetBeaconCount && onSetBeaconCount(n)}
          />
        </PropRow>
        {(beaconCount || 1) > 1 && (
          <PropRow label="Editing">
            <Segmented
              ariaLabel="Beacon to edit"
              value={editingBeacon.id}
              onChange={setSelectedBeaconTab}
              options={targets.map((b) => ({
                value: b.id,
                label: (
                  <>
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="font-mono-tabular">{b.id}</span>
                  </>
                ),
              }))}
            />
          </PropRow>
        )}
        <PropRow label="Gimbal priority">
          <Segmented
            ariaLabel="Gimbal priority"
            value={targetPriority}
            onChange={onSetTargetPriority}
            options={[
              { value: 'closest_to_center', label: 'Closest', title: 'Beacon closest to the image centre' },
              { value: 'brightest', label: 'Brightest', title: 'Brightest detected beacon' },
              { value: 'click_to_select', label: 'Manual', title: 'Click a beacon in either view to lock it' },
            ]}
          />
        </PropRow>
        {onSetPrimaryBeaconId && (beaconCount || 1) > 1 && (
          <PropRow label={`${editingBeacon.id} role`}>
            {isEditingPrimary ? (
              <span className="text-fg">Primary (gimbal lock)</span>
            ) : (
              <button
                type="button"
                onClick={() => onSetPrimaryBeaconId(editingBeacon.id)}
                className="h-7 rounded-sm border border-line bg-panel-2 px-2 text-[12px] text-fg hover:bg-panel-hover"
              >
                Set as primary
              </button>
            )}
          </PropRow>
        )}
        <PropRow label="Motion" htmlFor="prop-motion">
          <SelectField
            id="prop-motion"
            value={editingBeacon.motionPattern}
            options={MOTION_PATTERNS}
            onChange={(v) => updateEditingBeacon({ motionPattern: v })}
          />
        </PropRow>
        <PropRow label="Shape">
          <Segmented ariaLabel="Beacon shape" value={editingBeacon.shape} onChange={(v) => updateEditingBeacon({ shape: v })} options={SHAPES} />
        </PropRow>
        <PropRow label="Size" htmlFor="prop-size" hint="PS 5–20 px, default 10 px">
          <SliderField id="prop-size" label="Size" value={editingBeacon.size} min={5} max={20} step={1} unit="px" onChange={(v) => updateEditingBeacon({ size: Math.round(v) })} />
        </PropRow>
        <PropRow label="Speed" htmlFor="prop-speed">
          <SliderField id="prop-speed" label="Speed" value={editingBeacon.speed} min={20} max={160} step={5} unit="px/s" onChange={(v) => updateEditingBeacon({ speed: Math.round(v) })} />
        </PropRow>
      </PropSection>

      <PropSection title="Disturbances">
        <PropRow label={<ToggleLabel label="Salt and pepper" checked={d.enableSaltPepper} onChange={(v) => onUpdateDisturbances({ enableSaltPepper: v })} />}>
          <SliderField id="prop-sp" label="Salt and pepper density" value={d.saltPepperDensity} min={0.01} max={0.2} step={0.01} scale={100} unit="%" disabled={!d.enableSaltPepper} onChange={(v) => onUpdateDisturbances({ saltPepperDensity: v })} />
        </PropRow>
        <PropRow label={<ToggleLabel label="Gaussian" checked={d.enableGaussian} onChange={(v) => onUpdateDisturbances({ enableGaussian: v })} />}>
          <SliderField id="prop-gauss" label="Gaussian sigma" value={d.gaussianSigma} min={1} max={20} step={1} unit="σ px" disabled={!d.enableGaussian} onChange={(v) => onUpdateDisturbances({ gaussianSigma: Math.round(v) })} />
        </PropRow>
        <PropRow label={<ToggleLabel label="Poisson shot" checked={d.enablePoisson} onChange={(v) => onUpdateDisturbances({ enablePoisson: v })} />}>
          <SliderField id="prop-poisson" label="Poisson intensity" value={d.poissonIntensity} min={0.1} max={1} step={0.1} scale={10} decimals={1} disabled={!d.enablePoisson} onChange={(v) => onUpdateDisturbances({ poissonIntensity: v })} />
        </PropRow>
        <PropRow label={<ToggleLabel label="Housing jitter" checked={d.enableJitter} onChange={(v) => onUpdateDisturbances({ enableJitter: v })} />}>
          <SliderField id="prop-jitter" label="Jitter amplitude" value={d.jitterAmplitudePx} min={1} max={20} step={1} unit="px/fr" disabled={!d.enableJitter} onChange={(v) => onUpdateDisturbances({ jitterAmplitudePx: Math.round(v) })} />
        </PropRow>
        <PropRow label="Atmosphere" htmlFor="prop-atmos">
          <SelectField id="prop-atmos" value={d.atmosphericPreset} options={ATMOSPHERE} onChange={(v) => onUpdateDisturbances({ atmosphericPreset: v })} />
        </PropRow>
        <PropRow label="Attenuation" htmlFor="prop-atmos-density">
          <SliderField id="prop-atmos-density" label="Attenuation" value={d.atmosphericIntensity} min={0.1} max={1} step={0.05} scale={100} unit="%" disabled={d.atmosphericPreset === 'clear'} onChange={(v) => onUpdateDisturbances({ atmosphericIntensity: v })} />
        </PropRow>
        <PropRow label={<ToggleLabel label="Platform motion" checked={d.enablePlatformMotion} onChange={(v) => onUpdateDisturbances({ enablePlatformMotion: v })} />}>
          <SelectField id="prop-platform" value={d.platformMotionType} options={PLATFORM_MOTION} disabled={!d.enablePlatformMotion} onChange={(v) => onUpdateDisturbances({ platformMotionType: v })} />
        </PropRow>
        <PropRow label="Platform amplitude" htmlFor="prop-platform-amp">
          <SliderField id="prop-platform-amp" label="Platform amplitude" value={d.platformAmplitudePx} min={2} max={20} step={1} unit="px" disabled={!d.enablePlatformMotion} onChange={(v) => onUpdateDisturbances({ platformAmplitudePx: Math.round(v) })} />
        </PropRow>
      </PropSection>

      <PropSection title="Control loop">
        <PropRow label="Kp" htmlFor="prop-kp">
          <SliderField id="prop-kp" label="Kp" value={pidConfig.kp} min={0.5} max={6} step={0.1} decimals={2} onChange={(v) => onUpdatePid({ kp: v })} />
        </PropRow>
        <PropRow label="Ki" htmlFor="prop-ki">
          <SliderField id="prop-ki" label="Ki" value={pidConfig.ki} min={0} max={1} step={0.02} decimals={2} onChange={(v) => onUpdatePid({ ki: v })} />
        </PropRow>
        <PropRow label="Kd" htmlFor="prop-kd">
          <SliderField id="prop-kd" label="Kd" value={pidConfig.kd} min={0} max={1.5} step={0.05} decimals={2} onChange={(v) => onUpdatePid({ kd: v })} />
        </PropRow>
        <PropRow label="Kff (velocity)" htmlFor="prop-kff">
          <SliderField id="prop-kff" label="Kff" value={pidConfig.kff} min={0} max={1} step={0.05} decimals={2} onChange={(v) => onUpdatePid({ kff: v })} />
        </PropRow>
        <PropRow label="Loop rate" htmlFor="prop-loop" hint="PS ≥ 20 Hz">
          <SliderField id="prop-loop" label="Loop rate" value={cameraConfig.controlLoopHz} min={20} max={50} step={5} unit="Hz" onChange={(v) => onUpdateCameraConfig({ controlLoopHz: Math.round(v) })} />
        </PropRow>
      </PropSection>

      <PropSection title="Gimbal">
        <PropRow label="Max pan rate" htmlFor="prop-pan" hint="PS 5–10 °/s">
          <SliderField id="prop-pan" label="Max pan rate" value={cameraConfig.maxPanSpeedDegS} min={5} max={10} step={0.5} decimals={1} unit="°/s" onChange={(v) => onUpdateCameraConfig({ maxPanSpeedDegS: v })} />
        </PropRow>
        <PropRow label="Max tilt rate" htmlFor="prop-tilt" hint="PS 5–10 °/s">
          <SliderField id="prop-tilt" label="Max tilt rate" value={cameraConfig.maxTiltSpeedDegS} min={5} max={10} step={0.5} decimals={1} unit="°/s" onChange={(v) => onUpdateCameraConfig({ maxTiltSpeedDegS: v })} />
        </PropRow>
        <PropRow label="Servo lag" htmlFor="prop-lag">
          <SliderField id="prop-lag" label="Servo lag" value={pidConfig.servoLagMs} min={0} max={100} step={5} unit="ms" onChange={(v) => onUpdatePid({ servoLagMs: Math.round(v) })} />
        </PropRow>
        <PropRow label="Backlash" htmlFor="prop-backlash" hint="Dead band on direction reversal">
          <SliderField id="prop-backlash" label="Backlash" value={pidConfig.backlashPx} min={0} max={4} step={0.2} decimals={1} unit="px" onChange={(v) => onUpdatePid({ backlashPx: v })} />
        </PropRow>
      </PropSection>
    </div>
  );
};
