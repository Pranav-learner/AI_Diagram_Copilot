import { describe, it, expect } from 'vitest';
import { IntelligenceEngine } from '../IntelligenceEngine';
import { softwareModel, engineFor, insightService, scriptedService, counterClock, makeModel } from './helpers';

function make(withService = true) {
  const { model, ids, addAuth } = softwareModel();
  const understanding = engineFor(model);
  const engine = new IntelligenceEngine({ graphSource: understanding, ...(withService ? { service: insightService() } : {}), now: counterClock() });
  return { engine, understanding, model, ids, addAuth };
}

const hasInsight = (feed: readonly { id: string }[], ruleId: string) => feed.some((i) => i.id === `insight:${ruleId}`);

describe('IntelligenceEngine — proactive feed', () => {
  it('produces a ranked insight feed from static analysis', () => {
    const { engine } = make();
    const feed = engine.getFeed();
    expect(feed.length).toBeGreaterThan(0);
    expect(hasInsight(feed, 'software/single-point-of-failure')).toBe(true);
    expect(hasInsight(feed, 'software/missing-authentication')).toBe(true);
    // Ranked: each priority >= the next.
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1]!.priority.score).toBeGreaterThanOrEqual(feed[i]!.priority.score);
    expect(feed[0]!.priority.rationale).toMatch(/Ranked by:/);
  });

  it('reacts proactively to diagram changes and resolves fixed findings', () => {
    const { engine, understanding, model, addAuth } = make();
    expect(hasInsight(engine.getFeed(), 'software/missing-authentication')).toBe(true);

    addAuth();
    understanding.update(model.document, 2); // fires onUpdate → auto refresh

    expect(hasInsight(engine.getFeed(), 'software/missing-authentication')).toBe(false);
    expect(engine.timelineEvents().some((e) => e.kind === 'resolved')).toBe(true);
  });

  it('suppresses duplicate findings across re-analysis', () => {
    const { engine, understanding, model } = make();
    understanding.update(model.document, 2); // no structural change → same findings
    expect(engine.metrics().suppressedDuplicates).toBeGreaterThan(0);
  });

  it('filters and searches the feed', () => {
    const { engine } = make();
    expect(engine.getFeed({ severity: 'high' }).every((i) => i.severity === 'high')).toBe(true);
    expect(engine.getFeed({ search: 'cache' }).some((i) => /cache/i.test(i.title))).toBe(true);
    expect(engine.getFeed({ type: 'security-risk' }).every((i) => i.type === 'security-risk')).toBe(true);
  });
});

describe('IntelligenceEngine — lifecycle', () => {
  it('dismisses an insight and keeps it suppressed', () => {
    const { engine, understanding, model } = make();
    engine.dismiss('insight:software/missing-cache');
    expect(hasInsight(engine.getFeed(), 'software/missing-cache')).toBe(false);
    expect(engine.metrics().dismissed).toBe(1);
    expect(engine.timelineEvents().some((e) => e.kind === 'dismissed')).toBe(true);

    understanding.update(model.document, 2); // still detected, but stays dismissed
    expect(hasInsight(engine.getFeed(), 'software/missing-cache')).toBe(false);
  });

  it('resurfaces a user-resolved insight that is still present', () => {
    const { engine, understanding, model } = make();
    engine.resolve('insight:software/missing-observability');
    expect(hasInsight(engine.getFeed(), 'software/missing-observability')).toBe(false);

    understanding.update(model.document, 2); // still detected → recurring
    expect(hasInsight(engine.getFeed(), 'software/missing-observability')).toBe(true);
    expect(engine.timelineEvents().some((e) => e.kind === 'recurring')).toBe(true);
  });
});

describe('IntelligenceEngine — contextual + activity', () => {
  it('suggests actions and related insights for a selection', () => {
    const { engine, ids } = make();
    const ctx = engine.contextualSuggestions([ids.db]);
    expect(ctx.insights.some((i) => i.affectedEntities.includes(ids.db))).toBe(true);
    expect(ctx.actions.some((a) => a.kind === 'explain')).toBe(true);
    expect(ctx.actions.some((a) => a.kind === 'review')).toBe(true);
    expect(ctx.actions.length).toBeLessThanOrEqual(4);
  });

  it('boosts priority for recently-touched elements', () => {
    const { engine, ids } = make();
    const before = engine.getInsight('insight:software/missing-cache')!.priority.score;
    engine.noteActivity([ids.db]);
    const after = engine.getInsight('insight:software/missing-cache')!.priority.score;
    expect(after).toBeGreaterThan(before);
  });

  it('offers suggested next actions', () => {
    const { engine } = make();
    expect(engine.suggestedNextActions().length).toBeGreaterThan(0);
  });
});

describe('IntelligenceEngine — briefing', () => {
  it('generates a proactive briefing referencing the insights', async () => {
    const { engine } = make();
    const result = await engine.generateBriefing();
    expect(result.degraded).toBe(false);
    expect(result.briefing.observations.length).toBeGreaterThan(0);
    expect(result.briefing.observations.every((o) => o.insightId.startsWith('insight:'))).toBe(true);
    expect(result.insights.some((i) => typeof i.observation === 'string')).toBe(true);
    expect(result.briefing.nextActions.length).toBeGreaterThan(0);
  });

  it('caches the briefing until the diagram changes', async () => {
    const { engine } = make();
    await engine.generateBriefing();
    expect((await engine.generateBriefing()).cached).toBe(true);
  });

  it('degrades to a deterministic briefing without an LLM', async () => {
    const { engine } = make(false);
    const result = await engine.generateBriefing();
    expect(result.degraded).toBe(true);
    expect(result.usage.totalTokens).toBe(0);
    expect(result.briefing.headline.length).toBeGreaterThan(0);
    expect(result.briefing.observations.length).toBeGreaterThan(0);
  });

  it('degrades when the LLM returns junk', async () => {
    const { model } = softwareModel();
    const engine = new IntelligenceEngine({ graphSource: engineFor(model), service: scriptedService('not json', 'still not json'), now: counterClock(), stream: false });
    const result = await engine.generateBriefing();
    expect(result.degraded).toBe(true);
    expect(result.briefing.observations.length).toBeGreaterThan(0); // deterministic fallback
  });
});

describe('IntelligenceEngine — edge cases', () => {
  it('handles an empty diagram', async () => {
    const engine = new IntelligenceEngine({ graphSource: engineFor(makeModel()), service: insightService(), now: counterClock() });
    expect(engine.getFeed()).toHaveLength(0);
    const result = await engine.generateBriefing();
    expect(result.degraded).toBe(false);
    expect(result.briefing.headline).toMatch(/healthy/i);
  });

  it('notifies listeners on refresh and can be disposed', () => {
    const { engine, understanding, model } = make();
    let calls = 0;
    const off = engine.onUpdate(() => calls++);
    understanding.update(model.document, 2);
    expect(calls).toBeGreaterThan(0);
    off();
    engine.dispose();
  });
});
