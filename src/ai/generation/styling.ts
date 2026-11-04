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

const CHAR_WIDTH = 7.5;
const MIN_WIDTH = 190;
const MAX_WIDTH = 320;
const BASE_HEIGHT = 58;

export function sizeForNode(node: PlanNode, shape: ShapeKind): Size {
  const width = clamp(Math.round(node.label.length * CHAR_WIDTH) + 52, MIN_WIDTH, MAX_WIDTH);
  // Diamonds/ellipses need extra height to fit centred text.
  const height = shape === 'diamond' ? 88 : shape === 'ellipse' ? 68 : BASE_HEIGHT;
  return { width: shape === 'diamond' ? Math.max(width, 160) : width, height };
}

// Modern dark-canvas card palette with distinctive tier accents & clean contrast
const TIER_PALETTE: Record<number, { fill: string; stroke: string; text: string }> = {
  // Tier 0: Ingress / Gateway / Entrypoint (Sky Blue)
  0: { fill: '#0c4a6e', stroke: '#38bdf8', text: '#f0f9ff' },
  // Tier 1: API Routers & Controllers (Indigo / Violet)
  1: { fill: '#312e81', stroke: '#818cf8', text: '#eef2ff' },
  // Tier 2: Domain Services (Purple / Fuchsia)
  2: { fill: '#581c87', stroke: '#c084fc', text: '#faf5ff' },
  // Tier 3: Repositories & Data Access (Warm Amber)
  3: { fill: '#78350f', stroke: '#fbbf24', text: '#fffbeb' },
  // Tier 4: Database & Models (Emerald / Forest)
  4: { fill: '#064e3b', stroke: '#34d399', text: '#ecfdf5' },
  // Tier 5: Infrastructure & Config (Slate)
  5: { fill: '#1e293b', stroke: '#94a3b8', text: '#f8fafc' },
};

/** A palette of {fill, stroke, text} pairs that read cleanly on dark canvases. */
const PALETTE: ReadonlyArray<{ fill: string; stroke: string; text: string }> = [
  { fill: '#1e1b4b', stroke: '#818cf8', text: '#eef2ff' },
  { fill: '#083344', stroke: '#38bdf8', text: '#f0f9ff' },
  { fill: '#052e16', stroke: '#34d399', text: '#ecfdf5' },
  { fill: '#451a03', stroke: '#fbbf24', text: '#fffbeb' },
  { fill: '#500724', stroke: '#f472b6', text: '#fdf2f8' },
  { fill: '#3b0764', stroke: '#c084fc', text: '#faf5ff' },
  { fill: '#431407', stroke: '#fb923c', text: '#fff7ed' },
  { fill: '#082f49', stroke: '#38bdf8', text: '#f0f9ff' },
];

export interface StyleContext {
  /** Stable index used to pick a palette entry (e.g. group index or role index). */
  readonly colorIndex: number;
  readonly emphasized?: boolean;
  readonly role?: string;
  readonly tier?: number;
}

export function styleForNode(ctx: StyleContext): Style {
  const swatch =
    ctx.tier !== undefined && TIER_PALETTE[ctx.tier]
      ? TIER_PALETTE[ctx.tier]!
      : PALETTE[Math.abs(ctx.colorIndex) % PALETTE.length]!;

  return {
    fill: { color: swatch.fill },
    stroke: { color: swatch.stroke, width: ctx.emphasized ? 3 : 2 },
    font: {
      family: 'sans-serif',
      size: 14,
      color: swatch.text,
      weight: 'bold',
      align: 'center',
    },
    cornerRadius: 8,
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
