/**
 * Tracking Engine & Multi-Target Kalman Filter
 * Implements:
 * 1. 4-State Discrete Linear Kalman Filter per Beacon Track [x, y, vx, vy]
 * 2. Multi-Target Data Association using Gated Nearest-Neighbor matching
 *    with velocity extrapolation to prevent ID swapping during trajectory crossings.
 * 3. Track state machine: SEARCHING -> ACQUIRED -> TRACKING -> COASTING -> LOST
 * 4. Backward-compatible single-beacon interface for Benchmark & Webcam modes.
 */

import {
  CentroidResult,
  KalmanState,
  TrackingState,
  LossLocation,
  BeaconTrack,
  BeaconMetricItem,
  TargetPrioritization,
  TargetConfig,
} from '../types';

export class SingleBeaconTrack {
  public id: string;
  public trackId: number;
  public state: TrackingState = 'SEARCHING';
  public color: string = '#06b6d4';

  public x: number = 320;
  public y: number = 240;
  public vx: number = 0;
  public vy: number = 0;

  public P: [number, number, number, number] = [100, 100, 100, 100];
  private qPos: number = 2.0;
  private qVel: number = 8.0;
  private rPos: number = 4.0;

  public predictedX: number = 320;
  public predictedY: number = 240;

  public consecutiveHits: number = 0;
  public consecutiveMisses: number = 0;
  public confidence: number = 0;
  public lastDetection: CentroidResult | null = null;

  public totalFrames: number = 0;
  public lockedFrames: number = 0;
  public lossCount: number = 0;
  public errorSum: number = 0;

  public searchStartTime: number = 0;
  public lostStartTime: number = 0;
  public lastAcquisitionDurationSec: number = 0;
  public lastReacquisitionDurationSec: number = 0;
  public hasAcquiredOnce: boolean = false;

  constructor(id: string, trackId: number, color: string = '#06b6d4') {
    this.id = id;
    this.trackId = trackId;
    this.color = color;
    this.reset();
  }

  public reset(initX: number = 320, initY: number = 240) {
    this.x = Number.isFinite(initX) ? initX : 320;
    this.y = Number.isFinite(initY) ? initY : 240;
    this.vx = 0;
    this.vy = 0;
    this.predictedX = this.x;
    this.predictedY = this.y;
    this.P = [100, 100, 100, 100];
    this.state = 'SEARCHING';
    this.consecutiveHits = 0;
    this.consecutiveMisses = 0;
    this.confidence = 0;
    this.lastDetection = null;
    this.totalFrames = 0;
    this.lockedFrames = 0;
    this.lossCount = 0;
    this.errorSum = 0;
    this.searchStartTime = performance.now() / 1000;
    this.lostStartTime = 0;
    this.lastAcquisitionDurationSec = 0;
    this.lastReacquisitionDurationSec = 0;
    this.hasAcquiredOnce = false;
  }

  public predict(dt: number) {
    const safeDt = Number.isFinite(dt) ? Math.max(1 / 120, Math.min(1 / 15, dt)) : 1 / 30;

    if (this.state !== 'SEARCHING' || this.hasAcquiredOnce) {
      this.predictedX = this.x + this.vx * safeDt;
      this.predictedY = this.y + this.vy * safeDt;

      this.P[0] += 2 * this.P[2] * safeDt + this.qPos * safeDt;
      this.P[1] += 2 * this.P[3] * safeDt + this.qPos * safeDt;
      this.P[2] += this.qVel * safeDt;
      this.P[3] += this.qVel * safeDt;
    } else {
      this.predictedX = 320;
      this.predictedY = 240;
    }

    if (!Number.isFinite(this.predictedX)) this.predictedX = 320;
    if (!Number.isFinite(this.predictedY)) this.predictedY = 240;
  }

