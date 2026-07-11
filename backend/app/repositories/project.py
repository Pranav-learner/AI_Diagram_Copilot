"""Project persistence."""

from sqlalchemy import func, select

from ..models import Project
from .base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project

    def list_recent(self) -> list[Project]:
        """All projects, most-recently-updated first."""
        stmt = select(Project).order_by(Project.updated_at.desc())
        return list(self.db.scalars(stmt))

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(Project)) or 0
