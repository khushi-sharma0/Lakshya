/**
 * Target Simulation Engine
 * Computes deterministic and stochastic trajectories for optical beacons (1 to 5 beacons)
 * Strictly respects ISRO Problem Statement equations:
 * 1. Straight Line: constant-velocity vector motion with boundary reflection
 * 2. Circular: true parametric circle x = cx + r*cos(wt), y = cy + r*sin(wt)
 * 3. Figure-of-8: Lissajous / Lemniscate form x = cx + A*sin(wt), y = cy + A*sin(wt)*cos(wt)
 * 4. Random: bounded random-walk with smooth velocity perturbations
 * 5. Extras: Spiral, Sinusoidal, and User-Drawn Waypoint Interpolated Path
 */

import { TargetConfig, TargetMotionPattern, TargetShape, TargetPrioritization } from '../types';

export const BEACON_DEFAULT_COLORS = [
  '#06b6d4', // B1: Cyan
  '#f59e0b', // B2: Amber
  '#10b981', // B3: Emerald
  '#a855f7', // B4: Purple
  '#f43f5e', // B5: Rose
];

export class TargetEngine {
  private targets: TargetConfig[] = [];
  private sceneWidth: number;
  private sceneHeight: number;
  private timeSec: number = 0;
  private customPathIndex: number = 0;
  private customPathT: number = 0;

  constructor(sceneWidth = 2000, sceneHeight = 2000) {
    this.sceneWidth = sceneWidth;
    this.sceneHeight = sceneHeight;
    this.resetDefaults();
  }

  public setSceneDimensions(w: number, h: number) {
    this.sceneWidth = Math.max(1000, w);
    this.sceneHeight = Math.max(1000, h);
    for (const t of this.targets) {
      t.x = Math.max(50, Math.min(this.sceneWidth - 50, t.x));
      t.y = Math.max(50, Math.min(this.sceneHeight - 50, t.y));
    }
  }

  public resetDefaults() {
    this.timeSec = 0;
    this.customPathIndex = 0;
    this.customPathT = 0;

    const cx = this.sceneWidth / 2;
    const cy = this.sceneHeight / 2;

    // Default: exactly 1 beacon (B1)
    this.targets = [
      {
        id: 'B1',
        shape: 'square',
        size: 10,
        x: cx - 40,
        y: cy - 30,
        vx: 45,
        vy: 30,
        intensity: 1.0,
        color: BEACON_DEFAULT_COLORS[0],
        motionPattern: 'straight_line',
        speed: 60,
      },
    ];
  }

  public setBeaconCount(count: number) {
    const clampedCount = Math.max(1, Math.min(5, Math.round(count)));
    const cx = this.sceneWidth / 2;
    const cy = this.sceneHeight / 2;
    const anchorX = this.targets[0] ? this.targets[0].x : cx;
    const anchorY = this.targets[0] ? this.targets[0].y : cy;

    // Presets for up to 5 beacons with distinct crossing trajectories
    const beaconPresets: TargetConfig[] = [
      {
        id: 'B1',
        shape: 'square',
        size: 10,
        x: cx - 40,
        y: cy - 30,
        vx: 50,
        vy: 35,
        intensity: 1.0,
        color: BEACON_DEFAULT_COLORS[0],
        motionPattern: 'straight_line',
        speed: 60,
      },
      {
        id: 'B2',
        shape: 'circle',
        size: 9,
        x: anchorX + 60,
        y: anchorY - 45,
        vx: -45,
        vy: 40,
        intensity: 0.9,
        color: BEACON_DEFAULT_COLORS[1],
        motionPattern: 'circular',
        speed: 55,
      },
      {
        id: 'B3',
        shape: 'gaussian_spot',
        size: 11,
        x: anchorX - 65,
        y: anchorY + 50,
        vx: 40,
        vy: -45,
        intensity: 0.85,
        color: BEACON_DEFAULT_COLORS[2],
        motionPattern: 'figure_eight',
        speed: 50,
      },
      {
        id: 'B4',
        shape: 'cross',
        size: 10,
        x: anchorX + 55,
        y: anchorY + 60,
        vx: -50,
        vy: -30,
        intensity: 0.9,
        color: BEACON_DEFAULT_COLORS[3],
        motionPattern: 'random',
        speed: 60,
      },
      {
        id: 'B5',
        shape: 'circle',
        size: 8,
        x: anchorX - 50,
        y: anchorY - 55,
        vx: 35,
        vy: -50,
        intensity: 0.85,
        color: BEACON_DEFAULT_COLORS[4],
        motionPattern: 'spiral',
        speed: 45,
      },
    ];

    while (this.targets.length < clampedCount) {
      const idx = this.targets.length;
      this.targets.push({ ...beaconPresets[idx] });
    }
    if (this.targets.length > clampedCount) {
      this.targets = this.targets.slice(0, clampedCount);
    }
  }

