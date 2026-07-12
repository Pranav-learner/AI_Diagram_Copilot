/**
 * Semantic validation of a DiagramPlan — beyond what the schema can express.
 *
 * The zod schema guarantees *shape*; this guarantees *coherence*: no duplicate
 * ids, no relationships/groups/annotations pointing at nonexistent nodes, a
 * recognized diagram type, and a non-empty diagram. Errors reject the plan
 * before execution (so a bad plan never touches the runtime); warnings are
 * surfaced but non-fatal. This is the "reject invalid plans before execution"
 * gate — the last line of defense before the ExecutionPlanner.
 */

import type { DiagramPlan } from '../model/DiagramPlan';
import type { DiagramTypeRegistry } from '../model/DiagramType';
import { defaultDiagramTypeRegistry } from '../model/DiagramType';

export type PlanIssueSeverity = 'error' | 'warning';

export interface PlanIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: PlanIssueSeverity;
  readonly path?: string;
}

export interface PlanValidationResult {
  readonly ok: boolean;
  readonly errors: readonly PlanIssue[];
  readonly warnings: readonly PlanIssue[];
}

export interface ValidatePlanOptions {
  readonly typeRegistry?: DiagramTypeRegistry;
  /** Diagram types where node-only diagrams are legitimate (no edges required). */
  readonly connectionOptionalTypes?: readonly string[];
}

const DEFAULT_CONNECTION_OPTIONAL = ['timeline', 'sequence'];

export function validatePlan(plan: DiagramPlan, options: ValidatePlanOptions = {}): PlanValidationResult {
  const registry = options.typeRegistry ?? defaultDiagramTypeRegistry;
  const errors: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];
  const err = (code: string, message: string, path?: string) => errors.push({ code, message, severity: 'error', path });
  const warn = (code: string, message: string, path?: string) => warnings.push({ code, message, severity: 'warning', path });

  // Diagram type.
  if (!registry.has(plan.diagramType)) {
    err('invalid_diagram_type', `Unknown diagram type "${plan.diagramType}"`, 'diagramType');
  }

  // Nodes: non-empty + unique ids.
  if (plan.nodes.length === 0) {
    err('empty_diagram', 'A diagram must contain at least one node', 'nodes');
  }
  const nodeIds = new Set<string>();
  plan.nodes.forEach((node, i) => {
    if (nodeIds.has(node.id)) err('duplicate_node', `Duplicate node id "${node.id}"`, `nodes.${i}.id`);
    nodeIds.add(node.id);
  });

  // Parent references (checked against the full id set, since a parent may appear later).
  plan.nodes.forEach((node, i) => {
    if (node.parent && !nodeIds.has(node.parent)) {
      warn('unknown_parent', `Node "${node.id}" references unknown parent "${node.parent}"`, `nodes.${i}.parent`);
    }
    if (node.parent === node.id) {
      warn('self_parent', `Node "${node.id}" is its own parent`, `nodes.${i}.parent`);
    }
  });

  // Relationships: endpoints must exist.
  plan.relationships.forEach((rel, i) => {
    if (!nodeIds.has(rel.source)) {
      err('dangling_relationship', `Relationship references unknown source "${rel.source}"`, `relationships.${i}.source`);
    }
    if (!nodeIds.has(rel.target)) {
      err('dangling_relationship', `Relationship references unknown target "${rel.target}"`, `relationships.${i}.target`);
    }
    if (rel.source === rel.target) {
      warn('self_relationship', `Relationship from "${rel.source}" to itself`, `relationships.${i}`);
    }
  });

  // Groups: unique ids + members must exist.
  const groupIds = new Set<string>();
  (plan.groups ?? []).forEach((group, i) => {
    if (groupIds.has(group.id)) err('duplicate_group', `Duplicate group id "${group.id}"`, `groups.${i}.id`);
    groupIds.add(group.id);
    for (const member of group.nodeIds) {
      if (!nodeIds.has(member)) {
        err('invalid_group_member', `Group "${group.id}" references unknown node "${member}"`, `groups.${i}`);
      }
    }
  });

  // Annotations: target (if present) must exist.
  (plan.annotations ?? []).forEach((annotation, i) => {
    if (annotation.target && !nodeIds.has(annotation.target)) {
      warn('unknown_annotation_target', `Annotation targets unknown node "${annotation.target}"`, `annotations.${i}.target`);
    }
  });

  // Missing relationships: a multi-node diagram with no connectivity is suspicious
  // (except inherently linear/ordered types).
  const connectionOptional = new Set(options.connectionOptionalTypes ?? DEFAULT_CONNECTION_OPTIONAL);
  const hasConnectivity =
    plan.relationships.length > 0 ||
    plan.nodes.some((n) => n.parent) ||
    (plan.groups?.length ?? 0) > 0;
  if (!hasConnectivity && plan.nodes.length > 1 && !connectionOptional.has(plan.diagramType)) {
    warn('no_relationships', 'Diagram has multiple nodes but no relationships or hierarchy');
  }

  return { ok: errors.length === 0, errors, warnings };
}
