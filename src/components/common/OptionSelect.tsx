import type { ReactNode } from 'react';
import type { SelectOption } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OptionSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** Optional leading icon rendered inside the trigger. */
  icon?: ReactNode;
  ariaLabel: string;
  className?: string;
}

/**
 * Thin, type-safe wrapper over the Select primitive for string-union options.
 * Used by both the sort and filter controls so their markup isn't duplicated.
 */
export function OptionSelect<T extends string>({
  value,
  onChange,
  options,
  icon,
  ariaLabel,
  className,
}: OptionSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
