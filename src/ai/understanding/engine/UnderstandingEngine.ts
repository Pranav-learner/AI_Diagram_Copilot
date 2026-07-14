/**
 * UnderstandingEngine — the stateful front-end that keeps a Semantic Graph in
 * sync with a live diagram and serves cached queries/context/summaries.
 *
 * Lifecycle: build the graph once, then on every commit pull the new document and
 * apply an {@link incrementalUpdate} — reclassifying only the delta. The reported
 * changed-id set drives region-aware cache invalidation, so a one-node edit evicts
 * only the caches that touched that node. Consumers hold no state of their own:
 * they call {@link query}/{@link extractContext}/{@link summarize} and get results
 * against the current snapshot.
 *
 *   DiagramRuntime → (port) → UnderstandingEngine → SemanticGraph → SemanticQuery
 *
 * This is the object every future AI capability is handed.
 */

import type { DiagramDocument } from '@/dsl';
import type { SemanticGraph } from '../model/graph';
import { buildSemanticGraph } from '../build/SemanticGraphBuilder';
import { fullRebuild, incrementalUpdate, type ChangedIds, type GraphDelta } from '../build/incremental';
import { SemanticQuery } from '../query/SemanticQuery';
import { RegionCache } from '../cache/RegionCache';
import { neighborhood } from '../analysis/traversal';
import { descendants } from '../analysis/hierarchy';
import type { ContextExtractOptions, ContextScope, ExtractedContext } from '../context/ContextExtractor';
import type { ValidationReport } from '../validation/validateGraph';
import type { DiagramChangeSource } from './ports';

export interface UnderstandingEngineOptions {
  /** Default token budget applied to {@link extractContext} when unset per-call. */
  readonly contextBudget?: number;
}

export interface UpdateEvent {
  readonly changed: ChangedIds;
  readonly version: number;
  readonly rebuiltFull: boolean;
}

type UpdateListener = (event: UpdateEvent) => void;

export class UnderstandingEngine {
  private graph: SemanticGraph;
  /** The document the current graph was built from (needed to diff incrementally). */
  private document: DiagramDocument;
  private cachedQuery?: SemanticQuery;
  private queryForGraph?: SemanticGraph;

  private readonly contextCache = new RegionCache<ExtractedContext>();
  private readonly summaryCache = new RegionCache<string>();
  private readonly listeners = new Set<UpdateListener>();
  private detach?: () => void;

  private constructor(
    document: DiagramDocument,
    version: number,
    private readonly options: UnderstandingEngineOptions = {},
  ) {
    this.document = document;
    this.graph = buildSemanticGraph(document, version);
  }

  /** Build an engine over a static document (no live sync). */
  static fromDocument(document: DiagramDocument, version = 0, options?: UnderstandingEngineOptions): UnderstandingEngine {
    return new UnderstandingEngine(document, version, options);
  }

  /** Build an engine and keep it synced to a live diagram via the port. */
  static attach(source: DiagramChangeSource, options?: UnderstandingEngineOptions): UnderstandingEngine {
    const engine = new UnderstandingEngine(source.getDocument(), source.getVersion?.() ?? 0, options);
    engine.detach = source.subscribe(() => engine.sync(source));
    return engine;
  }

  // ── State access ──────────────────────────────────────────────────────────────
  getGraph(): SemanticGraph {
    return this.graph;
  }

  getVersion(): number {
    return this.graph.version;
  }

  /** A query facade bound to the current graph (rebuilt only when the graph changes). */
  query(): SemanticQuery {
    if (this.queryForGraph !== this.graph) {
      this.cachedQuery = new SemanticQuery(this.graph);
      this.queryForGraph = this.graph;
    }
    return this.cachedQuery!;
  }

  // ── Synchronisation ─────────────────────────────────────────────────────────
  /**
   * Pull the latest document from `source` and update the graph. Skips work when
   * the version is unchanged. Falls back to a full rebuild if the version regressed
   * (e.g. after an undo that replaced the document wholesale is still incremental,
   * but a document-id change forces full).
   */
  sync(source: DiagramChangeSource): void {
    const nextVersion = source.getVersion?.();
    if (nextVersion !== undefined && nextVersion === this.graph.version) return;
    const next = source.getDocument();
    this.update(next, nextVersion ?? this.graph.version + 1);
  }

