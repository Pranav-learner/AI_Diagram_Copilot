"""Liveness/readiness endpoint including a DB connectivity probe."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    try:
        db.execute(text("SELECT 1"))
        database = "up"
    except Exception:  # noqa: BLE001 - report any DB failure as "down"
        database = "down"
    return HealthResponse(
        status="ok" if database == "up" else "degraded",
        database=database,
    )
