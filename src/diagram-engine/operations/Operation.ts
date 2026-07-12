/**
 * The Operation contract — an immutable, strongly-typed diagram command.
 *
 * Operations are **forward-only**: `apply(ctx) → nextDocument`. They never write
 * an inverse — the runtime derives reversibility by diffing before/after into a
 * {@link DocumentPatch} (so cascades are captured for free and adding an
 * operation needs no inverse logic). `validate` runs *before* apply to prevent
 * invalid mutations. `apply` reuses the DSL's `operations`/builders, so every
 * command inherits the DSL's cascade + normalization behaviour.
 */

import type { DiagramDocument, IdFactory, Clock, NodeTypeRegistry } from '@/dsl';

/**
 * A precondition failure for an operation. Open `code` string (operation checks
 * are about preconditions, distinct from the DSL's closed document-integrity
 * codes).
 */
export interface OperationIssue {
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
}

export function opIssue(code: string, message: string, entityId?: string): OperationIssue {
  return { code, message, entityId };
}

/** Everything an operation needs to validate + build entities. */
export interface OperationContext {
  readonly document: DiagramDocument;
  readonly ids: IdFactory;
  readonly clock: Clock;
  readonly registry: NodeTypeRegistry;
}

export interface Operation {
  /** Stable machine type, e.g. `node.move`. */
  readonly type: string;
  /** Human label for history/UI, e.g. `Move node`. */
  readonly label: string;
  /** Consecutive entries sharing a key may be compressed in history. */
  readonly coalesceKey?: string;
  /** Preconditions — return issues to reject before any mutation. */
  validate(ctx: OperationContext): OperationIssue[];
  /** Produce the next document. Must be pure (no mutation of ctx.document). */
  apply(ctx: OperationContext): DiagramDocument;
}
