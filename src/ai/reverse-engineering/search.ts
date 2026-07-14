/**
 * Search over the Code Knowledge Graph — symbol, dependency, API, infrastructure,
 * database, relationship, and repository search.
 *
 * Deterministic ranking over entity names/qualified names + kinds. Future semantic
 * search plugs in as an extra ranker without changing this surface.
 */

import type { CodeEntity, CodeKnowledgeGraph } from './graph/CodeKnowledgeGraph';

export type CodeSearchType = 'keyword' | 'symbol' | 'dependency' | 'api' | 'infrastructure' | 'database' | 'relationship' | 'repository';

export interface CodeSearchQuery {
  readonly text?: string;
  readonly kind?: string;
  readonly type?: CodeSearchType;
  readonly limit?: number;
}

export interface CodeSearchHit {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly score: number;
  readonly file?: string;
  readonly language?: string;
  readonly qualifiedName?: string;
}

const KIND_SETS: Readonly<Record<string, ReadonlySet<string>>> = {
  api: new Set(['endpoint', 'operation', 'schema']),
  infrastructure: new Set(['service', 'container', 'deployment', 'resource', 'queue', 'cache', 'database', 'ingress', 'volume', 'secret']),
  database: new Set(['table', 'view', 'column', 'database']),
  dependency: new Set(['library', 'module']),
  repository: new Set(['module', 'boundedContext', 'layer']),
};

export function searchGraph(graph: CodeKnowledgeGraph, query: CodeSearchQuery): CodeSearchHit[] {
  const limit = query.limit ?? 25;
  const type = query.type ?? 'keyword';
  const q = query.text?.toLowerCase().trim();

  if (type === 'relationship') return relationHits(graph, q).slice(0, limit);

  const kindSet = KIND_SETS[type];
  const hits: CodeSearchHit[] = [];
  for (const e of graph.entities()) {
    if (kindSet && !kindSet.has(e.kind)) continue;
    if (query.kind && e.kind !== query.kind) continue;
    const haystack = `${e.name} ${e.qualifiedName ?? ''}`.toLowerCase();
    if (q && !haystack.includes(q)) continue;
    const exact = q && e.name.toLowerCase() === q ? 3 : 0;
    const prefix = q && e.name.toLowerCase().startsWith(q) ? 1 : 0;
    hits.push({ id: e.id, name: e.name, kind: e.kind, score: exact + prefix + e.confidence, ...(e.file ? { file: e.file } : {}), ...(e.language ? { language: e.language } : {}), ...(e.qualifiedName ? { qualifiedName: e.qualifiedName } : {}) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function relationHits(graph: CodeKnowledgeGraph, q: string | undefined): CodeSearchHit[] {
  const out: CodeSearchHit[] = [];
  for (const r of graph.relations()) {
    const source = graph.getEntity(r.source);
    const target = graph.getEntity(r.target);
    if (!source || !target) continue;
    const label = `${source.name} ${r.kind} ${target.name}`;
    if (q && !label.toLowerCase().includes(q) && r.kind.toLowerCase() !== q) continue;
    out.push({ id: r.id, name: label, kind: r.kind, score: 1, ...(r.file ? { file: r.file } : {}) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Entities of a kind (helper for callers that want a listing). */
export function entitiesOfKind(graph: CodeKnowledgeGraph, kind: string): CodeEntity[] {
  return graph.byKind(kind);
}
