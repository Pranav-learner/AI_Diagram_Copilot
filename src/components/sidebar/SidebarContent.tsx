import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/common';
import { PRIMARY_NAV, SECONDARY_NAV } from './navItems';
import { SidebarNavButton } from './SidebarNavButton';

interface SidebarContentProps {
  collapsed?: boolean;
  /** Currently active nav item id. */
  activeId: string;
  /** Desktop collapse toggle; omitted in the mobile drawer. */
  onToggleCollapse?: () => void;
  /** Called after navigating (used to close the mobile drawer). */
  onNavigate?: () => void;
  showLogo?: boolean;
}

/**
 * The inner content of the editor sidebar — shared between the desktop rail and
 * the mobile drawer so the two never drift apart.
 */
export function SidebarContent({
  collapsed = false,
  activeId,
  onToggleCollapse,
  onNavigate,
  showLogo = true,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      {showLogo && (
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-sidebar-border',
            collapsed ? 'justify-center px-2' : 'px-4',
          )}
        >
          <Logo iconOnly={collapsed} />
        </div>
      )}

      <nav
        className={cn('flex flex-1 flex-col gap-1 py-3', collapsed ? 'px-2' : 'px-3')}
        aria-label="Primary"
      >
        {PRIMARY_NAV.map((item) => (
          <SidebarNavButton
            key={item.id}
            item={item}
            active={item.id === activeId}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div
        className={cn(
          'flex flex-col gap-1 border-t border-sidebar-border py-3',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {SECONDARY_NAV.map((item) => (
          <SidebarNavButton
            key={item.id}
            item={item}
            active={item.id === activeId}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}

        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'mt-1 text-muted-foreground',
              collapsed ? 'w-10 justify-center px-0' : 'justify-start',
            )}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        )}
      </div>
    </div>
  );
}
