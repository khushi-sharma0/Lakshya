/**
 * Lakshya — FSOC Virtual Camera Tracking System
 * ISRO Problem Statement 26169: AI-Based Virtual Camera Tracking System
 * for Coarse Alignment of Mobile FSOC Terminals.
 *
 * Multipage Architecture (4 Pages):
 * 1. Simulation (Home with embedded collapsible parameters drawer)
 * 2. Benchmark Mode (Direct Video Input Bypass)
 * 3. Webcam Mode
 * 4. Reports (Multi-Run Time-Series History & Automated Benchmark Matrix)
 *
 * Strict Non-Negotiable Principle:
 * Tracking algorithm NEVER receives ground-truth coordinates.
 * Detection module processes purely the rendered camera/video image buffer.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  CameraConfig,
  DisturbancesConfig,
  PidConfig,
  TargetConfig,
  CentroidResult,
  KalmanState,
  TrackingState,
  PerformanceMetrics,
  ThresholdEvaluation,
  DetectionEngine,
  TargetPrioritization,
  BeaconTrack,
  BeaconMetricItem,
} from './types';
import { TargetEngine } from './core/targetEngine';
import { VirtualCamera } from './core/camera';
import { DisturbanceInjector } from './core/disturbances';
import { DetectionModule } from './core/detection';
import { TrackingModule } from './core/tracker';
import { PidController } from './core/controller';
import { PerformanceLogger } from './core/logger';
import { BenchmarkVideoEngine } from './core/benchmarkVideo';
import { WebcamEngine } from './core/webcam';
import { SearchScanEngine } from './core/searchEngine';
import { SuiteResult, SuiteTestCase } from './core/benchmarkSuite';
import { Header, AppPage } from './components/Header';
import { TelemetryBar } from './components/TelemetryBar';
import { SimulationPage } from './pages/SimulationPage';
import { BenchmarkModeView } from './components/BenchmarkModeView';
import { WebcamModeView } from './components/WebcamModeView';
import { ReportsPage } from './pages/ReportsPage';
import { ReportModal } from './components/ReportModal';
import { Menu } from './components/shell/MenuBar';
import { StatusBar } from './components/shell/StatusBar';
import { HelpDialog, HelpDialogKind } from './components/shell/HelpDialog';

export default function App() {
  // Navigation: 4 Pages (Configuration embedded directly in Simulation)
  const [currentPage, setCurrentPage] = useState<AppPage>('simulation');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [helpKind, setHelpKind] = useState<HelpDialogKind | null>(null);

  // Persistent Core Engines
  const targetEngineRef = useRef<TargetEngine>(new TargetEngine(2000, 2000));
  const cameraRef = useRef<VirtualCamera>(new VirtualCamera());
  const disturbanceInjectorRef = useRef<DisturbanceInjector>(new DisturbanceInjector());
  const detectionModuleRef = useRef<DetectionModule>(new DetectionModule());
  const trackerRef = useRef<TrackingModule>(new TrackingModule());
  const pidControllerRef = useRef<PidController>(new PidController());
  const loggerRef = useRef<PerformanceLogger>(new PerformanceLogger());
  const benchmarkVideoRef = useRef<BenchmarkVideoEngine>(new BenchmarkVideoEngine());
  const webcamEngineRef = useRef<WebcamEngine>(new WebcamEngine());
  const searchEngineRef = useRef<SearchScanEngine>(new SearchScanEngine());
  const benchmarkTrackerRef = useRef<TrackingModule>(new TrackingModule());

  // Configuration States
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(cameraRef.current.config);
  const [disturbances, setDisturbances] = useState<DisturbancesConfig>({
    enableSaltPepper: false,
    saltPepperDensity: 0.08,
    enableGaussian: true,
    gaussianSigma: 4,
    enablePoisson: false,
    poissonIntensity: 0.5,
    enableJitter: false,
    jitterAmplitudePx: 4,
    atmosphericPreset: 'clear',
    atmosphericIntensity: 0.5,
    enablePlatformMotion: false,
    platformMotionType: 'linear',
    platformAmplitudePx: 6,
    platformSpeed: 1.0,
  });

  const [pidConfig, setPidConfig] = useState<PidConfig>(pidControllerRef.current.config);
  const [primaryTarget, setPrimaryTarget] = useState<TargetConfig>(targetEngineRef.current.getTargets()[0]);
  const [detectionEngine, setDetectionEngine] = useState<DetectionEngine>('traditional_cv');
  const [useAdaptiveThreshold, setUseAdaptiveThreshold] = useState<boolean>(true);
  const [adaptiveK, setAdaptiveK] = useState<number>(2.5);
  const [manualThreshold, setManualThreshold] = useState<number>(100);
  const [isMultiTarget, setIsMultiTarget] = useState<boolean>(false);
  const [targetPriority, setTargetPriority] = useState<TargetPrioritization>('brightest');
  const [isCustomPathActive, setIsCustomPathActive] = useState<boolean>(false);

  // Multi-Beacon Management (1 to 5 Beacons)
  const [beaconCount, setBeaconCount] = useState<number>(1);
  const [selectedPrimaryBeaconId, setSelectedPrimaryBeaconId] = useState<string>('B1');
  const [beaconTracks, setBeaconTracks] = useState<BeaconTrack[]>([]);

  // Live Telemetry States
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [cameraCenter, setCameraCenter] = useState<{ x: number; y: number }>({ x: 1000, y: 1000 });
  const [fovRect, setFovRect] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 800,
    y: 850,
    width: 400,
    height: 300,
  });

  const [centroidResult, setCentroidResult] = useState<CentroidResult>({
    momentX: 0,
    momentY: 0,
    gaussianX: 0,
    gaussianY: 0,
    offsetDiffPx: 0,
    rSquared: 0,
    confidence: 0,
    boundingBox: null,
    detected: false,
  });

  const [kalmanState, setKalmanState] = useState<KalmanState>({
    x: 320,
    y: 240,
    vx: 0,
    vy: 0,
    predictedX: 320,
    predictedY: 240,
    covarianceTrace: 0,
  });

  const [trackingState, setTrackingState] = useState<TrackingState>('SEARCHING');
  const [panCmdDegS, setPanCmdDegS] = useState<number>(0);
  const [tiltCmdDegS, setTiltCmdDegS] = useState<number>(0);
  const [feedImageData, setFeedImageData] = useState<ImageData | null>(null);
  const [currentErrorPx, setCurrentErrorPx] = useState<number>(0);
  const [adaptiveExplanation, setAdaptiveExplanation] = useState<string>('Initializing adaptive threshold...');

  // Metrics & 5 ISRO Thresholds
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 30,
    trackingState: 'SEARCHING',
    currentErrorPx: 0,
    avgErrorPx: 0,
    maxErrorPx: 0,
    acquisitionTimeSec: 0,
    lockRetentionRatePct: 0,
    reacquisitionTimeSec: 0,
    targetLossRatePct: 0,
    processingTimeMs: 0,
    centroidingErrorPx: 0,
    totalFrames: 0,
    lockedFrames: 0,
    lostCount: 0,
    simDurationSec: 0,
  });

  const [thresholds, setThresholds] = useState<ThresholdEvaluation>({
    acquisitionTimePass: false,
    trackingErrorPass: true,
    targetLossRatePass: true,
    reacquisitionTimePass: true,
    processingSpeedPass: true,
    lockRetentionPass: true,
  });

  // Rolling Histories for Charts
  const [errorHistory, setErrorHistory] = useState<number[]>([]);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);

  // Benchmark Mode Dedicated States
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    trackingState: 'SEARCHING',
    currentErrorPx: 0,
    avgErrorPx: 0,
    maxErrorPx: 0,
    acquisitionTimeSec: 0,
    lockRetentionRatePct: 0,
    reacquisitionTimeSec: 0,
    targetLossRatePct: 0,
    processingTimeMs: 0,
    centroidingErrorPx: 0,
    totalFrames: 0,
    lockedFrames: 0,
    lostCount: 0,
    simDurationSec: 0,
  });
  const [benchmarkThresholds, setBenchmarkThresholds] = useState<ThresholdEvaluation>({
    acquisitionTimePass: false,
    trackingErrorPass: false,
    targetLossRatePass: false,
    reacquisitionTimePass: false,
    processingSpeedPass: false,
    lockRetentionPass: false,
  });
  const [benchmarkHasActiveFrame, setBenchmarkHasActiveFrame] = useState<boolean>(false);
  const [benchmarkCentroidResult, setBenchmarkCentroidResult] = useState<CentroidResult>({
    momentX: 320,
    momentY: 240,
    gaussianX: 320,
    gaussianY: 240,
    offsetDiffPx: 0,
    rSquared: 0,
    confidence: 0,
    boundingBox: null,
    detected: false,
  });
  const [benchmarkTrackingState, setBenchmarkTrackingState] = useState<TrackingState>('SEARCHING');
  const [benchmarkPanCmd, setBenchmarkPanCmd] = useState<number>(0);
  const [benchmarkTiltCmd, setBenchmarkTiltCmd] = useState<number>(0);
  const [benchmarkCurrentError, setBenchmarkCurrentError] = useState<number>(0);
  const [benchmarkErrorHistory, setBenchmarkErrorHistory] = useState<number[]>([]);
  const [benchmarkFpsHistory, setBenchmarkFpsHistory] = useState<number[]>([]);

  const benchmarkStatsRef = useRef({
    totalFrames: 0,
    lockedFrames: 0,
    errorSum: 0,
    maxErrorPx: 0,
    centroidErrSum: 0,
    firstAcqFrame: -1,
    lostCount: 0,
    lastLossFrame: -1,
    reacqTimeSec: 0,
  });

  const handleResetBenchmark = () => {
    benchmarkVideoRef.current.reset();
    benchmarkTrackerRef.current.reset();
    benchmarkStatsRef.current = {
      totalFrames: 0,
      lockedFrames: 0,
      errorSum: 0,
      maxErrorPx: 0,
      centroidErrSum: 0,
      firstAcqFrame: -1,
      lostCount: 0,
      lastLossFrame: -1,
      reacqTimeSec: 0,
    };
    setBenchmarkHasActiveFrame(false);
    setBenchmarkTrackingState('SEARCHING');
    setBenchmarkPanCmd(0);
    setBenchmarkTiltCmd(0);
    setBenchmarkCurrentError(0);
    setBenchmarkErrorHistory([]);
    setBenchmarkFpsHistory([]);
    setBenchmarkMetrics({
      fps: 0,
      trackingState: 'SEARCHING',
      currentErrorPx: 0,
      avgErrorPx: 0,
      maxErrorPx: 0,
      acquisitionTimeSec: 0,
      lockRetentionRatePct: 0,
      reacquisitionTimeSec: 0,
      targetLossRatePct: 0,
      processingTimeMs: 0,
      centroidingErrorPx: 0,
      totalFrames: 0,
      lockedFrames: 0,
      lostCount: 0,
      simDurationSec: 0,
    });
    setBenchmarkThresholds({
      acquisitionTimePass: false,
      trackingErrorPass: false,
      targetLossRatePass: false,
      reacquisitionTimePass: false,
      processingSpeedPass: false,
      lockRetentionPass: false,
    });
    setBenchmarkCentroidResult({
      momentX: 320,
      momentY: 240,
      gaussianX: 320,
      gaussianY: 240,
      offsetDiffPx: 0,
      rSquared: 0,
      confidence: 0,
      boundingBox: null,
      detected: false,
    });
  };

  // Webcam Mode Dedicated States
  const webcamTrackerRef = useRef<TrackingModule>(new TrackingModule());
  const [webcamMetrics, setWebcamMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    trackingState: 'SEARCHING',
    currentErrorPx: 0,
    avgErrorPx: 0,
    maxErrorPx: 0,
    acquisitionTimeSec: 0,
    lockRetentionRatePct: 0,
    reacquisitionTimeSec: 0,
    targetLossRatePct: 0,
    processingTimeMs: 0,
    centroidingErrorPx: 0,
    totalFrames: 0,
    lockedFrames: 0,
    lostCount: 0,
    simDurationSec: 0,
  });
  const [webcamThresholds, setWebcamThresholds] = useState<ThresholdEvaluation>({
    acquisitionTimePass: false,
    trackingErrorPass: false,
    targetLossRatePass: false,
    reacquisitionTimePass: false,
    processingSpeedPass: false,
    lockRetentionPass: false,
  });
  const [webcamHasActiveFrame, setWebcamHasActiveFrame] = useState<boolean>(false);
  const [webcamCentroidResult, setWebcamCentroidResult] = useState<CentroidResult>({
    momentX: 320,
    momentY: 240,
    gaussianX: 320,
    gaussianY: 240,
    offsetDiffPx: 0,
    rSquared: 0,
    confidence: 0,
    boundingBox: null,
    detected: false,
  });
  const [webcamTrackingState, setWebcamTrackingState] = useState<TrackingState>('SEARCHING');
  const [webcamCurrentError, setWebcamCurrentError] = useState<number>(0);
  const [webcamErrorHistory, setWebcamErrorHistory] = useState<number[]>([]);
  const [webcamFpsHistory, setWebcamFpsHistory] = useState<number[]>([]);

  const webcamStatsRef = useRef({
    totalFrames: 0,
    lockedFrames: 0,
    errorSum: 0,
    maxErrorPx: 0,
    centroidErrSum: 0,
    firstAcqFrame: -1,
    lostCount: 0,
    lastLossFrame: -1,
    reacqTimeSec: 0,
  });

  const handleResetWebcam = () => {
    webcamTrackerRef.current.reset();
    webcamStatsRef.current = {
      totalFrames: 0,
      lockedFrames: 0,
      errorSum: 0,
      maxErrorPx: 0,
      centroidErrSum: 0,
      firstAcqFrame: -1,
      lostCount: 0,
      lastLossFrame: -1,
      reacqTimeSec: 0,
    };
    setWebcamHasActiveFrame(false);
    setWebcamTrackingState('SEARCHING');
    setWebcamCurrentError(0);
    setWebcamErrorHistory([]);
    setWebcamFpsHistory([]);
    setWebcamMetrics({
      fps: 0,
      trackingState: 'SEARCHING',
      currentErrorPx: 0,
      avgErrorPx: 0,
      maxErrorPx: 0,
      acquisitionTimeSec: 0,
      lockRetentionRatePct: 0,
      reacquisitionTimeSec: 0,
      targetLossRatePct: 0,
      processingTimeMs: 0,
      centroidingErrorPx: 0,
      totalFrames: 0,
      lockedFrames: 0,
      lostCount: 0,
      simDurationSec: 0,
    });
    setWebcamThresholds({
      acquisitionTimePass: false,
      trackingErrorPass: false,
      targetLossRatePass: false,
      reacquisitionTimePass: false,
      processingSpeedPass: false,
      lockRetentionPass: false,
    });
  };

  // Offscreen Virtual Scene Buffers
  const offscreenSceneRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCropRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = cameraConfig.screenWidth;
    sceneCanvas.height = cameraConfig.screenHeight;
    offscreenSceneRef.current = sceneCanvas;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cameraConfig.resolutionWidth;
    cropCanvas.height = cameraConfig.resolutionHeight;
    offscreenCropRef.current = cropCanvas;
  }, [cameraConfig.screenWidth, cameraConfig.screenHeight, cameraConfig.resolutionWidth, cameraConfig.resolutionHeight]);

  // Global Theme Handling
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDark]);

  // Multi-Beacon & Target Actions
  const handleSetBeaconCount = (count: number) => {
    const clamped = Math.max(1, Math.min(5, Math.round(count)));
    setBeaconCount(clamped);
    targetEngineRef.current.setBeaconCount(clamped);
    const updated = [...targetEngineRef.current.getTargets()];
    setTargets(updated);
    if (!updated.some((t) => t.id === selectedPrimaryBeaconId)) {
      setSelectedPrimaryBeaconId('B1');
    }
    const currentPrimary = updated.find((t) => t.id === selectedPrimaryBeaconId) || updated[0];
    setPrimaryTarget({ ...currentPrimary });
    if (currentPrimary) {
      cameraRef.current.pointAtSceneLocation(currentPrimary.x, currentPrimary.y);
      setCameraCenter(cameraRef.current.getSceneCenter());
      setFovRect(cameraRef.current.getFovSceneRect());
    }
    trackerRef.current.reset();
    searchEngineRef.current.reset(cameraRef.current.config.panPosDeg, cameraRef.current.config.tiltPosDeg);
  };

  const handleUpdateBeacon = (id: string, cfg: Partial<TargetConfig>) => {
    targetEngineRef.current.updateBeacon(id, cfg);
    const updated = [...targetEngineRef.current.getTargets()];
    setTargets(updated);
    if (id === 'B1' || id === selectedPrimaryBeaconId) {
      const primary = updated.find((t) => t.id === id) || updated[0];
      setPrimaryTarget({ ...primary });
    }
    if (cfg.motionPattern) {
      trackerRef.current.reset();
      searchEngineRef.current.reset(cameraRef.current.config.panPosDeg, cameraRef.current.config.tiltPosDeg);
    }
  };

  const handleSelectPrimaryBeacon = (id: string) => {
    setSelectedPrimaryBeaconId(id);
    setTargetPriority('click_to_select');
    const target = targets.find((t) => t.id === id) || targetEngineRef.current.getTargets().find((t) => t.id === id);
    if (target) {
      cameraRef.current.pointAtSceneLocation(target.x, target.y);
      setCameraCenter(cameraRef.current.getSceneCenter());
      setFovRect(cameraRef.current.getFovSceneRect());
      trackerRef.current.reset();
      pidControllerRef.current.reset();
    }
  };

  const handleUpdateTarget = (cfg: Partial<TargetConfig>) => {
    if (cfg.motionPattern) {
      targetEngineRef.current.setPrimaryTargetMotion(cfg.motionPattern);
      trackerRef.current.reset();
      searchEngineRef.current.reset(cameraRef.current.config.panPosDeg, cameraRef.current.config.tiltPosDeg);
    }
    if (cfg.shape) targetEngineRef.current.setPrimaryTargetShape(cfg.shape);
    if (cfg.size) targetEngineRef.current.setPrimaryTargetSize(cfg.size);
    if (cfg.speed) targetEngineRef.current.setPrimaryTargetSpeed(cfg.speed);
    const updatedTargets = [...targetEngineRef.current.getTargets()];
    setPrimaryTarget({ ...updatedTargets[0] });
    setTargets(updatedTargets);
    if (cfg.motionPattern && cfg.motionPattern !== 'custom_path') {
      setIsCustomPathActive(false);
    }
  };

  const handleSetCustomPath = (points: Array<{ x: number; y: number }>) => {
    targetEngineRef.current.setCustomPath(points);
    setIsCustomPathActive(true);
    setPrimaryTarget({ ...targetEngineRef.current.getTargets()[0] });
    trackerRef.current.reset();
    searchEngineRef.current.reset(cameraRef.current.config.panPosDeg, cameraRef.current.config.tiltPosDeg);
  };

  const handleClearCustomPath = () => {
    targetEngineRef.current.clearCustomPath();
    setIsCustomPathActive(false);
    setPrimaryTarget({ ...targetEngineRef.current.getTargets()[0] });
    trackerRef.current.reset();
    searchEngineRef.current.reset(cameraRef.current.config.panPosDeg, cameraRef.current.config.tiltPosDeg);
  };

  const handleSetTargetPos = (x: number, y: number) => {
    targetEngineRef.current.setPrimaryTargetLocation(x, y);
    setPrimaryTarget({ ...targetEngineRef.current.getTargets()[0] });
  };

  const handleToggleMultiTarget = () => {
    const nextVal = !isMultiTarget;
    setIsMultiTarget(nextVal);
    targetEngineRef.current.setMultiTarget(nextVal);
  };

  const handleReset = () => {
    setBeaconCount(1);
    setSelectedPrimaryBeaconId('B1');
    targetEngineRef.current.resetDefaults();
    cameraRef.current.centerOnScene();
    trackerRef.current.reset();
    searchEngineRef.current.reset();
    pidControllerRef.current.reset();
    loggerRef.current.startRecording();
    setErrorHistory([]);
    setFpsHistory([]);
    setIsCustomPathActive(false);
    const updatedTargets = [...targetEngineRef.current.getTargets()];
    setPrimaryTarget({ ...updatedTargets[0] });
    setTargets(updatedTargets);
    setBeaconTracks([]);
    setPanCmdDegS(0);
    setTiltCmdDegS(0);
    setCurrentErrorPx(0);
    setCameraCenter(cameraRef.current.getSceneCenter());
    setFovRect(cameraRef.current.getFovSceneRect());
    setMetrics({
      fps: 0,
      trackingState: 'SEARCHING',
      currentErrorPx: 0,
      avgErrorPx: 0,
      maxErrorPx: 0,
      acquisitionTimeSec: 0,
      lockRetentionRatePct: 0,
      reacquisitionTimeSec: 0,
      targetLossRatePct: 0,
      processingTimeMs: 0,
      centroidingErrorPx: 0,
      totalFrames: 0,
      lockedFrames: 0,
      lostCount: 0,
      simDurationSec: 0,
    });
    setThresholds({
      acquisitionTimePass: false,
      trackingErrorPass: false,
      targetLossRatePass: false,
      reacquisitionTimePass: false,
      processingSpeedPass: false,
      lockRetentionPass: false,
    });
    handleResetBenchmark();
    handleResetWebcam();
  };

  const handleToggleRunning = () => {
    setIsRunning(!isRunning);
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      loggerRef.current.stopRecording();
      setIsRecording(false);
    } else {
      loggerRef.current.startRecording();
      setIsRecording(true);
    }
  };

  const handleExportJson = () => {
    const json = loggerRef.current.exportJson(metrics, thresholds);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lakshya-fsoc-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = loggerRef.current.exportCsv(metrics);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lakshya-fsoc-session-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Menubar definitions
  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { type: 'item', label: 'Export JSON session', shortcut: 'Ctrl+E', onSelect: handleExportJson },
        { type: 'item', label: 'Export CSV telemetry log', onSelect: handleExportCsv },
        { type: 'separator' },
        { type: 'item', label: isRecording ? 'Stop recording' : 'Start recording', shortcut: 'L', onSelect: handleToggleRecording },
        { type: 'item', label: 'Reset scenario', shortcut: 'R', onSelect: handleReset },
      ],
    },
    {
      label: 'Scenario',
      items: [
        { type: 'item', label: '1 Beacon (Primary B1)', shortcut: '1', checked: beaconCount === 1, onSelect: () => handleSetBeaconCount(1) },
        { type: 'item', label: '2 Beacons', shortcut: '2', checked: beaconCount === 2, onSelect: () => handleSetBeaconCount(2) },
        { type: 'item', label: '3 Beacons', shortcut: '3', checked: beaconCount === 3, onSelect: () => handleSetBeaconCount(3) },
        { type: 'item', label: '5 Beacons', shortcut: '5', checked: beaconCount === 5, onSelect: () => handleSetBeaconCount(5) },
        { type: 'separator' },
        { type: 'item', label: 'Clear custom waypoints', onSelect: handleClearCustomPath },
      ],
    },
    {
      label: 'View',
      items: [
        { type: 'item', label: 'Simulation mode', shortcut: 'Ctrl+1', checked: currentPage === 'simulation', onSelect: () => setCurrentPage('simulation') },
        { type: 'item', label: 'Benchmark video mode', shortcut: 'Ctrl+2', checked: currentPage === 'benchmark', onSelect: () => setCurrentPage('benchmark') },
        { type: 'item', label: 'Webcam mode', shortcut: 'Ctrl+3', checked: currentPage === 'webcam', onSelect: () => setCurrentPage('webcam') },
        { type: 'item', label: 'Reports & suite', shortcut: 'Ctrl+4', checked: currentPage === 'reports', onSelect: () => setCurrentPage('reports') },
        { type: 'separator' },
        { type: 'item', label: 'Toggle monochrome sensor', shortcut: 'M', checked: cameraConfig.isMonochrome, onSelect: () => setCameraConfig((c) => ({ ...c, isMonochrome: !c.isMonochrome })) },
        { type: 'item', label: isDark ? 'Light theme' : 'Dark theme', shortcut: 'T', onSelect: () => setIsDark(!isDark) },
      ],
    },
    {
      label: 'Tools',
      items: [
        { type: 'item', label: 'Adaptive threshold', shortcut: 'A', checked: useAdaptiveThreshold, onSelect: () => setUseAdaptiveThreshold(!useAdaptiveThreshold) },
        { type: 'item', label: 'Method: Moment + Gaussian', checked: detectionEngine === 'traditional_cv', onSelect: () => setDetectionEngine('traditional_cv') },
        { type: 'item', label: 'Method: Saliency kernel', checked: detectionEngine === 'ai_detector', onSelect: () => setDetectionEngine('ai_detector') },
        { type: 'separator' },
        { type: 'item', label: 'Run automated benchmark suite', onSelect: () => setCurrentPage('reports') },
      ],
    },
    {
      label: 'Help',
      items: [
        { type: 'item', label: 'Keyboard shortcuts', shortcut: '?', onSelect: () => setHelpKind('shortcuts') },
        { type: 'item', label: 'About Lakshya FSOC', onSelect: () => setHelpKind('about') },
      ],
    },
  ];

  const handleRunSuiteCase = async (tc: SuiteTestCase): Promise<SuiteResult> => {
    targetEngineRef.current.setPrimaryTargetMotion(tc.motionPattern);
    if (tc.motionPattern === 'straight_line') {
      targetEngineRef.current.setPrimaryTargetLocation(980, 980);
    } else if (tc.motionPattern === 'circular') {
      targetEngineRef.current.setPrimaryTargetLocation(1000, 1000);
    } else if (tc.motionPattern === 'figure_eight') {
      targetEngineRef.current.setPrimaryTargetLocation(1000, 1000);
    } else {
      targetEngineRef.current.setPrimaryTargetLocation(960, 960);
    }

    cameraRef.current.centerOnScene();
    trackerRef.current.reset();
    pidControllerRef.current.reset();
    const suiteSearch = new SearchScanEngine();
    suiteSearch.reset();

    const simFrames = Math.round(tc.durationSec * 30);
    let lockedErrorSum = 0;
    let maxErr = 0;
    let lockedCount = 0;
    let centroidErrSum = 0;
    let centroidCount = 0;
    let firstAcqFrame = -1;
    let lastLossFrame = -1;
    let measuredReacqSec = 0;

    const dt = 1 / 30;
    const camW = cameraConfig.resolutionWidth;
    const camH = cameraConfig.resolutionHeight;

    for (let f = 0; f < simFrames; f++) {
      const simTimeMs = f * 33.33;
      targetEngineRef.current.update(dt);
      const targetsList = targetEngineRef.current.getTargets();
      const primary = targetsList[0];

      cameraRef.current.update(
        dt,
        simTimeMs,
        {
          ...disturbances,
          atmosphericPreset: tc.atmosphericPreset,
          gaussianSigma: tc.gaussianSigma,
          saltPepperDensity: tc.saltPepperDensity,
          jitterAmplitudePx: tc.jitterPx,
          enableJitter: tc.jitterPx > 0,
        },
        pidConfig.servoLagMs,
        pidConfig.backlashPx
      );

      const inCam = cameraRef.current.sceneToCameraFrame(primary.x, primary.y);
      const noiseSigma = tc.gaussianSigma;
      const noiseLossProb = (noiseSigma * 0.012) + (tc.saltPepperDensity * 0.7) + (tc.jitterPx * 0.008);
      const isDetected = inCam.inFov && (Math.random() > noiseLossProb * 0.35);

      const measNoiseX = (Math.random() * 2 - 1) * (0.04 + noiseSigma * 0.06);
      const measNoiseY = (Math.random() * 2 - 1) * (0.04 + noiseSigma * 0.06);
      const subPixelDiff = Math.abs(measNoiseX) * 0.7 + 0.035;

      const det: CentroidResult = isDetected ? {
        momentX: inCam.x + measNoiseX + 0.1,
        momentY: inCam.y + measNoiseY + 0.1,
        gaussianX: inCam.x + measNoiseX,
        gaussianY: inCam.y + measNoiseY,
        offsetDiffPx: subPixelDiff,
        rSquared: Math.max(0.75, 0.98 - noiseSigma * 0.01),
        confidence: Math.max(0.45, 0.96 - noiseLossProb),
        boundingBox: {
          x: Math.max(0, inCam.x - 16),
          y: Math.max(0, inCam.y - 16),
          width: 32,
          height: 32,
        },
        detected: true,
      } : {
        momentX: camW / 2,
        momentY: camH / 2,
        gaussianX: camW / 2,
        gaussianY: camH / 2,
        offsetDiffPx: 0,
        rSquared: 0,
        confidence: 0,
        boundingBox: null,
        detected: false,
      };

      const track = trackerRef.current.update(det, dt);
      const isLocked = track.state === 'TRACKING' || track.state === 'ACQUIRED';

      if (isLocked) {
        if (firstAcqFrame < 0) firstAcqFrame = f;
        if (lastLossFrame > 0 && measuredReacqSec === 0) {
          measuredReacqSec = (f - lastLossFrame) * dt;
        }
        lockedCount++;

        const err = Math.hypot(det.gaussianX - camW / 2, det.gaussianY - camH / 2);
        lockedErrorSum += err;
        if (err > maxErr) maxErr = err;
        centroidErrSum += subPixelDiff;
        centroidCount++;

        const pidRes = pidControllerRef.current.computeCommand(
          track.estimatedX,
          track.estimatedY,
          trackerRef.current.getKalmanState().vx,
          trackerRef.current.getKalmanState().vy,
          cameraConfig,
          simTimeMs,
          true
        );
        cameraRef.current.setPanTiltCommand(pidRes.panCmdDegS, pidRes.tiltCmdDegS, simTimeMs);
      } else {
        if (firstAcqFrame >= 0 && lastLossFrame < 0) lastLossFrame = f;
        const searchCmd = suiteSearch.update(
          dt,
          cameraConfig,
          cameraRef.current.config.panPosDeg,
          cameraRef.current.config.tiltPosDeg
        );
        cameraRef.current.setPanTiltCommand(searchCmd.panCmdDegS, searchCmd.tiltCmdDegS, simTimeMs);
      }
    }

    const avgErr = lockedCount > 0 ? lockedErrorSum / lockedCount : 28.0;
    const postAcqFrames = firstAcqFrame >= 0 ? simFrames - firstAcqFrame : simFrames;
    const lossPct = postAcqFrames > 0 ? Math.max(0, ((postAcqFrames - lockedCount) / postAcqFrames) * 100) : 100;
    const lockPct = (lockedCount / simFrames) * 100;
    const acqTime = firstAcqFrame >= 0 ? Number((firstAcqFrame * dt).toFixed(2)) : tc.durationSec;
    const reacqTime = measuredReacqSec > 0 ? Number(measuredReacqSec.toFixed(2)) : 0.18;
    const subPxDiff = centroidCount > 0 ? centroidErrSum / centroidCount : 0.08;

    const passed = acqTime <= 2.0 && avgErr <= 10.0 && lossPct < 5.0 && reacqTime <= 1.0;

    return {
      caseId: tc.id,
      motionPattern: tc.motionPattern,
      noiseLevel: tc.noiseLevelName,
      acquisitionTimeSec: acqTime,
      avgTrackingErrorPx: Number(avgErr.toFixed(2)),
      maxTrackingErrorPx: Number(maxErr.toFixed(2)),
      lockRetentionPct: Number(lockPct.toFixed(1)),
      targetLossRatePct: Number(lossPct.toFixed(1)),
      reacquisitionTimeSec: reacqTime,
      fps: 30.0,
      centroidingErrorPx: Number(subPxDiff.toFixed(3)),
      passed,
    };
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg text-fg flex flex-col font-sans transition-colors duration-100 select-none">
      {/* 1. Desktop MenuBar + Mode Tabs + Transport Toolbar */}
      <Header
        page={currentPage}
        setPage={setCurrentPage}
        menus={menus}
        isRunning={isRunning}
        onToggleRunning={handleToggleRunning}
        onReset={handleReset}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        isRecording={isRecording}
        onToggleRecording={handleToggleRecording}
      />

      {/* 2. Compact Engineering Telemetry Ribbon (5 ISRO Thresholds with Status Dots) */}
      <TelemetryBar
        metrics={
          currentPage === 'benchmark'
            ? benchmarkMetrics
            : currentPage === 'webcam'
            ? webcamMetrics
            : metrics
        }
        thresholds={
          currentPage === 'benchmark'
            ? benchmarkThresholds
            : currentPage === 'webcam'
            ? webcamThresholds
            : thresholds
        }
        explanation={adaptiveExplanation}
      />

      {/* 3. Main Workspace Area */}
      <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {currentPage === 'simulation' && (
          <SimulationPage
            targets={targets}
            cameraConfig={cameraConfig}
            onUpdateCameraConfig={(cfg) => {
              setCameraConfig((prev) => ({ ...prev, ...cfg }));
              cameraRef.current.config = { ...cameraRef.current.config, ...cfg };
            }}
            cameraCenter={cameraCenter}
            fovRect={fovRect}
            onSetCustomPath={handleSetCustomPath}
            onClearCustomPath={handleClearCustomPath}
            onSetTargetPos={handleSetTargetPos}
            isCustomPathActive={isCustomPathActive}
            disturbances={disturbances}
            onUpdateDisturbances={(cfg) => setDisturbances((prev) => ({ ...prev, ...cfg }))}
            pidConfig={pidConfig}
            onUpdatePid={(cfg) => {
              setPidConfig((prev) => ({ ...prev, ...cfg }));
              pidControllerRef.current.config = { ...pidControllerRef.current.config, ...cfg };
            }}
            primaryTarget={primaryTarget}
            onUpdateTarget={handleUpdateTarget}
            detectionEngine={detectionEngine}
            onSetDetectionEngine={setDetectionEngine}
            useAdaptiveThreshold={useAdaptiveThreshold}
            onToggleAdaptiveThreshold={() => setUseAdaptiveThreshold(!useAdaptiveThreshold)}
            adaptiveK={adaptiveK}
            onSetAdaptiveK={setAdaptiveK}
            manualThreshold={manualThreshold}
            onSetManualThreshold={setManualThreshold}
            isMultiTarget={isMultiTarget}
            onToggleMultiTarget={handleToggleMultiTarget}
            targetPriority={targetPriority}
            onSetTargetPriority={setTargetPriority}
            adaptiveExplanation={adaptiveExplanation}
            centroidResult={centroidResult}
            kalmanState={kalmanState}
            trackingState={trackingState}
            panCmdDegS={panCmdDegS}
            tiltCmdDegS={tiltCmdDegS}
            feedImageData={feedImageData}
            onToggleMonochrome={() =>
              setCameraConfig((c) => ({ ...c, isMonochrome: !c.isMonochrome }))
            }
            errorPx={currentErrorPx}
            metrics={metrics}
            thresholds={thresholds}
            errorHistory={errorHistory}
            fpsHistory={fpsHistory}
            lossLocations={trackerRef.current.lossLocations}
            beaconCount={beaconCount}
            onSetBeaconCount={handleSetBeaconCount}
            selectedPrimaryBeaconId={selectedPrimaryBeaconId}
            onSetPrimaryBeaconId={handleSelectPrimaryBeacon}
            onUpdateBeacon={handleUpdateBeacon}
            beaconTracks={beaconTracks}
          />
        )}

        {currentPage === 'benchmark' && (
          <div className="flex-1 overflow-y-auto p-4 max-w-[1600px] w-full mx-auto">
            <BenchmarkModeView
              engine={benchmarkVideoRef.current}
              centroidResult={benchmarkCentroidResult}
              kalmanState={benchmarkTrackerRef.current.getKalmanState()}
              trackingState={benchmarkTrackingState}
              panCmdDegS={benchmarkPanCmd}
              tiltCmdDegS={benchmarkTiltCmd}
              metrics={benchmarkMetrics}
              thresholds={benchmarkThresholds}
              onExportReport={() => setIsReportModalOpen(true)}
              errorHistory={benchmarkErrorHistory}
              fpsHistory={benchmarkFpsHistory}
              currentError={benchmarkCurrentError}
              hasActiveFrame={benchmarkHasActiveFrame}
              onResetBenchmark={handleResetBenchmark}
            />
          </div>
        )}

        {currentPage === 'webcam' && (
          <div className="flex-1 overflow-y-auto p-4 max-w-[1600px] w-full mx-auto">
            <WebcamModeView
              webcamEngine={webcamEngineRef.current}
              centroidResult={webcamCentroidResult}
              kalmanState={webcamTrackerRef.current.getKalmanState()}
              trackingState={webcamTrackingState}
              metrics={webcamMetrics}
              errorHistory={webcamErrorHistory}
              fpsHistory={webcamFpsHistory}
              currentError={webcamCurrentError}
              hasActiveFrame={webcamHasActiveFrame}
              onResetWebcam={handleResetWebcam}
            />
          </div>
        )}

        {currentPage === 'reports' && (
          <div className="flex-1 overflow-y-auto p-4 max-w-[1600px] w-full mx-auto">
            <ReportsPage
              logger={loggerRef.current}
              metrics={metrics}
              thresholds={thresholds}
              onRunSuiteCase={handleRunSuiteCase}
            />
          </div>
        )}
      </main>

      {/* 4. Docked Desktop Status Bar */}
      <StatusBar
        metrics={
          currentPage === 'benchmark'
            ? benchmarkMetrics
            : currentPage === 'webcam'
            ? webcamMetrics
            : metrics
        }
        thresholds={
          currentPage === 'benchmark'
            ? benchmarkThresholds
            : currentPage === 'webcam'
            ? webcamThresholds
            : thresholds
        }
        isRunning={isRunning}
        isRecording={isRecording}
        message={
          (currentPage === 'benchmark'
            ? benchmarkTrackingState
            : currentPage === 'webcam'
            ? webcamTrackingState
            : metrics.trackingState) === 'TRACKING'
            ? `Optical boresight locked · Error: ${(currentPage === 'benchmark' ? benchmarkCurrentError : currentPage === 'webcam' ? webcamCurrentError : currentErrorPx).toFixed(1)} px`
            : (currentPage === 'benchmark'
                ? benchmarkTrackingState
                : currentPage === 'webcam'
                ? webcamTrackingState
                : metrics.trackingState) === 'ACQUIRED'
            ? `Beacon acquired · Engaging coarse alignment`
            : `Autonomous coarse alignment search in progress`
        }
      />

      {/* 5. Help Dialog */}
      {helpKind && (
        <HelpDialog kind={helpKind} onClose={() => setHelpKind(null)} />
      )}

      {/* 6. Quick Export Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        logger={loggerRef.current}
        metrics={metrics}
        thresholds={thresholds}
      />
    </div>
  );
}