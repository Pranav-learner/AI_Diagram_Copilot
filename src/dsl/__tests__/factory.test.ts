import { describe, it, expect } from 'vitest';
import { makeModel, FIXED_TIME } from './helpers';
import { DEFAULT_NODE_SIZE } from '../api/factory';

describe('entity factories', () => {
  it('stamps deterministic ids, revision, and timestamps', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'rectangle' });
    expect(node.id).toBe('node_000001');
    expect(node.revision).toBe(1);
    expect(node.createdAt).toBe(FIXED_TIME);
    expect(node.updatedAt).toBe(FIXED_TIME);
    expect(node.metadata).toEqual({});
  });

  it('applies defaults for shape nodes', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', shape: 'diamond' });
    expect(node.type).toBe('shape');
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.size).toEqual(DEFAULT_NODE_SIZE);
    expect(node.rotation).toBe(0);
    expect(node.z).toBe(0);
  });

  it('resolves shape/label from the node type registry via `semantic`', () => {
    const model = makeModel();
    const db = model.createNode({ type: 'shape', semantic: 'database' });
    expect(db.type).toBe('shape');
    if (db.type === 'shape') {
      expect(db.shape).toBe('cylinder'); // registry default for `database`
      expect(db.semantic).toBe('database');
    }
    expect(db.label?.text).toBe('Database');
  });

  it('lets an explicit shape override the registry default', () => {
    const model = makeModel();
    const node = model.createNode({ type: 'shape', semantic: 'database', shape: 'rectangle' });
    if (node.type === 'shape') expect(node.shape).toBe('rectangle');
  });

  it('builds each discriminated node payload', () => {
    const model = makeModel();
    const text = model.createNode({ type: 'text', text: 'hello' });
    const image = model.createNode({ type: 'image', src: 'x.png', alt: 'x' });
    const icon = model.createNode({ type: 'icon', icon: 'star' });
    const container = model.createNode({ type: 'container' });
    expect(text.type === 'text' && text.text).toBe('hello');
    expect(image.type === 'image' && image.src).toBe('x.png');
    expect(icon.type === 'icon' && icon.icon).toBe('star');
    expect(container.type === 'container' && container.childIds).toEqual([]);
  });

  it('gives edges a default arrowhead and routing', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape', shape: 'rectangle' });
    const b = model.createNode({ type: 'shape', shape: 'rectangle' });
    const edge = model.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id } });
    expect(edge.routing).toBe('straight');
    expect(edge.arrowheads).toEqual({ start: 'none', end: 'arrow' });
  });
});
