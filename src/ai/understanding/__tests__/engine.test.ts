import { describe, it, expect } from 'vitest';
import type { DiagramDocument } from '@/dsl';
import { makeArchitecture } from './helpers';
import { UnderstandingEngine } from '../engine/UnderstandingEngine';
import type { DiagramChangeSource } from '../engine/ports';

/** A minimal in-memory change source standing in for the runtime. */
class FakeSource implements DiagramChangeSource {
  private readonly listeners = new Set<() => void>();
  version = 1;
  constructor(private doc: DiagramDocument) {}
  getDocument() {
    return this.doc;
  }
  getVersion() {
    return this.version;
  }
  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  push(doc: DiagramDocument) {
    this.doc = doc;
    this.version++;
    for (const l of this.listeners) l();
  }
}

describe('UnderstandingEngine', () => {
  it('builds from a document and serves queries', () => {
    const { model, ids } = makeArchitecture();
    const engine = UnderstandingEngine.fromDocument(model.document, 1);
    expect(engine.getGraph().entities.size).toBe(6);
    expect(engine.query().findEntity('API Gateway')!.id).toBe(ids.gateway);
    expect(engine.query()).toBe(engine.query()); // stable per graph
  });

  it('caches context and summaries', () => {
    const { model, ids } = makeArchitecture();
    const engine = UnderstandingEngine.fromDocument(model.document, 1);
    engine.extractContext({ kind: 'entity', id: ids.gateway });
    engine.extractContext({ kind: 'entity', id: ids.gateway });
    engine.summarize();
    engine.summarize();
    const stats = engine.cacheStats();
    expect(stats.context.hits).toBeGreaterThanOrEqual(1);
    expect(stats.summary.hits).toBeGreaterThanOrEqual(1);
  });

  it('incrementally updates and invalidates only affected caches', () => {
    const { model, ids } = makeArchitecture();
    const engine = UnderstandingEngine.fromDocument(model.document, 1);
    // Prime caches.
    engine.extractContext({ kind: 'entity', id: ids.gateway });
    engine.summarize();

    // Change Redis (cache) — 2 hops from the gateway, so outside its context region.
    model.updateNode(ids.cache as never, { label: { text: 'Memcached' } });
    const event = engine.update(model.document, 2);

    expect(event.changed.entities.has(ids.cache)).toBe(true);
    expect(engine.getGraph().entities.get(ids.cache)!.label).toBe('Memcached');

    // Gateway context survived (cache hit); whole-diagram summary was evicted (miss).
    const before = engine.cacheStats();
    engine.extractContext({ kind: 'entity', id: ids.gateway });
    engine.summarize();
    const after = engine.cacheStats();
    expect(after.context.hits).toBe(before.context.hits + 1); // survived → hit
    expect(after.summary.misses).toBe(before.summary.misses + 1); // evicted → recomputed
  });

  it('syncs from a live change source and emits update events', () => {
    const { model, ids } = makeArchitecture();
    const source = new FakeSource(model.document);
    const engine = UnderstandingEngine.attach(source);
    const events: number[] = [];
    engine.onUpdate((e) => events.push(e.version));

    model.updateNode(ids.db as never, { label: { text: 'MySQL' } });
    source.push(model.document);

    expect(engine.getGraph().entities.get(ids.db)!.label).toBe('MySQL');
    expect(events).toEqual([2]);
    engine.dispose();
  });

  it('skips work when the version is unchanged', () => {
    const { model } = makeArchitecture();
    const source = new FakeSource(model.document);
    const engine = UnderstandingEngine.attach(source);
    const graphBefore = engine.getGraph();
    engine.sync(source); // same version
    expect(engine.getGraph()).toBe(graphBefore);
  });
});
