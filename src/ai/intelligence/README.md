# Diagram Intelligence Engine

**Phase 4 · Module 4** — the proactive reasoning layer.

This is not another chat feature. The Intelligence Engine **continuously watches**
the diagram, runs the deterministic static analysis from Module 3, stores the
findings in a stateful repository with a lifecycle, aggregates and **ranks** them
into a proactive **insight feed**, and lazily uses the LLM to narrate a briefing.
It behaves like an experienced architect continuously reviewing the design — "I
noticed this service has become a single point of failure" — rather than waiting to
be asked.

The application discovers and scores; the AI reasons and recommends. It is designed
to be the central reasoning layer future enterprise features reuse.

```
Diagram Runtime → Understanding Engine → Semantic Graph
      ↓  StaticAnalysisEngine   (deterministic findings — Module 3)
      ↓  FindingRepository      (stateful: new / resolved / recurring / dismissed)
      ↓  aggregation            (merge related · suppress duplicates)
      ↓  prioritization         (ranked + explained)
Insight Feed  ─┬─────────────────────────────────────────────► UI (proactive)
               ↘ (on demand)  InsightPlanner → LLM → InsightFormatter → briefing
```

Each layer has a single responsibility, and discovery/scoring stay strictly
separate from LLM reasoning.

---

## Quick start

```ts
import { IntelligenceEngine, UnderstandingEngine } from '@/ai';

const understanding = UnderstandingEngine.attach(runtimeChangeSource);   // Phase 4 M1
const intel = new IntelligenceEngine({ graphSource: understanding, service }); // auto-refreshes

intel.getFeed();                     // ranked, deterministic insights (proactive)
intel.priorityQueue(5);              // top 5
intel.suggestedNextActions();        // "Add a replica for Postgres", …
intel.contextualSuggestions(ids);    // suggestions for the current selection
intel.timelineEvents();              // discovered / resolved / recurring / …

intel.dismiss(id); intel.resolve(id); intel.accept(id);   // lifecycle
await intel.generateBriefing();      // LLM "I noticed…" narrative (degrade-safe)

intel.onUpdate((snapshot) => render(snapshot));   // proactive updates on diagram change
```

The copilot sidebar's **Insights** view renders the feed, filters, the briefing,
next actions, contextual suggestions, and the timeline; each insight can jump to its
affected elements on the canvas.

---

## Architecture

```
src/ai/intelligence/
├── model/
│   ├── Insight.ts     Insight, InsightType, InsightPriority, category→type mapping
│   ├── Timeline.ts    TimelineEvent / TimelineEventKind
│   └── Briefing.ts    InsightBriefingSchema (LLM output) + FormattedBriefing
├── FindingRepository.ts   stateful store: reconcile → RepositoryDiff, lifecycle, recurrence
├── IntelligenceTimeline.ts append-only lifecycle log (bounded)
├── aggregation.ts         findings → merged InsightDrafts (group by rule)
├── prioritization.ts      transparent ranking (severity·confidence·impact·frequency·context·activity)
├── InsightPlanner.ts      assemble the LLM's briefing context (insights + summary + context)
├── InsightFormatter.ts    fuse insights + LLM briefing → FormattedBriefing (degrade-safe)
├── IntelligenceEngine.ts  orchestrator: watch → analyze → reconcile → aggregate → rank → feed
├── MockInsightProvider.ts heuristic provider (no key / deterministic tests)
├── prompts/insightPrompts.ts   versioned template ("narrate, don't rediscover")
└── __tests__/             38 tests: repository, aggregation, prioritization, timeline, engine, large
```

## The Intelligence Engine

`IntelligenceEngine` subscribes to the Understanding Engine's change stream and, on
every diagram change, runs its pipeline:

1. **analyze** — the deterministic `StaticAnalysisEngine` reports the findings present now;
2. **reconcile** — `FindingRepository.update()` diffs them against history;
3. **aggregate** — findings are merged into insights (grouped by rule);
4. **prioritize** — insights are ranked and explained;
5. **feed** — the ranked insights are cached and listeners are notified.

The LLM briefing is **lazy and on-demand** (and cached per version), so continuous
monitoring never spams the model. It exposes: `getFeed(filter)`, `priorityQueue`,
`suggestedNextActions`, `contextualSuggestions`, `timelineEvents`, the lifecycle
actions, `generateBriefing`, `explainInsight`, `metrics`, and `onUpdate`.

## The Finding Repository

The static analyser is stateless; the repository gives findings a life. Keyed by the
finding's **stable id**, `update(findings, version)` produces an incremental
`RepositoryDiff`:

