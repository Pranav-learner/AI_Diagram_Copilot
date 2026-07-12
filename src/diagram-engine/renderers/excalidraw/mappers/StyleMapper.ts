/**
 * Style mapping — DSL {@link Style} ⇄ Excalidraw element style fields.
 *
 * `styleToElement` produces the visual fields Excalidraw renders. `elementToStyle`
 * is its inverse, but emits **only fields whose value differs from the Excalidraw
 * default**. That single rule is what makes the round-trip lossless: merged over
 * the authoritative escrowed DSL style (see NodeMapper), an unchanged element
 * contributes nothing (→ identity), while a manual edit contributes exactly the
 * changed field (→ captured). Fields Excalidraw can't faithfully represent
 * (shadow, padding, spacing, exact corner radius) are intentionally left to the
 * escrow, so they are never clobbered by a lossy inverse.
 */

import type { Style } from '@/dsl';
import { ELEMENT_DEFAULTS, ROUNDNESS, FONT_FAMILY } from '../constants';
import type {
  ExStrokeStyle,
  ExRoundness,
  ExElementBase,
  ExTextAlign,
} from '../types';

export interface MappedStyle {
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: ExStrokeStyle;
  opacity?: number;
  roundness?: ExRoundness;
}

export interface MappedFont {
  fontSize?: number;
  fontFamily?: number;
  textAlign?: ExTextAlign;
  color?: string;
}

const FONT_NAME_TO_CODE: Readonly<Record<string, number>> = {
  'hand-drawn': FONT_FAMILY.handDrawn,
  normal: FONT_FAMILY.normal,
  'sans-serif': FONT_FAMILY.normal,
  helvetica: FONT_FAMILY.normal,
  code: FONT_FAMILY.code,
  monospace: FONT_FAMILY.code,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** DSL style → Excalidraw element style fields (for display). */
export function styleToElement(style: Style | undefined): MappedStyle {
  const out: MappedStyle = {};
  if (!style) return out;

  if (style.stroke?.color) out.strokeColor = style.stroke.color;
  if (style.stroke?.width !== undefined) out.strokeWidth = style.stroke.width;
  if (style.stroke?.style) out.strokeStyle = style.stroke.style;

  if (style.fill?.color) out.backgroundColor = style.fill.color;

  const opacity = style.opacity ?? style.fill?.opacity;
  if (opacity !== undefined) out.opacity = clamp(Math.round(opacity * 100), 0, 100);

  const radius = style.cornerRadius ?? style.border?.radius;
  if (radius !== undefined) {
    out.roundness = radius > 0 ? { type: ROUNDNESS.ADAPTIVE } : null;
  }
  return out;
}

/** Excalidraw element style fields → DSL style — non-default fields only. */
export function elementToStyle(element: ExElementBase): Style {
  const style: {
    stroke?: { color?: string; width?: number; style?: ExStrokeStyle };
    fill?: { color?: string };
    opacity?: number;
  } = {};

  const stroke: { color?: string; width?: number; style?: ExStrokeStyle } = {};
  if (element.strokeColor !== ELEMENT_DEFAULTS.strokeColor) stroke.color = element.strokeColor;
  if (element.strokeWidth !== ELEMENT_DEFAULTS.strokeWidth) stroke.width = element.strokeWidth;
  if (element.strokeStyle !== ELEMENT_DEFAULTS.strokeStyle) stroke.style = element.strokeStyle;
  if (Object.keys(stroke).length > 0) style.stroke = stroke;

  if (element.backgroundColor !== ELEMENT_DEFAULTS.backgroundColor) {
    style.fill = { color: element.backgroundColor };
  }
  if (element.opacity !== ELEMENT_DEFAULTS.opacity) {
    style.opacity = element.opacity / 100;
  }
  return style;
}

/** DSL font → Excalidraw text fields. */
export function fontFromStyle(style: Style | undefined): MappedFont {
  const out: MappedFont = {};
  const font = style?.font;
  if (!font) return out;
  if (font.size !== undefined) out.fontSize = font.size;
  if (font.family) out.fontFamily = FONT_NAME_TO_CODE[font.family] ?? FONT_FAMILY.handDrawn;
  if (font.align) out.textAlign = font.align;
  if (font.color) out.color = font.color;
  return out;
}
