import { useState } from 'react';
import { AlertCircle, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HumanError } from '../lib/humanizeError';

/**
 * The error experience: a human explanation, a suggested fix, a retry action,
 * and expandable technical detail (auto-expanded in debug mode).
 */
export function ErrorCard({ error, debug, onRetry }: { error: HumanError; debug: boolean; onRetry?: () => void }) {
  const [showTech, setShowTech] = useState(debug);
  return (
    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
      <div className="flex items-start gap-2 text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{error.message}</p>
          <p className="text-destructive/80">{error.suggestion}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {error.retryable && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="size-3.5" /> Retry
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setShowTech((v) => !v)} aria-expanded={showTech}>
          {showTech ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Technical details
        </Button>
      </div>
      {showTech && (
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs text-muted-foreground">{error.technical}</pre>
      )}
    </div>
  );
}
