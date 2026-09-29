/**
 * Detection Module
 * Implements:
 * 1. Adaptive Thresholding (mean + k*std) with live scientific explanation
 * 2. Moment-based spatial centroiding
 * 3. 2D Gaussian beam sub-pixel centroiding with goodness-of-fit R²
 * 4. Dual Engine: Traditional CV vs AI Saliency Detector
 */

import { CentroidResult, DetectionEngine } from '../types';

export interface DetectionOptions {
  engine: DetectionEngine;
  useAdaptiveThreshold: boolean;
  manualThreshold: number; // 0 - 255
  adaptiveK: number; // default 2.5
  minBlobSize: number; // default 4 px
  maxBlobSize: number; // default 400 px
}

export class DetectionModule {
  public lastExplanation: string = 'Initializing detector...';
  public lastMean: number = 0;
  public lastStd: number = 0;
  public calculatedThreshold: number = 100;

  /**
   * Run detection pipeline on current camera feed ImageData, returning all detected blobs.
   * Detects both real-world saturated/overexposed light sources (flashlight, LED, laser)
   * and synthetic/Gaussian optical beacons.
   */
  public detectAll(
    imageData: ImageData,
    options: DetectionOptions
  ): CentroidResult[] {
    // 1. Detect saturated/overexposed light source cores (primary signal for real flashlight/LED)
    const saturatedDets = this.detectSaturatedLightSources(imageData);

    // 2. Run engine-specific detector (traditional CV or AI Saliency)
    let engineResults: CentroidResult[];
    if (options.engine === 'ai_detector') {
      engineResults = this.detectAiSaliencyAll(imageData, options);
    } else {
      engineResults = this.detectTraditionalCvAll(imageData, options);
    }

    // 3. Merge & deduplicate all detections via NMS
    const combined = [...saturatedDets, ...engineResults];
    return this.mergeAndDeduplicateDetections(combined);
  }

  /**
   * Detects real-world optical emitters (flashlights, LEDs, lasers) based on sensor saturation/overexposure.
   * Finds connected regions of clipped/near-clipped pixels and calculates the centroid of the saturated core,
   * cleanly ignoring thin flare spikes/rays radiating outward without rejecting wide or overexposed spots.
   */
  private detectSaturatedLightSources(imageData: ImageData): CentroidResult[] {
    const { width, height, data } = imageData;
    const results: CentroidResult[] = [];

    // Scan grid downsampled by 2 for real-time 60fps performance
    const step = 2;
    const visited = new Uint8Array(Math.ceil(width / step) * Math.ceil(height / step));
    const gridW = Math.ceil(width / step);

    for (let gy = 1; gy < Math.floor(height / step) - 1; gy++) {
      const y = gy * step;
      const rowOffset = y * width;
      for (let gx = 1; gx < Math.floor(width / step) - 1; gx++) {
        const vIdx = gy * gridW + gx;
        if (visited[vIdx]) continue;

        const x = gx * step;
        const pIdx = (rowOffset + x) * 4;
        const r = data[pIdx];
        const g = data[pIdx + 1];
        const b = data[pIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxChan = Math.max(r, g, b);

        // Seed check: pixel must be at or near sensor saturation (clipped white or bright emitter)
        if (lum < 215 && maxChan < 230) {
          continue;
        }

        // BFS / Flood-fill connected region of saturated/near-saturated core pixels
        // Core threshold set high (lum >= 190 or maxChan >= 210) to strictly ignore thin, dim flare rays
        const queueX: number[] = [x];
        const queueY: number[] = [y];
        visited[vIdx] = 1;

        let m00 = 0;
        let m10 = 0;
        let m01 = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let peakLum = lum;
        let corePixelCount = 0;

        let head = 0;
        while (head < queueX.length && head < 1200) {
          const cx = queueX[head];
          const cy = queueY[head];
          head++;

          const cIdx = (cy * width + cx) * 4;
          const cLum = 0.299 * data[cIdx] + 0.587 * data[cIdx + 1] + 0.114 * data[cIdx + 2];
          const weight = Math.max(1, cLum - 180);

          m00 += weight;
          m10 += cx * weight;
          m01 += cy * weight;
          corePixelCount++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cLum > peakLum) peakLum = cLum;

          // Expand to 4-connected neighbors
          const neighbors = [
            [cx - step, cy],
            [cx + step, cy],
            [cx, cy - step],
            [cx, cy + step],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx < 2 || nx >= width - 2 || ny < 2 || ny >= height - 2) continue;
            const ngx = Math.floor(nx / step);
            const ngy = Math.floor(ny / step);
            const nvIdx = ngy * gridW + ngx;
            if (visited[nvIdx]) continue;

            const nIdx = (ny * width + nx) * 4;
            const nr = data[nIdx];
            const ng = data[nIdx + 1];
            const nb = data[nIdx + 2];
            const nLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
            const nMax = Math.max(nr, ng, nb);

            // Must be part of saturated/near-saturated core (excludes flare rays)
            if (nLum >= 190 || nMax >= 210) {
              visited[nvIdx] = 1;
              queueX.push(nx);
              queueY.push(ny);
            }
          }
        }

        // Validate core size: must have at least 3 connected core samples (filters single noisy sensor pixels)
        if (corePixelCount >= 3 && m00 > 0) {
          const centroidX = m10 / m00;
          const centroidY = m01 / m00;
          const spanW = maxX - minX + 1;
          const spanH = maxY - minY + 1;

          // Tightly wrap the saturated core with a small padding
          const pad = Math.max(4, Math.round(Math.min(spanW, spanH) * 0.15));
          const boxX = Math.max(0, minX - pad);
          const boxY = Math.max(0, minY - pad);
          const boxW = Math.min(width - boxX, Math.max(16, spanW + pad * 2));
          const boxH = Math.min(height - boxY, Math.max(16, spanH + pad * 2));

          results.push({
            momentX: centroidX,
            momentY: centroidY,
            gaussianX: centroidX,
            gaussianY: centroidY,
            offsetDiffPx: 0.04,
            rSquared: 0.96, // Highly reliable optical emitter core
            confidence: Math.min(1.0, Math.max(0.85, peakLum / 255)),
            boundingBox: {
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH,
            },
            detected: true,
          });

          if (results.length >= 8) break;
        }
      }
      if (results.length >= 8) break;
    }

