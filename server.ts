import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  let PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const portIdx = process.argv.indexOf('--port');
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    const parsed = parseInt(process.argv[portIdx + 1]);
    if (parsed) PORT = parsed;
  }

  app.use(express.json({ limit: '25mb' }));

  // Helper to execute Python CLI bridge
   const runPythonCommand = (commandPayload: Record<string, unknown>): Promise<any> => {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const scriptPath = path.resolve(__dirname, 'python_core/api_bridge.py');
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const py = spawn(pyCmd, [scriptPath, JSON.stringify(commandPayload)], {
        cwd: __dirname,
      });

      py.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      py.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      py.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (e) {
          resolve({ raw_output: stdout, error: String(e) });
        }
      });
    });
  };

  // 1. Python Engine Status & Version
  app.get('/api/python/status', async (_req, res) => {
    try {
      const status = await runPythonCommand({ action: 'status' });
      res.json({
        available: true,
        ...status,
      });
    } catch (err: any) {
      res.status(500).json({
        available: false,
        error: err.message,
      });
    }
  });

  // 2. Python Tracking Step (Centroid + Kalman + PID)
  app.post('/api/python/track', async (req, res) => {
    try {
      const result = await runPythonCommand({
        action: 'track_step',
        ...req.body,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Python Benchmark Evaluator
  app.post('/api/python/eval', async (req, res) => {
    try {
      const result = await runPythonCommand({
        action: 'evaluate_benchmark',
        frames: req.body.frames || [],
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Execute Custom Python Code Snippet
  app.post('/api/python/run', (req, res) => {
    const code = req.body.code || '';
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const t0 = performance.now();
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(pyCmd, ['-c', code], {
      cwd: path.resolve(__dirname, 'python_core'),
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });

    py.on('close', (code) => {
      const durationMs = performance.now() - t0;
      res.json({
        exitCode: code,
        stdout,
        stderr,
        executionTimeMs: Math.round(durationMs * 100) / 100,
      });
    });
  });

  // 5. Retrieve Python Source Files for Interactive Inspection
  app.get('/api/python/sources', (_req, res) => {
    try {
      const dir = path.resolve(__dirname, 'python_core');
      const files = ['optical_tracker.py', 'benchmark_evaluator.py', 'api_bridge.py'];
      const sources: Record<string, string> = {};

      for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.existsSync(fullPath)) {
          sources[f] = fs.readFileSync(fullPath, 'utf8');
        }
      }
      res.json({ status: 'ok', sources });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mount Vite Middleware in Development
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lakshya Multi-Language Engine (TS + Python 3.10) active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Lakshya server:', err);
  process.exit(1);
});
