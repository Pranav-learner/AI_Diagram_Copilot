/**
 * Styling — the application's semantic→visual mapping.
 *
 * The LLM never picks shapes, sizes, colours, or arrowheads. It supplies
 * semantic roles and styling *hints*; this module turns those into concrete DSL
 * `shape`, `size`, `style`, and edge `arrowheads`. Keeping it here (not in the
 * prompt or the model) is what keeps generation renderer-independent and gives
 * consistent, professional visuals regardless of what the model says.
 */

import type { ShapeKind } from '@/dsl';
import type { Arrowheads, ArrowheadType } from '@/dsl';
import type { Size, Style } from '@/dsl';
import type { PlanNode } from './model/DiagramPlan';

// Semantic role (lower-cased) → visual primitive. Unknown roles fall back below.
const SHAPE_BY_ROLE: Readonly<Record<string, ShapeKind>> = {
  start: 'ellipse',
  end: 'ellipse',
  terminator: 'ellipse',
  initial: 'ellipse',
  final: 'ellipse',
  decision: 'diamond',
  condition: 'diamond',
  database: 'cylinder',
  db: 'cylinder',
  store: 'cylinder',
  cache: 'cylinder',
  queue: 'rectangle',
  api: 'hexagon',
  gateway: 'hexagon',
  service: 'roundedRectangle',
  process: 'roundedRectangle',
  step: 'roundedRectangle',
  state: 'roundedRectangle',
  event: 'roundedRectangle',
  milestone: 'diamond',
  input: 'parallelogram',
  output: 'parallelogram',
  io: 'parallelogram',
  cloud: 'cloud',
  external: 'cloud',
  topic: 'ellipse',
  actor: 'rectangle',
  user: 'rectangle',
  person: 'rectangle',
};

const DEFAULT_SHAPE: ShapeKind = 'roundedRectangle';

export function shapeForRole(role: string | undefined): ShapeKind {
  if (!role) return DEFAULT_SHAPE;
  return SHAPE_BY_ROLE[role.toLowerCase()] ?? DEFAULT_SHAPE;
}

const CHAR_WIDTH = 8.5;
const MIN_WIDTH = 130;
const MAX_WIDTH = 280;
const BASE_HEIGHT = 60;

export function sizeForNode(node: PlanNode, shape: ShapeKind): Size {
  const width = clamp(Math.round(node.label.length * CHAR_WIDTH) + 44, MIN_WIDTH, MAX_WIDTH);
  // Diamonds/ellipses need extra height to fit centred text.
  const height = shape === 'diamond' ? 90 : shape === 'ellipse' ? 70 : BASE_HEIGHT;
  return { width: shape === 'diamond' ? Math.max(width, 140) : width, height };
}

/** A palette of {fill, stroke} pairs that read well in light and dark themes. */
const PALETTE: ReadonlyArray<{ fill: string; stroke: string }> = [
  { fill: '#eef2ff', stroke: '#6366f1' },
  { fill: '#ecfeff', stroke: '#06b6d4' },
  { fill: '#f0fdf4', stroke: '#22c55e' },
  { fill: '#fef3c7', stroke: '#f59e0b' },
  { fill: '#fce7f3', stroke: '#ec4899' },
  { fill: '#f3e8ff', stroke: '#a855f7' },
  { fill: '#ffedd5', stroke: '#f97316' },
  { fill: '#e0f2fe', stroke: '#0ea5e9' },
];

export interface StyleContext {
  /** Stable index used to pick a palette entry (e.g. group index or role index). */
  readonly colorIndex: number;
  readonly emphasized?: boolean;
}

export function styleForNode(ctx: StyleContext): Style {
  const swatch = PALETTE[Math.abs(ctx.colorIndex) % PALETTE.length]!;
  return {
    fill: { color: swatch.fill },
    stroke: { color: swatch.stroke, width: ctx.emphasized ? 3 : 2 },
  };
}

/** Deterministic small hash of a string → palette index. */
export function colorIndexForKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function arrowheadsForDirection(direction: string | undefined): Arrowheads {
  const arrow: ArrowheadType = 'arrow';
  const none: ArrowheadType = 'none';
  switch (direction) {
    case 'back':
      return { start: arrow, end: none };
    case 'both':
      return { start: arrow, end: arrow };
    case 'none':
      return { start: none, end: none };
    default:
      return { start: none, end: arrow };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
