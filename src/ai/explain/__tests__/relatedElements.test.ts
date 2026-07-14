import { describe, it, expect } from 'vitest';
import { SemanticQuery, buildSemanticGraph } from '@/ai';
import { ExplanationPlanner } from '../ExplanationPlanner';
import { deriveRelatedElements, suggestFollowUpQuestions } from '../relatedElements';
import { architecture } from './helpers';

function setup() {
  const { doc, ids } = architecture();
  const query = new SemanticQuery(buildSemanticGraph(doc));
  return { query, ids, plan: new ExplanationPlanner() };
}

describe('deriveRelatedElements', () => {
  it('surfaces dependencies, dependents, and the parent group for a node', () => {
    const { query, ids, plan } = setup();
    const req = plan.plan(query, { target: { kind: 'node', id: ids.svcA } });
    const related = deriveRelatedElements(query, req);
    const byId = new Map(related.map((r) => [r.id, r]));

    expect(byId.has(ids.db)).toBe(true); // svcA depends on db
    expect(byId.get(ids.db)!.relation).toBe('depends on');
    expect(byId.has(ids.gateway)).toBe(true); // gateway depends on svcA
    expect(related.some((r) => r.kind === 'group' && r.id === ids.backend)).toBe(true);
    expect(related.length).toBeLessThanOrEqual(6);
    for (const r of related) expect(r.question).toMatch(/Explain/);
  });

  it('surfaces the endpoints of a relationship', () => {
    const { query, ids, plan } = setup();
    const relId = [...query.graph.relationships.values()].find((r) => r.source === ids.svcA && r.target === ids.db)!.id;
    const related = deriveRelatedElements(query, plan.plan(query, { target: { kind: 'relationship', id: relId } }));
    expect(related.map((r) => r.id)).toEqual(expect.arrayContaining([ids.svcA, ids.db]));
  });

  it('surfaces hubs for the whole diagram', () => {
    const { query, plan } = setup();
    const related = deriveRelatedElements(query, plan.plan(query, { target: { kind: 'diagram' } }));
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((r) => r.relation === 'central hub')).toBe(true);
  });
});

describe('suggestFollowUpQuestions', () => {
  it('offers downstream-effect questions only when the node has dependents', () => {
    const { query, ids, plan } = setup();
    // Postgres has dependents (svcA, svcB depend on it) → downstream question.
    const dbQs = suggestFollowUpQuestions(query, plan.plan(query, { target: { kind: 'node', id: ids.db } }));
    expect(dbQs.some((q) => /downstream/i.test(q))).toBe(true);
    expect(dbQs.length).toBeLessThanOrEqual(5);

    // The gateway has no dependents (nothing depends on it) → no downstream question.
    const gatewayQs = suggestFollowUpQuestions(query, plan.plan(query, { target: { kind: 'node', id: ids.gateway } }));
    expect(gatewayQs.some((q) => /downstream/i.test(q))).toBe(false);
  });

  it('offers a depth toggle', () => {
    const { query, ids, plan } = setup();
    const overview = suggestFollowUpQuestions(query, plan.plan(query, { target: { kind: 'node', id: ids.gateway }, depth: 'overview' }));
    expect(overview.some((q) => /more detail/i.test(q))).toBe(true);
  });
});
