import { describe, it, expect } from 'vitest';
import { makeArchitecture } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { SemanticQuery } from '../query/SemanticQuery';

function q() {
  const { model, ids } = makeArchitecture();
  return { query: new SemanticQuery(buildSemanticGraph(model.document)), ids };
}

describe('SemanticQuery', () => {
  it('finds entities by id, label, and fuzzy match', () => {
    const { query, ids } = q();
    expect(query.findEntity(ids.db)!.id).toBe(ids.db);
    expect(query.findEntity('API Gateway')!.id).toBe(ids.gateway);
    expect(query.findEntity('orders')!.id).toBe(ids.svcA);
  });

  it('lists entities by kind and tag', () => {
    const { query, ids } = q();
    expect(query.findEntitiesByKind('service').map((e) => e.id).sort()).toEqual([ids.svcA, ids.svcB].sort());
    expect(query.findEntitiesByTag('public').map((e) => e.id)).toEqual([ids.svcA]);
  });

  it('resolves dependencies and dependents', () => {
    const { query, ids } = q();
    expect(new Set(query.findDependencies(ids.gateway).map((e) => e.id))).toEqual(new Set([ids.svcA, ids.svcB]));
    expect(query.findDependents(ids.svcA).map((e) => e.id)).toEqual([ids.gateway]);
  });

  it('resolves producers and consumers along data flow', () => {
    const { query, ids } = q();
    // user → gateway is a `flowsTo` (production) edge.
    expect(query.findConsumers(ids.user).map((e) => e.id)).toEqual([ids.gateway]);
    expect(query.findProducers(ids.gateway).map((e) => e.id)).toEqual([ids.user]);
  });

  it('finds paths and neighbours', () => {
    const { query, ids } = q();
    expect(query.findPath(ids.user, ids.db)!.length).toBe(3);
    expect(new Set(query.findNeighbors(ids.gateway).map((e) => e.id))).toEqual(new Set([ids.user, ids.svcA, ids.svcB]));
  });

  it('finds groups and their members', () => {
    const { query, ids } = q();
    expect(query.findGroup('Backend')!.id).toBe(ids.backend);
    expect(query.findMembers(ids.backend).map((e) => e.id).sort()).toEqual([ids.svcA, ids.svcB, ids.db, ids.cache].sort());
  });

  it('exposes structure and validation', () => {
    const { query } = q();
    expect(query.connectedComponents()).toHaveLength(1);
    expect(query.findCycle()).toBeNull();
    expect(query.topologicalOrder()).toHaveLength(6);
    expect(query.validate().ok).toBe(true);
  });

  it('summarises and extracts context', () => {
    const { query, ids } = q();
    expect(query.summarize()).toMatch(/6 elements/);
    expect(query.summarize({ kind: 'entity', id: ids.gateway })).toMatch(/API Gateway/);
    const ctx = query.extractContext({ kind: 'entity', id: ids.gateway });
    expect(ctx.focusIds).toEqual([ids.gateway]);
    expect(ctx.entities.length).toBeGreaterThan(1);
  });
});
