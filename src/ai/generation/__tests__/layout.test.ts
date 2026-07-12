import { describe, it, expect } from 'vitest';
import { createDefaultLayoutEngine, LayoutEngine } from '../layout';
import type { LayoutInput, LayoutResult } from '../layout/types';
import { layeredAlgorithm } from '../layout/algorithms/dagreLayout';

function chainInput(n: number): LayoutInput {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, width: 140, height: 60 }));
  const edges = Array.from({ length: n - 1 }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}` }));
  return { nodes, edges, direction: 'TB' };
}

function noOverlap(result: LayoutResult, input: LayoutInput): boolean {
  const sizes = new Map(input.nodes.map((nd) => [nd.id, nd]));
  const ids = Object.keys(result.positions);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = result.positions[ids[i]!]!;
      const b = result.positions[ids[j]!]!;
      const sa = sizes.get(ids[i]!)!;
      const sb = sizes.get(ids[j]!)!;
      const overlap = a.x < b.x + sb.width && a.x + sa.width > b.x && a.y < b.y + sb.height && a.y + sa.height > b.y;
      if (overlap) return false;
    }
  }
  return true;
}

describe('LayoutEngine', () => {
  const engine = createDefaultLayoutEngine();

  it('registers all built-in algorithms', () => {
    expect([...engine.kinds()].sort()).toEqual(['grid', 'layered', 'linear', 'mindmap', 'radial', 'tree']);
  });

  it('falls back to the default kind for an unknown one', () => {
    const bare = new LayoutEngine().register(layeredAlgorithm).setFallback('layered');
    const result = bare.compute('radial', chainInput(3)); // radial not registered → layered
    expect(Object.keys(result.positions)).toHaveLength(3);
  });

  it('layered layout: positions every node, no overlaps, non-empty bounds', () => {
    const input = chainInput(6);
    const result = engine.compute('layered', input);
    expect(Object.keys(result.positions)).toHaveLength(6);
    expect(result.size.width).toBeGreaterThan(0);
    expect(result.size.height).toBeGreaterThan(0);
    expect(noOverlap(result, input)).toBe(true);
  });

  it('layered TB stacks ranks downward', () => {
    const input = chainInput(4);
    const r = engine.compute('layered', input);
    expect(r.positions['n0']!.y).toBeLessThan(r.positions['n3']!.y);
  });

  it('grid layout arranges into a near-square without overlap', () => {
    const input: LayoutInput = { nodes: Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, width: 100, height: 60 })), edges: [] };
    const result = engine.compute('grid', input);
    expect(noOverlap(result, input)).toBe(true);
  });

  it('linear layout lays nodes in a single row in order', () => {
    const input: LayoutInput = { nodes: [
      { id: 'a', width: 100, height: 60 },
      { id: 'b', width: 100, height: 60 },
      { id: 'c', width: 100, height: 60 },
    ], edges: [], direction: 'LR' };
    const r = engine.compute('linear', input);
    expect(r.positions['a']!.x).toBeLessThan(r.positions['b']!.x);
    expect(r.positions['b']!.x).toBeLessThan(r.positions['c']!.x);
    expect(r.positions['a']!.y).toBe(r.positions['c']!.y);
  });

  it('radial layout places the root near the centre and children outside it', () => {
    const input: LayoutInput = {
      nodes: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, width: 80, height: 60 })),
      edges: [1, 2, 3, 4].map((i) => ({ source: 'r0', target: `r${i}` })),
      roots: ['r0'],
    };
    const result = engine.compute('radial', input);
    expect(Object.keys(result.positions)).toHaveLength(5);
    expect(noOverlap(result, input)).toBe(true);
  });

  it('mindmap layout puts branches on both sides of the root', () => {
    const input: LayoutInput = {
      nodes: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, width: 120, height: 50 })),
      edges: [1, 2, 3, 4].map((i) => ({ source: 'm0', target: `m${i}` })),
      roots: ['m0'],
    };
    const result = engine.compute('mindmap', input);
    const rootX = result.positions['m0']!.x;
    const xs = [1, 2, 3, 4].map((i) => result.positions[`m${i}`]!.x);
    expect(xs.some((x) => x < rootX)).toBe(true);
    expect(xs.some((x) => x > rootX)).toBe(true);
  });

  it('handles an empty graph', () => {
    const r = engine.compute('layered', { nodes: [], edges: [] });
    expect(r.positions).toEqual({});
    expect(r.size).toEqual({ width: 0, height: 0 });
  });

  it('does not crash on a cyclic graph (mindmap visited-guard)', () => {
    const input: LayoutInput = {
      nodes: [{ id: 'a', width: 80, height: 50 }, { id: 'b', width: 80, height: 50 }],
      edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
      roots: ['a'],
    };
    expect(() => engine.compute('mindmap', input)).not.toThrow();
  });
});
