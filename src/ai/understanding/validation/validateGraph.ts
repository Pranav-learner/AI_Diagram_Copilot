/**
 * Semantic Graph validation — integrity checks over the IR itself.
 *
 * The DSL has its own validation; this catches inconsistencies that matter to AI
 * *reasoning*: relationships pointing at missing entities, dangling group
 * references, id-namespace collisions, and circular ownership. Running it lets a
 * future capability refuse to reason over a corrupt graph (or repair it) rather
 * than emit confident nonsense. Pure and O(V+E).
 */

import type { SemanticGraph } from '../model/graph';

export type SemanticIssueSeverity = 'error' | 'warning';

export interface SemanticIssue {
  readonly code: string;
  readonly severity: SemanticIssueSeverity;
  readonly message: string;
  readonly entityId?: string;
  readonly relationshipId?: string;
  readonly groupId?: string;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly SemanticIssue[];
  readonly warnings: readonly SemanticIssue[];
  readonly issues: readonly SemanticIssue[];
}

export function validateSemanticGraph(graph: SemanticGraph): ValidationReport {
  const issues: SemanticIssue[] = [];
  const add = (i: SemanticIssue) => issues.push(i);

  // ── Id-namespace collisions (entity id also used as a group id) ─────────────
  for (const id of graph.groups.keys()) {
    if (graph.entities.has(id)) {
      add({ code: 'duplicate-id', severity: 'error', groupId: id, entityId: id, message: `Id "${id}" is used by both an entity and a group.` });
    }
  }

  // ── Entity integrity ────────────────────────────────────────────────────────
  for (const e of graph.entities.values()) {
    if (!e.id) add({ code: 'corrupt-entity', severity: 'error', message: 'Entity with empty id.' });
    if (!e.kind) add({ code: 'corrupt-entity', severity: 'error', entityId: e.id, message: `Entity "${e.id}" has no kind.` });
    if (e.groupId && !graph.groups.has(e.groupId)) {
      add({ code: 'dangling-group-ref', severity: 'warning', entityId: e.id, groupId: e.groupId, message: `Entity "${e.label}" references missing group "${e.groupId}".` });
    }
    for (const [key, value] of Object.entries(e.attributes)) {
      if (value === undefined) {
        add({ code: 'corrupt-metadata', severity: 'warning', entityId: e.id, message: `Attribute "${key}" on "${e.label}" is undefined.` });
      }
    }
  }

  // ── Relationship integrity ──────────────────────────────────────────────────
  for (const r of graph.relationships.values()) {
    if (!graph.entities.has(r.source)) {
      add({ code: 'broken-reference', severity: 'error', relationshipId: r.id, entityId: r.source, message: `Relationship "${r.id}" has missing source "${r.source}".` });
    }
    if (!graph.entities.has(r.target)) {
      add({ code: 'broken-reference', severity: 'error', relationshipId: r.id, entityId: r.target, message: `Relationship "${r.id}" has missing target "${r.target}".` });
    }
    if (!r.kind) {
      add({ code: 'invalid-relationship', severity: 'warning', relationshipId: r.id, message: `Relationship "${r.id}" has no kind.` });
    }
    if (r.source === r.target) {
      add({ code: 'self-loop', severity: 'warning', relationshipId: r.id, entityId: r.source, message: `Relationship "${r.id}" is a self-loop on "${r.source}".` });
    }
  }

  // ── Group integrity ─────────────────────────────────────────────────────────
  for (const g of graph.groups.values()) {
    for (const memberId of g.memberIds) {
      if (!graph.entities.has(memberId)) {
        add({ code: 'missing-member', severity: 'warning', groupId: g.id, entityId: memberId, message: `Group "${g.label}" lists missing member "${memberId}".` });
      }
    }
    for (const childId of g.childGroupIds) {
      if (!graph.groups.has(childId)) {
        add({ code: 'missing-child-group', severity: 'warning', groupId: g.id, message: `Group "${g.label}" lists missing child group "${childId}".` });
      }
    }
    if (g.parentGroupId && !graph.groups.has(g.parentGroupId)) {
      add({ code: 'dangling-group-ref', severity: 'warning', groupId: g.id, message: `Group "${g.label}" references missing parent "${g.parentGroupId}".` });
    }
  }

  // ── Circular ownership in the containment tree ──────────────────────────────
  for (const start of graph.groups.keys()) {
    const seen = new Set<string>();
    let cur: string | undefined = start;
    while (cur) {
      if (seen.has(cur)) {
        add({ code: 'circular-ownership', severity: 'error', groupId: start, message: `Group "${start}" is part of a containment cycle.` });
        break;
      }
      seen.add(cur);
      cur = graph.index.parentOf(cur);
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}
