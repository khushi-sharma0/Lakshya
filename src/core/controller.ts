/**
 * Camera Control Loop (PID + Feed-Forward)
 * Converts camera-frame optical boresight pixel error into pan/tilt slew commands (deg/s)
 * Respects slew rate limits (5 - 10 deg/s) and control loop update frequency (>= 20 Hz)
 *
 * Calibrated for responsive tracking across all motion patterns (Straight, Circular, Fig-8, Random Walk):
 * Error-to-command scaling maps camera frame displacement into commanding slew velocities
 * up to max speed limits without sluggish deadbands or excessive lag.
 */

import { PidConfig, CameraConfig } from '../types';

export class PidController {
  public config: PidConfig;
  private prevNormErrPan: number = 0;
  private prevNormErrTilt: number = 0;
  private integralPan: number = 0;
  private integralTilt: number = 0;
  private prevDerivativePan: number = 0;
  private prevDerivativeTilt: number = 0;

  private lastUpdateTimeMs: number = 0;
  public lastPanCmdDegS: number = 0;
  public lastTiltCmdDegS: number = 0;

  constructor(config?: Partial<PidConfig>) {
    this.config = {
      kp: 10.5,
      ki: 4.8,
      kd: 0.1,
      kff: 0.95,
      integralWindupLimit: 3.5,
      servoLagMs: 20,
      backlashPx: 0.5,
      ...config,
    };
  }

