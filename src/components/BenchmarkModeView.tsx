/**
 * Benchmark Mode View (Direct Video Input Bypass)
 * Executes detection, sub-pixel centroiding, Kalman tracking,
 * and PID loop directly on external video or FSOC field footage.
 * Restyled for desktop workstation presentation:
 * - 1.5px non-gradient charts with dashed spec threshold lines
 * - Compact scorecards with status dots instead of pills
 * - Clean technical labels with units
 */

import React, { useRef, useState, useEffect } from 'react';
import { BenchmarkVideoEngine } from '../core/benchmarkVideo';
import { CentroidResult, KalmanState, TrackingState, PerformanceMetrics, ThresholdEvaluation } from '../types';
import { Upload, Play, Pause, RotateCcw, Video, Download, AlertTriangle } from 'lucide-react';

interface BenchmarkModeViewProps {
  engine: BenchmarkVideoEngine;
  centroidResult: CentroidResult;
  kalmanState: KalmanState;
  trackingState: TrackingState;
  panCmdDegS: number;
  tiltCmdDegS: number;
  metrics: PerformanceMetrics;
  thresholds: ThresholdEvaluation;
  onExportReport: () => void;
  errorHistory?: number[];
  fpsHistory?: number[];
  currentError?: number;
  hasActiveFrame?: boolean;
  onResetBenchmark?: () => void;
}

