/**
 * Radial layout: root(s) at the centre, each BFS level on a concentric ring.
 *
 * Good for network diagrams and any "hub and spokes" structure. Nodes on a ring
 * are spread evenly by angle; ring radius grows with depth and with the ring's
 * population so crowded levels don't overlap.
 */

import type { LayoutAlgorithm, LayoutInput, LayoutResult, LayoutPosition } from '../types';
import { buildAdjacency, findRoots, bfsLevels, normalizeToOrigin } from '../graph';

const RING_GAP = 200;

function compute(input: LayoutInput): LayoutResult {
  const ids = input.nodes.map((n) => n.id);
  if (ids.length === 0) return { positions: {}, size: { width: 0, height: 0 } };

  const sizes = new Map(input.nodes.map((n) => [n.id, { width: n.width, height: n.height }]));
  const adj = buildAdjacency(ids, input.edges);
  const roots = input.roots?.length ? input.roots : findRoots(ids, adj);
  const levels = bfsLevels(roots, adj);

  // Group node ids by ring (unreached nodes go to an outermost ring).
  const maxLevel = Math.max(0, ...[...levels.values()]);
  const byRing = new Map<number, string[]>();
  for (const id of ids) {
    const ring = levels.get(id) ?? maxLevel + 1;
    (byRing.get(ring) ?? byRing.set(ring, []).get(ring)!).push(id);
  }

  const positions = new Map<string, LayoutPosition>();
  for (const [ring, ringIds] of byRing) {
    if (ring === 0) {
      // Centre ring: place the single root at origin, or spread multiples tightly.
      ringIds.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / Math.max(1, ringIds.length);
        const r = ringIds.length === 1 ? 0 : RING_GAP / 2;
        positions.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      });
      continue;
    }
    const radius = ring * RING_GAP + (ringIds.length > 8 ? (ringIds.length - 8) * 12 : 0);
    ringIds.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / ringIds.length;
      positions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
  }

  return normalizeToOrigin(positions, sizes);
}

export const radialAlgorithm: LayoutAlgorithm = { kind: 'radial', compute };
