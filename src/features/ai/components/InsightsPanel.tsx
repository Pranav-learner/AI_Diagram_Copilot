/**
 * InsightsPanel — the proactive intelligence sidebar view.
 *
 * Renders the ranked insight feed with severity/search filters, the lazy LLM
 * briefing, suggested next actions, contextual suggestions for the current
 * selection, and the intelligence timeline. It is a thin view over
 * {@link useIntelligence}; the engine does all the reasoning.
 */

import { Sparkles, Lightbulb, ListChecks, History, Search } from 'lucide-react';
import type { Severity } from '@/ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils';
import { useIntelligence } from '../useIntelligence';
import { InsightCard } from './InsightCard';
import { Markdown } from './Markdown';

const SEVERITIES: Array<Severity | 'all'> = ['all', 'critical', 'high', 'medium', 'low'];

export function InsightsPanel() {
  const intel = useIntelligence();

  return (
    <div className="flex h-full flex-col">
      {/* Header: briefing trigger + counts */}
      <div className="space-y-2 border-b p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="size-4 text-primary" /> Insights
            <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{intel.activeCount}</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={intel.generateBriefing} disabled={intel.briefingLoading || intel.activeCount === 0}>
            <Sparkles className="size-3.5" /> {intel.briefingLoading ? 'Briefing…' : 'Brief me'}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1">
          {SEVERITIES.map((s) => {
            const active = (intel.filter.severity ?? 'all') === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => intel.setFilter({ ...intel.filter, severity: s === 'all' ? undefined : (s as Severity) })}
                className={cn('rounded px-1.5 py-0.5 text-[11px] capitalize', active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                {s}
              </button>
            );
          })}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-1.5 top-1.5 size-3 text-muted-foreground" />
            <Input
              value={intel.filter.search ?? ''}
              onChange={(e) => intel.setFilter({ ...intel.filter, search: e.target.value || undefined })}
              placeholder="Search"
              className="h-6 w-24 pl-6 text-xs"
              aria-label="Search insights"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        {/* Briefing */}
        {intel.briefing && (
          <section className="rounded-lg border bg-primary/5 p-2.5">
            <Markdown content={intel.briefing.markdown} className="text-sm text-foreground/90" />
          </section>
        )}

        {/* Contextual suggestions for the selection */}
        {intel.contextual.insights.length > 0 && (
          <section className="space-y-1 rounded-lg border p-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">For your selection</p>
            <ul className="space-y-0.5 text-xs">
              {intel.contextual.insights.slice(0, 3).map((i) => (
                <li key={i.id} className="truncate">• {i.title}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Suggested next actions */}
        {intel.nextActions.length > 0 && (
          <section className="space-y-1">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <ListChecks className="size-3" /> Suggested next actions
            </p>
            <ol className="list-decimal space-y-0.5 pl-4 text-sm">
              {intel.nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          </section>
        )}

        {/* Feed */}
        {intel.feed.length > 0 ? (
          <ul className="space-y-2">
            {intel.feed.map((insight) => (
              <InsightCard key={insight.id} insight={insight} intel={intel} />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {intel.activeCount === 0 ? 'No insights — the design looks healthy.' : 'No insights match the filter.'}
          </p>
        )}

        {/* Timeline */}
        {intel.snapshot.timeline.length > 0 && (
          <section className="space-y-1">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <History className="size-3" /> Recent activity
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {intel.snapshot.timeline.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <span className="capitalize">{e.kind}</span>: {e.title}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
