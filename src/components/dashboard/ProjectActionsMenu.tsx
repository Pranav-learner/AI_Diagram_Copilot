import { Copy, MoreHorizontal, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import { useProjectActions } from '@/hooks';
import type { Project } from '@/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectActionsMenuProps {
  project: Project;
  /** Size of the trigger button. */
  size?: 'icon' | 'icon-sm';
}

/**
 * Overflow menu shared by the grid card and list row: Open, Rename, Duplicate,
 * Delete. Behavior comes from the shared `useProjectActions` hook.
 */
export function ProjectActionsMenu({
  project,
  size = 'icon-sm',
}: ProjectActionsMenuProps) {
  const actions = useProjectActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          aria-label={`Actions for ${project.title}`}
          // Stop the click from bubbling to a card/row that also navigates.
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => actions.open(project)}>
          <SquareArrowOutUpRight />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.rename(project)}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(project)}>
          <Copy />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => actions.remove(project)}
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
