"""Diagram ORM model.

`data` is an opaque JSON document owned by the frontend canvas layer. The backend
never inspects its structure — today it holds an Excalidraw scene wrapped in a
small versioned envelope; in Phase 2 it will hold Diagram DSL. Because the column
is schema-less JSON(B), that migration needs no DDL change.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, Integer, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from .project import Project

# JSONB on Postgres (indexable, efficient); plain JSON elsewhere (e.g. SQLite).
JSONType = JSON().with_variant(JSONB, "postgresql")


class Diagram(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "diagrams"

    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    # Opaque document; defaults to an empty object for a fresh diagram.
    data: Mapped[dict[str, Any]] = mapped_column(
        JSONType, nullable=False, default=dict
    )
    # Monotonic save counter for optimistic concurrency.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    project: Mapped[Project] = relationship(back_populates="diagram")
