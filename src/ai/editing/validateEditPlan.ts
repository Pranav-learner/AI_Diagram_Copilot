/**
 * Semantic validation of an EditPlan — beyond the zod schema.
 *
 * Two layers. {@link validateEditPlan} runs *before* reference resolution and
 * catches structural problems the plan carries on its own: duplicate new-node
 * refs, references to a `new` node that was never added, and self-connections.
 * {@link detectConflicts} runs *after* compilation on the preview and catches
 * cross-edit conflicts — e.g. renaming a node the same plan also deletes.
 *
 * Unknown/ambiguous references are handled during compilation (as issues /
 * clarifications), not here. Errors from either layer reject the plan.
 */

import type { EditOp, EditPlan, ElementReference } from './model/EditPlan';
import { referenceKey } from './model/EditPlan';
import type { EditPreview } from './preview';
import type { EditIssue } from './clarification';
import { editError, editWarning } from './clarification';

export interface EditValidationResult {
  readonly ok: boolean;
  readonly errors: readonly EditIssue[];
  readonly warnings: readonly EditIssue[];
}

export function validateEditPlan(plan: EditPlan): EditValidationResult {
  const errors: EditIssue[] = [];
  const warnings: EditIssue[] = [];

  // Collect the local refs of nodes this plan creates.
  const addedRefs = new Set<string>();
  plan.edits.forEach((edit, i) => {
    if (edit.op === 'add_node') {
      if (addedRefs.has(edit.ref)) errors.push(editError('duplicate_ref', `Duplicate new-node ref "${edit.ref}"`, i));
      addedRefs.add(edit.ref);
    }
  });

  // Every `new` reference must point at a node the plan actually adds.
  plan.edits.forEach((edit, i) => {
    for (const ref of referencesOf(edit)) {
      if (ref.by === 'new' && !addedRefs.has(ref.ref)) {
        errors.push(editError('dangling_new_ref', `Edit references new node "${ref.ref}" which is never added`, i));
      }
    }
    // A self-connection is almost always a mistake.
    if ((edit.op === 'connect' || edit.op === 'disconnect') && refKey(edit.source) === refKey(edit.target)) {
      warnings.push(editWarning('self_connection', 'Source and target of a connection are the same', i));
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Cross-edit conflicts, detected on the compiled preview (where references are
 * already resolved to ids): a node removed by one change and touched by another.
 */
export function detectConflicts(preview: EditPreview): EditIssue[] {
  const removed = new Set<string>();
  for (const change of preview.changes) if (change.kind === 'remove') for (const id of change.targetIds) removed.add(id);

  const conflicts: EditIssue[] = [];
  preview.changes.forEach((change, i) => {
    if (change.kind === 'remove') return;
    for (const id of change.targetIds) {
      if (removed.has(id)) {
        conflicts.push(editWarning('conflicting_edit', `"${change.summary}" targets a node the plan also deletes`, i));
        break;
      }
    }
  });
  return conflicts;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Every element reference an edit contains (targets, sources, anchors). */
function referencesOf(edit: EditOp): ElementReference[] {
  switch (edit.op) {
    case 'add_node':
      return edit.near ? [edit.near] : [];
    case 'remove_node':
    case 'rename_node':
    case 'resize_node':
    case 'ungroup':
    case 'reorder':
    case 'update_metadata':
      return [edit.target];
    case 'move_node':
      return edit.to.relativeTo ? [edit.target, edit.to.relativeTo] : [edit.target];
    case 'connect':
    case 'disconnect':
      return [edit.source, edit.target];
    case 'update_style':
    case 'group':
      return [...edit.targets];
  }
}

const refKey = referenceKey;
