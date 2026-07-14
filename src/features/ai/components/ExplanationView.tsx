/**
 * ExplanationView — renders one Explain Mode result inside a turn card.
 *
 * Shows the markdown explanation, a depth toggle (overview ↔ detailed), the
 * graph-derived related elements (click to explain that element), and suggested
 * follow-up questions (click to ask, scoped to the same target). All actions call
 * back into the copilot hook; this component holds no logic of its own.
 */

import { BookOpen, ArrowRight, MessageCircleQuestion } from 'lucide-react';
import type { FormattedExplanation } from '@/ai';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils';
import type { UseAiCopilot } from '../useAiCopilot';
import { Markdown } from './Markdown';

interface ExplanationViewProps {
  readonly turnId: string;
  readonly explanation: FormattedExplanation;
  readonly copilot: UseAiCopilot;
}

export function ExplanationView({ turnId, explanation, copilot }: ExplanationViewProps) {
  return (
    <div className="space-y-2.5">
      {/* Adaptation badges */}
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] capitalize">
          <BookOpen className="size-3" /> {explanation.domain.replace(/-/g, ' ')}
        </Badge>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">{explanation.audience}</Badge>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">{explanation.style}</Badge>
      </div>

      {/* The explanation itself */}
      <Markdown content={explanation.markdown} className="text-sm text-foreground/90" />

      {/* Depth toggle */}
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Depth:</span>
        {(['overview', 'detailed'] as const).map((depth) => (
          <button
            key={depth}
            type="button"
            onClick={() => explanation.depth !== depth && copilot.changeDepth(turnId, depth)}
            className={cn(
              'rounded px-1.5 py-0.5 capitalize transition-colors',
              explanation.depth === depth ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={explanation.depth === depth}
          >
            {depth}
          </button>
        ))}
      </div>

      {/* Related elements — sourced from the Semantic Graph */}
      {explanation.relatedElements.length > 0 && (
        <div className="space-y-1">
          <Separator />
          <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Related</p>
          <div className="flex flex-wrap gap-1">
            {explanation.relatedElements.map((el) => (
              <Button
                key={el.id}
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-1.5 text-xs"
                onClick={() => copilot.explainElement(el.id)}
                title={`${el.relation} — ${el.label}`}
              >
                <span className="max-w-[10rem] truncate">{el.label}</span>
                <span className="text-[10px] text-muted-foreground">{el.relation}</span>
                <ArrowRight className="size-3" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested follow-up questions */}
      {explanation.suggestedQuestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ask a follow-up</p>
          <div className="flex flex-col items-start gap-1">
            {explanation.suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => copilot.askFollowUp(turnId, q)}
                className="flex items-center gap-1.5 text-left text-xs text-primary hover:underline"
              >
                <MessageCircleQuestion className="size-3 shrink-0" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
