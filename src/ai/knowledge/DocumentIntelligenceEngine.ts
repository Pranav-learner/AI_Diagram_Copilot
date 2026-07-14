/**
 * DocumentIntelligenceEngine — the orchestrator of the knowledge-ingestion pipeline.
 *
 *   Document → parse → classify → validate → extract → PKM → index → cache
 *
 * Each stage has a single responsibility (parser, classifier, extractors, PKM,
 * indexes) and the engine sequences them. Discovery is **deterministic** — no LLM.
 * Ingestion is **incremental**: re-ingesting a changed document withdraws its old
 * contributions and adds the new ones (`removeDocument` + `ingest`), invalidating
 * only the affected cache/index regions. This engine is the single surface future
 * modules (Diagram Planner, Documentation AI, Reverse Engineering) consume — they
 * read the PKM + summaries, never the raw parser.
 */

import { RegionCache } from '../understanding';
import type { DocumentInput } from './documents/DocumentParser';
import { parseDocument } from './documents/DocumentParser';
import { classifyDocument } from './documents/DocumentClassifier';
import type { StructuredDocument } from './documents/StructuredDocument';
import { DocumentIndexer } from './documents/DocumentIndexer';
import { ProjectKnowledgeModel } from './pkm/ProjectKnowledgeModel';
import { KnowledgeIndex } from './pkm/KnowledgeIndex';
import type { KnowledgeEntity } from './pkm/KnowledgeEntity';
import type { Extractor, ExtractionResult } from './extractors/types';
import { DEFAULT_EXTRACTORS } from './extractors';
import { search, type SearchContext, type SearchHit, type SearchQuery } from './search';
import { validateDocument, validatePkm, type ValidationReport } from './validation';
import {
  summarizeArchitecture,
  summarizeDocument,
  summarizeEntity,
  summarizeRequirements,
  summarizeSection,
  type ArchitectureSummary,
  type DocumentSummary,
  type EntitySummary,
  type RequirementSummary,
  type SectionSummary,
} from './summaries/summaries';
import { DocumentIntelligenceError } from './errors';

export interface IngestResult {
  readonly document: StructuredDocument;
  readonly extraction: ExtractionResult;
  readonly validation: ValidationReport;
  readonly added: { readonly entities: number; readonly relations: number };
  /** True when the content was unchanged since last ingest (no work done). */
  readonly cached: boolean;
}

export interface EngineStats {
  readonly documents: number;
  readonly entities: number;
  readonly relations: number;
  readonly parseCacheHits: number;
  readonly extractionCacheHits: number;
}

export interface DocumentIntelligenceEngineDeps {
  readonly extractors?: readonly Extractor[];
}

type UpdateListener = (event: { readonly documentId: string; readonly change: 'ingested' | 'removed'; readonly version: number }) => void;

export class DocumentIntelligenceEngine {
  private readonly pkm = new ProjectKnowledgeModel();
  private readonly docIndex = new DocumentIndexer();
  private readonly docs = new Map<string, StructuredDocument>();
  private readonly extractors: readonly Extractor[];

  private readonly parseCache = new Map<string, StructuredDocument>();
  private readonly extractionCache = new Map<string, ExtractionResult>();
  private readonly summaryCache = new RegionCache<unknown>();
  private cachedIndex?: KnowledgeIndex;
  private readonly listeners = new Set<UpdateListener>();

  private _version = 0;
  private parseCacheHits = 0;
  private extractionCacheHits = 0;

  constructor(deps: DocumentIntelligenceEngineDeps = {}) {
    this.extractors = deps.extractors ?? DEFAULT_EXTRACTORS;
  }

  get version(): number {
    return this._version;
  }

  // ── Ingestion (incremental) ────────────────────────────────────────────────

  /** Parse, classify, extract, and merge a document into the PKM. */
  ingest(input: DocumentInput): IngestResult {
    if (!input.content.trim()) throw new DocumentIntelligenceError('Cannot ingest an empty document.', 'parsing');

    // Parse (cache by content hash).
    const cacheKey = `${input.id ?? input.name}:${hashOf(input.content)}`;
    let parsed = this.parseCache.get(cacheKey);
    if (parsed) this.parseCacheHits++;
    else {
      parsed = parseDocument(input);
      this.parseCache.set(cacheKey, parsed);
    }

    const existing = this.docs.get(parsed.id);
    if (existing && existing.source.contentHash === parsed.source.contentHash) {
      // Unchanged → no-op.
      return { document: existing, extraction: { entities: [], relations: [] }, validation: validateDocument(existing), added: { entities: 0, relations: 0 }, cached: true };
    }

    // Classify (unless declared) and finalise the document, bumping version on re-ingest.
    const docType = input.declaredType ?? classifyDocument(parsed);
    const version = existing ? existing.version + 1 : 1;
    const document: StructuredDocument = { ...parsed, docType, version };

    // Extract (cache by content hash — pure over content).
    let extraction = this.extractionCache.get(document.source.contentHash);
    if (extraction) this.extractionCacheHits++;
    else {
      extraction = this.runExtractors(document);
      this.extractionCache.set(document.source.contentHash, extraction);
    }

    // Withdraw the previous version's contributions, then ingest the new one.
    const changed = new Set<string>([document.id]);
    if (existing) {
      for (const id of this.pkm.removeDocument(document.id)) changed.add(id);
      this.docIndex.remove(document.id);
    }
    this.pkm.ingest(
      { id: document.id, title: document.title, docType: String(document.docType), contentHash: document.source.contentHash, version },
      extraction,
    );
    for (const e of this.pkm.byDocument(document.id)) changed.add(e.id);
    this.docIndex.add(document);
    this.docs.set(document.id, document);

    this.invalidate(changed);
    this.emit(document.id, 'ingested');

    return { document, extraction, validation: validateDocument(document), added: { entities: extraction.entities.length, relations: extraction.relations.length }, cached: false };
  }

