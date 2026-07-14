import { describe, it, expect } from 'vitest';
import { buildSemanticGraph, SemanticQuery, StaticAnalysisEngine, RuleRegistry, defaultRuleRegistry, severityRank } from '@/ai';
import type { ReviewRule } from '@/ai';
import { softwareDiagram } from './helpers';

function analyzeDoc(registry = defaultRuleRegistry()) {
  const { doc } = softwareDiagram();
  const graph = buildSemanticGraph(doc);
  const engine = new StaticAnalysisEngine(registry, () => 0);
  return engine.analyze({ graph, query: new SemanticQuery(graph), domain: 'software-architecture' });
}

describe('RuleRegistry', () => {
  it('filters rules by domain (universal always included)', () => {
    const reg = defaultRuleRegistry();
    const sw = reg.forDomain('software-architecture').map((r) => r.id);
    expect(sw).toContain('software/single-point-of-failure');
    expect(sw).toContain('universal/cycle');
    expect(sw).not.toContain('business/dead-end');

    const biz = reg.forDomain('business-workflow').map((r) => r.id);
    expect(biz).toContain('business/dead-end');
    expect(biz).not.toContain('software/single-point-of-failure');
    expect(biz).toContain('universal/cycle');
  });
});

describe('StaticAnalysisEngine', () => {
  it('produces findings before any LLM, with per-rule stats', () => {
    const result = analyzeDoc();
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.rulesRun).toBeGreaterThan(0);
    expect(result.rulesHit).toBeGreaterThan(0);
    expect(result.stats.length).toBe(result.rulesRun);
    expect(result.stats.every((s) => s.durationMs >= 0)).toBe(true);
  });

  it('prioritises findings most-severe first', () => {
    const result = analyzeDoc();
    for (let i = 1; i < result.findings.length; i++) {
      expect(severityRank(result.findings[i - 1]!.severity)).toBeLessThanOrEqual(severityRank(result.findings[i]!.severity));
    }
  });

  it('is deterministic — same input, same findings in the same order', () => {
    const a = analyzeDoc();
    const b = analyzeDoc();
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
  });

  it('isolates a failing rule instead of crashing the review', () => {
    const boom: ReviewRule = {
      id: 'test/boom',
      category: 'structure',
      severity: 'low',
      title: 'Boom',
      description: '',
      recommendation: '',
      evaluate() {
        throw new Error('kaboom');
      },
    };
    const registry = new RuleRegistry().registerAll(defaultRuleRegistry().all()).register(boom);
    const result = analyzeDoc(registry);
    const boomStat = result.stats.find((s) => s.ruleId === 'test/boom');
    expect(boomStat?.error).toBe('kaboom');
    expect(result.findings.length).toBeGreaterThan(0); // other rules still ran
  });
});
