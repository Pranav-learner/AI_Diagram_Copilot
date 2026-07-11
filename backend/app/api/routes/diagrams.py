"""Diagram load/save (autosave) endpoints.

`PUT` is the single save endpoint used by both explicit saves and autosave — one
idempotent write path avoids duplicated persistence logic.
"""

from uuid import UUID

from fastapi import APIRouter, Depends

from ...schemas.diagram import DiagramRead, DiagramSave
from ...services import DiagramService
from ..deps import get_diagram_service

router = APIRouter(prefix="/projects/{project_id}/diagram", tags=["diagrams"])


@router.get("", response_model=DiagramRead)
def get_diagram(
    project_id: UUID,
    service: DiagramService = Depends(get_diagram_service),
):
    return service.get_for_project(project_id)


@router.put("", response_model=DiagramRead)
def save_diagram(
    project_id: UUID,
    payload: DiagramSave,
    service: DiagramService = Depends(get_diagram_service),
):
    """Persist the scene (used by autosave). Returns the new version."""
    return service.save_for_project(project_id, payload)
