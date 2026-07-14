import { describe, it, expect } from 'vitest';
import { ReviewEngine } from '../ReviewEngine';
import { ReviewError } from '../errors';
import { softwareDiagram, goodArchitecture, engineFor, reviewService, scriptedService, makeModel } from './helpers';

describe('ReviewEngine', () => {
  it('reviews a diagram end-to-end: findings, scores, and LLM explanations', async () => {
    const { doc, ids } = softwareDiagram();
    const engine = new ReviewEngine({ service: reviewService(), graphSource: engineFor(doc) });
    const stagesDone: string[] = [];
    const result = await engine.review({}, { onStage: (u) => u.state === 'done' && stagesDone.push(u.stage) });

    expect(result.degraded).toBe(false);
    expect(result.review.findings.length).toBeGreaterThan(0);
    expect(result.review.scores.overall.label).toBe('Architecture Score');
    expect(result.review.summary.length).toBeGreaterThan(0);
    // The LLM attached notes to findings (by id).
    expect(result.review.findings.some((f) => typeof f.note === 'string')).toBe(true);
    // The SPOF finding highlights the shared database.
    expect(result.review.affectedEntities).toContain(ids.db);
    expect(stagesDone).toEqual(expect.arrayContaining(['analyzing', 'scoring', 'explaining', 'formatting']));
  });

  it('runs deterministically with the LLM disabled (degraded)', async () => {
    const { doc } = softwareDiagram();
    const engine = new ReviewEngine({ service: reviewService(), graphSource: engineFor(doc) });
    const result = await engine.review({ useLLM: false });
    expect(result.degraded).toBe(true);
    expect(result.usage.totalTokens).toBe(0);
    expect(result.review.findings.length).toBeGreaterThan(0);
    expect(result.review.summary).toMatch(/Static analysis found/);
    expect(result.review.priorityActions.length).toBeGreaterThan(0);
  });

  it('degrades gracefully when the LLM returns junk', async () => {
    const { doc } = softwareDiagram();
    const engine = new ReviewEngine({ service: scriptedService('not json', 'still not json'), graphSource: engineFor(doc), stream: false });
    const result = await engine.review();
    expect(result.degraded).toBe(true);
    expect(result.review.findings.length).toBeGreaterThan(0); // deterministic review survives
  });

  it('caches whole-diagram reviews and invalidates them on change', async () => {
    const { model, doc, ids } = softwareDiagram();
    const understanding = engineFor(doc);
    const engine = new ReviewEngine({ service: reviewService(), graphSource: understanding });

    expect((await engine.review()).cached).toBe(false);
    const second = await engine.review();
    expect(second.cached).toBe(true);
    expect(second.usage.totalTokens).toBe(0);

    // Any change invalidates a whole-diagram review.
    model.updateNode(ids.orders as never, { label: { text: 'Orders API' } });
    understanding.update(model.document, 2);
    expect((await engine.review()).cached).toBe(false);
  });

  it('reviews a selection', async () => {
    const { doc, ids } = softwareDiagram();
    const engine = new ReviewEngine({ service: reviewService(), graphSource: engineFor(doc) });
    const result = await engine.review({ scope: { kind: 'selection', ids: [ids.db, ids.orders] } });
    expect(result.review.scopeLabel).toMatch(/2 selected/);
  });

  it('gives a healthy architecture strengths and a good score', async () => {
    const { doc } = goodArchitecture();
    const engine = new ReviewEngine({ service: reviewService(), graphSource: engineFor(doc) });
    const result = await engine.review({ useLLM: false });
    expect(result.review.strengths.length).toBeGreaterThan(0);
    expect(result.review.scores.overall.score).toBeGreaterThan(60);
  });

  it('refuses to review an empty diagram', async () => {
    const engine = new ReviewEngine({ service: reviewService(), graphSource: engineFor(makeModel().document) });
    await expect(engine.review()).rejects.toThrow(ReviewError);
  });

  it('honours cancellation', async () => {
    const { doc } = softwareDiagram();
    const engine = new ReviewEngine({ service: reviewService(), graphSource: engineFor(doc) });
    const controller = new AbortController();
    controller.abort();
    await expect(engine.review({ signal: controller.signal })).rejects.toThrow();
  });
});
