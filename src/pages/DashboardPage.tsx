import { useMemo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useProjects } from '@/hooks';
import { useProjectStore } from '@/store';
import { getRecentProjects, queryProjects } from '@/utils';
import { DashboardLayout } from '@/components/layout';
import {
  DashboardHeader,
  DashboardToolbar,
  ProjectCollection,
  RecentProjects,
} from '@/components/dashboard';
import { ProjectDialogs } from '@/components/dialogs';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';

/**
 * Dashboard route (`/`). Owns the composition of header, controls, recent rail,
 * and the project collection. Server data comes from TanStack Query; view/query
 * state comes from the project store; the derived list is memoized here.
 */
export function DashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useProjects();

  const searchQuery = useProjectStore((s) => s.searchQuery);
  const sortOption = useProjectStore((s) => s.sortOption);
  const filterOption = useProjectStore((s) => s.filterOption);
  const viewMode = useProjectStore((s) => s.viewMode);

  const projects = useMemo(() => data ?? [], [data]);

  const isFiltered = searchQuery.trim() !== '' || filterOption !== 'all';

  const visibleProjects = useMemo(
    () =>
      queryProjects(projects, {
        search: searchQuery,
        sort: sortOption,
        filter: filterOption,
      }),
    [projects, searchQuery, sortOption, filterOption],
  );

  const recentProjects = useMemo(
    () => (isFiltered ? [] : getRecentProjects(projects, 4)),
    [projects, isFiltered],
  );

  const showRecent = !isLoading && recentProjects.length > 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <DashboardHeader totalCount={projects.length} isLoading={isLoading} />

        {isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load your diagrams"
            description="Something went wrong reaching the workspace. Please try again."
            action={
              <Button onClick={() => void refetch()} disabled={isFetching}>
                <RotateCcw />
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <DashboardToolbar />

            {showRecent && <RecentProjects projects={recentProjects} />}

            <section aria-labelledby="all-heading" className="flex flex-col gap-3">
              {showRecent && (
                <h2 id="all-heading" className="text-sm font-semibold">
                  All diagrams
                </h2>
              )}
              <ProjectCollection
                projects={visibleProjects}
                viewMode={viewMode}
                isLoading={isLoading}
                isDatasetEmpty={projects.length === 0}
                isFiltered={isFiltered}
              />
            </section>
          </>
        )}
      </div>

      <ProjectDialogs />
    </DashboardLayout>
  );
}
