/**
 * Validation — integrity checks over the fused PIM.
 *
 * Catches the problems the spec lists: broken references (dangling relations),
 * missing evidence, and inconsistent topology. (Duplicate ids are impossible — the
 * store is a Map; conflicting entities are surfaced separately as {@link Conflict}s.)
 * Pure and O(N).
 */

import type { ProjectIntelligenceModel } from './pim/ProjectIntelligenceModel';

export type PimIssueSeverity = 'error' | 'warning';

export interface PimValidationIssue {
  readonly code: string;
  readonly severity: PimIssueSeverity;
  readonly message: string;
  readonly entityId?: string;
  readonly relationId?: string;
}

export interface PimValidationReport {
  readonly ok: boolean;
  readonly errors: readonly PimValidationIssue[];
  readonly warnings: readonly PimValidationIssue[];
  readonly issues: readonly PimValidationIssue[];
}

export function validatePim(pim: ProjectIntelligenceModel): PimValidationReport {
  const issues: PimValidationIssue[] = [];

  for (const r of pim.relations()) {
    if (!pim.getEntity(r.source)) issues.push({ code: 'broken-reference', severity: 'error', relationId: r.id, message: `Relation "${r.id}" has a missing source.` });
    if (!pim.getEntity(r.target)) issues.push({ code: 'broken-reference', severity: 'error', relationId: r.id, message: `Relation "${r.id}" has a missing target.` });
  }
  for (const e of pim.entities()) {
    if (!e.name) issues.push({ code: 'corrupt-entity', severity: 'error', entityId: e.id, message: 'Entity with no name.' });
    if (e.evidence.length === 0 && !e.inferred) issues.push({ code: 'missing-evidence', severity: 'warning', entityId: e.id, message: `Entity "${e.name}" has no evidence.` });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}
