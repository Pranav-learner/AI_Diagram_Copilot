/**
 * Cross-Reference Engine — bidirectional navigation across artifact types.
 *
 * For any entity it groups the fused evidence by source kind (documentation / code /
 * infrastructure / database / api / diagram), so a consumer can jump from a concept
 * to its docs, its implementation, its deployment, or its diagram. The reverse index
 * answers "which entities does this artifact mention?". This is the connective tissue
 * the spec asks for (documentation ↔ code ↔ infrastructure ↔ database ↔ diagram).
 */

import type { Evidence, PimEntity, ProjectIntelligenceModel, SourceKind } from './pim/ProjectIntelligenceModel';

export interface CrossReference {
  readonly entity: PimEntity;
  /** Evidence grouped by the artifact kind it came from. */
  readonly bySourceKind: Readonly<Record<string, readonly Evidence[]>>;
  /** Distinct source artifacts (documents/files) referencing this entity. */
  readonly sources: readonly string[];
  /** Directly-related entities (graph neighbours). */
  readonly related: readonly PimEntity[];
}

export function crossReferences(pim: ProjectIntelligenceModel, entityId: string): CrossReference | undefined {
  const entity = pim.getEntity(entityId);
  if (!entity) return undefined;

  const bySourceKind: Record<string, Evidence[]> = {};
  const sources = new Set<string>();
  for (const ev of entity.evidence) {
    (bySourceKind[ev.origin] ??= []).push(ev);
    sources.add(ev.source);
  }

  const related = new Map<string, PimEntity>();
  for (const r of [...pim.outgoing(entityId), ...pim.incoming(entityId)]) {
    const otherId = r.source === entityId ? r.target : r.source;
    const other = pim.getEntity(otherId);
    if (other) related.set(otherId, other);
  }

  return { entity, bySourceKind, sources: [...sources], related: [...related.values()] };
}

/** Reverse index: source artifact → the entities that cite it. */
export function buildReverseIndex(pim: ProjectIntelligenceModel): Map<string, PimEntity[]> {
  const index = new Map<string, PimEntity[]>();
  for (const e of pim.entities()) {
    for (const source of new Set(e.evidence.map((ev) => ev.source))) {
      const bucket = index.get(source);
      if (bucket) bucket.push(e);
      else index.set(source, [e]);
    }
  }
  return index;
}

/** Entities whose evidence includes a given artifact (document/file). */
export function entitiesForSource(pim: ProjectIntelligenceModel, source: string): PimEntity[] {
  return pim.entities().filter((e) => e.evidence.some((ev) => ev.source === source));
}

/** Evidence of a given source kind for an entity (e.g. its documentation / deployment). */
export function evidenceOfKind(entity: PimEntity, kind: SourceKind): Evidence[] {
  return entity.evidence.filter((ev) => ev.origin === kind);
}
