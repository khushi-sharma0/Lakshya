/**
 * Live Telemetry Charts & Loss Heatmap Component
 * Desktop workstation technical aesthetic (uPlot style):
 * - 1.5px lines, faint grid
 * - Axis titles with units
 * - Dashed spec-threshold lines (10 px error, 20 FPS rate)
 * - Interactive hover crosshair with sample readout
 * - Clean solid line rendering (no area gradients)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { LossLocation } from '../types';

interface LiveChartsProps {
  errorHistory: number[]; // rolling last ~100 samples
  fpsHistory: number[]; // rolling last ~100 samples
  lossLocations: LossLocation[];
  screenWidth: number;
  screenHeight: number;
  currentError: number;
  currentFps: number;
}

export const LiveCharts: React.FC<LiveChartsProps> = ({
  errorHistory,
  fpsHistory,
  lossLocations,
  screenWidth,
  screenHeight,
  currentError,
  currentFps,
}) => {
  const errorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fpsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hover states for crosshair tooltips
  const [errorHover, setErrorHover] = useState<{ index: number; val: number; x: number; y: number } | null>(null);
  const [fpsHover, setFpsHover] = useState<{ index: number; val: number; x: number; y: number } | null>(null);

  // Theme changes tracking
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  const getThemePalette = () => {
    const isDark =
      document.documentElement.dataset.theme !== 'light' &&
      !document.documentElement.classList.contains('light');
    return {
      bg: isDark ? '#111214' : '#ffffff',
      grid: isDark ? 'rgba(154, 157, 163, 0.12)' : 'rgba(213, 216, 221, 0.65)',
      textMuted: isDark ? '#9a9da3' : '#5c6068',
      textDim: isDark ? '#80848b' : '#6b6f76',
      border: isDark ? '#34363b' : '#d5d8dd',
      errorLine: isDark ? '#5b8ac0' : '#3a6699',
      fpsLine: isDark ? '#3fae6a' : '#2a8a50',
      threshLine: isDark ? '#e05252' : '#c23a3a',
      threshFpsLine: isDark ? '#3fae6a' : '#2a8a50',
      crosshair: isDark ? '#e6e7e9' : '#1b1d21',
    };
  };

  // Error Canvas mouse hover
  const handleErrorMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = errorCanvasRef.current;
      if (!canvas || errorHistory.length < 2) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const step = canvas.width / (errorHistory.length - 1);
      const index = Math.min(errorHistory.length - 1, Math.max(0, Math.round(x / step)));
      const val = errorHistory[index];
      const maxVal = 25;
      const y = canvas.height - (Math.min(maxVal, val) / maxVal) * (canvas.height - 24) - 12;
      setErrorHover({ index, val, x: index * step, y });
    },
    [errorHistory]
  );

  // FPS Canvas mouse hover
  const handleFpsMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = fpsCanvasRef.current;
      if (!canvas || fpsHistory.length < 2) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const step = canvas.width / (fpsHistory.length - 1);
      const index = Math.min(fpsHistory.length - 1, Math.max(0, Math.round(x / step)));
      const val = fpsHistory[index];
      const maxVal = 70;
      const y = canvas.height - (Math.min(maxVal, val) / maxVal) * (canvas.height - 24) - 12;
      setFpsHover({ index, val, x: index * step, y });
    },
    [fpsHistory]
  );

  // Render Rolling Error Chart
  useEffect(() => {
    const canvas = errorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const palette = getThemePalette();

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    const maxVal = 25;
    const toY = (val: number) => h - (Math.min(maxVal, val) / maxVal) * (h - 24) - 12;

    // Faint horizontal gridlines
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    [5, 15, 20].forEach((level) => {
      const y = toY(level);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = palette.textDim;
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`${level}`, 4, y - 2);
    });

    // Dashed 10px Spec Threshold Line
    const threshY = toY(10);
    ctx.strokeStyle = palette.threshLine;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = palette.threshLine;
    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('10 px (ISRO spec max)', w - 120, threshY - 3);

    // 1.5px Solid Error Curve (No area gradient)
    if (errorHistory.length > 1) {
      ctx.strokeStyle = palette.errorLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const step = w / (errorHistory.length - 1);
      for (let i = 0; i < errorHistory.length; i++) {
        const x = i * step;
        const y = toY(errorHistory[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Hover Crosshair
    if (errorHover) {
      ctx.strokeStyle = palette.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(errorHover.x, 0);
      ctx.lineTo(errorHover.x, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.fillStyle = palette.errorLine;
      ctx.beginPath();
      ctx.arc(errorHover.x, errorHover.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip tag
      const text = `${errorHover.val.toFixed(2)} px`;
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      const textWidth = ctx.measureText(text).width;
      const tagX = Math.max(4, Math.min(w - textWidth - 12, errorHover.x + 6));
      const tagY = Math.max(14, errorHover.y - 6);

      ctx.fillStyle = palette.bg;
      ctx.fillRect(tagX - 2, tagY - 10, textWidth + 6, 13);
      ctx.strokeStyle = palette.border;
      ctx.strokeRect(tagX - 2, tagY - 10, textWidth + 6, 13);
      ctx.fillStyle = palette.crosshair;
      ctx.fillText(text, tagX + 1, tagY);
    }
  }, [errorHistory, errorHover, themeTick]);

  // Render Rolling FPS Chart
  useEffect(() => {
    const canvas = fpsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const palette = getThemePalette();

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    const maxVal = 70;
    const toY = (val: number) => h - (Math.min(maxVal, val) / maxVal) * (h - 24) - 12;

    // Faint horizontal gridlines
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    [10, 30, 50].forEach((level) => {
      const y = toY(level);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = palette.textDim;
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`${level}`, 4, y - 2);
    });

    // Dashed 20 FPS Spec Threshold Line
    const threshY = toY(20);
    ctx.strokeStyle = palette.threshFpsLine;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = palette.threshFpsLine;
    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('20 FPS (ISRO spec min)', w - 120, threshY - 3);

    // 1.5px Solid FPS Curve (No area gradient)
    if (fpsHistory.length > 1) {
      ctx.strokeStyle = palette.fpsLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const step = w / (fpsHistory.length - 1);
      for (let i = 0; i < fpsHistory.length; i++) {
        const x = i * step;
        const y = toY(fpsHistory[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Hover Crosshair
    if (fpsHover) {
      ctx.strokeStyle = palette.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(fpsHover.x, 0);
      ctx.lineTo(fpsHover.x, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.fillStyle = palette.fpsLine;
      ctx.beginPath();
      ctx.arc(fpsHover.x, fpsHover.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip tag
      const text = `${fpsHover.val.toFixed(1)} FPS`;
      ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
      const textWidth = ctx.measureText(text).width;
      const tagX = Math.max(4, Math.min(w - textWidth - 12, fpsHover.x + 6));
      const tagY = Math.max(14, fpsHover.y - 6);

      ctx.fillStyle = palette.bg;
      ctx.fillRect(tagX - 2, tagY - 10, textWidth + 6, 13);
      ctx.strokeStyle = palette.border;
      ctx.strokeRect(tagX - 2, tagY - 10, textWidth + 6, 13);
      ctx.fillStyle = palette.crosshair;
      ctx.fillText(text, tagX + 1, tagY);
    }
  }, [fpsHistory, fpsHover, themeTick]);

  // Render Target Loss Heatmap
  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const palette = getThemePalette();

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle Grid
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Cross-hair center lines
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (lossLocations.length === 0) {
      ctx.fillStyle = palette.textDim;
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No loss events recorded', w / 2, h / 2 + 4);
      return;
    }

    // Draw discrete loss markers (1px dots with faint halo)
    for (const loc of lossLocations) {
      const hx = (loc.x / screenWidth) * (w - 16) + 8;
      const hy = (loc.y / screenHeight) * (h - 16) + 8;

      ctx.fillStyle = 'rgba(224, 82, 82, 0.25)';
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.threshLine;
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lossLocations, screenWidth, screenHeight, themeTick]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-panel rounded-sm border border-line">
      {/* 1. Tracking Error Chart */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-1 px-1 text-[12px]">
          <span className="text-muted">Tracking error (px)</span>
          <span className="font-mono-tabular font-medium text-fg">
            {currentError.toFixed(2)} px
          </span>
        </div>
        <div className="h-28 rounded-sm overflow-hidden border border-line bg-canvas-bg">
          <canvas
            ref={errorCanvasRef}
            width={320}
            height={112}
            className="w-full h-full cursor-crosshair"
            onMouseMove={handleErrorMouseMove}
            onMouseLeave={() => setErrorHover(null)}
          />
        </div>
      </div>

      {/* 2. Processing Speed Chart */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-1 px-1 text-[12px]">
          <span className="text-muted">Processing rate (FPS)</span>
          <span className="font-mono-tabular font-medium text-fg">
            {currentFps.toFixed(1)} FPS
          </span>
        </div>
        <div className="h-28 rounded-sm overflow-hidden border border-line bg-canvas-bg">
          <canvas
            ref={fpsCanvasRef}
            width={320}
            height={112}
            className="w-full h-full cursor-crosshair"
            onMouseMove={handleFpsMouseMove}
            onMouseLeave={() => setFpsHover(null)}
          />
        </div>
      </div>

      {/* 3. Spatial Target Loss Map */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-1 px-1 text-[12px]">
          <span className="text-muted">Spatial loss distribution</span>
          <span className="font-mono-tabular text-muted">
            {lossLocations.length} event{lossLocations.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="h-28 rounded-sm overflow-hidden border border-line bg-canvas-bg">
          <canvas
            ref={heatmapCanvasRef}
            width={320}
            height={112}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};
