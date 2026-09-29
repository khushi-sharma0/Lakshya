/**
 * Virtual Pan-Tilt Camera Engine
 * Simulates mobile FSOC optical terminal gimbal dynamics:
 * - Real-world angular coordinates (deg) mapped to scene pixels
 * - Slew rate limits (5 - 10 deg/s max pan/tilt speed)
 * - Servo latency buffer & mechanical backlash
 * - Viewport cropping from 2000x2000 scene into camera resolution (640x480)
 */

import { CameraConfig, DisturbancesConfig } from '../types';

export class VirtualCamera {
  public config: CameraConfig;
  private pxPerDeg: number = 100; // 2000px corresponds to 20.0 deg field of regard

  // Actual physical camera position in degrees
  public currentPanDeg: number = 0;
  public currentTiltDeg: number = 0;

  // Commanded velocity (deg/s) from PID controller
  private panVelocityCmd: number = 0;
  private tiltVelocityCmd: number = 0;

  // Servo lag delay buffer (stores commanded changes with timestamps)
  private commandQueue: Array<{ time: number; panVel: number; tiltVel: number }> = [];

  // Mechanical backlash state
  private lastPanDir: number = 0;
  private lastTiltDir: number = 0;
  private backlashAccumPan: number = 0;
  private backlashAccumTilt: number = 0;

  // Cumulative disturbance offsets
  public jitterOffsetX: number = 0;
  public jitterOffsetY: number = 0;
  public platformOffsetX: number = 0;
  public platformOffsetY: number = 0;

  private platformTime: number = 0;

  constructor(config?: Partial<CameraConfig>) {
    this.config = {
      screenWidth: 2000,
      screenHeight: 2000,
      resolutionWidth: 640,
      resolutionHeight: 480,
      fovXDeg: 4.0,
      fovYDeg: 3.0,
      isMonochrome: true,
      updateRateHz: 30,
      panPosDeg: 0,
      tiltPosDeg: 0,
      maxPanSpeedDegS: 5.0,
      maxTiltSpeedDegS: 5.0,
      controlLoopHz: 20,
      ...config,
    };

    this.recomputeScale();
    this.centerOnScene();
  }

  public recomputeScale() {
    // Let total screen width represent 20 degrees Field of Regard (FOR)
    const totalFieldOfRegardDeg = 20.0;
    this.pxPerDeg = this.config.screenWidth / totalFieldOfRegardDeg;
  }

  public centerOnScene() {
    // Center of screen corresponds to (0 deg, 0 deg)
    this.currentPanDeg = 0;
    this.currentTiltDeg = 0;
    this.config.panPosDeg = 0;
    this.config.tiltPosDeg = 0;
    this.panVelocityCmd = 0;
    this.tiltVelocityCmd = 0;
    this.commandQueue = [];
    this.lastPanDir = 0;
    this.lastTiltDir = 0;
    this.backlashAccumPan = 0;
    this.backlashAccumTilt = 0;
  }

  /**
   * Immediately re-centers or aligns camera gimbal FOV directly over a specified scene coordinate
   */
  public pointAtSceneLocation(sceneX: number, sceneY: number) {
    const pxPerDeg = this.pxPerDeg > 0 ? this.pxPerDeg : 100;
    const targetPan = (sceneX - this.config.screenWidth / 2) / pxPerDeg;
    const targetTilt = (sceneY - this.config.screenHeight / 2) / pxPerDeg;
    this.currentPanDeg = Math.max(-10, Math.min(10, targetPan));
    this.currentTiltDeg = Math.max(-10, Math.min(10, targetTilt));
    this.config.panPosDeg = this.currentPanDeg;
    this.config.tiltPosDeg = this.currentTiltDeg;
    this.panVelocityCmd = 0;
    this.tiltVelocityCmd = 0;
    this.commandQueue = [];
  }

  public setPanTiltCommand(panVelDegS: number, tiltVelDegS: number, currentTimeMs: number) {
    const validPan = Number.isFinite(panVelDegS) ? panVelDegS : 0;
    const validTilt = Number.isFinite(tiltVelDegS) ? tiltVelDegS : 0;
    const validTime = Number.isFinite(currentTimeMs) ? currentTimeMs : performance.now();

    if (this.commandQueue.length > 20) {
      this.commandQueue.shift();
    }
    this.commandQueue.push({
      time: validTime,
      panVel: validPan,
      tiltVel: validTilt,
    });
  }

