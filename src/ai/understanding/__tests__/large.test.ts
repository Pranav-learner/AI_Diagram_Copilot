import { describe, it, expect } from 'vitest';
import type { NodeId } from '@/dsl';
import { makeModel } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { incrementalUpdate } from '../build/incremental';
import { SemanticQuery } from '../query/SemanticQuery';

const N = 1000;

function makeChain() {
  const model = makeModel();
  const ids: NodeId[] = [];
  for (let i = 0; i < N; i++) {
    const n = model.createNode({ type: 'shape', semantic: i % 2 === 0 ? 'service' : 'database', label: { text: `n${i}` } });
    ids.push(n.id);
  }
  for (let i = 0; i < N - 1; i++) {
    model.createEdge({ source: { nodeId: ids[i]! }, target: { nodeId: ids[i + 1]! }, metadata: { relType: 'dependency' } });
  }
  return { model, ids };
}

describe('large diagrams', () => {
  it('builds a 1000-node graph quickly and answers queries', () => {
    const { model, ids } = makeChain();
    const t0 = performance.now();
    const graph = buildSemanticGraph(model.document, 1);
    const buildMs = performance.now() - t0;

    expect(graph.entities.size).toBe(N);
    expect(graph.relationships.size).toBe(N - 1);
    expect(graph.stats.hasCycles).toBe(false);
    expect(buildMs).toBeLessThan(1000);

    const query = new SemanticQuery(graph);
    const path = query.findPath(ids[0]!, ids[N - 1]!)!;
    expect(path.length).toBe(N - 1);
    expect(query.findEntitiesByKind('service').length).toBe(N / 2);
  });

  it('applies a single-node incremental update without touching the rest', () => {
    const { model, ids } = makeChain();
    const doc1 = model.document;
    const g1 = buildSemanticGraph(doc1, 1);

    const mid = ids[N / 2]!;
    model.updateNode(mid as never, { label: { text: 'renamed' } });
    const doc2 = model.document;

    const t0 = performance.now();
    const { graph: g2, changed } = incrementalUpdate(g1, doc1, doc2, 2);
    const incMs = performance.now() - t0;

    expect(changed.entities.has(mid)).toBe(true);
    expect(changed.entities.size).toBe(1);
    // A far-away node is reused by identity.
    expect(g2.entities.get(ids[0]!)).toBe(g1.entities.get(ids[0]!));
    expect(incMs).toBeLessThan(500);
  });

  it('handles a highly-connected hub', () => {
    const model = makeModel();
    const hub = model.createNode({ type: 'shape', semantic: 'gateway', label: { text: 'hub' } });
    for (let i = 0; i < 500; i++) {
      const n = model.createNode({ type: 'shape', semantic: 'service' });
      model.createEdge({ source: { nodeId: hub.id }, target: { nodeId: n.id } });
    }
    const graph = buildSemanticGraph(model.document);
    expect(graph.index.degree(hub.id)).toBe(500);
    expect(graph.stats.densestEntityId).toBe(hub.id);
    expect(new SemanticQuery(graph).findNeighbors(hub.id).length).toBe(500);
  });
});
