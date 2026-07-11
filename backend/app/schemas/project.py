"""Project request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator

from .base import CamelModel


def _clean_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("name must not be blank")
    return cleaned


class ProjectCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _clean_name(value)


class ProjectUpdate(CamelModel):
    """Partial update; only provided fields are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)


class ProjectRead(CamelModel):
    id: UUID
    name: str
    description: str
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime
