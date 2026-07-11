import { Loader2 } from 'lucide-react';

/** Full-viewport fallback shown while a lazily-loaded route chunk resolves. */
export function PageLoader() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}
