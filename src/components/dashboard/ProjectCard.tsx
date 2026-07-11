import { Link } from 'react-router-dom';
import { CalendarPlus, Clock } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/utils/format';
import type { Project } from '@/types';
import { ProjectThumbnail } from './ProjectThumbnail';
import { ProjectActionsMenu } from './ProjectActionsMenu';

interface ProjectCardProps {
  project: Project;
}

/**
 * Grid card for a single project. The title is a "stretched link" so the whole
 * card is clickable while keeping proper link semantics; the actions menu sits
 * above the stretched link via z-index.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
      <div className="aspect-[16/10] w-full overflow-hidden border-b bg-muted">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]">
          <ProjectThumbnail project={project} />
        </div>
      </div>

      <div className="flex flex-1 items-start justify-between gap-2 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            <Link
              to={`/editor/${project.id}`}
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {project.title}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {project.description || 'No description'}
          </p>

          <dl className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden />
              <dt className="sr-only">Last modified</dt>
              <dd>Edited {formatRelativeTime(project.updatedAt)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarPlus className="size-3.5" aria-hidden />
              <dt className="sr-only">Created</dt>
              <dd>Created {formatDate(project.createdAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="relative z-10 -mr-1 -mt-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
          <ProjectActionsMenu project={project} />
        </div>
      </div>
    </article>
  );
}
