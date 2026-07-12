/**
 * The shared identity/versioning envelope every entity extends.
 *
 * `EntityBase` is generic over its id brand, so `DiagramNode extends
 * EntityBase<NodeId>` gets a strongly-typed `id: NodeId` for free while sharing
 * the audit/versioning fields. Keeping these fields in one place means new
 * cross-cutting concerns (e.g. soft-delete) are added once, not per entity.
 */

import type { Timestamp, Clock } from '../primitives/scalars';
import type { Metadata } from './metadata';
import { EMPTY_METADATA } from './metadata';

export interface EntityBase<Id extends string> {
  /** Stable, unique, branded identifier. */
  readonly id: Id;
  /**
   * Monotonic per-entity edit counter — incremented on every mutation. This is
   * the entity-level "version" (distinct from the document's `schemaVersion`,
   * which is a *format* version). Enables optimistic concurrency and change
   * detection without diffing whole entities.
   */
  readonly revision: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** Open, JSON-serializable attribute bag. See {@link Metadata}. */
  readonly metadata: Metadata;
}

/** Fields shared by every freshly-built entity, before its type-specific data. */
export function newEntityBase<Id extends string>(
  id: Id,
  clock: Clock,
  metadata: Metadata = EMPTY_METADATA,
): EntityBase<Id> {
  const now = clock.now();
  return { id, revision: 1, createdAt: now, updatedAt: now, metadata };
}

/**
 * Return a copy of `entity` with its `revision` bumped and `updatedAt` set.
 * Every mutating operation funnels through here so versioning is consistent.
 */
export function touch<T extends EntityBase<string>>(entity: T, clock: Clock): T {
  return { ...entity, revision: entity.revision + 1, updatedAt: clock.now() };
}
