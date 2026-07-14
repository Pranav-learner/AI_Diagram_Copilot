/**
 * ProjectIntelligenceEngine — the single front door to the Project Intelligence Model.
 *
 * This is the ONLY surface AI features touch. Never expose raw repositories, parsers,
 * or the PKM to a consumer — everything reasons over the fused {@link
 * ProjectIntelligenceModel}. The engine:
 *   • shares one {@link ProjectKnowledgeModel} with the Document/Reverse-Engineering
 *     engines (inject via `deps.pkm`), so documents, code, infra, APIs, databases and
 *     diagrams all fuse into one twin;
 *   • rebuilds the PIM lazily and incrementally — only when the PKM's version changes;
 *   • serves topology, queries, search, cross-references, conflicts and validation over
 *     the current snapshot.
 *
 * Deterministic: no LLM anywhere in this module.
 */

import { ProjectKnowledgeModel } from '../knowledge';
import { FusionEngine } from './fusion/FusionEngine';
import type { ProjectIntelligenceModel, Conflict, PimStats } from './pim/ProjectIntelligenceModel';
import { buildTopology, type TopologyDimension, type TopologyView } from './pim/TopologyGraph';
import { PimQuery } from './queries';
import { searchPim, type PimSearchQuery, type PimSearchHit } from './search';
import { crossReferences, type CrossReference } from './crossref';
import { validatePim, type PimValidationReport } from './validation';
import { semanticGraphToExtraction, diagramDocumentId, type DiagramSourceInput } from './sources/DiagramSource';

export interface ProjectIntelligenceEngineDeps {
  /** Shared PKM. Inject the same instance the document/code engines write to. */
  readonly pkm?: ProjectKnowledgeModel;
}

export type PimUpdateListener = (event: { readonly version: number; readonly pkmVersion: number }) => void;

/** Small deterministic string hash (djb2) — for diagram content versioning. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export class ProjectIntelligenceEngine {
  private readonly pkm: ProjectKnowledgeModel;
  private readonly fusion = new FusionEngine();
  private readonly listeners = new Set<PimUpdateListener>();

  private pim?: ProjectIntelligenceModel;
  /** The PKM version the cached PIM was built from (-1 ⇒ never built). */
  private builtFromPkmVersion = -1;
  private pimVersion = 0;

  constructor(deps: ProjectIntelligenceEngineDeps = {}) {
    this.pkm = deps.pkm ?? new ProjectKnowledgeModel();
  }

  /** The shared PKM (for the document/code engines to write into — not for AI consumers). */
  knowledge(): ProjectKnowledgeModel {
    return this.pkm;
  }

  // ── PIM access (lazy, incremental) ─────────────────────────────────────────────
  /** The current fused PIM, rebuilt only if the PKM changed since the last build. */
  getPIM(): ProjectIntelligenceModel {
    if (!this.pim || this.builtFromPkmVersion !== this.pkm.version) this.rebuild();
    return this.pim!;
  }

  /** Force a freshness check; rebuilds + notifies if the PKM changed. Returns true if rebuilt. */
  refresh(): boolean {
    if (this.pim && this.builtFromPkmVersion === this.pkm.version) return false;
    this.rebuild();
    return true;
  }

  private rebuild(): void {
    this.pimVersion++;
    this.pim = this.fusion.fuse(this.pkm, this.pimVersion);
    this.builtFromPkmVersion = this.pkm.version;
    for (const l of this.listeners) l({ version: this.pimVersion, pkmVersion: this.pkm.version });
  }

  // ── Diagram ingestion (closes the fusion loop for existing diagrams) ───────────
  /** Ingest an existing diagram (its semantic graph) as a knowledge source. */
  ingestDiagram(input: DiagramSourceInput): void {
    const id = diagramDocumentId(input.id);
    const extraction = semanticGraphToExtraction(input.graph, id);
    const contentHash = hash(JSON.stringify(extraction));
    const previous = this.pkm.getDocument(id);
    if (previous && previous.contentHash === contentHash) return; // unchanged — no work
    if (previous) this.pkm.removeDocument(id);
    this.pkm.ingest({ id, title: input.title ?? id, docType: 'diagram', contentHash, version: (previous?.version ?? 0) + 1 }, extraction);
  }

  /** Remove a previously-ingested diagram source. */
  removeDiagram(id: string): void {
    this.pkm.removeDocument(diagramDocumentId(id));
  }

  // ── Reasoning surfaces (all over the PIM) ──────────────────────────────────────
  getTopology(dimension: TopologyDimension): TopologyView {
    return buildTopology(this.getPIM(), dimension);
  }
  conflicts(): readonly Conflict[] {
    return this.getPIM().conflicts();
  }
  query(): PimQuery {
    return new PimQuery(this.getPIM());
  }
  search(query: PimSearchQuery): PimSearchHit[] {
    return searchPim(this.getPIM(), query);
  }
  crossReferences(entityId: string): CrossReference | undefined {
    return crossReferences(this.getPIM(), entityId);
  }
  validate(): PimValidationReport {
    return validatePim(this.getPIM());
  }
  stats(): PimStats {
    return this.getPIM().stats();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────────
  onUpdate(listener: PimUpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispose(): void {
    this.listeners.clear();
    this.pim = undefined;
  }
}
