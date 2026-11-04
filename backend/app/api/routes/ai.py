"""Secure Gemini AI proxy endpoint.

Protects the GEMINI_API_KEY on the backend server so it is never exposed
to the browser client or repository code.
"""

import os
import urllib.parse
from typing import Any
import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from ...core.config import get_settings

router = APIRouter(prefix="/ai", tags=["ai"])
GOOGLE_API_BASE = "https://generativelanguage.googleapis.com"


def get_effective_gemini_key() -> str:
    if "GEMINI_API_KEY" in os.environ:
        return os.environ["GEMINI_API_KEY"].strip()
    settings = get_settings()
    return (settings.gemini_api_key or "").strip()


@router.api_route("/gemini/{path:path}", methods=["GET", "POST"])
async def proxy_gemini(path: str, request: Request) -> Response:
    """Proxies Gemini API calls from the local client to Google Generative Language API."""
    key = get_effective_gemini_key()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": 401,
                    "message": (
                        "GEMINI_API_KEY is not configured on the backend server. "
                        "Please set GEMINI_API_KEY in your backend/.env or system environment."
                    ),
                    "status": "UNAUTHENTICATED",
                }
            },
        )

    # Reconstruct query params and attach key securely
    params = dict(request.query_params)
    params["key"] = key

    # Unquote path to handle encoded colons like %3A in :generateContent
    clean_path = urllib.parse.unquote(path)
    target_url = f"{GOOGLE_API_BASE}/{clean_path}"
    body = await request.body()
    headers = {"content-type": request.headers.get("content-type", "application/json")}

    client = httpx.AsyncClient(timeout=120.0)

    try:
        # Check if caller requested streaming
        is_streaming = "streamGenerateContent" in path or params.get("alt") == "sse"

        if is_streaming:
            req = client.build_request(
                method="POST",
                url=target_url,
                params=params,
                content=body,
                headers=headers,
            )
            upstream_resp = await client.send(req, stream=True)

            async def sse_generator():
                try:
                    async for chunk in upstream_resp.aiter_raw():
                        yield chunk
                finally:
                    await upstream_resp.aclose()
                    await client.aclose()

            return StreamingResponse(
                sse_generator(),
                status_code=upstream_resp.status_code,
                media_type="text/event-stream",
                headers={"cache-control": "no-cache", "connection": "keep-alive"},
            )

        # Standard non-streaming request
        resp = await client.request(
            method=request.method,
            url=target_url,
            params=params,
            content=body,
            headers=headers,
        )
        await client.aclose()
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/json"),
        )
    except httpx.RequestError as exc:
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate with Google Gemini API: {exc}",
        ) from exc
