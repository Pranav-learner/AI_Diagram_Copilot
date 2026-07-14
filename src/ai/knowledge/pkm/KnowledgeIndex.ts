/**
 * KnowledgeIndex — precomputed lookups over a {@link ProjectKnowledgeModel} snapshot.
 *
 * Secondary indexes by kind, category, tag, document, name token, and relationship
 * make the common PKM queries O(1)/O(k) instead of scanning all entities. It is
 * *derived* data, cheap to rebuild (O(V+E) over already-extracted objects), so the
 * engine rebuilds it when the PKM version changes and caches it — the same trade the
 * diagram GraphIndex makes.
 */

import type { KnowledgeCategory } from '../documents/DocumentClassifier';
import type { EntityKind, KnowledgeEntity } from './KnowledgeEntity';
import type { KnowledgeRelation, RelationKind } from './KnowledgeRelation';
import type { ProjectKnowledgeModel } from './ProjectKnowledgeModel';
import { tokenize } from '../util';

const EMPTY: readonly string[] = Object.freeze([]);

function push(map: Map<string, string[]>, key: string, value: string): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

export class KnowledgeIndex {
  private readonly kindIndex = new Map<string, string[]>();
  private readonly categoryIndex = new Map<string, string[]>();
  private readonly tagIndex = new Map<string, string[]>();
  private readonly docIndex = new Map<string, string[]>();
  /** Name/description token → entity ids (keyword search). */
  private readonly tokenIndex = new Map<string, Set<string>>();
  private readonly relBySource = new Map<string, string[]>();
  private readonly relByTarget = new Map<string, string[]>();
  private readonly relByKind = new Map<string, string[]>();

  /** The PKM version this index reflects. */
  readonly version: number;

  private constructor(version: number) {
    this.version = version;
  }

  static build(pkm: ProjectKnowledgeModel): KnowledgeIndex {
    const idx = new KnowledgeIndex(pkm.version);
    for (const e of pkm.entities()) {
      push(idx.kindIndex, e.kind, e.id);
      push(idx.categoryIndex, e.category, e.id);
      for (const tag of e.tags) push(idx.tagIndex, tag.toLowerCase(), e.id);
      for (const docId of e.documentIds) push(idx.docIndex, docId, e.id);
      for (const token of tokenize(`${e.name} ${e.aliases.join(' ')} ${e.description ?? ''}`)) {
        const set = idx.tokenIndex.get(token);
        if (set) set.add(e.id);
        else idx.tokenIndex.set(token, new Set([e.id]));
      }
    }
    for (const r of pkm.relations()) {
      push(idx.relBySource, r.source, r.id);
      push(idx.relByTarget, r.target, r.id);
      push(idx.relByKind, r.kind, r.id);
    }
    return idx;
  }

  byKind(kind: EntityKind): readonly string[] {
    return this.kindIndex.get(kind) ?? EMPTY;
  }
  byCategory(category: KnowledgeCategory): readonly string[] {
    return this.categoryIndex.get(category) ?? EMPTY;
  }
  byTag(tag: string): readonly string[] {
    return this.tagIndex.get(tag.toLowerCase()) ?? EMPTY;
  }
  byDocument(documentId: string): readonly string[] {
    return this.docIndex.get(documentId) ?? EMPTY;
  }
  /** Entity ids whose name/description contain the token. */
  byToken(token: string): readonly string[] {
    const set = this.tokenIndex.get(token.toLowerCase());
    return set ? [...set] : EMPTY;
  }
  relationsFrom(entityId: string): readonly string[] {
    return this.relBySource.get(entityId) ?? EMPTY;
  }
  relationsTo(entityId: string): readonly string[] {
    return this.relByTarget.get(entityId) ?? EMPTY;
  }
  relationsByKind(kind: RelationKind): readonly string[] {
    return this.relByKind.get(kind) ?? EMPTY;
  }

  kinds(): readonly string[] {
    return [...this.kindIndex.keys()];
  }
  categories(): readonly string[] {
    return [...this.categoryIndex.keys()];
  }
  tags(): readonly string[] {
    return [...this.tagIndex.keys()];
  }
}

/** Resolve entity ids to entities via a PKM. */
export function resolveEntities(pkm: ProjectKnowledgeModel, ids: readonly string[]): KnowledgeEntity[] {
  const out: KnowledgeEntity[] = [];
  for (const id of ids) {
    const e = pkm.getEntity(id);
    if (e) out.push(e);
  }
  return out;
}

/** Resolve relation ids to relations via a PKM. */
export function resolveRelations(pkm: ProjectKnowledgeModel, ids: readonly string[]): KnowledgeRelation[] {
  const out: KnowledgeRelation[] = [];
  for (const id of ids) {
    const r = pkm.getRelation(id);
    if (r) out.push(r);
  }
  return out;
}
