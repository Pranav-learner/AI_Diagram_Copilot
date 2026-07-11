"""Application settings, loaded from environment / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI Diagram Copilot API"
    environment: str = "development"

    # SQLAlchemy URL. Defaults to the local dev Postgres cluster; override in .env.
    database_url: str = (
        "postgresql+psycopg://postgres@localhost:5432/diagram_copilot"
    )

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:4173",
    ]

    # Seed example projects when the DB is empty (developer convenience).
    seed_on_startup: bool = True

    # Reject diagram payloads larger than this (protects the DB from abuse).
    max_scene_bytes: int = 5 * 1024 * 1024  # 5 MB

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
