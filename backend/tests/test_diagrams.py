from fastapi.testclient import TestClient


def test_new_project_has_empty_diagram(client: TestClient, project: dict) -> None:
    resp = client.get(f"/api/projects/{project['id']}/diagram")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == {}
    assert body["version"] == 1
    assert body["projectId"] == project["id"]


def test_save_diagram_increments_version(client: TestClient, project: dict) -> None:
    url = f"/api/projects/{project['id']}/diagram"
    scene = {"schema": "excalidraw", "version": 1, "scene": {"elements": []}}

    first = client.put(url, json={"data": scene})
    assert first.status_code == 200
    assert first.json()["version"] == 2  # started at 1, first save -> 2

    second = client.put(url, json={"data": scene})
    assert second.json()["version"] == 3


def test_save_persists_and_reloads(client: TestClient, project: dict) -> None:
    url = f"/api/projects/{project['id']}/diagram"
    scene = {"schema": "excalidraw", "version": 1, "scene": {"elements": ["a"]}}
    client.put(url, json={"data": scene})

    reloaded = client.get(url).json()
    assert reloaded["data"] == scene


def test_save_bumps_project_updated_at(client: TestClient) -> None:
    a = client.post("/api/projects", json={"name": "A"}).json()
    b = client.post("/api/projects", json={"name": "B"}).json()

    # Saving A's diagram should push A to the top of the recent list.
    client.put(
        f"/api/projects/{a['id']}/diagram",
        json={"data": {"scene": {"elements": []}}},
    )
    order = [p["id"] for p in client.get("/api/projects").json()]
    assert order[0] == a["id"]
    assert b["id"] in order


def test_optimistic_concurrency_conflict(client: TestClient, project: dict) -> None:
    url = f"/api/projects/{project['id']}/diagram"
    # Current version is 1. Saving with a stale baseVersion must 409.
    resp = client.put(
        url, json={"data": {"scene": {}}, "baseVersion": 99}
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "conflict"

    # Correct baseVersion succeeds.
    ok = client.put(url, json={"data": {"scene": {}}, "baseVersion": 1})
    assert ok.status_code == 200
    assert ok.json()["version"] == 2


def test_diagram_for_missing_project_404(client: TestClient) -> None:
    resp = client.get(
        "/api/projects/00000000-0000-0000-0000-000000000000/diagram"
    )
    assert resp.status_code == 404


def test_invalid_data_type_rejected(client: TestClient, project: dict) -> None:
    resp = client.put(
        f"/api/projects/{project['id']}/diagram",
        json={"data": "not-an-object"},
    )
    assert resp.status_code == 422
