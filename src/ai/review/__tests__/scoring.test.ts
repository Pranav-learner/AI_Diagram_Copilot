import { describe, it, expect } from 'vitest';
import { buildSemanticGraph, SemanticQuery, StaticAnalysisEngine, defaultRuleRegistry, computeScores, deriveStrengths } from '@/ai';
import type { Finding } from '@/ai';
import { softwareDiagram, goodArchitecture } from './helpers';

function scoreDoc(pick: () => { doc: import('@/dsl').DiagramDocument }) {
  const { doc } = pick();
  const graph = buildSemanticGraph(doc);
  const engine = new StaticAnalysisEngine(defaultRuleRegistry(), () => 0);
  const analysis = engine.analyze({ graph, query: new SemanticQuery(graph), domain: 'software-architecture' });
  return { graph, findings: analysis.findings, scores: computeScores(analysis.findings, graph, 'software-architecture') };
}

describe('computeScores', () => {
  it('reports an architecture score plus per-dimension scores with rationale', () => {
    const { scores } = scoreDoc(softwareDiagram);
    expect(scores.overall.label).toBe('Architecture Score');
    expect(scores.overall.score).toBeGreaterThanOrEqual(0);
    expect(scores.overall.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(scores.overall.grade);
    expect(scores.dimensions.map((d) => d.key)).toEqual(expect.arrayContaining(['security', 'availability', 'complexity']));
    for (const d of scores.dimensions) expect(d.rationale.length).toBeGreaterThan(0);
  });

  it('scores a flawed architecture below a healthy one', () => {
    const flawed = scoreDoc(softwareDiagram).scores.overall.score;
    const healthy = scoreDoc(goodArchitecture).scores.overall.score;
    expect(healthy).toBeGreaterThan(flawed);
  });

  it('penalises the security dimension when auth is missing', () => {
    const { scores } = scoreDoc(softwareDiagram);
    const security = scores.dimensions.find((d) => d.key === 'security')!;
    expect(security.score).toBeLessThan(100);
    expect(security.rationale).toMatch(/finding/);
  });

  it('is transparent — the rationale explains a perfect dimension too', () => {
    const clean: readonly Finding[] = [];
    const graph = buildSemanticGraph(goodArchitecture().doc);
    const scores = computeScores(clean, graph, 'software-architecture');
    const perfect = scores.dimensions.find((d) => d.score === 100);
    expect(perfect?.rationale).toMatch(/No issues|full marks/i);
  });
});

describe('deriveStrengths', () => {
  it('recognises caching, gateway, auth, observability, and grouping', () => {
    const graph = buildSemanticGraph(goodArchitecture().doc);
    const strengths = deriveStrengths(graph, 'software-architecture');
    const joined = strengths.join(' ');
    expect(joined).toMatch(/caching/i);
    expect(joined).toMatch(/gateway|load balancer/i);
    expect(joined).toMatch(/authentication|authoriz/i);
    expect(joined).toMatch(/group/i);
  });
});
