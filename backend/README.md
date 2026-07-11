# AI Diagram Copilot — Backend

FastAPI + SQLAlchemy + PostgreSQL persistence layer (Phase 1, Module 3).

## Architecture

Clean, layered architecture — each layer depends only on the one below it:

```
api/routes      HTTP endpoints (thin; declare request/response, call services)
   │
services        business logic + transaction boundaries (framework-agnostic)
   │
repositories    data access (query/persist one aggregate; no business rules)
   │
models          SQLAlchemy ORM (Project, Diagram)
```

- **`schemas/`** — Pydantic request/response models (camelCase JSON boundary).
- **`core/`** — settings, database engine/session, domain exceptions + handlers.
- Services raise **domain exceptions** (`NotFoundError`, `ConflictError`,
  `ValidationAppError`); the API layer maps them to HTTP — so services never
  import FastAPI and stay unit-testable.
- The diagram `data` column is **opaque JSONB**. The backend never interprets
  Excalidraw structure, so the Phase 2 Diagram-DSL migration needs no DDL.

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env          # then edit DATABASE_URL for your Postgres
```

### Database

Point `DATABASE_URL` at a PostgreSQL instance (psycopg v3 driver), e.g.:

```
DATABASE_URL=postgresql+psycopg://postgres@localhost:5432/diagram_copilot
```

A `docker-compose.yml` is provided for a throwaway Postgres:

```bash
docker compose up -d          # starts postgres on :5432
```

Apply migrations:

```bash
.venv/bin/alembic upgrade head
```

## Run

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health:   http://localhost:8000/api/health

On first startup with an empty database, a few example projects are seeded
(`SEED_ON_STARTUP=true`).

## Test

Tests run against a **separate** database (`diagram_copilot_test`) with a fresh
schema per test:

```bash
createdb diagram_copilot_test        # once
.venv/bin/python -m pytest -q
```

Override the test DB with `DATABASE_URL` in the environment if needed.

## API

| Method | Path                               | Purpose                     |
| ------ | ---------------------------------- | --------------------------- |
| GET    | `/api/health`                      | Liveness + DB probe         |
| GET    | `/api/projects`                    | List (recent first)         |
| POST   | `/api/projects`                    | Create (+ empty diagram)    |
| GET    | `/api/projects/{id}`               | Get one                     |
| PATCH  | `/api/projects/{id}`               | Rename / edit (partial)     |
| DELETE | `/api/projects/{id}`               | Delete (cascades diagram)   |
| POST   | `/api/projects/{id}/duplicate`     | Duplicate project + scene   |
| GET    | `/api/projects/{id}/diagram`       | Load scene                  |
| PUT    | `/api/projects/{id}/diagram`       | Save scene (autosave)       |
