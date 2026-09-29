/**
 * Top chrome: menu bar + mode tabs with run controls.
 */

import React from 'react';
import { Pause, Play, RotateCcw, Moon, Sun } from 'lucide-react';
import { Menu, MenuBar } from './shell/MenuBar';
import { SHORTCUTS, ShortcutId, withShortcut } from './shell/shortcuts';

export type AppPage = 'simulation' | 'benchmark' | 'webcam' | 'reports';

export const PAGES: ReadonlyArray<{ id: AppPage; label: string; shortcut: ShortcutId }> = [
  { id: 'simulation', label: 'Simulation', shortcut: 'modeSimulation' },
  { id: 'benchmark', label: 'Benchmark video', shortcut: 'modeBenchmark' },
  { id: 'webcam', label: 'Webcam', shortcut: 'modeWebcam' },
  { id: 'reports', label: 'Reports', shortcut: 'modeReports' },
];

interface HeaderProps {
  page: AppPage;
  setPage: (p: AppPage) => void;
  menus?: Menu[];
  isRunning: boolean;
  onToggleRunning: () => void;
  onReset: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
}

const toolButton =
  'flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] transition-colors duration-100';
const neutral = 'border-line bg-panel text-fg hover:bg-panel-hover';

export const Header: React.FC<HeaderProps> = ({
  page,
  setPage,
  menus = [],
  isRunning,
  onToggleRunning,
  onReset,
  isDark,
  onToggleTheme,
  isRecording,
  onToggleRecording,
}) => {
  return (
    <header className="shrink-0">
      <div className="flex h-7 items-stretch border-b border-line bg-panel">
        <div className="flex items-center gap-1.5 pl-3 pr-2">
          <img 
            src="/logo.jpeg" 
            alt="Lakshya Logo" 
            className="h-5 w-5 object-contain rounded"
          />
          <span className="text-[13px] font-semibold text-fg">Lakshya</span>
          <span className="font-mono-tabular text-[11px] text-dim">2.6</span>
        </div>
        <MenuBar menus={menus} />
      </div>

      <div className="flex h-10 items-stretch justify-between border-b border-line bg-bg pr-2">
        <div role="tablist" aria-label="Mode" className="flex items-stretch">
          {PAGES.map((p) => {
            const active = page === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-keyshortcuts={SHORTCUTS[p.shortcut].keys}
                title={withShortcut(p.label, p.shortcut)}
                onClick={() => setPage(p.id)}
                className={`border-b-2 px-4 text-[13px] transition-colors duration-100 focus-visible:outline-offset-[-2px] ${
                  active
                    ? 'border-accent text-fg'
                    : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Simulation controls">
          <button
            type="button"
            onClick={onToggleRunning}
            aria-keyshortcuts="Space"
            title={withShortcut(isRunning ? 'Pause' : 'Run', 'runPause')}
            className={`${toolButton} w-20 justify-center ${
              isRunning ? neutral : 'border-accent bg-accent text-accent-fg hover:bg-accent-hover'
            }`}
          >
            {isRunning ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
            {isRunning ? 'Pause' : 'Run'}
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-keyshortcuts="R"
            title={withShortcut('Reset scenario', 'reset')}
            className={`${toolButton} ${neutral}`}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            onClick={onToggleRecording}
            aria-pressed={isRecording}
            aria-keyshortcuts="L"
            title={withShortcut(isRecording ? 'Stop recording' : 'Start recording', 'record')}
            className={`${toolButton} ${neutral} w-24 justify-center`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${isRecording ? 'bg-err' : 'border border-muted'}`}
            />
            {isRecording ? 'Stop rec' : 'Record'}
          </button>
          <div className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-keyshortcuts="T"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={withShortcut(isDark ? 'Light theme' : 'Dark theme', 'theme')}
            className={`${toolButton} ${neutral} w-8 justify-center px-0`}
          >
            {isDark ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
};
