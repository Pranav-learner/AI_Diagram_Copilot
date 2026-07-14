import { describe, it, expect } from 'vitest';
import { buildSemanticGraph, SemanticQuery, StaticAnalysisEngine, defaultRuleRegistry } from '@/ai';
import { articulationPoints } from '../analysis/graphUtils';
import { makeModel } from './helpers';

describe('large diagrams', () => {
  it('analyses a 600-node diagram quickly and deterministically', () => {
    const m = makeModel();
    const hub = m.createNode({ type: 'shape', semantic: 'gateway', label: { text: 'Gateway' } });
    for (let i = 0; i < 600; i++) {
      const n = m.createNode({ type: 'shape', semantic: i % 3 === 0 ? 'database' : 'service', label: { text: `N${i}` } });
      m.createEdge({ source: { nodeId: hub.id }, target: { nodeId: n.id }, metadata: { relType: 'dependency' } });
    }
    const graph = buildSemanticGraph(m.document);
    const engine = new StaticAnalysisEngine(defaultRuleRegistry());

    const t0 = performance.now();
    const result = engine.analyze({ graph, query: new SemanticQuery(graph), domain: 'software-architecture' });
    const ms = performance.now() - t0;

    expect(graph.entities.size).toBe(601);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
  });

  it('finds the hub as an articulation point on a star', () => {
    const m = makeModel();
    const hub = m.createNode({ type: 'shape', semantic: 'gateway', label: { text: 'Hub' } });
    const leaves = Array.from({ length: 50 }, (_, i) => m.createNode({ type: 'shape', semantic: 'service', label: { text: `L${i}` } }));
    for (const leaf of leaves) m.createEdge({ source: { nodeId: hub.id }, target: { nodeId: leaf.id }, metadata: { relType: 'dependency' } });
    const cut = articulationPoints(buildSemanticGraph(m.document));
    expect(cut.has(hub.id)).toBe(true);
    expect([...cut].length).toBe(1); // only the hub
  });
});
