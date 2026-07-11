import { cn } from '@/utils/cn';
import { useIsDesktop } from '@/hooks';
import { useUIStore } from '@/store';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarContent } from './SidebarContent';

interface EditorSidebarProps {
  /** Active nav item id for highlighting. */
  activeId?: string;
}

/**
 * Editor left sidebar. On desktop it is a static, collapsible rail; on
 * tablet/mobile it becomes a slide-in drawer driven by `useUIStore`.
 */
export function EditorSidebar({ activeId = 'projects' }: EditorSidebarProps) {
  const isDesktop = useIsDesktop();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen);

  if (isDesktop) {
    return (
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          activeId={activeId}
          onToggleCollapse={toggleSidebar}
          showLogo={false}
        />
      </aside>
    );
  }

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Primary application navigation
        </SheetDescription>
        <SidebarContent
          activeId={activeId}
          onNavigate={() => setMobileOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
