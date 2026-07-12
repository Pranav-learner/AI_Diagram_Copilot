import { useCallback, useMemo, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import './canvas-overrides.css';

import { Loader2 } from 'lucide-react';
import { useMediaQuery } from '@/hooks';
import { useThemeStore } from '@/store';
import { useCanvasAdapter } from '../hooks/useCanvas';
import { useCanvasReady, useGridEnabled } from '../hooks/useCanvasState';
import { useDiagramInitialData } from '../runtime/useDiagramRuntime';
import type { PointerUpdatePayload } from '../adapters/ExcalidrawAdapter';
import { CanvasErrorBoundary } from './CanvasErrorBoundary';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasSelectionActions } from './CanvasSelectionActions';

// Stable prop identities so Excalidraw never re-processes them on re-render.
const UI_OPTIONS = {
  canvasActions: {
    export: false as const,
    saveToActiveFile: false,
    saveAsImage: false,
    loadScene: false,
    toggleTheme: false,
  },
} as const;

/** Overlay shown until the engine reports the canvas is ready. */
function CanvasLoadingOverlay() {
  const isReady = useCanvasReady();
  if (isReady) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Preparing canvas…
      </span>
    </div>
  );
}

/**
 * Embeds Excalidraw and connects it to the {@link ExcalidrawAdapter}. This is a
 * thin host: it forwards the imperative API and pointer updates to the adapter,
 * hydrates from the runtime's `initialData` (derived from the DSL document), and
 * renders the app's own toolbar overlay. All behavior lives in the engine.
 */
export function Canvas() {
  const adapter = useCanvasAdapter();
  const containerRef = useRef<HTMLDivElement>(null);
  const gridEnabled = useGridEnabled();

  // Excalidraw consumes `initialData` once at mount; the runtime derives it from
  // the persisted DSL document.
  const initialDataRef = useRef(useDiagramInitialData());

  const themePreference = useThemeStore((s) => s.theme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedTheme = useMemo(
    () =>
      themePreference === 'system'
        ? prefersDark
          ? 'dark'
          : 'light'
        : themePreference,
    [themePreference, prefersDark],
  );

  const handleAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      adapter.attach(api, containerRef.current);
    },
    [adapter],
  );

  const handlePointerUpdate = useCallback(
    (payload: PointerUpdatePayload) => {
      adapter.handlePointerUpdate(payload);
    },
    [adapter],
  );

  const handleError = useCallback(
    (message: string) => adapter.reportError(message),
    [adapter],
  );

  return (
    <CanvasErrorBoundary onError={handleError}>
      <div ref={containerRef} className="adc-canvas absolute inset-0">
        <Excalidraw
          excalidrawAPI={handleAPI}
          onPointerUpdate={handlePointerUpdate}
          theme={resolvedTheme}
          handleKeyboardGlobally
          autoFocus
          gridModeEnabled={gridEnabled}
          initialData={initialDataRef.current}
          UIOptions={UI_OPTIONS}
        />
        <CanvasToolbar />
        <CanvasSelectionActions />
        <CanvasLoadingOverlay />
      </div>
    </CanvasErrorBoundary>
  );
}
