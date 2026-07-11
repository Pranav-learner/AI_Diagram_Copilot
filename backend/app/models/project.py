"""Project ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from .diagram import Diagram


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(
        String(2000), nullable=False, default=""
    )
    # Optional thumbnail URL. Null for now (thumbnail generation is out of scope);
    # the frontend renders a deterministic placeholder.
    thumbnail_url: Mapped[str | None] = mapped_column(
        String(1024), nullable=True, default=None
    )

    # One diagram per project (1:1). Deleting a project cascades to its diagram.
    diagram: Mapped[Diagram] = relationship(
        back_populates="project",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
