"""FastAPI service for API Contract 11: builds the app from the route modules in backend/app/routes/.

Run from the repository root (derived data under CARDIAC_BACKEND_DATA, outside any git work tree):

    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .middleware import BodyLimitMiddleware, RequestLogMiddleware, make_describe
from .routes import cases, experiments, findings, health, reviews, runs
from .routes.common import error
from .state import Backend


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    backend = Backend(settings)
    contract = backend.contract

    docs = {} if settings.enable_docs else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(title="Cardiac MRI workspace API", version=contract.version,
                  description="API Contract 11 - hero-flow backend", **docs)
    app.state.backend = backend
    if settings.cors_origins:  # the React Native app needs no CORS; a browser client must be allowlisted
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                           allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
                           allow_headers=["Content-Type", settings.reviewer_header], expose_headers=["ETag"])
    app.add_middleware(BodyLimitMiddleware, limit=settings.max_body_bytes, envelope=lambda: contract.error_body(
        "VALIDATION_ERROR", {"reason": f"request body above {settings.max_body_bytes} bytes"}))
    app.add_middleware(RequestLogMiddleware, path=settings.request_log, describe=make_describe(app, backend))

    @app.exception_handler(RequestValidationError)
    def _malformed_body(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error(contract, "VALIDATION_ERROR", {"reason": "the request body is not valid JSON"})

    @app.exception_handler(StarletteHTTPException)
    def _no_route(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return error(contract, "ARTIFACT_NOT_FOUND", {"reason": "no such route"})
        # 400 / 405 / ...: still the contract envelope, at the HTTP status that happened.
        body = contract.error_body("VALIDATION_ERROR", {"reason": str(exc.detail), "http_status": exc.status_code})
        return JSONResponse(body, status_code=exc.status_code)

    # Routes are added directly to the app, in this order: FastAPI matches the first route that fits, so
    # /experiments/compare must come before /experiments/{experiment_id}.
    for routes in (health, cases, experiments, runs, reviews, findings):
        routes.add_routes(app, backend)

    return app


_APP: Optional[FastAPI] = None


def __getattr__(name: str) -> Any:
    """``backend.app.main:app`` for uvicorn, built on first access only.

    Importing this module (tests, tools) therefore opens no database and reads
    no data cache; only the server process does.
    """
    global _APP
    if name == "app":
        if _APP is None:
            _APP = create_app()
        return _APP
    raise AttributeError(name)
