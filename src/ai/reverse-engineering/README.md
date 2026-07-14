# Reverse Engineering Engine

**Phase 5 · Module 2** — the deterministic static-analysis foundation for every
future repository feature.

It turns source repositories + infrastructure manifests into a **normalized AST**, a
**Code Knowledge Graph**, and **PKM entities** — the structured representations the
LLM reasons over. Raw code never reaches the model. Parsing and analysis are 100%
deterministic (no LLM); the engine resembles a modern static-analysis platform, not a
code parser.

```
Repository → ParserRegistry → NormalizedAST → StaticAnalysis → CodeKnowledgeGraph → PKM
```

It **unifies with the Document Intelligence Engine** (Module 1) through a shared PKM:
documents and code become one knowledge model.

---

## Quick start

```ts
import { ReverseEngineeringEngine, ProjectKnowledgeModel, DocumentIntelligenceEngine } from '@/ai';

// Share one PKM to unify docs + code.
const pkm = new ProjectKnowledgeModel();
const docs = new DocumentIntelligenceEngine({ pkm });
const code = new ReverseEngineeringEngine({ pkm });

code.addFiles([
  { path: 'src/user.service.ts', content: tsSource },
  { path: 'docker-compose.yml', content: composeSource },
  { path: 'db/schema.sql', content: sqlSource },
]);

code.getGraph();                    // Code Knowledge Graph (entities + relations)
code.search({ type: 'api' });       // endpoints
code.search({ type: 'infrastructure' });
code.getPKM().byKind('service');    // architecture entities, merged with documents

code.updateFile('src/user.service.ts', revised);  // incremental — re-parses only this file
```

The `ReverseEngineeringEngine` is the only surface consumers touch — never the raw
parser.

---

## Architecture

```
src/ai/reverse-engineering/
├── ast/
│   ├── NormalizedAST.ts     the unified, language-independent AST model
│   └── ASTBuilder.ts        the builder every parser uses
├── parsers/                 parser plug-ins (one normalized output, no leaked APIs)
│   ├── ParserRegistry.ts    detect language + dispatch
│   ├── detect.ts            filename/extension/content language detection
│   ├── yaml.ts              minimal YAML subset parser (Compose/K8s/OpenAPI)
│   ├── TypeScriptParser.ts  Python/Go/Java/SQL parsers …
│   └── … (12 parsers)
├── analysis/
│   ├── DependencyAnalyzer.ts    import/dependency graph + libraries
│   ├── CallGraphAnalyzer.ts     calls + inheritance/composition resolution
│   ├── InfrastructureAnalyzer.ts  compose/k8s/terraform wiring
│   ├── DatabaseAnalyzer.ts        foreign keys + data-access edges
│   ├── ApiAnalyzer.ts             endpoints ↔ modules ↔ schemas
│   ├── ArchitectureAnalyzer.ts    services / layers / bounded contexts / shared libs
│   └── index.ts                   project ASTs → graph + orchestrate analyzers
├── graph/CodeKnowledgeGraph.ts   the strongly-typed code graph
├── pkm/RepositoryMerger.ts       project the graph into the shared PKM
├── search.ts / validation.ts
└── ReverseEngineeringEngine.ts   the orchestrator (parse → analyze → graph → PKM)
```

## Parser architecture

A `LanguageParser` turns raw source into a `NormalizedAST` and nothing else — no
parser-specific type escapes. The `ParserRegistry` detects the language (filename,
extension, then content sniffing for the ambiguous YAML/JSON formats) and dispatches;
a parser that throws is caught and reported as a failed parse (never fatal). **New
languages are added by writing a parser and registering it** — the analysis/graph/PKM
layers never change.

Shipped parsers (all deterministic, dependency-free — hand-rolled scanners, not heavy
compiler libraries, to stay bundle-safe): **TypeScript/JavaScript, Python, Go, Java,
SQL, Dockerfile, Docker Compose, Kubernetes, Terraform, OpenAPI, GraphQL, JSON
Schema**. They are pragmatic static-analysis front-ends (like the Module-1 Markdown
parser), recovering gracefully on unfamiliar constructs.

## AST normalization

All languages normalize into common concepts: modules/packages, classes, interfaces,
enums, structs, functions, methods, variables/fields, imports/exports, annotations —
plus API (endpoint/operation/schema), data (table/column/view), and infrastructure
(service/container/deployment/resource/queue/cache/database/ingress/volume/secret)
concepts. Every node carries a **unique id, name, source ref (file + line range +
language), hierarchy, modifiers/annotations, and metadata**. Downstream code is
entirely parser-agnostic.

