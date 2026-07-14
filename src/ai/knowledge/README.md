# Document Intelligence Engine

**Phase 5 · Module 1** — the first stage of the **Project Knowledge Model (PKM)**.

This module converts unstructured documents into structured knowledge. It does **not**
generate diagrams, parse code, or reverse-engineer anything. It is a professional
**knowledge-ingestion pipeline** whose output — the PKM — becomes the central
knowledge representation every future document-facing feature consumes.

```
Document → Parser → Structured Document Model → Knowledge Extraction → PKM → (future modules)
```

Discovery is **deterministic** (no LLM in the extraction path, per the spec); an LLM
enrichment pass can be layered on later without changing this contract.

---

## Quick start

```ts
import { DocumentIntelligenceEngine } from '@/ai';

const engine = new DocumentIntelligenceEngine();
engine.ingest({ name: 'architecture.md', content: markdown });   // parse → classify → extract → PKM

const pkm = engine.getPKM();
pkm.find('API Gateway');                    // merged, evidence-backed entity
pkm.relations();                            // "Orders Service dependsOn Database", …

engine.search({ text: 'gateway' });         // keyword / entity / tag / category / relationship / document
engine.summarizeDocument(docId);            // structured digests for future AI context
engine.summarizeArchitecture();

engine.ingest({ name: 'architecture.md', content: revised }); // incremental re-ingest (withdraw + add)
engine.remove(docId);                        // withdraw a document's unique contributions
```

The engine is the **only** surface consumers touch — never the raw parser.

---

## Architecture

```
src/ai/knowledge/
├── documents/
│   ├── StructuredDocument.ts   the renderer-independent document IR (strongly typed)
│   ├── DocumentParser.ts       Markdown/text → StructuredDocument (dependency-free)
│   ├── DocumentClassifier.ts   document type (README/PRD/SRS/ADR/…) + category taxonomy
│   └── DocumentIndexer.ts      incremental full-text index over the collection
├── extractors/                 deterministic knowledge extraction
│   ├── types.ts                Extractor contract + NLP heuristics
│   ├── EntityExtractor.ts      concepts, systems, services, APIs, databases, actors
│   ├── RelationshipExtractor.ts  dependencies / calls / uses / contains …
│   ├── RequirementExtractor.ts   requirements (MoSCoW) + responsibilities
│   ├── DecisionExtractor.ts       decisions + status
│   └── StatementExtractor.ts      goals, risks, constraints, assumptions
├── pkm/
│   ├── KnowledgeEntity.ts       entity model + kinds + evidence
│   ├── KnowledgeRelation.ts     relation model + kinds
│   ├── ProjectKnowledgeModel.ts the merged, incremental knowledge store
│   ├── KnowledgeIndex.ts        precomputed PKM lookups (by kind/tag/token/relation)
│   └── linking.ts               duplicate/synonym/acronym suggestions
├── summaries/summaries.ts       document/section/requirement/architecture/entity digests
├── search.ts                    unified query layer over the PKM + documents
├── validation.ts                document + PKM integrity checks
└── DocumentIntelligenceEngine.ts  the orchestrator (parse→classify→extract→PKM→index→cache)
```

## The Structured Document Model

A document compiles into a flat, id-keyed map of strongly-typed nodes plus a
hierarchy and outline — the document analogue of the Diagram DSL. Every element has a
**unique id, position (order + line), hierarchy (`parentId`), and metadata**. Node
kinds: section, paragraph, list, list item, table, code block, quote, callout, image,
thematic break — with inline spans (bold/italic/code/link/image) and a references
list. The parser is dependency-free and deterministic (content-hashed), and handles
frontmatter, nested/task lists, tables, fenced code, callouts, and setext/ATX
headings. Plain text degrades gracefully to paragraphs.

## Deterministic knowledge extraction

An `Extractor` reads the structured model and emits raw entities/relations **by name**
with evidence and confidence — regex/heuristics, never the LLM:

- **EntityExtractor** — definitions ("X is a service…"), bold/code spans, headings,
  table first-columns, Title-Case/CamelCase noun phrases; kind inferred from keywords.
- **RelationshipExtractor** — relation verbs ("depends on", "calls", "uses",
  "contains", "produces"…) and arrow notation, taking the nearest name on each side.
