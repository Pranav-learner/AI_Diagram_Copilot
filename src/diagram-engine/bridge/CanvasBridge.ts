/**
 * CanvasBridge interface + the coalescing scheduler.
 *
 * The bridge is the single coordinator between the canvas and the DSL runtime.
 * `start()` attaches listeners and seeds the echo guard; `dispose()` tears
 * everything down. A {@link Scheduler} coalesces the canvas's high-frequency
 * `onChange` stream (every pointer tick of a drag) into a single ingest, keeping
 * large diagrams smooth.
 */

import type { EventEmitter } from '../events/EventEmitter';
import type { BridgeEventMap } from './BridgeEvents';

export interface CanvasBridge {
  /** Attach listeners and seed guards. Idempotent lifecycle is the caller's job. */
  start(): void;
  dispose(): void;
  getSelection(): readonly string[];
  setSelection(ids: readonly string[]): void;
  readonly events: EventEmitter<BridgeEventMap>;
}

/** Coalesces repeated `schedule` calls into one trailing task. */
export interface Scheduler {
  schedule(task: () => void): void;
  cancel(): void;
}

/** Runs the task synchronously — no coalescing (tests, or a caller that batches). */
export const immediateScheduler: Scheduler = {
  schedule: (task) => task(),
  cancel: () => {},
};

/** Trailing-debounce scheduler: many `schedule` calls → one run after `delayMs`. */
export function createTimeoutScheduler(delayMs: number): Scheduler {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(task) {
      if (handle !== null) clearTimeout(handle);
      handle = setTimeout(() => {
        handle = null;
        task();
      }, delayMs);
    },
    cancel() {
      if (handle !== null) {
        clearTimeout(handle);
        handle = null;
      }
    },
  };
}

/** A manually-flushed scheduler for deterministic tests. */
export function createManualScheduler(): Scheduler & { flush(): void; readonly pending: boolean } {
  let queued: (() => void) | null = null;
  return {
    schedule(task) {
      queued = task;
    },
    cancel() {
      queued = null;
    },
    flush() {
      const task = queued;
      queued = null;
      task?.();
    },
    get pending() {
      return queued !== null;
    },
  };
}
