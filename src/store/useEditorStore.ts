import { create } from 'zustand';
import type { ConnectionStatus } from '@/types';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CursorPosition {
  x: number;
  y: number;
}

/**
 * Editor canvas UI state. These are placeholders for Module 2, when the real
 * diagram engine is plugged in — for now the status bar and inspector read
 * from here so the wiring is already in place.
 */
interface EditorState {
  /** Zoom level as a percentage (100 = 100%). */
  zoom: number;
  /** Currently selected element id, or null when nothing is selected. */
  selectedElementId: string | null;
  /** Logical canvas dimensions shown in the status bar. */
  canvasSize: CanvasSize;
  /** Pointer position over the canvas, in canvas coordinates. */
  cursor: CursorPosition;
  connectionStatus: ConnectionStatus;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setSelectedElementId: (id: string | null) => void;
  setCursor: (cursor: CursorPosition) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const ZOOM_STEP = 10;

const clampZoom = (value: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));

export const useEditorStore = create<EditorState>()((set) => ({
  zoom: 100,
  selectedElementId: null,
  canvasSize: { width: 1920, height: 1080 },
  cursor: { x: 0, y: 0 },
  connectionStatus: 'connected',

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  zoomIn: () => set((state) => ({ zoom: clampZoom(state.zoom + ZOOM_STEP) })),
  zoomOut: () => set((state) => ({ zoom: clampZoom(state.zoom - ZOOM_STEP) })),
  resetZoom: () => set({ zoom: 100 }),
  setSelectedElementId: (selectedElementId) => set({ selectedElementId }),
  setCursor: (cursor) => set({ cursor }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
