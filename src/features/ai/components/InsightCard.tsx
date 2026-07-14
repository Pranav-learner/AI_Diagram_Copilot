/**
 * InsightCard — one insight in the proactive feed.
 *
 * Shows the type + severity, title, summary, and (on request) a proactive
 * explanation, plus the transparent priority rationale. Actions map to the
 * Intelligence Engine's lifecycle: jump to affected elements, explain, mark
 * resolved, accept, dismiss. Holds no logic — every action forwards to the hook.
 */

import { useState } from 'react';
import { Target, Check, X, Info, ChevronDown, ChevronRight, ThumbsUp } from 'lucide-react';
import type { Insight, Severity } from '@/ai';
import { insightTypeLabel } from '@/ai';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils';
import type { UseIntelligence } from '../useIntelligence';

const SEVERITY: Record<Severity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-400 text-black',
  low: 'bg-sky-400 text-black',
  info: 'bg-muted text-muted-foreground',
};

export function InsightCard({ insight, intel }: { insight: Insight; intel: UseIntelligence }) {
  const [open, setOpen] = useState(false);
  const explanation = insight.observation ?? intel.explain(insight.id);
  const canFocus = insight.affectedEntities.length > 0;

  return (
    <li className="rounded-lg border bg-card p-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge className={cn('px-1 py-0 text-[9px] uppercase', SEVERITY[insight.severity])}>{insight.severity}</Badge>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{insightTypeLabel(insight.type)}</Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Info className="size-3" /> P{insight.priority.score}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{insight.priority.rationale}</TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-1 text-sm font-medium">{insight.title}</p>
          <p className="mt-0.5 text-xs text-foreground/80">{insight.summary}</p>
        </div>
      </div>

      {/* Explanation (proactive observation) */}
      <button type="button" className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Explain
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded bg-muted/50 p-2 text-xs text-foreground/90">
          <p>{explanation}</p>
          <p className="text-muted-foreground"><span className="font-medium">Recommendation:</span> {insight.recommendation}</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {canFocus && (
          <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-xs" onClick={() => intel.focus(insight.affectedEntities)} title="Highlight affected elements">
            <Target className="size-3" /> Jump ({insight.affectedEntities.length})
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => intel.accept(insight.id)} title="Accept this recommendation">
          <ThumbsUp className="size-3" /> Accept
        </Button>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => intel.resolve(insight.id)} title="Mark as resolved">
          <Check className="size-3" /> Resolve
        </Button>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" onClick={() => intel.dismiss(insight.id)} title="Dismiss">
          <X className="size-3" /> Dismiss
        </Button>
      </div>
    </li>
  );
}
