import { describe, it, expect } from 'vitest';
import { equals, stableStringify } from '@/dsl';
import type { SemanticType } from '@/dsl';
import type { ExcalidrawScene, ExElement } from '..';
import { makeModel, makeEngine } from './helpers';
import { CUSTOM_DATA_KEY } from '..';

/** Render a document, parse it back, and expose both plus the scene. */
function roundTrip(build: (model: ReturnType<typeof makeModel>) => void) {
  const model = makeModel();
  build(model);
  const engine = makeEngine();
  const { scene } = engine.render<ExcalidrawScene, ExElement>(model.document);
  const { document } = engine.parse<ExcalidrawScene, ExElement>(scene);
  return { original: model.document, parsed: document, scene, engine };
}

describe('DSL ⇄ Excalidraw round-trip', () => {
  it('preserves a plain shape node exactly', () => {
    const { original, parsed } = roundTrip((m) =>
      m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 5, y: 7 }, size: { width: 80, height: 40 } }),
    );
    expect(equals(parsed, original)).toBe(true);
  });

  it('preserves every semantic node type (shape degraded but restored via escrow)', () => {
    const semantics: SemanticType[] = [
      'database',
      'queue',
      'api',
      'cache',
      'server',
      'cloud',
      'service',
      'decision',
    ];
    for (const semantic of semantics) {
      const { original, parsed, scene } = roundTrip((m) =>
        m.createNode({ type: 'shape', semantic }),
      );
      expect(equals(parsed, original)).toBe(true);
      // The escrow carries the DSL entity so `semantic` survives the degrade.
      const primary = scene.elements.find((e) => e.customData?.[CUSTOM_DATA_KEY]);
      expect(primary).toBeDefined();
    }
  });

  it('preserves text, image, icon, container, and custom nodes', () => {
    const { original, parsed } = roundTrip((m) => {
      m.createNode({ type: 'text', text: 'hello world' });
      m.createNode({ type: 'image', src: 'https://x/y.png', alt: 'y' });
      m.createNode({ type: 'icon', icon: 'star' });
      m.createNode({ type: 'container', childIds: [] });
      m.createNode({ type: 'shape', shape: 'cloud', semantic: 'custom' });
    });
    expect(equals(parsed, original)).toBe(true);
  });

  it('preserves node labels via a bound text element', () => {
    const { original, parsed, scene } = roundTrip((m) =>
      m.createNode({ type: 'shape', shape: 'rectangle', label: { text: 'Payment' } }),
    );
    expect(equals(parsed, original)).toBe(true);
    // The label renders as a bound text element (containerId set), not a node.
    const label = scene.elements.find((e) => e.type === 'text');
    expect(label?.type === 'text' && label.containerId).toBeTruthy();
  });

  it('preserves styles (fill, stroke, opacity, corner radius, and shadow via escrow)', () => {
    const { original, parsed } = roundTrip((m) =>
      m.createNode({
        type: 'shape',
        shape: 'rectangle',
        style: {
          fill: { color: '#ffcc00' },
          stroke: { color: '#333333', width: 3, style: 'dashed' },
          opacity: 0.5,
          cornerRadius: 12,
          shadow: { color: '#000000', blur: 4 },
        },
      }),
    );
    expect(equals(parsed, original)).toBe(true);
  });

  it('preserves edges: routing, arrowheads, label, and waypoints', () => {
    const { original, parsed } = roundTrip((m) => {
      const a = m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 0, y: 0 } });
      const b = m.createNode({ type: 'shape', shape: 'rectangle', position: { x: 300, y: 0 } });
      m.createEdge({
        source: { nodeId: a.id },
        target: { nodeId: b.id },
        routing: 'orthogonal',
        arrowheads: { start: 'circle', end: 'triangle' },
        label: { text: 'calls' },
        waypoints: [{ x: 150, y: 60 }],
      });
    });
    expect(equals(parsed, original)).toBe(true);
  });

  it('preserves nested groups and frames', () => {
    const { original, parsed } = roundTrip((m) => {
      const n1 = m.createNode({ type: 'shape', shape: 'rectangle' });
      const n2 = m.createNode({ type: 'shape', shape: 'ellipse' });
      const inner = m.createGroup({ name: 'inner' });
      m.addToGroup(inner.id, n1.id);
      const frame = m.createGroup({ kind: 'frame', name: 'frame', childIds: [] });
      m.addToGroup(frame.id, n2.id);
      m.addToGroup(frame.id, inner.id); // nesting: frame ⊃ inner ⊃ n1
    });
    expect(equals(parsed, original)).toBe(true);
  });

  it('preserves the viewport', () => {
    const { original, parsed } = roundTrip((m) => {
      m.createNode({ type: 'shape', shape: 'rectangle' });
      m.setViewport({ zoom: 1.5, pan: { x: 40, y: 90 }, background: '#f0f0f0' });
    });
    expect(equals(parsed, original)).toBe(true);
  });

  it('is scene-stable across render → parse → render', () => {
    const { scene, parsed, engine } = roundTrip((m) => {
      const a = m.createNode({ type: 'shape', semantic: 'service', label: { text: 'API' } });
      const b = m.createNode({ type: 'shape', semantic: 'database' });
      m.createEdge({ source: { nodeId: a.id }, target: { nodeId: b.id }, label: { text: 'reads' } });
    });
    const scene2 = engine.render<ExcalidrawScene, ExElement>(parsed).scene;
    expect(stableStringify(scene2)).toBe(stableStringify(scene));
  });

  it('render is deterministic (same document → identical scene)', () => {
    const build = (m: ReturnType<typeof makeModel>) => {
      m.createNode({ type: 'shape', shape: 'diamond', label: { text: 'x' } });
    };
    const m1 = makeModel();
    build(m1);
    const m2 = makeModel();
    build(m2);
    const s1 = makeEngine().render<ExcalidrawScene, ExElement>(m1.document).scene;
    const s2 = makeEngine().render<ExcalidrawScene, ExElement>(m2.document).scene;
    expect(stableStringify(s1)).toBe(stableStringify(s2));
  });
});
