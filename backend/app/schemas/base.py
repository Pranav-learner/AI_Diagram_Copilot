"""Shared Pydantic base with camelCase JSON aliases."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Serializes to camelCase and reads from ORM attributes.

    `populate_by_name` lets clients send either snake_case or camelCase; FastAPI
    serializes responses using the camelCase aliases (its default is
    `response_model_by_alias=True`).
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
