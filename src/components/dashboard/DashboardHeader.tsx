interface DashboardHeaderProps {
  /** Total number of projects in the account (unfiltered). */
  totalCount: number;
  isLoading: boolean;
}

/** Page heading for the dashboard with a live project count. */
export function DashboardHeader({ totalCount, isLoading }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">Your diagrams</h1>
      <p className="text-sm text-muted-foreground">
        {isLoading
          ? 'Loading your workspace…'
          : totalCount === 0
            ? 'A blank canvas awaits — create your first diagram.'
            : `${totalCount} diagram${totalCount === 1 ? '' : 's'} in your workspace.`}
      </p>
    </div>
  );
}
