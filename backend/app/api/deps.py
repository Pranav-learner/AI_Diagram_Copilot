"""FastAPI dependency providers.

These wire request-scoped sessions into services, keeping routes declarative and
services unaware of FastAPI.
"""

from fastapi import Depends
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..services import DiagramService, ProjectService


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(db)


def get_diagram_service(db: Session = Depends(get_db)) -> DiagramService:
    return DiagramService(db)
