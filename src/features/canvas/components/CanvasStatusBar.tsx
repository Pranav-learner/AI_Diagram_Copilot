import { memo } from 'react';
import { cn } from '@/utils/cn';
import { Separator } from '@/components/ui/separator';
import { useCanvas } from '../hooks/useCanvas';
import { useCanvasStatus } from '../hooks/useCanvasState';

/** A labeled status-bar segment. */
function StatusItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-1.5', className)}>
      <span className="text-muted-foreground/70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

/**
 * Bottom status bar. Displays live zoom, element/selection counts, cursor
 * coordinates, and canvas readiness — all read from the canvas store. Clicking
 * the zoom resets it via the engine.
 */
export const CanvasStatusBar = memo(function CanvasStatusBar() {
  const engine = useCanvas();
  const { isReady, zoom, elementCount, selectedCount, cursor } =
    useCanvasStatus();

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t bg-background px-2 text-xs text-foreground sm:px-4">
      <button
        type="button"
        onClick={() => engine.resetZoom()}
        disabled={!isReady}
        className="rounded px-1 py-0.5 tabular-nums transition-colors hover:bg-accent disabled:opacity-50"
        aria-label="Reset zoom to 100%"
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>

      <Separator orientation="vertical" className="h-4" />

      <StatusItem label="Elements" value={`${elementCount}`} />

      <StatusItem
        label="Selected"
        value={`${selectedCount}`}
        className="hidden sm:flex"
      />

      <Separator orientation="vertical" className="hidden h-4 md:block" />

      <StatusItem
        label="X,Y"
        value={cursor ? `${cursor.x}, ${cursor.y}` : '—'}
        className="hidden md:flex"
      />

      <div className="ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            'size-2 rounded-full',
            isReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
          )}
          aria-hidden
        />
        <span className="text-muted-foreground">
          {isReady ? 'Canvas ready' : 'Initializing…'}
        </span>
      </div>
    </footer>
  );
});
