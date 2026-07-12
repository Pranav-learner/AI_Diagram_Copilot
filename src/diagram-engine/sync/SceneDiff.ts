/**
 * Scene-level change types — the element-granular result of synchronization.
 *
 * Renderer-agnostic (generic over the element type). A change set names exactly
 * which elements the target engine must add, update, or remove — the input to a
 * minimal, flicker-free canvas update.
 */

export interface SceneChangeSet<TElement> {
  readonly added: readonly TElement[];
  readonly updated: readonly TElement[];
  readonly removed: readonly string[];
}

export function emptyChangeSet<TElement>(): SceneChangeSet<TElement> {
  return { added: [], updated: [], removed: [] };
}

export function isEmptyChangeSet<TElement>(changeSet: SceneChangeSet<TElement>): boolean {
  return (
    changeSet.added.length === 0 &&
    changeSet.updated.length === 0 &&
    changeSet.removed.length === 0
  );
}

/** Total number of element operations in a change set. */
export function changeCount<TElement>(changeSet: SceneChangeSet<TElement>): number {
  return changeSet.added.length + changeSet.updated.length + changeSet.removed.length;
}
