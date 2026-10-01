"""Pure ASGI middleware: a JSONL request log and a request-body cap.

Request log (for the L4 measurement, NFR-PERF-001 limb 2 - "no full-volume
transfer per slice gesture"): one JSON line per HTTP request in
``$CARDIAC_BACKEND_DATA/logs/requests.jsonl``::

    {"t": "...Z", "method": "GET", "route": "/api/v1/cases/{case_id}/slices/{slice_index}/mri",
     "case_id": "CASE_0061", "slice_index": 44, "view": "mri", "digest": "<sha256 hex>",
     "status": 200, "bytes": 1234, "ms": 3.1}
    {"t": "...Z", "method": "GET", "route": "/api/v1/artifacts/{name}", "digest": "<sha256 hex>",
     "kind": "mri", "case_id": "CASE_0061", "slice_index": 44, "status": 200, "bytes": 52011, "ms": 1.2}

``route`` is the path template; ``case_id`` / ``slice_index`` come from the path,
with run, review and reviewed-mask ids resolved to their case. A slice view
(``view`` = mri | gt | prediction | reviewed) records the ``digest`` its
content_url names; an artifact fetch records the digest it served and only the
kind / case / slice that every owner of that digest shares (``shared`` and
``owners`` when identical bytes belong to several slices). ``bytes`` counts the
response body actually sent. No client address, header or request body is
recorded; only allowlisted query keys are.
"""

from __future__ import annotations

import datetime as _dt
import json
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

# describe(scope, status, start of the JSON response body) -> fields of the log line
Describe = Callable[[dict, int, bytes], Dict[str, Any]]
CAPTURE_LIMIT = 16 * 1024  # slice-view answers are about 1 KB; PNG bodies are never captured


def _utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class RequestLogMiddleware:
    def __init__(self, app: Any, path: Path, describe: Describe):
        self.app = app
        self.path = Path(path)
        self.describe = describe
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        state = {"status": 0, "bytes": 0, "json": False}
        captured = bytearray()

        async def counting_send(message: dict) -> None:
            if message["type"] == "http.response.start":
                state["status"] = int(message["status"])
                state["json"] = any(name == b"content-type" and value.startswith(b"application/json")
                                    for name, value in message.get("headers", []))
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                state["bytes"] += len(body)
                if state["json"] and len(captured) < CAPTURE_LIMIT:
                    captured.extend(body[: CAPTURE_LIMIT - len(captured)])
            await send(message)

        try:
            await self.app(scope, receive, counting_send)
        finally:
            record: Dict[str, Any] = {"t": _utc(), "method": scope.get("method")}
            try:
                record.update(self.describe(scope, state["status"], bytes(captured)))
            except Exception:  # a log line never breaks a request
                record["route"] = None
            record.update({"status": state["status"], "bytes": state["bytes"],
                           "ms": round((time.perf_counter() - started) * 1000.0, 2)})
            line = json.dumps(record, separators=(",", ":")) + "\n"
            try:
                with self._lock, self.path.open("a", encoding="utf-8") as stream:
                    stream.write(line)
            except OSError:
                pass


class BodyLimitMiddleware:
    """Refuse a request body above ``limit`` bytes (declared or streamed) with the contract envelope."""

    def __init__(self, app: Any, limit: int, envelope: Callable[[], dict]):
        self.app = app
        self.limit = limit
        self.envelope = envelope

    async def _refuse(self, send: Callable) -> None:
        body = json.dumps(self.envelope()).encode("utf-8")
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        declared: Optional[int] = None
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = self.limit + 1
        if declared is not None and declared > self.limit:
            await self._refuse(send)
            return
        received = {"bytes": 0}

        async def limited_receive() -> dict:
            message = await receive()
            if message["type"] == "http.request":
                received["bytes"] += len(message.get("body", b""))
                if received["bytes"] > self.limit:
                    raise ValueError("request body above the limit")
            return message

        try:
            await self.app(scope, limited_receive, send)
        except ValueError as exc:
            if str(exc) != "request body above the limit":
                raise
            await self._refuse(send)
