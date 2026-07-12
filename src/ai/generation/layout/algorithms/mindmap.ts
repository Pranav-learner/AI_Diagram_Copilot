/**
 * Mind-map layout: a central root with branches fanning out to both sides.
 *
 * The root's direct children are split into two balanced halves; the right half
 * grows rightward and the left half leftward, each as a tidy horizontal tree.
 * The root is centred between them. Ideal for brainstorming/mind-map diagrams
 * where hierarchy matters but a strict top-down ranking would feel unnatural.
 */

import type { LayoutAlgorithm, LayoutInput, LayoutResult, LayoutPosition } from '../types';
import { buildAdjacency, findRoots, normalizeToOrigin } from '../graph';
import { layoutTree } from './hierarchyTree';

const LEVEL_GAP = 220;
const SIBLING_GAP = 30;

function compute(input: LayoutInput): LayoutResult {
  const ids = input.nodes.map((n) => n.id);
  if (ids.length === 0) return { positions: {}, size: { width: 0, height: 0 } };

  const sizes = new Map(input.nodes.map((n) => [n.id, { width: n.width, height: n.height }]));
  const sizeOf = (id: string) => sizes.get(id) ?? { width: 120, height: 60 };
  const adj = buildAdjacency(ids, input.edges);
  const root = (input.roots?.[0] ?? findRoots(ids, adj)[0])!;

  const rootKids = adj.out.get(root) ?? [];
  const right: string[] = [];
  const left: string[] = [];
  rootKids.forEach((k, i) => (i % 2 === 0 ? right : left).push(k));

  const childrenOf = (id: string) => (id === root ? [] : adj.out.get(id) ?? []);
  const positions = new Map<string, LayoutPosition>();

  // Root children start at depth 1 so they clear the centre node.
  const rightPos = layoutTree(right, childrenOf, sizeOf, { orientation: 'H', levelGap: LEVEL_GAP, siblingGap: SIBLING_GAP, sign: 1 });
  const leftPos = layoutTree(left, childrenOf, sizeOf, { orientation: 'H', levelGap: LEVEL_GAP, siblingGap: SIBLING_GAP, sign: -1 });

  const shiftDepth = (pos: Map<string, LayoutPosition>, dx: number) => {
    for (const [id, p] of pos) positions.set(id, { x: p.x + dx, y: p.y });
  };
  shiftDepth(rightPos, LEVEL_GAP);
  shiftDepth(leftPos, -LEVEL_GAP);

  // Centre the root vertically over the union of both branch sets.
  const rootSize = sizeOf(root);
  const ys = [...positions.values()].map((p) => p.y);
  const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  positions.set(root, { x: -rootSize.width / 2, y: midY });

  // Nodes unreachable from root (disconnected) — stack them below.
  let extraY = (ys.length ? Math.max(...ys) : 0) + 120;
  for (const id of ids) {
    if (!positions.has(id)) {
      positions.set(id, { x: 0, y: extraY });
      extraY += sizeOf(id).height + SIBLING_GAP;
    }
  }

  return normalizeToOrigin(positions, sizes);
}

export const mindmapAlgorithm: LayoutAlgorithm = { kind: 'mindmap', compute };