  /**
   * Update camera position under slew rate limits, servo lag, backlash, and platform disturbances
   */
  public update(
    dt: number,
    currentTimeMs: number,
    disturbances: DisturbancesConfig,
    servoLagMs: number = 0,
    backlashPx: number = 0
  ) {
    // Clamp dt to a safe, stable range (1/120s to 1/15s)
    const safeDt = Number.isFinite(dt) ? Math.max(1 / 120, Math.min(1 / 15, dt)) : 1 / 30;
    const safeTime = Number.isFinite(currentTimeMs) ? currentTimeMs : performance.now();

    // 1. Process servo latency queue
    if (servoLagMs <= 0) {
      if (this.commandQueue.length > 0) {
        const latest = this.commandQueue[this.commandQueue.length - 1];
        this.panVelocityCmd = Number.isFinite(latest.panVel) ? latest.panVel : 0;
        this.tiltVelocityCmd = Number.isFinite(latest.tiltVel) ? latest.tiltVel : 0;
        this.commandQueue = [];
      }
    } else {
      while (this.commandQueue.length > 0) {
        if (safeTime - this.commandQueue[0].time >= servoLagMs) {
          const cmd = this.commandQueue.shift()!;
          this.panVelocityCmd = Number.isFinite(cmd.panVel) ? cmd.panVel : 0;
          this.tiltVelocityCmd = Number.isFinite(cmd.tiltVel) ? cmd.tiltVel : 0;
        } else {
          break;
        }
      }
    }

    if (!Number.isFinite(this.panVelocityCmd)) this.panVelocityCmd = 0;
    if (!Number.isFinite(this.tiltVelocityCmd)) this.tiltVelocityCmd = 0;

    // 2. Enforce slew rate constraints (max speed 5-10 deg/s)
    const maxPan = Number.isFinite(this.config.maxPanSpeedDegS) ? this.config.maxPanSpeedDegS : 5.0;
    const maxTilt = Number.isFinite(this.config.maxTiltSpeedDegS) ? this.config.maxTiltSpeedDegS : 5.0;

    const clampedPanVel = Math.max(-maxPan, Math.min(maxPan, this.panVelocityCmd));
    const clampedTiltVel = Math.max(-maxTilt, Math.min(maxTilt, this.tiltVelocityCmd));

    // 3. Servo backlash simulation
    const pxPerDeg = this.pxPerDeg > 0 ? this.pxPerDeg : 100;
    const backlashDeg = (backlashPx || 0) / pxPerDeg;
    let deltaPan = clampedPanVel * safeDt;
    let deltaTilt = clampedTiltVel * safeDt;

    if (backlashDeg > 0 && Math.abs(clampedPanVel) > 0.001) {
      const panDir = Math.sign(clampedPanVel);
      if (panDir !== 0 && panDir !== this.lastPanDir) {
        this.lastPanDir = panDir;
        this.backlashAccumPan = 0;
      }
      if (this.backlashAccumPan < backlashDeg) {
        const needed = backlashDeg - this.backlashAccumPan;
        const take = Math.min(Math.abs(deltaPan), needed);
        this.backlashAccumPan += take;
        deltaPan = Math.sign(deltaPan) * (Math.abs(deltaPan) - take);
      }

      const tiltDir = Math.sign(clampedTiltVel);
      if (tiltDir !== 0 && tiltDir !== this.lastTiltDir) {
        this.lastTiltDir = tiltDir;
        this.backlashAccumTilt = 0;
      }
      if (this.backlashAccumTilt < backlashDeg) {
        const needed = backlashDeg - this.backlashAccumTilt;
        const take = Math.min(Math.abs(deltaTilt), needed);
        this.backlashAccumTilt += take;
        deltaTilt = Math.sign(deltaTilt) * (Math.abs(deltaTilt) - take);
      }
    }

    if (!Number.isFinite(this.currentPanDeg)) this.currentPanDeg = 0;
    if (!Number.isFinite(this.currentTiltDeg)) this.currentTiltDeg = 0;

    this.currentPanDeg += Number.isFinite(deltaPan) ? deltaPan : 0;
    this.currentTiltDeg += Number.isFinite(deltaTilt) ? deltaTilt : 0;

    // Constrain pan/tilt strictly within scene limits so FOV box stays fully inside 2000x2000
    const fovW = this.config.fovXDeg * pxPerDeg;
    const fovH = this.config.fovYDeg * pxPerDeg;
    const maxPanAngle = Math.max(0, (this.config.screenWidth / 2 - fovW / 2) / pxPerDeg);
    const maxTiltAngle = Math.max(0, (this.config.screenHeight / 2 - fovH / 2) / pxPerDeg);

    this.currentPanDeg = Math.max(-maxPanAngle, Math.min(maxPanAngle, this.currentPanDeg));
    this.currentTiltDeg = Math.max(-maxTiltAngle, Math.min(maxTiltAngle, this.currentTiltDeg));

    this.config.panPosDeg = this.currentPanDeg;
    this.config.tiltPosDeg = this.currentTiltDeg;

    // 4. Update Jitter disturbance (± 20 px/frame max)
    if (disturbances.enableJitter) {
      const maxJitter = Math.min(20, Math.max(0, disturbances.jitterAmplitudePx));
      this.jitterOffsetX = (Math.random() * 2 - 1) * maxJitter;
      this.jitterOffsetY = (Math.random() * 2 - 1) * maxJitter;
    } else {
      this.jitterOffsetX = 0;
      this.jitterOffsetY = 0;
    }

    // 5. Update Platform Motion disturbance (± 20 px/frame max)
    if (disturbances.enablePlatformMotion) {
      this.platformTime += safeDt * (disturbances.platformSpeed || 1.0);
      const amp = Math.min(20, Math.max(0, disturbances.platformAmplitudePx));
      switch (disturbances.platformMotionType) {
        case 'linear':
          this.platformOffsetX = Math.sin(this.platformTime * 1.5) * amp;
          this.platformOffsetY = Math.cos(this.platformTime * 1.5) * amp * 0.5;
          break;
        case 'circular':
          this.platformOffsetX = Math.cos(this.platformTime * 2.0) * amp;
          this.platformOffsetY = Math.sin(this.platformTime * 2.0) * amp;
          break;
        case 'random':
          this.platformOffsetX += (Math.random() * 2 - 1) * amp * safeDt * 5;
          this.platformOffsetY += (Math.random() * 2 - 1) * amp * safeDt * 5;
          this.platformOffsetX = Math.max(-amp, Math.min(amp, this.platformOffsetX));
          this.platformOffsetY = Math.max(-amp, Math.min(amp, this.platformOffsetY));
          break;
        case 'spiral': {
          const r = ((this.platformTime % 5) / 5) * amp;
          this.platformOffsetX = Math.cos(this.platformTime * 3) * r;
          this.platformOffsetY = Math.sin(this.platformTime * 3) * r;
          break;
        }
        case 'figure_eight':
          this.platformOffsetX = Math.sin(this.platformTime * 1.8) * amp;
          this.platformOffsetY = Math.sin(this.platformTime * 3.6) * (amp * 0.7);
          break;
      }
    } else {
      this.platformOffsetX = 0;
      this.platformOffsetY = 0;
    }
  }

