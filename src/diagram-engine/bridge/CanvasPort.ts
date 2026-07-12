/**
 * CanvasPort — the abstract live editing surface.
 *
 * The bridge talks to the canvas ONLY through this interface, so it never imports
 * Excalidraw or React. The Excalidraw implementation (`ExcalidrawCanvasPort`,
 * in the canvas feature) wraps the existing `CanvasEngine`. A different backend
 * (a headless test canvas, a future WebGL surface) just implements this.
 *
 * Generic over the scene type only — element-level concerns live in the engine's
 * `Renderer<TScene, TElement>`, which the bridge holds separately.
 */

export interface ApplySceneOptions {
  /** Whether the applied change should be undoable (default true). */
  readonly captureHistory?: boolean;
}

export interface CanvasPort<TScene> {
  /** The current scene (elements + viewport + files). */
  getScene(): TScene;
  /**
   * Apply a scene to the canvas. Implementations MUST NOT reset the user's
   * selection here (only elements + viewport), so selection is preserved across
   * programmatic updates.
   */
  applyScene(scene: TScene, options?: ApplySceneOptions): void;

  getSelectedIds(): readonly string[];
  setSelectedIds(ids: readonly string[]): void;

  /** Subscribe to canvas content changes. Returns an unsubscribe fn. */
  onChange(listener: (scene: TScene) => void): () => void;
  /** Subscribe to selection changes. Returns an unsubscribe fn. */
  onSelectionChange(listener: (ids: readonly string[]) => void): () => void;
}