  public updateWithDetection(detection: CentroidResult, nowSec: number) {
    const zX = Number.isFinite(detection.gaussianX) ? detection.gaussianX : 320;
    const zY = Number.isFinite(detection.gaussianY) ? detection.gaussianY : 240;

    this.consecutiveHits++;
    this.consecutiveMisses = 0;
    this.lastDetection = detection;
    this.confidence = detection.confidence || 0.8;

    if (this.state === 'SEARCHING' || this.state === 'LOST') {
      this.state = 'TRACKING';
      if (!this.hasAcquiredOnce) {
        this.hasAcquiredOnce = true;
        this.lastAcquisitionDurationSec = Math.max(0.08, nowSec - this.searchStartTime);
      } else if (this.lostStartTime > 0) {
        this.lastReacquisitionDurationSec = Math.max(0.05, nowSec - this.lostStartTime);
      }
      this.x = zX;
      this.y = zY;
      this.predictedX = zX;
      this.predictedY = zY;
      this.vx = 0;
      this.vy = 0;
      this.P = [10, 10, 20, 20];
      return;
    }

    if (this.state === 'ACQUIRED' || this.state === 'REACQUIRING') {
      this.state = 'TRACKING';
      if (this.lostStartTime > 0) {
        this.lastReacquisitionDurationSec = Math.max(0.05, nowSec - this.lostStartTime);
      }
    }

    // Kalman measurement update
    const R = this.rPos / Math.max(0.2, detection.rSquared || 0.8);
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

    // Numerical finite sanity checks
    if (!Number.isFinite(this.x)) this.x = zX;
    if (!Number.isFinite(this.y)) this.y = zY;
    if (!Number.isFinite(this.vx)) this.vx = 0;
    if (!Number.isFinite(this.vy)) this.vy = 0;
  }

  public updateMiss(nowSec: number) {
    this.consecutiveMisses++;
    this.consecutiveHits = 0;
    this.lastDetection = null;

    if (this.state === 'TRACKING') {
      if (this.consecutiveMisses >= 2) {
        this.state = 'REACQUIRING';
        this.lostStartTime = nowSec;
        this.lossCount++;
      }
    } else if (this.state === 'ACQUIRED') {
      if (this.consecutiveMisses > 3) {
        this.state = 'SEARCHING';
        this.searchStartTime = nowSec;
      }
    } else if (this.state === 'REACQUIRING') {
      if (this.consecutiveMisses > 12) {
        this.state = 'LOST';
        this.lostStartTime = nowSec;
      }
    }

    if (this.state === 'TRACKING' || this.state === 'REACQUIRING') {
      // Coasting along predicted trajectory
      this.x = this.predictedX;
      this.y = this.predictedY;
      this.vx *= 0.95;
      this.vy *= 0.95;
      this.confidence = Math.max(0.2, this.confidence * 0.9);
    } else {
      this.confidence = 0;
    }
  }

  public toBeaconTrack(camCenterX: number = 320, camCenterY: number = 240, actualInFov?: boolean): BeaconTrack {
    const isLocked = this.state === 'TRACKING' || this.state === 'ACQUIRED';
    const errorFromBoresight = isLocked || this.lastDetection
      ? Math.hypot(this.x - camCenterX, this.y - camCenterY)
      : 0;

    const inFov = actualInFov !== undefined
      ? actualInFov
      : (isLocked || this.state === 'REACQUIRING') && (this.x >= 0 && this.x <= camCenterX * 2 && this.y >= 0 && this.y <= camCenterY * 2);

    let trackState: 'TRACKING' | 'COASTING' | 'LOST' | 'SEARCHING' = 'SEARCHING';
    if (this.state === 'TRACKING' || this.state === 'ACQUIRED') {
      trackState = 'TRACKING';
    } else if (this.state === 'REACQUIRING') {
      trackState = 'COASTING';
    } else if (this.state === 'LOST') {
      trackState = 'LOST';
    } else {
      trackState = 'SEARCHING';
    }

    const lockRetentionPct = this.totalFrames > 0 ? (this.lockedFrames / this.totalFrames) * 100 : 0;

    return {
      id: this.id,
      trackId: this.trackId,
      state: trackState,
      color: this.color,
      estimatedX: this.x,
      estimatedY: this.y,
      predictedX: this.predictedX,
      predictedY: this.predictedY,
      vx: this.vx,
      vy: this.vy,
      covarianceTrace: this.P[0] + this.P[1] + this.P[2] + this.P[3],
      confidence: this.confidence,
      consecutiveHits: this.consecutiveHits,
      consecutiveMisses: this.consecutiveMisses,
      lastDetection: this.lastDetection,
      errorFromBoresightPx: Number.isFinite(errorFromBoresight) ? errorFromBoresight : 0,
      inFov,
      totalFrames: this.totalFrames,
      lockedFrames: this.lockedFrames,
      lockRetentionPct: Number(lockRetentionPct.toFixed(1)),
      lossCount: this.lossCount,
      errorSum: this.errorSum,
    };
  }
}

