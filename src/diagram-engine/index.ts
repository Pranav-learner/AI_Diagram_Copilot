/**
 * The Diagram Engine — public API barrel.
 *
 * A pure, renderer-agnostic rendering & synchronization layer that translates the
 * Diagram DSL to and from concrete scenes. Import everything from
 * `@/diagram-engine`; never reach into subpaths. The engine imports `@/dsl` and
 * nothing else — no Excalidraw, React, or backend.
 *
 * Typical use:
 * ```ts
 * import { createExcalidrawEngine } from '@/diagram-engine';
 * const engine = createExcalidrawEngine();
 * const { scene } = engine.render(doc);          // DSL → Excalidraw scene
 * const { changeSet } = engine.sync(prev, next, scene); // minimal update
 * const { document } = engine.parse(editedScene);       // scene → DSL
 * ```
 */

import { RenderingEngine } from './renderer/RenderingEngine';
import type { RenderingEngineOptions } from './renderer/RenderingEngine';
import { RendererRegistry } from './renderer/RendererRegistry';
import { excalidrawRenderer } from './renderers/excalidraw/ExcalidrawRenderer';

// ── Engine core ───────────────────────────────────────────────────────────────
export * from './types';
export * from './errors';
export * from './events/events';
export * from './events/EventEmitter';
export * from './renderer/Renderer';
export * from './renderer/RendererConfig';
export * from './renderer/RendererContext';
export * from './renderer/RendererRegistry';
export * from './renderer/RenderingEngine';

// ── Synchronization ─────────────────────────────────────────────────────────
export * from './sync/SceneDiff';
export * from './sync/SceneComparator';
export * from './sync/SceneSynchronizer';

// ── Live runtime (Module 3) ───────────────────────────────────────────────────
export * from './state/DiagramState';
export * from './sync/OriginTracker';
export * from './sync/TransactionManager';
export * from './sync/VersionManager';
export * from './sync/LiveSynchronizer';
export * from './bridge/CanvasPort';
export * from './bridge/BridgeEvents';
export * from './bridge/CanvasBridge';
export * from './bridge/CanvasBridgeImpl';
export * from './integration/CanvasLifecycle';
export * from './integration/EditorIntegration';

// ── Operation runtime (Module 4) ──────────────────────────────────────────────
export * from './runtime/DiagramRuntime';
export * from './runtime/OperationExecutor';
export * from './runtime/OperationDispatcher';
export * from './runtime/OperationRegistry';
export * from './operations'; // Operation, factories, createDefaultOperationRegistry
export * from './validation/OperationValidator';
export * from './validation/validators';
export * from './patch/DocumentPatch';
export * from './events/RuntimeEvents';
export * from './events/RuntimeEventBus';
export type { HistoryEntry, HistoryConfig } from './history/HistoryManager';

// ── Excalidraw renderer ───────────────────────────────────────────────────────
export * from './renderers/excalidraw/types';
export * from './renderers/excalidraw/constants';
export * from './renderers/excalidraw/escrow';
export * from './renderers/excalidraw/ExcalidrawRenderer';

/**
 * Convenience: a {@link RenderingEngine} preconfigured with the Excalidraw
 * renderer registered as the default. Most callers want this.
 */
export function createExcalidrawEngine(options?: RenderingEngineOptions): RenderingEngine {
  const registry = new RendererRegistry().register(excalidrawRenderer);
  return new RenderingEngine(registry, { defaultRenderer: 'excalidraw', ...options });
}
