import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Play,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Cpu,
  Zap,
  Activity,
  Code2,
  RotateCw,
} from 'lucide-react';
import { FrameLogEntry } from '../types';

interface PythonEnginePageProps {
  frameLogs: FrameLogEntry[];
}

export const PythonEnginePage: React.FC<PythonEnginePageProps> = ({ frameLogs }) => {
  const [selectedFile, setSelectedFile] = useState<string>('optical_tracker.py');
  const [sources, setSources] = useState<Record<string, string>>({});
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tracker' | 'evaluator' | 'custom'>('tracker');
  const [customCode, setCustomCode] = useState<string>(
`# Lakshya Custom Python Algorithm Experiment
from optical_tracker import GaussianCentroidFit, KalmanTracker2D, PointingGimbalPID
import math

print("=== Running Custom Python 3.10 Optical Tracking Test ===")
tracker = KalmanTracker2D(init_x=320.0, init_y=240.0)
pid = PointingGimbalPID(kp=3.6, ki=0.12, kd=0.28, kff=0.8)

# Simulate 5 frames of beacon moving across sensor
for f in range(5):
    meas_x = 320.0 + f * 12.0
    meas_y = 240.0 + f * 8.0
    pred_x, pred_y = tracker.predict(1.0/30.0)
    state = tracker.update(meas_x, meas_y, confidence=0.95)
    cmd = pid.compute(state["x"], state["y"], state["vx"], state["vy"])
    print(f"Frame {f+1}: Meas=({meas_x:.1f}, {meas_y:.1f}) -> Kalman=({state['x']:.1f}, {state['y']:.1f}), PanCmd={cmd['pan_cmd_deg_s']} deg/s")

print("\\n[SUCCESS] Custom Python tracking execution completed.")
`
  );
  const [terminalOutput, setTerminalOutput] = useState<string>(
    'Lakshya Python 3.10.12 Subprocess Environment Ready.\nClick "Run in Python 3.10" to execute optical tracking or benchmark algorithms.'
  );
  const [execTimeMs, setExecTimeMs] = useState<number | null>(null);
  const [pythonStatus, setPythonStatus] = useState<{ available: boolean; runtime?: string; algorithms?: string[] }>({
    available: true,
    runtime: 'Python 3.10.12 (CPython Linux)',
  });

  // Fetch Python sources and backend status
  useEffect(() => {
    fetch('/api/python/sources')
      .then((res) => res.json())
      .then((data) => {
        if (data.sources) {
          setSources(data.sources);
        }
        setIsLoadingSources(false);
      })
      .catch(() => {
        setIsLoadingSources(false);
      });

    fetch('/api/python/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.available) {
          setPythonStatus(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleCopy = () => {
    const code = sources[selectedFile] || '';
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runPythonTrackerTest = async () => {
    setIsRunning(true);
    setTerminalOutput('Running optical_tracker.py via Python 3.10 subprocess...\n');
    try {
      const res = await fetch('/api/python/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dt: 0.0333,
          meas_x: 335.5,
          meas_y: 248.2,
          is_detected: true,
          confidence: 0.98,
          camera_cfg: { fovXDeg: 4.0, fovYDeg: 3.0, resolutionWidth: 640, resolutionHeight: 480 },
        }),
      });
      const data = await res.json();
      setTerminalOutput(
        `>>> Python 3.10 subprocess execution succeeded!\n\n${JSON.stringify(data, null, 2)}\n\n` +
        `Algorithm: Discrete 4-State Kalman Filter + Closed-Loop Gimbal PID\n` +
        `Measured Position: (335.5, 248.2) px\n` +
        `Estimated Position: (${data.kalman?.x}, ${data.kalman?.y}) px\n` +
        `Estimated Velocity: (${data.kalman?.vx}, ${data.kalman?.vy}) px/s\n` +
        `Pan Velocity Cmd: ${data.pid?.pan_cmd_deg_s} deg/s (max slew 5.0 deg/s)\n` +
        `Tilt Velocity Cmd: ${data.pid?.tilt_cmd_deg_s} deg/s\n` +
        `Optical Error: ${data.pid?.error_px} px`
      );
    } catch (err: any) {
      setTerminalOutput(`Error executing Python tracker: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runPythonBenchmarkEvaluator = async () => {
    setIsRunning(true);
    setTerminalOutput('Submitting simulation telemetry to python_core/benchmark_evaluator.py...\n');
    try {
      const logsToSend = frameLogs.length > 0 ? frameLogs.slice(-150) : [];
      const res = await fetch('/api/python/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: logsToSend }),
      });
      const data = await res.json();
      setTerminalOutput(
        `=== ISRO PS 26169 Python Evaluation Report ===\n` +
        `Status: ${data.status}\n` +
        `All Criteria Passed: ${data.all_passed ? 'YES (PASS)' : 'NO (FAIL)'}\n` +
        `Passed Criteria: ${data.passed_count} of ${data.total_criteria}\n\n` +
        `--- Metrics Computed by Python ---\n` +
        `Acquisition Time: ${data.metrics?.acquisition_time_sec} s (Limit: <= 2.0 s) -> ${data.verdicts?.acquisition_time_pass ? 'PASS' : 'FAIL'}\n` +
        `Post-Lock Avg Error: ${data.metrics?.avg_error_px} px (Limit: <= 10.0 px) -> ${data.verdicts?.tracking_error_pass ? 'PASS' : 'FAIL'}\n` +
        `Post-Lock RMS Error: ${data.metrics?.rms_error_px} px\n` +
        `Target Loss Rate: ${data.metrics?.target_loss_rate_pct}% (Limit: < 5.0%) -> ${data.verdicts?.target_loss_rate_pass ? 'PASS' : 'FAIL'}\n` +
        `Re-acquisition Time: ${data.metrics?.reacquisition_time_sec} s (Limit: <= 1.0 s) -> ${data.verdicts?.reacquisition_time_pass ? 'PASS' : 'FAIL'}\n` +
        `Frame Processing Rate: ${data.metrics?.avg_fps} FPS (Limit: >= 20.0 FPS) -> ${data.verdicts?.frame_rate_pass ? 'PASS' : 'FAIL'}\n` +
        `Lock Retention Rate: ${data.metrics?.lock_retention_pct}% (Limit: >= 85.0%) -> ${data.verdicts?.lock_retention_pass ? 'PASS' : 'FAIL'}\n\n` +
        `Full JSON payload:\n${JSON.stringify(data, null, 2)}`
      );
    } catch (err: any) {
      setTerminalOutput(`Error executing Python evaluator: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runCustomCode = async () => {
    setIsRunning(true);
    setTerminalOutput('Executing custom code in Python 3.10 sandbox...\n');
    try {
      const res = await fetch('/api/python/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: customCode }),
      });
      const data = await res.json();
      setExecTimeMs(data.executionTimeMs);
      const out = (data.stdout || '') + (data.stderr ? `\n[STDERR]:\n${data.stderr}` : '');
      setTerminalOutput(out || '[Execution completed with no output]');
    } catch (err: any) {
      setTerminalOutput(`Execution error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto space-y-6 bg-slate-50 dark:bg-slate-950">
      {/* Top Banner: Python Dual-Engine Architecture */}
      <div className="p-4 md:p-5 rounded-2xl border border-cyan-500/20 bg-linear-to-r from-cyan-500/10 via-sky-500/5 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-cyan-600 dark:bg-cyan-500 flex items-center justify-center text-white shadow-md">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-display font-bold text-slate-900 dark:text-slate-100">
                Python 3.10 Optical Tracking & Evaluation Engine
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Dual-stack architecture: High-performance TypeScript frontend co-processing alongside native Python 3.10 algorithms for mathematical validation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 text-xs font-mono">
            <span className="text-slate-400">Runtime: </span>
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Python 3.10.12 (CPython)</span>
          </div>
        </div>
      </div>

      {/* Grid: Interactive Python Runner & Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Action Control & Code Editor (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* Action Tabs */}
          <div className="flex items-center justify-between p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('tracker')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'tracker'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Optical Tracker Test
              </button>

              <button
                onClick={() => setActiveTab('evaluator')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'evaluator'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                ISRO Benchmark Evaluator
              </button>

              <button
                onClick={() => setActiveTab('custom')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'custom'
                    ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Python REPL / Script
              </button>
            </div>

            <button
              onClick={() => {
                if (activeTab === 'tracker') runPythonTrackerTest();
                else if (activeTab === 'evaluator') runPythonBenchmarkEvaluator();
                else runCustomCode();
              }}
              disabled={isRunning}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs transition-all disabled:opacity-50"
            >
              {isRunning ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isRunning ? 'Executing...' : 'Run in Python 3.10'}</span>
            </button>
          </div>

          {/* Tab Description & Code Input */}
          {activeTab === 'tracker' && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-500" />
                python_core/optical_tracker.py
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Executes the Python implementation of the 2D Gaussian Sub-Pixel Moment Fit, Discrete Kalman Filter, and Gimbal Pointing PID Controller. Dispatches simulated sensor measurement to the native Python process and returns updated kinematics and velocity commands.
              </p>
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                <code>
                  from optical_tracker import GaussianCentroidFit, KalmanTracker2D, PointingGimbalPID<br />
                  tracker = KalmanTracker2D(q_pos=1.5, q_vel=8.0, r_pos=2.0)<br />
                  pid = PointingGimbalPID(kp=3.6, ki=0.12, kd=0.28, kff=0.8)
                </code>
              </div>
            </div>
          )}

          {activeTab === 'evaluator' && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-500" />
                python_core/benchmark_evaluator.py
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Pipes active simulation telemetry frames directly to Python to evaluate against the 6 official ISRO PS 26169 thresholds (Acquisition &le; 2.0s, Tracking Error &le; 10.0px post-lock, Loss Rate &lt; 5.0%, Reacquisition &le; 1.0s, FPS &ge; 20, Retention &ge; 85%).
              </p>
              <div className="text-[11px] font-mono text-slate-500">
                Telemetry frames buffered in memory: <strong>{frameLogs.length} frames</strong>
              </div>
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="flex-1 flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Interactive Python 3.10 Code Editor:</span>
                {execTimeMs !== null && <span>Last execution: {execTimeMs} ms</span>}
              </div>
              <textarea
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                rows={12}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 font-mono text-xs text-emerald-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-500 resize-y"
                placeholder="Write Python code to execute directly on the server..."
              />
            </div>
          )}

          {/* Terminal Output Window */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-500" />
                Python Execution Terminal
              </span>
              <button
                onClick={() => setTerminalOutput('')}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Clear
              </button>
            </div>
            <pre className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-[300px] leading-relaxed select-text whitespace-pre-wrap">
              {terminalOutput}
            </pre>
          </div>
        </div>

        {/* Right Column: Source Code Inspector (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Python Source Code
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-hidden"
              >
                <option value="optical_tracker.py">optical_tracker.py</option>
                <option value="benchmark_evaluator.py">benchmark_evaluator.py</option>
                <option value="api_bridge.py">api_bridge.py</option>
              </select>

              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                title="Copy Python source code"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col min-h-[480px]">
            <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>{selectedFile}</span>
              <span className="text-cyan-400">Python 3.10</span>
            </div>
            <pre className="p-3.5 flex-1 overflow-auto text-xs font-mono text-slate-300 leading-relaxed select-text">
              {isLoadingSources
                ? 'Loading source code...'
                : sources[selectedFile] || '# File not available'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
