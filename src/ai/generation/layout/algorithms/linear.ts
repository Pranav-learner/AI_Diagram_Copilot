/**
 * Linear layout: a single ordered row (or column).
 *
 * Serves sequence diagrams (participants across the top) and timelines (events
 * left → right). Node order is the input order — the ExecutionPlanner is
 * responsible for handing nodes over already ordered (e.g. by first appearance
 * for sequence participants, or chronological order for timelines).
 */

import type { LayoutAlgorithm, LayoutInput, LayoutResult, LayoutPosition } from '../types';

function compute(input: LayoutInput): LayoutResult {
  if (input.nodes.length === 0) return { positions: {}, size: { width: 0, height: 0 } };

  const vertical = input.direction === 'TB' || input.direction === 'BT';
  const gap = input.spacing?.node ?? 80;
  const positions: Record<string, LayoutPosition> = {};

  let cursor = 0;
  let cross = 0;
  for (const node of input.nodes) {
    if (vertical) {
      positions[node.id] = { x: 0, y: cursor };
      cursor += node.height + gap;
      cross = Math.max(cross, node.width);
    } else {
      positions[node.id] = { x: cursor, y: 0 };
      cursor += node.width + gap;
      cross = Math.max(cross, node.height);
    }
  }

  return {
    positions,
    size: vertical ? { width: cross, height: cursor - gap } : { width: cursor - gap, height: cross },
  };
}

export const linearAlgorithm: LayoutAlgorithm = { kind: 'linear', compute };
