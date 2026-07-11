import { Link } from 'react-router-dom';
import { ChevronRight, Menu, Search, Share2 } from 'lucide-react';
import type { Project } from '@/types';
import { useUIStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Logo,
  SaveStatusIndicator,
  ThemeToggle,
  UserMenu,
} from '@/components/common';

interface EditorTopBarProps {
  project: Project | null | undefined;
  isLoading: boolean;
}

/** A disabled placeholder icon button with an explanatory tooltip. */
function ComingSoonAction({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof Search;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Wrapper span so the tooltip still fires on a disabled button. */}
        <span tabIndex={0} className="inline-flex">
          <Button variant="ghost" size="icon" disabled aria-label={label}>
            <Icon />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label} · coming soon</TooltipContent>
    </Tooltip>
  );
}

/**
 * Editor top navigation: menu toggle (mobile), logo, project breadcrumb,
 * placeholder actions (search/undo/redo/share), theme toggle, and user menu.
 */
export function EditorTopBar({ project, isLoading }: EditorTopBarProps) {
  const openMobileSidebar = useUIStore((s) => s.setMobileSidebarOpen);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        onClick={() => openMobileSidebar(true)}
      >
        <Menu />
      </Button>

      <Link
        to="/"
        className="hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
        aria-label="Back to dashboard"
      >
        <Logo iconOnly />
      </Link>

      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 text-sm"
      >
        <Link
          to="/"
          className="hidden shrink-0 rounded px-1 text-muted-foreground transition-colors hover:text-foreground sm:inline"
        >
          Projects
        </Link>
        <ChevronRight
          className="hidden size-4 shrink-0 text-muted-foreground/60 sm:block"
          aria-hidden
        />
        {isLoading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <span className="truncate font-medium">
            {project?.title ?? 'Untitled diagram'}
          </span>
        )}
      </nav>

      {!isLoading && (
        <div className="ml-2 hidden sm:block">
          <SaveStatusIndicator />
        </div>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <ComingSoonAction label="Share" icon={Share2} />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
