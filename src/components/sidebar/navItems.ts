import type { LucideIcon } from 'lucide-react';
import { FolderKanban, LayoutTemplate, Settings, Sparkles } from 'lucide-react';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Route to navigate to when the item is enabled. */
  to?: string;
  disabled?: boolean;
  /** Small trailing badge, e.g. "Soon". */
  badge?: string;
}

/** Primary navigation shown in the editor sidebar. */
export const PRIMARY_NAV: readonly SidebarNavItem[] = [
  { id: 'projects', label: 'Projects', icon: FolderKanban, to: '/' },
  {
    id: 'templates',
    label: 'Templates',
    icon: LayoutTemplate,
    disabled: true,
  },
  {
    id: 'ai',
    label: 'AI Assistant',
    icon: Sparkles,
    disabled: true,
    badge: 'Soon',
  },
];

/** Secondary navigation pinned to the bottom of the sidebar. */
export const SECONDARY_NAV: readonly SidebarNavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings, disabled: true },
];
