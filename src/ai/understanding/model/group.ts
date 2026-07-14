/**
 * SemanticGroup — a renderer-independent grouping/containment node in the IR.
 *
 * Groups model the *hierarchy* axis of the diagram (DSL `DiagramGroup`, plus
 * `ContainerNode` children). The relationship graph (edges) and the containment
 * tree (groups/containers) are deliberately kept as separate axes: dependency
 * analysis walks relationships; ancestors/descendants walk containment.
 */

import type { MetadataValue } from '@/dsl';

/** Semantic grouping kind (mirrors DSL `GroupKind`, plus synthetic containers). */
export type GroupKind = 'group' | 'container' | 'frame' | 'swimlane';

export interface SemanticGroup {
  /** Identity — DSL group id, or `container:<nodeId>` for container-node groups. */
  readonly id: string;
  readonly kind: GroupKind;
  readonly label: string;
  /** Direct entity members (leaf children that are entities). */
  readonly memberIds: readonly string[];
  /** Nested child group ids. */
  readonly childGroupIds: readonly string[];
  /** Parent group id, when this group is nested inside another. */
  readonly parentGroupId?: string;
  /** Domain attributes — metadata minus internal keys. */
  readonly attributes: Readonly<Record<string, MetadataValue>>;
  /** True when synthesised from a container node rather than a DSL group. */
  readonly synthetic: boolean;
}
