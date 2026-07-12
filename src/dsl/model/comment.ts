/**
 * Comments — threaded discussion attached to a target.
 *
 * Distinct from {@link Annotation} (a single note): a comment has an author, a
 * resolution state, and a list of replies, modelling review/collaboration
 * workflows a future Review module will drive. Prefixed `Diagram` to avoid the
 * DOM global `Comment`.
 */

import type { EntityBase } from '../core/entity';
import type { CommentId } from '../primitives/ids';
import type { Timestamp } from '../primitives/scalars';
import type { AnnotationTarget } from './annotation';

export interface CommentReply {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: Timestamp;
}

export interface DiagramComment extends EntityBase<CommentId> {
  readonly target: AnnotationTarget;
  readonly author: string;
  readonly body: string;
  readonly resolved: boolean;
  readonly replies: readonly CommentReply[];
}
