/**
 * SemanticGraph — the Intermediate Representation (IR) of a diagram.
 *
 * This is the single source of truth all AI *understanding* consumes. It is an
 * immutable snapshot: entities, relationships, and groups keyed by id, plus a
 * precomputed {@link GraphIndex} (adjacency + secondary indexes + containment
 * tree) so queries and analysis are O(1)/O(degree) rather than O(N) scans.
 *
 * Immutability is by contract — incremental updates produce a *new* graph that
 * structurally shares unchanged entities/relationships with the previous one, so
 * caches can be invalidated by identity and version rather than deep comparison.
 */

import type { SemanticEntity } from './entity';
import type { SemanticRelationship } from './relationship';
import type { SemanticGroup } from './group';

/** Read surface of the precomputed index. Implemented by `GraphIndex` (build/). */
export interface GraphIndex {
  // ---- Adjacency (relationship graph) ----
  /** Relationship ids leaving `entityId` (source === entityId). */
  outgoing(entityId: string): readonly string[];
  /** Relationship ids entering `entityId` (target === entityId). */
  incoming(entityId: string): readonly string[];
  /** Distinct neighbour entity ids (both directions), excluding self. */
  neighbors(entityId: string): readonly string[];
  /** Neighbour entity ids reachable by following outgoing relationships. */
  successors(entityId: string): readonly string[];
  /** Neighbour entity ids reachable by following incoming relationships. */
  predecessors(entityId: string): readonly string[];
  /** Total degree (in + out) of an entity. */
  degree(entityId: string): number;

  // ---- Containment (hierarchy tree) ----
  /** Direct child ids (entities and groups) contained by a group or container. */
  childrenOf(parentId: string): readonly string[];
  /** Immediate containment parent id of an entity/group, if any. */
  parentOf(childId: string): string | undefined;

  // ---- Secondary indexes ----
  /** Entity ids of a given kind. */
  byKind(kind: string): readonly string[];
  /** Entity ids whose normalised label exactly equals `label`. */
  byLabel(label: string): readonly string[];
  /** Entity ids carrying a given tag label. */
  byTag(tag: string): readonly string[];
  /** Entity ids directly belonging to a group. */
  byGroup(groupId: string): readonly string[];
  /** Relationship ids of a given kind. */
  relationshipsByKind(kind: string): readonly string[];

  /** All distinct entity kinds present, with counts. */
  kinds(): ReadonlyMap<string, number>;
  /** All distinct tags present, with counts. */
  tags(): ReadonlyMap<string, number>;
}

/** Aggregate metrics computed once at build time. */
export interface GraphStats {
  readonly entityCount: number;
  readonly relationshipCount: number;
  readonly groupCount: number;
  /** Number of weakly-connected components in the relationship graph. */
  readonly componentCount: number;
  /** Entity ids with no relationships at all. */
  readonly isolatedCount: number;
  /** Highest total degree observed, with the entity id that owns it. */
  readonly maxDegree: number;
  readonly densestEntityId?: string;
  /** True when the relationship graph contains at least one directed cycle. */
  readonly hasCycles: boolean;
}

export interface SemanticGraph {
  /** DSL document id this graph reflects. */
  readonly documentId: string;
  /** Runtime version the graph was built/updated from (monotonic). */
  readonly version: number;
  readonly entities: ReadonlyMap<string, SemanticEntity>;
  readonly relationships: ReadonlyMap<string, SemanticRelationship>;
  readonly groups: ReadonlyMap<string, SemanticGroup>;
  readonly index: GraphIndex;
  readonly stats: GraphStats;
}
