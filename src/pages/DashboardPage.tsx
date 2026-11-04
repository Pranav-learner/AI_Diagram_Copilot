import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RotateCcw, Database, Sparkles, ArrowRight } from 'lucide-react';
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

        {/* Software Intelligence Quick Entry Callout */}
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/10 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Database className="size-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Phase 5 & 6 — Software Intelligence Engine
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Reverse-Engineer Repositories & Run Autonomous Missions
              </h3>
              <p className="max-w-2xl text-xs sm:text-sm text-muted-foreground">
                Import local codebases (such as <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">small_start_python</code> or <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">LexiMind</code>), compile AST digital twins, auto-generate architecture diagrams, and dispatch 12 specialist AI agents.
              </p>
            </div>
            <Button asChild className="shrink-0 gap-2 shadow-md">
              <Link to="/intelligence">
                <Sparkles className="size-4" />
                Launch Software Intelligence
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

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
