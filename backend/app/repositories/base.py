"""Generic repository base.

Repositories encapsulate persistence for one aggregate. They expose intention-
revealing methods and never contain business rules (that is the service layer's
job). They also do not commit — transaction boundaries are owned by services.
"""

from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    #: Concrete subclasses set the mapped model.
    model: type[ModelT]

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, entity_id: UUID) -> ModelT | None:
        return self.db.get(self.model, entity_id)

    def add(self, entity: ModelT) -> ModelT:
        self.db.add(entity)
        self.db.flush()
        return entity

    def delete(self, entity: ModelT) -> None:
        self.db.delete(entity)
