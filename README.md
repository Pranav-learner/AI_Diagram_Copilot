# AI Diagram Copilot

Application for an AI-powered diagram platform. Built in modules:

- **Phase 1 · Module 1** — polished application shell: dashboard, project
  management UI, routing, editor layout, theming, state management.
- **Phase 1 · Module 2** — a fully functional manual diagram editor: Excalidraw
  integrated behind a clean `CanvasEngine` abstraction, engine-backed toolbar,
  live inspector, and status bar.
- **Phase 1 · Module 3** — cloud persistence: FastAPI + PostgreSQL backend,
  real project CRUD, and debounced autosave. Draw, close the tab, reopen — your
  work is there.

There is still **no AI and no diagram DSL** — those plug into the seams built
here in later modules.

## Tech stack

**Frontend:** React · TypeScript (strict) · Vite · Tailwind · shadcn/ui (Radix) ·
React Router · Zustand · TanStack Query · Excalidraw

**Backend:** FastAPI · SQLAlchemy 2 · PostgreSQL · Alembic (see `backend/`)

## Running the full stack

```bash
# 1. Backend (see backend/README.md for details)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                 # set DATABASE_URL
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --port 8000

# 2. Frontend (in another terminal) — /api is proxied to :8000
npm install && npm run dev
```

## Getting started

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # type-check + production build
npm run typecheck  # strict type-check only
npm run lint       # ESLint
```

## What's included

- **Dashboard** (`/`) — header, search, sort, filter, grid/list toggle, recent
  rail, project cards with an overflow menu (Open / Rename / Duplicate / Delete),
  plus loading, empty, no-results, and error states.
- **Project CRUD UI** — create / rename / delete dialogs and duplicate action,
  wired through TanStack Query mutations against a mock service.
- **Editor** (`/editor/:projectId`) — Excalidraw canvas with an engine-backed
  toolbar (select, shapes, arrow, line, draw, text, image, hand, undo/redo,
  zoom, fit), a live inspector, and a live status bar.
- **Diagram editing** — draw, move, resize, rotate, group/ungroup, copy, paste,
  duplicate, delete, pan, zoom, undo, redo — all native Excalidraw behavior.
- **404** — catch-all route.
- **Theming** — light / dark / system with persistence and no flash on load
  (the canvas theme follows the app theme).
- **Responsive** — desktop, tablet, and mobile (drawer sidebar).

## Architecture

```
src/
├── app/          # providers, query client, router, theme bootstrap
├── components/
│   ├── ui/       # shadcn/Radix primitives (Button, Dialog, Select, …)
│   ├── common/   # cross-feature shared components (SearchInput, EmptyState, …)
│   ├── dashboard/ sidebar/ toolbar/ dialogs/ layout/
├── features/
│   └── canvas/   # the diagram engine feature (see below)
│       ├── CanvasEngine.ts        # the abstraction (interface + contract)
│       ├── adapters/              # ExcalidrawAdapter + tool/zoom/element maps
│       ├── state/                 # useCanvasStore (Zustand snapshot)
│       ├── context/               # CanvasProvider + context
│       ├── hooks/                 # useCanvas (engine) + reactive selectors
│       ├── components/            # Canvas host, Toolbar, Inspector, StatusBar
│       └── types/                 # engine-agnostic canvas types
├── hooks/        # data hooks (TanStack Query: projects, diagram, autosave) + UI
├── pages/        # route components
├── services/     # API client: apiClient, projectService, diagramApi
├── store/        # Zustand stores: project, ui, theme, autosave
├── types/        # shared TypeScript types
└── utils/        # pure helpers (formatting, query, thumbnails, cn)

backend/          # FastAPI + SQLAlchemy + PostgreSQL (see backend/README.md)
```

### The CanvasEngine abstraction

```
UI / future AI modules  →  CanvasEngine (interface)  →  ExcalidrawAdapter  →  Excalidraw
```

`CanvasEngine` is the only surface the rest of the app touches. Excalidraw is
imported **only** inside `adapters/` and the typed utils — never in UI code.
Imperative commands (`setTool`, `zoomIn`, `undo`, `deleteSelected`, `fitToScreen`,
…) go through `useCanvas()`; reactive state (selection, zoom, counts, history,
cursor, readiness) is published by the adapter to `useCanvasStore` and read via
narrow selector hooks. Swapping engines later means writing one new adapter — no
UI changes.

### Persistence & autosave (Module 3)

```
Canvas change → sceneVersion↑ → debounce (1.2s) → dirty check → PUT /diagram → Saved
```

- **The canvas engine never knows SQL; the database never knows Excalidraw.**
  The engine deals only in scenes. A pure serializer (`serializeScene` /
  `documentToInitialData`, in the canvas feature) translates a scene ⇄ a
  versioned `DiagramDocument`. The API sends that document as **opaque JSON**;
  Postgres stores it as **JSONB**. Neither side is coupled to the other — and
  the `schema`/`version` envelope is the seam for the Phase 2 Diagram-DSL
  migration (add a new `schema`, no storage change).
- **Autosave is timer/ref-driven, not render-driven.** `useAutosave` debounces
  on scene-version changes, guards against no-ops (dirty check) and concurrent
  requests (in-flight flag), retries with exponential backoff, and flushes when
  connectivity returns. Status (`Saving…/Saved/Offline/failed`) lives in its own
  `autosave` store, read by the top-bar indicator.
- **Server state vs. client state stay separated.** Project + diagram *data*
  live only in the TanStack Query cache; the `project` store holds view state
  (search/sort/filter/dialogs) and the `autosave` store holds save status. The
  diagram query uses `staleTime: Infinity` so a refocus never clobbers unsaved
  edits — autosave is the single writer that keeps the cache current.
- **Anti-corruption at the API edge.** The backend speaks `name`; the app speaks
  `title`. The mapping lives in `projectService`, so components and hooks were
  unchanged when the mock backend became a real one.
- **Backend clean architecture:** routes → services → repositories → models,
  with domain exceptions mapped to HTTP at the edge (details in `backend/`).
- **Imperative vs. reactive canvas state are split.** The engine interface is
  purely imperative (commands). All *observable* canvas state lives in a plain
  Zustand store the adapter writes to — so the high-rate updates from drawing and
  pointer-move re-render only the tiny subscribing panels, never the editor tree.
- **Focused Zustand stores** (`project`, `ui`, `theme`, plus the canvas store in
  its feature module) with no overlapping concerns; each persists only its
  durable slice.
- **`ui/` primitives vs. `common/` components.** `ui/` holds the design-system
  primitives (the conventional shadcn location); `common/` holds app-specific
  shared components composed from them.
- **The editor route is code-split**, so Excalidraw (a large dependency) only
  loads when a diagram is opened; the dashboard bundle stays lean.
- **Reuse over duplication.** Card and list rows share `ProjectThumbnail`,
  `ProjectActionsMenu`, and the `useProjectActions` hook; the sidebar shares one
  `SidebarContent` between its desktop rail and mobile drawer; sort and filter
  share a generic `OptionSelect`.
- **Barrel exports** per feature folder keep imports clean and stable.
