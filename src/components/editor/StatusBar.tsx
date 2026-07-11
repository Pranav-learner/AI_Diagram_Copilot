import { Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ConnectionStatus } from '@/types';
import { useEditorStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const CONNECTION_META: Record<
  ConnectionStatus,
  { label: string; dot: string }
> = {
  connected: { label: 'Connected', dot: 'bg-emerald-500' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-500 animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground' },
};

/** A labeled, muted status-bar segment (hidden on narrow screens). */
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
 * Bottom status bar: zoom controls, canvas size, live cursor coordinates, and
 * connection status. All values come from the editor store.
 */
export function StatusBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const resetZoom = useEditorStore((s) => s.resetZoom);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const cursor = useEditorStore((s) => s.cursor);
  const connectionStatus = useEditorStore((s) => s.connectionStatus);

  const connection = CONNECTION_META[connectionStatus];

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t bg-background px-2 text-xs text-foreground sm:px-4">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          onClick={zoomOut}
          aria-label="Zoom out"
        >
          <Minus className="!size-3.5" />
        </Button>
        <button
          type="button"
          onClick={resetZoom}
          className="w-12 rounded px-1 py-0.5 text-center tabular-nums transition-colors hover:bg-accent"
          aria-label="Reset zoom to 100%"
          title="Reset zoom"
        >
          {zoom}%
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          onClick={zoomIn}
          aria-label="Zoom in"
        >
          <Plus className="!size-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="hidden h-4 sm:block" />

      <StatusItem
        label="Canvas"
        value={`${canvasSize.width} × ${canvasSize.height}`}
        className="hidden sm:flex"
      />

      <Separator orientation="vertical" className="hidden h-4 md:block" />

      <StatusItem
        label="X,Y"
        value={`${cursor.x}, ${cursor.y}`}
        className="hidden md:flex"
      />

      <div className="ml-auto flex items-center gap-1.5">
        <span className={cn('size-2 rounded-full', connection.dot)} aria-hidden />
        <span className="text-muted-foreground">{connection.label}</span>
      </div>
    </footer>
  );
}