- **RequirementExtractor** — modal verbs (shall/must/should) → MoSCoW priority, ids
  (REQ-123), Requirements sections; plus responsibilities.
- **DecisionExtractor** — decision language + ADR status.
- **StatementExtractor** — goals, risks, constraints, assumptions (by section + lead-in).

A failing extractor is isolated by the engine, never fatal.

## The Project Knowledge Model (PKM)

The PKM merges extracted knowledge from **all** documents into one deduplicated,
connected graph:

- **Merging** — entities are keyed by a normalised name ("Auth Service" ≡ "auth
  service"); aliases and evidence accumulate, and a generic `concept` upgrades to a
  specific kind (`service`, `database`, …) when corroborated. Statement kinds
  (requirement/decision/risk/…) are kind-scoped so they don't cross-merge.
- **Traceability** — every entity/relation records the source document + node +
  excerpt and a confidence. Nothing is unsourced.
- **Incremental & reversible** — `removeDocument(id)` withdraws exactly that
  document's contributions, deleting entities/relations left with no evidence. So
  re-ingesting a changed document is `removeDocument` + `ingest` — the engine does
  this automatically and invalidates only the affected cache/index regions.

## Indexing, search, summaries

- **`KnowledgeIndex`** precomputes PKM lookups by kind/category/tag/document/name-token
  and relationship — rebuilt only when the PKM version changes.
- **`DocumentIndexer`** is an incremental token→postings full-text index (O(tokens) to
  add/remove one document) for keyword/section search across large collections.
- **`search`** unifies keyword, entity, tag, category, relationship, document, and
  section search over both indexes, returning ranked typed hits. (Semantic search
  plugs in as an extra ranker later.)
- **Summaries** are deterministic digests (document / section / requirement /
  architecture / entity) that become grounding context for future AI modules.

## Caching, performance, validation

- **Caching** — parsed documents and extraction results are cached by content hash
  (pure over content); summaries use a region-aware `RegionCache` invalidated only for
  the changed document/entity ids; the knowledge index is version-cached.
- **Performance** — content-hash short-circuits re-parsing; document removal is
  O(tokens-in-doc); indexes keep queries O(1)/O(k). A 300-section document parses in
  well under a second (tested).
- **Validation** — `validateDocument` catches broken references, invalid hierarchy,
  and broken parent/child links; `validatePkm` catches dangling relations and missing
  evidence.

## Design decisions

- **Deterministic-first.** Discovery is pure heuristics over the structured model, so
  the PKM is reproducible, testable, and free — the spec's "do not rely solely on the
  LLM". The LLM is a future enrichment layer, not a dependency.
- **The engine is the only surface.** Consumers read the PKM + summaries; they never
  touch the parser — exactly as future AI features read the Semantic Graph, not the DSL.
- **Renderer/format independent.** The Structured Document Model has no Markdown/HTML/
  PDF concerns; a new input format is a new parser producing the same model.
- **Everything is traceable.** Entities/relations carry evidence back to the source
  node, so any downstream claim can be justified.
- **Incremental by document.** Document-granular add/remove keeps a live collection
  fresh without full recomputation.

## How the PKM supports the future — without architectural change

The PKM is deliberately the central knowledge layer future modules stand on:

- **Reverse Engineering** — a code/repo analyser emits documents (or entities directly)
  into the same PKM; extracted systems/dependencies join the shared graph.
- **Smart Import** — an importer parses a spec into the PKM, then a Diagram Planner
  reads `summarizeArchitecture()` + the entity/relation graph to propose a diagram
  (`PKM → Diagram Planner → Diagram DSL → Runtime`). The parser is never exposed to the
  planner.
- **Repository Analysis** — many documents/files ingest incrementally; the PKM
  connects concepts across them (repeated entities, cross-document references).
- **AI Documentation** — summaries + the entity graph are ready-made grounding for
  generating or answering questions about docs.
- **Multi-agent workflows** — the PKM is a shared, evidence-backed blackboard: agents
  contribute extractors/entities and read the connected model, coordinating through
  deterministic state rather than prose.

Because ingestion, extraction, and the PKM are deterministic and format-independent,
all of these extend the platform without re-plumbing.
