/**
 * Shared operation validators — reusable precondition checks operations compose.
 *
 * Each returns `OperationIssue[]` (empty = ok). This is where "cannot connect a
 * missing node", "cannot move a locked object", "no circular parent hierarchy",
 * etc. live, so individual operations stay tiny.
 */

import type { DiagramDocument } from '@/dsl';
import type { OperationIssue } from '../../operations/Operation';
import { opIssue } from '../../operations/Operation';

export const OpCode = {
  NotFound: 'op.notFound',
  Locked: 'op.locked',
  DuplicateId: 'op.duplicateId',
  MissingReference: 'op.missingReference',
  Circular: 'op.circular',
  Invalid: 'op.invalid',
} as const;

export function nodeMustExist(doc: DiagramDocument, id: string): OperationIssue[] {
  return id in doc.nodes ? [] : [opIssue(OpCode.NotFound, `Node "${id}" does not exist`, id)];
}

export function edgeMustExist(doc: DiagramDocument, id: string): OperationIssue[] {
  return id in doc.edges ? [] : [opIssue(OpCode.NotFound, `Edge "${id}" does not exist`, id)];
}

export function groupMustExist(doc: DiagramDocument, id: string): OperationIssue[] {
  return id in doc.groups ? [] : [opIssue(OpCode.NotFound, `Group "${id}" does not exist`, id)];
}

/** A node or group must exist (group children may be either). */
export function childMustExist(doc: DiagramDocument, id: string): OperationIssue[] {
  return id in doc.nodes || id in doc.groups
    ? []
    : [opIssue(OpCode.NotFound, `Entity "${id}" does not exist`, id)];
}

export function nodeNotLocked(doc: DiagramDocument, id: string): OperationIssue[] {
  return doc.nodes[id]?.locked
    ? [opIssue(OpCode.Locked, `Node "${id}" is locked`, id)]
    : [];
}

/** The id must be free across every collection (no duplicate ids). */
export function idMustBeFree(doc: DiagramDocument, id: string): OperationIssue[] {
  const taken =
    id in doc.nodes ||
    id in doc.edges ||
    id in doc.groups ||
    id in doc.layers ||
    id in doc.styles ||
    id in doc.tags ||
    id in doc.annotations ||
    id in doc.comments;
  return taken ? [opIssue(OpCode.DuplicateId, `Id "${id}" already exists`, id)] : [];
}

/**
 * Adding `childId` (a group) under `groupId` must not create a cycle: the parent
 * must not already be reachable as a descendant of the child.
 */
export function noCircularGroup(
  doc: DiagramDocument,
  groupId: string,
  childId: string,
): OperationIssue[] {
  if (childId === groupId) {
    return [opIssue(OpCode.Circular, `A group cannot contain itself ("${groupId}")`, groupId)];
  }
  // Only groups can nest; a node child can't create a cycle.
  if (!(childId in doc.groups)) return [];
  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === groupId) {
      return [opIssue(OpCode.Circular, `Adding "${childId}" to "${groupId}" creates a cycle`, groupId)];
    }
    if (seen.has(current)) continue;
    seen.add(current);
    const group = doc.groups[current];
    if (group) for (const c of group.childIds) if (c in doc.groups) stack.push(c);
  }
  return [];
}