  public updateBeacon(id: string, updates: Partial<TargetConfig>) {
    const t = this.targets.find((b) => b.id === id);
    if (!t) return;
    Object.assign(t, updates);

    if (updates.motionPattern) {
      this.initBeaconMotion(t);
    }
  }

  private initBeaconMotion(t: TargetConfig) {
    const cx = this.sceneWidth / 2;
    const cy = this.sceneHeight / 2;

    switch (t.motionPattern) {
      case 'straight_line': {
        const angle = Math.atan2(t.y - cy, t.x - cx) + Math.PI / 4;
        t.vx = Math.cos(angle) * t.speed;
        t.vy = Math.sin(angle) * t.speed;
        break;
      }
      case 'circular': {
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
      case 'figure_eight': {
        const scaleX = 220;
        const omega = (t.speed / scaleX) * 1.2;
        t.vx = scaleX * omega;
        t.vy = 0;
        break;
      }
      case 'random': {
        const angle = Math.random() * Math.PI * 2;
        t.vx = Math.cos(angle) * t.speed * 0.6;
        t.vy = Math.sin(angle) * t.speed * 0.6;
        break;
      }
      case 'spiral':
      case 'sinusoidal': {
        t.vx = t.speed;
        t.vy = 0;
        break;
      }
    }
  }

  public getTargets(): TargetConfig[] {
    return this.targets;
  }

  public setPrimaryTargetMotion(pattern: TargetMotionPattern) {
    if (this.targets[0]) {
      this.updateBeacon(this.targets[0].id, { motionPattern: pattern });
    }
  }

  public setPrimaryTargetShape(shape: TargetShape) {
    if (this.targets[0]) {
      this.targets[0].shape = shape;
    }
  }

  public setPrimaryTargetSize(size: number) {
    if (this.targets[0]) {
      this.targets[0].size = Math.max(5, Math.min(20, size));
    }
  }

  public setPrimaryTargetSpeed(speed: number) {
    if (this.targets[0]) {
      this.targets[0].speed = speed;
      this.initBeaconMotion(this.targets[0]);
    }
  }

  public setPrimaryTargetLocation(x: number, y: number) {
    if (this.targets[0]) {
      this.targets[0].x = Math.max(30, Math.min(this.sceneWidth - 30, x));
      this.targets[0].y = Math.max(30, Math.min(this.sceneHeight - 30, y));
    }
  }

  public setCustomPath(points: Array<{ x: number; y: number }>) {
    if (!points || points.length < 2) return;
    if (this.targets[0]) {
      this.targets[0].customPoints = [...points];
      this.targets[0].motionPattern = 'custom_path';
      this.targets[0].x = points[0].x;
      this.targets[0].y = points[0].y;
      this.customPathIndex = 0;
      this.customPathT = 0;
    }
  }

  public clearCustomPath() {
    if (this.targets[0]) {
      this.targets[0].customPoints = undefined;
      this.setPrimaryTargetMotion('straight_line');
    }
  }

  public setMultiTarget(enabled: boolean) {
    if (enabled && this.targets.length === 1) {
      this.setBeaconCount(2);
    } else if (!enabled && this.targets.length > 1) {
      this.setBeaconCount(1);
    }
  }

  public selectTargetToTrack(
    cameraCenterX: number,
    cameraCenterY: number,
    priority: TargetPrioritization,
    selectedId?: string
  ): TargetConfig | null {
    if (this.targets.length === 0) return null;
    if (this.targets.length === 1) return this.targets[0];

    if (priority === 'click_to_select' && selectedId) {
      const match = this.targets.find((t) => t.id === selectedId);
      if (match) return match;
    }

    if (priority === 'brightest') {
      return [...this.targets].sort((a, b) => b.intensity - a.intensity)[0];
    } else {
      return [...this.targets].sort((a, b) => {
        const distA = Math.hypot(a.x - cameraCenterX, a.y - cameraCenterY);
        const distB = Math.hypot(b.x - cameraCenterX, b.y - cameraCenterY);
        return distA - distB;
      })[0];
    }
  }

  public update(dt: number) {
    const safeDt = Number.isFinite(dt) ? Math.max(1 / 120, Math.min(1 / 15, dt)) : 1 / 30;
    this.timeSec += safeDt;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      const cx = this.sceneWidth / 2;
      const cy = this.sceneHeight / 2;
      const speed = Number.isFinite(t.speed) ? t.speed : 60;
      const beaconPhase = i * ((2 * Math.PI) / Math.max(1, this.targets.length));

      switch (t.motionPattern) {
        case 'straight_line': {
          t.x += (Number.isFinite(t.vx) ? t.vx : 40) * safeDt;
          t.y += (Number.isFinite(t.vy) ? t.vy : 30) * safeDt;

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

        case 'circular': {
          const radius = Math.min(this.sceneWidth, this.sceneHeight) * 0.22 + (i % 2) * 40;
          const omega = speed / radius;
          const angle = this.timeSec * omega + beaconPhase;
          t.x = cx + Math.cos(angle) * radius;
          t.y = cy + Math.sin(angle) * radius;
          t.vx = -Math.sin(angle) * radius * omega;
          t.vy = Math.cos(angle) * radius * omega;
          break;
        }

        case 'figure_eight': {
          const scaleX = Math.min(this.sceneWidth, this.sceneHeight) * 0.26;
          const scaleY = scaleX * 0.65;
          const omega = (speed / scaleX) * 1.2;
          const tau = this.timeSec * omega + beaconPhase;
          t.x = cx + scaleX * Math.sin(tau);
          t.y = cy + scaleY * Math.sin(tau) * Math.cos(tau);
          t.vx = scaleX * Math.cos(tau) * omega;
          t.vy = scaleY * (Math.cos(tau) * Math.cos(tau) - Math.sin(tau) * Math.sin(tau)) * omega;
          break;
        }

        case 'random': {
          const perturbScale = 45;
          t.vx += (Math.random() * 2 - 1) * perturbScale * safeDt * 4;
          t.vy += (Math.random() * 2 - 1) * perturbScale * safeDt * 4;

          const distFromCenterX = t.x - cx;
          const distFromCenterY = t.y - cy;
          t.vx -= (distFromCenterX / (this.sceneWidth * 0.4)) * 30 * safeDt;
          t.vy -= (distFromCenterY / (this.sceneHeight * 0.4)) * 30 * safeDt;

          const currentSpeed = Math.hypot(t.vx, t.vy) || 1;
          if (currentSpeed > speed) {
            t.vx = (t.vx / currentSpeed) * speed;
            t.vy = (t.vy / currentSpeed) * speed;
          } else if (currentSpeed < speed * 0.3) {
            t.vx = (t.vx / currentSpeed) * speed * 0.5;
            t.vy = (t.vy / currentSpeed) * speed * 0.5;
          }

          t.x += t.vx * safeDt;
          t.y += t.vy * safeDt;
          t.x = Math.max(80, Math.min(this.sceneWidth - 80, t.x));
          t.y = Math.max(80, Math.min(this.sceneHeight - 80, t.y));
          break;
        }

        case 'spiral': {
          const maxRadius = Math.min(this.sceneWidth, this.sceneHeight) * 0.30;
          const period = 20 / (speed / 50);
          const cycleTime = (this.timeSec + i * 4) % period;
          const radius = (cycleTime / period) * maxRadius + 30;
          const theta = this.timeSec * 2.2 + beaconPhase;
          t.x = cx + Math.cos(theta) * radius;
          t.y = cy + Math.sin(theta) * radius;
          t.vx = -Math.sin(theta) * radius * 2.2;
          t.vy = Math.cos(theta) * radius * 2.2;
          break;
        }

        case 'sinusoidal': {
          const sweepWidth = this.sceneWidth * 0.6;
          const amplitude = 150;
          const freq = 0.8;
          const tau = this.timeSec * (speed / 100) + beaconPhase;
          const normX = ((Math.sin(tau * 0.5) + 1) / 2) * sweepWidth + (this.sceneWidth - sweepWidth) / 2;
          t.x = normX;
          t.y = cy + Math.sin(tau * freq * 2) * amplitude;
          t.vx = Math.cos(tau * 0.5) * sweepWidth * 0.5;
          t.vy = Math.cos(tau * freq * 2) * amplitude * freq * 2;
          break;
        }

        case 'custom_path': {
          if (!t.customPoints || t.customPoints.length < 2) {
            t.motionPattern = 'straight_line';
            break;
          }
          const pts = t.customPoints;
          const currentP = pts[this.customPathIndex];
          const nextIndex = (this.customPathIndex + 1) % pts.length;
          const nextP = pts[nextIndex];
          const segmentDist = Math.hypot(nextP.x - currentP.x, nextP.y - currentP.y) || 1;
          const advance = (speed * safeDt) / segmentDist;

          this.customPathT += advance;
          if (this.customPathT >= 1.0) {
            this.customPathT = 0;
            this.customPathIndex = nextIndex;
          }

          const curPt = pts[this.customPathIndex];
          const nxtPt = pts[(this.customPathIndex + 1) % pts.length];
          const prevX = t.x;
          const prevY = t.y;
          t.x = curPt.x + (nxtPt.x - curPt.x) * this.customPathT;
          t.y = curPt.y + (nxtPt.y - curPt.y) * this.customPathT;
          t.vx = (t.x - prevX) / safeDt;
          t.vy = (t.y - prevY) / safeDt;
          break;
        }
      }

      // Ensure coordinates are finite and clamped to scene
      if (!Number.isFinite(t.x)) t.x = cx;
      if (!Number.isFinite(t.y)) t.y = cy;
      t.x = Math.max(20, Math.min(this.sceneWidth - 20, t.x));
      t.y = Math.max(20, Math.min(this.sceneHeight - 20, t.y));
    }
  }
}
