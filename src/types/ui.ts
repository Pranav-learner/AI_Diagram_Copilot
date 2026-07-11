/** How the dashboard renders the project collection. */
export type ViewMode = 'grid' | 'list';

/** Ordering applied to the project collection. */
export type SortOption = 'recent' | 'alphabetical' | 'newest' | 'oldest';

/** Time-window filter applied to the project collection. */
export type FilterOption = 'all' | 'last-7-days' | 'last-30-days' | 'older';

/** Application color theme. `system` follows the OS preference. */
export type Theme = 'light' | 'dark' | 'system';

/** The resolved theme actually applied to the document (never `system`). */
export type ResolvedTheme = 'light' | 'dark';

/** Which project dialog is currently open, if any. */
export type ProjectDialog = 'create' | 'rename' | 'delete' | null;

/** Editor connection state placeholder (no backend yet). */
export type ConnectionStatus = 'connected' | 'connecting' | 'offline';

/** Descriptor for a labeled select option. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
}
