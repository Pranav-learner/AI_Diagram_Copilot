"""Idempotent example-data seeding for a fresh database (dev convenience)."""

from sqlalchemy.orm import Session

from .models import Diagram, Project
from .repositories import ProjectRepository

_EXAMPLES: list[tuple[str, str]] = [
    (
        "Microservices Architecture",
        "High-level service topology for the payments platform.",
    ),
    (
        "Onboarding User Flow",
        "End-to-end signup and activation flow with branching states.",
    ),
    (
        "Database ERD — Billing",
        "Entity relationship diagram for invoices and subscriptions.",
    ),
]


def seed_if_empty(db: Session) -> int:
    """Insert example projects only when there are none. Returns count added."""
    if ProjectRepository(db).count() > 0:
        return 0
    for name, description in _EXAMPLES:
        project = Project(name=name, description=description)
        project.diagram = Diagram(data={})
        db.add(project)
    db.commit()
    return len(_EXAMPLES)
