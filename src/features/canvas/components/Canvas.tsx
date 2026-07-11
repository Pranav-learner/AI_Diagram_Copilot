import { useCallback, useMemo, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import './canvas-overrides.css';

import { Loader2 } from 'lucide-react';
import { useMediaQuery } from '@/hooks';
import { useThemeStore } from '@/store';
import { useCanvasAdapter } from '../hooks/useCanvas';
import { useCanvasReady } from '../hooks/useCanvasState';
import type { PointerUpdatePayload } from '../adapters/ExcalidrawAdapter';
import { documentToInitialData } from '../persistence/sceneSerialization';
import { CanvasErrorBoundary } from './CanvasErrorBoundary';
import { CanvasToolbar } from './CanvasToolbar';

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

interface CanvasProps {
  /** Persisted document to hydrate the canvas with. Read once on mount. */
  initialDocument?: unknown;
}

/**
 * Embeds Excalidraw and connects it to the {@link ExcalidrawAdapter}. This is a
 * thin host: it forwards the imperative API and pointer updates to the adapter,
 * hydrates from a persisted document, and renders the app's own toolbar overlay.
 * All behavior lives in the engine.
 */
export function Canvas({ initialDocument }: CanvasProps) {
  const adapter = useCanvasAdapter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Excalidraw consumes `initialData` once at mount; compute it up front.
  const initialDataRef = useRef(documentToInitialData(initialDocument));

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
          initialData={initialDataRef.current}
          UIOptions={UI_OPTIONS}
        />
        <CanvasToolbar />
        <CanvasLoadingOverlay />
      </div>
    </CanvasErrorBoundary>
  );
}
