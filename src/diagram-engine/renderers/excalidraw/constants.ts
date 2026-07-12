/**
 * Excalidraw renderer constants and the small, total lookup maps used by the
 * mappers. Keeping the maps here (rather than inline `switch`es) makes the
 * mapping table auditable in one place and easy to extend.
 */

import type { ShapeKind, ArrowheadType } from '@/dsl';
import type { ExArrowhead, ExElementType } from './types';

/** Namespace under `element.customData` for DSL-only data (DSL → Excalidraw escrow). */
export const CUSTOM_DATA_KEY = 'adc';

/** Namespace under `node.metadata` for Excalidraw-only data (Excalidraw → DSL escrow). */
export const EXCALIDRAW_META_KEY = '__excalidraw';

/** Suffix appended to an entity id to derive its bound-label element id. */
export const LABEL_ID_SUFFIX = '::label';

/** Excalidraw `roundness.type` discriminants. */
export const ROUNDNESS = {
  LEGACY: 1,
  PROPORTIONAL: 2,
  ADAPTIVE: 3,
} as const;

/** Excalidraw font-family codes (subset). */
export const FONT_FAMILY = {
  handDrawn: 1,
  normal: 2,
  code: 3,
} as const;

/** Element visual defaults (mirror Excalidraw's own defaults). */
export const ELEMENT_DEFAULTS = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  fontSize: 20,
  lineHeight: 1.25,
} as const;

/** DSL visual primitive → Excalidraw element type. Non-rect shapes fall back to
 * `rectangle`; the original `shape` is escrowed so the reverse map restores it. */
export const SHAPE_TO_EX_TYPE: Record<ShapeKind, ExElementType> = {
  rectangle: 'rectangle',
  roundedRectangle: 'rectangle',
  ellipse: 'ellipse',
  circle: 'ellipse',
  diamond: 'diamond',
  triangle: 'rectangle',
  parallelogram: 'rectangle',
  hexagon: 'rectangle',
  cylinder: 'rectangle',
  cloud: 'rectangle',
};

/** Excalidraw element type → default DSL shape (used when no escrow is present). */
export const EX_TYPE_TO_SHAPE: Partial<Record<ExElementType, ShapeKind>> = {
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  diamond: 'diamond',
};

/** DSL arrowhead → Excalidraw arrowhead (`none` → `null`). */
export const ARROWHEAD_TO_EX: Record<ArrowheadType, ExArrowhead> = {
  none: null,
  arrow: 'arrow',
  triangle: 'triangle',
  diamond: 'diamond',
  circle: 'circle',
  bar: 'bar',
};

/** Excalidraw arrowhead → DSL arrowhead (collapses outline variants). */
export function exToArrowhead(head: ExArrowhead): ArrowheadType {
  switch (head) {
    case null:
      return 'none';
    case 'bar':
      return 'bar';
    case 'dot':
    case 'circle':
    case 'circle_outline':
      return 'circle';
    case 'triangle':
    case 'triangle_outline':
      return 'triangle';
    case 'diamond':
    case 'diamond_outline':
      return 'diamond';
    default:
      return 'arrow';
  }
}
