"""Project CRUD + duplicate/rename endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, status

from ...schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from ...services import ProjectService
from ..deps import get_project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(
    service: ProjectService = Depends(get_project_service),
) -> list:
    return service.list_projects()


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    service: ProjectService = Depends(get_project_service),
):
    return service.create_project(payload)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: UUID,
    service: ProjectService = Depends(get_project_service),
):
    return service.get_project(project_id)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
):
    """Rename / edit description (partial update)."""
    return service.update_project(project_id, payload)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    service: ProjectService = Depends(get_project_service),
) -> None:
    service.delete_project(project_id)


@router.post(
    "/{project_id}/duplicate",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_project(
    project_id: UUID,
    service: ProjectService = Depends(get_project_service),
):
    return service.duplicate_project(project_id)
