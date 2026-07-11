import type { ViewMode } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton placeholder matching a grid card's footprint. */
function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Skeleton placeholder matching a list row's footprint. */
function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card px-3 py-2.5 shadow-sm">
      <Skeleton className="hidden size-11 shrink-0 rounded-md sm:block" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="hidden h-3 w-24 md:block" />
      <Skeleton className="size-8 shrink-0 rounded-md" />
    </div>
  );
}

interface ProjectSkeletonProps {
  viewMode: ViewMode;
  count?: number;
}

/** Renders a set of skeletons matching the active view mode. */
export function ProjectSkeleton({ viewMode, count = 8 }: ProjectSkeletonProps) {
  const items = Array.from({ length: count });

  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {items.map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
