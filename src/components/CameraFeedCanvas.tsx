/**
 * Camera Eye Live Feed Component
 * Professional desktop workstation technical view:
 * - Direct sensor image rendering with sub-pixel overlay
 * - Thin 1px boresight crosshair & ring
 * - Scale bar with pixel & angular degrees readout
 * - Real-time pixel coordinates on hover
 * - Interactive zoom & pan controls
 * - Detection boxes drawn as thin 1px outlines (no corner bracket clutter or dark badge enclosures)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CameraConfig, CentroidResult, KalmanState, TargetShape, TrackingState, BeaconTrack } from '../types';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CameraFeedCanvasProps {
  cameraConfig: CameraConfig;
  centroidResult: CentroidResult;
  centroidResults?: CentroidResult[];
  tracks?: BeaconTrack[];
  primaryBeaconId?: string;
  onSelectBeacon?: (id: string) => void;
  kalmanState: KalmanState;
  trackingState: TrackingState;
  panCmdDegS: number;
  tiltCmdDegS: number;
  feedImageData: ImageData | null;
  isMonochrome: boolean;
  onToggleMonochrome: () => void;
  errorPx: number;
  targetShape?: TargetShape;
}

export const CameraFeedCanvas: React.FC<CameraFeedCanvasProps> = ({
  cameraConfig,
  centroidResult,
  tracks = [],
  primaryBeaconId = 'B1',
  onSelectBeacon,
  kalmanState,
  trackingState,
  panCmdDegS,
  tiltCmdDegS,
  feedImageData,
  isMonochrome,
  onToggleMonochrome,
  errorPx,
  targetShape,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover pixel coordinates in sensor space
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  // Watch theme changes
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);

  const getSensorCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 320, y: 240 };
      const rect = canvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      const viewW = cameraConfig.resolutionWidth / zoom;
      const viewH = cameraConfig.resolutionHeight / zoom;

      const centerX = cameraConfig.resolutionWidth / 2 + pan.x;
      const centerY = cameraConfig.resolutionHeight / 2 + pan.y;

      const sx = centerX - viewW / 2 + normX * viewW;
      const sy = centerY - viewH / 2 + normY * viewH;

      return {
        x: Math.max(0, Math.min(cameraConfig.resolutionWidth, sx)),
        y: Math.max(0, Math.min(cameraConfig.resolutionHeight, sy)),
      };
    },
    [cameraConfig.resolutionWidth, cameraConfig.resolutionHeight, zoom, pan]
  );

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // Check click near beacon to select
    const coords = getSensorCoords(e);
    if (onSelectBeacon && tracks.length > 1) {
      let closest: BeaconTrack | null = null;
      let minDist = 30 / zoom;
      for (const tr of tracks) {
        const d = Math.hypot(tr.estimatedX - coords.x, tr.estimatedY - coords.y);
        if (d < minDist) {
          minDist = d;
          closest = tr;
        }
      }
      if (closest) {
        onSelectBeacon(closest.id);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setHoverCoords(getSensorCoords(e));
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom((z) => Math.min(4.0, Math.max(1.0, parseFloat((z + delta).toFixed(1)))));
  };

  const handleResetZoomPan = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const isDark =
      document.documentElement.dataset.theme !== 'light' &&
      !document.documentElement.classList.contains('light');

    // 1. Draw raw/disturbed image buffer onto canvas
    if (feedImageData) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = feedImageData.width;
      tempCanvas.height = feedImageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(feedImageData, 0, 0);

        // Render with zoom & pan
        const viewW = cameraConfig.resolutionWidth / zoom;
        const viewH = cameraConfig.resolutionHeight / zoom;
        const centerX = cameraConfig.resolutionWidth / 2 + pan.x;
        const centerY = cameraConfig.resolutionHeight / 2 + pan.y;

        const srcX = Math.max(0, centerX - viewW / 2);
        const srcY = Math.max(0, centerY - viewH / 2);

        ctx.fillStyle = '#090a0c';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(
          tempCanvas,
          srcX,
          srcY,
          viewW,
          viewH,
          0,
          0,
          width,
          height
        );
      }
    } else {
      ctx.fillStyle = '#090a0c';
      ctx.fillRect(0, 0, width, height);
    }

    // Mapping from sensor pixels to canvas coordinates
    const viewW = cameraConfig.resolutionWidth / zoom;
    const viewH = cameraConfig.resolutionHeight / zoom;
    const centerX = cameraConfig.resolutionWidth / 2 + pan.x;
    const centerY = cameraConfig.resolutionHeight / 2 + pan.y;

    const toCanvasX = (sx: number) => ((sx - (centerX - viewW / 2)) / viewW) * width;
    const toCanvasY = (sy: number) => ((sy - (centerY - viewH / 2)) / viewH) * height;

    const boresightX = toCanvasX(cameraConfig.resolutionWidth / 2);
    const boresightY = toCanvasY(cameraConfig.resolutionHeight / 2);

    // 2. Optical Boresight Crosshair (Thin 1px dashed line)
    ctx.strokeStyle = isDark ? 'rgba(91, 138, 192, 0.45)' : 'rgba(58, 102, 153, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(boresightX, 0);
    ctx.lineTo(boresightX, height);
    ctx.moveTo(0, boresightY);
    ctx.lineTo(width, boresightY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Boresight Center Ring (Thin 1px)
    ctx.strokeStyle = isDark ? '#5b8ac0' : '#3a6699';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(boresightX, boresightY, (10 / viewW) * width, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Render Multi-Beacon Tracks with Thin 1px Outlines
    if (tracks.length > 0) {
      for (const tr of tracks) {
        const isPrimary = tr.id === primaryBeaconId;
        const inFov = tr.inFov;

        if (inFov) {
          const tx = toCanvasX(tr.estimatedX);
          const ty = toCanvasY(tr.estimatedY);
          const boxSize = (32 / viewW) * width;

          // Thin 1px Outline
          ctx.strokeStyle = isPrimary
            ? isDark
              ? '#3fae6a'
              : '#2a8a50'
            : isDark
            ? '#5b8ac0'
            : '#3a6699';
          ctx.lineWidth = 1;
          ctx.strokeRect(tx - boxSize / 2, ty - boxSize / 2, boxSize, boxSize);

          // Sub-pixel centroid mark
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isPrimary ? '#3fae6a' : '#5b8ac0';
          ctx.fill();

          // 1px Text tag (No heavy dark pill badge)
          const tag = isPrimary
            ? `[${tr.id}] ${tr.errorFromBoresightPx.toFixed(1)} px`
            : `[${tr.id}]`;
          ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
          ctx.fillStyle = isDark ? '#e6e7e9' : '#ffffff';
          ctx.fillText(tag, tx - boxSize / 2, ty - boxSize / 2 - 3);

          // Error vector line to boresight
          if (isPrimary && (trackingState === 'TRACKING' || trackingState === 'ACQUIRED')) {
            ctx.strokeStyle = isDark ? 'rgba(224, 82, 82, 0.7)' : 'rgba(194, 58, 58, 0.7)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(boresightX, boresightY);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else {
          // Out of FOV: thin dashed circle indicator
          const margin = 16;
          const clampedX = Math.max(margin, Math.min(width - margin, toCanvasX(tr.estimatedX)));
          const clampedY = Math.max(margin, Math.min(height - margin, toCanvasY(tr.estimatedY)));

          ctx.strokeStyle = isDark ? '#d19a2a' : '#a86f0c';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(clampedX, clampedY, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = isDark ? '#d19a2a' : '#a86f0c';
          ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
          ctx.fillText(`[${tr.id}] pred`, clampedX + 10, clampedY + 3);
        }
      }
    } else if (centroidResult.detected && centroidResult.boundingBox) {
      // Fallback single detection: thin 1px outline
      const bb = centroidResult.boundingBox;
      const bx = toCanvasX(bb.x);
      const by = toCanvasY(bb.y);
      const bw = (bb.width / viewW) * width;
      const bh = (bb.height / viewH) * height;

      ctx.strokeStyle = isDark ? '#3fae6a' : '#2a8a50';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);

      const gx = toCanvasX(centroidResult.gaussianX);
      const gy = toCanvasY(centroidResult.gaussianY);
      ctx.beginPath();
      ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#3fae6a' : '#2a8a50';
      ctx.fill();
    }

    // 4. Kalman Predicted Marker (Thin 1px diamond)
    if (kalmanState.predictedX > 0 && kalmanState.predictedY > 0) {
      const px = toCanvasX(kalmanState.predictedX);
      const py = toCanvasY(kalmanState.predictedY);
      const dSize = 5;

      ctx.strokeStyle = isDark ? '#9a9da3' : '#5c6068';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py - dSize);
      ctx.lineTo(px + dSize, py);
      ctx.lineTo(px, py + dSize);
      ctx.lineTo(px - dSize, py);
      ctx.closePath();
      ctx.stroke();
    }

    // Scale bar in bottom-left corner
    // 50 sensor pixels
    const degPerPx = cameraConfig.fovXDeg / cameraConfig.resolutionWidth;
    const scaleBarPx = (50 / viewW) * width;
    const barX = 14;
    const barY = height - 16;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(barX, barY - 3);
    ctx.lineTo(barX, barY);
    ctx.lineTo(barX + scaleBarPx, barY);
    ctx.lineTo(barX + scaleBarPx, barY - 3);
    ctx.stroke();

    ctx.fillStyle = '#c9cbcf';
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText(`50 px · ${(50 * degPerPx).toFixed(2)}°`, barX, barY - 6);
  }, [
    cameraConfig,
    centroidResult,
    tracks,
    primaryBeaconId,
    kalmanState,
    trackingState,
    feedImageData,
    errorPx,
    zoom,
    pan,
    themeTick,
  ]);

  return (
    <div className="flex flex-col h-full bg-panel rounded-sm border border-line overflow-hidden">
      {/* Viewport Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg">Camera sensor</span>
          <span className="font-mono-tabular text-dim">
            {cameraConfig.resolutionWidth} × {cameraConfig.resolutionHeight}
          </span>
          {targetShape && (
            <span className="text-dim">
              · {targetShape}
            </span>
          )}
          {zoom > 1 && (
            <span className="font-mono-tabular text-muted">
              ({zoom.toFixed(1)}×)
            </span>
          )}
        </div>

        {/* Viewport Controls: Mono/Color, Zoom In, Zoom Out, Reset */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMonochrome}
            className="flex h-6 items-center gap-1 rounded-sm border border-line bg-panel-2 px-2 font-mono-tabular text-[11px] text-fg hover:bg-panel-hover"
            title="Toggle monochrome vs color sensor"
          >
            {isMonochrome ? 'Mono' : 'Color'}
          </button>

          <div className="mx-1 h-3.5 w-px bg-line" aria-hidden="true" />

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4.0, z + 0.5))}
            disabled={zoom >= 4.0}
            className="flex size-6 items-center justify-center rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover disabled:opacity-40"
            title="Zoom in"
          >
            <ZoomIn className="size-3" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1.0, z - 0.5))}
            disabled={zoom <= 1.0}
            className="flex size-6 items-center justify-center rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover disabled:opacity-40"
            title="Zoom out"
          >
            <ZoomOut className="size-3" aria-hidden="true" />
          </button>

          {zoom > 1.0 && (
            <button
              type="button"
              onClick={handleResetZoomPan}
              className="flex size-6 items-center justify-center rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover"
              title="Reset 1:1 view"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative flex-1 min-h-[300px] flex items-center justify-center bg-canvas-bg">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setHoverCoords(null)}
          onWheel={handleWheel}
          className={`w-full max-w-[640px] aspect-[4/3] touch-none ${
            isPanning ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
          title="Click beacon to select as primary gimbal lock"
        />

        {/* Hover Coordinates & Gimbal Telemetry */}
        <div className="absolute top-2 right-2 pointer-events-none flex items-center gap-2 rounded-sm border border-line bg-panel/90 px-2 py-0.5 text-[11px] font-mono-tabular text-muted backdrop-blur-xs">
          {hoverCoords ? (
            <span>
              X: {Math.round(hoverCoords.x)} px · Y: {Math.round(hoverCoords.y)} px
            </span>
          ) : (
            <span>Boresight: ({cameraConfig.resolutionWidth / 2}, {cameraConfig.resolutionHeight / 2})</span>
          )}
        </div>

        {/* Gimbal Position & Error in Bottom-Right */}
        <div className="absolute bottom-2 right-2 pointer-events-none rounded-sm border border-line bg-panel/90 px-2 py-1 text-[11px] font-mono-tabular text-muted backdrop-blur-xs space-y-0.5 text-right">
          <div>
            Pan: <span className="text-fg">{cameraConfig.panPosDeg.toFixed(2)}°</span> ({panCmdDegS.toFixed(1)}°/s)
          </div>
          <div>
            Tilt: <span className="text-fg">{cameraConfig.tiltPosDeg.toFixed(2)}°</span> ({tiltCmdDegS.toFixed(1)}°/s)
          </div>
          <div>
            Error: <span className="text-fg">{errorPx.toFixed(2)} px</span>
          </div>
        </div>
      </div>
    </div>
  );
};
