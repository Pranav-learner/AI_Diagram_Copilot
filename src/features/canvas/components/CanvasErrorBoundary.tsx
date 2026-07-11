import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Notified when the canvas subtree throws, so the store can record it. */
  onError?: (message: string) => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime failures inside the Excalidraw subtree and shows a
 * recoverable fallback instead of crashing the whole editor.
 */
export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error.message);
    console.error('Canvas crashed:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-muted/30 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">The canvas hit an error</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Something went wrong while rendering the editor. You can try
              reloading the canvas.
            </p>
          </div>
          <Button onClick={this.handleReset} variant="outline">
            <RotateCcw />
            Reload canvas
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
