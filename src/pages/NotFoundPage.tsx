import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/common';

/** Catch-all 404 route. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Logo />
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="size-8" aria-hidden />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you're looking for doesn't exist or may have been moved.
          Let's get you back on track.
        </p>
      </div>
      <Button asChild>
        <Link to="/">
          <Home />
          Back to dashboard
        </Link>
      </Button>
    </div>
  );
}
