/**
 * The runtime's immutable state snapshot.
 *
 * The {@link DiagramRuntime} holds one of these at a time and replaces it
 * wholesale on every commit — the document is always a coherent, versioned unit,
 * never mutated in place. `origin` records what caused the current state, which
 * the bridge uses to decide whether a change needs to flow back to the canvas.
 */

import type { DiagramDocument } from '@/dsl';

/** Who caused a change: a user canvas edit, a programmatic edit, or initial load. */
export type ChangeOrigin = 'canvas' | 'program' | 'load';

export interface DiagramState {
  readonly document: DiagramDocument;
  /** Monotonic runtime version — bumped on every committed change. */
  readonly version: number;
  /** Origin of the commit that produced this state. */
  readonly origin: ChangeOrigin;
}

export function initialState(document: DiagramDocument, origin: ChangeOrigin = 'load'): DiagramState {
  return { document, version: 1, origin };
}

export function nextState(
  previous: DiagramState,
  document: DiagramDocument,
  origin: ChangeOrigin,
): DiagramState {
  return { document, version: previous.version + 1, origin };
}
