import type { ExecutionEvent } from './ExecutionEvent';

export type EventCallback<T extends ExecutionEvent = ExecutionEvent> = (event: T) => void | Promise<void>;

export class EventBus {
  private readonly listeners = new Map<string, EventCallback[]>();
  private readonly wildcardListeners: EventCallback[] = [];

  subscribe<T extends ExecutionEvent>(type: T['type'], callback: EventCallback<T>): () => void {
    const list = this.listeners.get(type) || [];
    list.push(callback as EventCallback);
    this.listeners.set(type, list);

    return () => {
      const currentList = this.listeners.get(type);
      if (currentList) {
        const idx = currentList.indexOf(callback as EventCallback);
        if (idx !== -1) {
          currentList.splice(idx, 1);
        }
      }
    };
  }

  subscribeAll(callback: EventCallback): () => void {
    this.wildcardListeners.push(callback);
    return () => {
      const idx = this.wildcardListeners.indexOf(callback);
      if (idx !== -1) {
        this.wildcardListeners.splice(idx, 1);
      }
    };
  }

  async publish(event: ExecutionEvent): Promise<void> {
    const specific = this.listeners.get(event.type) || [];
    const listeners = [...specific, ...this.wildcardListeners];

    await Promise.all(
      listeners.map(async (listener) => {
        try {
          await listener(event);
        } catch {
          // Suppress errors to avoid blocking the event bus
        }
      })
    );
  }
}
