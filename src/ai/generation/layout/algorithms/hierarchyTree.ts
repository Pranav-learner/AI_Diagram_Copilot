/**
 * A minimal tidy-tree placement used by the mind-map layout (and available for
 * custom tree variants). Classic two-pass idea, single recursion: leaves take
 * sequential cross-axis slots; each parent centres over its children. Direction
 * and orientation are parameterized so the same routine serves left/right
 * mind-map branches and vertical/horizontal trees.
 */

import type { LayoutPosition } from '../types';

export interface TreeOptions {
  /** 'H' = depth along x (branches spread vertically); 'V' = depth along y. */
  readonly orientation: 'H' | 'V';
  /** Distance between successive depth levels. */
  readonly levelGap: number;
  /** Gap between sibling subtrees along the cross axis. */
  readonly siblingGap: number;
  /** +1 grows right/down, -1 grows left/up (mind-map sides). */
  readonly sign?: 1 | -1;
}

export interface TreeSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Lay out a forest. Returns top-left positions keyed by node id. Cyclic edges
 * are broken by a visited guard so it always terminates.
 */
export function layoutTree(
  roots: readonly string[],
  childrenOf: (id: string) => readonly string[],
  sizeOf: (id: string) => TreeSize,
  options: TreeOptions,
): Map<string, LayoutPosition> {
  const sign = options.sign ?? 1;
  const centers = new Map<string, { main: number; cross: number }>();
  const visited = new Set<string>();
  let cursor = 0;

  const crossExtent = (id: string) => (options.orientation === 'H' ? sizeOf(id).height : sizeOf(id).width);

  const place = (id: string, depth: number): number => {
    visited.add(id);
    const kids = childrenOf(id).filter((c) => !visited.has(c));
    const main = depth * options.levelGap;

    let cross: number;
    if (kids.length === 0) {
      cross = cursor + crossExtent(id) / 2;
      cursor += crossExtent(id) + options.siblingGap;
    } else {
      const childCenters = kids.map((c) => place(c, depth + 1));
      cross = (childCenters[0]! + childCenters[childCenters.length - 1]!) / 2;
    }
    centers.set(id, { main, cross });
    return cross;
  };

  for (const root of roots) if (!visited.has(root)) place(root, 0);

  const positions = new Map<string, LayoutPosition>();
  for (const [id, c] of centers) {
    const size = sizeOf(id);
    const main = sign * c.main;
    positions.set(
      id,
      options.orientation === 'H'
        ? { x: main - size.width / 2, y: c.cross - size.height / 2 }
        : { x: c.cross - size.width / 2, y: main - size.height / 2 },
    );
  }
  return positions;
}
