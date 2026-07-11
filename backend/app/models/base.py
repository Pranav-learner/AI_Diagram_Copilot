"""Declarative base and shared column mixins.

Types are chosen to be portable across PostgreSQL (production) and SQLite
(tests): `Uuid` and `JSON().with_variant(JSONB, ...)` map to native Postgres
types and to portable equivalents elsewhere — so migration between dialects, and
the eventual Diagram-DSL schema change, stay low-friction.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base for all ORM models; carries the shared metadata for Alembic."""


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
