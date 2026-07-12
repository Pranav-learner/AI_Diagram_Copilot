import { useContext } from 'react';
import type { DiagramRuntime, CanvasBridge } from '@/diagram-engine';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { DiagramRuntimeContext } from './DiagramRuntimeContext';

function useRuntimeContext() {
  const ctx = useContext(DiagramRuntimeContext);
  if (!ctx) {
    throw new Error('useDiagramRuntime must be used within a <DiagramRuntimeProvider>.');
  }
  return ctx;
}

/** The DSL runtime — the live source of truth. Future AI modules mutate this. */
export function useDiagramRuntime(): DiagramRuntime {
  return useRuntimeContext().runtime;
}

/** The canvas bridge (selection access, bridge events). */
export function useDiagramBridge(): CanvasBridge {
  return useRuntimeContext().bridge;
}

/** The Excalidraw `initialData` computed from the persisted document. */
export function useDiagramInitialData(): ExcalidrawInitialDataState | null {
  return useRuntimeContext().initialData;
}
