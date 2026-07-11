/**
 * Public API of the Canvas feature.
 *
 * The rest of the app imports ONLY from here. Excalidraw, the adapter, and the
 * store internals stay private to the module — future modules (AI, export, …)
 * depend on `CanvasEngine` and these components, never on Excalidraw.
 */

// Provider + engine access
export { CanvasProvider } from './context/CanvasProvider';
export { useCanvas } from './hooks/useCanvas';

// Reactive state selectors
export {
  useActiveTool,
  useCanvasReady,
  useCanvasError,
  useCanvasStatus,
  useCanvasSelection,
  useCanvasHistory,
  type CanvasStatus,
  type HistoryState,
} from './hooks/useCanvasState';

// UI surfaces
export { Canvas } from './components/Canvas';
export { CanvasToolbar } from './components/CanvasToolbar';
export { CanvasInspector } from './components/CanvasInspector';
export { CanvasStatusBar } from './components/CanvasStatusBar';

// Types + engine contract
export { type CanvasEngine, ZOOM } from './CanvasEngine';
export type {
  CanvasTool,
  CanvasElementType,
  SelectedElement,
  CanvasScene,
  CanvasSnapshot,
} from './types/canvas';
