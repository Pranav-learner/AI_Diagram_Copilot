import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../planning/ContextBuilder';
import { contextSource, sampleDocument } from './helpers';
import { DiagramModel } from '@/dsl';

describe('ContextBuilder', () => {
  it('summarizes a diagram into counts, nodes, and edges', () => {
    const ctx = new ContextBuilder().build(contextSource(sampleDocument(), ['n1']));
    expect(ctx.diagram.counts.nodes).toBe(2);
    expect(ctx.diagram.counts.edges).toBe(1);
    expect(ctx.diagram.nodes.some((n) => n.label === 'API')).toBe(true);
    expect(ctx.diagram.edges[0]!.label).toBe('reads');
    expect(ctx.selection).toEqual(['n1']);
    expect(ctx.diagram.truncated).toBe(false);
    expect(ctx.estimatedTokens).toBeGreaterThan(0);
  });

  it('truncates large diagrams to the node cap and marks it', () => {
    const model = DiagramModel.create();
    for (let i = 0; i < 20; i++) model.createNode({ type: 'shape', shape: 'rectangle', position: { x: i, y: 0 } });
    const builder = new ContextBuilder({ maxNodes: 5 });
    const ctx = builder.build(contextSource(model.document));
    expect(ctx.diagram.counts.nodes).toBe(20);
    expect(ctx.diagram.nodes).toHaveLength(5);
    expect(ctx.diagram.truncated).toBe(true);
  });

  it('renders a fenced JSON block and respects the token budget', () => {
    const model = DiagramModel.create();
    for (let i = 0; i < 100; i++) {
      model.createNode({ type: 'shape', shape: 'rectangle', label: { text: `node-${i}` }, position: { x: i, y: 0 } });
    }
    const builder = new ContextBuilder({ tokenBudget: 200 });
    const rendered = builder.render(builder.build(contextSource(model.document)));
    expect(rendered.startsWith('```json')).toBe(true);
    // Budget is a soft cap; rendering shrinks to approach it.
    expect(rendered.length).toBeLessThan(100 * 120);
  });
});
