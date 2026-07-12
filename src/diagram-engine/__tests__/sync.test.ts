import { describe, it, expect } from 'vitest';
import type { ExcalidrawScene, ExElement } from '..';
import { EngineEventName } from '..';
import { makeModel, makeEngine, elementById } from './helpers';

/** A model with A→B→C nodes and two connecting edges. */
function chain() {
  const model = makeModel();
  const a = model.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } });
  const b = model.createNode({ type: 'shape', shape: 'rectangle', position: { x: 200, y: 0 } });
  const c = model.createNode({ type: 'shape', shape: 'rectangle', position: { x: 400, y: 0 } });
  const e1 = model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id } });
  const e2 = model.createEdge({ source: { nodeId: b.id }, target: { nodeId: c.id } });
  return { model, a, b, c, e1, e2 };
}

describe('synchronization', () => {
  it('updates only the changed node and its incident edge; reuses the rest', () => {
    const { model, a, c, e1, e2 } = chain();
    const engine = makeEngine();
    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;

    model.updateNode(a.id, { position: { x: 0, y: 120 } });
    const result = engine.sync<ExcalidrawScene, ExElement>(doc1, model.document, scene1);

    const updated = new Set(result.changeSet.updated.map((e) => e.id));
    expect(updated.has(a.id)).toBe(true); // moved node
    expect(updated.has(e1.id)).toBe(true); // incident edge re-routes
    expect(updated.has(e2.id)).toBe(false); // untouched edge
    expect(result.changeSet.added).toHaveLength(0);
    expect(result.changeSet.removed).toHaveLength(0);

    // Untouched elements keep their exact object reference (no repaint).
    expect(elementById(result.scene, c.id)).toBe(elementById(scene1, c.id));
    expect(elementById(result.scene, e2.id)).toBe(elementById(scene1, e2.id));
  });

  it('bumps the version of updated elements so the engine reconciles them', () => {
    const { model, a } = chain();
    const engine = makeEngine();
    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;
    const before = elementById(scene1, a.id)!;

    model.updateNode(a.id, { position: { x: 10, y: 10 } });
    const result = engine.sync<ExcalidrawScene, ExElement>(doc1, model.document, scene1);
    const after = elementById(result.scene, a.id)!;
    expect(after.version).toBeGreaterThan(before.version);
  });

  it('is idempotent: no change → same scene reference and empty change set', () => {
    const { model } = chain();
    const engine = makeEngine();
    const doc = model.document;
    const scene = engine.render<ExcalidrawScene, ExElement>(doc).scene;

    const result = engine.sync<ExcalidrawScene, ExElement>(doc, doc, scene);
    expect(result.scene).toBe(scene);
    expect(result.changeSet.added).toHaveLength(0);
    expect(result.changeSet.updated).toHaveLength(0);
    expect(result.changeSet.removed).toHaveLength(0);
  });

  it('re-syncing an already-synced scene is a no-op (loop safety)', () => {
    const { model, a } = chain();
    const engine = makeEngine();
    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;
    model.updateNode(a.id, { position: { x: 5, y: 5 } });
    const doc2 = model.document;
    const first = engine.sync<ExcalidrawScene, ExElement>(doc1, doc2, scene1);
    const second = engine.sync<ExcalidrawScene, ExElement>(doc2, doc2, first.scene);
    expect(second.scene).toBe(first.scene);
    expect(second.changeSet.added.length + second.changeSet.updated.length + second.changeSet.removed.length).toBe(0);
  });

  it('adds elements for a new node', () => {
    const { model } = chain();
    const engine = makeEngine();
    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;

    const d = model.createNode({ type: 'shape', shape: 'diamond', label: { text: 'new' } });
    const result = engine.sync<ExcalidrawScene, ExElement>(doc1, model.document, scene1);

    const addedIds = new Set(result.changeSet.added.map((e) => e.id));
    expect(addedIds.has(d.id)).toBe(true); // the shape
    expect([...addedIds].some((id) => id.startsWith(d.id))).toBe(true); // + its label
    expect(result.changeSet.removed).toHaveLength(0);
  });

  it('removes a node and cascades to its incident edges', () => {
    const { model, a, e1 } = chain();
    const engine = makeEngine();
    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;

    model.removeNode(a.id); // DSL cascades edge e1
    const result = engine.sync<ExcalidrawScene, ExElement>(doc1, model.document, scene1);

    const removed = new Set(result.changeSet.removed);
    expect(removed.has(a.id)).toBe(true);
    expect(removed.has(e1.id)).toBe(true);
  });

  it('a viewport-only change touches appState, not elements', () => {
    const { model, c } = chain();
    const engine = makeEngine();
    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;

    model.setViewport({ zoom: 3 });
    const result = engine.sync<ExcalidrawScene, ExElement>(doc1, model.document, scene1);

    expect(result.changeSet.added).toHaveLength(0);
    expect(result.changeSet.updated).toHaveLength(0);
    expect(result.changeSet.removed).toHaveLength(0);
    expect(result.scene.appState.zoom?.value).toBe(3);
    // Elements are reused by reference.
    expect(elementById(result.scene, c.id)).toBe(elementById(scene1, c.id));
  });

  it('emits granular events for observers', () => {
    const { model, a } = chain();
    const engine = makeEngine();
    const seen: string[] = [];
    engine.events.on(EngineEventName.NodeCreated, () => seen.push('created'));
    engine.events.on(EngineEventName.NodeDeleted, () => seen.push('deleted'));
    engine.events.on(EngineEventName.ViewportChanged, () => seen.push('viewport'));
    engine.events.on(EngineEventName.SceneChanged, () => seen.push('scene'));

    const doc1 = model.document;
    const scene1 = engine.render<ExcalidrawScene, ExElement>(doc1).scene;
    model.createNode({ type: 'shape', shape: 'rectangle' });
    model.removeNode(a.id);
    model.setViewport({ zoom: 2 });
    engine.sync<ExcalidrawScene, ExElement>(doc1, model.document, scene1);

    expect(seen).toContain('created');
    expect(seen).toContain('deleted');
    expect(seen).toContain('viewport');
    expect(seen).toContain('scene');
  });
});
