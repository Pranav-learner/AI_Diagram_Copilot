import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SidebarNavItem } from './navItems';

interface SidebarNavButtonProps {
  item: SidebarNavItem;
  active?: boolean;
  /** Icon-only presentation (desktop collapsed rail). */
  collapsed?: boolean;
  onNavigate?: () => void;
}

/**
 * A single sidebar entry. Renders as a link when enabled and a non-interactive
 * row when disabled ("coming soon"). When collapsed, the label moves into a
 * tooltip so the rail stays icon-only.
 */
export function SidebarNavButton({
  item,
  active = false,
  collapsed = false,
  onNavigate,
}: SidebarNavButtonProps) {
  const { icon: Icon, label, badge, disabled, to } = item;

  const base = cn(
    'group relative flex items-center rounded-md text-sm font-medium transition-colors',
    collapsed ? 'h-10 w-10 justify-center' : 'h-10 gap-3 px-3',
    disabled
      ? 'cursor-not-allowed text-muted-foreground/60'
      : active
        ? 'bg-primary/10 text-primary'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
  );

  const content = (
    <>
      <Icon className="size-[1.15rem] shrink-0" aria-hidden />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {badge}
        </Badge>
      )}
      {active && !disabled && (
        <span
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
          aria-hidden
        />
      )}
    </>
  );

  const inner =
    disabled || !to ? (
      <div className={base} aria-disabled={disabled}>
        {content}
      </div>
    ) : (
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          base,
          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {content}
      </Link>
    );

  // In collapsed mode, surface the label (and any badge) via a tooltip.
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {label}
          {badge && <span className="text-background/70">· {badge}</span>}
        </TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}
