/**
 * The Project Intelligence Model (PIM) — a unified, renderer-independent semantic
 * model of an *entire* software project (a "digital twin").
 *
 * Where the PKM is a flat, name-keyed store of facts extracted per-source, the PIM
 * is the *fused* layer: one entity per real-world concept regardless of how many
 * sources described it (a `UserService` in a design doc, the `UserService` class in
 * code, and the `user-service` container in Compose become ONE entity), with unified
 * multi-source {@link Evidence}, cross-source topology, detected {@link Conflict}s,
 * and inferred architecture. Every future AI feature reasons over the PIM — never raw
 * repositories or individual parsers.
 */

import type { KnowledgeCategory } from '../../knowledge';

/** Which kind of artifact a piece of knowledge came from. Open for future sources. */
export type SourceKind = 'document' | 'code' | 'infrastructure' | 'api' | 'database' | 'diagram' | 'inference' | (string & {});

/** How a fact was obtained. */
export type ExtractionMethod = 'documentation' | 'static-analysis' | 'infrastructure' | 'schema' | 'diagram' | 'inference';

/** One traceable piece of supporting evidence, preserved through fusion. */
export interface Evidence {
  readonly origin: SourceKind;
  /** The document/file the evidence came from. */
  readonly source: string;
  /** Line / section / node location within the source, when known. */
  readonly location?: string;
  readonly confidence: number;
  readonly method: ExtractionMethod;
  readonly excerpt?: string;
}

/** Semantic kind of a project entity. Open (`string & {}`) for extensibility. */
export type PimEntityKind =
  // Architecture
  | 'service'
  | 'module'
  | 'component'
  | 'library'
  | 'boundedContext'
  | 'layer'
  | 'domain'
  | 'subsystem'
  | 'capability'
  // Infrastructure
  | 'database'
  | 'cache'
  | 'queue'
  | 'container'
  | 'deployment'
  | 'resource'
  // API / data
  | 'api'
  | 'endpoint'
  | 'schema'
  | 'table'
  // People / process
  | 'actor'
  | 'workflow'
  | 'process'
  // Statements
  | 'requirement'
  | 'decision'
  | 'risk'
  | 'constraint'
  | 'goal'
  | 'assumption'
  | 'concept'
  | (string & {});

export interface PimEntity {
  readonly id: string;
  readonly name: string;
  readonly kind: PimEntityKind;
  readonly category: KnowledgeCategory;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly description?: string;
  readonly confidence: number;
  /** Unified evidence across every source that described this concept. */
  readonly evidence: readonly Evidence[];
  /** Distinct artifact kinds that contributed (for cross-reference navigation). */
  readonly sourceKinds: readonly SourceKind[];
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  /** Distinct versions observed across sources (version-difference tracking). */
  readonly versions?: readonly string[];
  /** True when the entity was inferred by enrichment rather than directly extracted. */
  readonly inferred?: boolean;
  /** The PKM entity ids fused into this PIM entity (traceability). */
  readonly pkmIds: readonly string[];
}

export type PimRelationKind =
  | 'dependsOn'
  | 'calls'
  | 'contains'
  | 'partOf'
  | 'exposes'
  | 'owns'
  | 'implements'
  | 'references'
  | 'connectsTo'
  | 'deployedAs'
  | 'documents'
  | 'relatedTo'
  | (string & {});

export interface PimRelation {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: PimRelationKind;
  readonly confidence: number;
  readonly evidence: readonly Evidence[];
}

export type ConflictKind =
  | 'missing-implementation'
  | 'outdated-diagram'
  | 'conflicting-documentation'
  | 'duplicate-ownership'
  | 'version-mismatch'
  | 'inconsistent-api'
  | 'orphan-entity'
  | (string & {});

export type ConflictSeverity = 'high' | 'medium' | 'low' | 'info';

export interface Conflict {
  readonly id: string;
  readonly kind: ConflictKind;
  readonly severity: ConflictSeverity;
  readonly message: string;
  readonly entities: readonly string[];
  readonly evidence: readonly Evidence[];
}

export interface PimStats {
  readonly entities: number;
  readonly relations: number;
  readonly conflicts: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly bySourceKind: Readonly<Record<string, number>>;
}

/**
 * The PIM store — an immutable snapshot produced by the Fusion Engine. Holds the
 * fused entities, relations, and conflicts plus precomputed lookup indexes so the
 * query/search/topology layers are O(1)/O(k).
 */
