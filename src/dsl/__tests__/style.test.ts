import { describe, it, expect } from 'vitest';
import { mergeStyles } from '../model/style';
import { makeModel } from './helpers';

describe('style system', () => {
  it('merges styles with later sources winning, per nested field', () => {
    const theme = { stroke: { color: '#000', width: 1 }, opacity: 1 };
    const override = { stroke: { width: 3 }, fill: { color: '#eee' } };
    const merged = mergeStyles(theme, override);
    // stroke.color survives (theme), stroke.width overridden.
    expect(merged.stroke).toEqual({ color: '#000', width: 3 });
    expect(merged.fill).toEqual({ color: '#eee' });
    expect(merged.opacity).toBe(1);
  });

  it('ignores undefined style layers', () => {
    const merged = mergeStyles(undefined, { opacity: 0.5 }, undefined);
    expect(merged).toEqual({ opacity: 0.5 });
  });

  it('registers a reusable named style referenced by a node', () => {
    const model = makeModel();
    const named = model.defineStyle({ name: 'accent', style: { fill: { color: '#f00' } } });
    const node = model.createNode({ type: 'shape', shape: 'rectangle', styleRef: named.id });
    expect(node.styleRef).toBe(named.id);
    expect(model.document.styles[named.id]?.name).toBe('accent');
    expect(model.validate().valid).toBe(true); // styleRef resolves
  });
});