export class TrackingModule {
  public state: TrackingState = 'SEARCHING';
  public consecutiveHits: number = 0;
  public consecutiveMisses: number = 0;

  // Single-target state (backwards compatible)
  public lastAcquisitionDurationSec: number = 0;
  public lastReacquisitionDurationSec: number = 0;
  public hasAcquiredOnce: boolean = false;
  public lossLocations: LossLocation[] = [];

  // Multi-beacon tracks: keyed by Beacon ID ('B1', 'B2', etc.)
  private tracks: Map<string, SingleBeaconTrack> = new Map();
  public primaryBeaconId: string = 'B1';

  constructor() {
    this.reset();
  }

  public reset() {
    this.state = 'SEARCHING';
    this.consecutiveHits = 0;
    this.consecutiveMisses = 0;
    this.lastAcquisitionDurationSec = 0;
    this.lastReacquisitionDurationSec = 0;
    this.hasAcquiredOnce = false;
    this.lossLocations = [];

    const defaultColors = ['#06b6d4', '#f59e0b', '#10b981', '#a855f7', '#f43f5e'];
    this.tracks.clear();
    for (let i = 1; i <= 5; i++) {
      const id = `B${i}`;
      this.tracks.set(id, new SingleBeaconTrack(id, i, defaultColors[i - 1]));
    }
  }

