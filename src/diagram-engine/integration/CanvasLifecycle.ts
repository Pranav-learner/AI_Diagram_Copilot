/**
 * CanvasLifecycle — idempotent start/dispose around a {@link CanvasBridge}.
 *
 * React effects (and hot reload) can fire start/cleanup more than once; this
 * guards against double-attaching listeners or disposing twice.
 */

import type { CanvasBridge } from '../bridge/CanvasBridge';

export class CanvasLifecycle {
  private started = false;

  constructor(private readonly bridge: CanvasBridge) {}

  get isStarted(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.bridge.start();
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.bridge.dispose();
  }
}
