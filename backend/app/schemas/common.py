"""Miscellaneous response schemas."""

from .base import CamelModel


class HealthResponse(CamelModel):
    status: str
    database: str
