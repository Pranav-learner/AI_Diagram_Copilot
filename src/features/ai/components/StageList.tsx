import { Circle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { TimelineStage } from '../types';

/**
 * The execution timeline / streaming stages of a turn: Intent → Reading → Plan →
 * Validation → … → Completed, each pending / active / done / error. Doubles as
 * live streaming progress and the after-the-fact inspectable timeline. Not a
 * spinner — meaningful stages.
 */
export function StageList({ stages, compact = false }: { stages: readonly TimelineStage[]; compact?: boolean }) {
  return (
    <ol className={cn('space-y-1', compact && 'space-y-0.5')} aria-label="Execution timeline">
      {stages.map((stage) => (
        <li key={stage.key} className="flex items-center gap-2 text-sm">
          <StageIcon state={stage.state} />
          <span
            className={cn(
              'flex-1 truncate',
              stage.state === 'pending' && 'text-muted-foreground',
              stage.state === 'active' && 'font-medium text-foreground',
              stage.state === 'error' && 'text-destructive',
            )}
          >
            {stage.label}
          </span>
          {stage.detail && (
            <span className="max-w-[45%] truncate text-xs text-muted-foreground" title={stage.detail}>
              {stage.detail}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ state }: { state: TimelineStage['state'] }) {
  switch (state) {
    case 'active':
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="in progress" />;
    case 'done':
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="done" />;
    case 'error':
      return <XCircle className="size-4 shrink-0 text-destructive" aria-label="error" />;
    default:
      return <Circle className="size-4 shrink-0 text-muted-foreground/40" aria-label="pending" />;
  }
}
