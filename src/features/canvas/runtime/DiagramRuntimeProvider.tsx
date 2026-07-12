import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  createExcalidrawEngine,
  createEditorIntegration,
  createTimeoutScheduler,
  type EditorIntegration,
  type ExcalidrawScene,
} from '@/diagram-engine';
import { useCanvas } from '../hooks/useCanvas';
import { useCanvasReady } from '../hooks/useCanvasState';
import { ExcalidrawCanvasPort, excalidrawSceneSignature } from './ExcalidrawCanvasPort';
import { resolveInitialState, type InitialEditorState } from '../persistence/documentResolver';
import { DiagramRuntimeContext } from './DiagramRuntimeContext';

/** How long the canvas change stream is coalesced before a DSL ingest. */
const INGEST_COALESCE_MS = 120;

interface DiagramRuntimeProviderProps {
  /** The persisted payload (DSL document or legacy scene envelope). */
  data: unknown;
  children: ReactNode;
}

/**
 * Builds the live runtime: a rendering engine, a canvas port over the
 * {@link CanvasEngine}, and the {@link EditorIntegration} wiring them to the DSL.
 * Starts live sync once the canvas is ready and disposes on unmount.
 *
 * The engine runs with validation OFF — the canvas is a direct-manipulation
 * surface that can produce transiently-invalid states (an arrow mid-draw); the
 * editor must never throw on a render. Validation is available on demand for the
 * AI/review modules via `runtime.getDocument()` + `validate()`.
 */
export function DiagramRuntimeProvider({ data, children }: DiagramRuntimeProviderProps) {
  const engineAdapter = useCanvas();
  const isReady = useCanvasReady();

  // Construct the engine + integration exactly once for this editor session.
  const setupRef = useRef<{ integration: EditorIntegration; initial: InitialEditorState } | null>(
    null,
  );
  if (setupRef.current === null) {
    const engine = createExcalidrawEngine({ config: { validate: false } });
    const initial = resolveInitialState(data, engine);
    const port = new ExcalidrawCanvasPort(engineAdapter);
    const integration = createEditorIntegration<ExcalidrawScene>({
      engine,
      port,
      initialDocument: initial.document,
      signature: excalidrawSceneSignature,
      scheduler: createTimeoutScheduler(INGEST_COALESCE_MS),
      // Hold the apply-lock across Excalidraw's async onChange echo.
      settleScheduler: (release) => setTimeout(release, 0),
    });
    setupRef.current = { integration, initial };
  }
  const { integration, initial } = setupRef.current;

  // Start live sync once the canvas is attached; dispose on unmount.
  useEffect(() => {
    if (isReady) integration.start();
  }, [isReady, integration]);

  useEffect(() => () => integration.dispose(), [integration]);

  // Operation-based undo/redo owns Ctrl/Cmd+Z: intercept at capture phase and
  // stop the event so Excalidraw's native history never fires (single source).
  useEffect(() => {
    const runtime = integration.runtime;
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return; // let text fields handle their own undo
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) runtime.redo();
      else runtime.undo();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [integration]);

  const value = useMemo(
    () => ({ runtime: integration.runtime, bridge: integration.bridge, initialData: initial.initialData }),
    [integration, initial],
  );

  return (
    <DiagramRuntimeContext.Provider value={value}>{children}</DiagramRuntimeContext.Provider>
  );
}
