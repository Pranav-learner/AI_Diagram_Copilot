/**
 * The default extractor set — the deterministic knowledge-extraction pipeline.
 *
 * New extractors are dropped in here; the engine runs them all and the PKM merges
 * their output. An extractor that throws is isolated by the engine, not fatal.
 */

import type { Extractor, ExtractionResult } from './types';
import { entityExtractor } from './EntityExtractor';
import { relationshipExtractor } from './RelationshipExtractor';
import { requirementExtractor } from './RequirementExtractor';
import { decisionExtractor } from './DecisionExtractor';
import { statementExtractor } from './StatementExtractor';

export * from './types';
export { entityExtractor } from './EntityExtractor';
export { relationshipExtractor } from './RelationshipExtractor';
export { requirementExtractor } from './RequirementExtractor';
export { decisionExtractor } from './DecisionExtractor';
export { statementExtractor } from './StatementExtractor';

/** Every shipped extractor, in a stable order. */
export const DEFAULT_EXTRACTORS: readonly Extractor[] = [
  entityExtractor,
  requirementExtractor,
  decisionExtractor,
  statementExtractor,
  relationshipExtractor,
];

/** Merge multiple extraction results into one. */
export function mergeResults(results: readonly ExtractionResult[]): ExtractionResult {
  return {
    entities: results.flatMap((r) => r.entities),
    relations: results.flatMap((r) => r.relations),
  };
}
