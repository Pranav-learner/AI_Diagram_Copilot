# Architecture Overview

AI Diagram Copilot is a full-stack diagram editor. Phase 1 delivers a polished,
standalone editor (no AI yet). This document explains how the pieces fit and how
the design is prepared for Phase 2 (Diagram DSL + AI).

## High-level shape

```
┌──────────────────────────── Frontend (React + TS) ────────────────────────────┐
│  pages ──▶ components ──▶ features/canvas (CanvasEngine ▶ Excalidraw)          │
│    │            │                    ▲                                          │
│    │            │                    │ imperative commands / reactive selectors │
│    ▼            ▼                    │                                          │
│  hooks (TanStack Query, autosave)   store (Zustand: project/ui/theme/…)        │
│    │                                                                            │
│    ▼  services (apiClient, projectService, diagramApi)                          │
└────┼───────────────────────────────────────────────────────────────────────────┘
     │ HTTP (/api, opaque JSON diagram document)
┌────▼──────────────────────── Backend (FastAPI) ───────────────────────────────┐
│  api/routes ──▶ services ──▶ repositories ──▶ models ──▶ PostgreSQL (JSONB)    │
└────────────────────────────────────────────────────────────────────────────────┘
```

Two hard boundaries make the system evolvable:

1. **The UI never imports Excalidraw.** Everything canvas-related goes through
   the `CanvasEngine` interface. Excalidraw lives behind one adapter.
2. **The database never understands the diagram format.** The diagram is stored
   as an opaque JSON document; only the frontend's canvas feature knows its shape.

## Frontend

### Folder structure

```
src/
├── app/          providers, query client, router, theme + root error boundary
├── components/
│   ├── ui/       shadcn/Radix primitives (Button, Dialog, Select, Switch, …)
│   ├── common/   shared app components (SearchInput, EmptyState, Shortcuts, …)
│   ├── dashboard/ sidebar/ toolbar/ dialogs/ layout/
├── features/
│   └── canvas/   the diagram engine feature (details below)
├── hooks/        data hooks (projects, diagram, autosave) + UI hooks
├── pages/        route components (Dashboard, Editor, Settings, NotFound)
├── services/     API client: apiClient, projectService, diagramApi
├── store/        Zustand: project, ui, theme, autosave, settings
├── types/        shared types
└── utils/        pure helpers (formatting, query, cn, appMeta)
```

### The CanvasEngine abstraction

```
UI / future AI modules  →  CanvasEngine (interface)  →  ExcalidrawAdapter  →  Excalidraw
```

`CanvasEngine` (`features/canvas/CanvasEngine.ts`) is the **only** canvas surface
the rest of the app uses. It is split into two halves:

- **Imperative commands** — `setTool`, `updateSelected`, `deleteSelected`,
  `groupSelected`, `undo`, `zoomIn`, `fitToScreen`, `setGrid`, … — accessed via
  `useCanvas()`.
- **Reactive state** — selection, zoom, counts, active tool, grid, history,
  cursor, readiness — published by the adapter into a plain Zustand store
  (`useCanvasStore`) and read through narrow selector hooks
  (`useCanvasSelection`, `useCanvasStatus`, …).

Why the split: canvas changes fire at very high rate (every pointer move / draw).
Keeping observable state in a plain store means those updates re-render only the
tiny panels that subscribe (inspector row, status segment) — never the editor
tree. Imperative commands stay side-effecting and out of React's render path.

`ExcalidrawAdapter` is the single module (plus small typed utils) that imports
Excalidraw. It translates:

- the engine's normalized `SelectedElement` / `ElementStyleUpdate` ⇄ Excalidraw
  elements (`normalizeElement`, `styleUpdate`);
- app tools ⇄ Excalidraw tools (`toolMapping`);
- viewport math for centered zoom (`zoom`).

Swapping or upgrading the engine means writing one new adapter — no UI change.

### The editable inspector

