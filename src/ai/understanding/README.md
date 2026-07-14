# Diagram Understanding Engine

**Phase 4 · Module 1** — the semantic backbone every future AI capability reads.

The AI can already _generate_ and _edit_ diagrams. This module makes it _understand_
them. It is deliberately built as a **compiler front-end**, not a parser:

```
Diagram DSL            ← "source code"      (src/dsl)
   ↓  Understanding Engine  (this module)
Semantic Graph         ← intermediate representation (IR)
   ↓  Context Builder
LLM                    → Explain · Review · Insights · Smart Import · multi-agent
```

Every future understanding feature consumes the **Semantic Graph**, never the raw
DSL. This module ships **zero user-facing AI features** — only the IR, the analysis
and query layers over it, context extraction, summaries, incremental sync, and
caching. Explain Mode, Diagram Review, and AI Insights are explicitly _out of scope_
and plug in on top without touching this layer.

---

## Quick start

```ts
import { UnderstandingEngine } from '@/ai';

// 1. Attach to the live diagram (app wires the runtime to the port).
const engine = UnderstandingEngine.attach({
  getDocument: () => runtime.getDocument(),
  getVersion: () => runtime.getVersion(),
  subscribe: (fn) => runtime.subscribe(fn),
});

// 2. Query it — the surface every future AI module uses.
const q = engine.query();
q.findEntity('API Gateway');            // resolve by id → label → fuzzy
q.findDependencies(gatewayId);          // what it depends on
q.findPath(userId, dbId);               // shortest path + relationship ids
q.search('auth');                       // ranked lexical search
q.digest().text;                        // "A diagram of 6 elements and 6 …"

// 3. Extract compact, budgeted context for a prompt.
const ctx = engine.extractContext({ kind: 'neighborhood', id: gatewayId, radius: 2 });
renderContext(ctx);                     // fenced JSON block, token-bounded

// 4. It stays in sync automatically; caches invalidate by region.
```

Static (no live diagram): `UnderstandingEngine.fromDocument(doc)`.

---

## Architecture

```
src/ai/understanding/
├── model/          The IR — strongly-typed, renderer-independent
│   ├── entity.ts         SemanticEntity, EntityKind, EntityCategory, geometry, ports
│   ├── relationship.ts   SemanticRelationship, RelationshipKind, DEPENDENCY_KINDS
│   ├── group.ts          SemanticGroup (the containment axis)
│   └── graph.ts          SemanticGraph, GraphIndex (interface), GraphStats
├── build/          DSL → IR compilation
│   ├── classify.ts               role/shape/type → canonical kinds (the "semantic analysis" pass)
│   ├── GraphIndex.ts             precomputed adjacency + secondary indexes
│   ├── SemanticGraphBuilder.ts   full build
│   └── incremental.ts            delta build (reuse unchanged, reclassify only the change)
├── analysis/       Graph algorithms over the IR
│   ├── traversal.ts   bfs, dfs, reachable, neighborhood (directional, kind-filtered)
│   ├── paths.ts       shortestPath, allSimplePaths, dependencyChains, isReachable
│   ├── components.ts  connectedComponents, findCycle, topologicalOrder, sources/sinks/isolated
│   ├── hierarchy.ts   ancestors, descendants, containmentPath, commonAncestor
│   └── search.ts      ranked lexical search
├── context/        ContextExtractor — scope → compact, budgeted slice + renderer
├── summary/        Deterministic prose + structured digests (diagram/entity/group/…)
├── query/          SemanticQuery — the clean, intent-shaped read API
├── validation/     validateSemanticGraph — integrity checks over the IR
├── cache/          RegionCache — dependency-aware, region-scoped memoisation
├── engine/         UnderstandingEngine (stateful sync + caches) + the change-source port
└── __tests__/      68 tests across build/analysis/query/context/summary/incremental/cache/validation/engine/large
```

### Two axes, kept separate

The IR models a diagram along **two independent axes**, and never conflates them:

- **The relationship graph** — directed edges (`dependsOn`, `calls`, `produces`, …).
  Walked by `analysis/traversal`, `paths`, `components`. This answers "what depends on
  what", "is there a cycle", "shortest path".
- **The containment tree** — groups and container nodes. Walked by `analysis/hierarchy`.
  This answers "what's inside the Backend group", "what encloses this node".

Mixing them is the classic mistake (is "A contains B" an edge or a hierarchy?). Keeping
them orthogonal makes both traversals simple and correct.

---

## The Semantic Graph (IR)

A `SemanticGraph` is an **immutable snapshot**: id-keyed maps of entities,
relationships, and groups, plus a precomputed `GraphIndex` and aggregate `GraphStats`.

- **`SemanticEntity`** — a _typed symbol_: `kind` (`service`, `database`, `queue`, …),
  `category` (`compute`/`data`/`messaging`/…), `label`, `description`, `tags`,
  `attributes`, `ports`, pure `geometry`, and `source` provenance back to the DSL.
  Nothing renderer-specific leaks — geometry is plain math, not an Excalidraw element.
