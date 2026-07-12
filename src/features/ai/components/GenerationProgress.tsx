import { Circle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { StageView } from '../useDiagramGeneration';

/**
 * The staged progress checklist — the "not a spinner" generation experience.
 * Each pipeline stage shows pending / active / done / error, so users see the
 * request move through Understanding → Building plan → Validating → Computing
 * layout → Creating diagram → Rendering.
 */
export function GenerationProgress({ stages }: { stages: readonly StageView[] }) {
  return (
    <ul className="space-y-1.5" aria-label="Generation progress">
      {stages.map((stage) => (
        <li key={stage.stage} className="flex items-center gap-2 text-sm">
          <StageIcon state={stage.state} />
          <span
            className={cn(
              'flex-1',
              stage.state === 'pending' && 'text-muted-foreground',
              stage.state === 'active' && 'font-medium text-foreground',
              stage.state === 'done' && 'text-foreground',
              stage.state === 'error' && 'text-destructive',
            )}
          >
            {stage.label}
          </span>
          {stage.detail && (
            <span className="text-xs text-muted-foreground" title={stage.detail}>
              {stage.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StageIcon({ state }: { state: StageView['state'] }) {
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
