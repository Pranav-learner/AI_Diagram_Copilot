import { useCallback, useEffect } from 'react';
import { useThemeStore } from '@/store';
import type { ResolvedTheme, Theme } from '@/types';

const MEDIA = '(prefers-color-scheme: dark)';

function systemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA).matches ? 'dark' : 'light';
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === 'system' ? systemTheme() : theme;
}

function apply(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

export interface UseThemeResult {
  /** The user's preference: light, dark, or system. */
  theme: Theme;
  /** The theme actually applied to the document. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Reads the theme preference from the store, applies it to the document, and
 * keeps it in sync with the OS when the preference is `system`. Mount once near
 * the app root; safe to also call in components that only need the values.
 */
export function useTheme(): UseThemeResult {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const resolvedTheme = resolve(theme);

  // Apply whenever the preference changes.
  useEffect(() => {
    apply(resolve(theme));
  }, [theme]);

  // Follow OS changes only while the preference is `system`.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia(MEDIA);
    const onChange = (): void => apply(systemTheme());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const stableSetTheme = useCallback(setTheme, [setTheme]);
  const stableToggle = useCallback(toggleTheme, [toggleTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme: stableSetTheme,
    toggleTheme: stableToggle,
  };
}
