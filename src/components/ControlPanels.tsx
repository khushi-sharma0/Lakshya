/**
 * Configuration Drawer Component for Lakshya
 * Contains parameters for Camera, Disturbances, PID, and Target.
 */

import React, { useState } from 'react';
import { CameraConfig, DisturbancesConfig, PidConfig, TargetConfig, DetectionEngine, TargetPrioritization } from '../types';
import { Camera, Wind, Activity, Target, Cpu, ChevronDown, ChevronRight } from 'lucide-react';

interface ControlPanelsProps {
  cameraConfig: CameraConfig;
  onUpdateCameraConfig: (cfg: Partial<CameraConfig>) => void;
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
  onSetManualThreshold: (val: number) => void;
  isMultiTarget: boolean;
  onToggleMultiTarget: () => void;
  targetPriority: TargetPrioritization;
  onSetTargetPriority: (p: TargetPrioritization) => void;
  adaptiveExplanation?: string;
  beaconCount?: number;
  onSetBeaconCount?: (n: number) => void;
  selectedPrimaryBeaconId?: string;
  onSetPrimaryBeaconId?: (id: string) => void;
  onUpdateBeacon?: (id: string, cfg: Partial<TargetConfig>) => void;
  targets?: TargetConfig[];
}

function SectionHeader({
  icon: Icon,
  title,
  isOpen,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between border-b border-line px-3 py-2 text-[12px] font-semibold tracking-wider text-fg uppercase transition-colors hover:bg-panel-hover"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-accent" />
        <span>{title}</span>
      </div>
      {isOpen ? <ChevronDown className="size-3.5 text-muted" /> : <ChevronRight className="size-3.5 text-muted" />}
    </button>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[12px]">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function PropSection({ title, aside, children }: { title?: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/50 pb-2">
      {title && (
        <div className="flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-semibold text-dim uppercase">
          <span>{title}</span>
          {aside && <span className="font-mono text-[10px] text-muted normal-case">{aside}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Slider({
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-24 cursor-pointer accent-accent"
      />
      <span className="w-12 text-right font-mono text-[11px] text-fg">
        {value}
        {unit}
      </span>
    </div>
  );
}

function Stepper({
  ariaLabel,
  value,
  min,
  max,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 font-mono text-[11px]">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-5 items-center justify-center rounded border border-line bg-panel text-fg hover:bg-panel-hover disabled:opacity-30"
      >
        -
      </button>
      <span className="w-4 text-center">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex size-5 items-center justify-center rounded border border-line bg-panel text-fg hover:bg-panel-hover disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function Segmented<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: React.ReactNode; title?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded border border-line bg-bg p-0.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              active ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const ControlPanels: React.FC<ControlPanelsProps> = ({
  cameraConfig,
  onUpdateCameraConfig,
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
  beaconCount = 1,
  onSetBeaconCount,
  selectedPrimaryBeaconId = 'B1',
  onSetPrimaryBeaconId,
  onUpdateBeacon,
  targets = [],
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    detection: true,
    sensor: true,
    target: true,
    disturbances: true,
    pid: true,
  });

  const toggle = (sec: string) => setOpenSections((p) => ({ ...p, [sec]: !p[sec] }));

  const [selectedBeaconTab, setSelectedBeaconTab] = useState<string>('B1');
  const editingBeacon = targets.find((t) => t.id === selectedBeaconTab) || primaryTarget;

  return (
    <div className="flex flex-col divide-y divide-line text-fg">
      {/* 1. Detection Panel */}
      <div>
        <SectionHeader
          icon={Cpu}
          title="Detection"
          isOpen={openSections.detection}
          onToggle={() => toggle('detection')}
        />
        {openSections.detection && (
          <div className="py-1">
            <PropRow label="Method">
              <Segmented
                ariaLabel="Detection engine"
                value={detectionEngine}
                onChange={onSetDetectionEngine}
                options={[
                  { value: 'traditional_cv', label: 'Moment + Gaussian' },
                  { value: 'ai_detector', label: 'Saliency kernel' },
                ]}
              />
            </PropRow>

            <PropRow label="Adaptive threshold">
              <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={useAdaptiveThreshold}
                  onChange={onToggleAdaptiveThreshold}
                  className="accent-accent"
                />
                <span>mean + k·σ of background</span>
              </label>
            </PropRow>

            {useAdaptiveThreshold ? (
              <PropRow label="Threshold k">
                <Slider
                  ariaLabel="Adaptive threshold multiplier k"
                  value={adaptiveK}
                  min={1.0}
                  max={5.0}
                  step={0.1}
                  unit=" σ"
                  onChange={onSetAdaptiveK}
                />
              </PropRow>
            ) : (
              <PropRow label="Manual threshold">
                <Slider
                  ariaLabel="Manual pixel intensity threshold"
                  value={manualThreshold}
                  min={10}
                  max={245}
                  step={5}
                  onChange={onSetManualThreshold}
                />
              </PropRow>
            )}
          </div>
        )}
      </div>

      {/* 2. Sensor & Camera Panel */}
      <div>
        <SectionHeader
          icon={Camera}
          title="Sensor"
          isOpen={openSections.sensor}
          onToggle={() => toggle('sensor')}
        />
        {openSections.sensor && (
          <div className="py-1">
            <PropRow label="Resolution">
              <span className="font-mono text-[11px]">
                {cameraConfig.resolutionWidth} × {cameraConfig.resolutionHeight}
              </span>
            </PropRow>
            <PropRow label="Horizontal FOV">
              <Slider
                ariaLabel="Horizontal Field of View"
                value={cameraConfig.fovXDeg}
                min={1.0}
                max={15.0}
                step={0.5}
                unit="°"
                onChange={(fovXDeg) => onUpdateCameraConfig({ fovXDeg })}
              />
            </PropRow>
            <PropRow label="Vertical FOV">
              <Slider
                ariaLabel="Vertical Field of View"
                value={cameraConfig.fovYDeg}
                min={1.0}
                max={12.0}
                step={0.5}
                unit="°"
                onChange={(fovYDeg) => onUpdateCameraConfig({ fovYDeg })}
              />
            </PropRow>
          </div>
        )}
      </div>

      {/* 3. Target & Multi-Beacon Panel */}
      <div>
        <SectionHeader
          icon={Target}
          title="Target"
          isOpen={openSections.target}
          onToggle={() => toggle('target')}
        />
        {openSections.target && (
          <div className="py-1">
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
                    onChange={(v) => setSelectedBeaconTab(String(v))}
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
            </PropSection>

            <PropSection title={`Trajectory · ${editingBeacon.id}`}>
              <PropRow label="Motion">
                <Segmented
                  ariaLabel="Target motion pattern"
                  value={editingBeacon.motionPattern}
                  onChange={(mp) =>
                    onUpdateBeacon
                      ? onUpdateBeacon(editingBeacon.id, { motionPattern: mp as any })
                      : onUpdateTarget({ motionPattern: mp as any })
                  }
                  options={[
                    { value: 'straight_line', label: 'Straight' },
                    { value: 'circular', label: 'Circle' },
                    { value: 'figure_eight', label: 'Fig-8' },
                    { value: 'random', label: 'Random' },
                  ]}
                />
              </PropRow>
              <PropRow label="Shape">
                <Segmented
                  ariaLabel="Target shape"
                  value={editingBeacon.shape}
                  onChange={(sh) =>
                    onUpdateBeacon
                      ? onUpdateBeacon(editingBeacon.id, { shape: sh as any })
                      : onUpdateTarget({ shape: sh as any })
                  }
                  options={[
                    { value: 'square', label: 'Square' },
                    { value: 'circle', label: 'Circle' },
                    { value: 'gaussian_spot', label: 'Gaussian' },
                    { value: 'cross', label: 'Cross' },
                  ]}
                />
              </PropRow>
              <PropRow label="Size">
                <Slider
                  ariaLabel="Target size"
                  value={editingBeacon.size || 10}
                  min={5}
                  max={20}
                  step={1}
                  unit=" px"
                  onChange={(sz) =>
                    onUpdateBeacon
                      ? onUpdateBeacon(editingBeacon.id, { size: sz })
                      : onUpdateTarget({ size: sz })
                  }
                />
              </PropRow>
              <PropRow label="Speed">
                <Slider
                  ariaLabel="Target speed"
                  value={editingBeacon.speed || 60}
                  min={10}
                  max={150}
                  step={5}
                  unit=" px/s"
                  onChange={(sp) =>
                    onUpdateBeacon
                      ? onUpdateBeacon(editingBeacon.id, { speed: sp })
                      : onUpdateTarget({ speed: sp })
                  }
                />
              </PropRow>
            </PropSection>
          </div>
        )}
      </div>

      {/* 4. Optical Disturbances Panel */}
      <div>
        <SectionHeader
          icon={Wind}
          title="Disturbances"
          isOpen={openSections.disturbances}
          onToggle={() => toggle('disturbances')}
        />
        {openSections.disturbances && (
          <div className="py-1">
            <PropRow label="Gaussian noise σ">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disturbances.enableGaussian}
                  onChange={(e) => onUpdateDisturbances({ enableGaussian: e.target.checked })}
                  className="accent-accent"
                />
                <Slider
                  ariaLabel="Gaussian noise sigma"
                  value={disturbances.gaussianSigma}
                  min={0}
                  max={15}
                  step={1}
                  onChange={(gaussianSigma) => onUpdateDisturbances({ gaussianSigma, enableGaussian: gaussianSigma > 0 })}
                />
              </div>
            </PropRow>

            <PropRow label="Salt & Pepper">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disturbances.enableSaltPepper}
                  onChange={(e) => onUpdateDisturbances({ enableSaltPepper: e.target.checked })}
                  className="accent-accent"
                />
                <Slider
                  ariaLabel="Salt and pepper density"
                  value={Math.round(disturbances.saltPepperDensity * 100)}
                  min={0}
                  max={30}
                  step={1}
                  unit="%"
                  onChange={(val) =>
                    onUpdateDisturbances({
                      saltPepperDensity: val / 100,
                      enableSaltPepper: val > 0,
                    })
                  }
                />
              </div>
            </PropRow>

            <PropRow label="Poisson shot noise">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disturbances.enablePoisson}
                  onChange={(e) => onUpdateDisturbances({ enablePoisson: e.target.checked })}
                  className="accent-accent"
                />
                <Slider
                  ariaLabel="Poisson shot noise intensity"
                  value={disturbances.poissonIntensity}
                  min={0}
                  max={1.0}
                  step={0.1}
                  onChange={(poissonIntensity) => onUpdateDisturbances({ poissonIntensity, enablePoisson: poissonIntensity > 0 })}
                />
              </div>
            </PropRow>

            <PropRow label="Housing jitter">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disturbances.enableJitter}
                  onChange={(e) => onUpdateDisturbances({ enableJitter: e.target.checked })}
                  className="accent-accent"
                />
                <Slider
                  ariaLabel="Housing jitter amplitude"
                  value={disturbances.jitterAmplitudePx}
                  min={0}
                  max={20}
                  step={1}
                  unit=" px"
                  onChange={(jitterAmplitudePx) => onUpdateDisturbances({ jitterAmplitudePx, enableJitter: jitterAmplitudePx > 0 })}
                />
              </div>
            </PropRow>

            <PropRow label="Atmosphere preset">
              <Segmented
                ariaLabel="Atmospheric preset"
                value={disturbances.atmosphericPreset}
                onChange={(preset) => onUpdateDisturbances({ atmosphericPreset: preset as any })}
                options={[
                  { value: 'clear', label: 'Clear' },
                  { value: 'haze', label: 'Haze' },
                  { value: 'fog', label: 'Fog' },
                  { value: 'rain', label: 'Rain' },
                ]}
              />
            </PropRow>

            <PropRow label="Attenuation">
              <Slider
                ariaLabel="Atmospheric attenuation intensity"
                value={disturbances.atmosphericIntensity}
                min={0.0}
                max={1.0}
                step={0.1}
                onChange={(atmosphericIntensity) => onUpdateDisturbances({ atmosphericIntensity })}
              />
            </PropRow>

            <PropRow label="Platform motion">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disturbances.enablePlatformMotion}
                  onChange={(e) => onUpdateDisturbances({ enablePlatformMotion: e.target.checked })}
                  className="accent-accent"
                />
                <Slider
                  ariaLabel="Platform motion amplitude"
                  value={disturbances.platformAmplitudePx}
                  min={0}
                  max={20}
                  step={1}
                  unit=" px"
                  onChange={(platformAmplitudePx) => onUpdateDisturbances({ platformAmplitudePx, enablePlatformMotion: platformAmplitudePx > 0 })}
                />
              </div>
            </PropRow>
          </div>
        )}
      </div>

      {/* 5. PID Gimbal Controller Panel */}
      <div>
        <SectionHeader
          icon={Activity}
          title="Gimbal PID & Loop"
          isOpen={openSections.pid}
          onToggle={() => toggle('pid')}
        />
        {openSections.pid && (
          <div className="py-1">
            <PropRow label="Proportional (Kp)">
              <Slider
                ariaLabel="Proportional Gain Kp"
                value={pidConfig.kp}
                min={0.1}
                max={10.0}
                step={0.1}
                onChange={(kp) => onUpdatePid({ kp })}
              />
            </PropRow>
            <PropRow label="Integral (Ki)">
              <Slider
                ariaLabel="Integral Gain Ki"
                value={pidConfig.ki}
                min={0.0}
                max={2.0}
                step={0.05}
                onChange={(ki) => onUpdatePid({ ki })}
              />
            </PropRow>
            <PropRow label="Derivative (Kd)">
              <Slider
                ariaLabel="Derivative Gain Kd"
                value={pidConfig.kd}
                min={0.0}
                max={5.0}
                step={0.1}
                onChange={(kd) => onUpdatePid({ kd })}
              />
            </PropRow>
            <PropRow label="Feedforward (Kff)">
              <Slider
                ariaLabel="Velocity Feedforward Gain Kff"
                value={pidConfig.kff}
                min={0.0}
                max={2.0}
                step={0.1}
                onChange={(kff) => onUpdatePid({ kff })}
              />
            </PropRow>
            <PropRow label="Servo lag">
              <Slider
                ariaLabel="Servo lag delay"
                value={pidConfig.servoLagMs}
                min={0}
                max={100}
                step={5}
                unit=" ms"
                onChange={(servoLagMs) => onUpdatePid({ servoLagMs })}
              />
            </PropRow>
            <PropRow label="Backlash">
              <Slider
                ariaLabel="Backlash deadband"
                value={pidConfig.backlashPx}
                min={0}
                max={5}
                step={0.5}
                unit=" px"
                onChange={(backlashPx) => onUpdatePid({ backlashPx })}
              />
            </PropRow>
          </div>
        )}
      </div>
    </div>
  );
};