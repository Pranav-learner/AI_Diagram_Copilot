/**
 * Directed layered/tree layout via dagre.
 *
 * Dagre computes tidy hierarchical placement (Sugiyama-style ranking + ordering)
 * — the right engine for flowcharts, architecture diagrams, org charts, state
 * machines, decision trees, and UML. We adapt its centre-based coordinates to
 * our top-left convention and expose it as two registered algorithms (`layered`
 * and a tighter `tree`) sharing one implementation.
 */

import * as dagre from '@dagrejs/dagre';
import type { LayoutAlgorithm, LayoutInput, LayoutKind, LayoutPosition, LayoutResult } from '../types';
import { DEFAULT_SPACING } from '../types';

interface DagreDefaults {
  readonly nodesep: number;
  readonly ranksep: number;
}

function runDagre(input: LayoutInput, defaults: DagreDefaults): LayoutResult {
  if (input.nodes.length === 0) return { positions: {}, size: { width: 0, height: 0 } };

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: input.direction ?? 'TB',
    nodesep: input.spacing?.node ?? defaults.nodesep,
    ranksep: input.spacing?.rank ?? defaults.ranksep,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of input.nodes) g.setNode(n.id, { width: n.width, height: n.height });
  input.edges.forEach((e, i) => {
    // Ignore edges to/from nodes not in this layout; name them so parallel edges survive.
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target, {}, `e${i}`);
  });

  dagre.layout(g);

  const positions: Record<string, LayoutPosition> = {};
  for (const n of input.nodes) {
    const dn = g.node(n.id) as { x: number; y: number } | undefined;
    // Dagre reports node centres; convert to top-left.
    positions[n.id] = dn ? { x: dn.x - n.width / 2, y: dn.y - n.height / 2 } : { x: 0, y: 0 };
  }
  const graph = g.graph() as { width?: number; height?: number };
  return { positions, size: { width: graph.width ?? 0, height: graph.height ?? 0 } };
}

export function createDagreAlgorithm(kind: LayoutKind, defaults: DagreDefaults): LayoutAlgorithm {
  return { kind, compute: (input) => runDagre(input, defaults) };
}

/** Standard layered (hierarchical) layout. */
export const layeredAlgorithm = createDagreAlgorithm('layered', {
  nodesep: DEFAULT_SPACING.node,
  ranksep: DEFAULT_SPACING.rank,
});

/** Tree layout — a tighter layered layout tuned for parent→child hierarchies. */
export const treeAlgorithm = createDagreAlgorithm('tree', { nodesep: 40, ranksep: 80 });
