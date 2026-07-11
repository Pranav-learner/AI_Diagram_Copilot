import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { CanvasScene } from '../types/canvas';

/**
 * The persisted diagram document.
 *
 * A small versioned envelope around the Excalidraw scene. The `schema` and
 * `version` discriminators are the seam for the Phase 2 Diagram-DSL migration:
 * new formats add a new `schema` value, and a loader can branch on it without
 * touching storage. The backend stores this as opaque JSON — only this module
 * knows its shape.
 */
export interface DiagramDocument {
  schema: 'excalidraw';
  version: 1;
  scene: {
    elements: readonly object[];
    appState: PersistedAppState;
    files: Record<string, unknown>;
  };
}

/** The curated slice of Excalidraw appState worth persisting (viewport, bg). */
interface PersistedAppState {
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
  viewBackgroundColor?: string;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Extract the persistable viewport/appearance fields from raw appState. */
function pickAppState(appState: Record<string, unknown> = {}): PersistedAppState {
  const zoom = appState.zoom as { value?: number } | number | undefined;
  return {
    scrollX: asNumber(appState.scrollX),
    scrollY: asNumber(appState.scrollY),
    zoom: asNumber(typeof zoom === 'object' ? zoom?.value : zoom),
    viewBackgroundColor:
      typeof appState.viewBackgroundColor === 'string'
        ? appState.viewBackgroundColor
        : undefined,
  };
}

/** Turn the engine's current scene into a persistable document. */
export function serializeScene(scene: CanvasScene): DiagramDocument {
  return {
    schema: 'excalidraw',
    version: 1,
    scene: {
      elements: scene.elements,
      appState: pickAppState(scene.appState),
      files: scene.files ?? {},
    },
  };
}

/** True for a valid, non-empty persisted document. */
function isDiagramDocument(value: unknown): value is DiagramDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scene' in value &&
    typeof (value as DiagramDocument).scene === 'object'
  );
}

/**
 * Convert a persisted document into Excalidraw `initialData` for mounting. An
 * empty/absent document yields `null` (a blank canvas). Viewport fields are
 * restored so the user reopens exactly where they left off.
 */
export function documentToInitialData(
  data: unknown,
): ExcalidrawInitialDataState | null {
  if (!isDiagramDocument(data)) return null;

  const { elements, appState, files } = data.scene;
  return {
    elements: (elements ?? []) as ExcalidrawInitialDataState['elements'],
    appState: {
      scrollX: appState?.scrollX,
      scrollY: appState?.scrollY,
      zoom: appState?.zoom != null ? { value: appState.zoom as never } : undefined,
      viewBackgroundColor: appState?.viewBackgroundColor,
    },
    files: (files ?? {}) as ExcalidrawInitialDataState['files'],
    scrollToContent: false,
  };
}
