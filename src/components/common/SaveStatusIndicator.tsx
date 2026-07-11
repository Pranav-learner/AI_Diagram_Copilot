import { Check, CloudOff, Loader2, TriangleAlert } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/utils/cn';
import { useAutosaveStore, type AutosaveStatus } from '@/store';

interface Descriptor {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
  spin?: boolean;
}

const DESCRIPTORS: Record<AutosaveStatus, Descriptor> = {
  idle: { label: 'Saved', icon: Check, className: 'text-muted-foreground' },
  saved: { label: 'Saved', icon: Check, className: 'text-muted-foreground' },
  saving: {
    label: 'Saving…',
    icon: Loader2,
    className: 'text-muted-foreground',
    spin: true,
  },
  error: {
    label: 'Save failed — retrying',
    icon: TriangleAlert,
    className: 'text-destructive',
  },
  offline: {
    label: 'Offline — changes pending',
    icon: CloudOff,
    className: 'text-amber-600 dark:text-amber-500',
  },
};

/** Compact autosave status shown in the editor top bar. */
export function SaveStatusIndicator() {
  const status = useAutosaveStore((s) => s.status);
  const { label, icon: Icon, className, spin } = DESCRIPTORS[status];

  return (
    <span
      className={cn('flex items-center gap-1.5 text-xs font-medium', className)}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn('size-3.5', spin && 'animate-spin')} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
