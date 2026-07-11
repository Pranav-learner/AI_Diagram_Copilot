import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@/types';

interface ThemeState {
  /** User's chosen theme preference. `system` follows the OS setting. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Cycle light → dark → system, used by the header toggle. */
  toggleTheme: () => void;
}

const ORDER: Theme[] = ['light', 'dark', 'system'];

/**
 * Owns the theme *preference* only. Resolving the preference to an actual
 * light/dark value and applying it to the document is the job of `useTheme`,
 * which also reacts to OS changes when the preference is `system`.
 *
 * Persisted under `adc-theme`; the inline script in index.html reads the same
 * key to set the initial class before first paint (no flash of wrong theme).
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const current = get().theme;
        const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
        set({ theme: next });
      },
    }),
    {
      name: 'adc-theme',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
