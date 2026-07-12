import { CornerDownRight } from 'lucide-react';
import type { PreviewChangeKind } from '@/ai';
import { cn } from '@/utils/cn';

const BADGE: Readonly<Record<PreviewChangeKind, { label: string; className: string }>> = {
  add: { label: 'Add', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  remove: { label: 'Remove', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  rename: { label: 'Rename', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  move: { label: 'Move', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  resize: { label: 'Resize', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  connect: { label: 'Connect', className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  disconnect: { label: 'Disconnect', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  restyle: { label: 'Style', className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  metadata: { label: 'Meta', className: 'bg-gray-500/15 text-gray-600 dark:text-gray-400' },
  group: { label: 'Group', className: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
  ungroup: { label: 'Ungroup', className: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
  reorder: { label: 'Reorder', className: 'bg-gray-500/15 text-gray-600 dark:text-gray-400' },
};

/** A small colored category chip for a preview change kind. */
export function ChangeBadge({ kind }: { kind: PreviewChangeKind }) {
  const b = BADGE[kind];
  return (
    <span className={cn('inline-flex w-[76px] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium', b.className)}>
      <CornerDownRight className="size-3" aria-hidden />
      {b.label}
    </span>
  );
}
