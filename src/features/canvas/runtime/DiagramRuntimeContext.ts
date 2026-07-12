import { createContext } from 'react';
import type { DiagramRuntime, CanvasBridge } from '@/diagram-engine';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

/**
 * The live-runtime context: the DSL runtime (source of truth), the bridge
 * coordinating canvas ⇄ DSL, and the Excalidraw `initialData` the canvas mounts
 * with. Provided by {@link DiagramRuntimeProvider}.
 */
export interface DiagramRuntimeContextValue {
  readonly runtime: DiagramRuntime;
  readonly bridge: CanvasBridge;
  readonly initialData: ExcalidrawInitialDataState | null;
}

export const DiagramRuntimeContext = createContext<DiagramRuntimeContextValue | null>(null);
