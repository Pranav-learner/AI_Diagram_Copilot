/**
 * Group mapping — DSL groups/frames/nesting ⇄ Excalidraw `groupIds`/`frameId`.
 *
 * DSL groups are first-class entities with `childIds` (and arbitrary nesting).
 * Excalidraw expresses membership differently: every element carries a flat
 * `groupIds` chain (nearest group first) plus a single `frameId`. This mapper
 * computes that per-node placement from the DSL group tree, and renders DSL
 * `kind:'frame'` groups as Excalidraw frame elements (which survive a real
 * Excalidraw session). The *authoritative* group entities are escrowed at the
 * scene level by the renderer, so non-visual group data (name, metadata) also
 * round-trips; `groupIds` is the resilient fallback if that escrow is lost.
 */

import type { DiagramDocument, DiagramGroup } from '@/dsl';
import { makeBaseElement } from '../elementFactory';
import type { ExElement, ExGenericElement } from '../types';

export interface Placement {
  readonly groupIds: readonly string[];
  readonly frameId: string | null;
}

const EMPTY_PLACEMENT: Placement = { groupIds: [], frameId: null };

/** Map every child (node or group) id to its immediate parent group id. */
function buildParentMap(doc: DiagramDocument): Map<string, string> {
  const parent = new Map<string, string>();
  for (const [groupId, group] of Object.entries(doc.groups)) {
    for (const childId of group.childIds) parent.set(childId, groupId);
  }
  return parent;
}

/** Walk the ancestor chain of `childId`, classifying frames vs. plain groups. */
function placementFrom(
  doc: DiagramDocument,
  parent: Map<string, string>,
  childId: string,
): Placement {
  const groupIds: string[] = [];
  let frameId: string | null = null;
  const seen = new Set<string>();

  let current = parent.get(childId);
  while (current && !seen.has(current)) {
    seen.add(current);
    const group = doc.groups[current];
    if (group) {
      if (group.kind === 'frame') {
        if (frameId === null) frameId = group.id; // nearest frame wins
      } else {
        groupIds.push(group.id);
      }
    }
    current = parent.get(current);
  }
  return { groupIds, frameId };
}

/** Placement for every node in the document. */
export function computePlacements(doc: DiagramDocument): Map<string, Placement> {
  const parent = buildParentMap(doc);
  const placements = new Map<string, Placement>();
  for (const nodeId of Object.keys(doc.nodes)) {
    placements.set(nodeId, placementFrom(doc, parent, nodeId));
  }
  return placements;
}

/** Placement for a single node (used by incremental sync). */
export function placementFor(doc: DiagramDocument, nodeId: string): Placement {
  const node = doc.nodes[nodeId];
  if (!node) return EMPTY_PLACEMENT;
  return placementFrom(doc, buildParentMap(doc), nodeId);
}

/** Render DSL `kind:'frame'` groups as Excalidraw frame elements. */
export function renderFrames(doc: DiagramDocument, epoch: number): ExElement[] {
  const frames: ExElement[] = [];
  for (const group of Object.values(doc.groups)) {
    if (group.kind !== 'frame') continue;
    frames.push(frameElement(group, epoch));
  }
  return frames;
}

function frameElement(group: DiagramGroup, epoch: number): ExGenericElement {
  const bounds = group.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    ...makeBaseElement({ id: group.id, type: 'frame', ...bounds }, epoch),
    type: 'frame',
  };
}
