import { describe, it, expect } from 'vitest';
import { makeModel, makeConnectedModel } from './helpers';

describe('operations & DiagramModel facade', () => {
  it('treats the document as immutable — each mutation yields a new object', () => {
    const model = makeModel();
    const before = model.document;
    model.createNode({ type: 'shape', shape: 'rectangle' });
    const after = model.document;
    expect(after).not.toBe(before);
    expect(Object.keys(before.nodes)).toHaveLength(0); // old snapshot untouched
    expect(Object.keys(after.nodes)).toHaveLength(1);
  });

  it('updates a node, bumping its revision and merging fields', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'rectangle' });
    const updated = model.updateNode(node.id, { position: { x: 10, y: 20 }, locked: true });
    expect(updated?.position).toEqual({ x: 10, y: 20 });
    expect(updated?.locked).toBe(true);
    expect(updated?.revision).toBe(2);
    // Untouched fields survive the patch.
    if (updated?.type === 'shape') expect(updated.shape).toBe('rectangle');
  });

  it('removes a node and cascades to incident edges', () => {
    const { model, aId, edgeId } = makeConnectedModel();
    expect(model.findEdge(edgeId)).toBeDefined();
    expect(model.removeNode(aId)).toBe(true);
    expect(model.findNode(aId)).toBeUndefined();
    expect(model.findEdge(edgeId)).toBeUndefined(); // cascade
    expect(model.validate().valid).toBe(true); // no dangling edge left
  });

  it('removes a node from any group it belonged to', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'rectangle' });
    const group = model.createGroup({ kind: 'group' });
    model.addToGroup(group.id, node.id);
    expect(model.findGroup(group.id)?.childIds).toContain(node.id);
    expect(model.findNode(node.id)?.groupId).toBe(group.id);
    model.removeNode(node.id);
    expect(model.findGroup(group.id)?.childIds ?? []).not.toContain(node.id);
  });

  it('clears groupId on members when a group is removed', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'rectangle' });
    const group = model.createGroup();
    model.addToGroup(group.id, node.id);
    model.removeGroup(group.id);
    expect(model.findGroup(group.id)).toBeUndefined();
    expect(model.findNode(node.id)?.groupId).toBeUndefined();
  });

  it('supports nested groups', () => {
    const model = makeModel();
    const parent = model.createGroup({ name: 'parent' });
    const child = model.createGroup({ name: 'child' });
    model.addToGroup(parent.id, child.id);
    expect(model.findGroup(parent.id)?.childIds).toContain(child.id);
    expect(model.validate().valid).toBe(true);
  });

  it('strips a removed tag from referencing entities', () => {
    const model = makeModel();
    const tag = model.createTag({ label: 'important' });
    const node = model.createNode({ type: 'shape', shape: 'rectangle', tagIds: [tag.id] });
    expect(model.findNode(node.id)?.tagIds).toContain(tag.id);
    model.removeTag(tag.id);
    expect(model.findNode(node.id)?.tagIds ?? []).not.toContain(tag.id);
  });

  it('reads and writes document metadata', () => {
    const model = makeModel();
    model.setMetadata('domain', 'billing');
    expect(model.getMetadata('domain')).toBe('billing');
  });

  it('patches the viewport', () => {
    const model = makeModel();
    model.setViewport({ zoom: 2 });
    expect(model.document.viewport.zoom).toBe(2);
    // Untouched viewport fields persist.
    expect(model.document.viewport.background).toBe('#ffffff');
  });
});
