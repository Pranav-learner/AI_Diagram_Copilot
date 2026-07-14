/**
 * ProjectKnowledgeModel — the central, connected knowledge representation.
 *
 * The PKM is where extracted entities/relations from *all* documents are merged
 * into one deduplicated graph. Entities are merged by a normalised name key (so
 * "Auth Service", "AuthService", and "auth service" become one), aliases and
 * evidence accumulate, and relations strengthen as more documents corroborate them.
 * Every fact is traceable to its source document + node.
 *
 * Updates are **incremental and reversible at document granularity**:
 * `removeDocument(id)` withdraws exactly that document's contributions (deleting
 * entities/relations left with no evidence), so re-ingesting a changed document is
 * `removeDocument` + `ingest`. This is the interface every future module consumes —
 * never raw document parsing.
 */

import type { KnowledgeCategory } from '../documents/DocumentClassifier';
import type { EntityKind, EvidenceRef, KnowledgeEntity } from './KnowledgeEntity';
import { STATEMENT_KINDS, NAMED_KINDS, entityId } from './KnowledgeEntity';
import type { KnowledgeRelation, RelationKind } from './KnowledgeRelation';
import { relationId } from './KnowledgeRelation';
import type { ExtractionResult } from '../extractors/types';
import { classifyEntityKind } from '../extractors/types';
import { normalizeTerm } from '../util';
import { OntologyMapper } from '../ontology/OntologyMapper';

type Mut<T> = { -readonly [K in keyof T]: T[K] };
type MutEntity = Mut<KnowledgeEntity> & { sourceKeys: Set<string>; documents: Set<string> };
type MutRelation = Mut<KnowledgeRelation> & { sourceKeys: Set<string>; documents: Set<string>; evidenceSet: Set<string> };

export interface DocumentRef {
  readonly id: string;
  readonly title: string;
  readonly docType: string;
  readonly contentHash: string;
  readonly version: number;
}

export interface PkmStats {
  readonly entities: number;
  readonly relations: number;
  readonly documents: number;
  readonly byKind: Readonly<Record<string, number>>;
}

/** The merge key: statements are kind-scoped; named things merge across kinds. */
function mergeKey(name: string, kind: EntityKind): string {
  const norm = normalizeTerm(name);
  return STATEMENT_KINDS.has(kind) ? `${kind}:${norm}` : `named:${norm}`;
}

export class ProjectKnowledgeModel {
  private readonly entityMap = new Map<string, MutEntity>();
  private readonly relationMap = new Map<string, MutRelation>();
  private readonly documentMap = new Map<string, DocumentRef>();
  /** mergeKey → entity id. */
  private readonly aliasIndex = new Map<string, string>();
  /** document id → entity ids it contributed to. */
  private readonly byDoc = new Map<string, Set<string>>();
  private _version = 0;

  get version(): number {
    return this._version;
  }

  // ── Ingestion (incremental) ────────────────────────────────────────────────

  /** Merge a document's extracted knowledge into the PKM. */
  ingest(document: DocumentRef, extracted: ExtractionResult): void {
    this.documentMap.set(document.id, document);
    const touched = this.byDoc.get(document.id) ?? new Set<string>();
    this.byDoc.set(document.id, touched);

    for (const e of extracted.entities) {
      const ent = this.resolveOrCreate(e.name, e.kind, e.category ?? 'general', e.confidence, e.description);
      this.mergeEntity(ent, e.name, e.kind, e.confidence, e.description, e.aliases, e.tags, e.attributes, e.category);
      this.addEntitySource(ent, e.evidence, document.id);
      touched.add(ent.id);
    }

    for (const r of extracted.relations) {
      const src = this.resolveOrCreate(r.sourceName, r.sourceKind ?? classifyEntityKind(r.sourceName), 'general', 0.4);
      const tgt = this.resolveOrCreate(r.targetName, r.targetKind ?? classifyEntityKind(r.targetName), 'general', 0.4);
      if (src.id === tgt.id) continue;
      this.addEntitySource(src, r.evidence, document.id);
      this.addEntitySource(tgt, r.evidence, document.id);
      touched.add(src.id);
      touched.add(tgt.id);
      this.addRelation(src.id, r.kind, tgt.id, r.confidence, r.evidence, r.sentence, document.id);
    }

    this._version++;
  }

