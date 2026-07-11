import { create } from 'zustand';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface AutosaveState {
  status: AutosaveStatus;
  /** Epoch ms of the last successful save, or null. */
  lastSavedAt: number | null;
  error: string | null;
  set: (
    partial: Partial<Pick<AutosaveState, 'status' | 'lastSavedAt' | 'error'>>,
  ) => void;
  reset: () => void;
}

const INITIAL = { status: 'idle' as AutosaveStatus, lastSavedAt: null, error: null };

/**
 * Persistence status surfaced in the editor chrome. Written by the autosave
 * hook, read by the save indicator. Kept separate from canvas engine state
 * (which is about the drawing) and from server state (TanStack Query).
 */
export const useAutosaveStore = create<AutosaveState>()((set) => ({
  ...INITIAL,
  set: (partial) => set(partial),
  reset: () => set(INITIAL),
}));
