/**
 * SemanticRelationship — a renderer-independent directed edge in the IR.
 *
 * DSL edges carry no first-class semantic type; meaning is expressed via
 * `edge.metadata.relType` (written by the generation pipeline) and arrowheads.
 * This module normalises those into a canonical, extensible {@link RelationshipKind}
 * so downstream AI reasoning speaks one vocabulary ("A dependsOn B") regardless of
 * how the edge was authored.
 */

import type { MetadataValue } from '@/dsl';

/**
 * Canonical relationship vocabulary. Open-ended (`(string & {})`) so future
 * domains can introduce kinds without touching the engine. The classifier maps
 * DSL `relType` hints (`flow`, `dependency`, `message`, …) onto these.
 */
export type RelationshipKind =
  | 'dependsOn'
  | 'connectsTo'
  | 'calls'
  | 'contains'
  | 'owns'
  | 'produces'
  | 'consumes'
  | 'references'
  | 'triggers'
  | 'uses'
  | 'flowsTo'
  | 'sends'
  | 'inherits'
  | 'composedOf'
  | 'aggregates'
  | 'associatedWith'
  | 'transitionsTo'
  | 'unknown'
  | (string & {});

export interface SemanticRelationship {
  /** Identity — equals the DSL edge id. */
  readonly id: string;
  /** Classified semantic kind. */
  readonly kind: RelationshipKind;
  /** Source entity id (DSL `edge.source.nodeId`). */
  readonly source: string;
  /** Target entity id (DSL `edge.target.nodeId`). */
  readonly target: string;
  /** Edge label, if any. */
  readonly label?: string;
  /** True when the edge is directed (has a non-`none` arrowhead). */
  readonly directed: boolean;
  /** Resolved tag labels. */
  readonly tags: readonly string[];
  /** Port the edge attaches to at the source, if specified. */
  readonly sourcePort?: string;
  /** Port the edge attaches to at the target, if specified. */
  readonly targetPort?: string;
  /** Domain attributes — metadata minus internal keys. */
  readonly attributes: Readonly<Record<string, MetadataValue>>;
  /** True when the kind was inferred rather than explicit in the DSL. */
  readonly inferred: boolean;
}

/** Kinds whose *reverse* reading names the inverse dependency (A→B ⇒ B is upstream). */
export const DEPENDENCY_KINDS: ReadonlySet<string> = new Set([
  'dependsOn',
  'uses',
  'calls',
  'consumes',
  'references',
]);

/** Kinds that express strict containment/ownership (used for hierarchy checks). */
export const CONTAINMENT_KINDS: ReadonlySet<string> = new Set(['contains', 'owns', 'composedOf']);