export class ProjectIntelligenceModel {
  private readonly entityMap: ReadonlyMap<string, PimEntity>;
  private readonly relationMap: ReadonlyMap<string, PimRelation>;
  private readonly conflictList: readonly Conflict[];
  /** PKM entity id → PIM entity id (resolution traceability). */
  private readonly pkmToPim: ReadonlyMap<string, string>;
  readonly version: number;

  private readonly byKindIndex = new Map<string, string[]>();
  private readonly byCategoryIndex = new Map<string, string[]>();
  private readonly byTagIndex = new Map<string, string[]>();
  private readonly bySourceKindIndex = new Map<string, string[]>();
  private readonly relBySource = new Map<string, string[]>();
  private readonly relByTarget = new Map<string, string[]>();

  constructor(input: { entities: readonly PimEntity[]; relations: readonly PimRelation[]; conflicts: readonly Conflict[]; pkmToPim: ReadonlyMap<string, string>; version: number }) {
    this.entityMap = new Map(input.entities.map((e) => [e.id, e]));
    this.relationMap = new Map(input.relations.map((r) => [r.id, r]));
    this.conflictList = input.conflicts;
    this.pkmToPim = input.pkmToPim;
    this.version = input.version;
    this.buildIndexes(input.entities, input.relations);
  }

  private buildIndexes(entities: readonly PimEntity[], relations: readonly PimRelation[]): void {
    const push = (map: Map<string, string[]>, key: string, value: string) => {
      const b = map.get(key);
      if (b) b.push(value);
      else map.set(key, [value]);
    };
    for (const e of entities) {
      push(this.byKindIndex, e.kind, e.id);
      push(this.byCategoryIndex, e.category, e.id);
      for (const t of e.tags) push(this.byTagIndex, t.toLowerCase(), e.id);
      for (const s of e.sourceKinds) push(this.bySourceKindIndex, s, e.id);
    }
    for (const r of relations) {
      push(this.relBySource, r.source, r.id);
      push(this.relByTarget, r.target, r.id);
    }
  }

  // ── Access ────────────────────────────────────────────────────────────────────
  getEntity(id: string): PimEntity | undefined {
    return this.entityMap.get(id);
  }
  getRelation(id: string): PimRelation | undefined {
    return this.relationMap.get(id);
  }
  entities(): readonly PimEntity[] {
    return [...this.entityMap.values()];
  }
  relations(): readonly PimRelation[] {
    return [...this.relationMap.values()];
  }
  conflicts(): readonly Conflict[] {
    return this.conflictList;
  }
  /** The PIM entity a PKM entity was fused into. */
  resolvePkm(pkmId: string): PimEntity | undefined {
    const id = this.pkmToPim.get(pkmId);
    return id ? this.entityMap.get(id) : undefined;
  }

  byKind(kind: PimEntityKind): PimEntity[] {
    return (this.byKindIndex.get(kind) ?? []).map((id) => this.entityMap.get(id)!);
  }
  byCategory(category: KnowledgeCategory): PimEntity[] {
    return (this.byCategoryIndex.get(category) ?? []).map((id) => this.entityMap.get(id)!);
  }
  byTag(tag: string): PimEntity[] {
    return (this.byTagIndex.get(tag.toLowerCase()) ?? []).map((id) => this.entityMap.get(id)!);
  }
  bySourceKind(sourceKind: SourceKind): PimEntity[] {
    return (this.bySourceKindIndex.get(sourceKind) ?? []).map((id) => this.entityMap.get(id)!);
  }

  /** Relations leaving an entity. */
  outgoing(entityId: string): PimRelation[] {
    return (this.relBySource.get(entityId) ?? []).map((id) => this.relationMap.get(id)!);
  }
  /** Relations entering an entity. */
  incoming(entityId: string): PimRelation[] {
    return (this.relByTarget.get(entityId) ?? []).map((id) => this.relationMap.get(id)!);
  }

  findByName(name: string): PimEntity | undefined {
    const norm = name.trim().toLowerCase();
    return this.entities().find((e) => e.name.toLowerCase() === norm || e.aliases.some((a) => a.toLowerCase() === norm));
  }

  stats(): PimStats {
    const byKind: Record<string, number> = {};
    const bySourceKind: Record<string, number> = {};
    for (const e of this.entityMap.values()) {
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      for (const s of e.sourceKinds) bySourceKind[s] = (bySourceKind[s] ?? 0) + 1;
    }
    return { entities: this.entityMap.size, relations: this.relationMap.size, conflicts: this.conflictList.length, byKind, bySourceKind };
  }
}
