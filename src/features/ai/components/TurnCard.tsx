import { useState } from 'react';
import {
  Check,
  X,
  RotateCcw,
  Undo2,
  Pencil,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Wand2,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils/cn';
import type { AiTurn } from '../types';
import type { UseAiCopilot } from '../useAiCopilot';
import { StageList } from './StageList';
import { OperationSummaryView } from './OperationSummaryView';
import { ErrorCard } from './ErrorCard';
import { ChangeBadge } from './ChangeBadge';
import { ExplanationView } from './ExplanationView';

/** One request/response in the conversation. */
export function TurnCard({ turn, copilot, debug }: { turn: AiTurn; copilot: UseAiCopilot; debug: boolean }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const running = turn.status === 'streaming' || turn.status === 'applying';

  return (
    <article className="space-y-2" aria-label={`AI turn: ${turn.prompt}`}>
      {/* User prompt */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary/10 px-3 py-2 text-sm">{turn.prompt}</div>
      </div>

      {/* Assistant response */}
      <div
        className="rounded-lg border bg-card px-3 py-2.5 text-sm"
        aria-live={running ? 'polite' : 'off'}
        aria-busy={running}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {turn.kind === 'generate' ? (
            <Sparkles className="size-3.5 text-primary" />
          ) : turn.kind === 'explain' ? (
            <BookOpen className="size-3.5 text-primary" />
          ) : (
            <Wand2 className="size-3.5 text-primary" />
          )}
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] capitalize">
            {turn.kind}
          </Badge>
          {turn.planSummary && <span className="truncate">{turn.planSummary}</span>}
        </div>

        {/* Live stages while running */}
        {running && <StageList stages={turn.stages} />}

        {/* Clarification */}
        {turn.status === 'clarifying' &&
          turn.clarifications?.map((c, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-start gap-2">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{c.message}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-6">
                {c.candidates.map((cand) => (
                  <Button key={cand.id} variant="outline" size="sm" className="h-7" onClick={() => copilot.chooseCandidate(turn.id, c, cand)}>
                    {cand.label}
                    {cand.hint ? <span className="ml-1 text-xs text-muted-foreground">· {cand.hint}</span> : null}
                  </Button>
                ))}
              </div>
            </div>
          ))}

        {/* Edit preview awaiting approval */}
        {turn.status === 'awaiting-approval' && turn.preview && (
          <div className="space-y-2">
            <ul className="space-y-1">
              {turn.preview.changes.map((change, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ChangeBadge kind={change.kind} />
                  <span className="flex-1 truncate" title={change.summary}>
                    {change.summary}
                  </span>
                </li>
              ))}
            </ul>
            {turn.warnings.length > 0 && <WarningLine warnings={turn.warnings} />}
            <Separator />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => copilot.approve(turn.id)}>
                <Check className="size-4" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => copilot.reject(turn.id)}>
                <X className="size-4" /> Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copilot.regenerate(turn.id)}>
                <RotateCcw className="size-3.5" /> Regenerate
              </Button>
            </div>
          </div>
        )}

        {/* Done — explanation */}
        {turn.status === 'done' && turn.kind === 'explain' && turn.explanation && (
          <ExplanationView turnId={turn.id} explanation={turn.explanation} copilot={copilot} />
        )}

        {/* Done — generate/edit */}
        {turn.status === 'done' && turn.kind !== 'explain' && (
          <div className="space-y-2">
            {turn.operationSummary && <OperationSummaryView summary={turn.operationSummary} />}
            {turn.warnings.length > 0 && <WarningLine warnings={turn.warnings} />}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => copilot.retry(turn.id)} title="Run this prompt again">
                <RotateCcw className="size-3.5" /> Retry
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => copilot.regenerate(turn.id)} title="Produce a different result">
                <Wand2 className="size-3.5" /> Regenerate
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => copilot.editPrompt(turn.id)} title="Edit this prompt">
                <Pencil className="size-3.5" /> Edit
              </Button>
              {copilot.canRestore(turn.id) && (
                <Button size="sm" variant="ghost" className="h-7" onClick={() => copilot.restore(turn.id)} title="Undo this change">
                  <Undo2 className="size-3.5" /> Undo
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {turn.status === 'error' && turn.error && (
          <ErrorCard error={turn.error} debug={debug} onRetry={() => copilot.retry(turn.id)} />
        )}

        {/* Cancelled / rejected */}
        {turn.status === 'cancelled' && (
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span>No changes were made.</span>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => copilot.retry(turn.id)}>
              <RotateCcw className="size-3.5" /> Try again
            </Button>
          </div>
        )}

        {/* Inspect: timeline + raw output */}
        {!running && (
          <div className="mt-2 border-t pt-1.5">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowTimeline((v) => !v)}
              aria-expanded={showTimeline}
            >
              {showTimeline ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Timeline
              <span className="ml-1">
                {turn.provider} · {turn.model}
                {turn.totalMs ? ` · ${(turn.totalMs / 1000).toFixed(1)}s` : ''}
                {turn.tokens ? ` · ${turn.tokens.totalTokens} tok` : ''}
              </span>
            </button>
            {showTimeline && (
              <div className="mt-1.5 space-y-2">
                <StageList stages={turn.stages} compact />
                {debug && turn.streamingText && (
                  <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
                    {turn.streamingText}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function WarningLine({ warnings }: { warnings: readonly string[] }) {
  return (
    <p className={cn('text-xs text-amber-600 dark:text-amber-400')}>
      {warnings.length} warning{warnings.length > 1 ? 's' : ''}: {warnings[0]}
    </p>
  );
}
