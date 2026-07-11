import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/utils/cn';
import { Input } from '@/components/ui/input';

/** A labeled inspector row: caption on the left, control on the right. */
export function InspectorRow({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-center gap-2 py-1">
      <label
        htmlFor={htmlFor}
        className="truncate text-xs text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** A section with a small uppercase heading. */
export function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  ariaLabel: string;
  id?: string;
}

/**
 * Number input with a local buffer so typing is never fought by store updates.
 * Commits on blur or Enter; re-seeds from `value` only while unfocused.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
  ariaLabel,
  id,
}: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  const commit = (): void => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      let next = parsed;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      onCommit(next);
      setText(String(next));
    } else {
      setText(String(value));
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
        }}
        className={cn('h-8 px-2 text-xs tabular-nums', suffix && 'pr-6')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const TRANSPARENT = 'transparent';

function toHexInput(value: string): string {
  return HEX_RE.test(value) && value.length >= 7 ? value.slice(0, 7) : '#000000';
}

interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  allowTransparent?: boolean;
  ariaLabel: string;
}

/** Swatch (native color picker) + hex text, with an optional transparent option. */
export function ColorField({
  value,
  onChange,
  allowTransparent = false,
  ariaLabel,
}: ColorFieldProps) {
  const isTransparent = value === TRANSPARENT || value === '#00000000';
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  const commitText = (): void => {
    if (text === TRANSPARENT || HEX_RE.test(text)) onChange(text);
    else setText(value);
  };

  return (
    <div className="flex items-center gap-1.5">
      <label
        className={cn(
          'relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-sm',
          isTransparent &&
            'bg-[conic-gradient(#0000_90deg,#8883_0_180deg,#0000_0_270deg,#8883_0)] bg-[length:8px_8px]',
        )}
        style={isTransparent ? undefined : { backgroundColor: value }}
      >
        <input
          type="color"
          value={toHexInput(isTransparent ? '#000000' : value)}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Input
        value={isTransparent ? 'transparent' : text}
        aria-label={`${ariaLabel} hex`}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commitText();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitText();
            e.currentTarget.blur();
          }
        }}
        className="h-8 px-2 text-xs lowercase"
      />
      {allowTransparent && (
        <button
          type="button"
          aria-label="Set transparent"
          title="Transparent"
          onClick={() => onChange(TRANSPARENT)}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md border text-[10px] text-muted-foreground transition-colors hover:bg-accent',
            isTransparent && 'border-primary text-primary',
          )}
        >
          ∅
        </button>
      )}
    </div>
  );
}

/** Range slider for a 0–100 percentage value. */
export function SliderField({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {value}%
      </span>
    </div>
  );
}
