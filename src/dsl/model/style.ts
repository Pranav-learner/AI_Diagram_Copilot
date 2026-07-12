/**
 * The reusable style system.
 *
 * Visual attributes are grouped into a single {@link Style} value. A style can
 * be attached to an entity inline, or — to avoid duplicating the same style
 * across dozens of entities — defined once in the document's {@link StyleTable}
 * as a {@link NamedStyle} and referenced by `styleRef`. {@link Theme} supplies
 * type-level defaults. Effective appearance is computed by layering these
 * sources with {@link mergeStyles} / resolution in the API layer.
 *
 * Every field is optional: a `Style` is always a *partial* override, so sources
 * compose cleanly (later layers only override the fields they set).
 */

import type { Color, Opacity } from '../primitives/scalars';
import type { StyleId } from '../primitives/ids';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type FontWeight = 'normal' | 'bold' | number;
export type TextAlign = 'left' | 'center' | 'right';

export interface Stroke {
  readonly color?: Color;
  readonly width?: number;
  readonly style?: StrokeStyle;
}

export interface Fill {
  readonly color?: Color;
  readonly opacity?: Opacity;
}

export interface Font {
  readonly family?: string;
  readonly size?: number;
  readonly weight?: FontWeight;
  readonly italic?: boolean;
  readonly color?: Color;
  readonly align?: TextAlign;
}

export interface Border {
  readonly color?: Color;
  readonly width?: number;
  readonly radius?: number;
}

export interface Shadow {
  readonly color?: Color;
  readonly blur?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/** A partial, composable bundle of visual attributes. */
export interface Style {
  readonly stroke?: Stroke;
  readonly fill?: Fill;
  readonly opacity?: Opacity;
  readonly font?: Font;
  readonly border?: Border;
  readonly cornerRadius?: number;
  readonly shadow?: Shadow;
  readonly padding?: number;
  readonly spacing?: number;
}

/** A named, document-level style available for reuse via `styleRef`. */
export interface NamedStyle {
  readonly id: StyleId;
  readonly name: string;
  readonly style: Style;
}

/** Document-level registry of reusable styles, keyed by {@link StyleId}. */
export type StyleTable = Readonly<Record<string, NamedStyle>>;

/**
 * A theme: default styles applied by node/edge kind before per-entity styles.
 * `kind` keys are node `type`s (e.g. `shape`, `text`) or the literal `edge`.
 */
export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly defaults: Readonly<Record<string, Style>>;
}

const EMPTY_STYLE: Style = {};

/** Shallow-merge one nested style group; later value wins, `undefined` skipped. */
function mergeGroup<T extends object>(
  base: T | undefined,
  over: T | undefined,
): T | undefined {
  if (!base) return over;
  if (!over) return base;
  return { ...base, ...over };
}

/**
 * Merge styles in priority order — later arguments override earlier ones. Nested
 * groups (stroke/fill/font/…) merge field-by-field rather than replacing whole,
 * so a theme's stroke color survives an override that only sets stroke width.
 */
export function mergeStyles(...styles: readonly (Style | undefined)[]): Style {
  return styles.reduce<Style>((acc, next) => {
    if (!next) return acc;
    return {
      ...acc,
      ...next,
      stroke: mergeGroup(acc.stroke, next.stroke),
      fill: mergeGroup(acc.fill, next.fill),
      font: mergeGroup(acc.font, next.font),
      border: mergeGroup(acc.border, next.border),
      shadow: mergeGroup(acc.shadow, next.shadow),
    };
  }, EMPTY_STYLE);
}
