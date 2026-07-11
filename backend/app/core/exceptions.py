"""Domain-level exceptions and the FastAPI handlers that render them.

Services raise these framework-agnostic errors; the API layer translates them
to HTTP responses. This keeps the service/repository layers free of HTTP
concerns (clean architecture).
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base class for expected, mappable application errors."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationAppError(AppError):
    status_code = 422
    code = "validation_error"


def _error_body(detail: str, code: str) -> dict:
    return {"detail": detail, "code": code}


def register_exception_handlers(app: FastAPI) -> None:
    """Attach consistent JSON error responses to the app."""

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(exc.detail, exc.code),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # `exc.errors()` may embed a raw exception in `ctx`, which is not JSON
        # serializable — keep only the serializable fields.
        errors = [
            {
                "type": err.get("type"),
                "loc": err.get("loc"),
                "msg": err.get("msg"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Request validation failed",
                "code": "validation_error",
                "errors": errors,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(str(exc.detail), "http_error"),
        )
