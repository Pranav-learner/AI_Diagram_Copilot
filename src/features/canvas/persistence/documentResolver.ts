/**
 * Resolve a persisted payload into the editor's initial state.
 *
 * The backend stores an opaque JSON blob. Module 3 makes that blob a DSL
 * {@link DiagramDocument}; earlier modules stored a `{schema:'excalidraw'}` scene
 * envelope. This resolver handles both plus the empty case, producing the initial
 * DSL document (the runtime's source of truth) and the Excalidraw `initialData`
 * used to hydrate the canvas at mount.
 */

import { DiagramModel, deserialize, isDiagramDocumentShape } from '@/dsl';
import type { DiagramDocument } from '@/dsl';
import type { RenderingEngine, ExcalidrawScene } from '@/diagram-engine';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { documentToInitialData } from './sceneSerialization';

export interface InitialEditorState {
  readonly document: DiagramDocument;
  readonly initialData: ExcalidrawInitialDataState | null;
}

function sceneToInitialData(scene: ExcalidrawScene): ExcalidrawInitialDataState {
  return {
    elements: scene.elements as unknown as ExcalidrawInitialDataState['elements'],
    appState: {
      scrollX: scene.appState.scrollX,
      scrollY: scene.appState.scrollY,
      zoom: scene.appState.zoom as never,
      viewBackgroundColor: scene.appState.viewBackgroundColor,
    },
    files: scene.files as unknown as ExcalidrawInitialDataState['files'],
    scrollToContent: false,
  };
}

interface ExcalidrawEnvelope {
  schema?: string;
  scene?: { elements?: unknown; appState?: unknown; files?: unknown };
}

/** Turn a stored payload into { initial DSL document, canvas initialData }. */
export function resolveInitialState(data: unknown, engine: RenderingEngine): InitialEditorState {
  // 1. Already a DSL document (the Module-3 format).
  if (isDiagramDocumentShape(data)) {
    const document = deserialize(data);
    const scene = engine.render<ExcalidrawScene, unknown>(document).scene;
    return { document, initialData: sceneToInitialData(scene) };
  }

  // 2. Legacy Excalidraw envelope → parse the scene into the DSL (one-time
  //    migration); hydrate the canvas from the same scene.
  const envelope = data as ExcalidrawEnvelope | null;
  if (envelope && envelope.schema === 'excalidraw' && envelope.scene) {
    const exScene: ExcalidrawScene = {
      elements: (envelope.scene.elements ?? []) as ExcalidrawScene['elements'],
      appState: (envelope.scene.appState ?? {}) as ExcalidrawScene['appState'],
      files: (envelope.scene.files ?? {}) as ExcalidrawScene['files'],
    };
    const document = engine.parse<ExcalidrawScene, unknown>(exScene).document;
    return { document, initialData: documentToInitialData(data) };
  }

  // 3. Empty / unknown → a fresh, empty DSL document.
  const document = DiagramModel.create().document;
  const scene = engine.render<ExcalidrawScene, unknown>(document).scene;
  return { document, initialData: sceneToInitialData(scene) };
}