- **added** — findings never seen before;
- **resolved** — active findings that disappeared after an edit;
- **recurring** — findings that came back after being resolved;
- and it counts **suppressed duplicates** (a known finding seen again is *not*
  re-announced) and tracks `seenCount`, `firstSeen`/`lastSeen`, and reappearances.

User status is first-class: `dismiss()` hides a finding (suppressed even if it
recurs); `markResolved()` marks it fixed but lets it **resurface as recurring** if a
later analysis still detects it ("you said fixed, but it's still here").

## The ranking algorithm (priority model)

Priority is a transparent sum of weighted factors, and every factor is recorded:

| Factor | Weight |
| --- | --- |
| Severity | critical 40 · high 25 · medium 12 · low 5 · info 1 |
| Confidence | up to +8 (when ≥ 0.8) |
| Business impact | by category (security 15, availability 12, process 9, …) |
| Technical impact | by category (scalability/coupling/perf/availability 8, …) |
| Frequency | recurring: +3 per prior sighting, capped |
| Diagram context | affects a structural hub: +8 |
| User activity | affects a recently-selected/edited element: +6 |

Each insight's `priority.rationale` explains the ranking ("Ranked by: critical
severity · affects a central hub · recurring"), and the feed is sorted highest-first.
Re-prioritisation on selection is cheap (no re-analysis).

## Aggregation & duplicate suppression

Findings are merged by the **rule** that produced them, so the feed reads like a
mentor ("3 services are single points of failure") instead of N raw lines. Duplicate
suppression happens at two levels: the analyser dedups by id within one run, and the
repository dedups the *same finding across versions* (re-sightings are suppressed,
never re-announced). The grouping strategy is deterministic and swappable.

## The timeline & insight lifecycle

`IntelligenceTimeline` is an append-only, bounded log. Repository diffs become
`discovered`/`resolved`/`recurring` events; user actions become `dismissed`/
`accepted`. An insight's lifecycle: **discovered → (ranked in feed) → dismissed |
accepted | resolved**, with recurrence bringing resolved items back. This is the
substrate for "what changed since I last looked" and future historical analysis.

## Proactive monitoring & incremental updates

The engine reacts to diagram changes (manual edits, AI generation, editing) via the
Understanding Engine's `onUpdate`. Work is bounded:

- a refresh is **skipped entirely** when the graph version is unchanged;
- the repository yields the incremental **diff**, so insights only change for
  findings that actually changed;
- the **LLM briefing is cached per version** and only regenerated on demand;
- **selection changes re-prioritise only** (cheap) — no re-analysis.

## Observability, caching & error handling

- **Observability** — `metrics()` reports active insights, suppressed duplicates,
  dismissed/accepted/resolved counts, last analysis/briefing durations, and timeline
  size; LLM calls flow through the shared `AIMetrics` tagged `intent: 'insight'`.
- **Caching** — the feed is the recompute-on-change cache; priority scores live on the
  insights; the briefing is version-cached.
- **Graceful degradation** — an analysis failure keeps the previous insights; a
  provider failure yields a deterministic briefing; an empty diagram is handled
  cleanly. Nothing here throws in normal operation.

---

## Extending

- **A new insight type** — add it to `InsightType` and the category/rule → type
  mapping in `model/Insight.ts`. No engine change.
- **New discovery** — add a `ReviewRule` (Module 3); the repository, aggregation,
  ranking, timeline, and UI pick it up automatically.
- **A different ranking** — adjust the weights/factors in `prioritization.ts`; the
  rationale stays transparent.
- **A different merge strategy** — swap the grouping in `aggregation.ts`.

## How this prepares the platform

The Intelligence Engine is deliberately the reasoning layer future enterprise
modules build on:

- **Smart Import** — an importer emits a `DiagramDocument`; it flows through the same
  Understanding → analysis → intelligence pipeline, so an imported diagram gets an
  instant, ranked health assessment with zero new plumbing.
- **Reverse Engineering** — reconstructed diagrams become Semantic Graphs; the
  repository + timeline turn a one-off reconstruction into a *monitored* system whose
  findings evolve as the source changes.
- **Multi-Agent Collaboration** — the `FindingRepository` is a shared, structured
  blackboard: agents (a security agent, a cost agent) contribute findings/rules and
  read the ranked feed, coordinating through deterministic state rather than prose.
- **Enterprise Intelligence** — findings, scores, priorities, and the timeline are
  structured, queryable artifacts — the foundation for cross-diagram trends,
  benchmarking, and portfolio-level architecture intelligence.

Because discovery, aggregation, and ranking are deterministic and graph-based, all of
these extend the platform without re-plumbing — and, like every capability since
Phase 4 M1, they never reason over the raw Diagram DSL.
