import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SHORTCUTS } from './shortcuts';

export type HelpDialogKind = 'shortcuts' | 'about';

export function HelpDialog({ kind, onClose }: { kind: HelpDialogKind; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = kind === 'shortcuts' ? 'Keyboard shortcuts' : 'About Lakshya';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-sm border border-line bg-panel shadow-xl"
      >
        <div className="flex h-9 items-center justify-between border-b border-line pl-3 pr-1">
          <h2 id="help-dialog-title" className="text-[13px] font-semibold text-fg">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-panel-hover hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {kind === 'shortcuts' ? (
          <table className="w-full text-[13px]">
            <tbody>
              {Object.values(SHORTCUTS).map((s) => (
                <tr key={s.keys} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5 text-fg">{s.label}</td>
                  <td className="px-3 py-1.5 text-right">
                    <kbd className="rounded-sm border border-line bg-panel-2 px-1.5 py-0.5 font-mono-tabular text-[11px] text-muted">
                      {s.keys}
                    </kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="space-y-2 p-3 text-[13px] text-fg">
            <p>Lakshya 2.6 — coarse-alignment tracking simulator for mobile FSOC terminals.</p>
            <p className="text-muted">ISRO problem statement 26169. The tracker only receives rendered image data, never ground-truth positions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
