/**
 * Annotations — lightweight notes attached to a target.
 *
 * An annotation points at a node, an edge, or a free canvas point. Unlike a
 * comment it is not a discussion thread; it is a single piece of attached text
 * (callouts, TODOs, AI rationale). The {@link AnnotationTarget} union is shared
 * with comments.
 */

import type { EntityBase } from '../core/entity';
import type { AnnotationId, NodeId, EdgeId } from '../primitives/ids';
import type { Point } from '../primitives/geometry';

/** What an annotation or comment is attached to. */
export type AnnotationTarget =
  | { readonly kind: 'node'; readonly nodeId: NodeId }
  | { readonly kind: 'edge'; readonly edgeId: EdgeId }
  | { readonly kind: 'point'; readonly position: Point };

export interface Annotation extends EntityBase<AnnotationId> {
  readonly target: AnnotationTarget;
  readonly text: string;
}
