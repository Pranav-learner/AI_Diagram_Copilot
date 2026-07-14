/**
 * Search — a unified query layer over the PKM + document collection.
 *
 * Supports keyword, entity, tag, category, relationship, document, and section
 * search deterministically via the precomputed indexes (no scan). Results are
 * typed hits with a score and a source, ranked and capped. Future semantic search
 * (embeddings) plugs in as an additional ranker without changing this surface.
 */

import type { StructuredDocument } from './documents/StructuredDocument';
import type { KnowledgeCategory } from './documents/DocumentClassifier';
import type { DocumentIndexer } from './documents/DocumentIndexer';
import type { EntityKind } from './pkm/KnowledgeEntity';
import type { KnowledgeIndex } from './pkm/KnowledgeIndex';
import type { ProjectKnowledgeModel } from './pkm/ProjectKnowledgeModel';
import { tokenize } from './util';

export type SearchType = 'keyword' | 'entity' | 'tag' | 'category' | 'relationship' | 'document' | 'section';

export interface SearchQuery {
  readonly text?: string;
  readonly kind?: EntityKind;
  readonly category?: KnowledgeCategory;
  readonly tag?: string;
  readonly type?: SearchType;
  readonly limit?: number;
}

export interface SearchHit {
  readonly resultType: 'entity' | 'document' | 'section' | 'relation';
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly snippet?: string;
  readonly documentId?: string;
}

export interface SearchContext {
  readonly pkm: ProjectKnowledgeModel;
  readonly index: KnowledgeIndex;
  readonly docIndex: DocumentIndexer;
  readonly documents: ReadonlyMap<string, StructuredDocument>;
}

export function search(ctx: SearchContext, query: SearchQuery): SearchHit[] {
  const limit = query.limit ?? 20;
  const type = query.type ?? 'keyword';

  if (type === 'tag' && query.tag) return entityHits(ctx, ctx.index.byTag(query.tag)).slice(0, limit);
  if (type === 'category' && query.category) return entityHits(ctx, ctx.index.byCategory(query.category)).slice(0, limit);
  if (type === 'relationship') return relationHits(ctx, query).slice(0, limit);
  if (type === 'document') return documentHits(ctx, query.text ?? '').slice(0, limit);
  if (type === 'section') return sectionHits(ctx, query.text ?? '').slice(0, limit);
  if (type === 'entity') return searchEntities(ctx, query).slice(0, limit);

  // Blended keyword search across entities + documents + sections.
  const hits = [...searchEntities(ctx, query), ...documentHits(ctx, query.text ?? ''), ...sectionHits(ctx, query.text ?? '')];
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Entities ─────────────────────────────────────────────────────────────────

function searchEntities(ctx: SearchContext, query: SearchQuery): SearchHit[] {
  const tokens = query.text ? tokenize(query.text) : [];
  let candidateIds: string[];
  if (tokens.length > 0) {
    const scores = new Map<string, number>();
    for (const token of tokens) for (const id of ctx.index.byToken(token)) scores.set(id, (scores.get(id) ?? 0) + 1);
    candidateIds = [...scores.keys()];
    return rankEntities(ctx, candidateIds, query, (id) => scores.get(id) ?? 0).sort((a, b) => b.score - a.score);
  }
  // No text → filter-only listing.
  if (query.kind) candidateIds = [...ctx.index.byKind(query.kind)];
  else if (query.category) candidateIds = [...ctx.index.byCategory(query.category)];
  else if (query.tag) candidateIds = [...ctx.index.byTag(query.tag)];
  else candidateIds = ctx.pkm.entities().map((e) => e.id);
  return rankEntities(ctx, candidateIds, query, () => 0).sort((a, b) => b.score - a.score);
}

function rankEntities(ctx: SearchContext, ids: readonly string[], query: SearchQuery, base: (id: string) => number): SearchHit[] {
  const out: SearchHit[] = [];
  for (const id of ids) {
    const e = ctx.pkm.getEntity(id);
    if (!e) continue;
    if (query.kind && e.kind !== query.kind) continue;
    if (query.category && e.category !== query.category) continue;
    if (query.tag && !e.tags.some((t) => t.toLowerCase() === query.tag!.toLowerCase())) continue;
    const score = base(id) * 3 + e.confidence + Math.log2(1 + e.mentions);
    out.push({ resultType: 'entity', id, title: e.name, score, ...(e.description ? { snippet: e.description.slice(0, 160) } : {}), ...(e.documentIds[0] ? { documentId: e.documentIds[0] } : {}) });
  }
  return out;
}

function entityHits(ctx: SearchContext, ids: readonly string[]): SearchHit[] {
  return rankEntities(ctx, ids, {}, () => 1).sort((a, b) => b.score - a.score);
}

// ── Documents & sections ──────────────────────────────────────────────────────

function documentHits(ctx: SearchContext, text: string): SearchHit[] {
  if (!text.trim()) return [];
  return ctx.docIndex.searchDocuments(text).map(({ documentId, score }) => {
    const doc = ctx.documents.get(documentId);
    return { resultType: 'document' as const, id: documentId, title: doc?.title ?? documentId, score: score * 0.5, documentId };
  });
}

function sectionHits(ctx: SearchContext, text: string): SearchHit[] {
  if (!text.trim()) return [];
  const tokens = new Set(tokenize(text));
  if (tokens.size === 0) return [];
  const hits: SearchHit[] = [];
  for (const doc of ctx.documents.values()) {
    for (const entry of ctx.docIndex.headingsOf(doc.id)) {
      const headingTokens = tokenize(entry.heading);
      const matches = headingTokens.filter((t) => tokens.has(t)).length;
      if (matches > 0) hits.push({ resultType: 'section', id: entry.sectionId, title: entry.heading, score: matches * 2, documentId: doc.id });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

// ── Relations ─────────────────────────────────────────────────────────────────

function relationHits(ctx: SearchContext, query: SearchQuery): SearchHit[] {
  const q = query.text?.toLowerCase();
  const out: SearchHit[] = [];
  for (const r of ctx.pkm.relations()) {
    const source = ctx.pkm.getEntity(r.source)?.name ?? r.source;
    const target = ctx.pkm.getEntity(r.target)?.name ?? r.target;
    const title = `${source} ${r.kind} ${target}`;
    if (q && !title.toLowerCase().includes(q) && r.kind.toLowerCase() !== q) continue;
    out.push({ resultType: 'relation', id: r.id, title, score: r.confidence + Math.log2(1 + r.mentions), ...(r.evidence[0] ? { snippet: r.evidence[0] } : {}) });
  }
  return out.sort((a, b) => b.score - a.score);
}
