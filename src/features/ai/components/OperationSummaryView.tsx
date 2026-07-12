import { Clock } from 'lucide-react';
import type { OperationSummary } from '../lib/operationSummary';
import { summaryRows, summaryTotal } from '../lib/operationSummary';

/**
 * The post-execution operation summary — nodes/connections/groups/styles changed
 * plus execution time. Sourced entirely from the runtime's committed patch.
 */
export function OperationSummaryView({ summary }: { summary: OperationSummary }) {
  const rows = summaryRows(summary);
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 text-sm">
      {summaryTotal(summary) === 0 ? (
        <p className="text-muted-foreground">No changes were made.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <dt className="truncate text-muted-foreground">{r.label}</dt>
              <dd className="font-medium tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-2 flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
        <Clock className="size-3" aria-hidden />
        Completed in {formatMs(summary.executionTimeMs)}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
