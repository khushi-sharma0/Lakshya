/**
 * Lakshya — FSOC Virtual Camera Tracking System
 * Core Type Definitions (ISRO Problem Statement 26169)
 */

export type TrackingState = 'SEARCHING' | 'ACQUIRED' | 'TRACKING' | 'LOST' | 'REACQUIRING';

export type TargetMotionPattern =
  | 'straight_line'
  | 'circular'
  | 'figure_eight'
  | 'random'
  | 'spiral'
  | 'sinusoidal'
  | 'custom_path';

export type TargetShape = 'square' | 'circle' | 'gaussian_spot' | 'cross';

export type AtmosphericPreset = 'clear' | 'haze' | 'fog' | 'rain' | 'low_light';

export type PlatformMotionType = 'linear' | 'circular' | 'random' | 'spiral' | 'figure_eight';

export type DetectionEngine = 'traditional_cv' | 'ai_detector';

export type TargetPrioritization = 'brightest' | 'closest_to_center' | 'click_to_select';

export type BeaconTrackState = 'TRACKING' | 'COASTING' | 'LOST' | 'SEARCHING';

export interface TargetConfig {
  id: string; // 'B1', 'B2', etc.
  shape: TargetShape;
  size: number; // pixels (5 - 20, default 10)
  x: number; // scene coordinates (0 to sceneWidth)
  y: number; // scene coordinates (0 to sceneHeight)
  vx: number;
  vy: number;
  intensity: number; // 0.0 - 1.0 (brightness)
  color: string;
  motionPattern: TargetMotionPattern;
  speed: number; // pixels/sec
  customPoints?: Array<{ x: number; y: number }>;
}

export interface BeaconTrack {
  id: string; // Persistent ID e.g. 'B1'
  trackId: number;
  state: BeaconTrackState;
  color: string;
  // Estimated in camera frame pixels
  estimatedX: number;
  estimatedY: number;
  predictedX: number;
  predictedY: number;
  vx: number;
  vy: number;
  covarianceTrace: number;
  confidence: number;
  consecutiveHits: number;
  consecutiveMisses: number;
  lastDetection: CentroidResult | null;
  // Error from camera boresight
  errorFromBoresightPx: number;
  inFov: boolean;
  totalFrames: number;
  lockedFrames: number;
  lockRetentionPct: number;
  lossCount: number;
  errorSum: number;
}

export interface BeaconMetricItem {
  id: string;
  color: string;
  state: BeaconTrackState;
  errorPx: number;
  avgErrorPx: number;
  lockRetentionPct: number;
  lossRatePct: number;
  totalFrames: number;
  lockedFrames: number;
}

export interface CameraConfig {
  screenWidth: number; // default 2000
  screenHeight: number; // default 2000
  resolutionWidth: number; // default 640
  resolutionHeight: number; // default 480
  fovXDeg: number; // default 4.0 deg
  fovYDeg: number; // default 3.0 deg
  isMonochrome: boolean; // default true
  updateRateHz: number; // default 30 Hz (>= 30 Hz)
  panPosDeg: number; // Current camera pan angle / position
  tiltPosDeg: number; // Current camera tilt angle / position
  maxPanSpeedDegS: number; // 5.0 - 10.0 deg/s, default 5.0
  maxTiltSpeedDegS: number; // 5.0 - 10.0 deg/s, default 5.0
  controlLoopHz: number; // >= 20 Hz, default 20 Hz
}

export interface DisturbancesConfig {
  // Image noise
  enableSaltPepper: boolean;
  saltPepperDensity: number; // e.g. 0.05 - 0.15 (~10%)
  enableGaussian: boolean;
  gaussianSigma: number; // 0 - 20 px/intensity
  enablePoisson: boolean;
  poissonIntensity: number;

  // Camera jitter
  enableJitter: boolean;
  jitterAmplitudePx: number; // 0 - 20 px/frame

  // Atmospheric disturbance
  atmosphericPreset: AtmosphericPreset;
  atmosphericIntensity: number; // 0.0 - 1.0

  // Platform motion
  enablePlatformMotion: boolean;
  platformMotionType: PlatformMotionType;
  platformAmplitudePx: number; // 0 - 20 px/frame
  platformSpeed: number; // speed multiplier
}

export interface PidConfig {
  kp: number; // Proportional gain
  ki: number; // Integral gain
  kd: number; // Derivative gain
  kff: number; // Feed-forward velocity gain
  integralWindupLimit: number;
  servoLagMs: number; // Simulated servo actuation delay (0 - 100 ms)
  backlashPx: number; // Servo backlash deadband (0 - 5 px)
}

export interface CentroidResult {
  // Moment-based centroid
  momentX: number;
  momentY: number;
  // 2D Gaussian fit sub-pixel centroid
  gaussianX: number;
  gaussianY: number;
  // Difference between Gaussian sub-pixel and moment
  offsetDiffPx: number;
  // Goodness-of-fit R² (0.0 to 1.0)
  rSquared: number;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  detected: boolean;
}

export interface KalmanState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  predictedX: number;
  predictedY: number;
  covarianceTrace: number;
}

export interface PerformanceMetrics {
  fps: number;
  trackingState: TrackingState;
  currentErrorPx: number; // Euclidean distance from frame center (boresight)
  avgErrorPx: number;
  maxErrorPx: number;
  acquisitionTimeSec: number;
  lockRetentionRatePct: number;
  reacquisitionTimeSec: number;
  targetLossRatePct: number;
  processingTimeMs: number;
  centroidingErrorPx: number; // Sub-pixel fit discrepancy
  totalFrames: number;
  lockedFrames: number;
  lostCount: number;
  simDurationSec: number;
  beaconMetrics?: BeaconMetricItem[];
}

export interface ThresholdEvaluation {
  acquisitionTimePass: boolean; // <= 2.0 s
  trackingErrorPass: boolean; // <= 10.0 px
  targetLossRatePass: boolean; // < 5.0 %
  reacquisitionTimePass: boolean; // <= 1.0 s
  processingSpeedPass: boolean; // >= 20.0 FPS
  lockRetentionPass: boolean; // >= 85.0 %
}

export interface FrameLogEntry {
  timestampSec: number;
  frameIndex: number;
  fps: number;
  state: TrackingState;
  targetTrueX: number;
  targetTrueY: number;
  cameraCenterX: number;
  cameraCenterY: number;
  measuredX: number;
  measuredY: number;
  predictedX: number;
  predictedY: number;
  trackingErrorPx: number;
  centroidingErrorPx: number;
  gaussianRSquared: number;
  panCmd: number;
  tiltCmd: number;
}

export interface LossLocation {
  x: number; // Scene coordinate X
  y: number; // Scene coordinate Y
  timestamp: number;
  durationMs: number;
}

export interface RunRecord {
  id: string;
  name: string;
  timestamp: string;
  durationSec: number;
  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
  frameLogs: FrameLogEntry[];
}

