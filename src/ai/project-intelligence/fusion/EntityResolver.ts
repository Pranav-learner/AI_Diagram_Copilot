/**
 * EntityResolver — clusters PKM entities that refer to the *same real-world concept*
 * across sources.
 *
 * The PKM already merges exact-name matches; this resolves the harder cross-source
 * cases the spec lists: naming differences (camelCase vs kebab vs spaced), aliases,
 * and version differences. Clustering is by {@link canonicalKey}, kept within a kind
 * *family* (named things merge across kinds; statements — requirements/decisions — do
 * not cross-merge). It also emits *partial-match* cross-reference suggestions (token
 * containment) without merging, preserving traceability.
 */

import type { KnowledgeEntity } from '../../knowledge';
import { STATEMENT_KINDS } from '../../knowledge';
import type { PimEntityKind } from '../pim/ProjectIntelligenceModel';
import { canonicalKey, slug, tokens } from '../util';

export interface EntityCluster {
  readonly id: string;
  readonly key: string;
  readonly kind: PimEntityKind;
  readonly canonicalName: string;
  readonly members: readonly KnowledgeEntity[];
}

export interface ResolutionResult {
  readonly clusters: readonly EntityCluster[];
  /** PKM entity id → PIM cluster id. */
  readonly pkmToCluster: ReadonlyMap<string, string>;
  /** Likely-related but not-merged pairs (partial matches) → cross-reference links. */
  readonly crossRefs: ReadonlyArray<{ a: string; b: string }>;
}

/** Kind specificity for choosing a cluster's canonical kind (higher wins). */
const KIND_RANK: Readonly<Record<string, number>> = {
  service: 9, database: 9, api: 9, queue: 8, cache: 8, endpoint: 8, table: 8, deployment: 7, container: 7, resource: 6, actor: 6, library: 5, module: 4, component: 3, system: 2, concept: 1,
};

function mergeKey(kind: string, key: string): string {
  return STATEMENT_KINDS.has(kind) ? `${kind}::${key}` : `named::${key}`;
}

export function resolveEntities(entities: readonly KnowledgeEntity[]): ResolutionResult {
  const buckets = new Map<string, KnowledgeEntity[]>();
  for (const e of entities) {
    const key = mergeKey(e.kind, canonicalKey(e.name));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }

  const clusters: EntityCluster[] = [];
  const pkmToCluster = new Map<string, string>();
  const usedIds = new Set<string>();

  for (const [key, members] of buckets) {
    const canonicalKindEntity = [...members].sort((a, b) => (KIND_RANK[b.kind] ?? 0) - (KIND_RANK[a.kind] ?? 0) || b.confidence - a.confidence)[0]!;
    // Prefer the most human-readable surface form as the display name.
    const canonicalName = [...members].map((m) => m.name).sort((a, b) => spaceCount(b) - spaceCount(a) || b.length - a.length)[0]!;
    const baseId = `pim:${STATEMENT_KINDS.has(canonicalKindEntity.kind) ? `${canonicalKindEntity.kind}:` : ''}${slug(canonicalName) || slug(key)}`;
    let id = baseId;
    let n = 1;
    while (usedIds.has(id)) id = `${baseId}~${n++}`;
    usedIds.add(id);

    clusters.push({ id, key, kind: canonicalKindEntity.kind, canonicalName, members });
    for (const m of members) pkmToCluster.set(m.id, id);
  }

  return { clusters, pkmToCluster, crossRefs: partialMatches(clusters) };
}

/** Token-containment cross-references between distinct named clusters (not merged). */
function partialMatches(clusters: readonly EntityCluster[]): Array<{ a: string; b: string }> {
  const named = clusters.filter((c) => !STATEMENT_KINDS.has(c.kind) && c.canonicalName.length > 0);
  const tokenized = named.map((c) => ({ c, t: new Set(tokens(c.canonicalName)) }));
  const out: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const A = tokenized[i]!;
      const B = tokenized[j]!;
      if (A.t.size < 1 || B.t.size < 1) continue;
      const [small, large] = A.t.size <= B.t.size ? [A.t, B.t] : [B.t, A.t];
      if (small.size >= 1 && [...small].every((x) => large.has(x)) && small.size < large.size) {
        out.push({ a: A.c.id, b: B.c.id });
      }
    }
  }
  return out;
}

function spaceCount(s: string): number {
  return (s.match(/\s/g) ?? []).length;
}
