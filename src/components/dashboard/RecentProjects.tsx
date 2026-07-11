import { History } from 'lucide-react';
import type { Project } from '@/types';
import { ProjectCard } from './ProjectCard';

interface RecentProjectsProps {
  projects: Project[];
}

/**
 * Horizontal rail of the most recently modified projects, shown above the full
 * collection. Rendered only when there is something to show (the parent hides
 * it while searching/filtering).
 */
export function RecentProjects({ projects }: RecentProjectsProps) {
  if (projects.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading">
      <div className="mb-3 flex items-center gap-2">
        <History className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="recent-heading" className="text-sm font-semibold">
          Recent
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
