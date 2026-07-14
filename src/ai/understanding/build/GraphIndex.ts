/**
 * GraphIndex — the precomputed lookup layer over a {@link SemanticGraph}.
 *
 * Holds adjacency (relationship graph), the containment tree, and secondary
 * indexes (by kind/label/tag/group). It is *derived* data: cheap to rebuild
 * (O(V+E) array/map ops over already-classified objects), which is why
 * incremental updates reuse the expensive semantic entities/relationships and
 * simply rebuild this index for the new snapshot. All lookups are O(1) or
 * O(degree); nothing here scans the whole graph.
 */

import type { GraphIndex as IGraphIndex } from '../model/graph';
import type { SemanticEntity } from '../model/entity';
import type { SemanticRelationship } from '../model/relationship';
import type { SemanticGroup } from '../model/group';

const EMPTY: readonly string[] = Object.freeze([]);

/** Normalise a label for exact-match indexing (trim + lowercase). */
export function normLabel(label: string): string {
  return label.trim().toLowerCase();
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.add(value);
  else map.set(key, new Set([value]));
}

export class GraphIndex implements IGraphIndex {
  private readonly outRels = new Map<string, string[]>();
  private readonly inRels = new Map<string, string[]>();
  private readonly succ = new Map<string, Set<string>>();
  private readonly pred = new Map<string, Set<string>>();

  private readonly children = new Map<string, string[]>();
  private readonly parent = new Map<string, string>();

  private readonly kindIndex = new Map<string, Set<string>>();
  private readonly labelIndex = new Map<string, Set<string>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly groupIndex = new Map<string, Set<string>>();
  private readonly relKindIndex = new Map<string, Set<string>>();

  private readonly kindCounts = new Map<string, number>();
  private readonly tagCounts = new Map<string, number>();

  private constructor() {}

  /** Build a fresh index from the semantic maps of a graph snapshot. */
  static build(
    entities: ReadonlyMap<string, SemanticEntity>,
    relationships: ReadonlyMap<string, SemanticRelationship>,
    groups: ReadonlyMap<string, SemanticGroup>,
  ): GraphIndex {
    const idx = new GraphIndex();

    for (const entity of entities.values()) {
      addToSet(idx.kindIndex, entity.kind, entity.id);
      idx.kindCounts.set(entity.kind, (idx.kindCounts.get(entity.kind) ?? 0) + 1);
      addToSet(idx.labelIndex, normLabel(entity.label), entity.id);
      for (const tag of entity.tags) {
        addToSet(idx.tagIndex, tag, entity.id);
        idx.tagCounts.set(tag, (idx.tagCounts.get(tag) ?? 0) + 1);
      }
      if (entity.groupId) addToSet(idx.groupIndex, entity.groupId, entity.id);
    }

    for (const rel of relationships.values()) {
      // Adjacency is only meaningful when both endpoints resolve to entities.
      if (!entities.has(rel.source) || !entities.has(rel.target)) continue;
      push(idx.outRels, rel.source, rel.id);
      push(idx.inRels, rel.target, rel.id);
      addToSet(idx.succ, rel.source, rel.target);
      addToSet(idx.pred, rel.target, rel.source);
      addToSet(idx.relKindIndex, rel.kind, rel.id);
    }

    // Containment tree: group → members + nested groups; container back-links.
    for (const group of groups.values()) {
      const kids: string[] = [];
      for (const memberId of group.memberIds) {
        kids.push(memberId);
        idx.parent.set(memberId, group.id);
      }
      for (const childGroupId of group.childGroupIds) {
        kids.push(childGroupId);
        idx.parent.set(childGroupId, group.id);
      }
      if (kids.length > 0) idx.children.set(group.id, kids);
    }

    return idx;
  }

  // ---- Adjacency ----
  outgoing(entityId: string): readonly string[] {
    return this.outRels.get(entityId) ?? EMPTY;
  }
  incoming(entityId: string): readonly string[] {
    return this.inRels.get(entityId) ?? EMPTY;
  }
  successors(entityId: string): readonly string[] {
    const set = this.succ.get(entityId);
    return set ? [...set] : EMPTY;
  }
  predecessors(entityId: string): readonly string[] {
    const set = this.pred.get(entityId);
    return set ? [...set] : EMPTY;
  }
  neighbors(entityId: string): readonly string[] {
    const s = this.succ.get(entityId);
    const p = this.pred.get(entityId);
    if (!s && !p) return EMPTY;
    const out = new Set<string>();
    if (s) for (const id of s) out.add(id);
    if (p) for (const id of p) out.add(id);
    out.delete(entityId);
    return [...out];
  }
  degree(entityId: string): number {
    return (this.outRels.get(entityId)?.length ?? 0) + (this.inRels.get(entityId)?.length ?? 0);
  }

  // ---- Containment ----
  childrenOf(parentId: string): readonly string[] {
    return this.children.get(parentId) ?? EMPTY;
  }
  parentOf(childId: string): string | undefined {
    return this.parent.get(childId);
  }

  // ---- Secondary indexes ----
  byKind(kind: string): readonly string[] {
    const set = this.kindIndex.get(kind);
    return set ? [...set] : EMPTY;
  }
  byLabel(label: string): readonly string[] {
    const set = this.labelIndex.get(normLabel(label));
    return set ? [...set] : EMPTY;
  }
  byTag(tag: string): readonly string[] {
    const set = this.tagIndex.get(tag);
    return set ? [...set] : EMPTY;
  }
  byGroup(groupId: string): readonly string[] {
    const set = this.groupIndex.get(groupId);
    return set ? [...set] : EMPTY;
  }
  relationshipsByKind(kind: string): readonly string[] {
    const set = this.relKindIndex.get(kind);
    return set ? [...set] : EMPTY;
  }
  kinds(): ReadonlyMap<string, number> {
    return this.kindCounts;
  }
  tags(): ReadonlyMap<string, number> {
    return this.tagCounts;
  }
}
