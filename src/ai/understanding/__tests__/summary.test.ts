import { describe, it, expect } from 'vitest';
import { makeArchitecture, makeModel } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { summarizeDiagram, summarizeEntity, summarizeGroup, summarizeSelection, summarizeSubgraph, summarizeTopology } from '../summary/summaries';

describe('summaries', () => {
  it('describes the whole diagram', () => {
    const { model } = makeArchitecture();
    const digest = summarizeDiagram(buildSemanticGraph(model.document));
    expect(digest.counts.entities).toBe(6);
    expect(digest.text).toMatch(/6 elements and 6 relationships/);
    expect(digest.kinds.some((k) => k.kind === 'service' && k.count === 2)).toBe(true);
    expect(digest.text).toMatch(/Topology/);
  });

  it('profiles topology shape, hubs, sources and sinks', () => {
    const { model, ids } = makeArchitecture();
    const t = summarizeTopology(buildSemanticGraph(model.document));
    expect(t.isConnected).toBe(true);
    expect(t.isCyclic).toBe(false);
    expect(t.sources).toEqual([ids.user]);
    expect(new Set(t.sinks)).toEqual(new Set([ids.db, ids.cache]));
    expect(t.hubs.length).toBeGreaterThan(0);
  });

  it('classifies an empty diagram', () => {
    const t = summarizeTopology(buildSemanticGraph(makeModel().document));
    expect(t.shape).toBe('empty');
  });

  it('summarises an entity with its relationships', () => {
    const { model, ids } = makeArchitecture();
    const text = summarizeEntity(buildSemanticGraph(model.document), ids.svcA);
    expect(text).toMatch(/Service "Orders Service"/);
    expect(text).toMatch(/group "Backend"/);
    expect(text).toMatch(/public/);
  });

  it('summarises groups, selections, and subgraphs', () => {
    const { model, ids } = makeArchitecture();
    const g = buildSemanticGraph(model.document);
    expect(summarizeGroup(g, ids.backend)).toMatch(/contains 4 elements/);
    expect(summarizeSelection(g, [ids.svcA, ids.svcB])).toMatch(/2 selected elements/);
    expect(summarizeSubgraph(g, [ids.svcA, ids.db])).toMatch(/internal relationship/);
  });
});
