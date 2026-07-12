import { describe, it, expect } from 'vitest';
import { makeConnectedModel, makeModel } from './helpers';
import { serialize, deserialize, stableStringify } from '../serialization/serialize';
import { deepClone } from '../serialization/clone';
import { equals } from '../serialization/equals';
import { diff, isEmptyDiff } from '../serialization/diff';
import { DiagramShapeError } from '../core/errors';

describe('serialization', () => {
  it('round-trips a document byte-for-byte', () => {
    const { model } = makeConnectedModel();
    const json = serialize(model.document);
    const restored = deserialize(json);
    expect(serialize(restored)).toBe(json);
    expect(equals(restored, model.document)).toBe(true);
  });

  it('produces a stable, order-independent canonical string', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    // Nested objects and arrays too.
    expect(stableStringify({ x: { p: 1, q: 2 } })).toBe(stableStringify({ x: { q: 2, p: 1 } }));
  });

  it('rejects malformed JSON and non-documents', () => {
    expect(() => deserialize('{not json')).toThrow(DiagramShapeError);
    expect(() => deserialize(JSON.stringify({ schemaVersion: '1.0.0' }))).toThrow(DiagramShapeError);
    expect(() => deserialize(JSON.stringify([1, 2, 3]))).toThrow();
  });
});

describe('deep clone', () => {
  it('is fully independent of the original', () => {
    const { model } = makeConnectedModel();
    const original = model.document;
    const cloned = deepClone(original);
    expect(equals(cloned, original)).toBe(true);
    expect(cloned).not.toBe(original);
    expect(cloned.nodes).not.toBe(original.nodes);
  });

  it('DiagramModel.clone() does not share state with its source', () => {
    const model = makeModel();
    model.createNode({ type: 'shape', shape: 'rectangle' });
    const clone = model.clone();
    clone.createNode({ type: 'text', text: 'only in clone' });
    expect(Object.keys(model.document.nodes)).toHaveLength(1);
    expect(Object.keys(clone.document.nodes)).toHaveLength(2);
  });
});

describe('equality & diff', () => {
  it('reports no diff between a document and its clone', () => {
    const { model } = makeConnectedModel();
    const d = diff(model.document, deepClone(model.document));
    expect(isEmptyDiff(d)).toBe(true);
  });

  it('reports added, removed, and changed entities', () => {
    const model = makeModel();
    const kept = model.createNode({ type: 'shape', shape: 'rectangle' });
    const toRemove = model.createNode({ type: 'text', text: 'bye' });
    const before = deepClone(model.document);

    model.updateNode(kept.id, { position: { x: 99, y: 99 } });
    model.removeNode(toRemove.id);
    const added = model.createNode({ type: 'shape', shape: 'diamond' });

    const d = diff(before, model.document);
    expect(isEmptyDiff(d)).toBe(false);
    expect(d.nodes.added.map((n) => n.id)).toEqual([added.id]);
    expect(d.nodes.removed.map((n) => n.id)).toEqual([toRemove.id]);
    expect(d.nodes.changed.map((c) => c.id)).toEqual([kept.id]);
  });

  it('detects viewport and metadata changes', () => {
    const model = makeModel();
    const before = deepClone(model.document);
    model.setViewport({ zoom: 3 });
    model.setMetadata('reviewed', true);
    const d = diff(before, model.document);
    expect(d.viewportChanged).toBe(true);
    expect(d.metadataChanged).toBe(true);
  });
});