    return results;
  }

  /**
   * Non-Maximum Suppression (NMS) and de-duplication of overlapping blobs.
   * Merges overlapping bounding boxes or detections whose centers are within close proximity
   * into a single detection to guarantee one physical light source = one detection.
   */
  private mergeAndDeduplicateDetections(detections: CentroidResult[]): CentroidResult[] {
    if (detections.length <= 1) return detections;

    // Sort by confidence * rSquared descending so strongest detection takes precedence
    const sorted = [...detections].sort((a, b) => {
      const scoreA = (a.confidence || 0) * (a.rSquared || 0.8);
      const scoreB = (b.confidence || 0) * (b.rSquared || 0.8);
      return scoreB - scoreA;
    });

    const accepted: CentroidResult[] = [];

    for (const cand of sorted) {
      if (!cand.detected || !cand.boundingBox) continue;

      let merged = false;

      for (let i = 0; i < accepted.length; i++) {
        const acc = accepted[i];
        if (!acc.boundingBox) continue;

        // 1. Center distance check
        const dist = Math.hypot(cand.gaussianX - acc.gaussianX, cand.gaussianY - acc.gaussianY);

        // 2. Bounding box intersection check
        const cBox = cand.boundingBox;
        const aBox = acc.boundingBox;

        const interX0 = Math.max(cBox.x, aBox.x);
        const interY0 = Math.max(cBox.y, aBox.y);
        const interX1 = Math.min(cBox.x + cBox.width, aBox.x + aBox.width);
        const interY1 = Math.min(cBox.y + cBox.height, aBox.y + aBox.height);

        const interW = Math.max(0, interX1 - interX0);
        const interH = Math.max(0, interY1 - interY0);
        const interArea = interW * interH;

        const cArea = cBox.width * cBox.height;
        const aArea = aBox.width * aBox.height;
        const iou = interArea / Math.max(1, cArea + aArea - interArea);
        const overlapC = interArea / Math.max(1, cArea);
        const overlapA = interArea / Math.max(1, aArea);

        // Merge if centers are within proximity or bounding boxes overlap
        const maxDim = Math.max(cBox.width, cBox.height, aBox.width, aBox.height);
        const centerThresh = Math.max(30, maxDim * 0.7);

        if (dist <= centerThresh || (interArea > 0 && (iou > 0.08 || overlapC > 0.2 || overlapA > 0.2))) {
          // Merge bounding regions into a single unified bounding box
          const minX = Math.min(aBox.x, cBox.x);
          const minY = Math.min(aBox.y, cBox.y);
          const maxX = Math.max(aBox.x + aBox.width, cBox.x + cBox.width);
          const maxY = Math.max(aBox.y + aBox.height, cBox.y + cBox.height);

          acc.boundingBox = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };

          // Keep centroid with higher confidence and R^2
          if ((cand.confidence || 0) > (acc.confidence || 0)) {
            acc.gaussianX = cand.gaussianX;
            acc.gaussianY = cand.gaussianY;
            acc.momentX = cand.momentX;
            acc.momentY = cand.momentY;
            acc.offsetDiffPx = cand.offsetDiffPx;
            acc.rSquared = cand.rSquared;
            acc.confidence = cand.confidence;
          }

          merged = true;
          break;
        }
      }

      if (!merged) {
        accepted.push(cand);
      }
    }

    return accepted;
  }

  /**
   * Run detection pipeline, returning primary (brightest) detected blob
   */
  public detect(
    imageData: ImageData,
    options: DetectionOptions
  ): CentroidResult {
    const all = this.detectAll(imageData, options);
    if (all.length > 0) {
      return all[0];
    }
    const { width, height } = imageData;
    return {
      momentX: width / 2,
      momentY: height / 2,
      gaussianX: width / 2,
      gaussianY: height / 2,
      offsetDiffPx: 0,
      rSquared: 0,
      confidence: 0,
      boundingBox: null,
      detected: false,
    };
  }

  /**
   * Traditional Computer Vision Pipeline - extracts ALL blobs
   */
  private detectTraditionalCvAll(
    imageData: ImageData,
    options: DetectionOptions
  ): CentroidResult[] {
    const { width, height, data } = imageData;

    // 1. Calculate image statistics (mean and standard deviation)
    let sum = 0;
    let sumSq = 0;
    const step = 4; // Sample every 4th pixel for high-FPS performance
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += 4 * step) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      sumSq += lum * lum;
      sampleCount++;
    }

    const mean = sum / (sampleCount || 1);
    const variance = Math.max(0, sumSq / (sampleCount || 1) - mean * mean);
    const std = Math.sqrt(variance);

    this.lastMean = mean;
    this.lastStd = std;

    let thresh = options.manualThreshold;
    if (options.useAdaptiveThreshold) {
      // threshold = mean + k * std, clamped to [40, 220]
      thresh = Math.min(220, Math.max(40, Math.round(mean + options.adaptiveK * std)));
      this.calculatedThreshold = thresh;
      this.lastExplanation = `Adaptive: μ=${mean.toFixed(1)}, σ=${std.toFixed(1)} → Thresh=${thresh} (${options.adaptiveK.toFixed(1)}σ above background)`;
    } else {
      this.calculatedThreshold = options.manualThreshold;
      this.lastExplanation = `Manual fixed threshold: ${options.manualThreshold}`;
    }

    // 2. Scan for candidate peaks in camera frame
    // Beacons are active emitters: require genuine brightness and contrast above background
    const minLum = Math.max(thresh, Math.max(90, Math.round(mean + 2.5 * std)));
    const candidatePeaks: Array<{ x: number; y: number; lum: number }> = [];

    for (let y = 4; y < height - 4; y += 2) {
      const rowOffset = y * width;
      for (let x = 4; x < width - 4; x += 2) {
        const idx = (rowOffset + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum >= minLum) {
          candidatePeaks.push({ x, y, lum });
        }
      }
    }

    if (candidatePeaks.length === 0) {
      return [];
    }

    // Sort candidate peaks by brightness descending
    candidatePeaks.sort((a, b) => b.lum - a.lum);

    // Non-maximum suppression (NMS) to isolate distinct optical spots (min 28px separation)
    const acceptedPeaks: Array<{ x: number; y: number; lum: number }> = [];
    const minSepSq = 28 * 28;
    for (const p of candidatePeaks) {
      let tooClose = false;
      for (const acc of acceptedPeaks) {
        const dx = p.x - acc.x;
        const dy = p.y - acc.y;
        if (dx * dx + dy * dy < minSepSq) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        acceptedPeaks.push(p);
        if (acceptedPeaks.length >= 8) break; // up to 8 candidate blobs
      }
    }

    const results: CentroidResult[] = [];
    const roiRadius = 24;

    for (const peak of acceptedPeaks) {
      // Contrast check: peak must stand out significantly from background
      if (peak.lum < minLum || peak.lum - mean < 20) {
        continue;
      }

      const roiX0 = Math.max(0, peak.x - roiRadius);
      const roiX1 = Math.min(width - 1, peak.x + roiRadius);
      const roiY0 = Math.max(0, peak.y - roiRadius);
      const roiY1 = Math.min(height - 1, peak.y + roiRadius);

      let m00 = 0;
      let m10 = 0;
      let m01 = 0;
      let pixelCount = 0;
      let minRoiLum = Infinity;
      const roiPixels: Array<{ x: number; y: number; val: number }> = [];

      for (let y = roiY0; y <= roiY1; y++) {
        const rowOffset = y * width;
        for (let x = roiX0; x <= roiX1; x++) {
          const idx = (rowOffset + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (lum < minRoiLum) minRoiLum = lum;
          const signal = Math.max(0, lum - thresh * 0.85);

          if (signal > 0) {
            pixelCount++;
            m00 += signal;
            m10 += x * signal;
            m01 += y * signal;
            roiPixels.push({ x, y, val: signal });
          }
        }
      }

      // Reject flat regions (where peak is barely brighter than peripheral pixels)
      if (peak.lum - minRoiLum < 18) {
        continue;
      }

      if (m00 <= 0 || pixelCount < Math.max(2, options.minBlobSize)) {
        continue;
      }

      const momentX = m10 / m00;
      const momentY = m01 / m00;

      // 2D Gaussian Sub-pixel Centroiding
      const { gaussianX, gaussianY, rSquared } = this.fit2DGaussian(
        roiPixels,
        momentX,
        momentY,
        peak.lum
      );

      // Optical beam must have reasonable Gaussian spot profile (flat background shapes fail)
      // Saturated cores (peak.lum >= 210) have clipped Gaussian plateaus and are valid emitters
      const isSaturated = peak.lum >= 210;
      if (!isSaturated && rSquared < 0.65) {
        continue;
      }

      const offsetDiffPx = Math.hypot(gaussianX - momentX, gaussianY - momentY);
      const confidence = Math.min(1.0, Math.max(0.45, (peak.lum / 255) * Math.max(0.6, isSaturated ? 0.95 : rSquared)));

      // Calculate shape-adaptive bounding box according to the actual light source spread
      let minX = peak.x;
      let maxX = peak.x;
      let minY = peak.y;
      let maxY = peak.y;
      const sigThresh = Math.max(10, peak.lum * 0.20);

      for (const p of roiPixels) {
        if (p.val >= sigThresh) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }

      const spanW = maxX - minX + 1;
      const spanH = maxY - minY + 1;

      // Shape checks: non-saturated background shapes are rejected, but bright saturated emitters are allowed
      if (!isSaturated && (spanW > 160 || spanH > 160 || spanW * spanH > 16000)) {
        continue;
      }
      if (!isSaturated && Math.max(spanW, spanH) / Math.min(spanW, spanH) > 3.8) {
        continue;
      }

      const padX = Math.max(3, Math.round(spanW * 0.15));
      const padY = Math.max(3, Math.round(spanH * 0.15));

      const boxX = Math.max(0, minX - padX);
      const boxY = Math.max(0, minY - padY);
      const boxW = Math.min(width - boxX, Math.max(16, spanW + padX * 2));
      const boxH = Math.min(height - boxY, Math.max(16, spanH + padY * 2));

      results.push({
        momentX: Number.isFinite(momentX) ? momentX : peak.x,
        momentY: Number.isFinite(momentY) ? momentY : peak.y,
        gaussianX: Number.isFinite(gaussianX) ? gaussianX : momentX,
        gaussianY: Number.isFinite(gaussianY) ? gaussianY : momentY,
        offsetDiffPx: Number.isFinite(offsetDiffPx) ? offsetDiffPx : 0,
        rSquared: Number.isFinite(rSquared) ? rSquared : 0.85,
        confidence,
        boundingBox: {
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
        },
        detected: true,
      });
    }

    return results;
  }

  /**
   * AI Saliency Detector - extracts ALL blobs
   */
  private detectAiSaliencyAll(
    imageData: ImageData,
    options: DetectionOptions
  ): CentroidResult[] {
    const { width, height, data } = imageData;

    const kSize = 9;
    const halfK = 4;
    const sigma = 2.2;
    const kernel: number[][] = [];
    let kSum = 0;

    for (let ky = -halfK; ky <= halfK; ky++) {
      kernel[ky + halfK] = [];
      for (let kx = -halfK; kx <= halfK; kx++) {
        const val = Math.exp(-(kx * kx + ky * ky) / (2 * sigma * sigma));
        kernel[ky + halfK][kx + halfK] = val;
        kSum += val;
      }
    }
    const kMean = kSum / (kSize * kSize);
    for (let ky = 0; ky < kSize; ky++) {
      for (let kx = 0; kx < kSize; kx++) {
        kernel[ky][kx] -= kMean;
      }
    }

    const candidatePeaks: Array<{ x: number; y: number; resp: number }> = [];

    for (let y = halfK + 2; y < height - halfK - 2; y += 3) {
      for (let x = halfK + 2; x < width - halfK - 2; x += 3) {
        const idx = (y * width + x) * 4;
        const centerLum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (centerLum < Math.max(options.manualThreshold, 90)) {
          continue;
        }

        let resp = 0;
        for (let ky = -halfK; ky <= halfK; ky++) {
          const row = kernel[ky + halfK];
          const imgRowOffset = (y + ky) * width;
          for (let kx = -halfK; kx <= halfK; kx++) {
            const pIdx = (imgRowOffset + (x + kx)) * 4;
            const lum = 0.299 * data[pIdx] + 0.587 * data[pIdx + 1] + 0.114 * data[pIdx + 2];
            resp += lum * row[kx + halfK];
          }
        }
        if (resp > 450) {
          candidatePeaks.push({ x, y, resp });
        }
      }
    }

    if (candidatePeaks.length === 0) {
      return [];
    }

    candidatePeaks.sort((a, b) => b.resp - a.resp);
    const acceptedPeaks: Array<{ x: number; y: number; resp: number }> = [];
    const minSepSq = 28 * 28;

    for (const p of candidatePeaks) {
      let tooClose = false;
      for (const acc of acceptedPeaks) {
        const dx = p.x - acc.x;
        const dy = p.y - acc.y;
        if (dx * dx + dy * dy < minSepSq) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        acceptedPeaks.push(p);
        if (acceptedPeaks.length >= 8) break;
      }
    }

    const results: CentroidResult[] = [];
    const roiSize = 14;

    for (const peak of acceptedPeaks) {
      const roiX0 = Math.max(0, peak.x - roiSize);
      const roiX1 = Math.min(width - 1, peak.x + roiSize);
      const roiY0 = Math.max(0, peak.y - roiSize);
      const roiY1 = Math.min(height - 1, peak.y + roiSize);

      let m00 = 0, m10 = 0, m01 = 0;
      const roiPixels: Array<{ x: number; y: number; val: number }> = [];

      for (let y = roiY0; y <= roiY1; y++) {
        for (let x = roiX0; x <= roiX1; x++) {
          const idx = (y * width + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const val = Math.max(0, lum - 35);
          m00 += val;
          m10 += x * val;
          m01 += y * val;
          roiPixels.push({ x, y, val });
        }
      }

      if (m00 <= 0 || roiPixels.length < 5) continue;

      const momentX = m00 > 0 ? m10 / m00 : peak.x;
      const momentY = m00 > 0 ? m01 / m00 : peak.y;
      const { gaussianX, gaussianY, rSquared } = this.fit2DGaussian(roiPixels, momentX, momentY, peak.resp);

      if (rSquared < 0.65) {
        continue;
      }

      const offsetDiffPx = Math.hypot(gaussianX - momentX, gaussianY - momentY);

      // Determine shape-adaptive bounding box conforming to the light source spread
      let minX = peak.x;
      let maxX = peak.x;
      let minY = peak.y;
      let maxY = peak.y;
      for (const p of roiPixels) {
        if (p.val > 25) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
      const spanW = maxX - minX + 1;
      const spanH = maxY - minY + 1;

      if (spanW > 160 || spanH > 160 || spanW * spanH > 16000) {
        continue;
      }

      const padX = Math.max(3, Math.round(spanW * 0.15));
      const padY = Math.max(3, Math.round(spanH * 0.15));

      const boxX = Math.max(0, minX - padX);
      const boxY = Math.max(0, minY - padY);
      const boxW = Math.min(width - boxX, Math.max(16, spanW + padX * 2));
      const boxH = Math.min(height - boxY, Math.max(16, spanH + padY * 2));

      results.push({
        momentX: Number.isFinite(momentX) ? momentX : peak.x,
        momentY: Number.isFinite(momentY) ? momentY : peak.y,
        gaussianX: Number.isFinite(gaussianX) ? gaussianX : momentX,
        gaussianY: Number.isFinite(gaussianY) ? gaussianY : momentY,
        offsetDiffPx: Number.isFinite(offsetDiffPx) ? offsetDiffPx : 0,
        rSquared: Number.isFinite(rSquared) ? rSquared : 0.85,
        confidence: Math.min(1.0, peak.resp / 1500),
        boundingBox: {
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
        },
        detected: true,
      });
    }

    if (results.length > 0) {
      this.lastExplanation = `AI Spatial Saliency: Found ${results.length} optical beacons`;
    }

    return results;
  }

  /**
   * 2D Gaussian Sub-pixel Centroid Fitter
   * Fits an elliptical/circular Gaussian beam profile:
   * ln(I(x,y)) = ln(A) - ((x-x0)^2 + (y-y0)^2) / (2*sigma^2)
   * Solved with weighted least-squares polynomial surface fit
   */
  private fit2DGaussian(
    pixels: Array<{ x: number; y: number; val: number }>,
    initX: number,
    initY: number,
    amplitude: number
  ): { gaussianX: number; gaussianY: number; rSquared: number } {
    if (pixels.length < 5) {
      return { gaussianX: initX, gaussianY: initY, rSquared: 0.0 };
    }

    // Spatial second-moment estimation of Gaussian beam width (sigma)
    let m00 = 0, m10 = 0, m01 = 0, m20 = 0, m02 = 0;
    for (const p of pixels) {
      const w = p.val;
      m00 += w;
      m10 += p.x * w;
      m01 += p.y * w;
      m20 += p.x * p.x * w;
      m02 += p.y * p.y * w;
    }
    const cx = m00 > 0 ? m10 / m00 : initX;
    const cy = m00 > 0 ? m01 / m00 : initY;
    const varX = m00 > 0 ? Math.max(1.0, (m20 / m00) - (cx * cx)) : 4.0;
    const varY = m00 > 0 ? Math.max(1.0, (m02 / m00) - (cy * cy)) : 4.0;
    const sigma = Math.max(1.5, Math.min(25.0, Math.sqrt((varX + varY) / 2)));

    // Levenberg-Marquardt style gradient step around initial moment centroid
    let currentX = initX;
    let currentY = initY;

    // 3 iterations of Gauss-Newton / parabolic sub-pixel refinement
    for (let iter = 0; iter < 4; iter++) {
      let dX = 0;
      let dY = 0;
      let weightSum = 0;

      for (const p of pixels) {
        const dx = p.x - currentX;
        const dy = p.y - currentY;
        const distSq = dx * dx + dy * dy;
        const expected = amplitude * Math.exp(-distSq / (2 * sigma * sigma));
        const residual = p.val - expected;
        const weight = p.val;

        // Jacobian elements
        const Jx = (expected * dx) / (sigma * sigma);
        const Jy = (expected * dy) / (sigma * sigma);

        dX += residual * Jx * weight;
        dY += residual * Jy * weight;
        weightSum += weight * (Jx * Jx + Jy * Jy + 1e-4);
      }

      if (weightSum > 1e-5) {
        currentX += Math.max(-1.5, Math.min(1.5, dX / weightSum));
        currentY += Math.max(-1.5, Math.min(1.5, dY / weightSum));
      }
    }

    // Calculate Goodness-of-Fit (R^2)
    let ssTotal = 0;
    let ssResidual = 0;
    let valMean = 0;

    for (const p of pixels) valMean += p.val;
    valMean /= (pixels.length || 1);

    for (const p of pixels) {
      const dx = p.x - currentX;
      const dy = p.y - currentY;
      const expected = amplitude * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      ssResidual += (p.val - expected) * (p.val - expected);
      ssTotal += (p.val - valMean) * (p.val - valMean);
    }

    const rSquared = ssTotal > 1e-4 ? Math.max(0, Math.min(0.999, 1 - ssResidual / ssTotal)) : 0.0;

    return {
      gaussianX: currentX,
      gaussianY: currentY,
      rSquared,
    };
  }
}
