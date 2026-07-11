import { create } from 'zustand';
import { INITIAL_SNAPSHOT, type CanvasSnapshot } from '../types/canvas';

interface CanvasStore extends CanvasSnapshot {
  /** Merge a partial snapshot; no-ops for unchanged primitive fields. */
  patch: (partial: Partial<CanvasSnapshot>) => void;
  /** Reset back to the initial (unattached) snapshot. */
  reset: () => void;
}

/**
 * Reactive canvas state. The engine adapter is the sole writer (via `patch`);
 * UI components are readers that subscribe to narrow slices. Keeping this as a
 * plain value store (not React context) lets the frequent, high-rate updates
 * from drawing/pointer-move avoid re-rendering the whole editor tree.
 */
export const useCanvasStore = create<CanvasStore>()((set) => ({
  ...INITIAL_SNAPSHOT,
  patch: (partial) => set((state) => mergeIfChanged(state, partial)),
  reset: () => set(INITIAL_SNAPSHOT),
}));

/**
 * Shallow-merge that returns the same object reference when nothing actually
 * changed, so Zustand skips notifying subscribers on no-op patches.
 */
function mergeIfChanged(
  state: CanvasSnapshot,
  partial: Partial<CanvasSnapshot>,
): Partial<CanvasSnapshot> {
  let changed = false;
  for (const key of Object.keys(partial) as (keyof CanvasSnapshot)[]) {
    if (!Object.is(state[key], partial[key])) {
      changed = true;
      break;
    }
  }
  return changed ? partial : {};
}
