import type {
  CanvasScene,
  CanvasSnapshot,
  CanvasTool,
  ElementStyleUpdate,
  SelectedElement,
} from './types/canvas';

/**
 * The host the engine reports state changes to. Injected at construction so the
 * engine has no direct dependency on Zustand (Dependency Inversion): the engine
 * depends on this small interface, not on the store implementation.
 */
export interface CanvasEngineHost {
  /** Merge a partial snapshot into the reactive canvas state. */
  patch: (partial: Partial<CanvasSnapshot>) => void;
  /** Read the current snapshot (used by the engine for optimistic updates). */
  getSnapshot: () => CanvasSnapshot;
}

/**
 * The stable, engine-agnostic API every UI component and future module uses to
 * drive the canvas. Excalidraw is hidden behind concrete implementations of
 * this interface (see {@link ExcalidrawAdapter}).
 *
 * Design goals:
 *  - **UI never touches Excalidraw.** All imperative actions go through here.
 *  - **Swappable.** A different engine only needs a new adapter.
 *  - **Reactive state lives in the store**, not here — this interface is purely
 *    imperative. Read live state via `useCanvasStore` selectors.
 */
export interface CanvasEngine {
  // ── Lifecycle ────────────────────────────────────────────────────────────
  /** Whether the engine is attached to a live canvas. */
  readonly isReady: boolean;
  /** Tear down subscriptions and release the underlying canvas reference. */
  destroy(): void;

  // ── Scene ────────────────────────────────────────────────────────────────
  getScene(): CanvasScene;
  setScene(scene: CanvasScene): void;
  /** Serialize the scene (validated/normalized). Out of UI scope this module. */
  exportScene(): CanvasScene;
  /** Load a scene, tolerating malformed input. Returns false on invalid data. */
  importScene(scene: unknown): boolean;

  // ── Selection ────────────────────────────────────────────────────────────
  getSelected(): readonly SelectedElement[];
  selectAll(): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  groupSelected(): void;
  ungroupSelected(): void;
  /** Apply a partial style/geometry update to the current selection. */
  updateSelected(update: ElementStyleUpdate): void;

  // ── History ──────────────────────────────────────────────────────────────
  undo(): void;
  redo(): void;

  // ── Viewport ─────────────────────────────────────────────────────────────
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  fitToScreen(): void;

  // ── Tools & view ──────────────────────────────────────────────────────────
  setTool(tool: CanvasTool): void;
  getTool(): CanvasTool;
  setGrid(enabled: boolean): void;
  toggleGrid(): void;
}

/** Zoom bounds Excalidraw enforces; mirrored here to keep the UI honest. */
export const ZOOM = {
  MIN: 0.1,
  MAX: 30,
  STEP: 0.1,
} as const;
