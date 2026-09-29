/**
 * Virtual Scene Canvas Component
 * Professional desktop workstation technical view:
 * - 2000x2000 px full virtual tracking space
 * - Thin 1px crosshair & grid
 * - Scale bar with pixel & angular degrees readout
 * - Pixel coordinates on hover
 * - Interactive zoom & pan controls
 * - Thin 1px beacon bounding boxes with clean technical labels
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TargetConfig, CameraConfig } from '../types';
import { Pencil, Trash2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface SceneCanvasProps {
  targets: TargetConfig[];
  cameraConfig: CameraConfig;
  cameraCenter: { x: number; y: number };
  fovRect: { x: number; y: number; width: number; height: number };
  primaryBeaconId?: string;
  onSelectBeacon?: (id: string) => void;
  onSetCustomPath: (points: Array<{ x: number; y: number }>) => void;
  onClearCustomPath: () => void;
  onSetTargetPos: (x: number, y: number) => void;
  isCustomPathActive: boolean;
}

export const SceneCanvas: React.FC<SceneCanvasProps> = ({
  targets,
  cameraConfig,
  cameraCenter,
  fovRect,
  primaryBeaconId = 'B1',
  onSelectBeacon,
  onSetCustomPath,
  onClearCustomPath,
  onSetTargetPos,
  isCustomPathActive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isDrawMode, setIsDrawMode] = useState(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover coordinates in scene pixels
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  // Per-beacon trail history: map beacon ID -> points array
  const trailsRef = useRef<Map<string, Array<{ x: number; y: number }>>>(new Map());

  // Watch theme changes
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);

  // Convert client pointer event to 2000x2000 scene coordinates taking zoom & pan into account
  const getSceneCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 1000, y: 1000 };
      const rect = canvas.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }

      // Normalized [0, 1] on canvas surface
      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;

      // Reverse pan & zoom: canvas center is (1000, 1000) by default
      const centerX = cameraConfig.screenWidth / 2 + pan.x;
      const centerY = cameraConfig.screenHeight / 2 + pan.y;

      const viewW = cameraConfig.screenWidth / zoom;
      const viewH = cameraConfig.screenHeight / zoom;

      const sceneX = centerX - viewW / 2 + normX * viewW;
      const sceneY = centerY - viewH / 2 + normY * viewH;

      return {
        x: Math.max(0, Math.min(cameraConfig.screenWidth, sceneX)),
        y: Math.max(0, Math.min(cameraConfig.screenHeight, sceneY)),
      };
    },
    [cameraConfig.screenWidth, cameraConfig.screenHeight, zoom, pan]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If middle button or Alt key is pressed, initiate pan
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const coords = getSceneCoords(e);
    if (isDrawMode) {
      setIsDrawing(true);
      setDrawnPoints([coords]);
    } else {
      let clickedBeacon: TargetConfig | null = null;
      for (const t of targets) {
        if (Math.hypot(coords.x - t.x, coords.y - t.y) < 40) {
          clickedBeacon = t;
          break;
        }
      }
      if (clickedBeacon && onSelectBeacon) {
        onSelectBeacon(clickedBeacon.id);
      } else {
        onSetTargetPos(coords.x, coords.y);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getSceneCoords(e);
    setHoverCoords(coords);

    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawing || !isDrawMode) return;
    setDrawnPoints((prev) => {
      const last = prev[prev.length - 1];
      if (!last || Math.hypot(coords.x - last.x, coords.y - last.y) > 20) {
        return [...prev, coords];
      }
      return prev;
    });
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDrawing && isDrawMode) {
      setIsDrawing(false);
      if (drawnPoints.length >= 2) {
        onSetCustomPath(drawnPoints);
      }
    }
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

  // Render loop
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

    ctx.fillStyle = isDark ? '#111214' : '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Coordinate mapping functions
    const centerX = cameraConfig.screenWidth / 2 + pan.x;
    const centerY = cameraConfig.screenHeight / 2 + pan.y;
    const viewW = cameraConfig.screenWidth / zoom;
    const viewH = cameraConfig.screenHeight / zoom;

    const toCanvasX = (sx: number) => ((sx - (centerX - viewW / 2)) / viewW) * width;
    const toCanvasY = (sy: number) => ((sy - (centerY - viewH / 2)) / viewH) * height;

    // Faint coordinate grid (every 200px = 2°)
    ctx.strokeStyle = isDark ? 'rgba(154, 157, 163, 0.10)' : 'rgba(213, 216, 221, 0.7)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cameraConfig.screenWidth; x += 200) {
      const cx = toCanvasX(x);
      if (cx >= 0 && cx <= width) {
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.stroke();
      }
    }
    for (let y = 0; y <= cameraConfig.screenHeight; y += 200) {
      const cy = toCanvasY(y);
      if (cy >= 0 && cy <= height) {
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();
      }
    }

    // Thin crosshair at space center (1000, 1000)
    const midX = toCanvasX(cameraConfig.screenWidth / 2);
    const midY = toCanvasY(cameraConfig.screenHeight / 2);
    ctx.strokeStyle = isDark ? 'rgba(154, 157, 163, 0.25)' : 'rgba(92, 96, 104, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX - 10, midY);
    ctx.lineTo(midX + 10, midY);
    ctx.moveTo(midX, midY - 10);
    ctx.lineTo(midX, midY + 10);
    ctx.stroke();

    // Trails per beacon
    for (const t of targets) {
      if (!trailsRef.current.has(t.id)) {
        trailsRef.current.set(t.id, []);
      }
      const trail = trailsRef.current.get(t.id)!;
      trail.push({ x: t.x, y: t.y });
      if (trail.length > 50) trail.shift();

      if (trail.length > 1) {
        ctx.strokeStyle = isDark ? 'rgba(91, 138, 192, 0.4)' : 'rgba(58, 102, 153, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let j = 0; j < trail.length; j++) {
          const pt = trail[j];
          const cx = toCanvasX(pt.x);
          const cy = toCanvasY(pt.y);
          if (j === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }

    // Active drawn custom path (if any)
    if (drawnPoints.length > 1) {
      ctx.strokeStyle = isDark ? '#d19a2a' : '#a86f0c';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < drawnPoints.length; i++) {
        const pt = drawnPoints[i];
        const cx = toCanvasX(pt.x);
        const cy = toCanvasY(pt.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Camera FOV Footprint Box (Thin 1px outline)
    const fovX1 = toCanvasX(fovRect.x);
    const fovY1 = toCanvasY(fovRect.y);
    const fovW = (fovRect.width / viewW) * width;
    const fovH = (fovRect.height / viewH) * height;

    ctx.strokeStyle = isDark ? '#5b8ac0' : '#3a6699';
    ctx.lineWidth = 1;
    ctx.strokeRect(fovX1, fovY1, fovW, fovH);

    // Optical Boresight Center Marker
    const camCenterX = toCanvasX(cameraCenter.x);
    const camCenterY = toCanvasY(cameraCenter.y);
    ctx.strokeStyle = isDark ? '#5b8ac0' : '#3a6699';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(camCenterX - 6, camCenterY);
    ctx.lineTo(camCenterX + 6, camCenterY);
    ctx.moveTo(camCenterX, camCenterY - 6);
    ctx.lineTo(camCenterX, camCenterY + 6);
    ctx.stroke();

    // Render Each Target Beacon
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const isPrimary = t.id === primaryBeaconId;
      const tx = toCanvasX(t.x);
      const ty = toCanvasY(t.y);
      const beaconColor = t.color || '#5b8ac0';
      const baseDim = Math.max(8, (t.size / viewW) * width * 1.5);

      // Primary selection circle indicator (thin 1px)
      if (isPrimary) {
        ctx.strokeStyle = isDark ? '#3fae6a' : '#2a8a50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tx, ty, baseDim * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw beacon geometry
      switch (t.shape) {
        case 'square': {
          const sHalf = baseDim / 2;
          ctx.fillStyle = beaconColor;
          ctx.fillRect(tx - sHalf, ty - sHalf, baseDim, baseDim);
          ctx.strokeStyle = isDark ? '#ffffff' : '#1b1d21';
          ctx.lineWidth = 1;
          ctx.strokeRect(tx - sHalf, ty - sHalf, baseDim, baseDim);
          break;
        }
        case 'circle': {
          const rad = baseDim / 2;
          ctx.fillStyle = beaconColor;
          ctx.beginPath();
          ctx.arc(tx, ty, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = isDark ? '#ffffff' : '#1b1d21';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;
        }
        case 'gaussian_spot': {
          const spotRad = baseDim * 1.1;
          const gGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, spotRad);
          gGrad.addColorStop(0, '#ffffff');
          gGrad.addColorStop(0.4, beaconColor);
          gGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gGrad;
          ctx.beginPath();
          ctx.arc(tx, ty, spotRad, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'cross': {
          const armLen = baseDim * 0.8;
          const barWidth = Math.max(2, baseDim * 0.25);
          const bHalf = barWidth / 2;
          ctx.fillStyle = beaconColor;
          ctx.fillRect(tx - armLen, ty - bHalf, armLen * 2, barWidth);
          ctx.fillRect(tx - bHalf, ty - armLen, barWidth, armLen * 2);
          break;
        }
      }

      // Detection box: Thin 1px outline
      const boxSize = Math.max(20, baseDim * 1.8);
      ctx.strokeStyle = isPrimary
        ? isDark
          ? '#3fae6a'
          : '#2a8a50'
        : isDark
        ? '#5b8ac0'
        : '#3a6699';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - boxSize / 2, ty - boxSize / 2, boxSize, boxSize);

      // Clean 1px text label (No glowing badge enclosure)
      const tagText = isPrimary ? `[${t.id}] Primary` : `[${t.id}]`;
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = isDark ? '#e6e7e9' : '#1b1d21';
      ctx.fillText(tagText, tx - boxSize / 2, ty - boxSize / 2 - 3);
    }

    // Scale bar in bottom-left corner
    // 200 virtual pixels in scene coordinates
    const scaleBarPx = (200 / viewW) * width;
    const barX = 14;
    const barY = height - 16;
    ctx.strokeStyle = isDark ? '#e6e7e9' : '#1b1d21';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(barX, barY - 3);
    ctx.lineTo(barX, barY);
    ctx.lineTo(barX + scaleBarPx, barY);
    ctx.lineTo(barX + scaleBarPx, barY - 3);
    ctx.stroke();

    ctx.fillStyle = isDark ? '#9a9da3' : '#5c6068';
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('200 px · 2.0°', barX, barY - 6);
  }, [
    targets,
    cameraConfig,
    cameraCenter,
    fovRect,
    drawnPoints,
    primaryBeaconId,
    zoom,
    pan,
    themeTick,
  ]);

  return (
    <div className="flex flex-col h-full bg-panel rounded-sm border border-line overflow-hidden">
      {/* Viewport Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg">Virtual scene</span>
          <span className="font-mono-tabular text-dim">
            {cameraConfig.screenWidth} × {cameraConfig.screenHeight} px
          </span>
          {zoom > 1 && (
            <span className="font-mono-tabular text-muted">
              ({zoom.toFixed(1)}×)
            </span>
          )}
        </div>

        {/* Viewport Controls: Draw path, Zoom In, Zoom Out, Reset */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsDrawMode(!isDrawMode)}
            className={`flex h-6 items-center gap-1 rounded-sm border px-2 text-[11px] transition-colors duration-100 ${
              isDrawMode
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
            }`}
            title="Click and drag on the scene to draw a target trajectory"
          >
            <Pencil className="size-3" aria-hidden="true" />
            <span>{isDrawMode ? 'Drawing' : 'Draw path'}</span>
          </button>

          {(isCustomPathActive || drawnPoints.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setDrawnPoints([]);
                onClearCustomPath();
              }}
              className="flex size-6 items-center justify-center rounded-sm border border-line bg-panel-2 text-err hover:bg-panel-hover"
              title="Clear custom path"
            >
              <Trash2 className="size-3" aria-hidden="true" />
            </button>
          )}

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
          width={600}
          height={600}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setHoverCoords(null)}
          onWheel={handleWheel}
          className={`w-full max-w-[600px] aspect-square touch-none ${
            isDrawMode ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
          title={isDrawMode ? 'Draw target trajectory' : 'Click beacon to select, click background to teleport target'}
        />

        {/* Live Coordinate & Scale Overlay */}
        <div className="absolute top-2 right-2 pointer-events-none flex items-center gap-2 rounded-sm border border-line bg-panel/90 px-2 py-0.5 text-[11px] font-mono-tabular text-muted backdrop-blur-xs">
          {hoverCoords ? (
            <span>
              X: {Math.round(hoverCoords.x)} px · Y: {Math.round(hoverCoords.y)} px
            </span>
          ) : (
            <span>Center: ({Math.round(cameraCenter.x)}, {Math.round(cameraCenter.y)})</span>
          )}
        </div>
      </div>
    </div>
  );
};
