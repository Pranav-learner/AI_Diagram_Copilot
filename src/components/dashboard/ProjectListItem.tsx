import { Link } from 'react-router-dom';
import { formatDate, formatRelativeTime } from '@/utils/format';
import type { Project } from '@/types';
import { ProjectThumbnail } from './ProjectThumbnail';
import { ProjectActionsMenu } from './ProjectActionsMenu';

interface ProjectListItemProps {
  project: Project;
}

/** List-view row for a single project. Uses the same stretched-link pattern. */
export function ProjectListItem({ project }: ProjectListItemProps) {
  return (
    <div className="group relative flex items-center gap-4 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring">
      <div className="hidden size-11 shrink-0 overflow-hidden rounded-md border sm:block">
        <ProjectThumbnail project={project} />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">
          <Link
            to={`/editor/${project.id}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {project.title}
          </Link>
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {project.description || 'No description'}
        </p>
      </div>

      <div className="hidden w-36 shrink-0 text-xs text-muted-foreground md:block">
        Edited {formatRelativeTime(project.updatedAt)}
      </div>
      <div className="hidden w-32 shrink-0 text-xs text-muted-foreground lg:block">
        {formatDate(project.createdAt)}
      </div>

      <div className="relative z-10 shrink-0">
        <ProjectActionsMenu project={project} />
      </div>
    </div>
  );
}
