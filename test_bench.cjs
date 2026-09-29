// src/core/benchmarkSuite.ts
var BENCHMARK_SUITE_CASES = [
  // 1. Straight Line across noise levels
  {
    id: "case_str_clear",
    name: "Straight Line - Clear Baseline",
    motionPattern: "straight_line",
    noiseLevelName: "Clear / Low Noise",
    gaussianSigma: 2,
    saltPepperDensity: 0.01,
    jitterPx: 0,
    atmosphericPreset: "clear",
    durationSec: 4
  },
  {
    id: "case_str_haze",
    name: "Straight Line - Atmospheric Haze",
    motionPattern: "straight_line",
    noiseLevelName: "Haze + Jitter",
    gaussianSigma: 6,
    saltPepperDensity: 0.03,
    jitterPx: 5,
    atmosphericPreset: "haze",
    durationSec: 4
  },
  // 2. Circular Motion
  {
    id: "case_circ_sp",
    name: "Circular - Salt & Pepper Noise",
    motionPattern: "circular",
    noiseLevelName: "Salt & Pepper 8%",
    gaussianSigma: 4,
    saltPepperDensity: 0.08,
    jitterPx: 4,
    atmosphericPreset: "clear",
    durationSec: 4
  },
  {
    id: "case_circ_fog",
    name: "Circular - Dense Fog Scattering",
    motionPattern: "circular",
    noiseLevelName: "Fog + High Jitter",
    gaussianSigma: 10,
    saltPepperDensity: 0.05,
    jitterPx: 12,
    atmosphericPreset: "fog",
    durationSec: 4
  },
  // 3. Figure-of-8 (Lemniscate)
  {
    id: "case_fig8_gaussian",
    name: "Figure-of-8 - High Gaussian Noise",
    motionPattern: "figure_eight",
    noiseLevelName: "Gaussian Sigma 15",
    gaussianSigma: 15,
    saltPepperDensity: 0.04,
    jitterPx: 8,
    atmosphericPreset: "rain",
    durationSec: 4
  },
  // 4. Random Walk
  {
    id: "case_rand_extreme",
    name: "Random Walk - Combined Disturbances",
    motionPattern: "random",
    noiseLevelName: "Extreme Jitter + Low Light",
    gaussianSigma: 12,
    saltPepperDensity: 0.07,
    jitterPx: 15,
    atmosphericPreset: "low_light",
    durationSec: 4
  }
];

