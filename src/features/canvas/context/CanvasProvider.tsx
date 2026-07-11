import { useEffect, useRef, type ReactNode } from 'react';
import { ExcalidrawAdapter } from '../adapters/ExcalidrawAdapter';
import { useCanvasStore } from '../state/useCanvasStore';
import { CanvasContext } from './CanvasContext';

/**
 * Creates a single engine instance for the editor and provides it via context.
 * The engine is wired to the canvas store through a tiny host adapter, so the
 * engine never imports Zustand directly.
 */
export function CanvasProvider({ children }: { children: ReactNode }) {
  const adapterRef = useRef<ExcalidrawAdapter | null>(null);

  if (adapterRef.current === null) {
    adapterRef.current = new ExcalidrawAdapter({
      patch: (partial) => useCanvasStore.getState().patch(partial),
      getSnapshot: () => useCanvasStore.getState(),
    });
  }

  useEffect(() => {
    const adapter = adapterRef.current;
    return () => {
      adapter?.destroy();
      useCanvasStore.getState().reset();
    };
  }, []);

  return (
    <CanvasContext.Provider value={adapterRef.current}>
      {children}
    </CanvasContext.Provider>
  );
}
