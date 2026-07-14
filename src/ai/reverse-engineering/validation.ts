/**
 * Validation — integrity checks over parse results and the Code Knowledge Graph.
 *
 * Catches the problems the spec lists: parser failures, broken (dangling) relations,
 * missing source references, and recovered/unsupported constructs (surfaced as
 * warnings). Pure and O(N).
 */

import type { NormalizedAST } from './ast/NormalizedAST';
import { astToUIR } from './uir/UIR';
import type { UIRDocument } from './uir/UIR';
import type { CodeKnowledgeGraph } from './graph/CodeKnowledgeGraph';

export type RepoIssueSeverity = 'error' | 'warning';

export interface RepoValidationIssue {
  readonly code: string;
  readonly severity: RepoIssueSeverity;
  readonly message: string;
  readonly file?: string;
  readonly entityId?: string;
}

export interface RepoValidationReport {
  readonly ok: boolean;
  readonly errors: readonly RepoValidationIssue[];
  readonly warnings: readonly RepoValidationIssue[];
  readonly issues: readonly RepoValidationIssue[];
}

export interface ValidationInput {
  readonly uirDocs?: readonly UIRDocument[];
  readonly asts?: readonly NormalizedAST[];
  readonly parseErrors: ReadonlyMap<string, readonly string[]>;
  readonly graph: CodeKnowledgeGraph;
}

export function validateRepository(input: ValidationInput): RepoValidationReport {
  const issues: RepoValidationIssue[] = [];

  for (const [file, errors] of input.parseErrors) {
    for (const message of errors) issues.push({ code: 'parser-failure', severity: 'error', file, message });
  }
  const docs = input.uirDocs ?? input.asts?.map(astToUIR) ?? [];
  for (const doc of docs) {
    for (const message of doc.warnings) issues.push({ code: 'parse-warning', severity: 'warning', file: doc.file, message });
  }
  for (const r of input.graph.relations()) {
    if (!input.graph.hasEntity(r.source)) issues.push({ code: 'dangling-relation', severity: 'error', entityId: r.source, message: `Relation "${r.id}" has a missing source.` });
    if (!input.graph.hasEntity(r.target)) issues.push({ code: 'dangling-relation', severity: 'error', entityId: r.target, message: `Relation "${r.id}" has a missing target.` });
  }
  for (const e of input.graph.entities()) {
    if (!e.name) issues.push({ code: 'corrupt-entity', severity: 'error', entityId: e.id, message: 'Entity with no name.' });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}
