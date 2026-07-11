import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Shortcut {
  keys: string[];
  label: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

const GROUPS: readonly Group[] = [
  {
    title: 'Tools',
    items: [
      { keys: ['V'], label: 'Select' },
      { keys: ['H'], label: 'Hand / pan' },
      { keys: ['R'], label: 'Rectangle' },
      { keys: ['O'], label: 'Ellipse' },
      { keys: ['A'], label: 'Arrow' },
      { keys: ['L'], label: 'Line' },
      { keys: ['P'], label: 'Draw' },
      { keys: ['T'], label: 'Text' },
    ],
  },
  {
    title: 'Edit',
    items: [
      { keys: ['Ctrl', 'Z'], label: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo' },
      { keys: ['Ctrl', 'C'], label: 'Copy' },
      { keys: ['Ctrl', 'V'], label: 'Paste' },
      { keys: ['Ctrl', 'D'], label: 'Duplicate' },
      { keys: ['Del'], label: 'Delete' },
      { keys: ['Ctrl', 'A'], label: 'Select all' },
      { keys: ['Ctrl', 'G'], label: 'Group' },
      { keys: ['Ctrl', 'Shift', 'G'], label: 'Ungroup' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: ['Ctrl', '+'], label: 'Zoom in' },
      { keys: ['Ctrl', '−'], label: 'Zoom out' },
      { keys: ['Ctrl', '0'], label: 'Reset zoom' },
      { keys: ['Shift', '1'], label: 'Fit to screen' },
      { keys: ['Space', 'Drag'], label: 'Pan canvas' },
      { keys: ['Ctrl', 'Wheel'], label: 'Zoom to cursor' },
      { keys: ['Esc'], label: 'Deselect' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
      {children}
    </kbd>
  );
}

/** Keyboard-shortcuts reference dialog with its own trigger button. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts">
              <Keyboard />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Work faster with these editor shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-xs">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
