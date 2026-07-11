import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../state/useCanvasStore';
import type { CanvasTool, SelectedElement } from '../types/canvas';

/**
 * Reactive selector hooks over the canvas store. Each subscribes to the
 * narrowest slice it needs so a change to (say) the cursor doesn't re-render the
 * toolbar. Array/object slices use `useShallow` to compare by content.
 */

export function useActiveTool(): CanvasTool {
  return useCanvasStore((s) => s.activeTool);
}

export function useGridEnabled(): boolean {
  return useCanvasStore((s) => s.gridEnabled);
}

/** Number of currently selected elements. */
export function useSelectionCount(): number {
  return useCanvasStore((s) => s.selectedElementIds.length);
}

/** Scene version — changes whenever the diagram's elements change. */
export function useSceneVersion(): number {
  return useCanvasStore((s) => s.sceneVersion);
}

export function useCanvasReady(): boolean {
  return useCanvasStore((s) => s.isReady);
}

export function useCanvasError(): string | null {
  return useCanvasStore((s) => s.error);
}

export interface CanvasStatus {
  isReady: boolean;
  zoom: number;
  elementCount: number;
  selectedCount: number;
  cursor: { x: number; y: number } | null;
}

/** Aggregate slice for the status bar. */
export function useCanvasStatus(): CanvasStatus {
  return useCanvasStore(
    useShallow((s) => ({
      isReady: s.isReady,
      zoom: s.zoom,
      elementCount: s.elementCount,
      selectedCount: s.selectedElementIds.length,
      cursor: s.cursor,
    })),
  );
}

/** Selected elements for the inspector. */
export function useCanvasSelection(): readonly SelectedElement[] {
  return useCanvasStore(useShallow((s) => s.selectedElements));
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export function useCanvasHistory(): HistoryState {
  return useCanvasStore(
    useShallow((s) => ({ canUndo: s.canUndo, canRedo: s.canRedo })),
  );
}
