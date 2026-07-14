/**
 * CodeKnowledgeGraph — the strongly-typed graph of code + infrastructure entities
 * and their relationships, built deterministically from the normalized ASTs.
 *
 * This is the reverse-engineering analogue of the Semantic Graph: modules, classes,
 * functions, endpoints, tables, services, resources — connected by imports, calls,
 * inheritance, containment, dependencies, and infra wiring. It is the structured
 * representation the LLM (and the PKM merge) reasons over; raw source never escapes
 * past it.
 */

import type { AstMetaValue, Language, NodeKind, SourceRef } from '../ast/NormalizedAST';

/** Code/infra/architecture entity kinds (superset of AST {@link NodeKind}). */
export type CodeEntityKind = NodeKind | 'library' | 'layer' | 'boundedContext';

/** How two code entities relate. */
export type CodeRelationKind =
  | 'imports'
  | 'dependsOn'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'contains'
  | 'references'
  | 'composedOf'
  | 'exposes'
  | 'routes'
  | 'readsFrom'
  | 'writesTo'
  | 'connectsTo'
  | 'deploys'
  | 'owns'
  | 'partOf'
  | (string & {});

export interface CodeEntity {
  readonly id: string;
  readonly kind: CodeEntityKind;
  readonly name: string;
  readonly qualifiedName?: string;
  readonly module?: string;
  readonly file?: string;
  readonly language?: Language;
  readonly source?: SourceRef;
  readonly modifiers: readonly string[];
  readonly confidence: number;
  readonly metadata: Readonly<Record<string, AstMetaValue>>;
}

export interface CodeRelation {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: CodeRelationKind;
  /** The file where the relation was observed (for incremental attribution). */
  readonly file?: string;
  readonly metadata?: Readonly<Record<string, AstMetaValue>>;
}

export interface NewEntity {
  readonly id: string;
  readonly kind: CodeEntityKind;
  readonly name: string;
  readonly qualifiedName?: string;
  readonly module?: string;
  readonly file?: string;
  readonly language?: Language;
  readonly source?: SourceRef;
  readonly modifiers?: readonly string[];
  readonly confidence?: number;
  readonly metadata?: Readonly<Record<string, AstMetaValue>>;
}

type Mut<T> = { -readonly [K in keyof T]: T[K] };

export class CodeKnowledgeGraph {
  private readonly entityMap = new Map<string, Mut<CodeEntity>>();
  private readonly relationMap = new Map<string, CodeRelation>();

  /** Add or merge an entity (keyed by id). Returns its id. */
  addEntity(entity: NewEntity): string {
    const existing = this.entityMap.get(entity.id);
    if (existing) {
      if ((entity.confidence ?? 0.7) > existing.confidence) existing.confidence = entity.confidence ?? existing.confidence;
      if (entity.qualifiedName && !existing.qualifiedName) existing.qualifiedName = entity.qualifiedName;
      if (entity.source && !existing.source) existing.source = entity.source;
      if (entity.metadata) existing.metadata = { ...existing.metadata, ...entity.metadata };
      // A more specific kind wins over a generic 'module'/'concept'.
      if (existing.kind === 'module' && entity.kind !== 'module') existing.kind = entity.kind;
      return existing.id;
    }
    this.entityMap.set(entity.id, {
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      modifiers: entity.modifiers ?? [],
      confidence: entity.confidence ?? 0.8,
      metadata: entity.metadata ?? {},
      ...(entity.qualifiedName ? { qualifiedName: entity.qualifiedName } : {}),
      ...(entity.module ? { module: entity.module } : {}),
      ...(entity.file ? { file: entity.file } : {}),
      ...(entity.language ? { language: entity.language } : {}),
      ...(entity.source ? { source: entity.source } : {}),
    });
    return entity.id;
  }

  addRelation(source: string, kind: CodeRelationKind, target: string, opts: { file?: string; metadata?: Readonly<Record<string, AstMetaValue>> } = {}): void {
    if (source === target) return;
    const id = `${source}|${kind}|${target}`;
    if (this.relationMap.has(id)) return;
    this.relationMap.set(id, { id, source, target, kind, ...(opts.file ? { file: opts.file } : {}), ...(opts.metadata ? { metadata: opts.metadata } : {}) });
  }

  hasEntity(id: string): boolean {
    return this.entityMap.has(id);
  }
  getEntity(id: string): CodeEntity | undefined {
    return this.entityMap.get(id);
  }
  entities(): readonly CodeEntity[] {
    return [...this.entityMap.values()];
  }
  relations(): readonly CodeRelation[] {
    return [...this.relationMap.values()];
  }
  byKind(kind: CodeEntityKind): CodeEntity[] {
    return this.entities().filter((e) => e.kind === kind);
  }
  byFile(file: string): CodeEntity[] {
    return this.entities().filter((e) => e.file === file);
  }
  byModule(module: string): CodeEntity[] {
    return this.entities().filter((e) => e.module === module);
  }

  relationsOf(entityId: string): CodeRelation[] {
    return this.relations().filter((r) => r.source === entityId || r.target === entityId);
  }
  neighbors(entityId: string): CodeEntity[] {
    const out = new Map<string, CodeEntity>();
    for (const r of this.relationsOf(entityId)) {
      const otherId = r.source === entityId ? r.target : r.source;
      const other = this.entityMap.get(otherId);
      if (other) out.set(otherId, other);
    }
    return [...out.values()];
  }

  stats(): { entities: number; relations: number; byKind: Record<string, number> } {
    const byKind: Record<string, number> = {};
    for (const e of this.entityMap.values()) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    return { entities: this.entityMap.size, relations: this.relationMap.size, byKind };
  }
}
