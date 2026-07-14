import { describe, it, expect } from 'vitest';
import { SemanticQuery, buildSemanticGraph } from '@/ai';
import { ExplanationPlanner } from '../ExplanationPlanner';
import { ExplainError } from '../errors';
import { architecture, makeModel } from './helpers';

function planner() {
  const { doc, ids } = architecture();
  return { plan: new ExplanationPlanner(), query: new SemanticQuery(buildSemanticGraph(doc)), ids };
}

describe('ExplanationPlanner', () => {
  it('plans a node explanation with an entity scope + descriptor', () => {
    const { plan, query, ids } = planner();
    const req = plan.plan(query, { target: { kind: 'node', id: ids.gateway } });
    expect(req.scope).toEqual({ kind: 'entity', id: ids.gateway });
    expect(req.targetLabel).toBe('API Gateway');
    expect(req.targetDescriptor).toMatch(/gateway "API Gateway"/);
    expect(req.domain).toBe('software-architecture');
    expect(req.aspects).toContain('purpose');
  });

  it('honours audience/depth/style overrides and adds detailed aspects', () => {
    const { plan, query, ids } = planner();
    const req = plan.plan(query, { target: { kind: 'node', id: ids.db }, depth: 'detailed', audience: 'beginner', style: 'educational' });
    expect(req.depth).toBe('detailed');
    expect(req.audience).toBe('beginner');
    expect(req.style).toBe('educational');
    expect(req.aspects).toContain('bestPractices');
    expect(req.aspects).toContain('examples'); // educational
  });

  it('plans a relationship explanation over its endpoints', () => {
    const { plan, query, ids } = planner();
    const relId = [...query.graph.relationships.values()].find((r) => r.source === ids.gateway && r.target === ids.svcA)!.id;
    const req = plan.plan(query, { target: { kind: 'relationship', id: relId } });
    expect(req.scope).toEqual({ kind: 'subgraph', ids: [ids.gateway, ids.svcA] });
    expect(req.targetLabel).toBe('API Gateway → Orders Service');
  });

  it('plans a group, path, and dependency chain', () => {
    const { plan, query, ids } = planner();
    expect(plan.plan(query, { target: { kind: 'group', id: ids.backend } }).scope).toEqual({ kind: 'group', id: ids.backend });
    expect(plan.plan(query, { target: { kind: 'path', from: ids.user, to: ids.db } }).scope).toEqual({ kind: 'path', from: ids.user, to: ids.db });
    const chain = plan.plan(query, { target: { kind: 'dependencyChain', id: ids.gateway } });
    expect(chain.scope.kind).toBe('subgraph');
    if (chain.scope.kind === 'subgraph') expect(chain.scope.ids).toContain(ids.db);
  });

  it('plans the whole diagram', () => {
    const { plan, query } = planner();
    const req = plan.plan(query, { target: { kind: 'diagram' } });
    expect(req.scope).toEqual({ kind: 'whole' });
    expect(req.aspects).toContain('designDecisions');
  });

  it('throws on an unknown or empty target', () => {
    const { plan, query } = planner();
    expect(() => plan.plan(query, { target: { kind: 'node', id: 'ghost' } })).toThrow(ExplainError);
    expect(() => plan.plan(query, { target: { kind: 'selection', ids: [] } })).toThrow(ExplainError);
  });

  it('empty diagram + diagram target still plans (engine guards emptiness)', () => {
    const q = new SemanticQuery(buildSemanticGraph(makeModel().document));
    const req = new ExplanationPlanner().plan(q, { target: { kind: 'diagram' } });
    expect(req.domain).toBe('generic');
  });
});
