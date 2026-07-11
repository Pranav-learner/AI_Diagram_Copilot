"""Diagram business logic: load and save the scene document.

The service treats the diagram payload as opaque JSON — it enforces size limits
and version/concurrency rules, but never interprets Excalidraw structure.
"""

import json
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.exceptions import ConflictError, NotFoundError, ValidationAppError
from ..models import Diagram
from ..repositories import DiagramRepository, ProjectRepository
from ..schemas.diagram import DiagramSave

settings = get_settings()


class DiagramService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.diagrams = DiagramRepository(db)
        self.projects = ProjectRepository(db)

    def _require_diagram(self, project_id: UUID) -> Diagram:
        if self.projects.get(project_id) is None:
            raise NotFoundError(f"Project {project_id} not found")
        diagram = self.diagrams.get_by_project(project_id)
        if diagram is None:
            # Data-integrity fallback: a project should always have a diagram.
            diagram = self.diagrams.add(Diagram(project_id=project_id, data={}))
            self.db.commit()
            self.db.refresh(diagram)
        return diagram

    def get_for_project(self, project_id: UUID) -> Diagram:
        return self._require_diagram(project_id)

    def save_for_project(self, project_id: UUID, payload: DiagramSave) -> Diagram:
        diagram = self._require_diagram(project_id)

        self._validate_size(payload.data)

        if payload.base_version is not None and payload.base_version != diagram.version:
            raise ConflictError(
                "Diagram was modified elsewhere; reload before saving "
                f"(expected version {diagram.version}, got {payload.base_version})"
            )

        diagram.data = payload.data
        diagram.version += 1
        # Bump the parent project's updated_at so the dashboard reflects activity.
        diagram.project.updated_at = func.now()

        self.db.commit()
        self.db.refresh(diagram)
        return diagram

    @staticmethod
    def _validate_size(data: dict) -> None:
        size = len(json.dumps(data).encode("utf-8"))
        if size > settings.max_scene_bytes:
            raise ValidationAppError(
                f"Diagram is too large ({size} bytes; "
                f"limit {settings.max_scene_bytes})"
            )
