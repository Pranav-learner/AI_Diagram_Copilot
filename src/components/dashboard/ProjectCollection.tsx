import { FolderOpen, FolderPlus, SearchX } from 'lucide-react';
import type { Project, ViewMode } from '@/types';
import { useProjectStore } from '@/store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common';
import { ProjectCard } from './ProjectCard';
import { ProjectListItem } from './ProjectListItem';
import { ProjectSkeleton } from './ProjectSkeleton';

interface ProjectCollectionProps {
  projects: Project[];
  viewMode: ViewMode;
  isLoading: boolean;
  /** True when the underlying dataset is empty (vs. filtered to empty). */
  isDatasetEmpty: boolean;
  /** True when a search/filter is currently narrowing results. */
  isFiltered: boolean;
}

/**
 * Renders the project collection for the active view mode and resolves the four
 * states it can be in: loading, empty dataset, empty search result, and
 * populated. Keeping this decision in one place avoids duplicating it per view.
 */
export function ProjectCollection({
  projects,
  viewMode,
  isLoading,
  isDatasetEmpty,
  isFiltered,
}: ProjectCollectionProps) {
  const openCreateDialog = useProjectStore((s) => s.openCreateDialog);

  if (isLoading) {
    return <ProjectSkeleton viewMode={viewMode} />;
  }

  if (isDatasetEmpty) {
    return (
      <EmptyState
        icon={FolderPlus}
        title="No diagrams yet"
        description="Create your first diagram to start mapping out systems, flows, and ideas."
        action={
          <Button onClick={openCreateDialog}>
            <FolderPlus />
            New Diagram
          </Button>
        }
      />
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={isFiltered ? SearchX : FolderOpen}
        title="No matching diagrams"
        description="Try adjusting your search or filters to find what you're looking for."
      />
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {projects.map((project) => (
          <ProjectListItem key={project.id} project={project} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
