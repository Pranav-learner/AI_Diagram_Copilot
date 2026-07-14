import { describe, it, expect } from 'vitest';
import { RegionCache } from '../cache/RegionCache';

describe('RegionCache', () => {
  it('stores and retrieves by key, tracking hits and misses', () => {
    const c = new RegionCache<string>();
    expect(c.get('a')).toBeUndefined();
    c.set('a', 'A', ['n1', 'n2'], 1);
    expect(c.get('a')).toBe('A');
    const s = c.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.size).toBe(1);
  });

  it('evicts only entries whose dependency region changed', () => {
    const c = new RegionCache<string>();
    c.set('a', 'A', ['n1', 'n2'], 1);
    c.set('b', 'B', ['n3'], 1);
    c.invalidate(new Set(['n2']));
    expect(c.get('a')).toBeUndefined(); // depended on n2
    expect(c.get('b')).toBe('B'); // untouched
  });

  it('always evicts entries with no dependencies (whole-graph derivations)', () => {
    const c = new RegionCache<string>();
    c.set('whole', 'W', [], 1);
    c.invalidate(new Set(['anything']));
    expect(c.get('whole')).toBeUndefined();
  });

  it('is a no-op when nothing changed', () => {
    const c = new RegionCache<string>();
    c.set('a', 'A', ['n1'], 1);
    c.invalidate(new Set());
    expect(c.get('a')).toBe('A');
  });

  it('clears everything', () => {
    const c = new RegionCache<string>();
    c.set('a', 'A', ['n1'], 1);
    c.clear();
    expect(c.get('a')).toBeUndefined();
    expect(c.stats().size).toBe(0);
  });
});
