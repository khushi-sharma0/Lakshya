/**
 * Optical Disturbance Injector
 * Implements real-time sensor and atmospheric optical degradation:
 * - Salt & Pepper Noise (~10% user density)
 * - Gaussian Additive Noise (Box-Muller, sigma up to 20 px/intensity)
 * - Poisson Photometric Noise
 * - Atmospheric Presets: Clear, Haze, Fog, Rain, Low Light
 * - Monochrome / Color conversion
 */

import { DisturbancesConfig } from '../types';

export class DisturbanceInjector {
  private rainDroplets: Array<{ x: number; y: number; length: number; speed: number; opacity: number }> = [];

  constructor() {
    this.initRain();
  }

  private initRain() {
    this.rainDroplets = [];
    for (let i = 0; i < 80; i++) {
      this.rainDroplets.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        length: 8 + Math.random() * 15,
        speed: 300 + Math.random() * 400,
        opacity: 0.15 + Math.random() * 0.25,
      });
    }
  }

  /**
   * Apply atmospheric scene overlays on canvas context before pixel rasterization
   */
  public applyAtmosphericPreRender(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    disturbances: DisturbancesConfig
  ) {
    const preset = disturbances.atmosphericPreset;
    const intensity = disturbances.atmosphericIntensity;

    if (preset === 'clear' || intensity <= 0) return;

    if (preset === 'rain') {
      // Draw dynamic rain streaks
      ctx.save();
      ctx.strokeStyle = `rgba(180, 200, 230, ${0.4 * intensity})`;
      ctx.lineWidth = 1.2;
      for (const drop of this.rainDroplets) {
        drop.y += drop.speed * dt;
        drop.x += (drop.speed * 0.15) * dt;
        if (drop.y > height) {
          drop.y = -drop.length;
          drop.x = Math.random() * width;
        }
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + drop.length * 0.2, drop.y + drop.length);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Apply post-capture pixel-level disturbances directly onto the ImageData buffer
   */
  public applyDisturbances(
    imageData: ImageData,
    disturbances: DisturbancesConfig,
    isMonochrome: boolean
  ) {
    const data = imageData.data;
    const len = data.length;
    const width = imageData.width;
    const height = imageData.height;

    // Atmospheric parameters
    const preset = disturbances.atmosphericPreset;
    const atmosIntensity = disturbances.atmosphericIntensity;

    let contrastFactor = 1.0;
    let veilLuminance = 0;
    let globalAttenuation = 1.0;

    if (preset === 'haze') {
      contrastFactor = 1.0 - 0.45 * atmosIntensity;
      veilLuminance = 55 * atmosIntensity;
    } else if (preset === 'fog') {
      contrastFactor = 1.0 - 0.75 * atmosIntensity;
      veilLuminance = 110 * atmosIntensity;
    } else if (preset === 'rain') {
      contrastFactor = 1.0 - 0.3 * atmosIntensity;
      veilLuminance = 25 * atmosIntensity;
    } else if (preset === 'low_light') {
      globalAttenuation = Math.max(0.15, 1.0 - 0.82 * atmosIntensity);
    }

    // Pre-calculate noise flags
    const hasSP = disturbances.enableSaltPepper && disturbances.saltPepperDensity > 0;
    const spDensity = disturbances.saltPepperDensity;
    const hasGauss = disturbances.enableGaussian && disturbances.gaussianSigma > 0;
    const gaussSigma = disturbances.gaussianSigma; // max 20
    const hasPoisson = disturbances.enablePoisson && disturbances.poissonIntensity > 0;
    const poissonScale = disturbances.poissonIntensity;

    // Box-Muller helper
    let spareGauss: number | null = null;
    const getGaussian = () => {
      if (spareGauss !== null) {
        const val = spareGauss;
        spareGauss = null;
        return val;
      }
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      const mult = Math.sqrt(-2.0 * Math.log(u));
      spareGauss = mult * Math.sin(2.0 * Math.PI * v);
      return mult * Math.cos(2.0 * Math.PI * v);
    };

    // Pixel manipulation loop
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Convert to luminance if monochrome or compute grayscale base
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // 1. Atmospheric degradation
      if (preset !== 'clear' && atmosIntensity > 0) {
        if (preset === 'low_light') {
          lum = lum * globalAttenuation;
          r = r * globalAttenuation;
          g = g * globalAttenuation;
          b = b * globalAttenuation;
        } else {
          // Airlight scattering & contrast reduction
          lum = lum * contrastFactor + veilLuminance;
          r = r * contrastFactor + veilLuminance;
          g = g * contrastFactor + veilLuminance;
          b = b * contrastFactor + veilLuminance;
        }
      }

      // 2. Additive Gaussian noise
      if (hasGauss) {
        const noise = getGaussian() * (gaussSigma * 2.55); // scale to pixel intensity
        lum += noise;
        r += noise;
        g += noise;
        b += noise;
      }

      // 3. Poisson shot noise simulation
      if (hasPoisson) {
        // sqrt(variance) proportional to signal intensity
        const variance = Math.sqrt(Math.max(1, lum)) * (poissonScale * 2.2);
        const pNoise = (Math.random() * 2 - 1) * variance;
        lum += pNoise;
        r += pNoise;
        g += pNoise;
        b += pNoise;
      }

      // 4. Salt & Pepper noise
      if (hasSP) {
        const rand = Math.random();
        if (rand < spDensity) {
          // Half salt (white), half pepper (black)
          const val = rand < spDensity * 0.5 ? 255 : 0;
          lum = val;
          r = val;
          g = val;
          b = val;
        }
      }

      // Clamp output
      const finalLum = Math.max(0, Math.min(255, lum));

      if (isMonochrome) {
        data[i] = finalLum;
        data[i + 1] = finalLum;
        data[i + 2] = finalLum;
      } else {
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
      // alpha stays 255
    }
  }
}
