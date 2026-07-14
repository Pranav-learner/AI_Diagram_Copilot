import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Insight, FormattedBriefing, IntelligenceSnapshot, ContextualSuggestions, SuggestedAction, FeedFilter } from '@/ai';
import { AIGenerationContext } from './AIGenerationContext';

/**
 * The Intelligence hook — the read/act surface for the proactive insight feed.
 *
 * It subscribes to the {@link IntelligenceEngine}'s update stream (the engine
 * refreshes itself on diagram changes), tracks the active filter and selection,
 * and exposes the feed, priority queue, timeline, next actions, contextual
 * suggestions, lifecycle actions, and the lazy LLM briefing. It owns no analysis
 * logic — the engine does everything; this only reflects and forwards.
 */
export interface UseIntelligence {
  readonly snapshot: IntelligenceSnapshot;
  readonly feed: readonly Insight[];
  readonly activeCount: number;
  readonly filter: FeedFilter;
  setFilter(filter: FeedFilter): void;
  readonly nextActions: readonly string[];
  readonly contextual: ContextualSuggestions;
  readonly briefing?: FormattedBriefing;
  readonly briefingLoading: boolean;
  generateBriefing(): void;
  dismiss(id: string): void;
  resolve(id: string): void;
  accept(id: string): void;
  explain(id: string): string;
  focus(ids: readonly string[]): void;
}

export function useIntelligence(): UseIntelligence {
  const ctx = useContext(AIGenerationContext);
  if (!ctx) throw new Error('useIntelligence must be used within an <AIGenerationProvider>.');
  const { intelligence, selectEntities, runtime } = ctx;

  const [snapshot, setSnapshot] = useState<IntelligenceSnapshot>(() => intelligence.snapshot());
  const [filter, setFilter] = useState<FeedFilter>({});
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [briefing, setBriefing] = useState<FormattedBriefing | undefined>(undefined);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // Proactive: the engine refreshes on diagram change and notifies us.
  useEffect(() => intelligence.onUpdate(setSnapshot), [intelligence]);

  // Track selection to drive contextual suggestions + activity-based ranking.
  useEffect(() => {
    const apply = (ids: readonly string[]) => {
      setSelection(ids);
      intelligence.noteActivity(ids);
    };
    const offSel = runtime.events.on('selection:changed', ({ ids }) => apply(ids));
    return () => offSel();
  }, [intelligence, runtime]);

  // The briefing is version-scoped; clear it when the diagram changes.
  useEffect(() => {
    setBriefing(undefined);
  }, [snapshot.version]);

  // Derived from the snapshot (the engine owns the algorithms; these mirror them
  // over the current, notified snapshot so React recomputes on every update).
  const feed = useMemo(() => applyFilter(snapshot.insights, filter), [snapshot, filter]);
  const nextActions = useMemo(() => nextActionsFrom(snapshot.insights), [snapshot]);
  const contextual = useMemo(() => contextualFrom(snapshot.insights, selection), [snapshot, selection]);

  const generateBriefing = useCallback(() => {
    setBriefingLoading(true);
    void intelligence
      .generateBriefing()
      .then((r) => setBriefing(r.briefing))
      .catch(() => setBriefing(undefined))
      .finally(() => setBriefingLoading(false));
  }, [intelligence]);

  const dismiss = useCallback((id: string) => intelligence.dismiss(id), [intelligence]);
  const resolve = useCallback((id: string) => intelligence.resolve(id), [intelligence]);
  const accept = useCallback((id: string) => intelligence.accept(id), [intelligence]);
  const explain = useCallback((id: string) => intelligence.explainInsight(id), [intelligence]);
  const focus = useCallback((ids: readonly string[]) => selectEntities(ids), [selectEntities]);

  return useMemo(
    () => ({
      snapshot,
      feed,
      activeCount: snapshot.insights.length,
      filter,
      setFilter,
      nextActions,
      contextual,
      briefing,
      briefingLoading,
      generateBriefing,
      dismiss,
      resolve,
      accept,
      explain,
      focus,
    }),
    [snapshot, feed, filter, nextActions, contextual, briefing, briefingLoading, generateBriefing, dismiss, resolve, accept, explain, focus],
  );
}

// ── Snapshot-derived views (mirror the engine's getFeed/next-actions/contextual) ──

function applyFilter(insights: readonly Insight[], filter: FeedFilter): readonly Insight[] {
  let list = insights;
  if (filter.severity) list = list.filter((i) => i.severity === filter.severity);
  if (filter.category) list = list.filter((i) => i.category === filter.category);
  if (filter.type) list = list.filter((i) => i.type === filter.type);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    list = list.filter((i) => `${i.title} ${i.summary} ${i.recommendation}`.toLowerCase().includes(q));
  }
  return list;
}

function nextActionsFrom(insights: readonly Insight[], n = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const insight of insights) {
    const action = insight.recommendation.trim();
    const key = action.toLowerCase();
    if (action && !seen.has(key)) {
      seen.add(key);
      out.push(action);
      if (out.length >= n) break;
    }
  }
  return out;
}

function contextualFrom(insights: readonly Insight[], selection: readonly string[]): ContextualSuggestions {
  const set = new Set(selection);
  const related = insights.filter((i) => i.affectedEntities.some((e) => set.has(e))).slice(0, 4);
  const actions: SuggestedAction[] = [];
  if (selection.length > 0) {
    actions.push({ kind: 'explain', label: 'Explain the selection', targetIds: selection });
    actions.push({ kind: 'review', label: 'Review the selection', targetIds: selection });
  }
  for (const insight of related.slice(0, 2)) {
    actions.push({ kind: 'improve', label: insight.recommendation, insightId: insight.id, targetIds: insight.affectedEntities });
  }
  return { insights: related, actions: actions.slice(0, 4) };
}
