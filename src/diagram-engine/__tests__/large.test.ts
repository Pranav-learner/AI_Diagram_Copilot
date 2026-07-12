import { describe, it, expect } from 'vitest';
import {
  DiagramModel,
  buildNode,
  buildEdge,
  createEmptyDocument,
  createSequentialIdFactory,
  fixedClock,
  CURRENT_SCHEMA_VERSION,
} from '@/dsl';
import type { BuildContext, DiagramDocument, DiagramNode, DiagramEdge, NodeId } from '@/dsl';
import type { ExcalidrawScene, ExElement } from '..';
import { makeEngine, FIXED_TIME } from './helpers';

/** Bulk-assemble a chain of N nodes + N-1 edges in one O(n) pass. */
function buildLargeDocument(n: number): { doc: DiagramDocument; firstId: NodeId } {
  const ids = createSequentialIdFactory();
  const clock = fixedClock(FIXED_TIME);
  const ctx: BuildContext = { ids, clock };
  const nodes: Record<string, DiagramNode> = {};
  const edges: Record<string, DiagramEdge> = {};
  const nodeIds: NodeId[] = [];

  for (let i = 0; i < n; i++) {
    const node = buildNode(ctx, { type: 'shape', shape: 'rectangle', position: { x: i * 10, y: 0 } });
    nodes[node.id] = node;
    nodeIds.push(node.id);
  }
  for (let i = 1; i < n; i++) {
    const edge = buildEdge(ctx, { source: { nodeId: nodeIds[i - 1]! }, target: { nodeId: nodeIds[i]! } });
    edges[edge.id] = edge;
  }

  const empty = createEmptyDocument({ id: ids.document(), schemaVersion: CURRENT_SCHEMA_VERSION, clock });
  return { doc: { ...empty, nodes, edges }, firstId: nodeIds[0]! };
}

describe('large diagrams', () => {
  it('renders a 2000-node document and validates', () => {
    const N = 2000;
    const { doc } = buildLargeDocument(N);
    const engine = makeEngine();
    const { scene } = engine.render<ExcalidrawScene, ExElement>(doc);
    // N shape elements + (N-1) arrow elements.
    expect(scene.elements).toHaveLength(N + (N - 1));
  });

  it('keeps a single-node change minimal on a large diagram', () => {
    const N = 2000;
    const { doc, firstId } = buildLargeDocument(N);
    const engine = makeEngine();
    const scene = engine.render<ExcalidrawScene, ExElement>(doc).scene;

    const model = DiagramModel.fromDocument(doc, { clock: fixedClock(FIXED_TIME) });
    model.updateNode(firstId, { position: { x: 0, y: 500 } });
    const result = engine.sync<ExcalidrawScene, ExElement>(doc, model.document, scene);

    // Only the moved node + its single incident edge change; 3999 elements reused.
    const touched = result.changeSet.updated.length + result.changeSet.added.length + result.changeSet.removed.length;
    expect(touched).toBeLessThanOrEqual(3);
    expect(result.changeSet.updated.some((e) => e.id === firstId)).toBe(true);
  });
});