- **`SemanticRelationship`** — a directed, canonical edge (`dependsOn`, `connectsTo`,
  `calls`, `contains`, `owns`, `produces`, `consumes`, `references`, `triggers`, `uses`, …).
- **`SemanticGroup`** — a containment node (`group`/`container`/`frame`/`swimlane`).

**Open vocabularies.** `EntityKind` and `RelationshipKind` are `… | (string & {})`.
The built-ins give autocomplete and exhaustiveness for the common architecture/flow
vocabulary, but a domain-specific kind (`kafka-topic`) is preserved verbatim rather
than flattened to `unknown` — future domains extend without touching the engine.

### Classification adds the value the DSL lacks

The DSL stores a raw `semantic` role and a `shape`; it has no first-class relationship
type. `build/classify.ts` _infers_ meaning with a clear precedence:

- **Entities:** explicit `semantic` role → shape heuristic (`cylinder`→database) →
  structural node type → `unknown`. Each result records whether it was `inferred`.
- **Relationships:** `metadata.semanticRelation` / `metadata.relType` hint → arrowhead
  fallback (`flowsTo` when directed, `connectsTo` otherwise).

### The index makes queries cheap

`GraphIndex` precomputes adjacency (`outgoing`/`incoming`/`successors`/`predecessors`),
the containment tree (`childrenOf`/`parentOf`), and secondary indexes
(`byKind`/`byLabel`/`byTag`/`byGroup`/`relationshipsByKind`). Every query is **O(1) or
O(degree)** — nothing scans the whole graph. `GraphStats` (component count, cycle flag,
densest node, isolated count) is computed once at build.

---

## Graph analysis

All algorithms are O(V+E) over the precomputed adjacency and are **direction-aware**
(`out` / `in` / `both`) with an optional relationship-kind filter.