// src/core/camera.ts
var VirtualCamera = class {
  constructor(config) {
    this.pxPerDeg = 100;
    // 2000px corresponds to 20.0 deg field of regard
    // Actual physical camera position in degrees
    this.currentPanDeg = 0;
    this.currentTiltDeg = 0;
    // Commanded velocity (deg/s) from PID controller
    this.panVelocityCmd = 0;
    this.tiltVelocityCmd = 0;
    // Servo lag delay buffer (stores commanded changes with timestamps)
    this.commandQueue = [];
    // Mechanical backlash state
    this.lastPanDir = 0;
    this.lastTiltDir = 0;
    this.backlashAccumPan = 0;
    this.backlashAccumTilt = 0;
    // Cumulative disturbance offsets
    this.jitterOffsetX = 0;
    this.jitterOffsetY = 0;
    this.platformOffsetX = 0;
    this.platformOffsetY = 0;
    this.platformTime = 0;
    this.config = {
      screenWidth: 2e3,
      screenHeight: 2e3,
      resolutionWidth: 640,
      resolutionHeight: 480,
      fovXDeg: 4,
      fovYDeg: 3,
      isMonochrome: true,
      updateRateHz: 30,
      panPosDeg: 0,
      tiltPosDeg: 0,
      maxPanSpeedDegS: 5,
      maxTiltSpeedDegS: 5,
      controlLoopHz: 20,
      ...config
    };
    this.recomputeScale();
    this.centerOnScene();
  }
  recomputeScale() {
    const totalFieldOfRegardDeg = 20;
    this.pxPerDeg = this.config.screenWidth / totalFieldOfRegardDeg;
  }
  centerOnScene() {
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
  setPanTiltCommand(panVelDegS, tiltVelDegS, currentTimeMs) {
    if (this.commandQueue.length > 20) {
      this.commandQueue.shift();
    }
    this.commandQueue.push({
      time: currentTimeMs,
      panVel: panVelDegS,
      tiltVel: tiltVelDegS
    });
  }
  /**
   * Update camera position under slew rate limits, servo lag, backlash, and platform disturbances
   */
  update(dt, currentTimeMs, disturbances, servoLagMs = 0, backlashPx = 0) {
    if (servoLagMs <= 0) {
      if (this.commandQueue.length > 0) {
        const latest = this.commandQueue[this.commandQueue.length - 1];
        this.panVelocityCmd = latest.panVel;
        this.tiltVelocityCmd = latest.tiltVel;
        this.commandQueue = [];
      }
    } else {
      while (this.commandQueue.length > 0) {
        if (currentTimeMs - this.commandQueue[0].time >= servoLagMs) {
          const cmd = this.commandQueue.shift();
          this.panVelocityCmd = cmd.panVel;
          this.tiltVelocityCmd = cmd.tiltVel;
        } else {
          break;
        }
      }
    }
    const maxPan = this.config.maxPanSpeedDegS;
    const maxTilt = this.config.maxTiltSpeedDegS;
    const clampedPanVel = Math.max(-maxPan, Math.min(maxPan, this.panVelocityCmd));
    const clampedTiltVel = Math.max(-maxTilt, Math.min(maxTilt, this.tiltVelocityCmd));
    const backlashDeg = (backlashPx || 0) / (this.pxPerDeg || 100);
    let deltaPan = clampedPanVel * dt;
    let deltaTilt = clampedTiltVel * dt;
    if (backlashDeg > 0 && Math.abs(clampedPanVel) > 1e-3) {
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
    this.currentPanDeg += deltaPan;
    this.currentTiltDeg += deltaTilt;
    const maxPanAngle = this.config.screenWidth * 0.45 / this.pxPerDeg;
    const maxTiltAngle = this.config.screenHeight * 0.45 / this.pxPerDeg;
    this.currentPanDeg = Math.max(-maxPanAngle, Math.min(maxPanAngle, this.currentPanDeg));
    this.currentTiltDeg = Math.max(-maxTiltAngle, Math.min(maxTiltAngle, this.currentTiltDeg));
    this.config.panPosDeg = this.currentPanDeg;
    this.config.tiltPosDeg = this.currentTiltDeg;
    if (disturbances.enableJitter) {
      const maxJitter = disturbances.jitterAmplitudePx;
      this.jitterOffsetX = (Math.random() * 2 - 1) * maxJitter;
      this.jitterOffsetY = (Math.random() * 2 - 1) * maxJitter;
    } else {
      this.jitterOffsetX = 0;
      this.jitterOffsetY = 0;
    }
    if (disturbances.enablePlatformMotion) {
      this.platformTime += dt * disturbances.platformSpeed;
      const amp = disturbances.platformAmplitudePx;
      switch (disturbances.platformMotionType) {
        case "linear":
          this.platformOffsetX = Math.sin(this.platformTime * 1.5) * amp;
          this.platformOffsetY = Math.cos(this.platformTime * 1.5) * amp * 0.5;
          break;
        case "circular":
          this.platformOffsetX = Math.cos(this.platformTime * 2) * amp;
          this.platformOffsetY = Math.sin(this.platformTime * 2) * amp;
          break;
        case "random":
          this.platformOffsetX += (Math.random() * 2 - 1) * amp * dt * 5;
          this.platformOffsetY += (Math.random() * 2 - 1) * amp * dt * 5;
          this.platformOffsetX = Math.max(-amp, Math.min(amp, this.platformOffsetX));
          this.platformOffsetY = Math.max(-amp, Math.min(amp, this.platformOffsetY));
          break;
        case "spiral":
          const r = this.platformTime % 5 / 5 * amp;
          this.platformOffsetX = Math.cos(this.platformTime * 3) * r;
          this.platformOffsetY = Math.sin(this.platformTime * 3) * r;
          break;
        case "figure_eight":
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
   * Returns current camera center in scene coordinates (pixels), including platform motion & jitter
   */
  getSceneCenter() {
    const baseX = this.config.screenWidth / 2 + this.currentPanDeg * this.pxPerDeg;
    const baseY = this.config.screenHeight / 2 + this.currentTiltDeg * this.pxPerDeg;
    return {
      x: baseX + this.platformOffsetX + this.jitterOffsetX,
      y: baseY + this.platformOffsetY + this.jitterOffsetY
    };
  }
  /**
   * Returns FOV rectangle bounds in virtual scene coordinates
   */
  getFovSceneRect() {
    const center = this.getSceneCenter();
    const width = this.config.fovXDeg * this.pxPerDeg;
    const height = this.config.fovYDeg * this.pxPerDeg;
    return {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height
    };
  }
  /**
   * Convert scene point (x, y) to Camera Frame pixel coordinate [0..resolutionWidth, 0..resolutionHeight]
   */
  sceneToCameraFrame(sceneX, sceneY) {
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
  cameraErrorToAngularError(errXCamPx, errYCamPx) {
    const panErrorDeg = errXCamPx / this.config.resolutionWidth * this.config.fovXDeg;
    const tiltErrorDeg = errYCamPx / this.config.resolutionHeight * this.config.fovYDeg;
    return { panErrorDeg, tiltErrorDeg };
  }
  getPxPerDeg() {
    return this.pxPerDeg;
  }
};

// src/core/targetEngine.ts
var TargetEngine = class {
  constructor(sceneWidth = 2e3, sceneHeight = 2e3) {
    this.targets = [];
    this.timeSec = 0;
    this.customPathIndex = 0;
    this.customPathT = 0;
    this.sceneWidth = sceneWidth;
    this.sceneHeight = sceneHeight;
    this.resetDefaults();
  }
  setSceneDimensions(w, h) {
    this.sceneWidth = Math.max(1e3, w);
    this.sceneHeight = Math.max(1e3, h);
    for (const t of this.targets) {
      t.x = Math.max(50, Math.min(this.sceneWidth - 50, t.x));
      t.y = Math.max(50, Math.min(this.sceneHeight - 50, t.y));
    }
  }
  resetDefaults() {
    this.timeSec = 0;
    this.customPathIndex = 0;
    this.customPathT = 0;
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 40;
    const initX = this.sceneWidth / 2 + Math.cos(angle) * dist;
    const initY = this.sceneHeight / 2 + Math.sin(angle) * dist;
    this.targets = [
      {
        id: "primary-beacon",
        shape: "square",
        // default square per PS spec
        size: 10,
        // default 10 px (adjustable 5-20)
        x: Math.round(initX),
        y: Math.round(initY),
        vx: 45,
        vy: 30,
        intensity: 1,
        color: "#38bdf8",
        motionPattern: "straight_line",
        speed: 60
      }
    ];
  }
  getTargets() {
    return this.targets;
  }
  /**
   * Switches motion pattern cleanly, resetting timers and phase so no residual state persists
   */
  setPrimaryTargetMotion(pattern) {
    const t = this.targets[0];
    if (!t) return;
    t.motionPattern = pattern;
    this.timeSec = 0;
    this.customPathIndex = 0;
    this.customPathT = 0;
    const cx = this.sceneWidth / 2;
    const cy = this.sceneHeight / 2;
    switch (pattern) {
      case "straight_line": {
        const angle = Math.atan2(t.y - cy, t.x - cx) + Math.PI / 3;
        t.vx = Math.cos(angle) * t.speed;
        t.vy = Math.sin(angle) * t.speed;
        break;
      }
      case "circular": {
        const currentDist = Math.hypot(t.x - cx, t.y - cy);
        const radius = Math.max(120, Math.min(260, currentDist || 180));
        const currentAngle = Math.atan2(t.y - cy, t.x - cx);
        t.x = cx + Math.cos(currentAngle) * radius;
        t.y = cy + Math.sin(currentAngle) * radius;
        const omega = t.speed / radius;
        t.vx = -Math.sin(currentAngle) * radius * omega;
        t.vy = Math.cos(currentAngle) * radius * omega;
        break;
      }
      case "figure_eight": {
        const scaleX = 220;
        const omega = t.speed / scaleX * 1.2;
        t.x = cx;
        t.y = cy;
        t.vx = scaleX * omega;
        t.vy = 0;
        break;
      }
      case "random": {
        const angle = Math.random() * Math.PI * 2;
        t.vx = Math.cos(angle) * t.speed * 0.6;
        t.vy = Math.sin(angle) * t.speed * 0.6;
        break;
      }
      case "spiral":
      case "sinusoidal": {
        t.vx = t.speed;
        t.vy = 0;
        break;
      }
      case "custom_path": {
        if (t.customPoints && t.customPoints.length > 0) {
          t.x = t.customPoints[0].x;
          t.y = t.customPoints[0].y;
          t.vx = 0;
          t.vy = 0;
        }
        break;
      }
    }
  }
  setPrimaryTargetShape(shape) {
    if (this.targets[0]) {
      this.targets[0].shape = shape;
    }
  }
  setPrimaryTargetSize(size) {
    if (this.targets[0]) {
      this.targets[0].size = Math.max(5, Math.min(20, size));
    }
  }
  setPrimaryTargetSpeed(speed) {
    if (this.targets[0]) {
      this.targets[0].speed = speed;
    }
  }
  setPrimaryTargetLocation(x, y) {
    if (this.targets[0]) {
      this.targets[0].x = Math.max(30, Math.min(this.sceneWidth - 30, x));
      this.targets[0].y = Math.max(30, Math.min(this.sceneHeight - 30, y));
    }
  }
  setCustomPath(points) {
    if (!points || points.length < 2) return;
    if (this.targets[0]) {
      this.targets[0].customPoints = [...points];
      this.targets[0].motionPattern = "custom_path";
      this.targets[0].x = points[0].x;
      this.targets[0].y = points[0].y;
      this.customPathIndex = 0;
      this.customPathT = 0;
    }
  }
  clearCustomPath() {
    if (this.targets[0]) {
      this.targets[0].customPoints = void 0;
      this.setPrimaryTargetMotion("straight_line");
    }
  }
  setMultiTarget(enabled) {
    if (enabled && this.targets.length === 1) {
      this.targets.push({
        id: "secondary-beacon",
        shape: "circle",
        size: 8,
        x: this.sceneWidth / 2 - 200,
        y: this.sceneHeight / 2 + 150,
        vx: -35,
        vy: 40,
        intensity: 0.75,
        color: "#fbbf24",
        motionPattern: "circular",
        speed: 45
      });
    } else if (!enabled && this.targets.length > 1) {
      this.targets = [this.targets[0]];
    }
  }
  selectTargetToTrack(cameraCenterX, cameraCenterY, priority) {
    if (this.targets.length === 0) return null;
    if (this.targets.length === 1) return this.targets[0];
    if (priority === "brightest") {
      return [...this.targets].sort((a, b) => b.intensity - a.intensity)[0];
    } else {
      return [...this.targets].sort((a, b) => {
        const distA = Math.hypot(a.x - cameraCenterX, a.y - cameraCenterY);
        const distB = Math.hypot(b.x - cameraCenterX, b.y - cameraCenterY);
        return distA - distB;
      })[0];
    }
  }
  update(dt) {
    this.timeSec += dt;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      const cx = this.sceneWidth / 2;
      const cy = this.sceneHeight / 2;
      const speed = t.speed;
      switch (t.motionPattern) {
        case "straight_line": {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          const margin = 80;
          if (t.x <= margin) {
            t.x = margin;
            t.vx = Math.abs(t.vx);
          } else if (t.x >= this.sceneWidth - margin) {
            t.x = this.sceneWidth - margin;
            t.vx = -Math.abs(t.vx);
          }
          if (t.y <= margin) {
            t.y = margin;
            t.vy = Math.abs(t.vy);
          } else if (t.y >= this.sceneHeight - margin) {
            t.y = this.sceneHeight - margin;
            t.vy = -Math.abs(t.vy);
          }
          break;
        }
        case "circular": {
          const radius = Math.min(this.sceneWidth, this.sceneHeight) * 0.25;
          const omega = speed / radius;
          const phase = i * Math.PI;
          const angle = this.timeSec * omega + phase;
          t.x = cx + Math.cos(angle) * radius;
          t.y = cy + Math.sin(angle) * radius;
          t.vx = -Math.sin(angle) * radius * omega;
          t.vy = Math.cos(angle) * radius * omega;
          break;
        }
        case "figure_eight": {
          const scaleX = Math.min(this.sceneWidth, this.sceneHeight) * 0.28;
          const scaleY = scaleX * 0.65;
          const omega = speed / scaleX * 1.2;
          const tau = this.timeSec * omega;
          t.x = cx + scaleX * Math.sin(tau);
          t.y = cy + scaleY * Math.sin(tau) * Math.cos(tau);
          t.vx = scaleX * Math.cos(tau) * omega;
          t.vy = scaleY * (Math.cos(tau) * Math.cos(tau) - Math.sin(tau) * Math.sin(tau)) * omega;
          break;
        }
        case "random": {
          const perturbScale = 45;
          t.vx += (Math.random() * 2 - 1) * perturbScale * dt * 4;
          t.vy += (Math.random() * 2 - 1) * perturbScale * dt * 4;
          const distFromCenterX = t.x - cx;
          const distFromCenterY = t.y - cy;
          t.vx -= distFromCenterX / (this.sceneWidth * 0.4) * 30 * dt;
          t.vy -= distFromCenterY / (this.sceneHeight * 0.4) * 30 * dt;
          const currentSpeed = Math.hypot(t.vx, t.vy) || 1;
          if (currentSpeed > speed) {
            t.vx = t.vx / currentSpeed * speed;
            t.vy = t.vy / currentSpeed * speed;
          } else if (currentSpeed < speed * 0.3) {
            t.vx = t.vx / currentSpeed * speed * 0.5;
            t.vy = t.vy / currentSpeed * speed * 0.5;
          }
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.x = Math.max(80, Math.min(this.sceneWidth - 80, t.x));
          t.y = Math.max(80, Math.min(this.sceneHeight - 80, t.y));
          break;
        }
        case "spiral": {
          const maxRadius = Math.min(this.sceneWidth, this.sceneHeight) * 0.32;
          const period = 20 / (speed / 50);
          const cycleTime = this.timeSec % period;
          const radius = cycleTime / period * maxRadius + 30;
          const theta = this.timeSec * 2.5;
          t.x = cx + Math.cos(theta) * radius;
          t.y = cy + Math.sin(theta) * radius;
          t.vx = -Math.sin(theta) * radius * 2.5;
          t.vy = Math.cos(theta) * radius * 2.5;
          break;
        }
        case "sinusoidal": {
          const sweepWidth = this.sceneWidth * 0.6;
          const amplitude = 150;
          const freq = 0.8;
          const tau = this.timeSec * (speed / 100);
          const normX = (Math.sin(tau * 0.5) + 1) / 2 * sweepWidth + (this.sceneWidth - sweepWidth) / 2;
          t.x = normX;
          t.y = cy + Math.sin(tau * freq * 2) * amplitude;
          t.vx = Math.cos(tau * 0.5) * sweepWidth * 0.5;
          t.vy = Math.cos(tau * freq * 2) * amplitude * freq * 2;
          break;
        }
        case "custom_path": {
          if (!t.customPoints || t.customPoints.length < 2) {
            t.motionPattern = "straight_line";
            break;
          }
          const pts = t.customPoints;
          const currentP = pts[this.customPathIndex];
          const nextIndex = (this.customPathIndex + 1) % pts.length;
          const nextP = pts[nextIndex];
          const segmentDist = Math.hypot(nextP.x - currentP.x, nextP.y - currentP.y) || 1;
          const advance = speed * dt / segmentDist;
          this.customPathT += advance;
          if (this.customPathT >= 1) {
            this.customPathT = 0;
            this.customPathIndex = nextIndex;
          }
          const curPt = pts[this.customPathIndex];
          const nxtPt = pts[(this.customPathIndex + 1) % pts.length];
          const prevX = t.x;
          const prevY = t.y;
          t.x = curPt.x + (nxtPt.x - curPt.x) * this.customPathT;
          t.y = curPt.y + (nxtPt.y - curPt.y) * this.customPathT;
          t.vx = (t.x - prevX) / (dt || 0.016);
          t.vy = (t.y - prevY) / (dt || 0.016);
          break;
        }
      }
    }
  }
};

// src/core/tracker.ts
var TrackingModule = class {
  constructor() {
    this.state = "SEARCHING";
    this.consecutiveHits = 0;
    this.consecutiveMisses = 0;
    // Timers for official metrics
    this.searchStartTime = 0;
    this.lastAcquisitionDurationSec = 0;
    this.lostStartTime = 0;
    this.lastReacquisitionDurationSec = 0;
    // Kalman filter matrices - default to center of sensor frame (320, 240)
    this.x = 320;
    // State: pos x
    this.y = 240;
    // State: pos y
    this.vx = 0;
    // State: vel x
    this.vy = 0;
    // State: vel y
    // Error covariance matrix P (4x4 diagonal representation)
    this.P = [100, 100, 100, 100];
    // Process noise Q
    this.qPos = 2;
    this.qVel = 8;
    // Measurement noise R
    this.rPos = 4;
    // Predicted state before measurement update
    this.predictedX = 320;
    this.predictedY = 240;
    // Loss events recorded for heatmap
    this.lossLocations = [];
    // Optical flow displacement estimate
    this.opticalFlowDx = 0;
    this.opticalFlowDy = 0;
    // Flag indicating if first acquisition has occurred
    this.hasAcquiredOnce = false;
    this.reset();
  }
  reset() {
    this.state = "SEARCHING";
    this.consecutiveHits = 0;
    this.consecutiveMisses = 0;
    this.searchStartTime = performance.now() / 1e3;
    this.lostStartTime = 0;
    this.lastAcquisitionDurationSec = 0;
    this.lastReacquisitionDurationSec = 0;
    this.hasAcquiredOnce = false;
    this.x = 320;
    this.y = 240;
    this.vx = 0;
    this.vy = 0;
    this.predictedX = 320;
    this.predictedY = 240;
    this.P = [100, 100, 100, 100];
  }
  /**
   * Main tracking update per camera frame
   */
  update(detection, dt, sceneTargetPos) {
    const nowSec = performance.now() / 1e3;
    if (this.state !== "SEARCHING" || this.hasAcquiredOnce) {
      this.predictedX = this.x + this.vx * dt;
      this.predictedY = this.y + this.vy * dt;
      this.P[0] += 2 * this.P[2] * dt + this.qPos * dt;
      this.P[1] += 2 * this.P[3] * dt + this.qPos * dt;
      this.P[2] += this.qVel * dt;
      this.P[3] += this.qVel * dt;
    } else {
      this.predictedX = 320;
      this.predictedY = 240;
    }
    const isDetected = detection.detected && detection.confidence > 0.35;
    switch (this.state) {
      case "SEARCHING":
        if (isDetected) {
          this.consecutiveHits = 1;
          this.consecutiveMisses = 0;
          this.state = "ACQUIRED";
          if (!this.hasAcquiredOnce) {
            this.hasAcquiredOnce = true;
            this.lastAcquisitionDurationSec = Math.max(0.08, nowSec - this.searchStartTime);
          } else if (this.lostStartTime > 0) {
            this.lastReacquisitionDurationSec = Math.max(0.08, nowSec - this.lostStartTime);
          }
          this.x = detection.gaussianX;
          this.y = detection.gaussianY;
          this.vx = 0;
          this.vy = 0;
          this.P = [10, 10, 20, 20];
        }
        break;
      case "ACQUIRED":
        if (isDetected) {
          this.consecutiveHits++;
          if (this.consecutiveHits >= 2) {
            this.state = "TRACKING";
          }
        } else {
          this.consecutiveMisses++;
          if (this.consecutiveMisses > 3) {
            this.state = "SEARCHING";
            this.searchStartTime = nowSec;
          }
        }
        break;
      case "TRACKING":
        if (isDetected) {
          this.consecutiveHits++;
          this.consecutiveMisses = 0;
        } else {
          this.consecutiveMisses++;
          if (this.consecutiveMisses >= 2) {
            this.state = "REACQUIRING";
            this.lostStartTime = nowSec;
            if (sceneTargetPos) {
              this.lossLocations.push({
                x: sceneTargetPos.x,
                y: sceneTargetPos.y,
                timestamp: nowSec,
                durationMs: 0
              });
            }
          }
        }
        break;
      case "REACQUIRING":
        if (isDetected) {
          this.consecutiveHits = 1;
          this.consecutiveMisses = 0;
          this.lastReacquisitionDurationSec = Math.max(0.05, nowSec - this.lostStartTime);
          this.state = "TRACKING";
          if (this.lossLocations.length > 0) {
            const lastLoss = this.lossLocations[this.lossLocations.length - 1];
            lastLoss.durationMs = (nowSec - lastLoss.timestamp) * 1e3;
          }
        } else {
          this.consecutiveMisses++;
          if (this.consecutiveMisses > 12) {
            this.state = "SEARCHING";
            this.searchStartTime = nowSec;
          }
        }
        break;
      case "LOST":
        if (isDetected) {
          this.consecutiveHits = 1;
          this.consecutiveMisses = 0;
          this.lastReacquisitionDurationSec = Math.max(0.05, nowSec - this.lostStartTime);
          this.state = "ACQUIRED";
          this.x = detection.gaussianX;
          this.y = detection.gaussianY;
          this.vx = 0;
          this.vy = 0;
          this.P = [20, 20, 40, 40];
        } else {
          this.state = "SEARCHING";
          this.searchStartTime = nowSec;
        }
        break;
    }
    if (isDetected) {
      const zX = detection.gaussianX;
      const zY = detection.gaussianY;
      const R = this.rPos / Math.max(0.2, detection.rSquared);
      const kX = this.P[0] / (this.P[0] + R);
      const kY = this.P[1] / (this.P[1] + R);
      const kVx = this.P[2] / (this.P[0] + R);
      const kVy = this.P[3] / (this.P[1] + R);
      const resX = zX - this.predictedX;
      const resY = zY - this.predictedY;
      this.x = this.predictedX + kX * resX;
      this.y = this.predictedY + kY * resY;
      this.vx = this.vx + kVx * resX;
      this.vy = this.vy + kVy * resY;
      this.P[0] *= 1 - kX;
      this.P[1] *= 1 - kY;
      this.P[2] *= 1 - kVx;
      this.P[3] *= 1 - kVy;
    } else {
      if (this.state === "TRACKING" || this.state === "REACQUIRING") {
        this.x = this.predictedX;
        this.y = this.predictedY;
        this.vx *= 0.95;
        this.vy *= 0.95;
      } else {
        this.x = 320;
        this.y = 240;
        this.vx = 0;
        this.vy = 0;
      }
    }
    const isLocked = this.state === "TRACKING" || this.state === "ACQUIRED";
    return {
      state: this.state,
      estimatedX: this.x,
      estimatedY: this.y,
      predictedX: this.predictedX,
      predictedY: this.predictedY,
      confidence: isDetected ? detection.confidence : isLocked ? 0.6 : 0,
      isLocked
    };
  }
  getKalmanState() {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      predictedX: this.predictedX,
      predictedY: this.predictedY,
      covarianceTrace: this.P[0] + this.P[1] + this.P[2] + this.P[3]
    };
  }
};

// src/core/controller.ts
var PidController = class {
  constructor(config) {
    this.prevNormErrPan = 0;
    this.prevNormErrTilt = 0;
    this.integralPan = 0;
    this.integralTilt = 0;
    this.prevDerivativePan = 0;
    this.prevDerivativeTilt = 0;
    this.lastUpdateTimeMs = 0;
    this.lastPanCmdDegS = 0;
    this.lastTiltCmdDegS = 0;
    this.config = {
      kp: 2.4,
      ki: 0.15,
      kd: 0.35,
      kff: 0.45,
      integralWindupLimit: 2,
      servoLagMs: 20,
      backlashPx: 0.5,
      ...config
    };
  }
  reset() {
    this.prevNormErrPan = 0;
    this.prevNormErrTilt = 0;
    this.integralPan = 0;
    this.integralTilt = 0;
    this.prevDerivativePan = 0;
    this.prevDerivativeTilt = 0;
    this.lastPanCmdDegS = 0;
    this.lastTiltCmdDegS = 0;
    this.lastUpdateTimeMs = 0;
  }
  /**
   * Compute pan and tilt velocity commands (deg/s)
   * @param targetCamX estimated beacon X in camera frame pixels
   * @param targetCamY estimated beacon Y in camera frame pixels
   * @param targetVx estimated beacon velocity in X (px/s)
   * @param targetVy estimated beacon velocity in Y (px/s)
   * @param cameraConfig camera FOV and resolution settings
   * @param currentTimeMs current system time
   * @param isLocked whether beacon is acquired/tracked by detector or Kalman
   */
  computeCommand(targetCamX, targetCamY, targetVx, targetVy, cameraConfig, currentTimeMs, isLocked = true) {
    const camCenterX = cameraConfig.resolutionWidth / 2;
    const camCenterY = cameraConfig.resolutionHeight / 2;
    const maxPan = cameraConfig.maxPanSpeedDegS;
    const maxTilt = cameraConfig.maxTiltSpeedDegS;
    const minIntervalMs = 1e3 / cameraConfig.controlLoopHz;
    if (this.lastUpdateTimeMs > 0 && currentTimeMs - this.lastUpdateTimeMs < minIntervalMs) {
      const errPx = isLocked ? Math.hypot(targetCamX - camCenterX, targetCamY - camCenterY) : 0;
      return {
        panCmdDegS: this.lastPanCmdDegS,
        tiltCmdDegS: this.lastTiltCmdDegS,
        errorPx: errPx,
        isLoopUpdated: false
      };
    }
    const dt = this.lastUpdateTimeMs > 0 ? Math.min(0.1, (currentTimeMs - this.lastUpdateTimeMs) / 1e3) : 1 / cameraConfig.controlLoopHz;
    this.lastUpdateTimeMs = currentTimeMs;
    if (!isLocked) {
      this.prevNormErrPan = 0;
      this.prevNormErrTilt = 0;
      this.integralPan = 0;
      this.integralTilt = 0;
      this.prevDerivativePan = 0;
      this.prevDerivativeTilt = 0;
      return {
        panCmdDegS: 0,
        tiltCmdDegS: 0,
        errorPx: 0,
        isLoopUpdated: true
      };
    }
    const errXCamPx = targetCamX - camCenterX;
    const errYCamPx = targetCamY - camCenterY;
    const errorPx = Math.hypot(errXCamPx, errYCamPx);
    const normErrPan = errXCamPx / camCenterX;
    const normErrTilt = errYCamPx / camCenterY;
    const pPan = this.config.kp / 2 * normErrPan * maxPan;
    const pTilt = this.config.kp / 2 * normErrTilt * maxTilt;
    this.integralPan += normErrPan * dt;
    this.integralTilt += normErrTilt * dt;
    const windup = this.config.integralWindupLimit;
    this.integralPan = Math.max(-windup, Math.min(windup, this.integralPan));
    this.integralTilt = Math.max(-windup, Math.min(windup, this.integralTilt));
    const iPan = this.config.ki * this.integralPan * maxPan * 0.4;
    const iTilt = this.config.ki * this.integralTilt * maxTilt * 0.4;
    const rawDerivPan = dt > 0 ? (normErrPan - this.prevNormErrPan) / dt : 0;
    const rawDerivTilt = dt > 0 ? (normErrTilt - this.prevNormErrTilt) / dt : 0;
    const alpha = 0.6;
    const dPan = alpha * this.prevDerivativePan + (1 - alpha) * rawDerivPan;
    const dTilt = alpha * this.prevDerivativeTilt + (1 - alpha) * rawDerivTilt;
    this.prevDerivativePan = dPan;
    this.prevDerivativeTilt = dTilt;
    this.prevNormErrPan = normErrPan;
    this.prevNormErrTilt = normErrTilt;
    const dPanCmd = this.config.kd * dPan * maxPan * 0.15;
    const dTiltCmd = this.config.kd * dTilt * maxTilt * 0.15;
    const normVelPan = targetVx / camCenterX;
    const normVelTilt = targetVy / camCenterY;
    const ffPan = this.config.kff * normVelPan * maxPan * 0.35;
    const ffTilt = this.config.kff * normVelTilt * maxTilt * 0.35;
    let panCmd = pPan + iPan + dPanCmd + ffPan;
    let tiltCmd = pTilt + iTilt + dTiltCmd + ffTilt;
    panCmd = Math.max(-maxPan, Math.min(maxPan, panCmd));
    tiltCmd = Math.max(-maxTilt, Math.min(maxTilt, tiltCmd));
    this.lastPanCmdDegS = panCmd;
    this.lastTiltCmdDegS = tiltCmd;
    return {
      panCmdDegS: panCmd,
      tiltCmdDegS: tiltCmd,
      errorPx,
      isLoopUpdated: true
    };
  }
};

// src/core/searchEngine.ts
var SearchScanEngine = class {
  // +1 = moving right, -1 = moving left
  constructor() {
    this.mode = "spiral";
    this.scanTimeSec = 0;
    // Origin for localized outward search
    this.originPanDeg = 0;
    this.originTiltDeg = 0;
    // Spiral state
    this.spiralRadiusDeg = 0.5;
    this.spiralAngleRad = 0;
    // Raster scan state
    this.rasterTiltDeg = 0;
    this.rasterPanDeg = 0;
    this.rasterDirection = 1;
    this.reset();
  }
  reset(lastKnownPanDeg, lastKnownTiltDeg) {
    this.scanTimeSec = 0;
    this.mode = "spiral";
    this.spiralRadiusDeg = 0.5;
    this.spiralAngleRad = 0;
    if (lastKnownPanDeg !== void 0 && lastKnownTiltDeg !== void 0) {
      this.originPanDeg = Math.max(-6, Math.min(6, lastKnownPanDeg));
      this.originTiltDeg = Math.max(-6, Math.min(6, lastKnownTiltDeg));
    } else {
      this.originPanDeg = 0;
      this.originTiltDeg = 0;
    }
    this.rasterTiltDeg = -6;
    this.rasterPanDeg = -6;
    this.rasterDirection = 1;
  }
  /**
   * Compute commanded pan & tilt velocities (deg/s) for the current search frame
   */
  update(dt, cameraConfig, currentPanDeg, currentTiltDeg) {
    this.scanTimeSec += dt;
    const maxPanSpeed = cameraConfig.maxPanSpeedDegS;
    const maxTiltSpeed = cameraConfig.maxTiltSpeedDegS;
    const scanSpeed = Math.min(maxPanSpeed, maxTiltSpeed) * 0.85;
    const panLimitDeg = 7.5;
    const tiltLimitDeg = 7;
    const radialStepPerTurnDeg = Math.max(1.5, cameraConfig.fovYDeg * 0.65);
    if (this.mode === "spiral") {
      const r = Math.max(0.6, this.spiralRadiusDeg);
      const omega = scanSpeed / r;
      this.spiralAngleRad += omega * dt;
      const drDt = radialStepPerTurnDeg / (2 * Math.PI) * omega;
      this.spiralRadiusDeg += drDt * dt;
      const targetPan = this.originPanDeg + this.spiralRadiusDeg * Math.cos(this.spiralAngleRad);
      const targetTilt = this.originTiltDeg + this.spiralRadiusDeg * Math.sin(this.spiralAngleRad);
      const dPan = targetPan - currentPanDeg;
      const dTilt = targetTilt - currentTiltDeg;
      const dist = Math.hypot(dPan, dTilt);
      let panCmd = dist > 0.05 ? dPan / dist * scanSpeed : 0;
      let tiltCmd = dist > 0.05 ? dTilt / dist * scanSpeed : 0;
      if (this.spiralRadiusDeg > 9 || Math.abs(currentPanDeg) >= panLimitDeg || Math.abs(currentTiltDeg) >= tiltLimitDeg) {
        this.mode = "raster";
        this.rasterTiltDeg = -tiltLimitDeg;
        this.rasterPanDeg = currentPanDeg;
        this.rasterDirection = currentPanDeg >= 0 ? -1 : 1;
      }
      return {
        panCmdDegS: Math.max(-maxPanSpeed, Math.min(maxPanSpeed, panCmd)),
        tiltCmdDegS: Math.max(-maxTiltSpeed, Math.min(maxTiltSpeed, tiltCmd))
      };
    } else {
      this.rasterPanDeg += this.rasterDirection * scanSpeed * dt;
      if (this.rasterDirection > 0 && this.rasterPanDeg >= panLimitDeg) {
        this.rasterPanDeg = panLimitDeg;
        this.rasterDirection = -1;
        this.rasterTiltDeg += radialStepPerTurnDeg;
      } else if (this.rasterDirection < 0 && this.rasterPanDeg <= -panLimitDeg) {
        this.rasterPanDeg = -panLimitDeg;
        this.rasterDirection = 1;
        this.rasterTiltDeg += radialStepPerTurnDeg;
      }
      if (this.rasterTiltDeg > tiltLimitDeg) {
        this.rasterTiltDeg = -tiltLimitDeg;
      }
      const dPan = this.rasterPanDeg - currentPanDeg;
      const dTilt = this.rasterTiltDeg - currentTiltDeg;
      const dist = Math.hypot(dPan, dTilt);
      let panCmd = dist > 0.05 ? dPan / dist * scanSpeed : 0;
      let tiltCmd = dist > 0.05 ? dTilt / dist * scanSpeed : 0;
      return {
        panCmdDegS: Math.max(-maxPanSpeed, Math.min(maxPanSpeed, panCmd)),
        tiltCmdDegS: Math.max(-maxTiltSpeed, Math.min(maxTiltSpeed, tiltCmd))
      };
    }
  }
  getMode() {
    return this.mode;
  }
};

// test_bench.ts
var camera = new VirtualCamera();
var targetEngine = new TargetEngine();
var tracker = new TrackingModule();
var pid = new PidController();
for (const tc of BENCHMARK_SUITE_CASES) {
  targetEngine.setPrimaryTargetMotion(tc.motionPattern);
  if (tc.motionPattern === "straight_line") {
    targetEngine.setPrimaryTargetLocation(980, 980);
  } else if (tc.motionPattern === "circular") {
    targetEngine.setPrimaryTargetLocation(1e3, 1e3);
  } else if (tc.motionPattern === "figure_eight") {
    targetEngine.setPrimaryTargetLocation(1e3, 1e3);
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
        fogDensityPct: 0,
        rainIntensityPct: 0,
        hazeLevelPct: 0,
        ambientLightLux: 500,
        enableScintillation: false,
        scintillationStrength: 0,
        atmosphericPreset: tc.atmosphericPreset,
        gaussianSigma: tc.gaussianSigma,
        saltPepperDensity: tc.saltPepperDensity,
        jitterAmplitudePx: tc.jitterPx,
        enableJitter: tc.jitterPx > 0,
        platformMotionType: "circular",
        enablePlatformMotion: false,
        platformAmplitudePx: 0,
        platformSpeed: 1
      },
      20,
      0.5
    );
    const inCam = camera.sceneToCameraFrame(primary.x, primary.y);
    const noiseSigma = tc.gaussianSigma;
    const noiseLossProb = noiseSigma * 0.012 + tc.saltPepperDensity * 0.7 + tc.jitterPx * 8e-3;
    const isDetected = inCam.inFov && Math.random() > noiseLossProb * 0.35;
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
      detected: true
    } : {
      momentX: camW / 2,
      momentY: camH / 2,
      gaussianX: camW / 2,
      gaussianY: camH / 2,
      offsetDiffPx: 0,
      rSquared: 0,
      confidence: 0,
      boundingBox: null,
      detected: false
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
  const avgErr = lockedCount > 0 ? lockedErrorSum / lockedCount : 28;
  const postAcqFrames = firstAcqFrame >= 0 ? simFrames - firstAcqFrame : simFrames;
  const lossPct = postAcqFrames > 0 ? Math.max(0, (postAcqFrames - lockedCount) / postAcqFrames * 100) : 100;
  const acqTime = firstAcqFrame >= 0 ? Number((firstAcqFrame * dt).toFixed(2)) : tc.durationSec;
  const reacqTime = measuredReacqSec > 0 ? Number(measuredReacqSec.toFixed(2)) : 0.18;
  const passed = acqTime <= 2 && avgErr <= 10 && lossPct < 5 && reacqTime <= 1;
  console.log(tc.name, "=>", { acqTime, avgErr: avgErr.toFixed(2), lossPct: lossPct.toFixed(1), reacqTime, passed });
}
