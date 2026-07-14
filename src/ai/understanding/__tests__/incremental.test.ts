import { describe, it, expect } from 'vitest';
import { makeArchitecture } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { fullRebuild, incrementalUpdate } from '../build/incremental';

describe('incremental update', () => {
  it('reuses unchanged entities by identity and rebuilds only the delta', () => {
    const { model, ids } = makeArchitecture();
    const doc1 = model.document;
    const g1 = buildSemanticGraph(doc1, 1);

    model.updateNode(ids.svcA as never, { label: { text: 'Orders API' } });
    const doc2 = model.document;
    const { graph: g2, changed } = incrementalUpdate(g1, doc1, doc2, 2);

    expect(g2.entities.get(ids.svcA)!.label).toBe('Orders API');
    // Unchanged entities are the *same object* (structural sharing).
    expect(g2.entities.get(ids.db)).toBe(g1.entities.get(ids.db));
    expect(g2.entities.get(ids.gateway)).toBe(g1.entities.get(ids.gateway));
    expect(changed.entities.has(ids.svcA)).toBe(true);
    expect(changed.entities.has(ids.db)).toBe(false);
    expect(g2.version).toBe(2);
  });

  it('rebuilds the endpoints of a changed edge (ports move)', () => {
    const { model, ids } = makeArchitecture();
    const doc1 = model.document;
    const g1 = buildSemanticGraph(doc1, 1);

    model.createEdge({ source: { nodeId: ids.db }, target: { nodeId: ids.cache } });
    const doc2 = model.document;
    const { graph: g2, changed } = incrementalUpdate(g1, doc1, doc2, 2);

    expect(g2.relationships.size).toBe(7);
    expect(changed.entities.has(ids.db)).toBe(true);
    expect(changed.entities.has(ids.cache)).toBe(true);
    // svcA untouched by this edge.
    expect(g2.entities.get(ids.svcA)).toBe(g1.entities.get(ids.svcA));
  });

  it('tracks added nodes and group changes', () => {
    const { model, ids } = makeArchitecture();
    const doc1 = model.document;
    const g1 = buildSemanticGraph(doc1, 1);

    const extra = model.createNode({ type: 'shape', semantic: 'queue', label: { text: 'Events' } });
    model.addToGroup(ids.backend as never, extra.id);
    const doc2 = model.document;
    const { graph: g2, changed } = incrementalUpdate(g1, doc1, doc2, 2);

    expect(g2.entities.get(extra.id)!.kind).toBe('queue');
    expect(changed.entities.has(extra.id)).toBe(true);
    expect(changed.groups.has(ids.backend)).toBe(true);
    expect(g2.groups.get(ids.backend)!.memberIds).toContain(extra.id);
  });

  it('an incremental result equals a full rebuild of the same document', () => {
    const { model, ids } = makeArchitecture();
    const doc1 = model.document;
    const g1 = buildSemanticGraph(doc1, 1);
    model.updateNode(ids.gateway as never, { label: { text: 'Edge Gateway' } });
    model.createEdge({ source: { nodeId: ids.cache }, target: { nodeId: ids.db } });
    const doc2 = model.document;

    const inc = incrementalUpdate(g1, doc1, doc2, 2).graph;
    const full = fullRebuild(doc2, 2).graph;

    expect(inc.entities.size).toBe(full.entities.size);
    expect(inc.relationships.size).toBe(full.relationships.size);
    expect(inc.stats).toEqual(full.stats);
    expect(inc.entities.get(ids.gateway)!.label).toBe(full.entities.get(ids.gateway)!.label);
  });
});
