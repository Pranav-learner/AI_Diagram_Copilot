# AI Diagram Copilot

Application for an AI-powered diagram platform. Built in modules:

- **Phase 1 · Module 1** — polished application shell: dashboard, project
  management UI, routing, editor layout, theming, state management.
- **Phase 1 · Module 2** — a fully functional manual diagram editor: Excalidraw
  integrated behind a clean `CanvasEngine` abstraction, engine-backed toolbar,
  live inspector, and status bar.

There is still **no AI, no backend persistence, and no diagram DSL** — those plug
into the seams built here in later modules.

## Tech stack

React · TypeScript (strict) · Vite · Tailwind CSS · shadcn/ui (Radix) ·
React Router · Zustand · TanStack Query · Excalidraw

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
├── hooks/        # data (TanStack Query) + UI hooks
├── pages/        # route components
├── services/     # mock backend (stands in for FastAPI + PostgreSQL)
├── store/        # Zustand stores: project, ui, theme
├── types/        # shared TypeScript types
└── utils/        # pure helpers (formatting, query, thumbnails, cn)
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

### Key decisions

- **Server state vs. client state are separated.** Project *data* lives only in
  the TanStack Query cache (fed by `services/projectService`, a mock backend with
  simulated latency). The `project` Zustand store holds only *view* state —
  search, sort, filter, view mode, and which dialog is open. No data is
  duplicated across the two. Swapping the mock service for real `fetch` calls
  later requires no changes upstream.
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
