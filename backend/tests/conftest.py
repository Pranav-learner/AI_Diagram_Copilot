"""Pytest fixtures.

Point the app at an isolated test database (created empty per test) BEFORE the
app modules are imported, so the app's own engine/session bind to it. Each test
gets a fresh schema for full isolation.
"""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres@localhost:5433/diagram_copilot_test",
)
os.environ["SEED_ON_STARTUP"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def project(client: TestClient) -> dict:
    """A freshly created project (with its auto-created empty diagram)."""
    resp = client.post(
        "/api/projects",
        json={"name": "Test Project", "description": "A test"},
    )
    assert resp.status_code == 201
    return resp.json()
