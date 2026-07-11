import { useContext } from 'react';
import type { CanvasEngine } from '../CanvasEngine';
import type { ExcalidrawAdapter } from '../adapters/ExcalidrawAdapter';
import { CanvasContext } from '../context/CanvasContext';

/**
 * Access the canvas engine. Returned as the {@link CanvasEngine} interface, so
 * UI code and future modules only ever depend on the abstraction — never
 * Excalidraw. This is the imperative half of the API; read reactive state with
 * the `useCanvas*` selector hooks.
 */
export function useCanvas(): CanvasEngine {
  const engine = useContext(CanvasContext);
  if (!engine) {
    throw new Error('useCanvas must be used within a <CanvasProvider>.');
  }
  return engine;
}

/**
 * Internal: the concrete adapter, for the Canvas host that must call
 * host-wiring methods. Not part of the public surface.
 */
export function useCanvasAdapter(): ExcalidrawAdapter {
  const adapter = useContext(CanvasContext);
  if (!adapter) {
    throw new Error('useCanvasAdapter must be used within a <CanvasProvider>.');
  }
  return adapter;
}
