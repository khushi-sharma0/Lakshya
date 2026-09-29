/**
 * Real Webcam Mode View
 * Feeds live camera frames into detection and Kalman tracking.
 * Desktop workstation presentation:
 * - 1.5px solid chart lines with faint grid
 * - Plain technical labels and units
 * - Status dots instead of pills
 */

import React, { useEffect, useState, useRef } from 'react';
import { WebcamEngine } from '../core/webcam';
import { CentroidResult, KalmanState, TrackingState, PerformanceMetrics } from '../types';
import { Camera, AlertTriangle, RefreshCw } from 'lucide-react';

interface WebcamModeViewProps {
  webcamEngine: WebcamEngine;
  centroidResult: CentroidResult;
  kalmanState: KalmanState;
  trackingState: TrackingState;
  metrics: PerformanceMetrics;
  errorHistory?: number[];
  fpsHistory?: number[];
  currentError?: number;
  hasActiveFrame?: boolean;
  onResetWebcam?: () => void;
}

export const WebcamModeView: React.FC<WebcamModeViewProps> = ({
  webcamEngine,
  centroidResult,
  trackingState,
  metrics,
  errorHistory = [],
  fpsHistory = [],
  currentError = 0,
  hasActiveFrame = false,
  onResetWebcam,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fpsCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const startCamera = async () => {
    onResetWebcam?.();
    setLoading(true);
    setError(null);
    const success = await webcamEngine.startWebcam();
    setLoading(false);
    if (!success) {
      setError(webcamEngine.error || 'Failed to activate webcam.');
    }
  };

  const stopCamera = () => {
    webcamEngine.stopWebcam();
    onResetWebcam?.();
  };

  useEffect(() => {
    if (!webcamEngine.isActive && !error) {
      startCamera();
    }
  }, []);

  const getThemePalette = () => {
    const isDark =
      document.documentElement.dataset.theme !== 'light' &&
      !document.documentElement.classList.contains('light');
    return {
      bg: isDark ? '#111214' : '#ffffff',
      grid: isDark ? 'rgba(154, 157, 163, 0.12)' : 'rgba(213, 216, 221, 0.65)',
      border: isDark ? '#34363b' : '#d5d8dd',
      textDim: isDark ? '#80848b' : '#6b6f76',
      errorLine: isDark ? '#5b8ac0' : '#3a6699',
      fpsLine: isDark ? '#3fae6a' : '#2a8a50',
      threshLine: isDark ? '#e05252' : '#c23a3a',
    };
  };

  // Render Live Tracking Error Graph (1.5px solid line)
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
    const toY = (val: number) => h - (Math.min(maxVal, val) / maxVal) * (h - 22) - 11;

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    [5, 15, 20].forEach((lvl) => {
      const y = toY(lvl);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = palette.textDim;
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`${lvl}`, 4, y - 2);
    });

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
    ctx.fillText('10 px (spec max)', w - 100, threshY - 3);

    if (errorHistory.length > 1 && hasActiveFrame) {
      ctx.strokeStyle = palette.errorLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = w / Math.max(1, errorHistory.length - 1);
      for (let i = 0; i < errorHistory.length; i++) {
        const x = i * step;
        const y = toY(errorHistory[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [errorHistory, hasActiveFrame]);

  // Render Live FPS Graph (1.5px solid line)
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

    const maxVal = 60;
    const toY = (val: number) => h - (Math.min(maxVal, val) / maxVal) * (h - 22) - 11;

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    [10, 30, 50].forEach((lvl) => {
      const y = toY(lvl);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = palette.textDim;
      ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`${lvl}`, 4, y - 2);
    });

    const threshY = toY(20);
    ctx.strokeStyle = palette.fpsLine;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = palette.fpsLine;
    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('20 FPS (spec min)', w - 100, threshY - 3);

    if (fpsHistory.length > 1 && hasActiveFrame) {
      ctx.strokeStyle = palette.fpsLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = w / Math.max(1, fpsHistory.length - 1);
      for (let i = 0; i < fpsHistory.length; i++) {
        const x = i * step;
        const y = toY(fpsHistory[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [fpsHistory, hasActiveFrame]);

  return (
    <div className="space-y-3">
      {/* Top Banner Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-sm bg-panel border border-line">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="font-semibold text-fg">Webcam mode</span>
          <span>·</span>
          <span>Live camera input with multi-beacon centroid detection</span>
        </div>

        <div className="flex items-center gap-2">
          {webcamEngine.isActive ? (
            <button
              type="button"
              onClick={stopCamera}
              className="h-7 px-2.5 rounded-sm border border-line bg-panel-2 hover:bg-panel-hover text-[12px] text-fg transition-colors duration-100"
            >
              Stop stream
            </button>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              disabled={loading}
              className="h-7 px-2.5 rounded-sm border border-accent bg-accent text-accent-fg hover:bg-accent-hover text-[12px] transition-colors duration-100 disabled:opacity-50"
            >
              {loading ? 'Activating...' : 'Start webcam'}
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport & Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left 2 Cols: Live Video Frame */}
        <div className="lg:col-span-2 flex flex-col bg-panel rounded-sm border border-line overflow-hidden">
          <div className="flex h-8 items-center justify-between px-3 border-b border-line text-[12px]">
            <span className="font-semibold text-fg">Live webcam stream</span>
            <span className="font-mono-tabular text-[11px] text-dim">640 × 480 px</span>
          </div>

          <div className="relative flex-1 min-h-[360px] bg-canvas-bg flex items-center justify-center p-2">
            {error ? (
              <div className="p-6 text-center max-w-md space-y-2 text-[12px]">
                <AlertTriangle className="size-6 text-err mx-auto" />
                <div className="font-medium text-fg">Camera access issue</div>
                <div className="text-muted font-mono-tabular">{error}</div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="mt-2 h-7 px-3 rounded-sm border border-line bg-panel-2 hover:bg-panel-hover text-fg inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="size-3" />
                  <span>Retry</span>
                </button>
              </div>
            ) : !webcamEngine.isActive ? (
              <div className="p-6 text-center space-y-2 text-[12px]">
                <Camera className="size-8 text-dim mx-auto" />
                <div className="text-muted">Camera stream stopped</div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="h-7 px-3 rounded-sm border border-accent bg-accent text-accent-fg hover:bg-accent-hover"
                >
                  Start camera
                </button>
              </div>
            ) : (
              <canvas
                id="webcam-tracking-canvas"
                width={640}
                height={480}
                className="w-full max-w-[640px] aspect-[4/3] rounded-sm border border-line"
              />
            )}
          </div>
        </div>

        {/* Right 1 Col: Instructions & Status */}
        <div className="space-y-3">
          <div className="p-3 rounded-sm bg-panel border border-line space-y-2 text-[12px]">
            <div className="font-semibold text-fg">Detection instructions</div>
            <p className="text-muted leading-relaxed text-[11px]">
              Direct one or more optical light sources (LED torch, smartphone flash, or laser spot) towards the webcam. The detector identifies optical centroids and updates tracking state in real time.
            </p>
            <div className="p-2 rounded-sm bg-panel-2 border border-line font-mono-tabular text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-muted">Frame rate:</span>
                <span className="text-fg font-medium">{hasActiveFrame && metrics.fps > 0 ? `${metrics.fps.toFixed(1)} FPS` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tracker state:</span>
                <span className="text-fg font-medium">{hasActiveFrame ? trackingState : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Centroid offset:</span>
                <span className="text-fg font-medium">{hasActiveFrame && centroidResult.detected ? `±${centroidResult.offsetDiffPx.toFixed(3)} px` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Fit R²:</span>
                <span className="text-fg font-medium">{hasActiveFrame && centroidResult.detected ? centroidResult.rSquared.toFixed(3) : '--'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Telemetry Graphs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-2 rounded-sm border border-line bg-panel space-y-1">
          <div className="flex items-center justify-between text-[12px] px-1">
            <span className="text-muted">Boresight tracking error (px)</span>
            <span className="font-mono-tabular font-medium text-fg">
              {hasActiveFrame && (trackingState === 'TRACKING' || trackingState === 'ACQUIRED')
                ? `${currentError.toFixed(2)} px`
                : '--'}
            </span>
          </div>
          <div className="h-28 rounded-sm overflow-hidden border border-line bg-canvas-bg">
            <canvas ref={errorCanvasRef} width={480} height={112} className="w-full h-full" />
          </div>
        </div>

        <div className="p-2 rounded-sm border border-line bg-panel space-y-1">
          <div className="flex items-center justify-between text-[12px] px-1">
            <span className="text-muted">Processing rate (FPS)</span>
            <span className="font-mono-tabular font-medium text-fg">
              {hasActiveFrame && metrics.fps > 0 ? `${metrics.fps.toFixed(1)} FPS` : '--'}
            </span>
          </div>
          <div className="h-28 rounded-sm overflow-hidden border border-line bg-canvas-bg">
            <canvas ref={fpsCanvasRef} width={480} height={112} className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
