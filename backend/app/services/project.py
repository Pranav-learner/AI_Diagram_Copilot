"""Project business logic.

Services orchestrate repositories, enforce rules, and own the transaction. They
raise domain errors (never HTTP) so they remain framework-agnostic and testable.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from ..core.exceptions import NotFoundError
from ..models import Diagram, Project
from ..repositories import DiagramRepository, ProjectRepository
from ..schemas.project import ProjectCreate, ProjectUpdate

# A fresh diagram starts as an empty opaque document; the frontend fills in the
# scene envelope on first save. The backend intentionally does not model it.
EMPTY_DOCUMENT: dict = {}


class ProjectService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.projects = ProjectRepository(db)
        self.diagrams = DiagramRepository(db)

    def list_projects(self) -> list[Project]:
        return self.projects.list_recent()

    def get_project(self, project_id: UUID) -> Project:
        project = self.projects.get(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found")
        return project

    def create_project(self, payload: ProjectCreate) -> Project:
        project = Project(name=payload.name, description=payload.description)
        # Every project owns exactly one diagram; create it up front so the
        # editor always has something to load.
        project.diagram = Diagram(data=dict(EMPTY_DOCUMENT))
        self.projects.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def update_project(self, project_id: UUID, payload: ProjectUpdate) -> Project:
        project = self.get_project(project_id)
        data = payload.model_dump(exclude_unset=True)
        if "name" in data and data["name"] is not None:
            project.name = data["name"]
        if "description" in data and data["description"] is not None:
            project.description = data["description"]
        self.db.commit()
        self.db.refresh(project)
        return project

    def delete_project(self, project_id: UUID) -> None:
        project = self.get_project(project_id)
        self.projects.delete(project)  # cascades to the diagram
        self.db.commit()

    def duplicate_project(self, project_id: UUID) -> Project:
        source = self.get_project(project_id)
        source_diagram = self.diagrams.get_by_project(source.id)

        copy = Project(
            name=f"{source.name} (Copy)",
            description=source.description,
            thumbnail_url=source.thumbnail_url,
        )
        copy.diagram = Diagram(
            data=dict(source_diagram.data) if source_diagram else dict(EMPTY_DOCUMENT)
        )
        self.projects.add(copy)
        self.db.commit()
        self.db.refresh(copy)
        return copy