  /** Apply an explicit new document/version (used by tests and manual drivers). */
  update(next: DiagramDocument, version: number): UpdateEvent {
    const delta: GraphDelta =
      next.id === this.document.id
        ? incrementalUpdate(this.graph, this.document, next, version)
        : fullRebuild(next, version);
    this.document = next;
    this.graph = delta.graph;
    this.contextCache.invalidate(delta.changed.all);
    this.summaryCache.invalidate(delta.changed.all);
    const event: UpdateEvent = { changed: delta.changed, version: this.graph.version, rebuiltFull: delta.rebuiltFull };
    for (const l of this.listeners) l(event);
    return event;
  }

  /** Force a from-scratch rebuild (e.g. after external bulk import). */
  rebuild(): void {
    this.graph = buildSemanticGraph(this.document, this.graph.version);
    this.contextCache.clear();
    this.summaryCache.clear();
  }

  // ── Cached derivations ────────────────────────────────────────────────────────
  extractContext(scope: ContextScope, opts?: ContextExtractOptions): ExtractedContext {
    const budget = opts?.tokenBudget ?? this.options.contextBudget;
    const effective = budget !== undefined ? { ...opts, tokenBudget: budget } : opts;
    const key = `ctx:${JSON.stringify(scope)}:${JSON.stringify(effective ?? {})}`;
    const cached = this.contextCache.get(key);
    if (cached) return cached;
    const ctx = this.query().extractContext(scope, effective);
    // `null` deps ⇒ unbounded scope ⇒ store empty deps so any change evicts it.
    const deps = this.depsFor(scope, [...ctx.entities.map((e) => e.id), ...ctx.groups.map((g) => g.id)]);
    this.contextCache.set(key, ctx, deps ?? [], this.graph.version);
    return ctx;
  }

  summarize(scope?: ContextScope): string {
    const key = `sum:${JSON.stringify(scope ?? { kind: 'whole' })}`;
    const cached = this.summaryCache.get(key);
    if (cached !== undefined) return cached;
    const text = this.query().summarize(scope);
    const deps = this.depsFor(scope ?? { kind: 'whole' }, []);
    this.summaryCache.set(key, text, deps ?? [], this.graph.version);
    return text;
  }

  validate(): ValidationReport {
    return this.query().validate();
  }

  // ── Events & teardown ─────────────────────────────────────────────────────────
  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cacheStats() {
    return { context: this.contextCache.stats(), summary: this.summaryCache.stats() };
  }

  dispose(): void {
    this.detach?.();
    this.detach = undefined;
    this.listeners.clear();
    this.contextCache.clear();
    this.summaryCache.clear();
  }

  // ── internals ─────────────────────────────────────────────────────────────────
  /**
   * The dependency id set a cached derivation for `scope` should be invalidated
   * on. `null` means "unbounded" (whole-diagram or path scope) → evict on any
   * change. Otherwise the region plus any extra ids the derivation actually read.
   */
  private depsFor(scope: ContextScope, extra: readonly string[]): Set<string> | null {
    switch (scope.kind) {
      case 'whole':
      case 'path':
        return null;
      case 'entity': {
        const deps = neighborhood(this.graph, scope.id, 1);
        for (const id of extra) deps.add(id);
        return deps;
      }
      case 'group': {
        const deps = new Set<string>([scope.id, ...descendants(this.graph, scope.id)]);
        for (const id of extra) deps.add(id);
        return deps;
      }
      case 'neighborhood': {
        const deps = neighborhood(this.graph, scope.id, scope.radius ?? 1);
        for (const id of extra) deps.add(id);
        return deps;
      }
      case 'selection':
      case 'subgraph': {
        const deps = new Set<string>(extra);
        for (const id of scope.ids) {
          deps.add(id);
          for (const n of neighborhood(this.graph, id, 1)) deps.add(n);
        }
        return deps;
      }
    }
  }
}