export const BenchmarkModeView: React.FC<BenchmarkModeViewProps> = ({
  engine,
  centroidResult,
  kalmanState,
  trackingState,
  panCmdDegS,
  tiltCmdDegS,
  metrics,
  thresholds,
  onExportReport,
  errorHistory = [],
  fpsHistory = [],
  currentError = 0,
  hasActiveFrame = false,
  onResetBenchmark,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isRawView, setIsRawView] = useState(false);
  const [, setTick] = useState(0);

  const errorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fpsCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getThemePalette = () => {
    const isDark =
      document.documentElement.dataset.theme !== 'light' &&
      !document.documentElement.classList.contains('light');
    return {
      bg: isDark ? '#111214' : '#ffffff',
      grid: isDark ? 'rgba(154, 157, 163, 0.12)' : 'rgba(213, 216, 221, 0.65)',
      border: isDark ? '#34363b' : '#d5d8dd',
      textMuted: isDark ? '#9a9da3' : '#5c6068',
      textDim: isDark ? '#80848b' : '#6b6f76',
      errorLine: isDark ? '#5b8ac0' : '#3a6699',
      fpsLine: isDark ? '#3fae6a' : '#2a8a50',
      threshLine: isDark ? '#e05252' : '#c23a3a',
    };
  };

  // Render Live Tracking Error Graph (1.5px solid line, no gradient)
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

    // Faint Gridlines
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

    // 10px ISRO Threshold line
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

  // Render Live FPS Graph (1.5px solid line, no gradient)
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

    // Faint Gridlines
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

    // 20 FPS Threshold line
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

  const togglePlay = () => {
    if (engine.state.isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
    setTick((t) => t + 1);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onResetBenchmark?.();
      engine.loadVideoFile(file);
      setTick((t) => t + 1);
    }
  };

  const handleSelectPreset = (preset: 'preloaded_isro_benchmark' | 'field_data_test') => {
    onResetBenchmark?.();
    engine.loadPreloadedBenchmark(preset);
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-3">
      {/* Top Banner Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-sm bg-panel border border-line">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="font-semibold text-fg">Benchmark mode</span>
          <span>·</span>
          <span>Bypasses virtual scene and runs detector loop directly on video frames</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            onClick={(e) => {
              (e.target as HTMLInputElement).value = '';
            }}
            accept="video/mp4,video/webm"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2.5 rounded-sm border border-line bg-panel-2 hover:bg-panel-hover text-[12px] text-fg flex items-center gap-1.5 transition-colors duration-100"
          >
            <Upload className="size-3.5" aria-hidden="true" />
            <span>Load MP4 / WebM</span>
          </button>
        </div>
      </div>

      {/* Main Video Viewport & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left 2 Cols: Video Frame */}
        <div className="lg:col-span-2 flex flex-col bg-panel rounded-sm border border-line overflow-hidden">
          <div className="flex h-8 items-center justify-between px-3 border-b border-line text-[12px]">
            <span className="font-semibold text-fg">Input video feed</span>
            <button
              type="button"
              onClick={() => setIsRawView(!isRawView)}
              className="h-6 px-2 text-[11px] font-mono-tabular rounded-sm border border-line bg-panel-2 text-fg hover:bg-panel-hover"
            >
              {isRawView ? 'Raw video' : 'Detection overlay'}
            </button>
          </div>

          <div className="relative flex-1 min-h-[360px] bg-canvas-bg flex items-center justify-center p-2">
            {engine.state.error ? (
              <div className="p-6 text-center max-w-md space-y-2 text-[12px]">
                <AlertTriangle className="size-6 text-err mx-auto" />
                <div className="font-medium text-fg">Video playback issue</div>
                <div className="text-muted font-mono-tabular">{engine.state.error}</div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 h-7 px-3 rounded-sm border border-line bg-panel-2 hover:bg-panel-hover text-fg inline-flex items-center gap-1.5"
                >
                  <Upload className="size-3" />
                  <span>Choose another video file</span>
                </button>
              </div>
            ) : (
              <>
                <canvas
                  id="benchmark-video-canvas"
                  width={640}
                  height={480}
                  className="w-full max-w-[640px] aspect-[4/3] rounded-sm border border-line"
                />

                {!isRawView && hasActiveFrame && (
                  <div className="absolute top-4 left-4 pointer-events-none text-[11px] font-mono-tabular text-muted bg-panel/90 p-2 rounded-sm border border-line backdrop-blur-xs space-y-0.5">
                    <div>State: <span className="text-fg font-medium">{trackingState}</span></div>
                    <div>Moment: ({centroidResult.momentX.toFixed(1)}, {centroidResult.momentY.toFixed(1)})</div>
                    <div>Gaussian: ({centroidResult.gaussianX.toFixed(2)}, {centroidResult.gaussianY.toFixed(2)})</div>
                    <div>R² fit: {centroidResult.rSquared.toFixed(3)} (Δ {centroidResult.offsetDiffPx.toFixed(3)} px)</div>
                    <div>Gimbal: Pan {panCmdDegS.toFixed(1)}°/s · Tilt {tiltCmdDegS.toFixed(1)}°/s</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Scrub Bar & Player Controls */}
          <div className="h-10 px-3 border-t border-line bg-panel-2 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex size-7 items-center justify-center rounded-sm border border-line bg-panel hover:bg-panel-hover text-fg transition-colors duration-100"
              title={engine.state.isPlaying ? 'Pause' : 'Play'}
            >
              {engine.state.isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                onResetBenchmark?.();
                engine.seek(0);
                engine.pause();
                setTick((t) => t + 1);
              }}
              className="flex size-7 items-center justify-center rounded-sm border border-line bg-panel hover:bg-panel-hover text-fg transition-colors duration-100"
              title="Reset video playback"
            >
              <RotateCcw className="size-3.5" />
            </button>

            <input
              type="range"
              min="0"
              max={engine.state.duration || 1}
              step="0.05"
              value={engine.state.currentTime}
              onChange={(e) => {
                engine.seek(parseFloat(e.target.value));
                setTick((t) => t + 1);
              }}
              className="flex-1 accent-accent h-1.5 bg-line rounded-sm"
            />

            <span className="font-mono-tabular text-[11px] text-muted">
              {engine.state.currentTime.toFixed(1)} / {engine.state.duration.toFixed(1)} s
            </span>
          </div>
        </div>

        {/* Right 1 Col: Presets & Evaluation Card */}
        <div className="space-y-3">
          {/* Preset Selector */}
          <div className="p-3 rounded-sm bg-panel border border-line space-y-2">
            <div className="text-[12px] font-semibold text-fg flex items-center gap-1.5">
              <Video className="size-3.5 text-accent" />
              <span>Reference video scenarios</span>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleSelectPreset('preloaded_isro_benchmark')}
                className={`w-full p-2 rounded-sm border text-left text-[12px] transition-colors duration-100 ${
                  engine.state.videoSourceType === 'preloaded_isro_benchmark'
                    ? 'border-accent bg-accent-subtle font-medium text-fg'
                    : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
                }`}
              >
                <div>Synthetic turbulent beam (Cₙ² scintillation)</div>
                <div className="text-[11px] text-muted">Atmospheric beacon wander with additive noise</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('field_data_test')}
                className={`w-full p-2 rounded-sm border text-left text-[12px] transition-colors duration-100 ${
                  engine.state.videoSourceType === 'field_data_test'
                    ? 'border-accent bg-accent-subtle font-medium text-fg'
                    : 'border-line bg-panel-2 text-fg hover:bg-panel-hover'
                }`}
              >
                <div>Field footage: horizon clutter</div>
                <div className="text-[11px] text-muted">Specular reflections and low-contrast background</div>
              </button>
            </div>
          </div>

          {/* Benchmark Scorecard */}
          <div className="p-3 rounded-sm bg-panel border border-line space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-fg">Scorecard</span>
              <button
                type="button"
                onClick={onExportReport}
                className="flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                <Download className="size-3" />
                <span>Export report</span>
              </button>
            </div>

            <div className="space-y-1.5 text-[12px]">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Tracking error:</span>
                <span className="flex items-center gap-1.5 font-mono-tabular">
                  {hasActiveFrame && (trackingState === 'TRACKING' || trackingState === 'ACQUIRED' || (metrics.lockedFrames > 0 && metrics.avgErrorPx > 0)) ? (
                    <>
                      <span>{metrics.avgErrorPx.toFixed(2)} px</span>
                      <span className="text-[11px] text-dim">≤ 10 px</span>
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${thresholds.trackingErrorPass ? 'bg-ok' : 'bg-err'}`}
                      />
                    </>
                  ) : (
                    <span className="text-dim">--</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Acquisition time:</span>
                <span className="flex items-center gap-1.5 font-mono-tabular">
                  {hasActiveFrame && metrics.acquisitionTimeSec > 0 ? (
                    <>
                      <span>{metrics.acquisitionTimeSec.toFixed(2)} s</span>
                      <span className="text-[11px] text-dim">≤ 2.0 s</span>
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${thresholds.acquisitionTimePass ? 'bg-ok' : 'bg-err'}`}
                      />
                    </>
                  ) : (
                    <span className="text-dim">--</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Centroid offset:</span>
                <span className="font-mono-tabular font-medium text-fg">
                  {hasActiveFrame && centroidResult.detected ? `±${metrics.centroidingErrorPx.toFixed(3)} px` : '--'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Lock retention:</span>
                <span className="font-mono-tabular font-medium text-fg">
                  {hasActiveFrame && metrics.acquisitionTimeSec > 0 ? `${metrics.lockRetentionRatePct.toFixed(1)}%` : '--'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Telemetry Graphs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-2 rounded-sm border border-line bg-panel space-y-1">
          <div className="flex items-center justify-between text-[12px] px-1">
            <span className="text-muted">Tracking error (px)</span>
            <span className="font-mono-tabular font-medium text-fg">
              {hasActiveFrame ? `${currentError.toFixed(2)} px` : '--'}
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
              {hasActiveFrame ? `${metrics.fps.toFixed(1)} FPS` : '--'}
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
