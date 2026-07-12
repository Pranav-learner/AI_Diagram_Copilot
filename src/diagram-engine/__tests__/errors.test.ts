import { describe, it, expect } from 'vitest';
import type { NodeId } from '@/dsl';
import type { ExcalidrawScene, ExElement } from '..';
import {
  RenderError,
  RendererNotFoundError,
  RenderingEngine,
  createExcalidrawEngine,
  CUSTOM_DATA_KEY,
  EXCALIDRAW_META_KEY,
} from '..';
import { makeModel, makeEngine } from './helpers';

describe('error handling & graceful recovery', () => {
  it('refuses to render an invalid document', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape', shape: 'rectangle' });
    model.createEdge({ source: { nodeId: a.id }, target: { nodeId: 'node_missing' as NodeId } });
    expect(() => makeEngine().render<ExcalidrawScene, ExElement>(model.document)).toThrow(RenderError);
  });

  it('downgrades a dangling edge to a warning when validation is off', () => {
    const model = makeModel();
    const a = model.createNode({ type: 'shape', shape: 'rectangle' });
    model.createEdge({ source: { nodeId: a.id }, target: { nodeId: 'node_missing' as NodeId } });
    const engine = createExcalidrawEngine({ config: { validate: false, epoch: 1 } });
    const { warnings } = engine.render<ExcalidrawScene, ExElement>(model.document);
    expect(warnings.some((w) => w.code === 'edge.danglingEndpoint')).toBe(true);
  });

  it('throws when no renderer is registered', () => {
    const engine = new RenderingEngine(); // empty registry
    expect(() => engine.render<ExcalidrawScene, ExElement>(makeModel().document)).toThrow(
      RendererNotFoundError,
    );
  });

  it('parses a manually-authored element (no escrow) into a DSL node', () => {
    const model = makeModel();
    model.createNode({ type: 'shape', shape: 'rectangle', position: { x: 3, y: 4 } });
    const engine = makeEngine();
    const scene = engine.render<ExcalidrawScene, ExElement>(model.document).scene;

    // Strip all escrow to simulate an element drawn directly in Excalidraw.
    const stripped: ExcalidrawScene = {
      ...scene,
      elements: scene.elements.map((element) => ({ ...element, customData: undefined })),
      appState: { ...scene.appState, [CUSTOM_DATA_KEY]: undefined },
    };

    const { document } = engine.parse<ExcalidrawScene, ExElement>(stripped);
    const node = Object.values(document.nodes)[0];
    expect(node?.type).toBe('shape');
    expect(node?.position).toEqual({ x: 3, y: 4 });
    // Excalidraw-only fields are escrowed back into DSL metadata.
    expect(node?.metadata[EXCALIDRAW_META_KEY]).toBeDefined();
  });
});
