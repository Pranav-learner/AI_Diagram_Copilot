"""Tests for the secure Gemini AI proxy router."""

from fastapi.testclient import TestClient


def test_gemini_proxy_unauthenticated_without_key(client: TestClient, monkeypatch) -> None:
    # Clear key
    monkeypatch.setenv("GEMINI_API_KEY", "")
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "gemini_api_key", "")
    resp = client.post(
        "/api/ai/gemini/v1beta/models/gemini-1.5-pro:generateContent",
        json={"contents": [{"parts": [{"text": "hello"}]}]},
    )
    assert resp.status_code == 401
    data = resp.json()
    assert "GEMINI_API_KEY is not configured" in str(data)
