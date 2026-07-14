/**
 * ReviewView — renders one Diagram Review inside a turn card.
 *
 * Shows the transparent scorecards, the narrative summary, prioritised actions,
 * the findings (grouped by severity, coloured, click-to-focus on the canvas),
 * strengths, and trade-offs. A "deterministic only" banner appears when the LLM
 * was unavailable. All actions call back into the copilot hook; this component
 * holds no logic.
 */

import { AlertTriangle, ShieldAlert, Info, CheckCircle2, Target } from 'lucide-react';
import type { FormattedReview, ReviewFinding, Scorecard, Severity } from '@/ai';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils';
import type { UseAiCopilot } from '../useAiCopilot';
import { Markdown } from './Markdown';

interface ReviewViewProps {
  readonly review: FormattedReview;
  readonly copilot: UseAiCopilot;
}

const SEVERITY_STYLE: Record<Severity, { label: string; badge: string; dot: string }> = {
  critical: { label: 'Critical', badge: 'bg-red-600 text-white', dot: 'bg-red-600' },
  high: { label: 'High', badge: 'bg-orange-500 text-white', dot: 'bg-orange-500' },
  medium: { label: 'Medium', badge: 'bg-amber-400 text-black', dot: 'bg-amber-400' },
  low: { label: 'Low', badge: 'bg-sky-400 text-black', dot: 'bg-sky-400' },
  info: { label: 'Info', badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
};

const GRADE_STYLE: Record<string, string> = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-lime-600 dark:text-lime-400',
  C: 'text-amber-600 dark:text-amber-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

export function ReviewView({ review, copilot }: ReviewViewProps) {
  const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  return (
    <div className="space-y-3">
      {review.degraded && (
        <div className="flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          <Info className="size-3.5" /> Deterministic review (AI explanation unavailable).
        </div>
      )}

      {/* Scorecards */}
      <div className="rounded-lg border bg-muted/40 p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">{review.scores.overall.label}</span>
          <span className={cn('text-2xl font-bold tabular-nums', GRADE_STYLE[review.scores.overall.grade])}>
            {review.scores.overall.score}
            <span className="ml-1 text-sm">({review.scores.overall.grade})</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {review.scores.dimensions.map((d) => (
            <ScoreChip key={d.key} card={d} />
          ))}
        </div>
      </div>

      {/* Summary */}
      <Markdown content={review.summary} className="text-sm text-foreground/90" />

      {/* Priority actions */}
      {review.priorityActions.length > 0 && (
        <section className="space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Target className="size-3" /> Priority actions
          </p>
          <ol className="list-decimal space-y-0.5 pl-4 text-sm">
            {review.priorityActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </section>
      )}

      {/* Findings */}
      {review.findings.length > 0 && (
        <section className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Findings ({review.counts.total})
          </p>
          <ul className="space-y-1.5">
            {order.flatMap((sev) =>
              review.findings.filter((f) => f.severity === sev).map((f) => <FindingRow key={f.id} finding={f} copilot={copilot} />),
            )}
          </ul>
        </section>
      )}

      {/* Strengths */}
      {review.strengths.length > 0 && (
        <section className="space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> Strengths
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground/90">
            {review.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Trade-offs */}
      {review.tradeoffs.length > 0 && (
        <section className="space-y-1">
          <Separator />
          <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Trade-offs</p>
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
            {review.tradeoffs.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScoreChip({ card }: { card: Scorecard }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help rounded border bg-background px-1.5 py-0.5 text-[11px]">
          {card.label} <span className={cn('font-semibold', GRADE_STYLE[card.grade])}>{card.score}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{card.rationale}</TooltipContent>
    </Tooltip>
  );
}

function FindingRow({ finding, copilot }: { finding: ReviewFinding; copilot: UseAiCopilot }) {
  const style = SEVERITY_STYLE[finding.severity];
  const clickable = finding.affectedEntities.length > 0;
  return (
    <li className="rounded border bg-card p-2">
      <button
        type="button"
        className={cn('flex w-full items-start gap-2 text-left', clickable && 'group')}
        onClick={() => clickable && copilot.focusFinding(finding.affectedEntities)}
        title={clickable ? 'Highlight affected elements on the canvas' : undefined}
        disabled={!clickable}
      >
        {finding.severity === 'critical' || finding.severity === 'high' ? (
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
        ) : (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge className={cn('px-1 py-0 text-[9px] uppercase', style.badge)}>{style.label}</Badge>
            <span className="truncate text-sm font-medium group-hover:underline">{finding.title}</span>
          </div>
          <p className="mt-0.5 text-xs text-foreground/80">{finding.message}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-medium">Fix:</span> {finding.recommendation}
          </p>
          {finding.note && <p className="mt-0.5 text-xs italic text-muted-foreground">{finding.note}</p>}
        </div>
      </button>
    </li>
  );
}
