/**
 * Graph search — ranked lexical lookup over entities and groups.
 *
 * The exact indexes on {@link GraphIndex} answer "give me all databases" in O(1);
 * this answers the fuzzier "find things that look like *auth*". It scores across
 * label, kind, tags, description, and attribute values so an AI query layer can
 * resolve a free-text reference to the most likely element(s). Deterministic and
 * dependency-free — no fuzzy-match library, just normalised substring scoring.
 */

import type { SemanticGraph } from '../model/graph';

export interface SearchHit {
  readonly id: string;
  readonly kind: 'entity' | 'group';
  /** Higher is a better match. Unbounded but comparable within one query. */
  readonly score: number;
  /** Which fields matched (`label`, `kind`, `tag`, `description`, `attr:key`). */
  readonly matchedOn: readonly string[];
  /** The primary display label of the hit. */
  readonly label: string;
}

export interface SearchOptions {
  /** Cap on returned hits (default 10). */
  readonly limit?: number;
  /** Restrict to entities or groups (default: both). */
  readonly only?: 'entity' | 'group';
  /** Minimum score to include (default 0 — any match). */
  readonly minScore?: number;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Score one field's text against the normalised query; 0 = no match. */
function scoreField(text: string, q: string, weight: number): number {
  const t = norm(text);
  if (!t) return 0;
  if (t === q) return weight * 3; // exact
  if (t.startsWith(q)) return weight * 2; // prefix
  if (t.includes(q)) return weight; // substring
  // token containment: any word starts with the query
  for (const token of t.split(/[\s_/.-]+/)) {
    if (token && token.startsWith(q)) return weight * 1.5;
  }
  return 0;
}

/**
 * Search entities and groups for `query`, returning ranked {@link SearchHit}s.
 * Field weights: label > tag > kind > description > attribute value.
 */
export function search(graph: SemanticGraph, query: string, opts: SearchOptions = {}): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 0;
  const hits: SearchHit[] = [];

  if (opts.only !== 'group') {
    for (const e of graph.entities.values()) {
      let score = 0;
      const matchedOn: string[] = [];
      const add = (s: number, field: string) => {
        if (s > 0) {
          score += s;
          matchedOn.push(field);
        }
      };
      add(scoreField(e.label, q, 1.0), 'label');
      add(scoreField(e.kind, q, 0.6), 'kind');
      for (const tag of e.tags) add(scoreField(tag, q, 0.8), 'tag');
      if (e.description) add(scoreField(e.description, q, 0.4), 'description');
      for (const [key, value] of Object.entries(e.attributes)) {
        if (typeof value === 'string') add(scoreField(value, q, 0.3), `attr:${key}`);
      }
      if (score > minScore) hits.push({ id: e.id, kind: 'entity', score, matchedOn, label: e.label });
    }
  }

  if (opts.only !== 'entity') {
    for (const g of graph.groups.values()) {
      let score = 0;
      const matchedOn: string[] = [];
      const s = scoreField(g.label, q, 1.0);
      if (s > 0) {
        score += s;
        matchedOn.push('label');
      }
      if (score > minScore) hits.push({ id: g.id, kind: 'group', score, matchedOn, label: g.label });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return hits.slice(0, limit);
}
