/**
 * KnowledgeRelation — a directed, evidence-backed edge in the PKM.
 *
 * Relations connect two {@link KnowledgeEntity}s ("Auth Service" dependsOn
 * "Database") and, like entities, are traceable to the sentences that implied them
 * and carry a confidence. Repeated statements of the same relation are merged
 * (mentions accumulate), so the knowledge graph strengthens as more documents
 * corroborate it.
 */

import type { EvidenceRef } from './KnowledgeEntity';

/** The kind of relationship. Open (`string & {}`) for extensibility. */
export type RelationKind =
  | 'dependsOn'
  | 'uses'
  | 'calls'
  | 'contains'
  | 'partOf'
  | 'references'
  | 'produces'
  | 'consumes'
  | 'owns'
  | 'implements'
  | 'triggers'
  | 'relatedTo'
  | (string & {});

export interface KnowledgeRelation {
  /** Stable id `${source}|${kind}|${target}` — the merge key. */
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: RelationKind;
  readonly confidence: number;
  readonly mentions: number;
  readonly sources: readonly EvidenceRef[];
  /** The sentences/phrases that implied the relation. */
  readonly evidence: readonly string[];
}

export function relationId(source: string, kind: RelationKind, target: string): string {
  return `${source}|${kind}|${target}`;
}
