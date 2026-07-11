import { useCallback, type MouseEvent } from 'react';
import { MousePointerSquareDashed } from 'lucide-react';
import { useEditorStore } from '@/store';

/**
 * Placeholder for the diagram canvas (the real engine lands in Module 2).
 * It renders a dotted grid, scales with the store's zoom, and reports the
 * pointer position to the status bar so the wiring is already in place.
 */
export function CanvasPlaceholder() {
  const zoom = useEditorStore((s) => s.zoom);
  const setCursor = useEditorStore((s) => s.setCursor);

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = zoom / 100;
      setCursor({
        x: Math.round((event.clientX - rect.left) / scale),
        y: Math.round((event.clientY - rect.top) / scale),
      });
    },
    [zoom, setCursor],
  );

  const handleMouseLeave = useCallback(
    () => setCursor({ x: 0, y: 0 }),
    [setCursor],
  );

  return (
    <div
      className="canvas-grid relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="pointer-events-none flex origin-center flex-col items-center gap-4 rounded-2xl border border-dashed bg-background/70 px-10 py-12 text-center shadow-sm backdrop-blur-sm transition-transform"
        style={{ transform: `scale(${zoom / 100})` }}
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MousePointerSquareDashed className="size-8" strokeWidth={1.5} />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Canvas coming soon</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            The diagram editor engine plugs in here in Module&nbsp;2. For now,
            this is a fully wired placeholder.
          </p>
        </div>
      </div>
    </div>
  );
}
