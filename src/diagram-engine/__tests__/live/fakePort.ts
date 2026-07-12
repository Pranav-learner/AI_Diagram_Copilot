/**
 * A fake CanvasPort that mimics Excalidraw's behaviour for deterministic tests —
 * crucially, applying a scene **echoes** it back through `onChange`, exactly the
 * feedback that must not loop. `userSetScene`/`userSelect` simulate real user
 * edits; `applyCount` and `changeEmits` let tests assert minimal work.
 */

import type { CanvasPort, ApplySceneOptions } from '../..';
import type { ExcalidrawScene, ExElement } from '../..';

export type EchoMode = 'sync' | 'async' | 'none';

export class FakeCanvasPort implements CanvasPort<ExcalidrawScene> {
  applyCount = 0;
  changeEmits = 0;
  echoMode: EchoMode = 'sync';

  private scene: ExcalidrawScene;
  private selected: string[] = [];
  private readonly changeListeners = new Set<(scene: ExcalidrawScene) => void>();
  private readonly selectionListeners = new Set<(ids: readonly string[]) => void>();

  constructor(initial: ExcalidrawScene) {
    this.scene = initial;
  }

  getScene(): ExcalidrawScene {
    return this.scene;
  }

  applyScene(scene: ExcalidrawScene, _options?: ApplySceneOptions): void {
    this.applyCount += 1;
    this.scene = scene;
    if (this.echoMode === 'sync') this.emitChange();
    else if (this.echoMode === 'async') queueMicrotask(() => this.emitChange());
  }

  getSelectedIds(): readonly string[] {
    return this.selected;
  }

  setSelectedIds(ids: readonly string[]): void {
    this.selected = [...ids];
    this.emitSelection();
  }

  onChange(listener: (scene: ExcalidrawScene) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onSelectionChange(listener: (ids: readonly string[]) => void): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  // ── Test drivers (simulate the user) ────────────────────────────────────────

  /** Simulate a user edit: set a new scene and emit a change (origin: canvas). */
  userSetScene(scene: ExcalidrawScene): void {
    this.scene = scene;
    this.emitChange();
  }

  userSelect(ids: readonly string[]): void {
    this.selected = [...ids];
    this.emitSelection();
  }

  private emitChange(): void {
    this.changeEmits += 1;
    for (const listener of [...this.changeListeners]) listener(this.scene);
  }

  private emitSelection(): void {
    for (const listener of [...this.selectionListeners]) listener(this.selected);
  }
}

/**
 * Cheap echo signature: an Excalidraw-style scene version (sum of element
 * versions + count) plus the viewport key. Must include viewport, or a
 * viewport-only change (same elements) would be misread as an echo and dropped.
 */
export function sceneSignature(scene: ExcalidrawScene): string {
  let versionSum = 0;
  for (const el of scene.elements) versionSum += el.version;
  const a = scene.appState;
  return [
    scene.elements.length,
    versionSum,
    a.zoom?.value ?? 1,
    a.scrollX ?? 0,
    a.scrollY ?? 0,
    a.viewBackgroundColor ?? '',
    a.gridModeEnabled ?? false,
  ].join(':');
}

// ── Scene mutators (build the "next scene" a user edit would produce) ──────────

export function moveElement(scene: ExcalidrawScene, id: string, dx: number, dy: number): ExcalidrawScene {
  return {
    ...scene,
    elements: scene.elements.map((e) =>
      e.id === id ? { ...e, x: e.x + dx, y: e.y + dy, version: e.version + 1 } : e,
    ),
  };
}

export function resizeElement(scene: ExcalidrawScene, id: string, w: number, h: number): ExcalidrawScene {
  return {
    ...scene,
    elements: scene.elements.map((e) =>
      e.id === id ? { ...e, width: w, height: h, version: e.version + 1 } : e,
    ),
  };
}

export function removeElements(scene: ExcalidrawScene, ids: readonly string[]): ExcalidrawScene {
  const drop = new Set(ids);
  return { ...scene, elements: scene.elements.filter((e) => !drop.has(e.id)) };
}

/** Append a bare (no-escrow) element, as if the user drew a fresh shape. */
export function addBareRectangle(scene: ExcalidrawScene, template: ExElement, id: string): ExcalidrawScene {
  const bare: ExElement = { ...template, id, x: 500, y: 500, customData: undefined, version: 1 };
  return { ...scene, elements: [...scene.elements, bare] };
}

export function setZoom(scene: ExcalidrawScene, zoom: number): ExcalidrawScene {
  return { ...scene, appState: { ...scene.appState, zoom: { value: zoom } } };
}
