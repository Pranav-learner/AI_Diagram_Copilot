import { describe, it, expect } from 'vitest';
import { makeArchitecture } from './helpers';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { contextTokens, extractContext, renderContext } from '../context/ContextExtractor';

function graph() {
  const { model, ids } = makeArchitecture();
  return { g: buildSemanticGraph(model.document), ids };
}

describe('context extraction', () => {
  it('whole scope includes every entity', () => {
    const { g } = graph();
    const ctx = extractContext(g, { kind: 'whole' });
    expect(ctx.entities).toHaveLength(6);
    expect(ctx.relationships).toHaveLength(6);
    expect(ctx.truncated).toBe(false);
  });

  it('entity scope pins the focus and adds a hop of context', () => {
    const { g, ids } = graph();
    const ctx = extractContext(g, { kind: 'entity', id: ids.svcA }, { contextRadius: 1 });
    expect(ctx.focusIds).toEqual([ids.svcA]);
    const included = new Set(ctx.entities.map((e) => e.id));
    expect(included.has(ids.svcA)).toBe(true);
    expect(included.has(ids.db)).toBe(true); // neighbour
    expect(included.has(ids.gateway)).toBe(true); // neighbour
  });

  it('group scope includes members', () => {
    const { g, ids } = graph();
    const ctx = extractContext(g, { kind: 'group', id: ids.backend });
    expect(new Set(ctx.entities.map((e) => e.id))).toEqual(new Set([ids.svcA, ids.svcB, ids.db, ids.cache]));
  });

  it('path scope includes only the path', () => {
    const { g, ids } = graph();
    const ctx = extractContext(g, { kind: 'path', from: ids.user, to: ids.db });
    const included = ctx.entities.map((e) => e.id);
    expect(included[0]).toBe(ids.user);
    expect(included).toContain(ids.db);
    expect(included).not.toContain(ids.cache);
  });

  it('truncates against a tiny token budget but always keeps focus', () => {
    const { g, ids } = graph();
    const ctx = extractContext(g, { kind: 'entity', id: ids.gateway }, { tokenBudget: 1, contextRadius: 2 });
    expect(ctx.truncated).toBe(true);
    expect(ctx.entities.map((e) => e.id)).toContain(ids.gateway);
  });

  it('renders a compact JSON block with focus and ids', () => {
    const { g, ids } = graph();
    const ctx = extractContext(g, { kind: 'entity', id: ids.gateway });
    const rendered = renderContext(ctx);
    expect(rendered).toContain('```json');
    expect(rendered).toContain(ids.gateway);
    expect(contextTokens(ctx)).toBeGreaterThan(0);
  });

  it('counts boundary relationships crossing the extracted region', () => {
    const { g, ids } = graph();
    const ctx = extractContext(g, { kind: 'subgraph', ids: [ids.svcA] });
    // svcA has edges to db, cache (out) and gateway (in) — all cross the boundary.
    expect(ctx.boundaryRelationshipCount).toBe(3);
    expect(ctx.relationships).toHaveLength(0);
  });
});
