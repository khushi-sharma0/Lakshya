export const SHORTCUTS = {
  runPause: { keys: 'Space', label: 'Run / pause simulation' },
  reset: { keys: 'R', label: 'Reset scenario' },
  record: { keys: 'L', label: 'Start / stop recording' },
  addBeacon: { keys: '+', label: 'Add beacon' },
  removeBeacon: { keys: '-', label: 'Remove beacon' },
  monochrome: { keys: 'M', label: 'Toggle monochrome sensor' },
  adaptive: { keys: 'A', label: 'Toggle adaptive threshold' },
  theme: { keys: 'T', label: 'Toggle light / dark theme' },
  inspector: { keys: 'Ctrl+B', label: 'Show / hide inspector' },
  bottomPanel: { keys: 'Ctrl+J', label: 'Show / hide metrics panel' },
  modeSimulation: { keys: 'Ctrl+1', label: 'Simulation mode' },
  modeBenchmark: { keys: 'Ctrl+2', label: 'Benchmark video mode' },
  modeWebcam: { keys: 'Ctrl+3', label: 'Webcam mode' },
  modeReports: { keys: 'Ctrl+4', label: 'Reports' },
  exportReport: { keys: 'Ctrl+E', label: 'Export report' },
  help: { keys: '?', label: 'Keyboard shortcuts' },
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;

export const withShortcut = (label: string, id: ShortcutId) => `${label} (${SHORTCUTS[id].keys})`;