  /** Re-ingest a changed document (alias for {@link ingest}, which is incremental). */
  update(input: DocumentInput): IngestResult {
    return this.ingest(input);
  }

  /** Withdraw a document and everything it uniquely contributed. */
  remove(documentId: string): void {
    if (!this.docs.has(documentId)) return;
    const changed = new Set<string>([documentId, ...this.pkm.removeDocument(documentId)]);
    this.docIndex.remove(documentId);
    this.docs.delete(documentId);
    this.invalidate(changed);
    this.emit(documentId, 'removed');
  }

  // ── Access ──────────────────────────────────────────────────────────────────

  getPKM(): ProjectKnowledgeModel {
    return this.pkm;
  }
  getDocument(id: string): StructuredDocument | undefined {
    return this.docs.get(id);
  }
  documents(): readonly StructuredDocument[] {
    return [...this.docs.values()];
  }

  /** The knowledge index for the current PKM (rebuilt only when it changes). */
  knowledgeIndex(): KnowledgeIndex {
    if (!this.cachedIndex || this.cachedIndex.version !== this.pkm.version) this.cachedIndex = KnowledgeIndex.build(this.pkm);
    return this.cachedIndex;
  }

  stats(): EngineStats {
    const s = this.pkm.stats();
    return { documents: this.docs.size, entities: s.entities, relations: s.relations, parseCacheHits: this.parseCacheHits, extractionCacheHits: this.extractionCacheHits };
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  search(query: SearchQuery): SearchHit[] {
    const ctx: SearchContext = { pkm: this.pkm, index: this.knowledgeIndex(), docIndex: this.docIndex, documents: this.docs };
    return search(ctx, query);
  }

  // ── Summaries (region-cached) ────────────────────────────────────────────────

  summarizeDocument(documentId: string): DocumentSummary | undefined {
    const doc = this.docs.get(documentId);
    if (!doc) return undefined;
    return this.cachedSummary(`doc:${documentId}`, [documentId], () => summarizeDocument(doc, this.pkm.byDocument(documentId)));
  }
  summarizeSection(documentId: string, sectionId: string): SectionSummary | undefined {
    const doc = this.docs.get(documentId);
    if (!doc) return undefined;
    return this.cachedSummary(`section:${sectionId}`, [documentId], () => summarizeSection(doc, sectionId, this.pkm.byDocument(documentId)));
  }
  summarizeEntity(entityId: string): EntitySummary | undefined {
    return this.cachedSummary(`entity:${entityId}`, [entityId], () => summarizeEntity(this.pkm, entityId));
  }
  summarizeRequirements(documentId?: string): RequirementSummary {
    const entities: readonly KnowledgeEntity[] = documentId ? this.pkm.byDocument(documentId) : this.pkm.entities();
    return this.cachedSummary(`reqs:${documentId ?? 'all'}`, documentId ? [documentId] : [], () => summarizeRequirements(entities));
  }
  summarizeArchitecture(): ArchitectureSummary {
    // Depends on the whole PKM → empty deps ⇒ invalidated on any change.
    return this.cachedSummary('architecture', [], () => summarizeArchitecture(this.pkm));
  }

  // ── Validation ────────────────────────────────────────────────────────────────

  validateDocument(documentId: string): ValidationReport | undefined {
    const doc = this.docs.get(documentId);
    return doc ? validateDocument(doc) : undefined;
  }
  validatePkm(): ValidationReport {
    return validatePkm(this.pkm);
  }

  // ── Events ────────────────────────────────────────────────────────────────────

  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.pkm.clear();
    this.docIndex.clear();
    this.docs.clear();
    this.summaryCache.clear();
    this.cachedIndex = undefined;
    this._version++;
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private runExtractors(doc: StructuredDocument): ExtractionResult {
    const entities: ExtractionResult['entities'][number][] = [];
    const relations: ExtractionResult['relations'][number][] = [];
    for (const extractor of this.extractors) {
      try {
        const result = extractor.extract(doc);
        entities.push(...result.entities);
        relations.push(...result.relations);
      } catch {
        // An extractor failure is isolated, never fatal.
      }
    }
    return { entities, relations };
  }

  private cachedSummary<T>(key: string, deps: readonly string[], compute: () => T): T {
    const hit = this.summaryCache.get(key) as T | undefined;
    if (hit !== undefined) return hit;
    const value = compute();
    this.summaryCache.set(key, value as unknown, deps, this.pkm.version);
    return value;
  }

  private invalidate(changed: ReadonlySet<string>): void {
    this.summaryCache.invalidate(changed);
    this.cachedIndex = undefined;
    this._version++;
  }

  private emit(documentId: string, change: 'ingested' | 'removed'): void {
    for (const l of this.listeners) l({ documentId, change, version: this._version });
  }
}

function hashOf(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
