import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export type MenuEntry =
  | {
      type: 'item';
      label: string;
      shortcut?: string;
      checked?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: 'separator' };

export interface Menu {
  label: string;
  items: MenuEntry[];
}

function MenuPopup({
  items,
  onClose,
  onMoveMenu,
}: {
  items: MenuEntry[];
  onClose: () => void;
  onMoveMenu: (delta: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusable = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  useEffect(() => {
    focusable()[0]?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = focusable();
    const idx = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') list[(idx + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(idx - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'ArrowRight') onMoveMenu(1);
    else if (e.key === 'ArrowLeft') onMoveMenu(-1);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={listRef}
      role="menu"
      onKeyDown={handleKeyDown}
      className="absolute left-0 top-full z-50 mt-px min-w-60 rounded-sm border border-line bg-panel py-1 shadow-lg"
    >
      {items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
        ) : (
          <button
            key={item.label}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-keyshortcuts={item.shortcut}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className="grid h-7 w-full grid-cols-[16px_1fr_auto] items-center gap-2 px-2 text-left text-[13px] text-fg hover:bg-accent-subtle focus-visible:bg-accent-subtle focus-visible:outline-none disabled:cursor-not-allowed disabled:text-dim disabled:hover:bg-transparent"
          >
            <span aria-hidden="true">{item.checked && <Check className="size-3.5 text-accent" />}</span>
            <span className="truncate">{item.label}</span>
            <span className="pl-4 text-[12px] text-muted">{item.shortcut}</span>
          </button>
        )
      )}
    </div>
  );
}

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (openIdx === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenIdx(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openIdx]);

  const close = (refocus: boolean) => {
    if (refocus && openIdx !== null) triggerRefs.current[openIdx]?.focus();
    setOpenIdx(null);
  };

  return (
    <div ref={barRef} role="menubar" aria-label="Application menu" className="flex h-full items-stretch">
      {menus.map((menu, i) => (
        <div key={menu.label} className="relative flex">
          <button
            ref={(el) => {
              triggerRefs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openIdx === i}
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            onPointerEnter={() => openIdx !== null && setOpenIdx(i)}
            className={`px-2.5 text-[13px] text-fg hover:bg-panel-hover focus-visible:outline-offset-[-2px] ${
              openIdx === i ? 'bg-panel-hover' : ''
            }`}
          >
            {menu.label}
          </button>
          {openIdx === i && (
            <MenuPopup
              items={menu.items}
              onClose={() => close(true)}
              onMoveMenu={(d) => setOpenIdx((i + d + menus.length) % menus.length)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
