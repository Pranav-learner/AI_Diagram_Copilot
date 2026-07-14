import { describe, it, expect } from 'vitest';
import { FindingRepository } from '../FindingRepository';
import { buildInsights } from '../aggregation';
import { finding, counterClock } from './helpers';

function activeEntries(...findings: import('@/ai').Finding[]) {
  const repo = new FindingRepository(counterClock());
  repo.update(findings, 1);
  return repo.active();
}

describe('buildInsights', () => {
  it('merges findings of the same rule into one insight', () => {
    const entries = activeEntries(
      finding('software/single-point-of-failure#db', { ruleId: 'software/single-point-of-failure', title: 'Single point of failure: DB', severity: 'high', affectedEntities: ['db'] }),
      finding('software/single-point-of-failure#gw', { ruleId: 'software/single-point-of-failure', title: 'Single point of failure: Gateway', severity: 'high', affectedEntities: ['gw'] }),
    );
    const insights = buildInsights(entries, 'software-architecture');
    expect(insights).toHaveLength(1);
    expect(insights[0]!.id).toBe('insight:software/single-point-of-failure');
    expect(insights[0]!.findingIds).toHaveLength(2);
    expect(insights[0]!.affectedEntities).toEqual(expect.arrayContaining(['db', 'gw']));
    expect(insights[0]!.title).toMatch(/\(2\)/);
  });

  it('keeps distinct rules as distinct insights and classifies types', () => {
    const entries = activeEntries(
      finding('software/missing-cache#db', { ruleId: 'software/missing-cache', category: 'performance', severity: 'medium' }),
      finding('software/missing-authentication', { ruleId: 'software/missing-authentication', category: 'security', severity: 'high' }),
    );
    const insights = buildInsights(entries, 'software-architecture');
    expect(insights).toHaveLength(2);
    const byId = new Map(insights.map((i) => [i.id, i]));
    expect(byId.get('insight:software/missing-cache')!.type).toBe('performance-opportunity');
    expect(byId.get('insight:software/missing-authentication')!.type).toBe('security-risk');
  });

  it('takes the most severe finding as the insight severity', () => {
    const entries = activeEntries(
      finding('r#1', { ruleId: 'r', severity: 'low' }),
      finding('r#2', { ruleId: 'r', severity: 'critical' }),
    );
    expect(buildInsights(entries, 'generic')[0]!.severity).toBe('critical');
  });
});
