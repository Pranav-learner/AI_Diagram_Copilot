/**
 * ExcalidrawCanvasPort — the concrete {@link CanvasPort} over {@link CanvasEngine}.
 *
 * Adapts the engine-agnostic port contract the bridge speaks to the Excalidraw-
 * backed `CanvasEngine`. This is the one place the live runtime touches the
 * canvas feature; the bridge/runtime themselves never import Excalidraw. Scene
 * conversions are structural casts — Excalidraw's runtime elements are a superset
 * of the engine's plain `ExElement`, so the renderer reads them directly.
 */

import type {
  CanvasPort,
  ApplySceneOptions,
  ExcalidrawScene,
  ExElement,
  ExAppState,
  ExBinaryFile,
} from '@/diagram-engine';
import type { CanvasEngine } from '../CanvasEngine';
import type { CanvasScene } from '../types/canvas';
import { useCanvasStore } from '../state/useCanvasStore';

function toExcalidrawScene(scene: CanvasScene): ExcalidrawScene {
  return {
    elements: scene.elements as unknown as readonly ExElement[],
    appState: (scene.appState ?? {}) as ExAppState,
    files: (scene.files ?? {}) as Record<string, ExBinaryFile>,
  };
}

function toCanvasScene(scene: ExcalidrawScene): CanvasScene {
  return {
    elements: scene.elements as unknown as readonly object[],
    appState: scene.appState as Record<string, unknown>,
    files: scene.files as Record<string, unknown>,
  };
}

/**
 * Cheap echo signature: an Excalidraw-style scene version (Σ element versions +
 * count) plus the viewport key. Includes the viewport so a viewport-only change
 * isn't mistaken for an echo.
 */
export function excalidrawSceneSignature(scene: ExcalidrawScene): string {
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

export class ExcalidrawCanvasPort implements CanvasPort<ExcalidrawScene> {
  constructor(private readonly engine: CanvasEngine) {}

  getScene(): ExcalidrawScene {
    return toExcalidrawScene(this.engine.getScene());
  }

  applyScene(scene: ExcalidrawScene, options?: ApplySceneOptions): void {
    this.engine.applyScene(toCanvasScene(scene), options);
  }

  getSelectedIds(): readonly string[] {
    return this.engine.getSelectedIds();
  }

  setSelectedIds(ids: readonly string[]): void {
    this.engine.setSelectedIds(ids);
  }

  onChange(listener: (scene: ExcalidrawScene) => void): () => void {
    return this.engine.subscribeChange((scene) => listener(toExcalidrawScene(scene)));
  }

  onSelectionChange(listener: (ids: readonly string[]) => void): () => void {
    // Selection lives in the canvas store (the adapter publishes it there);
    // fire only when the selected-id set actually changes.
    return useCanvasStore.subscribe((state, prev) => {
      if (state.selectedElementIds !== prev.selectedElementIds) {
        listener(state.selectedElementIds);
      }
    });
  }
}
