import { describe, it, expect } from 'vitest';
import { buildSemanticGraph, SemanticQuery, buildContext } from '@/ai';
import type { RuleContext, ReviewRule } from '@/ai';
import type { DiagramDocument } from '@/dsl';
import { deadEndRule, missingEndRule, missingStartRule, unreachableActivityRule, missingDecisionRule, duplicateActivityRule } from '@/ai';
import { workflowDiagram, makeModel } from './helpers';

function ctxFor(doc: DiagramDocument, domain = 'flowchart'): RuleContext {
  const graph = buildSemanticGraph(doc);
  return buildContext(graph, new SemanticQuery(graph), domain, new Set(graph.entities.keys()), true);
}
const run = (rule: ReviewRule, doc: DiagramDocument) => rule.evaluate(ctxFor(doc));

describe('business/workflow rules', () => {
  it('detects a dead-end activity', () => {
    const { doc, ids } = workflowDiagram();
    expect(run(deadEndRule, doc).some((f) => f.affectedEntities?.includes(ids.process))).toBe(true);
  });

  it('detects a missing end node', () => {
    const { doc } = workflowDiagram();
    expect(run(missingEndRule, doc)).toHaveLength(1);
  });

  it('does not flag a missing start when a start exists', () => {
    const { doc } = workflowDiagram();
    expect(run(missingStartRule, doc)).toHaveLength(0);
  });

  it('detects an unreachable activity', () => {
    const m = makeModel();
    const start = m.createNode({ type: 'shape', semantic: 'start', label: { text: 'Start' } });
    const step = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'Step' } });
    m.createEdge({ source: { nodeId: start.id }, target: { nodeId: step.id }, metadata: { relType: 'flow' } });
    const a = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'Orphan A' } });
    const b = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'Orphan B' } });
    m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'flow' } });
    const found = run(unreachableActivityRule, m.document);
    expect(found[0]?.affectedEntities).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('detects a flow with no decision/approval step', () => {
    const m = makeModel();
    const nodes = ['Start', 'A', 'B', 'End'].map((t, i) => m.createNode({ type: 'shape', semantic: i === 0 ? 'start' : i === 3 ? 'end' : 'process', label: { text: t } }));
    for (let i = 1; i < nodes.length; i++) m.createEdge({ source: { nodeId: nodes[i - 1]!.id }, target: { nodeId: nodes[i]!.id }, metadata: { relType: 'flow' } });
    expect(run(missingDecisionRule, m.document)).toHaveLength(1);
  });

  it('detects duplicate activities', () => {
    const m = makeModel();
    const a = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'Send Email' } });
    const b = m.createNode({ type: 'shape', semantic: 'process', label: { text: 'Send Email' } });
    m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'flow' } });
    expect(run(duplicateActivityRule, m.document).some((f) => f.affectedEntities?.length === 2)).toBe(true);
  });
});