  /** Withdraw a document's contributions. Returns the entity ids it affected. */
  removeDocument(documentId: string): Set<string> {
    const affected = new Set<string>();
    const touched = this.byDoc.get(documentId);
    if (!touched) {
      this.documentMap.delete(documentId);
      return affected;
    }

    for (const relation of [...this.relationMap.values()]) {
      if (!relation.documents.has(documentId)) continue;
      affected.add(relation.source);
      affected.add(relation.target);
      relation.sources = relation.sources.filter((s) => s.documentId !== documentId);
      relation.sourceKeys = new Set(relation.sources.map((s) => `${s.documentId}:${s.nodeId}`));
      relation.documents.delete(documentId);
      relation.mentions = relation.sourceKeys.size;
      if (relation.sources.length === 0) this.relationMap.delete(relation.id);
    }

    for (const id of touched) {
      const ent = this.entityMap.get(id);
      if (!ent) continue;
      affected.add(id);
      ent.sources = ent.sources.filter((s) => s.documentId !== documentId);
      ent.sourceKeys = new Set(ent.sources.map((s) => `${s.documentId}:${s.nodeId}`));
      ent.documents.delete(documentId);
      ent.documentIds = [...ent.documents];
      ent.mentions = ent.sourceKeys.size;
      if (ent.sources.length === 0) this.deleteEntity(ent);
    }

    this.byDoc.delete(documentId);
    this.documentMap.delete(documentId);
    this._version++;
    return affected;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  getEntity(id: string): KnowledgeEntity | undefined {
    const ent = this.entityMap.get(id);
    return ent ? this.attachRelationships(ent) : undefined;
  }
  getRelation(id: string): KnowledgeRelation | undefined {
    return this.relationMap.get(id);
  }
  entities(): readonly KnowledgeEntity[] {
    return [...this.entityMap.values()].map((e) => this.attachRelationships(e));
  }
  relations(): readonly KnowledgeRelation[] {
    return [...this.relationMap.values()];
  }
  documents(): readonly DocumentRef[] {
    return [...this.documentMap.values()];
  }
  getDocument(id: string): DocumentRef | undefined {
    return this.documentMap.get(id);
  }

  /** Resolve a name to an existing entity (no creation). */
  find(name: string, kind?: EntityKind): KnowledgeEntity | undefined {
    const k = kind ?? classifyEntityKind(name);
    const id = this.aliasIndex.get(mergeKey(name, k)) ?? this.aliasIndex.get(mergeKey(name, 'concept'));
    return id ? this.getEntity(id) : undefined;
  }

  byKind(kind: EntityKind): KnowledgeEntity[] {
    return this.entities().filter((e) => e.kind === kind);
  }
  byCategory(category: KnowledgeCategory): KnowledgeEntity[] {
    return this.entities().filter((e) => e.category === category);
  }
  byDocument(documentId: string): KnowledgeEntity[] {
    const ids = this.byDoc.get(documentId);
    return ids ? [...ids].map((id) => this.getEntity(id)).filter((e): e is KnowledgeEntity => !!e) : [];
  }

  private attachRelationships(ent: MutEntity): KnowledgeEntity {
    const rels = this.relationsOf(ent.id).map((r) => ({
      id: r.id,
      targetId: r.source === ent.id ? r.target : r.source,
      kind: r.kind,
      attributes: { confidence: r.confidence, mentions: r.mentions }
    }));
    return {
      ...ent,
      relationships: rels
    };
  }

  /** Relations touching an entity, and the connected entities. */
  relationsOf(entityId: string): KnowledgeRelation[] {
    return this.relations().filter((r) => r.source === entityId || r.target === entityId);
  }
  neighbors(entityId: string): KnowledgeEntity[] {
    const out = new Map<string, KnowledgeEntity>();
    for (const r of this.relationsOf(entityId)) {
      const otherId = r.source === entityId ? r.target : r.source;
      const other = this.entityMap.get(otherId);
      if (other) out.set(otherId, other);
    }
    return [...out.values()];
  }

  stats(): PkmStats {
    const byKind: Record<string, number> = {};
    for (const e of this.entityMap.values()) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    return { entities: this.entityMap.size, relations: this.relationMap.size, documents: this.documentMap.size, byKind };
  }

  clear(): void {
    this.entityMap.clear();
    this.relationMap.clear();
    this.documentMap.clear();
    this.aliasIndex.clear();
    this.byDoc.clear();
    this._version++;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private resolveOrCreate(name: string, kind: EntityKind, category: KnowledgeCategory, confidence: number, description?: string): MutEntity {
    const key = mergeKey(name, kind);
    const existingId = this.aliasIndex.get(key);
    if (existingId) return this.entityMap.get(existingId)!;

    let id = entityId(kind, name);
    while (this.entityMap.has(id)) id = `${id}~${this.entityMap.size}`;
    const ent: MutEntity = {
      id,
      name,
      kind,
      ontologyType: OntologyMapper.mapKind(kind),
      category,
      aliases: [],
      tags: [],
      confidence,
      mentions: 0,
      sources: [],
      documentIds: [],
      attributes: {},
      sourceKeys: new Set(),
      documents: new Set(),
      ...(description ? { description } : {}),
    };
    this.entityMap.set(id, ent);
    this.aliasIndex.set(key, id);
    return ent;
  }

  private mergeEntity(
    ent: MutEntity,
    name: string,
    kind: EntityKind,
    confidence: number,
    description: string | undefined,
    aliases: readonly string[] | undefined,
    tags: readonly string[] | undefined,
    attributes: Readonly<Record<string, string | number | boolean>> | undefined,
    category: KnowledgeCategory | undefined,
  ): void {
    ent.confidence = Math.max(ent.confidence, confidence);
    if (description && (!ent.description || description.length > ent.description.length)) ent.description = description;
    if (normalizeTerm(name) !== normalizeTerm(ent.name)) addUnique(ent.aliases as string[], name);
    for (const a of aliases ?? []) addUnique(ent.aliases as string[], a);
    for (const t of tags ?? []) addUnique(ent.tags as string[], t);
    if (attributes) ent.attributes = { ...ent.attributes, ...attributes };
    // Upgrade a generic concept to a more specific named kind.
    if (ent.kind === 'concept' && kind !== 'concept' && NAMED_KINDS.has(kind)) {
      ent.kind = kind;
      ent.ontologyType = OntologyMapper.mapKind(kind);
    }
    if (ent.category === 'general' && category && category !== 'general') ent.category = category;
  }

  private addEntitySource(ent: MutEntity, ev: EvidenceRef, documentId: string): void {
    const key = `${documentId}:${ev.nodeId}`;
    if (!ent.sourceKeys.has(key)) {
      ent.sourceKeys.add(key);
      (ent.sources as EvidenceRef[]).push(ev);
      ent.mentions = ent.sourceKeys.size;
    }
    if (!ent.documents.has(documentId)) {
      ent.documents.add(documentId);
      ent.documentIds = [...ent.documents];
    }
    (this.byDoc.get(documentId) ?? this.byDoc.set(documentId, new Set()).get(documentId)!).add(ent.id);
  }

  private addRelation(source: string, kind: RelationKind, target: string, confidence: number, ev: EvidenceRef, sentence: string, documentId: string): void {
    const id = relationId(source, kind, target);
    let rel = this.relationMap.get(id);
    if (!rel) {
      rel = { id, source, target, kind, confidence, mentions: 0, sources: [], evidence: [], sourceKeys: new Set(), documents: new Set(), evidenceSet: new Set() };
      this.relationMap.set(id, rel);
    }
    rel.confidence = Math.max(rel.confidence, confidence);
    const key = `${documentId}:${ev.nodeId}`;
    if (!rel.sourceKeys.has(key)) {
      rel.sourceKeys.add(key);
      (rel.sources as EvidenceRef[]).push(ev);
      rel.mentions = rel.sourceKeys.size;
    }
    rel.documents.add(documentId);
    const s = sentence.trim();
    if (s && !rel.evidenceSet.has(s)) {
      rel.evidenceSet.add(s);
      (rel.evidence as string[]).push(s.length > 160 ? `${s.slice(0, 157)}…` : s);
    }
  }

  private deleteEntity(ent: MutEntity): void {
    this.entityMap.delete(ent.id);
    for (const [key, id] of this.aliasIndex) if (id === ent.id) this.aliasIndex.delete(key);
    for (const [rid, rel] of this.relationMap) if (rel.source === ent.id || rel.target === ent.id) this.relationMap.delete(rid);
  }
}

function addUnique(arr: string[], value: string): void {
  if (value && !arr.some((v) => normalizeTerm(v) === normalizeTerm(value))) arr.push(value);
}
