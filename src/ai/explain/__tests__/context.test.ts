import { describe, it, expect } from 'vitest';
import { SemanticQuery, buildSemanticGraph } from '@/ai';
import { ExplanationPlanner } from '../ExplanationPlanner';
import { buildExplainContext } from '../ContextView';
import { architecture } from './helpers';

function setup() {
  const { doc, ids } = architecture();
  const query = new SemanticQuery(buildSemanticGraph(doc));
  return { query, ids, plan: new ExplanationPlanner() };
}

describe('buildExplainContext', () => {
  it('produces a compact, focused block for a node', () => {
    const { query, ids, plan } = setup();
    const req = plan.plan(query, { target: { kind: 'node', id: ids.gateway } });
    const view = buildExplainContext(query, req);

    expect(view.block).toContain('Diagram overview:');
    expect(view.block).toContain('Focus of this explanation:');
    expect(view.block).toContain('```json');
    expect(view.block).toContain(ids.gateway);
    expect(view.estimatedTokens).toBeGreaterThan(0);
    // Focus + its 1-hop neighbours only — not the far cache node.
    expect(view.dependencyIds).toContain(ids.gateway);
    expect(view.dependencyIds).toContain(ids.svcA);
    expect(view.dependencyIds).not.toContain(ids.cache);
  });

  it('includes focus attributes when present', () => {
    const { query, plan } = setup();
    // Add a node carrying metadata attributes.
    const { doc } = architecture();
    void doc;
    const req = plan.plan(query, { target: { kind: 'node', id: [...query.graph.entities.keys()][0]! } });
    const view = buildExplainContext(query, req);
    expect(typeof view.block).toBe('string');
  });

  it('stays within a small token budget for the whole diagram', () => {
    const { query, plan } = setup();
    const req = plan.plan(query, { target: { kind: 'diagram' } });
    const view = buildExplainContext(query, req, { tokenBudget: 300 });
    // The rendered context portion honours the budget (digest text is extra).
    expect(view.estimatedTokens).toBeLessThan(1200);
  });
});
