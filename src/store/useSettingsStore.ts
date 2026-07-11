import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * User-configurable application preferences (persisted). Theme lives in its own
 * store; this holds editor behavior toggles surfaced on the Settings page.
 */
interface SettingsState {
  /** Whether the editor autosaves changes to the backend. */
  autosaveEnabled: boolean;
  setAutosaveEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autosaveEnabled: true,
      setAutosaveEnabled: (autosaveEnabled) => set({ autosaveEnabled }),
    }),
    { name: 'adc-settings' },
  ),
);
