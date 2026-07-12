/**
 * Style resolution for edits — semantic colour names → concrete DSL styles.
 *
 * "Color all backend services blue" gives the model a *name*; the application
 * (never the model) turns it into a real {@link Style}. Keeping this mapping
 * here preserves the module invariant: the LLM speaks meaning, the app owns
 * appearance. Accepts both friendly names and raw hex.
 */

import type { Style } from '@/dsl';
import type { StyleHints } from './model/EditPlan';

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#1e1e1e',
  white: '#ffffff',
  gray: '#6b7280',
  grey: '#6b7280',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  pink: '#ec4899',
  brown: '#92400e',
};

/** Lighter fills paired with a saturated stroke, for readable node backgrounds. */
const FILL_TINTS: Readonly<Record<string, string>> = {
  red: '#fee2e2',
  orange: '#ffedd5',
  amber: '#fef3c7',
  yellow: '#fef9c3',
  lime: '#ecfccb',
  green: '#dcfce7',
  teal: '#ccfbf1',
  cyan: '#cffafe',
  blue: '#dbeafe',
  indigo: '#e0e7ff',
  violet: '#ede9fe',
  purple: '#f3e8ff',
  pink: '#fce7f3',
  gray: '#f3f4f6',
  grey: '#f3f4f6',
};

/** Resolve a colour name or hex to a hex string, or undefined if unrecognized. */
export function resolveColor(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) return value;
  const named = value.replace(/^(light|dark)\s+/, '');
  return NAMED_COLORS[named];
}

function tintFor(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase().replace(/^(light|dark)\s+/, '');
  return FILL_TINTS[value];
}

/**
 * Convert semantic {@link StyleHints} into a DSL {@link Style}. A named `fill`
 * becomes a soft tinted background with a matching saturated stroke, so a single
 * "make it blue" reads well; a hex `fill` is used verbatim.
 */
export function styleHintsToStyle(hints: StyleHints): Style {
  const style: {
    fill?: { color: string };
    stroke?: { color: string; width?: number };
    opacity?: number;
  } = {};

  if (hints.fill) {
    const isHex = hints.fill.trim().startsWith('#');
    const fill = resolveColor(hints.fill);
    if (fill) {
      style.fill = { color: isHex ? fill : tintFor(hints.fill) ?? fill };
      if (!hints.stroke && !isHex) style.stroke = { color: fill, width: 2 };
    }
  }
  const stroke = resolveColor(hints.stroke);
  if (stroke) style.stroke = { color: stroke, width: hints.emphasize ? 3 : 2 };
  else if (hints.emphasize && style.stroke) style.stroke = { ...style.stroke, width: 3 };

  if (hints.opacity !== undefined) style.opacity = hints.opacity;
  return style;
}

/** Whether a set of style hints would produce any actual change. */
export function hasStyleChange(hints: StyleHints): boolean {
  return Boolean(hints.fill || hints.stroke || hints.emphasize || hints.opacity !== undefined);
}
