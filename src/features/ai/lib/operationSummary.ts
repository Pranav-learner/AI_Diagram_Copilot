/**
 * Operation Summary — derived from the runtime, not recomputed.
 *
 * The runtime emits a {@link DocumentPatch} for every committed transaction
 * (added / removed / changed per collection). The AI experience layer *consumes*
 * that patch and presents it — nodes created/deleted/modified, connections
 * added/removed, groups created, styles changed — plus the measured execution
 * time. No business logic is duplicated; this is pure presentation over the
 * authoritative delta.
 */

import type { DocumentPatch } from '@/diagram-engine';

export interface OperationSummary {
  readonly nodesCreated: number;
  readonly nodesDeleted: number;
  readonly nodesModified: number;
  readonly edgesAdded: number;
  readonly edgesRemoved: number;
  readonly groupsCreated: number;
  readonly groupsRemoved: number;
  readonly stylesChanged: number;
  readonly executionTimeMs: number;
}

function count(map: Record<string, unknown> | undefined): number {
  return map ? Object.keys(map).length : 0;
}

/** Summarize a runtime {@link DocumentPatch} into human-facing operation counts. */
export function summarizePatch(patch: DocumentPatch | undefined, executionTimeMs: number): OperationSummary {
  const nodes = patch?.nodes;
  const edges = patch?.edges;
  const groups = patch?.groups;

  // A "style change" is a node whose style/styleRef changed (a subset of modified).
  let stylesChanged = 0;
  if (nodes) {
    for (const { before, after } of Object.values(nodes.changed)) {
      if (JSON.stringify(before.style) !== JSON.stringify(after.style) || before.styleRef !== after.styleRef) stylesChanged += 1;
    }
  }

  return {
    nodesCreated: count(nodes?.added),
    nodesDeleted: count(nodes?.removed),
    nodesModified: count(nodes?.changed),
    edgesAdded: count(edges?.added),
    edgesRemoved: count(edges?.removed),
    groupsCreated: count(groups?.added),
    groupsRemoved: count(groups?.removed),
    stylesChanged,
    executionTimeMs,
  };
}

/** Total number of element changes in a summary (for "did anything happen"). */
export function summaryTotal(s: OperationSummary): number {
  return s.nodesCreated + s.nodesDeleted + s.nodesModified + s.edgesAdded + s.edgesRemoved + s.groupsCreated + s.groupsRemoved;
}

/** The non-zero rows of a summary, as {label, value} for display. */
export function summaryRows(s: OperationSummary): ReadonlyArray<{ label: string; value: number }> {
  const rows: Array<{ label: string; value: number }> = [
    { label: 'Nodes created', value: s.nodesCreated },
    { label: 'Nodes deleted', value: s.nodesDeleted },
    { label: 'Nodes modified', value: s.nodesModified },
    { label: 'Connections added', value: s.edgesAdded },
    { label: 'Connections removed', value: s.edgesRemoved },
    { label: 'Groups created', value: s.groupsCreated },
    { label: 'Groups removed', value: s.groupsRemoved },
    { label: 'Styles changed', value: s.stylesChanged },
  ];
  return rows.filter((r) => r.value > 0);
}
