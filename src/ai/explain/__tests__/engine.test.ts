import { describe, it, expect } from 'vitest';
import { ExplainEngine } from '../ExplainEngine';
import { ExplainError } from '../errors';
import { architecture, engineFor, explainService, scriptedService, makeModel } from './helpers';

describe('ExplainEngine', () => {
  it('explains a node end-to-end through the Semantic Graph', async () => {
    const { doc, ids } = architecture();
    const explain = new ExplainEngine({ service: explainService(), graphSource: engineFor(doc) });
    const stagesDone: string[] = [];

    const result = await explain.explain(
      { target: { kind: 'node', id: ids.gateway } },
      { onStage: (u) => u.state === 'done' && stagesDone.push(u.stage) },
    );

    expect(result.cached).toBe(false);
    expect(result.explanation.summary).toMatch(/API Gateway/);
    expect(result.explanation.markdown.length).toBeGreaterThan(0);
    expect(result.explanation.relatedElements.length).toBeGreaterThan(0);
    expect(result.explanation.suggestedQuestions.length).toBeGreaterThan(0);
    expect(result.request.domain).toBe('software-architecture');
    expect(stagesDone).toEqual(expect.arrayContaining(['planning', 'context', 'generating', 'formatting']));
  });

  it('caches an explanation and reuses it on the second call', async () => {
    const { doc, ids } = architecture();
    const explain = new ExplainEngine({ service: explainService(), graphSource: engineFor(doc) });
    const first = await explain.explain({ target: { kind: 'node', id: ids.db } });
    const second = await explain.explain({ target: { kind: 'node', id: ids.db } });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.usage.totalTokens).toBe(0);
  });

  it('invalidates only the changed region of the cache', async () => {
    const { model, doc, ids } = architecture();
    const understanding = engineFor(doc);
    const explain = new ExplainEngine({ service: explainService(), graphSource: understanding });

    await explain.explain({ target: { kind: 'node', id: ids.gateway } }); // prime

    // Change a far node (Redis, 2 hops away) — gateway's explanation should survive.
    model.updateNode(ids.cache as never, { label: { text: 'Memcached' } });
    understanding.update(model.document, 2);
    expect((await explain.explain({ target: { kind: 'node', id: ids.gateway } })).cached).toBe(true);

    // Change the gateway itself — its explanation must be recomputed.
    model.updateNode(ids.gateway as never, { label: { text: 'Edge Gateway' } });
    understanding.update(model.document, 3);
    expect((await explain.explain({ target: { kind: 'node', id: ids.gateway } })).cached).toBe(false);
  });

  it('supports follow-up questions scoped to the same target', async () => {
    const { doc, ids } = architecture();
    const explain = new ExplainEngine({ service: explainService(), graphSource: engineFor(doc) });
    const result = await explain.explain({ target: { kind: 'node', id: ids.svcA } });
    const follow = await explain.followUp(result.session, 'Why is it needed?');

    expect(follow.cached).toBe(false);
    expect(follow.request.question).toBe('Why is it needed?');
    expect(follow.session.conversation.length).toBeGreaterThan(result.session.conversation.length);
  });

  it('adapts to depth and audience', async () => {
    const { doc, ids } = architecture();
    const explain = new ExplainEngine({ service: explainService(), graphSource: engineFor(doc) });
    const result = await explain.explain({ target: { kind: 'node', id: ids.db }, depth: 'detailed', audience: 'beginner' });
    expect(result.request.depth).toBe('detailed');
    expect(result.request.audience).toBe('beginner');
    expect(result.explanation.sections.length).toBeGreaterThan(0); // mock adds sections when detailed
  });

  it('returns exactly the model prose via a scripted provider', async () => {
    const { doc, ids } = architecture();
    const reply = JSON.stringify({ summary: 'A canned summary.', keyPoints: ['one'], confidence: 0.9 });
    const explain = new ExplainEngine({ service: scriptedService(reply), graphSource: engineFor(doc) });
    const result = await explain.explain({ target: { kind: 'node', id: ids.gateway }, stream: false });
    expect(result.explanation.summary).toBe('A canned summary.');
    expect(result.explanation.keyPoints).toEqual(['one']);
  });

  it('refuses to explain an empty diagram', async () => {
    const explain = new ExplainEngine({ service: explainService(), graphSource: engineFor(makeModel().document) });
    await expect(explain.explain({ target: { kind: 'diagram' } })).rejects.toThrow(ExplainError);
  });

  it('honours cancellation', async () => {
    const { doc, ids } = architecture();
    const explain = new ExplainEngine({ service: explainService(), graphSource: engineFor(doc) });
    const controller = new AbortController();
    controller.abort();
    await expect(explain.explain({ target: { kind: 'node', id: ids.gateway }, signal: controller.signal })).rejects.toThrow();
  });

  it('retries once on an invalid model response then fails cleanly', async () => {
    const { doc, ids } = architecture();
    const explain = new ExplainEngine({ service: scriptedService('not json', 'still not json'), graphSource: engineFor(doc) });
    await expect(explain.explain({ target: { kind: 'node', id: ids.gateway }, stream: false })).rejects.toThrow(ExplainError);
  });
});
