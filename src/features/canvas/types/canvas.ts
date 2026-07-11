/**
 * Public, engine-agnostic types for the Canvas feature.
 *
 * Nothing in this file references Excalidraw. UI code and future AI modules
 * depend on these types only — the concrete engine (Excalidraw) is an
 * implementation detail hidden behind {@link CanvasEngine}.
 */

/** Tools the app exposes through its own toolbar. Superset maps to the engine. */
export type CanvasTool =
  | 'selection'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'image';

/** Normalized element kind surfaced to the inspector. */
export type CanvasElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'image'
  | 'frame'
  | 'embeddable'
  | 'unknown';

/**
 * A read-only, normalized view of a single scene element for the inspector.
 * Decoupled from Excalidraw's element shape so the inspector never imports
 * Excalidraw types.
 */
export interface SelectedElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees (0–360). */
  rotation: number;
  strokeColor: string;
  backgroundColor: string;
  /** Opacity as a percentage (0–100). */
  opacity: number;
  /** 1-based paint order (higher = in front). */
  layer: number;
}

/**
 * Opaque scene payload for {@link CanvasEngine.getScene}/`setScene`.
 * Structurally serializable; callers should treat `elements`/`files` as opaque.
 */
export interface CanvasScene {
  elements: readonly object[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

/**
 * The reactive snapshot the engine publishes to the canvas store. Every field
 * is a plain value so Zustand subscribers can select narrowly.
 */
export interface CanvasSnapshot {
  /** True once the engine is attached and ready to accept commands. */
  isReady: boolean;
  /** Non-null when the canvas failed to initialize or errored fatally. */
  error: string | null;
  activeTool: CanvasTool;
  /** Zoom as a ratio (1 = 100%). */
  zoom: number;
  /** Count of non-deleted elements in the scene. */
  elementCount: number;
  selectedElementIds: readonly string[];
  selectedElements: readonly SelectedElement[];
  /** Monotonic-ish scene version; changes when elements change. */
  sceneVersion: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Pointer position in scene coordinates, or null when off-canvas. */
  cursor: { x: number; y: number } | null;
}

/** The initial, "nothing loaded yet" snapshot. */
export const INITIAL_SNAPSHOT: CanvasSnapshot = {
  isReady: false,
  error: null,
  activeTool: 'selection',
  zoom: 1,
  elementCount: 0,
  selectedElementIds: [],
  selectedElements: [],
  sceneVersion: 0,
  canUndo: false,
  canRedo: false,
  cursor: null,
};
