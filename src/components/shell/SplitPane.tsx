import React, { useRef, useState } from 'react';

interface SplitPaneProps {
  direction: 'row' | 'column';
  /** Which child keeps the explicit size; the other one fills the remaining space. */
  fixed: 'first' | 'second';
  defaultSize: number;
  unit?: 'px' | '%';
  minSize: number;
  maxSize: number;
  /** Hides the fixed pane (kept mounted so its internal state survives). */
  collapsed?: boolean;
  label: string;
  className?: string;
  children: [React.ReactNode, React.ReactNode];
}

export function SplitPane({
  direction,
  fixed,
  defaultSize,
  unit = 'px',
  minSize,
  maxSize,
  collapsed = false,
  label,
  className = '',
  children,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(defaultSize);
  const [dragging, setDragging] = useState(false);
  const isRow = direction === 'row';

  const clamp = (v: number) => Math.min(maxSize, Math.max(minSize, v));

  const sizeFromPointer = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return size;
    const total = isRow ? rect.width : rect.height;
    const offset = isRow ? clientX - rect.left : clientY - rect.top;
    const px = fixed === 'first' ? offset : total - offset;
    return unit === '%' ? (px / total) * 100 : px;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = unit === '%' ? 2 : 16;
    const grow = fixed === 'first' ? ['ArrowRight', 'ArrowDown'] : ['ArrowLeft', 'ArrowUp'];
    const shrink = fixed === 'first' ? ['ArrowLeft', 'ArrowUp'] : ['ArrowRight', 'ArrowDown'];
    if (grow.includes(e.key)) setSize((s) => clamp(s + step));
    else if (shrink.includes(e.key)) setSize((s) => clamp(s - step));
    else if (e.key === 'Home') setSize(minSize);
    else if (e.key === 'End') setSize(maxSize);
    else return;
    e.preventDefault();
  };

  const [first, second] = children;
  const fixedChild = fixed === 'first' ? first : second;
  const flexChild = fixed === 'first' ? second : first;

  const fixedPane = (
    <div
      className={`min-w-0 min-h-0 overflow-hidden ${collapsed ? 'hidden' : ''}`}
      style={{ flex: `0 0 ${size}${unit}` }}
    >
      {fixedChild}
    </div>
  );
  const flexPane = <div className="flex-1 min-w-0 min-h-0 overflow-hidden">{flexChild}</div>;

  const handle = collapsed ? null : (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={isRow ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(size)}
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      title={`${label} — drag to resize, double-click to reset`}
      data-dragging={dragging}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (dragging) setSize(clamp(sizeFromPointer(e.clientX, e.clientY)));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onDoubleClick={() => setSize(defaultSize)}
      onKeyDown={handleKeyDown}
      className={`relative z-10 shrink-0 bg-line transition-colors duration-100 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none data-[dragging=true]:bg-accent before:absolute before:content-[''] ${
        isRow
          ? 'w-px cursor-col-resize before:inset-y-0 before:-left-1 before:-right-1'
          : 'h-px cursor-row-resize before:inset-x-0 before:-top-1 before:-bottom-1'
      }`}
    />
  );

  return (
    <div
      ref={containerRef}
      className={`flex min-w-0 min-h-0 ${isRow ? 'flex-row' : 'flex-col'} ${dragging ? 'select-none' : ''} ${className}`}
    >
      {fixed === 'first' ? fixedPane : flexPane}
      {handle}
      {fixed === 'first' ? flexPane : fixedPane}
    </div>
  );
}
