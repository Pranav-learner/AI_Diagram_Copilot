"""Aggregate API router mounted under /api."""

from fastapi import APIRouter

from .routes import diagrams, health, projects

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(projects.router)
api_router.include_router(diagrams.router)