  /**
   * Returns current camera center in scene coordinates (pixels), clamped so FOV stays fully inside scene
   */
  public getSceneCenter(): { x: number; y: number } {
    const pxPerDeg = this.pxPerDeg > 0 ? this.pxPerDeg : 100;
    const safePan = Number.isFinite(this.currentPanDeg) ? this.currentPanDeg : 0;
    const safeTilt = Number.isFinite(this.currentTiltDeg) ? this.currentTiltDeg : 0;

    const baseX = this.config.screenWidth / 2 + safePan * pxPerDeg;
    const baseY = this.config.screenHeight / 2 + safeTilt * pxPerDeg;

    let x = baseX + (Number.isFinite(this.platformOffsetX) ? this.platformOffsetX : 0) + (Number.isFinite(this.jitterOffsetX) ? this.jitterOffsetX : 0);
    let y = baseY + (Number.isFinite(this.platformOffsetY) ? this.platformOffsetY : 0) + (Number.isFinite(this.jitterOffsetY) ? this.jitterOffsetY : 0);

    const fovW = this.config.fovXDeg * pxPerDeg;
    const fovH = this.config.fovYDeg * pxPerDeg;

    // Clamp FOV center so box always stays fully inside scene bounds [0..screenWidth, 0..screenHeight]
    const minX = fovW / 2;
    const maxX = this.config.screenWidth - fovW / 2;
    const minY = fovH / 2;
    const maxY = this.config.screenHeight - fovH / 2;

    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));

    return { x, y };
  }

  /**
   * Returns FOV rectangle bounds in virtual scene coordinates, strictly bounded inside scene
   */
  public getFovSceneRect(): { x: number; y: number; width: number; height: number } {
    const pxPerDeg = this.pxPerDeg > 0 ? this.pxPerDeg : 100;
    const width = this.config.fovXDeg * pxPerDeg;
    const height = this.config.fovYDeg * pxPerDeg;
    const center = this.getSceneCenter();

    const x = Math.max(0, Math.min(this.config.screenWidth - width, center.x - width / 2));
    const y = Math.max(0, Math.min(this.config.screenHeight - height, center.y - height / 2));

    return {
      x,
      y,
      width,
      height,
    };
  }

  /**
   * Convert scene point (x, y) to Camera Frame pixel coordinate [0..resolutionWidth, 0..resolutionHeight]
   */
  public sceneToCameraFrame(sceneX: number, sceneY: number): { x: number; y: number; inFov: boolean } {
    const fovRect = this.getFovSceneRect();
    const relX = (sceneX - fovRect.x) / fovRect.width;
    const relY = (sceneY - fovRect.y) / fovRect.height;

    const camX = relX * this.config.resolutionWidth;
    const camY = relY * this.config.resolutionHeight;

    const inFov = camX >= 0 && camX <= this.config.resolutionWidth && camY >= 0 && camY <= this.config.resolutionHeight;

    return { x: camX, y: camY, inFov };
  }

  /**
   * Convert camera frame pixel displacement from center into angular error in degrees
   */
  public cameraErrorToAngularError(errXCamPx: number, errYCamPx: number): { panErrorDeg: number; tiltErrorDeg: number } {
    const panErrorDeg = (errXCamPx / this.config.resolutionWidth) * this.config.fovXDeg;
    const tiltErrorDeg = (errYCamPx / this.config.resolutionHeight) * this.config.fovYDeg;
    return { panErrorDeg, tiltErrorDeg };
  }

  public getPxPerDeg(): number {
    return this.pxPerDeg;
  }
}
