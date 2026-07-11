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
  useGridEnabled,
  useSelectionCount,
  useSceneVersion,
  useCanvasReady,
  useCanvasError,
  useCanvasStatus,
  useCanvasSelection,
  useCanvasHistory,
  type CanvasStatus,
  type HistoryState,
} from './hooks/useCanvasState';

// Persistence (scene ⇄ document). The engine never touches the network/SQL;
// these pure helpers translate between the canvas scene and the stored doc.
export {
  serializeScene,
  documentToInitialData,
  type DiagramDocument,
} from './persistence/sceneSerialization';

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
  ElementStyleUpdate,
  ArrowheadStyle,
  TextAlign,
  CanvasScene,
  CanvasSnapshot,
} from './types/canvas';
