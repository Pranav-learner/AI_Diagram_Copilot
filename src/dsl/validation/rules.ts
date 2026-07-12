/**
 * The composable validation rules.
 *
 * Each rule is a pure `(doc) => ValidationIssue[]`. `validate` runs the default
 * set, but the array is exported so callers can compose a custom subset or add
 * their own rule (Open/Closed: extend without editing existing rules). Rules
 * assume the document is *structurally* well-formed (guaranteed by the shape
 * guard in deserialization) and focus on **referential integrity**.
 */

import type { EntityMap } from '../model/document';
import { ENTITY_COLLECTIONS } from '../model/document';
import type { DiagramDocument } from '../model/document';
import type { ValidationIssue } from './codes';
import { ValidationCode, issue } from './codes';

/** A single validation check. */
export type ValidationRule = (doc: DiagramDocument) => ValidationIssue[];

interface IdEntry {
  readonly collection: string;
  readonly key: string;
  readonly id: string;
}

/** All `(collection, key, id)` triples across every entity collection. */
function idEntries(doc: DiagramDocument): IdEntry[] {
  const out: IdEntry[] = [];
  for (const collection of ENTITY_COLLECTIONS) {
    const map = doc[collection] as EntityMap<{ id: string }>;
    for (const [key, entity] of Object.entries(map)) {
      out.push({ collection, key, id: entity?.id });
    }
  }
  return out;
}

/** Each entity's `id` field must equal its map key. */
export const idKeyConsistency: ValidationRule = (doc) =>
  idEntries(doc)
    .filter((e) => e.id !== e.key)
    .map((e) =>
      issue(
        ValidationCode.IdKeyMismatch,
        `Entity keyed "${e.key}" has id "${String(e.id)}"`,
        `${e.collection}.${e.key}.id`,
        { entityId: e.key },
      ),
    );

/** No id may appear in more than one collection. */
export const uniqueIds: ValidationRule = (doc) => {
  const seen = new Map<string, string>();
  const issues: ValidationIssue[] = [];
  for (const { collection, id } of idEntries(doc)) {
    const prior = seen.get(id);
    if (prior && prior !== collection) {
      issues.push(
        issue(
          ValidationCode.DuplicateId,
          `Id "${id}" is used in both "${prior}" and "${collection}"`,
          `${collection}.${id}`,
          { entityId: id },
        ),
      );
    } else {
      seen.set(id, collection);
    }
  }
  return issues;
};

/** Both endpoints of every edge must reference an existing node. */
export const edgeEndpointsExist: ValidationRule = (doc) => {
  const issues: ValidationIssue[] = [];
  for (const [id, edge] of Object.entries(doc.edges)) {
    for (const side of ['source', 'target'] as const) {
      const nodeId = edge[side].nodeId;
      if (!(nodeId in doc.nodes)) {
        issues.push(
          issue(
            ValidationCode.DanglingEdgeEndpoint,
            `Edge "${id}" ${side} references missing node "${nodeId}"`,
            `edges.${id}.${side}`,
            { entityId: id },
          ),
        );
      }
    }
  }
  return issues;
};

/** Every group child id must resolve to an existing node or group. */
export const groupChildrenExist: ValidationRule = (doc) => {
  const issues: ValidationIssue[] = [];
  for (const [id, group] of Object.entries(doc.groups)) {
    for (const childId of group.childIds) {
      if (!(childId in doc.nodes) && !(childId in doc.groups)) {
        issues.push(
          issue(
            ValidationCode.MissingGroupChild,
            `Group "${id}" references missing child "${childId}"`,
            `groups.${id}.childIds`,
            { entityId: id },
          ),
        );
      }
    }
  }
  return issues;
};

/** Container nodes must reference existing nodes as children. */
export const containerChildrenExist: ValidationRule = (doc) => {
  const issues: ValidationIssue[] = [];
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.type !== 'container') continue;
    for (const childId of node.childIds) {
      if (!(childId in doc.nodes)) {
        issues.push(
          issue(
            ValidationCode.MissingContainerChild,
            `Container "${id}" references missing node "${childId}"`,
            `nodes.${id}.childIds`,
            { entityId: id },
          ),
        );
      }
    }
  }
  return issues;
};

