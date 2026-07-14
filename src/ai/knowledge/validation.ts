/**
 * Validation — integrity checks over structured documents and the PKM.
 *
 * Catches the problems the spec lists: broken references, duplicate ids, missing
 * metadata, malformed documents, invalid hierarchy, and (for the PKM) dangling
 * relations. Pure and O(N); a future ingestion guard can refuse to ingest a
 * corrupt document rather than poison the knowledge model.
 */

import type { StructuredDocument } from './documents/StructuredDocument';
import { isSection } from './documents/StructuredDocument';
import type { ProjectKnowledgeModel } from './pkm/ProjectKnowledgeModel';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly nodeId?: string;
  readonly entityId?: string;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
  readonly issues: readonly ValidationIssue[];
}

function report(issues: ValidationIssue[]): ValidationReport {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}

/** Validate a parsed document's structure. */
export function validateDocument(doc: StructuredDocument): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!doc.id) issues.push({ code: 'missing-id', severity: 'error', message: 'Document has no id.' });
  if (!doc.title) issues.push({ code: 'missing-title', severity: 'warning', message: 'Document has no title.' });
  if (doc.nodes.size === 0) issues.push({ code: 'empty-document', severity: 'warning', message: 'Document has no content.' });

  // Node integrity: unique ids (Map guarantees), valid parent links, valid children.
  for (const node of doc.nodes.values()) {
    if (node.parentId && !doc.nodes.has(node.parentId)) {
      issues.push({ code: 'broken-parent', severity: 'error', nodeId: node.id, message: `Node "${node.id}" references missing parent "${node.parentId}".` });
    }
    if (isSection(node)) {
      for (const childId of node.childIds) {
        if (!doc.nodes.has(childId)) issues.push({ code: 'broken-child', severity: 'error', nodeId: node.id, message: `Section "${node.heading}" references missing child "${childId}".` });
      }
      if (node.level < 1 || node.level > 6) issues.push({ code: 'invalid-hierarchy', severity: 'warning', nodeId: node.id, message: `Heading "${node.heading}" has invalid level ${node.level}.` });
    }
  }

  // Broken internal references (cross-refs to non-existent section slugs).
  const slugs = new Set(doc.outline.map((o) => o.slug));
  for (const ref of doc.references) {
    if (ref.kind === 'crossref' && ref.target.startsWith('#')) {
      const slug = ref.target.slice(1);
      if (slug && !slugs.has(slug)) issues.push({ code: 'broken-reference', severity: 'warning', nodeId: ref.nodeId, message: `Cross-reference "${ref.target}" has no matching section.` });
    }
  }

  return report(issues);
}

/** Validate PKM integrity (dangling relations, empty evidence). */
export function validatePkm(pkm: ProjectKnowledgeModel): ValidationReport {
  const issues: ValidationIssue[] = [];
  for (const r of pkm.relations()) {
    if (!pkm.getEntity(r.source)) issues.push({ code: 'dangling-relation', severity: 'error', entityId: r.source, message: `Relation "${r.id}" has missing source.` });
    if (!pkm.getEntity(r.target)) issues.push({ code: 'dangling-relation', severity: 'error', entityId: r.target, message: `Relation "${r.id}" has missing target.` });
  }
  for (const e of pkm.entities()) {
    if (e.sources.length === 0) issues.push({ code: 'no-evidence', severity: 'warning', entityId: e.id, message: `Entity "${e.name}" has no evidence.` });
  }
  return report(issues);
}
