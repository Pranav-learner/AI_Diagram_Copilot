/**
 * Geometric value types shared across entities.
 *
 * These are pure, immutable, unit-agnostic value objects (the DSL fixes no
 * pixel/point convention — that is a renderer concern). Helpers are pure and
 * never mutate their inputs.
 */

/** A 2D coordinate. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A width/height pair. Both are expected to be `>= 0`. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** An axis-aligned rectangle: top-left origin plus size. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const ORIGIN: Point = { x: 0, y: 0 };

export function point(x: number, y: number): Point {
  return { x, y };
}

export function size(width: number, height: number): Size {
  return { width, height };
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/** Translate a point by `(dx, dy)`. */
export function translate(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

/** The rectangle occupied by a node at `position` with `size`. */
export function rectOf(position: Point, s: Size): Rect {
  return { x: position.x, y: position.y, width: s.width, height: s.height };
}

/** True if `p` lies within `r` (inclusive of edges). */
export function rectContains(r: Rect, p: Point): boolean {
  return (
    p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
  );
}