/** Group nesting must be acyclic (a group cannot contain itself transitively). */
export const noCircularGroups: ValidationRule = (doc) => {
  const issues: ValidationIssue[] = [];
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const reported = new Set<string>();

  // Depth-first search; a GRAY child is a back edge, i.e. a cycle.
  const visit = (groupId: string, stack: string[]): void => {
    color.set(groupId, GRAY);
    const group = doc.groups[groupId];
    if (group) {
      for (const childId of group.childIds) {
        if (!(childId in doc.groups)) continue;
        const childColor = color.get(childId);
        if (childColor === GRAY) {
          if (!reported.has(childId)) {
            reported.add(childId);
            issues.push(
              issue(
                ValidationCode.CircularGroup,
                `Circular group nesting: ${[...stack, groupId, childId].join(' -> ')}`,
                `groups.${childId}.childIds`,
                { entityId: childId },
              ),
            );
          }
        } else if (childColor === undefined) {
          visit(childId, [...stack, groupId]);
        }
      }
    }
    color.set(groupId, BLACK);
  };

  for (const groupId of Object.keys(doc.groups)) {
    if (color.get(groupId) === undefined) visit(groupId, []);
  }
  return issues;
};

/** Helper: every entity in a map with a `styleRef`/`layerId`/`tagIds` resolves. */
function checkReferences(doc: DiagramDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const check = (
    collection: 'nodes' | 'edges',
    id: string,
    entity: { styleRef?: string; layerId?: string; tagIds?: readonly string[] },
  ): void => {
    if (entity.styleRef && !(entity.styleRef in doc.styles)) {
      issues.push(
        issue(
          ValidationCode.UnresolvedStyleRef,
          `${collection} "${id}" references missing style "${entity.styleRef}"`,
          `${collection}.${id}.styleRef`,
          { entityId: id },
        ),
      );
    }
    if (entity.layerId && !(entity.layerId in doc.layers)) {
      issues.push(
        issue(
          ValidationCode.UnresolvedLayerRef,
          `${collection} "${id}" references missing layer "${entity.layerId}"`,
          `${collection}.${id}.layerId`,
          { entityId: id },
        ),
      );
    }
    for (const tagId of entity.tagIds ?? []) {
      if (!(tagId in doc.tags)) {
        issues.push(
          issue(
            ValidationCode.UnresolvedTagRef,
            `${collection} "${id}" references missing tag "${tagId}"`,
            `${collection}.${id}.tagIds`,
            { entityId: id },
          ),
        );
      }
    }
  };

  for (const [id, node] of Object.entries(doc.nodes)) check('nodes', id, node);
  for (const [id, edge] of Object.entries(doc.edges)) check('edges', id, edge);
  return issues;
}

/** Style/layer/tag references on nodes and edges must resolve. */
export const referencesResolve: ValidationRule = (doc) => checkReferences(doc);

/** Annotations and comments must target an existing node/edge. */
export const targetsExist: ValidationRule = (doc) => {
  const issues: ValidationIssue[] = [];
  const collections = [
    ['annotations', doc.annotations],
    ['comments', doc.comments],
  ] as const;
  for (const [name, map] of collections) {
    for (const [id, entity] of Object.entries(map)) {
      const target = entity.target;
      const missing =
        (target.kind === 'node' && !(target.nodeId in doc.nodes)) ||
        (target.kind === 'edge' && !(target.edgeId in doc.edges));
      if (missing) {
        issues.push(
          issue(
            ValidationCode.OrphanTarget,
            `${name} "${id}" targets a missing entity`,
            `${name}.${id}.target`,
            { severity: 'warning', entityId: id },
          ),
        );
      }
    }
  }
  return issues;
};

/** The default rule set, in execution order. */
export const DEFAULT_RULES: readonly ValidationRule[] = [
  idKeyConsistency,
  uniqueIds,
  edgeEndpointsExist,
  groupChildrenExist,
  containerChildrenExist,
  noCircularGroups,
  referencesResolve,
  targetsExist,
];
