"""FastAPI application entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .core.config import get_settings
from .core.database import SessionLocal
from .core.exceptions import register_exception_handlers
from .seed import seed_if_empty

logger = logging.getLogger("app")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.seed_on_startup:
        db = SessionLocal()
        try:
            added = seed_if_empty(db)
            if added:
                logger.info("Seeded %d example projects", added)
        except Exception as exc:  # noqa: BLE001 - seeding must never block startup
            logger.warning("Skipped seeding: %s", exc)
        finally:
            db.close()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.3.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
