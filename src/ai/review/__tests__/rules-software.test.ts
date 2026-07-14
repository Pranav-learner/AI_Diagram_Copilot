import { describe, it, expect } from 'vitest';
import { buildSemanticGraph, SemanticQuery, buildContext, detectDomain } from '@/ai';
import type { RuleContext, ReviewRule } from '@/ai';
import type { DiagramDocument } from '@/dsl';
import {
  singlePointOfFailureRule,
  missingGatewayRule,
  missingAuthRule,
  missingCacheRule,
  tightCouplingRule,
  bottleneckRule,
  deadServiceRule,
  missingObservabilityRule,
  poorSeparationRule,
} from '@/ai';
import { softwareDiagram, goodArchitecture, makeModel } from './helpers';

function ctxFor(doc: DiagramDocument): RuleContext {
  const graph = buildSemanticGraph(doc);
  const query = new SemanticQuery(graph);
  return buildContext(graph, query, detectDomain(graph), new Set(graph.entities.keys()), true);
}

function run(rule: ReviewRule, doc: DiagramDocument) {
  return rule.evaluate(ctxFor(doc));
}

describe('software rules — flawed architecture', () => {
  it('detects the shared database as a single point of failure', () => {
    const { doc, ids } = softwareDiagram();
    const found = run(singlePointOfFailureRule, doc);
    expect(found.some((f) => f.affectedEntities?.includes(ids.db))).toBe(true);
  });

  it('detects the missing gateway (clients hit services directly)', () => {
    const { doc } = softwareDiagram();
    expect(run(missingGatewayRule, doc)).toHaveLength(1);
  });

  it('detects the missing auth boundary', () => {
    const { doc } = softwareDiagram();
    expect(run(missingAuthRule, doc)).toHaveLength(1);
  });

  it('detects the hot database with no cache', () => {
    const { doc, ids } = softwareDiagram();
    const found = run(missingCacheRule, doc);
    expect(found.some((f) => f.affectedEntities?.includes(ids.db))).toBe(true);
  });

  it('detects missing observability', () => {
    const { doc } = softwareDiagram();
    expect(run(missingObservabilityRule, doc)).toHaveLength(1);
  });
});

describe('software rules — healthy architecture stays quiet', () => {
  it('does not flag gateway/auth/cache/observability when present', () => {
    const { doc } = goodArchitecture();
    expect(run(missingGatewayRule, doc)).toHaveLength(0);
    expect(run(missingAuthRule, doc)).toHaveLength(0);
    expect(run(missingCacheRule, doc)).toHaveLength(0);
    expect(run(missingObservabilityRule, doc)).toHaveLength(0);
  });
});

describe('software rules — targeted', () => {
  it('detects bidirectional coupling', () => {
    const m = makeModel();
    const a = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'A' } });
    const b = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'B' } });
    m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, metadata: { relType: 'dependency' } });
    m.createEdge({ source: { nodeId: b.id }, target: { nodeId: a.id }, metadata: { relType: 'dependency' } });
    const found = run(tightCouplingRule, m.document);
    expect(found.some((f) => f.title === 'Bidirectional coupling')).toBe(true);
  });

  it('detects a scalability bottleneck (high in-degree, no LB)', () => {
    const m = makeModel();
    const hub = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'Hub' } });
    for (let i = 0; i < 6; i++) {
      const n = m.createNode({ type: 'shape', semantic: 'service', label: { text: `S${i}` } });
      m.createEdge({ source: { nodeId: n.id }, target: { nodeId: hub.id }, metadata: { relType: 'dependency' } });
    }
    expect(run(bottleneckRule, m.document).some((f) => f.affectedEntities?.includes(hub.id))).toBe(true);
  });

  it('detects an unreachable (dead) service', () => {
    const m = makeModel();
    const user = m.createNode({ type: 'shape', semantic: 'user', label: { text: 'User' } });
    const web = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'Web' } });
    m.createEdge({ source: { nodeId: user.id }, target: { nodeId: web.id }, metadata: { relType: 'flow' } });
    // An orphan pair with no path from the user.
    const dead = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'Legacy' } });
    const other = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'Other' } });
    m.createEdge({ source: { nodeId: dead.id }, target: { nodeId: other.id }, metadata: { relType: 'dependency' } });
    expect(run(deadServiceRule, m.document).some((f) => f.affectedEntities?.includes(dead.id))).toBe(true);
  });

  it('flags weak separation of concerns for a large ungrouped diagram', () => {
    const m = makeModel();
    const nodes = Array.from({ length: 9 }, (_, i) => m.createNode({ type: 'shape', semantic: 'service', label: { text: `Svc${i}` } }));
    for (let i = 1; i < nodes.length; i++) m.createEdge({ source: { nodeId: nodes[i - 1]!.id }, target: { nodeId: nodes[i]!.id }, metadata: { relType: 'dependency' } });
    expect(run(poorSeparationRule, m.document)).toHaveLength(1);
  });
});
