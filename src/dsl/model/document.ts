/**
 * The DiagramDocument — the single root object and source of truth.
 *
 * Everything belongs inside this object. Entity collections are **normalized
 * maps** keyed by id (not arrays): O(1) lookup, structurally-unique ids, and
 * clean id-addressed patching/diffing for AI modules. Iteration order for
 * rendering is derived from the per-node `z` field, not map order.
 *
 * The document is plain, fully JSON-serializable, immutable data — it *is* the
 * serialization format. `schemaVersion` is the format version that drives
 * migration (distinct from each entity's `revision`).
 */

import type { DocumentId } from '../primitives/ids';
import type { Timestamp, Clock } from '../primitives/scalars';
import type { Metadata } from '../core/metadata';
import { EMPTY_METADATA } from '../core/metadata';
import type { DiagramNode } from './node';
import type { DiagramEdge } from './edge';
import type { DiagramGroup } from './group';
import type { Layer } from './layer';
import type { StyleTable } from './style';
import type { DiagramTag } from './tag';
import type { Annotation } from './annotation';
import type { DiagramComment } from './comment';
import type { Viewport } from './viewport';
import { DEFAULT_VIEWPORT } from './viewport';

/** A normalized, id-keyed collection of entities. */
export type EntityMap<T> = Readonly<Record<string, T>>;

export interface DiagramDocument {
  /** Format version (semver) — drives migration. See CURRENT_SCHEMA_VERSION. */
  readonly schemaVersion: string;
  readonly id: DocumentId;
  readonly name?: string;
  readonly metadata: Metadata;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly viewport: Viewport;
  readonly nodes: EntityMap<DiagramNode>;
  readonly edges: EntityMap<DiagramEdge>;
  readonly groups: EntityMap<DiagramGroup>;
  readonly layers: EntityMap<Layer>;
  readonly styles: StyleTable;
  readonly tags: EntityMap<DiagramTag>;
  readonly annotations: EntityMap<Annotation>;
  readonly comments: EntityMap<DiagramComment>;
}

/**
 * The names of every entity collection on the document. Used by validation,
 * diff, and serialization to iterate collections generically — add a collection
 * once here and those systems pick it up.
 */
export const ENTITY_COLLECTIONS = [
  'nodes',
  'edges',
  'groups',
  'layers',
  'styles',
  'tags',
  'annotations',
  'comments',
] as const;

export type EntityCollectionName = (typeof ENTITY_COLLECTIONS)[number];

export interface CreateDocumentOptions {
  readonly id: DocumentId;
  readonly name?: string;
  readonly schemaVersion: string;
  readonly clock: Clock;
  readonly viewport?: Viewport;
  readonly metadata?: Metadata;
}

/** Build an empty document with all collections initialized. */
export function createEmptyDocument(options: CreateDocumentOptions): DiagramDocument {
  const now = options.clock.now();
  return {
    schemaVersion: options.schemaVersion,
    id: options.id,
    name: options.name,
    metadata: options.metadata ?? EMPTY_METADATA,
    createdAt: now,
    updatedAt: now,
    viewport: options.viewport ?? DEFAULT_VIEWPORT,
    nodes: {},
    edges: {},
    groups: {},
    layers: {},
    styles: {},
    tags: {},
    annotations: {},
    comments: {},
  };
}
