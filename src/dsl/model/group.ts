/**
 * The grouping model.
 *
 * A {@link DiagramGroup} is a logical/structural aggregation that can hold both
 * nodes and *other groups* (arbitrary nesting). Its `kind` distinguishes plain
 * groups, visual containers, frames, and swimlanes — one structure, several
 * presentations — so future layout features (e.g. lanes) don't need new entity
 * types. Groups are referential (they list `childIds`); they do not embed their
 * children, keeping the store normalized.
 */

import type { EntityBase } from '../core/entity';
import type { GroupId, NodeId, LayerId } from '../primitives/ids';
import type { Rect } from '../primitives/geometry';

export type GroupKind = 'group' | 'container' | 'frame' | 'swimlane';

/** A child of a group is either a node or a nested group. */
export type GroupChildId = NodeId | GroupId;

export interface DiagramGroup extends EntityBase<GroupId> {
  readonly kind: GroupKind;
  readonly name?: string;
  /** Ordered ids of member nodes and nested groups. */
  readonly childIds: readonly GroupChildId[];
  /** Optional cached bounds (renderers may recompute). */
  readonly bounds?: Rect;
  readonly layerId?: LayerId;
  readonly locked?: boolean;
}
