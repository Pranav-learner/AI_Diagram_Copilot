import { MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { useEditorStore } from '@/store';

/**
 * Right inspector panel. With no diagram engine yet nothing can be selected, so
 * it shows an empty state. Hidden below the xl breakpoint to protect canvas
 * space on smaller screens.
 */
export function RightInspector() {
  const selectedElementId = useEditorStore((s) => s.selectedElementId);

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l bg-background xl:flex">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Inspector</h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MousePointerClick className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {selectedElementId ? 'Element selected' : 'No element selected'}
          </p>
          <p className="text-xs text-muted-foreground">
            Select an element on the canvas to view and edit its properties.
          </p>
        </div>
      </div>
    </aside>
  );
}
