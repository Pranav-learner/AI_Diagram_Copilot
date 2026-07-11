"""Diagram persistence."""

from uuid import UUID

from sqlalchemy import select

from ..models import Diagram
from .base import BaseRepository


class DiagramRepository(BaseRepository[Diagram]):
    model = Diagram

    def get_by_project(self, project_id: UUID) -> Diagram | None:
        stmt = select(Diagram).where(Diagram.project_id == project_id)
        return self.db.scalar(stmt)
