import { memo } from 'react';
import { Check, CloudOff, Loader2, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Separator } from '@/components/ui/separator';
import { useOnlineStatus } from '@/hooks';
import { useAutosaveStore, type AutosaveStatus } from '@/store';
import { useCanvas } from '../hooks/useCanvas';
import { useActiveTool, useCanvasStatus } from '../hooks/useCanvasState';
import type { CanvasTool } from '../types/canvas';

const TOOL_LABELS: Record<CanvasTool, string> = {
  selection: 'Select',
  hand: 'Pan',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  arrow: 'Arrow',
  line: 'Line',
  freedraw: 'Draw',
  text: 'Text',
  image: 'Image',
};

const AUTOSAVE_META: Record<
  AutosaveStatus,
  { label: string; icon: typeof Check; className: string; spin?: boolean }
> = {
  idle: { label: 'Saved', icon: Check, className: 'text-muted-foreground' },
  saved: { label: 'Saved', icon: Check, className: 'text-muted-foreground' },
  saving: {
    label: 'Saving',
    icon: Loader2,
    className: 'text-muted-foreground',
    spin: true,
  },
  error: { label: 'Save failed', icon: TriangleAlert, className: 'text-destructive' },
  offline: {
    label: 'Offline',
    icon: CloudOff,
    className: 'text-amber-600 dark:text-amber-500',
  },
};

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
 * Bottom status bar. Displays zoom, current tool, element/selection counts,
 * cursor coordinates, autosave status, backend connectivity, and canvas
 * readiness — all read reactively. Clicking the zoom resets it via the engine.
 */
export const CanvasStatusBar = memo(function CanvasStatusBar() {
  const engine = useCanvas();
  const { isReady, zoom, elementCount, selectedCount, cursor } =
    useCanvasStatus();
  const tool = useActiveTool();
  const autosave = useAutosaveStore((s) => s.status);
  const online = useOnlineStatus();

  const save = AUTOSAVE_META[autosave];
  const SaveIcon = save.icon;
  const ConnIcon = online ? Wifi : WifiOff;

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

      <StatusItem label="Tool" value={TOOL_LABELS[tool]} className="hidden lg:flex" />
      <Separator orientation="vertical" className="hidden h-4 lg:block" />

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

      <div className="ml-auto flex items-center gap-3">
        {/* Autosave */}
        <span
          className={cn('flex items-center gap-1.5', save.className)}
          role="status"
          aria-live="polite"
        >
          <SaveIcon className={cn('size-3.5', save.spin && 'animate-spin')} />
          <span className="hidden sm:inline">{save.label}</span>
        </span>

        <Separator orientation="vertical" className="hidden h-4 sm:block" />

        {/* Backend connection */}
        <span
          className={cn(
            'flex items-center gap-1.5',
            online ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500',
          )}
          title={online ? 'Connected' : 'No connection'}
        >
          <ConnIcon className="size-3.5" />
          <span className="hidden md:inline">
            {online ? 'Connected' : 'Offline'}
          </span>
        </span>

        <Separator orientation="vertical" className="hidden h-4 md:block" />

        {/* Canvas readiness */}
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-2 rounded-full',
              isReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
            )}
            aria-hidden
          />
          <span className="hidden text-muted-foreground lg:inline">
            {isReady ? 'Ready' : 'Initializing…'}
          </span>
        </span>
      </div>
    </footer>
  );
});
