/**
 * ReverseEngineeringEngine — the deterministic front door of the whole module.
 *
 *   file → ParserRegistry → NormalizedAST → StaticAnalysis → CodeKnowledgeGraph
 *        → RepositoryMerger → PKM
 *
 * Parsing and analysis are 100% deterministic (no LLM); the LLM only ever reasons
 * over the resulting graph/PKM, never raw source. Work is **incremental**: ASTs are
 * cached by content hash (a changed file re-parses only itself), the graph is rebuilt
 * lazily from cached ASTs, and the PKM is synced per-file by slice hash — so a
 * one-file change never triggers a full repository rescan. This is the single surface
 * every future repository feature consumes.
 */

import { ProjectKnowledgeModel, type DocumentRef } from '../knowledge';
import type { NormalizedAST } from './ast/NormalizedAST';
import { UIRDocument, astToUIR } from './uir/UIR';
import { defaultParserRegistry, ParserRegistry } from './parsers';
import type { ParseResult } from './parsers/types';
import { buildCodeKnowledgeGraph } from './analysis';
import type { CodeEntity, CodeKnowledgeGraph, CodeRelation } from './graph/CodeKnowledgeGraph';
import { buildRepositorySlices } from './pkm/RepositoryMerger';
import { searchGraph, type CodeSearchHit, type CodeSearchQuery } from './search';
import { validateRepository, type RepoValidationReport } from './validation';
import { fnv1a, normalizePath } from './util';

export interface ReverseEngineeringEngineDeps {
  readonly registry?: ParserRegistry;
  /** Share the PKM with the Document Intelligence Engine to unify docs + code. */
  readonly pkm?: ProjectKnowledgeModel;
}

export interface RepoStats {
  readonly files: number;
  readonly parsed: number;
  readonly failed: number;
  readonly entities: number;
  readonly relations: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly parseCacheHits: number;
}

type UpdateListener = (event: { readonly version: number }) => void;

export class ReverseEngineeringEngine {
  private readonly registry: ParserRegistry;
  private readonly pkm: ProjectKnowledgeModel;

  private readonly files = new Map<string, { content: string; hash: string }>();
  private readonly asts = new Map<string, NormalizedAST>();
  private readonly uirDocs = new Map<string, UIRDocument>();
  private readonly parseErrors = new Map<string, readonly string[]>();
  private readonly parseCache = new Map<string, ParseResult>();
  private readonly sliceHashes = new Map<string, string>();
  private readonly listeners = new Set<UpdateListener>();

  private graph?: CodeKnowledgeGraph;
  private dirty = true;
  private _version = 0;
  private parseCacheHits = 0;

  constructor(deps: ReverseEngineeringEngineDeps = {}) {
    this.registry = deps.registry ?? defaultParserRegistry();
    this.pkm = deps.pkm ?? new ProjectKnowledgeModel();
  }

  get version(): number {
    return this._version;
  }

  // ── Ingestion (incremental) ────────────────────────────────────────────────

  /** Parse + register one file (re-parsing only if its content changed). */
  addFile(path: string, content: string): ParseResult {
    const file = normalizePath(path);
    const hash = fnv1a(content);
    const existing = this.files.get(file);
    if (existing && existing.hash === hash) return this.cachedResultFor(file, hash);

    const key = `${file}:${hash}`;
    let result = this.parseCache.get(key);
    if (result) this.parseCacheHits++;
    else {
      result = this.registry.parse({ path: file, content });
      this.parseCache.set(key, result);
    }

    this.files.set(file, { content, hash });
    if (result.ok && result.ast) {
      this.asts.set(file, result.ast);
      this.uirDocs.set(file, astToUIR(result.ast));
      this.parseErrors.delete(file);
    } else {
      this.asts.delete(file);
      this.uirDocs.delete(file);
      this.parseErrors.set(file, result.errors);
    }
    this.dirty = true;
    return result;
  }

  /** Bulk-ingest — parses each file, builds the graph + PKM once on next access. */
  addFiles(files: ReadonlyArray<{ path: string; content: string }>): void {
    for (const f of files) this.addFile(f.path, f.content);
  }

  /** Re-ingest a changed file (incremental; alias for {@link addFile}). */
  updateFile(path: string, content: string): ParseResult {
    return this.addFile(path, content);
  }

  removeFile(path: string): void {
    const file = normalizePath(path);
    if (!this.files.has(file)) return;
    this.files.delete(file);
    this.asts.delete(file);
    this.uirDocs.delete(file);
    this.parseErrors.delete(file);
    this.dirty = true;
  }

  // ── Access ──────────────────────────────────────────────────────────────────

  getGraph(): CodeKnowledgeGraph {
    this.ensureBuilt();
    return this.graph!;
  }
  getPKM(): ProjectKnowledgeModel {
    this.ensureBuilt();
    return this.pkm;
  }
  getAST(path: string): NormalizedAST | undefined {
    return this.asts.get(normalizePath(path));
  }
  asTList(): readonly NormalizedAST[] {
    return [...this.asts.values()];
  }
  entities(): readonly CodeEntity[] {
    return this.getGraph().entities();
  }
  relations(): readonly CodeRelation[] {
    return this.getGraph().relations();
  }

  search(query: CodeSearchQuery): CodeSearchHit[] {
    return searchGraph(this.getGraph(), query);
  }

  validate(): RepoValidationReport {
    this.ensureBuilt();
    return validateRepository({ uirDocs: [...this.uirDocs.values()], parseErrors: this.parseErrors, graph: this.graph! });
  }

  stats(): RepoStats {
    this.ensureBuilt();
    const g = this.graph!.stats();
    return { files: this.files.size, parsed: this.asts.size, failed: this.parseErrors.size, entities: g.entities, relations: g.relations, byKind: g.byKind, parseCacheHits: this.parseCacheHits };
  }

  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    for (const docId of this.sliceHashes.keys()) this.pkm.removeDocument(docId);
    this.files.clear();
    this.asts.clear();
    this.uirDocs.clear();
    this.parseErrors.clear();
    this.sliceHashes.clear();
    this.graph = undefined;
    this.dirty = true;
    this._version++;
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private ensureBuilt(): void {
    if (!this.dirty) return;
    this.graph = buildCodeKnowledgeGraph([...this.uirDocs.values()]);
    this.syncPkm(this.graph);
    this.dirty = false;
    this._version++;
    for (const l of this.listeners) l({ version: this._version });
  }

  /** Incrementally re-ingest only the PKM slices whose content changed. */
  private syncPkm(graph: CodeKnowledgeGraph): void {
    const slices = buildRepositorySlices(graph);
    const seen = new Set<string>();
    for (const [docId, slice] of slices) {
      seen.add(docId);
      const hash = fnv1a(JSON.stringify(slice));
      if (this.sliceHashes.get(docId) === hash) continue;
      this.pkm.removeDocument(docId);
      const ref: DocumentRef = { id: docId, title: docId, docType: 'code', contentHash: hash, version: 1 };
      this.pkm.ingest(ref, slice);
      this.sliceHashes.set(docId, hash);
    }
    for (const docId of [...this.sliceHashes.keys()]) {
      if (!seen.has(docId)) {
        this.pkm.removeDocument(docId);
        this.sliceHashes.delete(docId);
      }
    }
  }

  private cachedResultFor(file: string, hash: string): ParseResult {
    return this.parseCache.get(`${file}:${hash}`) ?? { language: 'unknown', ok: this.asts.has(file), ...(this.asts.get(file) ? { ast: this.asts.get(file)! } : {}), errors: this.parseErrors.get(file) ?? [] };
  }
}
