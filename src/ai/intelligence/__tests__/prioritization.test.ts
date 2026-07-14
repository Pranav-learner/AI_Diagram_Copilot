import { describe, it, expect } from 'vitest';
import { scoreInsight, prioritize, type PriorityContext } from '../prioritization';
import type { InsightDraft } from '../aggregation';

function draft(over: Partial<InsightDraft> = {}): InsightDraft {
  return {
    id: over.id ?? 'insight:x',
    type: over.type ?? 'architecture-suggestion',
    title: over.title ?? 'X',
    summary: 'summary',
    severity: over.severity ?? 'medium',
    confidence: over.confidence ?? 0.9,
    category: over.category ?? 'reliability',
    recommendation: 'fix it',
    findingIds: over.findingIds ?? ['f'],
    findings: [],
    affectedEntities: over.affectedEntities ?? [],
    seenCount: over.seenCount ?? 1,
    createdAt: 1,
  };
}

const emptyCtx: PriorityContext = { hubs: new Set(), recentlyTouched: new Set() };

describe('scoreInsight', () => {
  it('ranks higher severity above lower', () => {
    const crit = scoreInsight(draft({ severity: 'critical' }), emptyCtx).score;
    const low = scoreInsight(draft({ severity: 'low' }), emptyCtx).score;
    expect(crit).toBeGreaterThan(low);
  });

  it('boosts insights that affect a central hub', () => {
    const base = scoreInsight(draft({ affectedEntities: ['n1'] }), emptyCtx).score;
    const boosted = scoreInsight(draft({ affectedEntities: ['n1'] }), { hubs: new Set(['n1']), recentlyTouched: new Set() });
    expect(boosted.score).toBeGreaterThan(base);
    expect(boosted.factors.some((f) => /hub/.test(f.label))).toBe(true);
  });

  it('boosts recurring insights and explains the ranking', () => {
    const p = scoreInsight(draft({ seenCount: 4 }), emptyCtx);
    expect(p.factors.some((f) => f.label === 'recurring')).toBe(true);
    expect(p.rationale).toMatch(/Ranked by:/);
  });

  it('weights security by business impact', () => {
    const sec = scoreInsight(draft({ category: 'security', severity: 'medium' }), emptyCtx).score;
    const struct = scoreInsight(draft({ category: 'structure', severity: 'medium' }), emptyCtx).score;
    expect(sec).toBeGreaterThan(struct);
  });
});

describe('prioritize', () => {
  it('sorts insights by score, highest first', () => {
    const ranked = prioritize([draft({ id: 'a', severity: 'low' }), draft({ id: 'b', severity: 'critical' })], emptyCtx);
    expect(ranked[0]!.id).toBe('b');
    expect(ranked[0]!.priority.score).toBeGreaterThan(ranked[1]!.priority.score);
    expect(ranked[0]!.status).toBe('active');
  });
});
