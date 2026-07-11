"""Diagram request/response schemas.

`data` is an opaque JSON object. We validate only that it is an object and defer
size checking to the service (which owns the configured limit).
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from .base import CamelModel


class DiagramRead(CamelModel):
    id: UUID
    project_id: UUID
    data: dict[str, Any]
    version: int
    created_at: datetime
    updated_at: datetime


class DiagramSave(CamelModel):
    data: dict[str, Any] = Field(
        description="Opaque diagram document (Excalidraw scene envelope)."
    )
    # Optional optimistic-concurrency guard: the version the client last read.
    base_version: int | None = Field(default=None, ge=1)
