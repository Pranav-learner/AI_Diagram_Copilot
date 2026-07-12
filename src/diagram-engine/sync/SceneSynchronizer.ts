/**
 * The synchronizer — turns a DSL change into a minimal scene update.
 *
 * Pipeline: `diff(prevDoc, nextDoc)` (from the DSL) → short-circuit if empty
 * (idempotency, the real guard against render↔parse feedback loops) → full
 * render of the next document → {@link reconcile} against the current scene to
 * reuse unchanged element references and version-bump only what changed.
 *
 * Idempotency contract: `synchronize(doc, doc)` (or any no-op change) returns the
 * **same scene reference** and an empty change set — so a canvas edit that merely
 * reflects the current DSL produces no further work.
 */

import type { DiagramDocument } from '@/dsl';
import { diff as dslDiff, isEmptyDiff } from '@/dsl';
import type { DocumentDiff } from '@/dsl';
import type { Renderer } from '../renderer/Renderer';
import type { RendererContext } from '../renderer/RendererContext';
import { reconcile } from './SceneComparator';
import type { SceneChangeSet } from './SceneDiff';
import { emptyChangeSet } from './SceneDiff';

export interface SyncResult<TScene, TElement> {
  readonly scene: TScene;
  readonly changeSet: SceneChangeSet<TElement>;
  readonly diff: DocumentDiff;
}

export function synchronize<TScene, TElement>(
  renderer: Renderer<TScene, TElement>,
  currentScene: TScene,
  prevDoc: DiagramDocument,
  nextDoc: DiagramDocument,
  ctx: RendererContext,
): SyncResult<TScene, TElement> {
  const documentDiff = dslDiff(prevDoc, nextDoc);

  // Idempotent no-op: nothing changed → same scene, empty change set.
  if (isEmptyDiff(documentDiff)) {
    return { scene: currentScene, changeSet: emptyChangeSet<TElement>(), diff: documentDiff };
  }

  // Full render is cheap; reconciliation keeps the *canvas* update minimal.
  const target = renderer.render(nextDoc, ctx).scene;
  const { elements, changeSet } = reconcile(
    renderer,
    renderer.getElements(currentScene),
    renderer.getElements(target),
  );

  // `target` already carries the next appState (viewport + doc escrow); swap in
  // the reconciled (reference-stable) element array.
  const scene = renderer.withElements(target, elements);
  return { scene, changeSet, diff: documentDiff };
}
