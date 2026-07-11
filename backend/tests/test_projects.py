from fastapi.testclient import TestClient


def test_create_project_returns_camelcase_and_defaults(client: TestClient) -> None:
    resp = client.post("/api/projects", json={"name": "  My Diagram  "})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "My Diagram"  # trimmed
    assert body["description"] == ""
    assert body["thumbnailUrl"] is None
    assert "createdAt" in body and "updatedAt" in body
    assert body["id"]


def test_create_project_rejects_blank_name(client: TestClient) -> None:
    resp = client.post("/api/projects", json={"name": "   "})
    assert resp.status_code == 422
    assert resp.json()["code"] == "validation_error"


def test_list_projects_orders_by_recent(client: TestClient) -> None:
    client.post("/api/projects", json={"name": "First"})
    client.post("/api/projects", json={"name": "Second"})
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert names[0] == "Second"  # most recently created first


def test_get_project(client: TestClient, project: dict) -> None:
    resp = client.get(f"/api/projects/{project['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == project["id"]


def test_get_missing_project_404(client: TestClient) -> None:
    resp = client.get("/api/projects/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


def test_rename_project(client: TestClient, project: dict) -> None:
    resp = client.patch(
        f"/api/projects/{project['id']}", json={"name": "Renamed"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"
    # description untouched by partial update
    assert resp.json()["description"] == "A test"


def test_delete_project(client: TestClient, project: dict) -> None:
    resp = client.delete(f"/api/projects/{project['id']}")
    assert resp.status_code == 204
    assert client.get(f"/api/projects/{project['id']}").status_code == 404


def test_delete_missing_project_404(client: TestClient) -> None:
    resp = client.delete("/api/projects/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_duplicate_project_copies_scene(client: TestClient, project: dict) -> None:
    # Put a scene on the original, then duplicate.
    scene = {"schema": "excalidraw", "version": 1, "scene": {"elements": [1, 2]}}
    client.put(f"/api/projects/{project['id']}/diagram", json={"data": scene})

    resp = client.post(f"/api/projects/{project['id']}/duplicate")
    assert resp.status_code == 201
    copy = resp.json()
    assert copy["name"] == "Test Project (Copy)"
    assert copy["id"] != project["id"]

    copy_diagram = client.get(f"/api/projects/{copy['id']}/diagram").json()
    assert copy_diagram["data"] == scene
    # The copy is an independent row (fresh version counter).
    assert copy_diagram["version"] == 1