| Utility | Function |
| --- | --- |
| Traversal | `bfs`, `dfs` (order + depth + parent tree) |
| Reachability | `reachable`, `isReachable` |
| Neighbourhood | `neighborhood` (k-hop, undirected by default) |
| Shortest path | `shortestPath` → `Path { nodes, relationships, length }` |
| All paths | `allSimplePaths` (capped — the count can be exponential) |
| Dependency chains | `dependencyChains` (walks `DEPENDENCY_KINDS` only) |
| Components | `connectedComponents` (weakly-connected, largest-first) |
| Cycles | `findCycle` (returns the loop), `hasCycle` |
| Ordering | `topologicalOrder` (Kahn's; `null` if cyclic) |
| Roles | `sources`, `sinks`, `isolated` |
| Hierarchy | `ancestors`, `descendants`, `containmentPath`, `commonAncestor` |
| Search | `search` (field-weighted: label > tag > kind > description > attr) |

A `Path` carries the **relationship ids**, not just node ids, so a future Explain Mode
can say _how_ two things relate, not merely that they do.

---

## Context extraction

`extractContext(graph, scope, opts)` turns a **scope** into the smallest relevant slice
of the IR that answers a question about it:

```ts
type ContextScope =
  | { kind: 'whole' }
  | { kind: 'selection'; ids }
  | { kind: 'entity'; id }
  | { kind: 'group'; id }
  | { kind: 'subgraph'; ids }
  | { kind: 'neighborhood'; id; radius? }
  | { kind: 'path'; from; to };
```

- **Focus is pinned; context is ranked.** Focus entities are always included; the rest
  are ranked by structural salience (degree, then area) and included greedily until a
  **token budget** is hit.
- **Truncation is never silent.** When entities are dropped the result sets
  `truncated: true` and `renderContext` emits `"truncated": true` — the model is told
  what it cannot see, matching the Context Builder's contract.
- **Boundary awareness.** Relationships crossing the region's edge are counted
  (`boundaryRelationshipCount`) rather than dumped, keeping the payload compact.

`renderContext` produces a compact fenced-JSON block with ids surfaced so the model can
reference elements precisely; `contextTokens` estimates its cost.

## Summaries

Deterministic, dependency-free prose + structured digests (no LLM) that become prompt
grounding: `summarizeDiagram` (with a `TopologyProfile`: `linear`/`tree`/`dag`/`star`/
`mesh`/`cyclic`/`disconnected`, hubs, sources, sinks), `summarizeTopology`,
`summarizeEntity`, `summarizeGroup`, `summarizeSelection`, `summarizeSubgraph`. Being
pure functions of the IR, they are trivially cacheable and reproducible.

## Query API

`SemanticQuery` is the **only surface future AI modules should touch**. It hides
adjacency/index/traversal mechanics behind intent-shaped methods: `findEntity`,
`findEntitiesByKind/Tag`, `findNeighbors`, `findNeighborhood`, `findPath`,
`findAllPaths`, `findDependencies`/`findDependents`, `findProducers`/`findConsumers`
(a data-flow reading over produce/consume kinds), `findGroup`, `findMembers`,
`connectedComponents`, `findCycle`, `topologicalOrder`, `search`, `digest`, `summarize`,
`extractContext`, and `validate`. A query is bound to one immutable graph; the engine
hands out a fresh one after each update so callers never reason over stale structure.

---

## Incremental synchronization

Rebuilding the whole graph on every keystroke would be wasteful. The DSL is immutable
with **structural sharing**: an edit produces a new document in which only the touched
entities are _new objects_; everything else is referentially identical.

`incrementalUpdate(prevGraph, prevDoc, nextDoc, version)` exploits that:

1. **Diff by identity** — `prev[id] !== next[id]` finds changed/added/removed nodes,
   edges, groups, and tags in O(V+E).
2. **Reclassify only the delta** — the expensive classification runs on the changed
   entities/relationships; unchanged semantic objects are **reused by reference**.
   An entity is rebuilt when its node changed, an incident edge changed (ports move), a
   tag it references changed, or its group membership changed.
3. **Rebuild the light index** — `GraphIndex` is cheap map-work, so it is always rebuilt
   fresh for the new snapshot. This is the deliberate trade: the _semantic_ layer (the
   part that could one day be LLM-augmented) is incremental; the _mechanical_ index is not.
4. **Report the changed id set** (`ChangedIds`) — which drives cache invalidation.

An incremental result is verified equal to a full rebuild of the same document (see
`incremental.test.ts`). A document-id change falls back to a full rebuild.

The `UnderstandingEngine` drives this off the `DiagramChangeSource` port: on each commit
it pulls the new document (skipping work when the version is unchanged) and applies the
delta.

## Caching

`RegionCache<T>` is **dependency-aware**. Each entry records the set of ids it was
derived from; on update, only entries whose dependency region **intersects the changed
ids** are evicted — the rest survive across versions. Entries with no dependencies
(whole-diagram derivations like the digest) are conservatively evicted on any change.

The engine keeps two: a **context cache** and a **summary cache**. A one-node edit
therefore evicts only the caches that touched that node — a gateway's context survives an
edit to a node two hops away, while the whole-diagram summary is recomputed
(`engine.test.ts` asserts exactly this). `cacheStats()` exposes hits/misses/evictions.

---

## Validation

`validateSemanticGraph` catches inconsistencies that matter to _reasoning_ (distinct
from the DSL's own validation): `broken-reference` (relationship endpoint missing),
`invalid-relationship`, `self-loop`, `dangling-group-ref`, `missing-member`,
`duplicate-id` (an id used as both entity and group), `circular-ownership` (containment
cycle), and `corrupt-metadata`. It returns `{ ok, errors, warnings, issues }` so a future
capability can refuse to reason over a corrupt graph rather than emit confident nonsense.

---

## Design decisions

- **Renderer independence is absolute.** No Excalidraw, DOM, or renderer concept appears
  anywhere in this module. Geometry is pure math; provenance (`source.nodeType`/`shape`/
  `role`) points back to the _DSL_, never a rendered element. Swapping renderers changes
  nothing here.
- **Decoupled like the rest of `@/ai`.** The engine imports `@/dsl` for _types only_ and
  reaches the live diagram through the `DiagramChangeSource` **port** — mirroring the AI
  Foundation's `DiagramContextSource`. The app wires the runtime in; the engine never
  imports the diagram-engine.
- **Immutable snapshots + structural sharing.** Every update yields a _new_ graph that
  shares unchanged objects with the last one. This is what makes identity-based cache
  invalidation and reference-equality diffing correct.
- **Open, extensible vocabularies.** New kinds/relationships are data, not code changes.
- **The query API is the contract.** Future modules depend on `SemanticQuery`, not on the
  graph internals — so indexes and algorithms can be optimised without breaking consumers.
- **Deterministic and pure** everywhere it can be (build, classify, analysis, summaries,
  validation) — reproducible outputs, trivial caching, easy testing.

## How this enables the future — without architectural change

Every planned capability is a _consumer_ of this IR; none needs a change here:

- **Explain Mode** — reads `SemanticQuery`: `digest()`/`summarize(scope)` for prose,
  `findPath` (with relationship ids) to explain _how_ things connect, `extractContext`
  to ground the prompt. Read-only IntentHandler, no new engine work.
- **Diagram Review** — `findCycle`, `connectedComponents`, `isolated`, `dependencyChains`,
  and `validateSemanticGraph` are exactly the primitives for "dependency cycle here",
  "orphaned service", "single point of failure at this hub".
- **AI Insights** — `TopologyProfile` (shape, hubs, sources/sinks) + kind/relationship
  breakdowns are ready-made observations; add heuristics on top.
- **Smart Import** — an importer emits a `DiagramDocument`; `buildSemanticGraph` +
  `validateSemanticGraph` classify and vet it through the same path as everything else.
- **Multi-agent reasoning** — `extractContext` gives each agent a compact, budgeted,
  region-scoped view of a shared IR; the `onUpdate` event stream keeps them synchronized.

Because they all read the Semantic Graph through `SemanticQuery` and `extractContext`,
**no future AI module ever reasons over the raw Diagram DSL** — the module's central
architectural guarantee.
