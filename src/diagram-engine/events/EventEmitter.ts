/**
 * A tiny, fully-typed event emitter.
 *
 * Generic over an event→payload map so `on`/`emit` are type-checked end to end.
 * `on` returns an unsubscribe function (no need to retain the handler reference).
 * Handler exceptions are isolated so one bad subscriber can't break emission.
 */

export type EventHandler<T> = (payload: T) => void;

export class EventEmitter<Events> {
  // Internally untyped (handlers for different keys have different payloads);
  // the public surface restores full type safety per key.
  private readonly handlers = new Map<keyof Events, Set<EventHandler<never>>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof Events>(name: K, handler: EventHandler<Events[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(name, handler);
  }

  /** Subscribe for a single emission. */
  once<K extends keyof Events>(name: K, handler: EventHandler<Events[K]>): () => void {
    const unsub = this.on(name, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  off<K extends keyof Events>(name: K, handler: EventHandler<Events[K]>): void {
    this.handlers.get(name)?.delete(handler as EventHandler<never>);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set] as EventHandler<Events[K]>[]) {
      try {
        handler(payload);
      } catch {
        // A subscriber throwing must not abort delivery to the others.
      }
    }
  }

  /** Remove all handlers (all events, or just one). */
  clear(name?: keyof Events): void {
    if (name === undefined) this.handlers.clear();
    else this.handlers.delete(name);
  }
}