The inspector reads the normalized selection from the store and writes edits back
through `engine.updateSelected(patch)`. `updateSelected` maps the type-agnostic
patch to concrete Excalidraw fields **per element type** (text-only fields to
text, arrowheads to linear elements, geometry to all) and commits via
`updateScene` with `newElementWith` (which bumps versions so Excalidraw
reconciles). Selection is read from Excalidraw's app state (the source of truth),
not the derived store.

### Persistence & autosave

```
canvas change → sceneVersion↑ → debounce (1.2s) → dirty check → PUT /diagram → Saved
```

A pure serializer (`serializeScene` / `documentToInitialData`) converts a canvas
scene ⇄ a versioned `DiagramDocument`:

```ts
interface DiagramDocument {
  schema: 'excalidraw';      // ← discriminator: the Phase 2 DSL seam
  version: 1;                // ← document schema version
  scene: { elements, appState /* viewport */, files };
}
```

`useAutosave` is timer/ref-driven (not render-driven): it debounces on scene
changes, guards against no-ops (dirty check) and overlapping requests (in-flight
flag), retries with exponential backoff, and flushes on reconnect. Status lives
in its own `autosave` store and is shown in the top bar + status bar. Server
state (project + diagram) is owned by the TanStack Query cache; the diagram query
uses `staleTime: Infinity` so a refocus never clobbers unsaved edits.

### State management responsibilities

| Concern                     | Owner                                   |
| --------------------------- | --------------------------------------- |
| Server data (projects/diagram) | TanStack Query cache                 |
| Canvas runtime state        | `useCanvasStore` (written by the engine)|
| Project view (search/sort/…)| `useProjectStore`                       |
| Chrome (sidebar/inspector)  | `useUIStore`                            |
| Theme                       | `useThemeStore`                         |
| Autosave status             | `useAutosaveStore`                      |
| User settings               | `useSettingsStore`                      |

### Error handling

- **RootErrorBoundary** — catches anything that escapes; full-page recoverable
  fallback.
- **CanvasErrorBoundary** — isolates Excalidraw crashes to the canvas area.
- Route-level 404 + in-editor "diagram not found" + network/offline states.
- **OfflineBanner** + connection indicator in the status bar.

## Backend

Clean, layered architecture (`backend/`):

```
api/routes  →  services  →  repositories  →  models  →  PostgreSQL
 (HTTP)        (rules,        (data access)    (ORM)      (JSONB)
                transactions)
```

- Pydantic schemas define the camelCase JSON boundary.
- Services raise **domain exceptions** mapped to HTTP at the edge — so
  services/repositories never import FastAPI.
- The diagram `data` column is **JSONB** and opaque: the backend enforces size
  and version rules but never parses diagram structure.

See `backend/README.md` for endpoints and setup.

## Development setup

```bash
# Backend
cd backend && python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env               # set DATABASE_URL (Postgres)
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --port 8000

# Frontend (separate terminal)
npm install && npm run dev         # /api is proxied to :8000
```

Quality gates: `npm run typecheck`, `npm run lint`, `npm run build`;
`cd backend && .venv/bin/python -m pytest`.

## Phase 2 readiness

> **Phase 2 · Module 1 — Diagram DSL: implemented.** The domain model now lives
> in [`src/dsl/`](src/dsl/README.md) — a pure, renderer/backend/AI-agnostic,
> versioned model (`DiagramModel`, validation, serialization, migration,
> repository) with its own Vitest suite (`npm run test:run`). It is additive and
> not yet wired into rendering/persistence; that wiring is a later module.

The design intentionally leaves seams for the Diagram DSL to become the source
of truth and for AI to drive the editor:

- **The DSL slots into `DiagramDocument`.** New `schema` value → a new serializer
  branch; storage (opaque JSONB) is unchanged. `documentToInitialData` becomes
  `dsl → scene`, and `serializeScene` gains a `scene → dsl` path.
- **AI drives the editor through `CanvasEngine`.** Generation/edit features call
  the same imperative API the toolbar/inspector use (`updateSelected`, `setScene`,
  `setTool`, …) — no new coupling to Excalidraw.
- **Backend is format-agnostic.** Because it never parsed Excalidraw, it needs no
  change to persist DSL documents; a future `POST /diagrams/generate` would sit
  beside the existing CRUD.
```
