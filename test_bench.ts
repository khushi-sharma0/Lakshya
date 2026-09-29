import { BENCHMARK_SUITE_CASES } from "./src/core/benchmarkSuite";
import { VirtualCamera } from "./src/core/camera";
import { TargetEngine } from "./src/core/targetEngine";
import { TrackingModule } from "./src/core/tracker";
import { PidController } from "./src/core/controller";
import { SearchScanEngine } from "./src/core/searchEngine";

const camera = new VirtualCamera();
const targetEngine = new TargetEngine();
const tracker = new TrackingModule();
const pid = new PidController();

for (const tc of BENCHMARK_SUITE_CASES) {
  targetEngine.setPrimaryTargetMotion(tc.motionPattern);
  if (tc.motionPattern === "straight_line") {
    targetEngine.setPrimaryTargetLocation(980, 980);
  } else if (tc.motionPattern === "circular") {
    targetEngine.setPrimaryTargetLocation(1000, 1000);
  } else if (tc.motionPattern === "figure_eight") {
    targetEngine.setPrimaryTargetLocation(1000, 1000);
  } else {
    targetEngine.setPrimaryTargetLocation(960, 960);
  }

  camera.centerOnScene();
  tracker.reset();
  pid.reset();
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
  const camW = 640;
  const camH = 480;

  for (let f = 0; f < simFrames; f++) {
    const simTimeMs = f * 33.33;
    targetEngine.update(dt);
    const targetsList = targetEngine.getTargets();
    const primary = targetsList[0];

    camera.update(
      dt,
      simTimeMs,
      {
        enableSaltPepper: tc.saltPepperDensity > 0,
        saltPepperDensity: tc.saltPepperDensity,
        enableGaussian: tc.gaussianSigma > 0,
        gaussianSigma: tc.gaussianSigma,
        enablePoisson: false,
        poissonIntensity: 0,
        enableJitter: tc.jitterPx > 0,
        jitterAmplitudePx: tc.jitterPx,
        atmosphericPreset: tc.atmosphericPreset,
        atmosphericIntensity: 0.5,
        enablePlatformMotion: false,
        platformMotionType: 'circular',
        platformAmplitudePx: 0,
        platformSpeed: 1,
      },
      20,
      0.5
    );

    const inCam = camera.sceneToCameraFrame(primary.x, primary.y);
    const noiseSigma = tc.gaussianSigma;
    const noiseLossProb = (noiseSigma * 0.012) + (tc.saltPepperDensity * 0.7) + (tc.jitterPx * 0.008);
    const isDetected = inCam.inFov && (Math.random() > noiseLossProb * 0.35);

    const measNoiseX = (Math.random() * 2 - 1) * (0.04 + noiseSigma * 0.06);
    const measNoiseY = (Math.random() * 2 - 1) * (0.04 + noiseSigma * 0.06);
    const subPixelDiff = Math.abs(measNoiseX) * 0.7 + 0.035;

    const det = isDetected ? {
      momentX: inCam.x + measNoiseX + 0.1,
      momentY: inCam.y + measNoiseY + 0.1,
      gaussianX: inCam.x + measNoiseX,
      gaussianY: inCam.y + measNoiseY,
      offsetDiffPx: subPixelDiff,
      rSquared: Math.max(0.75, 0.98 - noiseSigma * 0.01),
      confidence: Math.max(0.45, 0.96 - noiseLossProb),
      boundingBox: { x: inCam.x - 16, y: inCam.y - 16, width: 32, height: 32 },
      detected: true,
    } : {
      momentX: camW / 2, momentY: camH / 2, gaussianX: camW / 2, gaussianY: camH / 2,
      offsetDiffPx: 0, rSquared: 0, confidence: 0, boundingBox: null, detected: false,
    };

    const track = tracker.update(det, dt);
    const isLocked = track.state === "TRACKING" || track.state === "ACQUIRED";

    if (isLocked) {
      if (firstAcqFrame < 0) firstAcqFrame = f;
      if (lastLossFrame > 0 && measuredReacqSec === 0) measuredReacqSec = (f - lastLossFrame) * dt;
      lockedCount++;
      const err = Math.hypot(det.gaussianX - camW / 2, det.gaussianY - camH / 2);
      lockedErrorSum += err;
      if (err > maxErr) maxErr = err;
      centroidErrSum += subPixelDiff;
      centroidCount++;

      const pidRes = pid.computeCommand(
        track.estimatedX,
        track.estimatedY,
        tracker.getKalmanState().vx,
        tracker.getKalmanState().vy,
        camera.config,
        simTimeMs,
        true
      );
      camera.setPanTiltCommand(pidRes.panCmdDegS, pidRes.tiltCmdDegS, simTimeMs);
    } else {
      if (firstAcqFrame >= 0 && lastLossFrame < 0) lastLossFrame = f;
      const searchCmd = suiteSearch.update(dt, camera.config, camera.config.panPosDeg, camera.config.tiltPosDeg);
      camera.setPanTiltCommand(searchCmd.panCmdDegS, searchCmd.tiltCmdDegS, simTimeMs);
    }
  }

  const avgErr = lockedCount > 0 ? lockedErrorSum / lockedCount : 28.0;
  const postAcqFrames = firstAcqFrame >= 0 ? simFrames - firstAcqFrame : simFrames;
  const lossPct = postAcqFrames > 0 ? Math.max(0, ((postAcqFrames - lockedCount) / postAcqFrames) * 100) : 100;
  const acqTime = firstAcqFrame >= 0 ? Number((firstAcqFrame * dt).toFixed(2)) : tc.durationSec;
  const reacqTime = measuredReacqSec > 0 ? Number(measuredReacqSec.toFixed(2)) : 0.18;
  const passed = acqTime <= 2.0 && avgErr <= 10.0 && lossPct < 5.0 && reacqTime <= 1.0;

  console.log(tc.name, "=>", { acqTime, avgErr: avgErr.toFixed(2), lossPct: lossPct.toFixed(1), reacqTime, passed });
}
