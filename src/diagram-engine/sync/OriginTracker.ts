/**
 * Origin tracking — which side is currently driving a change.
 *
 * A stack (not a single flag) so nested operations compose: applying a program
 * change to the canvas may itself trigger a canvas `onChange` we must recognize
 * as program-originated (an echo), not a fresh user edit. `current` is the
 * innermost active origin.
 */

import type { ChangeOrigin } from '../state/DiagramState';

export class OriginTracker {
  private readonly stack: ChangeOrigin[] = [];

  get current(): ChangeOrigin | undefined {
    return this.stack[this.stack.length - 1];
  }

  is(origin: ChangeOrigin): boolean {
    return this.current === origin;
  }

  /** Run `fn` with `origin` marked active, popping it afterward (even on throw). */
  run<T>(origin: ChangeOrigin, fn: () => T): T {
    this.stack.push(origin);
    try {
      return fn();
    } finally {
      this.stack.pop();
    }
  }
}
