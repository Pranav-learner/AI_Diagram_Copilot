/**
 * KnowledgeEntity — a node in the Project Knowledge Model.
 *
 * An entity is a piece of *meaning* extracted from documents: a concept, system,
 * actor, requirement, decision, risk, etc. It is fully traceable — every entity
 * records the evidence (document + node + excerpt) it was derived from and a
 * confidence. Entities are merged across documents by normalised name/alias, so the
 * PKM is a connected, deduplicated knowledge graph rather than a per-document dump.
 */

import type { KnowledgeCategory } from '../documents/DocumentClassifier';
import { slug } from '../util';

/**
 * The kind of knowledge an entity represents. Open (`string & {}`) so new kinds
 * extend without an enum edit.
 */
export type EntityKind =
  // Things the system is made of
  | 'concept'
  | 'system'
  | 'component'
  | 'service'
  | 'api'
  | 'database'
  | 'actor'
  | 'process'
  // Statements about the system
  | 'requirement'
  | 'responsibility'
  | 'decision'
  | 'goal'
  | 'risk'
  | 'constraint'
  | 'assumption'
  | (string & {});

/** A pointer back to the exact place an entity/relation was extracted from. */
export interface EvidenceRef {
  readonly documentId: string;
  readonly nodeId: string;
  readonly sectionId?: string;
  /** A short quotation of the supporting text. */
  readonly excerpt: string;
  readonly line?: number;
}

export interface KnowledgeEntity {
  /** Stable id `${kind}:${slug(name)}` — the merge key across documents. */
  readonly id: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly category: KnowledgeCategory;
  /** Alternative surface forms merged into this entity. */
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly description?: string;
  readonly confidence: number;
  /** Total mentions across all sources (frequency signal). */
  readonly mentions: number;
  readonly sources: readonly EvidenceRef[];
  /** Distinct origin documents (fast "which docs mention this"). */
  readonly documentIds: readonly string[];
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

/** The canonical id for an entity of a given kind + name. */
export function entityId(kind: EntityKind, name: string): string {
  return `${kind}:${slug(name) || 'unnamed'}`;
}

/** Statement-like kinds (extracted as prose, not named things). */
export const STATEMENT_KINDS: ReadonlySet<string> = new Set(['requirement', 'responsibility', 'decision', 'goal', 'risk', 'constraint', 'assumption']);

/** Named-thing kinds (participate in relationships). */
export const NAMED_KINDS: ReadonlySet<string> = new Set(['concept', 'system', 'component', 'service', 'api', 'database', 'actor', 'process']);
