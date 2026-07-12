/**
 * EditorIntegration — one factory that assembles the live runtime.
 *
 * Given a canvas port, an initial DSL document, and an engine, it constructs the
 * {@link DiagramRuntime}, the {@link CanvasBridgeImpl}, and a
 * {@link CanvasLifecycle}, returning a small handle the host (a React provider)
 * drives. The host calls `start()` once the canvas is ready and `dispose()` on
 * unmount. This is the single wiring point — nothing above it needs to know how
 * the pieces connect.
 */

import type { DiagramDocument } from '@/dsl';
import type { RenderingEngine } from '../renderer/RenderingEngine';
import type { CanvasPort } from '../bridge/CanvasPort';
import type { CanvasBridge, Scheduler } from '../bridge/CanvasBridge';
import { CanvasBridgeImpl } from '../bridge/CanvasBridgeImpl';
import { DiagramRuntime } from '../state/DiagramRuntime';
import { CanvasLifecycle } from './CanvasLifecycle';

export interface EditorIntegrationOptions<TScene> {
  readonly engine: RenderingEngine;
  readonly port: CanvasPort<TScene>;
  readonly initialDocument: DiagramDocument;
  readonly signature: (scene: TScene) => string;
  readonly rendererId?: string;
  readonly scheduler?: Scheduler;
  readonly settleScheduler?: (release: () => void) => void;
}

export interface EditorIntegration {
  readonly runtime: DiagramRuntime;
  readonly bridge: CanvasBridge;
  readonly lifecycle: CanvasLifecycle;
  /** Attach listeners and begin live sync (idempotent). */
  start(): void;
  /** Tear everything down (idempotent). */
  dispose(): void;
}

export function createEditorIntegration<TScene>(
  options: EditorIntegrationOptions<TScene>,
): EditorIntegration {
  const runtime = new DiagramRuntime(options.initialDocument, 'load');
  const bridge = new CanvasBridgeImpl<TScene>({
    engine: options.engine,
    runtime,
    port: options.port,
    signature: options.signature,
    rendererId: options.rendererId,
    scheduler: options.scheduler,
    settleScheduler: options.settleScheduler,
  });
  const lifecycle = new CanvasLifecycle(bridge);

  return {
    runtime,
    bridge,
    lifecycle,
    start: () => lifecycle.start(),
    dispose: () => lifecycle.dispose(),
  };
}
