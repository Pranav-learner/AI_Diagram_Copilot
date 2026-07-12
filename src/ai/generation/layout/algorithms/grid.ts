/**
 * Grid layout: pack nodes into a near-square grid.
 *
 * The fallback for weakly-structured diagrams (ER tables, class collections,
 * meshy networks) where no strong hierarchy or ordering applies. Column count is
 * √n; cells are sized to the largest node so nothing overlaps.
 */

import type { LayoutAlgorithm, LayoutInput, LayoutResult, LayoutPosition } from '../types';

function compute(input: LayoutInput): LayoutResult {
  const n = input.nodes.length;
  if (n === 0) return { positions: {}, size: { width: 0, height: 0 } };

  const gapX = input.spacing?.node ?? 60;
  const gapY = input.spacing?.rank ?? 60;
  const cols = Math.ceil(Math.sqrt(n));
  const cellW = Math.max(...input.nodes.map((node) => node.width));
  const cellH = Math.max(...input.nodes.map((node) => node.height));

  const positions: Record<string, LayoutPosition> = {};
  input.nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Centre each node within its cell.
    positions[node.id] = {
      x: col * (cellW + gapX) + (cellW - node.width) / 2,
      y: row * (cellH + gapY) + (cellH - node.height) / 2,
    };
  });

  const rows = Math.ceil(n / cols);
  return {
    positions,
    size: { width: cols * (cellW + gapX) - gapX, height: rows * (cellH + gapY) - gapY },
  };
}

export const gridAlgorithm: LayoutAlgorithm = { kind: 'grid', compute };
