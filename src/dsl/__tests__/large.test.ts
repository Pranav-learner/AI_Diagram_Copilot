import { describe, it, expect } from 'vitest';
import { makeModel, deterministicOptions } from './helpers';
import { buildNode, buildEdge } from '../api/factory';
import type { BuildContext } from '../api/factory';
import { createEmptyDocument } from '../model/document';
import type { DiagramDocument } from '../model/document';
import { CURRENT_SCHEMA_VERSION } from '../migration/versions';
import { serialize, deserialize } from '../serialization/serialize';
import { validate } from '../validation/validate';
import { InMemoryDiagramRepository } from '../repository/InMemoryDiagramRepository';
import type { DiagramNode } from '../model/node';
import type { DiagramEdge } from '../model/edge';
import type { NodeId } from '../primitives/ids';

/**
 * Assemble a large document in a single O(n) pass — mirroring how big diagrams
 * actually arrive (one `deserialize`), not 5000 sequential immutable edits. This
 * exercises the scale-sensitive paths: validate, serialize, and deserialize.
 */
function buildLargeDocument(n: number): DiagramDocument {
  const { ids, clock } = deterministicOptions();
  const ctx: BuildContext = { ids, clock };
  const nodes: Record<string, DiagramNode> = {};
  const edges: Record<string, DiagramEdge> = {};
  const nodeIds: NodeId[] = [];

  for (let i = 0; i < n; i++) {
    const node = buildNode(ctx, {
      type: 'shape',
      shape: 'rectangle',
      position: { x: i * 10, y: 0 },
      label: { text: `n${i}` },
    });
    nodes[node.id] = node;
    nodeIds.push(node.id);
  }
  for (let i = 1; i < n; i++) {
    const edge = buildEdge(ctx, {
      source: { nodeId: nodeIds[i - 1]! },
      target: { nodeId: nodeIds[i]! },
    });
    edges[edge.id] = edge;
  }

  const empty = createEmptyDocument({ id: ids.document(), schemaVersion: CURRENT_SCHEMA_VERSION, clock });
  return { ...empty, nodes, edges };
}

describe('large documents', () => {
  it('validates, serializes, and round-trips a 5000-node document', async () => {
    const N = 5000;
    const doc = buildLargeDocument(N);
    expect(Object.keys(doc.nodes)).toHaveLength(N);
    expect(Object.keys(doc.edges)).toHaveLength(N - 1);

    expect(validate(doc).valid).toBe(true);

    const json = serialize(doc);
    const restored = deserialize(json);
    expect(Object.keys(restored.nodes)).toHaveLength(N);
    expect(serialize(restored)).toBe(json); // stable round-trip

    const repo = new InMemoryDiagramRepository();
    await repo.save(doc);
    const loaded = await repo.load(doc.id);
    expect(loaded).not.toBeNull();
    expect(Object.keys(loaded!.nodes)).toHaveLength(N);
  });

  it('cascades a node removal correctly on a mid-size document', () => {
    const model = makeModel();
    const ids: NodeId[] = [];
    for (let i = 0; i < 200; i++) {
      ids.push(model.createNode({ type: 'shape', shape: 'rectangle' }).id);
    }
    for (let i = 1; i < 200; i++) {
      model.createEdge({ source: { nodeId: ids[i - 1]! }, target: { nodeId: ids[i]! } });
    }
    const edgesBefore = Object.keys(model.document.edges).length;
    model.removeNode(ids[0]!); // endpoint of exactly one edge
    expect(Object.keys(model.document.edges)).toHaveLength(edgesBefore - 1);
    expect(model.validate().valid).toBe(true);
  });
});
