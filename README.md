# AI Diagram Copilot

Application shell for an AI-powered diagram platform — **Phase 1, Module 1**.

This module delivers the polished, production-quality *skeleton*: dashboard,
project-management UI, routing, editor shell, theming, and state management. It
contains **no** AI, no diagram engine, and no real backend — those plug into the
seams built here in later modules.

## Tech stack

React · TypeScript (strict) · Vite · Tailwind CSS · shadcn/ui (Radix) ·
React Router · Zustand · TanStack Query

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
- **Editor shell** (`/editor/:projectId`) — top navigation, collapsible left
  sidebar, canvas placeholder, right inspector, and a live status bar.
- **404** — catch-all route.
- **Theming** — light / dark / system with persistence and no flash on load.
- **Responsive** — desktop, tablet, and mobile (drawer sidebar).

## Architecture

```
src/
├── app/          # providers, query client, router, theme bootstrap
├── components/
│   ├── ui/       # shadcn/Radix primitives (Button, Dialog, Select, …)
│   ├── common/   # cross-feature shared components (SearchInput, EmptyState, …)
│   ├── dashboard/ editor/ sidebar/ toolbar/ dialogs/ layout/
├── hooks/        # data (TanStack Query) + UI hooks
├── pages/        # route components
├── services/     # mock backend (stands in for FastAPI + PostgreSQL)
├── store/        # Zustand stores: project, ui, theme, editor
├── types/        # shared TypeScript types
└── utils/        # pure helpers (formatting, query, thumbnails, cn)
```

### Key decisions

- **Server state vs. client state are separated.** Project *data* lives only in
  the TanStack Query cache (fed by `services/projectService`, a mock backend with
  simulated latency). The `project` Zustand store holds only *view* state —
  search, sort, filter, view mode, and which dialog is open. No data is
  duplicated across the two. Swapping the mock service for real `fetch` calls
  later requires no changes upstream.
- **Four focused Zustand stores** (`project`, `ui`, `theme`, `editor`) with no
  overlapping concerns; each persists only its durable slice.
- **`ui/` primitives vs. `common/` components.** `ui/` holds the design-system
  primitives (the conventional shadcn location); `common/` holds app-specific
  shared components composed from them.
- **Reuse over duplication.** Card and list rows share `ProjectThumbnail`,
  `ProjectActionsMenu`, and the `useProjectActions` hook; the sidebar shares one
  `SidebarContent` between its desktop rail and mobile drawer; sort and filter
  share a generic `OptionSelect`.
- **Barrel exports** per feature folder keep imports clean and stable.
