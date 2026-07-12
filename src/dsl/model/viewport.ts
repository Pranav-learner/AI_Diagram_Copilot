/**
 * The viewport model — how the diagram is presented, not what it contains.
 *
 * Kept on the document so a reopened diagram restores exactly where the user
 * left off. Purely presentational; carries no entity data.
 */

import type { Point, Size } from '../primitives/geometry';
import type { Color } from '../primitives/scalars';

export interface Grid {
  readonly enabled: boolean;
  /** Spacing between grid lines, in canvas units. */
  readonly size: number;
  /** Whether new/moved entities snap to the grid. */
  readonly snap: boolean;
}

export interface Viewport {
  /** Zoom factor — `1` is 100%. */
  readonly zoom: number;
  /** Pan offset of the canvas origin. */
  readonly pan: Point;
  /** Logical canvas size. */
  readonly canvasSize: Size;
  readonly background: Color;
  readonly grid: Grid;
}

export const DEFAULT_GRID: Grid = { enabled: false, size: 20, snap: false };

export const DEFAULT_VIEWPORT: Viewport = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  canvasSize: { width: 1920, height: 1080 },
  background: '#ffffff',
  grid: DEFAULT_GRID,
};