## Static analysis

Deterministic passes build the Code Knowledge Graph from the ASTs:

- **Projection** — every AST node becomes a graph entity with a stable id
  (`sym:module.Name`, `endpoint:GET /path`, `table:users`, `infra:kubernetes:web`, …)
  and `contains` edges.
- **Dependencies** — relative imports → module `dependsOn`; bare specifiers →
  `library` entities.
- **Call graph + inheritance** — per-function call lists and `extends`/`implements`/
  composition resolve through a `SymbolTable` (same-module preferred).
- **Infrastructure** — Compose `depends_on`, Kubernetes selectors/ingress, Terraform
  interpolations → `dependsOn`/`connectsTo`/`routes` (resolved within an infra
  namespace to avoid false cross-language links).
- **Database** — foreign keys → `references`; repository/DAO classes → `readsFrom`.
- **API** — modules `exposes` endpoints; endpoints `references` schemas.
- **Architecture** — bounded contexts (top dirs), layers (path conventions), services
  (endpoint-exposing modules), shared libraries (widely depended-on), integration
  points.

## Code Knowledge Graph

A strongly-typed graph of code + infra + architecture entities and their
relationships — the reverse-engineering analogue of the Semantic Graph. Entities merge
by stable id (a class referenced from two files is one entity); relations dedup. This
is what the LLM (and the PKM merge) reasons over.

## PKM integration

`RepositoryMerger` projects the **architecture-significant** entities (modules,
services, classes, endpoints, tables, infra, libraries, bounded contexts — not every
local variable) into the shared PKM, mapping code kinds to PKM kinds. Every merged
entity retains its **source, file, line, language, evidence, confidence, and origin**
(the spec's provenance requirements) as evidence + attributes, grouped by originating
file. Because documents and code share one PKM and merge by normalized name, a
`UserService` mentioned in a design doc and defined in code become one traceable entity.

## Incremental analysis & caching

Work is incremental so a one-file change never triggers a full repository rescan:

- **ASTs are cached by content hash** — a changed file re-parses only itself; unchanged
  files are cache hits.
- **The graph is rebuilt lazily** from the cached ASTs (cheap O(V+E) map work; the
  expensive artifact — parsing — is what's avoided).
- **The PKM syncs per-file by slice hash** — only files whose derived slice changed are
  re-ingested; removed files are withdrawn (the PKM's document-granular removal cleans
  up orphaned entities).

## Validation

`validateRepository` catches parser failures, recovered/unsupported constructs
(warnings), dangling relations, and corrupt entities.

## Design decisions

- **Deterministic-first.** All parsing + analysis is pure heuristics/scanning, so the
  Code Knowledge Graph is reproducible, testable, and free — the spec's "do not rely on
  the LLM to understand source code". The LLM only reasons over the graph/PKM.
- **The engine is the only surface.** Consumers read the graph + PKM, never the parser —
  exactly as AI features read the Semantic Graph, not the DSL.
- **Parser-agnostic core.** A new language is a new parser producing the same AST; the
  ~10 downstream files never change.
- **No heavy runtime deps.** Hand-rolled scanners keep the module bundle-safe and
  deterministic (no tree-sitter/compiler at runtime).
- **Unified with documents** through a shared PKM — one knowledge model for all external
  artifacts.

## Extending with a new language

1. Write a `LanguageParser` producing a `NormalizedAST` (use `ASTBuilder`).
2. Add its extension/detection to `detect.ts`.
3. List it in `parsers/index.ts`.

That's it — the AST normalization, analyzers, graph, and PKM merge apply automatically.

## How this prepares the platform

The Code Knowledge Graph + PKM are the deterministic substrate future modules stand on:

- **Smart Import** — `Repository → ReverseEngineeringEngine → PKM → Architecture Planner
  → Diagram Planner → DSL → Canvas`. The planner reads the graph/PKM (services, modules,
  dependencies, infra), never the raw repo.
- **Repository Copilot** — Q&A + navigation over the Code Knowledge Graph
  (symbol/dependency/API/infra/relationship search is already here).
- **Architecture Visualization** — bounded contexts, layers, services, dependency
  chains, and integration points are already extracted as semantic concepts.
- **AI Documentation** — the PKM (code + docs unified, fully traceable) is ready-made
  grounding for generating or answering questions about a codebase.
- **Multi-agent workflows** — the PKM is a shared, evidence-backed blackboard; a
  language/infra/security agent contributes parsers/analyzers and reads the connected
  model, coordinating through deterministic state.

Because parsing, analysis, and the graph are deterministic and parser-agnostic, all of
these extend the platform without re-plumbing.
