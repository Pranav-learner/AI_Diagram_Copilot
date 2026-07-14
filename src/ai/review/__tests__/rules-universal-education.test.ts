import { describe, it, expect } from 'vitest';
import { buildSemanticGraph, SemanticQuery, buildContext, detectDomain } from '@/ai';
import type { RuleContext, ReviewRule } from '@/ai';
import type { DiagramDocument } from '@/dsl';
import { cycleRule, disconnectedRule, isolatedRule, flatStructureRule } from '@/ai';
import { educationMap, makeModel } from './helpers';

function ctxFor(doc: DiagramDocument, domainOverride?: string): RuleContext {
  const graph = buildSemanticGraph(doc);
  return buildContext(graph, new SemanticQuery(graph), domainOverride ?? detectDomain(graph), new Set(graph.entities.keys()), true);
}
const run = (rule: ReviewRule, doc: DiagramDocument, domain?: string) => rule.evaluate(ctxFor(doc, domain));

describe('universal rules', () => {
  it('detects a cycle', () => {
    const m = makeModel();
    const a = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'A' } });
    const b = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'B' } });
    const c = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'C' } });
    m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'dependency' } });
    m.createEdge({ source: { nodeId: b.id }, target: { nodeId: c.id }, metadata: { relType: 'dependency' } });
    m.createEdge({ source: { nodeId: c.id }, target: { nodeId: a.id }, metadata: { relType: 'dependency' } });
    const found = run(cycleRule, m.document);
    expect(found).toHaveLength(1);
    expect(found[0]!.affectedEntities).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
  });

  it('adapts cycle wording to the domain', () => {
    const m = makeModel();
    const a = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'A' } });
    const b = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'B' } });
    m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'flow' } });
    m.createEdge({ source: { nodeId: b.id }, target: { nodeId: a.id }, metadata: { relType: 'flow' } });
    expect(run(cycleRule, m.document, 'business-workflow')[0]!.message).toMatch(/loop/i);
  });

  it('detects disconnected clusters', () => {
    const m = makeModel();
    const a = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'A' } });
    const b = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'B' } });
    m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'dependency' } });
    const c = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'C' } });
    const d = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'D' } });
    m.createEdge({ source: { nodeId: c.id }, target: { nodeId: d.id }, metadata: { relType: 'dependency' } });
    expect(run(disconnectedRule, m.document)).toHaveLength(1);
  });

  it('detects isolated elements', () => {
    const m = makeModel();
    m.createNode({ type: 'shape', semantic: 'service', label: { text: 'Lonely' } });
    const found = run(isolatedRule, m.document);
    expect(found).toHaveLength(1);
    expect(found[0]!.affectedEntities).toHaveLength(1);
  });
});

describe('education rules', () => {
  it('detects a flat learning structure', () => {
    const { doc } = educationMap();
    expect(run(flatStructureRule, doc)).toHaveLength(1);
  });
});
