/**
 * RegionCache — a dependency-aware memo keyed to *regions* of the Semantic Graph.
 *
 * A context or summary is expensive to derive and valid until the entities it was
 * built from change. Each entry records the set of ids it depends on; when an
 * incremental update reports the changed ids, only entries whose dependency set
 * intersects the change are evicted — the rest survive across versions. Entries
 * with *no* dependencies represent whole-graph derivations (e.g. the diagram
 * digest) and are conservatively evicted on any change.
 *
 * This is what lets the engine invalidate "only changed regions" instead of
 * dropping every cache on each edit.
 */

interface CacheEntry<T> {
  readonly value: T;
  readonly deps: ReadonlySet<string>;
  /** Graph version the entry was computed at (telemetry/debugging). */
  readonly version: number;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;
}

export class RegionCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (entry) {
      this.hits++;
      return entry.value;
    }
    this.misses++;
    return undefined;
  }

  set(key: string, value: T, deps: Iterable<string>, version: number): void {
    this.map.set(key, { value, deps: new Set(deps), version });
  }

  /**
   * Evict every entry whose dependency region intersects `changed`. Entries with
   * an empty dependency set (whole-graph derivations) are always evicted when any
   * change occurred.
   */
  invalidate(changed: ReadonlySet<string>): void {
    if (changed.size === 0) return;
    for (const [key, entry] of this.map) {
      if (entry.deps.size === 0 || intersects(entry.deps, changed)) {
        this.map.delete(key);
        this.evictions++;
      }
    }
  }

  clear(): void {
    this.evictions += this.map.size;
    this.map.clear();
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, evictions: this.evictions, size: this.map.size };
  }
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) return true;
  return false;
}
