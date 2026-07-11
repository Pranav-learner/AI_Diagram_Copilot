import { cn } from '@/utils/cn';

interface LogoProps {
  className?: string;
  /** Hide the wordmark and show only the glyph. */
  iconOnly?: boolean;
}

/** Product logo: a small diagram glyph plus the wordmark. */
export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 32 32" fill="none" className="size-5" aria-hidden>
          <rect
            x="5"
            y="6"
            width="9"
            height="7"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="18"
            y="19"
            width="9"
            height="7"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M14 9.5h5.5c1.1 0 2 .9 2 2V19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!iconOnly && (
        <span className="text-sm font-semibold leading-tight tracking-tight">
          Diagram<span className="text-primary">Copilot</span>
        </span>
      )}
    </span>
  );
}
