import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query. SSR-safe and tear-free via
 * useSyncExternalStore. Returns whether the query currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void): (() => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  };

  const getSnapshot = (): boolean => window.matchMedia(query).matches;
  const getServerSnapshot = (): boolean => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind `lg` breakpoint (1024px). True on desktop-width viewports. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
