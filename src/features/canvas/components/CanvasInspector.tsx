import { memo } from 'react';
import { Layers, MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCanvasSelection } from '../hooks/useCanvasState';
import type { SelectedElement } from '../types/canvas';

/** A labeled read-only property row. */
function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] truncate text-xs font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}

const TRANSPARENT = 'transparent';

/** A color value shown as a swatch plus its hex/keyword. */
function ColorRow({ label, value }: { label: string; value: string }) {
  const isTransparent = value === TRANSPARENT || value === '#00000000';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">
        <span
          className={cn(
            'size-4 rounded border shadow-sm',
            isTransparent && 'bg-[conic-gradient(#0000_90deg,#8883_0_180deg,#0000_0_270deg,#8883_0)] bg-[length:8px_8px]',
          )}
          style={isTransparent ? undefined : { backgroundColor: value }}
          aria-hidden
        />
        <span className="text-xs font-medium uppercase tabular-nums">
          {isTransparent ? 'None' : value}
        </span>
      </dd>
    </div>
  );
}

const TYPE_LABELS: Record<SelectedElement['type'], string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  arrow: 'Arrow',
  line: 'Line',
  freedraw: 'Draw',
  text: 'Text',
  image: 'Image',
  frame: 'Frame',
  embeddable: 'Embed',
  unknown: 'Element',
};

/** Full property read-out for a single selected element. */
function SingleSelection({ element }: { element: SelectedElement }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{TYPE_LABELS[element.type]}</span>
        <Badge variant="secondary" className="gap-1">
          <Layers className="size-3" />
          Layer {element.layer}
        </Badge>
      </div>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Transform
        </h3>
        <dl className="divide-y divide-border/60">
          <PropertyRow label="Position X" value={`${element.x}`} />
          <PropertyRow label="Position Y" value={`${element.y}`} />
          <PropertyRow label="Width" value={`${element.width}`} />
          <PropertyRow label="Height" value={`${element.height}`} />
          <PropertyRow label="Rotation" value={`${element.rotation}°`} />
        </dl>
      </section>

      <Separator />

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Appearance
        </h3>
        <dl className="divide-y divide-border/60">
          <ColorRow label="Stroke" value={element.strokeColor} />
          <ColorRow label="Background" value={element.backgroundColor} />
          <PropertyRow label="Opacity" value={`${element.opacity}%`} />
        </dl>
      </section>
    </div>
  );
}

/** Summary shown when more than one element is selected. */
function MultiSelection({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Layers className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{count} elements selected</p>
        <p className="text-xs text-muted-foreground">
          Select a single element to inspect its properties.
        </p>
      </div>
    </div>
  );
}

/** Empty state shown when nothing is selected. */
function EmptySelection() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MousePointerClick className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No element selected</p>
        <p className="text-xs text-muted-foreground">
          Select an element on the canvas to view its properties.
        </p>
      </div>
    </div>
  );
}

/**
 * Right inspector panel. Reads the normalized selection from the canvas store
 * and renders read-only properties (editing arrives in a later module).
 */
export const CanvasInspector = memo(function CanvasInspector() {
  const selection = useCanvasSelection();

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l bg-background xl:flex">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Inspector</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {selection.length === 0 && <EmptySelection />}
        {selection.length === 1 && <SingleSelection element={selection[0]!} />}
        {selection.length > 1 && <MultiSelection count={selection.length} />}
      </div>
    </aside>
  );
});
