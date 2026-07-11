"""Database engine, session factory, and the FastAPI session dependency."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

settings = get_settings()

# `pool_pre_ping` transparently recovers from dropped connections.
# SQLite (used in tests) needs `check_same_thread=False` for the TestClient.
connect_args: dict = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    connect_args=connect_args,
)

# `expire_on_commit=False` keeps ORM instances usable after commit so routes can
# serialize them without a redundant reload.
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Iterator[Session]:
    """Yield a request-scoped session, always closing it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
