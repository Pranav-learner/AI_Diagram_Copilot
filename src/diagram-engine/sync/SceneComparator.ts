/**
 * Element reconciliation — the heart of incremental rendering.
 *
 * Given the current scene's elements and a freshly-rendered target set, produce
 * the next element array that:
 *  - **reuses the existing object reference** for every element that is
 *    unchanged (so the target engine — and React — can skip it), and
 *  - **version-bumps** only the elements that actually changed, plus new ones.
 *
 * Rendering the target set in full is cheap (pure object construction); the
 * expensive work (canvas repaint) is what this minimizes, by handing the engine
 * a mostly reference-stable array with a tiny change set.
 *
 * Fully generic: it manipulates elements only through the {@link Renderer}'s
 * small accessor surface, so it works for any rendering backend.
 */

import type { Renderer } from '../renderer/Renderer';
import type { SceneChangeSet } from './SceneDiff';

export interface Reconciliation<TElement> {
  readonly elements: readonly TElement[];
  readonly changeSet: SceneChangeSet<TElement>;
}

export function reconcile<TScene, TElement>(
  renderer: Renderer<TScene, TElement>,
  current: readonly TElement[],
  next: readonly TElement[],
): Reconciliation<TElement> {
  const currentById = new Map<string, TElement>();
  for (const element of current) currentById.set(renderer.elementId(element), element);

  const added: TElement[] = [];
  const updated: TElement[] = [];
  const elements: TElement[] = [];
  const nextIds = new Set<string>();

  for (const nextElement of next) {
    const id = renderer.elementId(nextElement);
    nextIds.add(id);
    const currentElement = currentById.get(id);

    if (currentElement === undefined) {
      added.push(nextElement);
      elements.push(nextElement);
    } else if (renderer.elementsEqual(currentElement, nextElement)) {
      elements.push(currentElement); // reuse reference — no repaint
    } else {
      const bumped = renderer.bumpVersion(nextElement, currentElement);
      updated.push(bumped);
      elements.push(bumped);
    }
  }

  const removed: string[] = [];
  for (const id of currentById.keys()) {
    if (!nextIds.has(id)) removed.push(id);
  }

  return { elements, changeSet: { added, updated, removed } };
}
