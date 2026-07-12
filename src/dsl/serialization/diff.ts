/**
 * Document diffing.
 *
 * Produces a per-collection changeset (added / removed / changed) plus flags for
 * viewport and document-metadata changes. Change detection uses the canonical
 * serialization, so it is robust to key ordering. This is the primitive future
 * modules build on: conversational-edit previews, review "what changed", and
 * multi-agent merge all consume a {@link DocumentDiff}.
 */

import type { EntityMap, DiagramDocument } from '../model/document';
import type { DiagramNode } from '../model/node';
import type { DiagramEdge } from '../model/edge';
import type { DiagramGroup } from '../model/group';
import type { Layer } from '../model/layer';
import type { NamedStyle } from '../model/style';
import type { DiagramTag } from '../model/tag';
import type { Annotation } from '../model/annotation';
import type { DiagramComment } from '../model/comment';
import { stableStringify } from './serialize';

export interface Change<T> {
  readonly id: string;
  readonly before: T;
  readonly after: T;
}

export interface CollectionDiff<T> {
  readonly added: readonly T[];
  readonly removed: readonly T[];
  readonly changed: readonly Change<T>[];
}

export interface DocumentDiff {
  readonly nodes: CollectionDiff<DiagramNode>;
  readonly edges: CollectionDiff<DiagramEdge>;
  readonly groups: CollectionDiff<DiagramGroup>;
  readonly layers: CollectionDiff<Layer>;
  readonly styles: CollectionDiff<NamedStyle>;
  readonly tags: CollectionDiff<DiagramTag>;
  readonly annotations: CollectionDiff<Annotation>;
  readonly comments: CollectionDiff<DiagramComment>;
  readonly viewportChanged: boolean;
  readonly metadataChanged: boolean;
}

function diffCollection<T>(a: EntityMap<T>, b: EntityMap<T>): CollectionDiff<T> {
  const added: T[] = [];
  const removed: T[] = [];
  const changed: Change<T>[] = [];

  for (const [id, after] of Object.entries(b)) {
    const before = a[id];
    if (before === undefined) added.push(after);
    else if (stableStringify(before) !== stableStringify(after)) {
      changed.push({ id, before, after });
    }
  }
  for (const [id, before] of Object.entries(a)) {
    if (!(id in b)) removed.push(before);
  }
  return { added, removed, changed };
}

/** True if any collection changed or the viewport/metadata differ. */
export function isEmptyDiff(diff: DocumentDiff): boolean {
  const collectionsEmpty = (
    [
      diff.nodes,
      diff.edges,
      diff.groups,
      diff.layers,
      diff.styles,
      diff.tags,
      diff.annotations,
      diff.comments,
    ] as const
  ).every((c) => c.added.length === 0 && c.removed.length === 0 && c.changed.length === 0);
  return collectionsEmpty && !diff.viewportChanged && !diff.metadataChanged;
}

/** Compute the changeset transforming document `a` into document `b`. */
export function diff(a: DiagramDocument, b: DiagramDocument): DocumentDiff {
  return {
    nodes: diffCollection(a.nodes, b.nodes),
    edges: diffCollection(a.edges, b.edges),
    groups: diffCollection(a.groups, b.groups),
    layers: diffCollection(a.layers, b.layers),
    styles: diffCollection(a.styles, b.styles),
    tags: diffCollection(a.tags, b.tags),
    annotations: diffCollection(a.annotations, b.annotations),
    comments: diffCollection(a.comments, b.comments),
    viewportChanged: stableStringify(a.viewport) !== stableStringify(b.viewport),
    metadataChanged: stableStringify(a.metadata) !== stableStringify(b.metadata),
  };
}
