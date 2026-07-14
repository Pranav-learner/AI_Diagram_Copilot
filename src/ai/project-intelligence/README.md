# Project Intelligence Engine (Phase 5, Module 3)

The **fusion layer** of the AI stack. It merges everything the upstream engines
extracted — documents, source code, infrastructure, OpenAPI/GraphQL, databases, and
existing diagrams — into a single **Project Intelligence Model (PIM)**: a
renderer-independent *semantic* "digital twin" of the whole software project.

Where the [Project Knowledge Model](../knowledge/README.md) (PKM) is a flat, name-keyed
store of facts extracted **per source**, the PIM is the *fused, enriched, cross-referenced*
layer: **one entity per real-world concept** regardless of how many sources described it,
with unified multi-source evidence, cross-source topology, detected conflicts, and inferred
architecture.

> **Architectural rule:** never expose raw repositories, individual parsers, or the PKM to
> an AI feature. Everything reasons over the PIM, through the single
> [`ProjectIntelligenceEngine`](./ProjectIntelligenceEngine.ts) front door.

Deterministic end-to-end — **no LLM anywhere in this module**.

## The pipeline

```
                shared Project Knowledge Model (PKM)
   documents ─┐   (facts extracted per source, name-keyed)
   code ──────┤
   infra ─────┼──►  ┌──────────────── FusionEngine ────────────────┐
   openapi ───┤     │ resolve entities → merge evidence →          │
   graphql ───┤     │ fuse relations → enrich → detect conflicts   │
   database ──┤     └──────────────────────┬───────────────────────┘
   diagrams ──┘                            ▼
                          Project Intelligence Model (the twin)
                          │  topology · queries · search · cross-refs
                          │  conflicts · validation · stats
                          ▼
                    ProjectIntelligenceEngine  ◄── the only AI-facing surface
```

### 1. Entity resolution (`fusion/EntityResolver.ts`)

The PKM already merges *exact-name* matches. The resolver handles the harder
cross-source cases: **naming differences** (`UserService` ↔ `user-service` ↔
`"User Service"`), **aliases**, and **version differences**. It clusters by
[`canonicalKey`](./util.ts) (folds camelCase / kebab / snake / dotted forms, letter↔digit
boundaries, and strips version suffixes) within a *kind family* — named things fuse across
kinds (a `service` and a `container` become one entity, keeping the most specific kind);
statements (requirements, decisions) never cross-merge. It also emits **partial-match**
cross-reference suggestions (token containment) *without* merging, preserving traceability.
Every PKM id → PIM id mapping is retained (`pim.resolvePkm`).

### 2. Evidence model (`fusion/EvidenceMerger.ts`)

Every fact keeps a typed [`Evidence`](./pim/ProjectIntelligenceModel.ts) record — **origin,
source, location, confidence, and extraction method** — classified into a source kind
(`document` / `code` / `infrastructure` / `api` / `database` / `diagram` / `inference`).
When many PKM entities fuse into one concept, all their evidence is merged and deduplicated,
so a PIM entity stays fully traceable to every artifact that described it. Multi-source
corroboration boosts confidence.

### 3. Relation fusion + enrichment (`fusion/FusionEngine.ts`, `enrichment.ts`)

Relations are rewritten onto cluster ids, deduplicated, and evidence-merged. Then
**semantic enrichment** adds the *inferred* layer: promotes architecture markers (layers,
bounded contexts) into first-class entities, derives **business domains** and
**capabilities**, and tags **critical components** (high fan-in), **shared libraries**,
**entry points**, and **exit points**. Every inferred entity/relation carries inference
evidence.

### 4. Conflict detection (`fusion/ConflictResolver.ts`)

Deterministic checks, each producing an explicit, evidence-backed
[`Conflict`](./pim/ProjectIntelligenceModel.ts):

| Conflict | Trigger |
| --- | --- |
| `missing-implementation` | Documented, implementable concept with no code/infra (project has code) |
| `outdated-diagram` | Appears in a diagram but not in code/infra |
| `version-mismatch` | Conflicting versions observed across sources |
| `duplicate-ownership` | Owned by ≥ 2 owners |
| `inconsistent-api` | Endpoint in code but absent from the API spec |

## The model & its surfaces

- **`pim/ProjectIntelligenceModel.ts`** — the immutable fused store, with precomputed
  indexes (by kind / category / tag / source kind, and relation adjacency) so every read
  is O(1)/O(k).
- **`pim/TopologyGraph.ts`** — semantic projections: `dependency`, `service`,
  `infrastructure`, `ownership`, `capability`, `requirement`, `workflow`.
- **`queries.ts` (`PimQuery`)** — `findOwners`, `findDependencies`, `findDependents`,
  `downstreamImpact` (transitive blast radius), `relatedDocumentation`,
  `findImplementation`, `findDeployment`, `findRequirements`, and generic `traverse`.
- **`crossref.ts`** — bidirectional navigation: an entity's evidence grouped by source kind,
  the reverse index (artifact → entities), and neighbours.
- **`search.ts`** — ranked entity / capability / service / requirement / API /
  infrastructure / diagram search.
- **`validation.ts`** — integrity checks (broken references, missing evidence).
- **`sources/DiagramSource.ts`** — projects a Diagram Understanding `SemanticGraph` onto the
  PKM's extraction contract, closing the fusion loop for **existing diagrams**.

## The engine (front door)

[`ProjectIntelligenceEngine`](./ProjectIntelligenceEngine.ts) shares one `ProjectKnowledgeModel`
with the document/code engines (`deps.pkm`), so all sources fuse into one twin. It rebuilds
the PIM **lazily and incrementally** — only when the PKM's version changes — and serves
topology, queries, search, cross-references, conflicts, validation, and stats over the
current snapshot. It can also `ingestDiagram` existing diagrams and notify `onUpdate`
listeners on rebuild.

```ts
import { ProjectIntelligenceEngine } from '@/ai';

const engine = new ProjectIntelligenceEngine({ pkm: sharedPkm }); // same PKM the doc engine writes to
engine.ingestDiagram({ id: 'system', graph: understanding.getGraph() });

const pim = engine.getPIM();
engine.query().downstreamImpact('UserService');   // who breaks if this changes?
engine.getTopology('service');                     // the service graph
engine.conflicts();                                // docs vs code vs diagrams drift
engine.crossReferences(pim.findByName('UserService')!.id); // docs ↔ code ↔ infra ↔ diagram
```

## How this prepares the next phases

The PIM is the substrate every future capability builds on, **without architectural change**:

- **Import Copilot / Repository Copilot** — reason over `getPIM()`, `query()`, `conflicts()`
  instead of raw files; `ingestDiagram` + the shared PKM already unify imported artifacts.
- **AI Documentation** — `crossReferences`, `relatedDocumentation`, and topology give
  grounded, evidence-cited generation.
- **Multi-Agent System** — agents share one read-only twin; `traverse` + topology are the
  common reasoning API.
- **Enterprise Architecture Intelligence** — capabilities, domains, layers, ownership, and
  conflicts are already first-class.

## Design notes

- **Deterministic & pure** — reproducible, testable, no network/LLM.
- **`noUncheckedIndexedAccess`-clean**, readonly types throughout.
- **Barrel hygiene** — a few names are aliased at the `@/ai` boundary to avoid collisions
  (`resolvePimEntities`, `detectPimConflicts`, `PimDirection`).
- **Not implemented here** (by design): Import Wizard, Repository UI, AI Chat, Multi-Agent
  System, Architecture Generation. This module is the *foundation* those consume.
