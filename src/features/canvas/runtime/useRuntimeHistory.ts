import { useCallback, useSyncExternalStore } from 'react';
import { useDiagramRuntime } from './useDiagramRuntime';

export interface RuntimeHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

/**
 * Reactive undo/redo availability + actions from the operation runtime. Re-renders
 * on `history:changed`. This is the operation-based replacement for Excalidraw's
 * native history — the runtime owns undo/redo now.
 */
export function useRuntimeHistory(): RuntimeHistory {
  const runtime = useDiagramRuntime();
  const subscribe = useCallback(
    (onChange: () => void) => runtime.events.on('history:changed', onChange),
    [runtime],
  );
  const canUndo = useSyncExternalStore(subscribe, () => runtime.canUndo);
  const canRedo = useSyncExternalStore(subscribe, () => runtime.canRedo);
  const undo = useCallback(() => void runtime.undo(), [runtime]);
  const redo = useCallback(() => void runtime.redo(), [runtime]);
  return { canUndo, canRedo, undo, redo };
}
