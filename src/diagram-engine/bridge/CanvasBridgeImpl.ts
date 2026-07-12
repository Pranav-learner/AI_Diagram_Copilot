/**
 * CanvasBridgeImpl — wires the {@link CanvasPort} to the {@link DiagramRuntime}.
 *
 * On a canvas change: if the apply-lock is held it's a synchronous echo → drop
 * immediately; otherwise coalesce and, on flush, run the guarded
 * `LiveSynchronizer.fromCanvas`. On a `program`-origin runtime commit: apply the
 * change back to the canvas (`toCanvas`). Selection flows through untouched by
 * the DSL and is surfaced for observers.
 */

import type { DiagramDocument } from '@/dsl';
import type { RenderingEngine } from '../renderer/RenderingEngine';
import { EventEmitter } from '../events/EventEmitter';
import type { DiagramRuntime } from '../runtime/DiagramRuntime';
import { TransactionManager } from '../sync/TransactionManager';
import { VersionManager } from '../sync/VersionManager';
import { LiveSynchronizer } from '../sync/LiveSynchronizer';
import type { CanvasPort } from './CanvasPort';
import type { CanvasBridge, Scheduler } from './CanvasBridge';
import { immediateScheduler } from './CanvasBridge';
import type { BridgeEventMap } from './BridgeEvents';
import { BridgeEventName } from './BridgeEvents';

export interface CanvasBridgeOptions<TScene> {
  readonly engine: RenderingEngine;
  readonly runtime: DiagramRuntime;
  readonly port: CanvasPort<TScene>;
  /** Cheap echo signature for a scene. */
  readonly signature: (scene: TScene) => string;
  readonly rendererId?: string;
  /** Coalesces the canvas change stream (default: immediate — no coalescing). */
  readonly scheduler?: Scheduler;
  /** Holds the apply-lock across an async echo window; sync release if absent. */
  readonly settleScheduler?: (release: () => void) => void;
}

export class CanvasBridgeImpl<TScene> implements CanvasBridge {
  readonly events = new EventEmitter<BridgeEventMap>();

  private readonly transactions = new TransactionManager();
  private readonly versions = new VersionManager();
  private readonly sync: LiveSynchronizer<TScene>;
  private readonly scheduler: Scheduler;

  private readonly unsubscribers: Array<() => void> = [];
  private pendingScene: TScene | null = null;
  private selection: readonly string[] = [];
  private started = false;

  constructor(private readonly options: CanvasBridgeOptions<TScene>) {
    this.scheduler = options.scheduler ?? immediateScheduler;
    this.sync = new LiveSynchronizer<TScene>({
      engine: options.engine,
      runtime: options.runtime,
      port: options.port,
      transactions: this.transactions,
      versions: this.versions,
      events: this.events,
      signature: options.signature,
      rendererId: options.rendererId,
      settleScheduler: options.settleScheduler,
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { port, runtime, signature } = this.options;

    // Seed the echo guard with the scene already on the canvas, so the initial
    // mount `onChange` (which mirrors the current DSL) is recognized and dropped.
    this.versions.markApplied(signature(port.getScene()));
    this.selection = port.getSelectedIds();

    this.unsubscribers.push(port.onChange((scene) => this.handleCanvasChange(scene)));
    this.unsubscribers.push(
      port.onSelectionChange((ids) => this.handleSelectionChange(ids)),
    );
    // Program-origin commits (future AI, inspector-via-DSL) render back to canvas.
    this.unsubscribers.push(
      runtime.events.on('commit', ({ state, previous }) => {
        if (state.origin === 'program') this.applyToCanvas(previous.document, state.document);
      }),
    );
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.scheduler.cancel();
    this.pendingScene = null;
    this.started = false;
  }

  getSelection(): readonly string[] {
    return this.selection;
  }

  setSelection(ids: readonly string[]): void {
    this.options.port.setSelectedIds(ids);
    this.selection = ids;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private handleCanvasChange(scene: TScene): void {
    // Synchronous echo of our own write → drop without scheduling a parse.
    if (this.transactions.isApplying) {
      this.events.emit(BridgeEventName.EchoDropped, { reason: 'lock' });
      return;
    }
    this.pendingScene = scene;
    this.scheduler.schedule(() => this.flush());
  }

  private flush(): void {
    const scene = this.pendingScene;
    this.pendingScene = null;
    if (scene === null) return;
    try {
      const committed = this.sync.fromCanvas(scene);
      this.events.emit(BridgeEventName.CanvasChanged, { committed });
    } catch (error) {
      this.events.emit(BridgeEventName.Error, { error: error as Error });
    }
  }

  private applyToCanvas(prev: DiagramDocument, next: DiagramDocument): void {
    try {
      this.sync.toCanvas(prev, next);
    } catch (error) {
      this.events.emit(BridgeEventName.Error, { error: error as Error });
    }
  }

  private handleSelectionChange(ids: readonly string[]): void {
    this.selection = ids;
    this.events.emit(BridgeEventName.SelectionChanged, { ids });
  }
}
