/**
 * Systematic Search & Scan Engine
 * Generates autonomous camera pan/tilt sweep trajectories during SEARCHING mode.
 * Completely independent of target motion patterns and uses ZERO ground-truth knowledge.
 *
 * Implements:
 * 1. Outward Archimedean spiral expanding from last known position (or center)
 * 2. Systematic full-field Boustrophedon (raster) scan with optimal FOV overlap
 * 3. Smooth velocity profiling bounded by configured maxPanSpeedDegS / maxTiltSpeedDegS
 */

import { CameraConfig } from '../types';

export class SearchScanEngine {
  private mode: 'spiral' | 'raster' = 'spiral';
  private scanTimeSec: number = 0;

  // Origin for localized outward search
  private originPanDeg: number = 0;
  private originTiltDeg: number = 0;

  // Spiral state
  private spiralRadiusDeg: number = 0.5;
  private spiralAngleRad: number = 0;

  // Raster scan state
  private rasterTiltDeg: number = 0;
  private rasterPanDeg: number = 0;
  private rasterDirection: number = 1; // +1 = moving right, -1 = moving left

  constructor() {
    this.reset();
  }

  public reset(lastKnownPanDeg?: number, lastKnownTiltDeg?: number) {
    this.scanTimeSec = 0;
    this.mode = 'spiral';
    this.spiralRadiusDeg = 0.5;
    this.spiralAngleRad = 0;

    if (lastKnownPanDeg !== undefined && lastKnownTiltDeg !== undefined) {
      this.originPanDeg = Math.max(-6.0, Math.min(6.0, lastKnownPanDeg));
      this.originTiltDeg = Math.max(-6.0, Math.min(6.0, lastKnownTiltDeg));
    } else {
      this.originPanDeg = 0;
      this.originTiltDeg = 0;
    }

    this.rasterTiltDeg = -6.0;
    this.rasterPanDeg = -6.0;
    this.rasterDirection = 1;
  }

  /**
   * Compute commanded pan & tilt velocities (deg/s) for the current search frame
   */
  public update(
    dt: number,
    cameraConfig: CameraConfig,
    currentPanDeg: number,
    currentTiltDeg: number
  ): { panCmdDegS: number; tiltCmdDegS: number } {
    const safeDt = Number.isFinite(dt) ? Math.max(1 / 120, Math.min(1 / 15, dt)) : 1 / 30;
    const safePan = Number.isFinite(currentPanDeg) ? currentPanDeg : 0;
    const safeTilt = Number.isFinite(currentTiltDeg) ? currentTiltDeg : 0;
    this.scanTimeSec += safeDt;

    // Scan velocity calibrated to 80% of gimbal limits for reliable camera frame capture
    const maxPanSpeed = Number.isFinite(cameraConfig.maxPanSpeedDegS) ? cameraConfig.maxPanSpeedDegS : 5.0;
    const maxTiltSpeed = Number.isFinite(cameraConfig.maxTiltSpeedDegS) ? cameraConfig.maxTiltSpeedDegS : 5.0;
    const scanSpeed = Math.min(maxPanSpeed, maxTiltSpeed) * 0.85;

    // Limits of the Field of Regard (FOR) in degrees
    const panLimitDeg = 7.5;
    const tiltLimitDeg = 7.0;

    // Radial expansion step per 360° turn (65% of vertical FOV ensures no coverage gaps)
    const radialStepPerTurnDeg = Math.max(1.5, cameraConfig.fovYDeg * 0.65);

    if (this.mode === 'spiral') {
      // 1. Expanding Archimedean Spiral
      const r = Math.max(0.6, Number.isFinite(this.spiralRadiusDeg) ? this.spiralRadiusDeg : 0.6);
      const omega = scanSpeed / r; // Constant tangential linear velocity

      this.spiralAngleRad += omega * safeDt;
      // Dr/Dt = (step / 2pi) * dtheta/dt
      const drDt = (radialStepPerTurnDeg / (2 * Math.PI)) * omega;
      this.spiralRadiusDeg += drDt * safeDt;

      // Target position along the spiral relative to search origin
      const targetPan = this.originPanDeg + this.spiralRadiusDeg * Math.cos(this.spiralAngleRad);
      const targetTilt = this.originTiltDeg + this.spiralRadiusDeg * Math.sin(this.spiralAngleRad);

      // Slew velocity towards spiral target point
      const dPan = targetPan - safePan;
      const dTilt = targetTilt - safeTilt;
      const dist = Math.hypot(dPan, dTilt);

      let panCmd = dist > 0.05 ? (dPan / dist) * scanSpeed : 0;
      let tiltCmd = dist > 0.05 ? (dTilt / dist) * scanSpeed : 0;

      if (!Number.isFinite(panCmd)) panCmd = 0;
      if (!Number.isFinite(tiltCmd)) tiltCmd = 0;

      // Transition to full raster sweep if spiral exceeds field limits
      if (this.spiralRadiusDeg > 9.0 || Math.abs(safePan) >= panLimitDeg || Math.abs(safeTilt) >= tiltLimitDeg) {
        this.mode = 'raster';
        this.rasterTiltDeg = -tiltLimitDeg;
        this.rasterPanDeg = safePan;
        this.rasterDirection = safePan >= 0 ? -1 : 1;
      }

      return {
        panCmdDegS: Math.max(-maxPanSpeed, Math.min(maxPanSpeed, panCmd)),
        tiltCmdDegS: Math.max(-maxTiltSpeed, Math.min(maxTiltSpeed, tiltCmd)),
      };
    } else {
      // 2. Systematic Boustrophedon (Raster) Sweep
      // Move pan across current row
      this.rasterPanDeg += this.rasterDirection * scanSpeed * safeDt;

      // Check row boundary
      if (this.rasterDirection > 0 && this.rasterPanDeg >= panLimitDeg) {
        this.rasterPanDeg = panLimitDeg;
        this.rasterDirection = -1;
        this.rasterTiltDeg += radialStepPerTurnDeg;
      } else if (this.rasterDirection < 0 && this.rasterPanDeg <= -panLimitDeg) {
        this.rasterPanDeg = -panLimitDeg;
        this.rasterDirection = 1;
        this.rasterTiltDeg += radialStepPerTurnDeg;
      }

      // If tilt exceeds bottom of scene, loop back to top
      if (this.rasterTiltDeg > tiltLimitDeg) {
        this.rasterTiltDeg = -tiltLimitDeg;
      }

      const dPan = this.rasterPanDeg - safePan;
      const dTilt = this.rasterTiltDeg - safeTilt;
      const dist = Math.hypot(dPan, dTilt);

      let panCmd = dist > 0.05 ? (dPan / dist) * scanSpeed : 0;
      let tiltCmd = dist > 0.05 ? (dTilt / dist) * scanSpeed : 0;

      if (!Number.isFinite(panCmd)) panCmd = 0;
      if (!Number.isFinite(tiltCmd)) tiltCmd = 0;

      return {
        panCmdDegS: Math.max(-maxPanSpeed, Math.min(maxPanSpeed, panCmd)),
        tiltCmdDegS: Math.max(-maxTiltSpeed, Math.min(maxTiltSpeed, tiltCmd)),
      };
    }
  }

  public getMode(): 'spiral' | 'raster' {
    return this.mode;
  }
}
