import type { ReactNode } from 'react';
import { useTheme } from '@/hooks';

/**
 * Mounts the theme effect once at the app root so the persisted preference is
 * applied to the document and kept in sync with the OS. Renders children as-is.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useTheme();
  return <>{children}</>;
}