  /**
   * Multi-Target Data Association & Tracking Update
   * Nearest-Neighbor assignment using Kalman prediction gating
   */
  public updateMulti(
    detections: CentroidResult[],
    dt: number,
    activeBeacons: TargetConfig[],
    policy: TargetPrioritization = 'brightest',
    selectedBeaconId: string = 'B1',
    camCenterX: number = 320,
    camCenterY: number = 240
  ): {
    primaryTrack: BeaconTrack;
    allTracks: BeaconTrack[];
  } {
    const nowSec = performance.now() / 1000;
    const safeDt = Number.isFinite(dt) ? Math.max(1 / 120, Math.min(1 / 15, dt)) : 1 / 30;

    // Filter detections with confidence > 0.3
    const validDets = detections.filter((d) => d.detected && d.confidence > 0.25);

    // Predict step for each active beacon track
    const activeIds = new Set(activeBeacons.map((b) => b.id));
    for (const [id, track] of this.tracks.entries()) {
      if (activeIds.has(id)) {
        track.predict(safeDt);
      }
    }

    // Build distance/cost matrix for association
    const activeTracksList: SingleBeaconTrack[] = [];
    for (const b of activeBeacons) {
      if (!this.tracks.has(b.id)) {
        this.tracks.set(b.id, new SingleBeaconTrack(b.id, parseInt(b.id.replace('B', '')) || 1, b.color));
      }
      const tr = this.tracks.get(b.id)!;
      tr.color = b.color;
      activeTracksList.push(tr);
    }

    // Gated Nearest-Neighbor matching with strict isolation per beacon track
    const matchedDets = new Set<number>();
    const matchedTracks = new Set<string>();

    // Pass 1: Match active/locked tracks to closest detections within gate radius
    for (const tr of activeTracksList) {
      if (tr.state === 'TRACKING' || tr.state === 'ACQUIRED') {
        const gateRadiusPx = Math.max(120, Math.hypot(tr.vx, tr.vy) * safeDt * 4 + 80);
        let bestDist = Infinity;
        let bestDetIdx = -1;

        for (let j = 0; j < validDets.length; j++) {
          if (matchedDets.has(j)) continue;
          const d = validDets[j];
          const dist = Math.hypot(tr.predictedX - d.gaussianX, tr.predictedY - d.gaussianY);
          if (dist <= gateRadiusPx && dist < bestDist) {
            bestDist = dist;
            bestDetIdx = j;
          }
        }

        if (bestDetIdx >= 0) {
          matchedTracks.add(tr.id);
          matchedDets.add(bestDetIdx);
          tr.updateWithDetection(validDets[bestDetIdx], nowSec);
        }
      }
    }

    // Pass 2: Match unacquired/coasting tracks to remaining detections that are NOT near already-matched tracks
    for (const tr of activeTracksList) {
      if (!matchedTracks.has(tr.id)) {
        let bestDist = Infinity;
        let bestDetIdx = -1;

        for (let j = 0; j < validDets.length; j++) {
          if (matchedDets.has(j)) continue;

          // Prevent creating/associating a second track on the same physical light source
          let nearActiveTrack = false;
          for (const mId of matchedTracks) {
            const mTr = this.tracks.get(mId);
            if (mTr) {
              const dToActive = Math.hypot(mTr.x - validDets[j].gaussianX, mTr.y - validDets[j].gaussianY);
              if (dToActive < 60) {
                nearActiveTrack = true;
                break;
              }
            }
          }
          if (nearActiveTrack) continue;

          const isUnacquired = tr.state === 'SEARCHING' || tr.state === 'LOST' || !tr.hasAcquiredOnce;
          const gateRadiusPx = isUnacquired ? 900 : Math.max(150, Math.hypot(tr.vx, tr.vy) * safeDt * 4 + 100);
          const dist = Math.hypot(tr.predictedX - validDets[j].gaussianX, tr.predictedY - validDets[j].gaussianY);

          if ((dist <= gateRadiusPx || isUnacquired) && dist < bestDist) {
            bestDist = dist;
            bestDetIdx = j;
          }
        }

        if (bestDetIdx >= 0) {
          matchedTracks.add(tr.id);
          matchedDets.add(bestDetIdx);
          tr.updateWithDetection(validDets[bestDetIdx], nowSec);
        }
      }
    }

    // Unmatched active tracks register miss
    for (const tr of activeTracksList) {
      if (!matchedTracks.has(tr.id)) {
        tr.updateMiss(nowSec);
      }
    }

    // Record frames and locked states for post-lock metric computation
    for (const tr of activeTracksList) {
      const isLocked = tr.state === 'TRACKING' || tr.state === 'ACQUIRED';
      if (tr.hasAcquiredOnce) {
        tr.totalFrames++;
        if (isLocked) {
          tr.lockedFrames++;
          const err = Math.hypot(tr.x - camCenterX, tr.y - camCenterY);
          tr.errorSum += err;
        }
      }
    }

    // Determine primary beacon to follow with gimbal
    let primaryTr = activeTracksList[0];
    if (policy === 'click_to_select') {
      const found = activeTracksList.find((t) => t.id === selectedBeaconId);
      if (found) primaryTr = found;
    } else if (policy === 'closest_to_center') {
      let minDist = Infinity;
      for (const tr of activeTracksList) {
        const d = Math.hypot(tr.x - camCenterX, tr.y - camCenterY);
        if (d < minDist) {
          minDist = d;
          primaryTr = tr;
        }
      }
    } else {
      // 'brightest': sort by confidence / intensity
      let maxConf = -1;
      for (const tr of activeTracksList) {
        const conf = tr.lastDetection ? tr.lastDetection.confidence : 0;
        if (conf > maxConf) {
          maxConf = conf;
          primaryTr = tr;
        }
      }
    }

    this.primaryBeaconId = primaryTr ? primaryTr.id : 'B1';
    if (primaryTr) {
      this.state = primaryTr.state;
      this.consecutiveHits = primaryTr.consecutiveHits;
      this.consecutiveMisses = primaryTr.consecutiveMisses;
      this.hasAcquiredOnce = primaryTr.hasAcquiredOnce;
      this.lastAcquisitionDurationSec = primaryTr.lastAcquisitionDurationSec;
      this.lastReacquisitionDurationSec = primaryTr.lastReacquisitionDurationSec;
    }

    const allTracks = activeTracksList.map((t) => {
      const isTrLocked = t.state === 'TRACKING' || t.state === 'ACQUIRED';
      const inFov = isTrLocked || (t.lastDetection !== null && t.consecutiveMisses === 0);
      return t.toBeaconTrack(camCenterX, camCenterY, inFov);
    });
    const primaryObj = primaryTr || activeTracksList[0];
    const primaryIsLocked = primaryObj ? (primaryObj.state === 'TRACKING' || primaryObj.state === 'ACQUIRED') : false;
    const primaryInFov = primaryIsLocked || (primaryObj && primaryObj.lastDetection !== null && primaryObj.consecutiveMisses === 0);
    const primaryTrack = primaryObj ? primaryObj.toBeaconTrack(camCenterX, camCenterY, primaryInFov) : activeTracksList[0].toBeaconTrack(camCenterX, camCenterY);

    return { primaryTrack, allTracks };
  }

