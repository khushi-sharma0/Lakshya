import { VirtualCamera } from './src/core/camera';
import { TargetEngine } from './src/core/targetEngine';
import { TrackingModule } from './src/core/tracker';
import { PidController } from './src/core/controller';
import { DetectionModule } from './src/core/detection';

console.log('=== VERIFYING YELLOW BOX GIMBAL TRACKING BEACON ===');

const camera = new VirtualCamera();
const targetEngine = new TargetEngine(2000, 2000);
const tracker = new TrackingModule();
const pid = new PidController();

const patterns = ['straight_line', 'circular', 'figure_eight'] as const;

for (const pattern of patterns) {
  console.log(`\nTesting motion pattern: ${pattern}`);
  targetEngine.setPrimaryTargetMotion(pattern);
  camera.centerOnScene();
  tracker.reset();
  pid.reset();

  const dt = 1 / 30;
  let framesLocked = 0;
  let maxErrorPx = 0;
  let totalErrorSum = 0;

  for (let frame = 0; frame < 300; frame++) {
    const simTimeMs = frame * 33.33;
    targetEngine.update(dt);
    const targets = targetEngine.getTargets();
    const primaryTarget = targets[0];

    // Camera center and FOV
    const camCenter = camera.getSceneCenter();
    const fovRect = camera.getFovSceneRect();

    // Beacon position in camera sensor frame
    const inCam = camera.sceneToCameraFrame(primaryTarget.x, primaryTarget.y);

    const detections = inCam.inFov ? [{
      momentX: inCam.x,
      momentY: inCam.y,
      gaussianX: inCam.x,
      gaussianY: inCam.y,
      offsetDiffPx: 0.05,
      rSquared: 0.99,
      confidence: 0.95,
      boundingBox: { x: inCam.x - 10, y: inCam.y - 10, width: 20, height: 20 },
      detected: true,
    }] : [];

    const { primaryTrack } = tracker.updateMulti(
      detections,
      dt,
      targets,
      'brightest',
      'B1',
      320,
      240
    );

    const isLocked = primaryTrack.state === 'TRACKING';
    let panCmd = 0;
    let tiltCmd = 0;

    if (isLocked && frame > 45) {
      framesLocked++;
      const pidRes = pid.computeCommand(
        primaryTrack.estimatedX,
        primaryTrack.estimatedY,
        primaryTrack.vx,
        primaryTrack.vy,
        camera.config,
        simTimeMs,
        true
      );
      panCmd = pidRes.panCmdDegS;
      tiltCmd = pidRes.tiltCmdDegS;

      const opticalErr = pidRes.errorPx;
      maxErrorPx = Math.max(maxErrorPx, opticalErr);
      totalErrorSum += opticalErr;
    } else if (isLocked) {
      const pidRes = pid.computeCommand(
        primaryTrack.estimatedX,
        primaryTrack.estimatedY,
        primaryTrack.vx,
        primaryTrack.vy,
        camera.config,
        simTimeMs,
        true
      );
      panCmd = pidRes.panCmdDegS;
      tiltCmd = pidRes.tiltCmdDegS;
    } else {
      // Slew directly toward beacon
      const sceneDx = primaryTarget.x - camCenter.x;
      const sceneDy = primaryTarget.y - camCenter.y;
      panCmd = Math.max(-5, Math.min(5, (sceneDx / 100) * 4.5));
      tiltCmd = Math.max(-5, Math.min(5, (sceneDy / 100) * 4.5));
    }

    camera.setPanTiltCommand(panCmd, tiltCmd, simTimeMs);
    camera.update(dt, simTimeMs, {
      enableSaltPepper: false,
      saltPepperDensity: 0,
      enableGaussian: false,
      gaussianSigma: 0,
      enablePoisson: false,
      poissonIntensity: 0,
      enableJitter: false,
      jitterAmplitudePx: 0,
      atmosphericPreset: 'clear',
      atmosphericIntensity: 0.5,
      enablePlatformMotion: false,
      platformMotionType: 'circular',
      platformAmplitudePx: 0,
      platformSpeed: 1,
    });

    // Check distance between yellow box center (camera center) and beacon
    const finalCamCenter = camera.getSceneCenter();
    const distScenePx = Math.hypot(finalCamCenter.x - primaryTarget.x, finalCamCenter.y - primaryTarget.y);

    if (frame === 30) {
      console.log(`    At 1.0s, distance to beacon: ${distScenePx.toFixed(1)} px (inside FOV 400x300)`);
    }

    if (frame > 45) {
      // After initial slew/intercept, beacon must be tightly tracked inside FOV box
      if (distScenePx > 120) {
        console.error(`Yellow box drifted away from beacon at frame ${frame}! Distance = ${distScenePx} px`);
        process.exit(1);
      }
    }
  }

  const avgLockedError = framesLocked > 0 ? totalErrorSum / framesLocked : 999;
  console.log(`  Frames locked: ${framesLocked} / 300 (${((framesLocked/300)*100).toFixed(1)}%)`);
  console.log(`  Avg optical error: ${avgLockedError.toFixed(2)} px (Requirement: <= 10.0 px)`);
  console.log(`  Max optical error: ${maxErrorPx.toFixed(2)} px`);

  const retentionPct = (framesLocked / 254) * 100;
  if (retentionPct >= 85.0 && avgLockedError <= 10.0) {
    console.log(`  >>> [PASS] Yellow box tightly follows beacon on ${pattern}! (Retention: ${retentionPct.toFixed(1)}%, Error: ${avgLockedError.toFixed(2)} px <= 10.0 px)`);
  } else {
    console.error(`  >>> [FAIL] Poor tracking on ${pattern}`);
    process.exit(1);
  }
}

console.log('\nALL YELLOW BOX TRACKING TESTS PASSED PERFECTLY!');
