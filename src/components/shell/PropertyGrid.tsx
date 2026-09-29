import React, { useId, useState } from 'react';
import { ChevronRight, Minus, Plus } from 'lucide-react';

const controlBase =
  'h-7 rounded-sm border border-line bg-panel-2 text-[12px] text-fg transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50';

export function PropSection({
  title,
  aside,
  defaultOpen = true,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="border-b border-line">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex h-8 w-full items-center gap-1.5 px-2 text-left text-[12px] font-semibold text-fg hover:bg-panel-hover"
        >
          <ChevronRight
            aria-hidden="true"
            className={`size-3.5 text-muted transition-transform duration-100 ${open ? 'rotate-90' : ''}`}
          />
          <span>{title}</span>
          {aside && <span className="ml-auto font-normal text-muted">{aside}</span>}
        </button>
      </h3>
      {open && (
        <div id={bodyId} className="pb-2">
          {children}
        </div>
      )}
    </section>
  );
}

export function PropRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-8 grid-cols-[minmax(0,40%)_minmax(0,1fr)] items-center gap-x-2 px-3 py-0.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="truncate text-[12px] text-muted">
          {label}
        </label>
      ) : (
        <div className="truncate text-[12px] text-muted">{label}</div>
      )}
      <div className="min-w-0">
        {children}
        {hint && <div className="text-[11px] leading-4 text-dim">{hint}</div>}
      </div>
    </div>
  );
}

/** Label cell with an inline enable checkbox, for "toggle + amount" rows. */
export function ToggleLabel({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-fg">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 shrink-0 accent-accent"
      />
      <span className={`truncate ${checked ? 'text-fg' : 'text-muted'}`}>{label}</span>
    </label>
  );
}

function NumberField({
  value,
  min,
  max,
  step,
  decimals,
  scale,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  scale: number;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value * scale).toFixed(decimals);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft) / scale;
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      const snapped = Number((min + Math.round((clamped - min) / step) * step).toFixed(6));
      onCommit(snapped);
    }
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      value={shown}
      onFocus={() => setDraft(shown)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className={`${controlBase} w-14 shrink-0 px-1.5 text-right font-mono-tabular focus:border-accent`}
    />
  );
}

export function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 0,
  scale = 1,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  /** Display multiplier, e.g. 100 to show a 0–1 fraction as a percentage. */
  scale?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-4 min-w-0 flex-1 accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <NumberField
        value={value}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        scale={scale}
        disabled={disabled}
        ariaLabel={`${label} value`}
        onCommit={onChange}
      />
      <span className="w-8 shrink-0 text-[11px] text-muted">{unit}</span>
    </div>
  );
}

export function SelectField<T extends string>({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className={`${controlBase} w-full px-1.5 focus:border-accent`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  ariaLabel,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: React.ReactNode; title?: string }>;
  ariaLabel: string;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex w-full overflow-hidden rounded-sm border border-line bg-panel-2 ${size === 'md' ? 'h-8' : 'h-7'}`}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1.5 text-[12px] transition-colors duration-100 ${
              i > 0 ? 'border-l border-line' : ''
            } ${
              active
                ? 'bg-accent-subtle text-fg shadow-[inset_0_0_0_1px_var(--accent)]'
                : 'text-muted hover:bg-panel-hover hover:text-fg'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (v: number) => void;
}) {
  const btn = `${controlBase} flex w-7 items-center justify-center text-muted hover:bg-panel-hover hover:text-fg`;
  return (
    <div className="flex items-center gap-1" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="Decrease"
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <output className="w-8 text-center font-mono-tabular text-[12px] text-fg" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Increase"
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
