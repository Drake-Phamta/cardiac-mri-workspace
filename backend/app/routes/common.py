"""Helpers every router uses: the endpoint guard, the two response shapes and the request-body checks."""

from __future__ import annotations

import functools
import re
from typing import Any, Callable, Dict, List, Optional

from fastapi.responses import JSONResponse

from ..contract import ApiError, Contract

ARTIFACT_NAME = re.compile(r"([0-9a-f]{64})\.(png|cmesh|json)")


def error(contract: Contract, code: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(contract.error_body(code, details), status_code=contract.http_status(code))


def ok(payload: Dict[str, Any], status: int = 200, tag: Optional[str] = None) -> JSONResponse:
    headers = {"ETag": tag} if tag else None
    return JSONResponse(payload, status_code=status, headers=headers)


def endpoint(contract: Contract, endpoint_id: str) -> Callable:
    """Binds a route to one contract endpoint: it may answer only the error codes that endpoint lists.

    Any other code is a programming error (a 500 that the tests catch), never a silent drift.
    The route modules do not use `from __future__ import annotations`: FastAPI 0.115 reads a string annotation
    through this wrapper's globals (this module's), where `Request` is not defined.
    """
    allowed = set(contract.endpoint_errors(endpoint_id))

    def wrap(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def inner(*args: Any, **kwargs: Any) -> Any:
            try:
                return fn(*args, **kwargs)
            except ApiError as exc:
                if exc.code not in allowed:
                    raise RuntimeError(f"{endpoint_id} may not answer {exc.code}") from exc
                return error(contract, exc.code, exc.details)
        return inner
    return wrap


def body_object(payload: Any, allowed: List[str], required: List[str]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ApiError("VALIDATION_ERROR", {"reason": "the request body must be a JSON object"})
    unknown = sorted(set(payload) - set(allowed))
    missing = sorted(set(required) - set(payload))
    if unknown or missing:
        raise ApiError("VALIDATION_ERROR", {"unknown_fields": unknown, "missing_fields": missing})
    return payload


def revision_of(payload: Dict[str, Any]) -> int:
    value = payload.get("expected_revision")
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ApiError("VALIDATION_ERROR", {"field": "expected_revision", "reason": "a positive integer is required"})
    return value


def artifact_url(contract: Contract, digest: str) -> str:
    return f"{contract.base_path}/artifacts/{digest}.png"