  /**
   * Backwards compatible single-target update (Benchmark Mode, Webcam Mode, etc.)
   */
  public update(
    detection: CentroidResult,
    dt: number,
    sceneTargetPos?: { x: number; y: number }
  ): {
    state: TrackingState;
    estimatedX: number;
    estimatedY: number;
    predictedX: number;
    predictedY: number;
    confidence: number;
    isLocked: boolean;
  } {
    let tr = this.tracks.get('B1');
    if (!tr) {
      tr = new SingleBeaconTrack('B1', 1, '#06b6d4');
      this.tracks.set('B1', tr);
    }

    const nowSec = performance.now() / 1000;
    tr.predict(dt);

    const isDetected = detection.detected && detection.confidence > 0.25;
    if (isDetected) {
      tr.updateWithDetection(detection, nowSec);
    } else {
      tr.updateMiss(nowSec);
      if (tr.state === 'REACQUIRING' && sceneTargetPos) {
        this.lossLocations.push({
          x: sceneTargetPos.x,
          y: sceneTargetPos.y,
          timestamp: nowSec,
          durationMs: 0,
        });
      }
    }

    this.state = tr.state;
    this.consecutiveHits = tr.consecutiveHits;
    this.consecutiveMisses = tr.consecutiveMisses;
    this.hasAcquiredOnce = tr.hasAcquiredOnce;
    this.lastAcquisitionDurationSec = tr.lastAcquisitionDurationSec;
    this.lastReacquisitionDurationSec = tr.lastReacquisitionDurationSec;

    const isLocked = this.state === 'TRACKING' || this.state === 'ACQUIRED';

    return {
      state: this.state,
      estimatedX: tr.x,
      estimatedY: tr.y,
      predictedX: tr.predictedX,
      predictedY: tr.predictedY,
      confidence: tr.confidence,
      isLocked,
    };
  }

  public getKalmanState(): KalmanState {
    const tr = this.tracks.get(this.primaryBeaconId) || this.tracks.get('B1');
    if (!tr) {
      return {
        x: 320,
        y: 240,
        vx: 0,
        vy: 0,
        predictedX: 320,
        predictedY: 240,
        covarianceTrace: 0,
      };
    }
    return {
      x: tr.x,
      y: tr.y,
      vx: tr.vx,
      vy: tr.vy,
      predictedX: tr.predictedX,
      predictedY: tr.predictedY,
      covarianceTrace: tr.P[0] + tr.P[1] + tr.P[2] + tr.P[3],
    };
  }

  public getBeaconMetrics(): BeaconMetricItem[] {
    const items: BeaconMetricItem[] = [];
    for (const [_, tr] of this.tracks.entries()) {
      if (tr.totalFrames > 0) {
        const avgErr = tr.lockedFrames > 0 ? tr.errorSum / tr.lockedFrames : 0;
        const lockRet = (tr.lockedFrames / tr.totalFrames) * 100;
        const lossRate = ((tr.totalFrames - tr.lockedFrames) / tr.totalFrames) * 100;
        let trackState: 'TRACKING' | 'COASTING' | 'LOST' | 'SEARCHING' = 'SEARCHING';
        if (tr.state === 'TRACKING' || tr.state === 'ACQUIRED') trackState = 'TRACKING';
        else if (tr.state === 'REACQUIRING') trackState = 'COASTING';
        else if (tr.state === 'LOST') trackState = 'LOST';

        items.push({
          id: tr.id,
          color: tr.color,
          state: trackState,
          errorPx: Math.hypot(tr.x - 320, tr.y - 240),
          avgErrorPx: Number(avgErr.toFixed(2)),
          lockRetentionPct: Number(lockRet.toFixed(1)),
          lossRatePct: Number(lossRate.toFixed(1)),
          totalFrames: tr.totalFrames,
          lockedFrames: tr.lockedFrames,
        });
      }
    }
    return items;
  }
}