  public reset() {
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
  public computeCommand(
    targetCamX: number,
    targetCamY: number,
    targetVx: number,
    targetVy: number,
    cameraConfig: CameraConfig,
    currentTimeMs: number,
    isLocked: boolean = true
  ): { panCmdDegS: number; tiltCmdDegS: number; errorPx: number; isLoopUpdated: boolean } {
    const camCenterX = cameraConfig.resolutionWidth / 2;
    const camCenterY = cameraConfig.resolutionHeight / 2;

    const maxPan = cameraConfig.maxPanSpeedDegS;
    const maxTilt = cameraConfig.maxTiltSpeedDegS;

    // Check update rate constraint (control loop update interval >= 20 Hz -> <= 50 ms)
    const minIntervalMs = 1000 / cameraConfig.controlLoopHz;
    if (this.lastUpdateTimeMs > 0 && currentTimeMs - this.lastUpdateTimeMs < minIntervalMs) {
      const errPx = isLocked ? Math.hypot(targetCamX - camCenterX, targetCamY - camCenterY) : 0;
      return {
        panCmdDegS: this.lastPanCmdDegS,
        tiltCmdDegS: this.lastTiltCmdDegS,
        errorPx: errPx,
        isLoopUpdated: false,
      };
    }

    const rawDt = this.lastUpdateTimeMs > 0 ? (currentTimeMs - this.lastUpdateTimeMs) / 1000 : 1 / cameraConfig.controlLoopHz;
    const dt = Number.isFinite(rawDt) ? Math.max(1 / 120, Math.min(1 / 15, rawDt)) : 1 / 30;
    this.lastUpdateTimeMs = currentTimeMs;

    if (!isLocked) {
      this.prevNormErrPan = 0;
      this.prevNormErrTilt = 0;
      this.integralPan = 0;
      this.integralTilt = 0;
      this.prevDerivativePan = 0;
      this.prevDerivativeTilt = 0;
      this.lastPanCmdDegS = 0;
      this.lastTiltCmdDegS = 0;
      return {
        panCmdDegS: 0,
        tiltCmdDegS: 0,
        errorPx: 0,
        isLoopUpdated: true,
      };
    }

    const safeTargetX = Number.isFinite(targetCamX) ? targetCamX : camCenterX;
    const safeTargetY = Number.isFinite(targetCamY) ? targetCamY : camCenterY;
    const safeVx = Number.isFinite(targetVx) ? targetVx : 0;
    const safeVy = Number.isFinite(targetVy) ? targetVy : 0;

    // Optical error in camera sensor pixels
    const errXCamPx = safeTargetX - camCenterX;
    const errYCamPx = safeTargetY - camCenterY;
    const errorPx = Number.isFinite(Math.hypot(errXCamPx, errYCamPx)) ? Math.hypot(errXCamPx, errYCamPx) : 0;

    const camPxPerDegX = cameraConfig.fovXDeg > 0 ? cameraConfig.resolutionWidth / cameraConfig.fovXDeg : 160;
    const camPxPerDegY = cameraConfig.fovYDeg > 0 ? cameraConfig.resolutionHeight / cameraConfig.fovYDeg : 160;

    // Optical error in degrees
    const errDegPan = errXCamPx / camPxPerDegX;
    const errDegTilt = errYCamPx / camPxPerDegY;

    // 1. Proportional term scaled in deg/s
    const pPan = this.config.kp * errDegPan;
    const pTilt = this.config.kp * errDegTilt;

    // 2. Integral term with anti-windup clamping
    this.integralPan += errDegPan * dt;
    this.integralTilt += errDegTilt * dt;
    if (!Number.isFinite(this.integralPan)) this.integralPan = 0;
    if (!Number.isFinite(this.integralTilt)) this.integralTilt = 0;

    const windup = Number.isFinite(this.config.integralWindupLimit) ? this.config.integralWindupLimit : 2.0;
    this.integralPan = Math.max(-windup, Math.min(windup, this.integralPan));
    this.integralTilt = Math.max(-windup, Math.min(windup, this.integralTilt));

    const iPan = this.config.ki * this.integralPan;
    const iTilt = this.config.ki * this.integralTilt;

    // 3. Derivative term with low-pass filtering to dampen rapid target turns
    const rawDerivPan = dt > 0 ? (errDegPan - this.prevNormErrPan) / dt : 0;
    const rawDerivTilt = dt > 0 ? (errDegTilt - this.prevNormErrTilt) / dt : 0;

    const alpha = 0.6;
    let dPan = alpha * this.prevDerivativePan + (1 - alpha) * (Number.isFinite(rawDerivPan) ? rawDerivPan : 0);
    let dTilt = alpha * this.prevDerivativeTilt + (1 - alpha) * (Number.isFinite(rawDerivTilt) ? rawDerivTilt : 0);
    if (!Number.isFinite(dPan)) dPan = 0;
    if (!Number.isFinite(dTilt)) dTilt = 0;

    this.prevDerivativePan = dPan;
    this.prevDerivativeTilt = dTilt;
    this.prevNormErrPan = errDegPan;
    this.prevNormErrTilt = errDegTilt;

    const dPanCmd = this.config.kd * dPan;
    const dTiltCmd = this.config.kd * dTilt;

    // 4. Feed-forward term from Kalman estimated target velocity
    const ffPan = this.config.kff * (safeVx / camPxPerDegX);
    const ffTilt = this.config.kff * (safeVy / camPxPerDegY);

    // Total raw control output
    let panCmd = pPan + iPan + dPanCmd + ffPan;
    let tiltCmd = pTilt + iTilt + dTiltCmd + ffTilt;

    if (!Number.isFinite(panCmd)) panCmd = this.lastPanCmdDegS || 0;
    if (!Number.isFinite(tiltCmd)) tiltCmd = this.lastTiltCmdDegS || 0;

    // Slew rate clamping strictly bounded by maxPanSpeedDegS and maxTiltSpeedDegS (5 - 10 deg/s)
    panCmd = Math.max(-maxPan, Math.min(maxPan, panCmd));
    tiltCmd = Math.max(-maxTilt, Math.min(maxTilt, tiltCmd));

    this.lastPanCmdDegS = panCmd;
    this.lastTiltCmdDegS = tiltCmd;

    return {
      panCmdDegS: panCmd,
      tiltCmdDegS: tiltCmd,
      errorPx,
      isLoopUpdated: true,
    };
  }
}
