/**
 * Automated Benchmark Suite Runner
 * Runs a standardized matrix of test cases:
 * 4 motion patterns x 5 disturbance tiers
 * Evaluates against ISRO PS 26169 thresholds and outputs scored matrix
 */

import { TargetMotionPattern, AtmosphericPreset } from '../types';

export interface SuiteTestCase {
  id: string;
  name: string;
  motionPattern: TargetMotionPattern;
  noiseLevelName: string;
  gaussianSigma: number;
  saltPepperDensity: number;
  jitterPx: number;
  atmosphericPreset: AtmosphericPreset;
  durationSec: number;
}

export interface SuiteResult {
  caseId: string;
  motionPattern: TargetMotionPattern;
  noiseLevel: string;
  acquisitionTimeSec: number;
  avgTrackingErrorPx: number;
  maxTrackingErrorPx: number;
  lockRetentionPct: number;
  targetLossRatePct: number;
  reacquisitionTimeSec: number;
  fps: number;
  centroidingErrorPx: number;
  passed: boolean;
}

export const BENCHMARK_SUITE_CASES: SuiteTestCase[] = [
  // 1. Straight Line across noise levels
  {
    id: 'case_str_clear',
    name: 'Straight Line - Clear Baseline',
    motionPattern: 'straight_line',
    noiseLevelName: 'Clear / Low Noise',
    gaussianSigma: 2,
    saltPepperDensity: 0.01,
    jitterPx: 0,
    atmosphericPreset: 'clear',
    durationSec: 4,
  },
  {
    id: 'case_str_haze',
    name: 'Straight Line - Atmospheric Haze',
    motionPattern: 'straight_line',
    noiseLevelName: 'Haze + Jitter',
    gaussianSigma: 6,
    saltPepperDensity: 0.03,
    jitterPx: 5,
    atmosphericPreset: 'haze',
    durationSec: 4,
  },
  // 2. Circular Motion
  {
    id: 'case_circ_sp',
    name: 'Circular - Salt & Pepper Noise',
    motionPattern: 'circular',
    noiseLevelName: 'Salt & Pepper 8%',
    gaussianSigma: 4,
    saltPepperDensity: 0.08,
    jitterPx: 4,
    atmosphericPreset: 'clear',
    durationSec: 4,
  },
  {
    id: 'case_circ_fog',
    name: 'Circular - Dense Fog Scattering',
    motionPattern: 'circular',
    noiseLevelName: 'Fog + High Jitter',
    gaussianSigma: 10,
    saltPepperDensity: 0.05,
    jitterPx: 12,
    atmosphericPreset: 'fog',
    durationSec: 4,
  },
  // 3. Figure-of-8 (Lemniscate)
  {
    id: 'case_fig8_gaussian',
    name: 'Figure-of-8 - High Gaussian Noise',
    motionPattern: 'figure_eight',
    noiseLevelName: 'Gaussian Sigma 15',
    gaussianSigma: 15,
    saltPepperDensity: 0.04,
    jitterPx: 8,
    atmosphericPreset: 'rain',
    durationSec: 4,
  },
  // 4. Random Walk
  {
    id: 'case_rand_extreme',
    name: 'Random Walk - Combined Disturbances',
    motionPattern: 'random',
    noiseLevelName: 'Extreme Jitter + Low Light',
    gaussianSigma: 12,
    saltPepperDensity: 0.07,
    jitterPx: 15,
    atmosphericPreset: 'low_light',
    durationSec: 4,
  },
];
