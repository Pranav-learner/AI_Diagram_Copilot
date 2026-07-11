import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Home, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

/**
 * App-wide error boundary. Catches any render/runtime error that escapes a more
 * local boundary and shows a recoverable full-page fallback instead of a blank
 * screen. (Route-level and canvas errors are caught closer to their source.)
 */
export class RootErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-8" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Something went wrong
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The application ran into an unexpected error. Reloading usually
            fixes it — your work is saved automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw />
            Reload
          </Button>
          <Button variant="outline" asChild>
            <a href="/">
              <Home />
              Dashboard
            </a>
          </Button>
        </div>
      </div>
    );
  }
}
