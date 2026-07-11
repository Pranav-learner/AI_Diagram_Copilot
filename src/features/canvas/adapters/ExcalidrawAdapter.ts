import {
  CaptureUpdateAction,
  getCommonBounds,
  getSceneVersion,
  newElementWith,
  restore,
  zoomToFitBounds,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import {
  ZOOM,
  type CanvasEngine,
  type CanvasEngineHost,
} from '../CanvasEngine';
import type {
  CanvasScene,
  CanvasSnapshot,
  CanvasTool,
  ElementStyleUpdate,
  SelectedElement,
} from '../types/canvas';
import { fromExcalidrawTool, toExcalidrawTool } from './toolMapping';
import { normalizeElement } from './normalizeElement';
import { toElementUpdates } from './styleUpdate';
import { clampZoom, zoomToViewportCenter } from './zoom';

type Elements = readonly ExcalidrawElement[];

/** Payload shape from Excalidraw's `onPointerUpdate` prop. */
export interface PointerUpdatePayload {
  pointer: { x: number; y: number };
}

/**
 * Concrete {@link CanvasEngine} backed by Excalidraw. This is the ONLY module
 * (besides small typed utils) that imports Excalidraw APIs. Everything above it
 * — toolbar, inspector, status bar, future AI — talks to the interface.
 *
 * The adapter translates Excalidraw's imperative API and change events into the
 * app's normalized snapshot, which it pushes to the injected host (the store).
 */
export class ExcalidrawAdapter implements CanvasEngine {
  private api: ExcalidrawImperativeAPI | null = null;
  private container: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  // Change-detection caches so we only recompute what actually changed.
  private lastVersion = -1;
  private lastSelectionKey = '';

  // Best-effort history tracking (Excalidraw exposes no history availability).
  private historyNav = false;

  constructor(private readonly host: CanvasEngineHost) {}

  get isReady(): boolean {
    return this.api !== null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Called by the Canvas host once Excalidraw hands over its imperative API.
   * Re-attach safe: on any genuine remount we tear down the previous
   * subscription first so a stale `onChange` can't keep writing to the store.
   */
  attach(api: ExcalidrawImperativeAPI, container: HTMLElement | null): void {
    if (this.api === api) return;
    this.unsubscribe?.();
    this.lastVersion = -1;
    this.lastSelectionKey = '';
    this.api = api;
    this.container = container;
    this.unsubscribe = api.onChange((elements, appState) =>
      this.handleChange(elements, appState),
    );
    this.host.patch({ isReady: true, error: null });
    this.handleChange(api.getSceneElements(), api.getAppState());
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.api = null;
    this.container = null;
    this.lastVersion = -1;
    this.lastSelectionKey = '';
    this.historyNav = false;
    this.host.patch({ isReady: false });
  }

  /** Report a fatal initialization/runtime failure to the store. */
  reportError(message: string): void {
    this.host.patch({ isReady: false, error: message });
  }

  // ── Change handling ──────────────────────────────────────────────────────

  private handleChange = (elements: Elements, appState: AppState): void => {
    const version = getSceneVersion(elements);
    const selectedIds = selectedIdsFromAppState(appState);
    const selectionKey = selectedIds.join(',');
    const patch: Partial<CanvasSnapshot> = {
      zoom: appState.zoom.value,
      activeTool: fromExcalidrawTool(appState.activeTool.type),
    };

    const versionChanged = version !== this.lastVersion;
    if (versionChanged) {
      patch.sceneVersion = version;
      patch.elementCount = elements.length;

      if (this.lastVersion !== -1) {
        if (this.historyNav) {
          // This change came from undo/redo; don't disturb redo availability.
          this.historyNav = false;
        } else {
          patch.canUndo = true;
          patch.canRedo = false;
        }
      }
      this.lastVersion = version;
    }

    // Recompute selection when it changes, or when elements move while selected.
    if (selectionKey !== this.lastSelectionKey || versionChanged) {
      this.lastSelectionKey = selectionKey;
      patch.selectedElementIds = selectedIds;
      patch.selectedElements = normalizeSelection(elements, selectedIds);
    }

    this.host.patch(patch);
  };

  /** Forwarded from Excalidraw's `onPointerUpdate` prop. */
  handlePointerUpdate = ({ pointer }: PointerUpdatePayload): void => {
    this.host.patch({
      cursor: { x: Math.round(pointer.x), y: Math.round(pointer.y) },
    });
  };

  // ── Scene ────────────────────────────────────────────────────────────────

  getScene(): CanvasScene {
    if (!this.api) return { elements: [] };
    return {
      elements: this.api.getSceneElements() as unknown as object[],
      appState: this.api.getAppState() as unknown as Record<string, unknown>,
      files: this.api.getFiles() as unknown as Record<string, unknown>,
    };
  }

  setScene(scene: CanvasScene): void {
    this.api?.updateScene({
      elements: scene.elements as unknown as Elements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  exportScene(): CanvasScene {
    return this.getScene();
  }

  importScene(data: unknown): boolean {
    if (!this.api) return false;
    try {
      const restored = restore(
        data as Parameters<typeof restore>[0],
        null,
        null,
      );
      this.api.updateScene({
        elements: restored.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      return true;
    } catch (error) {
      this.reportError(
        error instanceof Error ? error.message : 'Failed to import scene',
      );
      return false;
    }
  }

  // ── Selection ────────────────────────────────────────────────────────────

  getSelected(): readonly SelectedElement[] {
    return this.host.getSnapshot().selectedElements;
  }

  selectAll(): void {
    this.dispatchShortcut('a', 'KeyA', { ctrl: true });
  }

  /**
   * Delete the selection deterministically by committing a scene without the
   * selected elements. This avoids the focus-sensitive Delete-key handler.
   * Note: selection is intentionally NOT cleared in the same `updateScene` call —
   * combining an appState selection reset with element removal prevents Excalidraw
   * from reconciling the deletion. Removing the elements drops their selection
   * naturally.
   */
  deleteSelected(): void {
    if (!this.api) return;
    const selectedIds = this.selectedIdSet();
    if (selectedIds.size === 0) return;
    const remaining = this.api
      .getSceneElements()
      .filter((element) => !selectedIds.has(element.id));
    this.api.updateScene({
      elements: remaining,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  /** Current selection read from Excalidraw (the source of truth). */
  private selectedIdSet(): Set<string> {
    if (!this.api) return new Set();
    const map = this.api.getAppState().selectedElementIds;
    return new Set(Object.keys(map).filter((id) => map[id]));
  }

  duplicateSelected(): void {
    this.dispatchShortcut('d', 'KeyD', { ctrl: true });
  }

  groupSelected(): void {
    this.dispatchShortcut('g', 'KeyG', { ctrl: true });
  }

  ungroupSelected(): void {
    this.dispatchShortcut('g', 'KeyG', { ctrl: true, shift: true });
  }

  /**
   * Apply a style/geometry update to every selected element and commit it as an
   * undoable change. `newElementWith` bumps element versions so Excalidraw
   * reconciles the scene; per-element type filtering happens in
   * {@link toElementUpdates}.
   */
  updateSelected(update: ElementStyleUpdate): void {
    if (!this.api) return;
    const selectedIds = this.selectedIdSet();
    if (selectedIds.size === 0) return;

    const next = this.api.getSceneElements().map((element) =>
      selectedIds.has(element.id)
        ? // `as never`: updates are validated per element type in toElementUpdates.
          newElementWith(element, toElementUpdates(element, update) as never)
        : element,
    );
    this.api.updateScene({
      elements: next,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  // ── History ──────────────────────────────────────────────────────────────

  undo(): void {
    this.historyNav = true;
    this.host.patch({ canRedo: true });
    this.dispatchShortcut('z', 'KeyZ', { ctrl: true });
  }

  redo(): void {
    this.historyNav = true;
    this.dispatchShortcut('z', 'KeyZ', { ctrl: true, shift: true });
  }

  // ── Viewport ─────────────────────────────────────────────────────────────

  zoomIn(): void {
    this.applyZoom(this.currentZoom() + ZOOM.STEP);
  }

  zoomOut(): void {
    this.applyZoom(this.currentZoom() - ZOOM.STEP);
  }

  resetZoom(): void {
    this.applyZoom(1);
  }

  fitToScreen(): void {
    if (!this.api) return;
    const elements = this.api.getSceneElements();
    if (elements.length === 0) {
      this.resetZoom();
      return;
    }
    const bounds = getCommonBounds(elements);
    const { appState } = zoomToFitBounds({
      bounds,
      appState: this.api.getAppState(),
      fitToViewport: false,
    });
    this.api.updateScene({
      appState: {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private currentZoom(): number {
    return this.api?.getAppState().zoom.value ?? 1;
  }

  private applyZoom(nextValue: number): void {
    if (!this.api) return;
    const viewport = zoomToViewportCenter(this.api.getAppState(), nextValue);
    this.api.updateScene({
      appState: viewport,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    this.host.patch({ zoom: clampZoom(nextValue) });
  }

  // ── Tools ────────────────────────────────────────────────────────────────

  setTool(tool: CanvasTool): void {
    this.api?.setActiveTool({ type: toExcalidrawTool(tool) });
    this.host.patch({ activeTool: tool });
  }

  getTool(): CanvasTool {
    if (!this.api) return 'selection';
    return fromExcalidrawTool(this.api.getAppState().activeTool.type);
  }

  setGrid(enabled: boolean): void {
    // Grid rendering is driven by a prop the Canvas host reads from the store,
    // so toggling grid is purely a state change — no imperative Excalidraw call.
    this.host.patch({ gridEnabled: enabled });
  }

  toggleGrid(): void {
    this.setGrid(!this.host.getSnapshot().gridEnabled);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Excalidraw exposes no imperative undo/redo/delete/duplicate. We drive those
   * through its own keyboard handling (the canvas is mounted with
   * `handleKeyboardGlobally`, so it listens on `document`). Real key presses use
   * the identical path, keeping behavior consistent.
   */
  private dispatchShortcut(
    key: string,
    code: string,
    modifiers: { ctrl?: boolean; shift?: boolean } = {},
  ): void {
    if (!this.api) return;
    const event = new KeyboardEvent('keydown', {
      key,
      code,
      ctrlKey: modifiers.ctrl ?? false,
      shiftKey: modifiers.shift ?? false,
      bubbles: true,
      cancelable: true,
    });
    (this.container ?? document).dispatchEvent(event);
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function selectedIdsFromAppState(appState: AppState): string[] {
  return Object.keys(appState.selectedElementIds).filter(
    (id) => appState.selectedElementIds[id],
  );
}

function normalizeSelection(
  elements: Elements,
  selectedIds: readonly string[],
): SelectedElement[] {
  if (selectedIds.length === 0) return [];
  const indexById = new Map(elements.map((el, index) => [el.id, index]));
  const result: SelectedElement[] = [];
  for (const id of selectedIds) {
    const index = indexById.get(id);
    if (index === undefined) continue;
    result.push(normalizeElement(elements[index]!, index + 1));
  }
  return result;
}
