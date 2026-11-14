"""Plain ASGI middleware: a JSONL request log and a request-body size limit.

The request log shows that a slice change never transfers a whole volume. It writes one JSON line per
HTTP request to ``$CARDIAC_BACKEND_DATA/logs/requests.jsonl``::

    {"t": "...Z", "method": "GET", "route": "/api/v1/cases/{case_id}/slices/{slice_index}/mri",
     "case_id": "CASE_0061", "slice_index": 44, "view": "mri", "digest": "<sha256 hex>",
     "status": 200, "bytes": 1234, "ms": 3.1}
    {"t": "...Z", "method": "GET", "route": "/api/v1/artifacts/{name}", "digest": "<sha256 hex>",
     "kind": "mri", "case_id": "CASE_0061", "slice_index": 44, "status": 200, "bytes": 52011, "ms": 1.2}

``route`` is the path template and ``bytes`` the response body actually sent. For privacy, no client
address, header or request body is recorded, and only allowlisted query keys are.
"""

from __future__ import annotations

import datetime as _dt
import json
import re
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from urllib.parse import parse_qsl

from starlette.routing import Match

from .routes.common import ARTIFACT_NAME
from .state import SLICE, Backend

# describe(scope, status, start of the JSON response body) -> fields of the log line
Describe = Callable[[dict, int, bytes], Dict[str, Any]]
CAPTURE_LIMIT = 16 * 1024  # slice-view answers are about 1 KB; PNG bodies are never captured
CHECKSUM = re.compile(r"sha256:([0-9a-f]{64})")
# Request log: only these query keys are recorded (never the free-text case search `q`),
# and only values made of identifier characters.
LOGGED_QUERY_KEYS = frozenset({"mode", "limit", "page", "prediction_variant", "variant", "ids", "source_mask_id",
                               "case_id", "analysis_run_id", "experiment_id", "status", "finding_type"})
LOGGED_QUERY_VALUE = re.compile(r"[A-Za-z0-9_.,:-]{1,128}")


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


def make_describe(app: Any, backend: Backend) -> Describe:
    """The describe() of the request log for this app: matches the request to its route template."""
    base = backend.contract.base_path
    cases, experiments, storage = backend.cases, backend.experiments, backend.storage

    # The slice views a slice change starts with; each answers one content_url.
    slice_views = {
        f"{base}/cases/{{case_id}}/slices/{{slice_index}}/mri": "mri",
        f"{base}/cases/{{case_id}}/slices/{{slice_index}}/ground-truth": "gt",
        f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/prediction": "prediction",
        f"{base}/reviewed-masks/{{reviewed_mask_id}}/slices/{{slice_index}}": "reviewed",
    }

    def describe(scope: dict, status: int, body: bytes) -> Dict[str, Any]:
        """Request-log fields: route template, the case and slice (run, review and reviewed-mask ids
        resolved to their case), the artifact digest a slice view announced or an artifact fetch
        served, and allowlisted query values. Never the client address, a header or a request body."""
        info: Dict[str, Any] = {"route": None}
        params: Dict[str, Any] = {}
        for route in app.router.routes:
            matched, child = route.matches(scope)
            if matched == Match.FULL:
                info["route"] = getattr(route, "path", None)
                params = child.get("path_params", {})
                break
        for key in ("case_id", "run_id", "review_id", "reviewed_mask_id", "experiment_id"):
            if key in params:
                info[key] = params[key]
        if "slice_index" in params:
            raw = str(params["slice_index"])
            info["slice_index"] = int(raw) if SLICE.fullmatch(raw) else raw
        if "case_id" not in info:
            info.update(owner_case(info))
        if info["route"] == f"{base}/artifacts/{{name}}":
            info.update(describe_artifact(str(params.get("name", ""))))
        elif info["route"] in slice_views:
            info["view"] = slice_views[info["route"]]
            if status == 200:
                info["digest"] = announced_digest(body)
        query = logged_query(scope.get("query_string", b""))
        if query:
            info["query"] = query
        return info

    def owner_case(info: Dict[str, Any]) -> Dict[str, Any]:
        if "run_id" in info:
            run = experiments.run(str(info["run_id"]))
            return {"case_id": run.case_id} if run is not None else {}
        if "reviewed_mask_id" in info:
            row = storage.reviewed_mask(str(info["reviewed_mask_id"]))
            return {"case_id": row["case_id"]} if row is not None else {}
        if "review_id" in info:
            row = storage.get_review(str(info["review_id"]))
            return {"case_id": row["case_id"]} if row is not None else {}
        return {}

    def announced_digest(body: bytes) -> Optional[str]:
        try:
            match = CHECKSUM.fullmatch(str(json.loads(body.decode("utf-8")).get("checksum", "")))
        except (ValueError, AttributeError):
            return None
        return match.group(1) if match else None

    def logged_query(raw: bytes) -> Dict[str, str]:
        kept: Dict[str, str] = {}
        for key, value in parse_qsl(raw.decode("latin-1"), keep_blank_values=True):
            if key in LOGGED_QUERY_KEYS:
                kept[key] = value if LOGGED_QUERY_VALUE.fullmatch(value) else "<not logged>"
        return kept

    def describe_artifact(name: str) -> Dict[str, Any]:
        """Kind, case and slice of an artifact fetch - only what every owner of the digest agrees on.

        Bytes are content-addressed, so identical slices (an empty mask above all) share one digest
        across slices, cases and kinds; such a fetch is marked shared, never attributed to a guess."""
        match = ARTIFACT_NAME.fullmatch(name)
        if not match:
            return {}
        digest = match.group(1)
        if match.group(2) == "cmesh":  # a derived L0 mesh: content-addressed, owned by one mask
            return {"digest": digest, "kind": "mesh"}
        if match.group(2) == "json":  # derived error geometry: owned by one prediction / ground-truth pair
            return {"digest": digest, "kind": "error_geometry"}
        owners = [(kind, case_id, z, None) for case_id, kind, z in cases.digest_owners.get(digest, [])]
        for artifact_id, z in list(experiments.render_owners.get(digest, [])):
            owners.append(("prediction", (experiments.artifact(artifact_id) or {}).get("case_id"), z, artifact_id))
        owners.extend(("reviewed", case_id, z, mask_id) for mask_id, case_id, z in storage.blob_owners(digest))
        info: Dict[str, Any] = {"digest": digest, "kind": None}
        if not owners:
            return info
        for position, field in enumerate(("kind", "case_id", "slice_index")):
            values = {owner[position] for owner in owners}
            if len(values) == 1:
                info[field] = values.pop()
        sources = {owner[3] for owner in owners}
        if len(sources) == 1 and info["kind"] in ("prediction", "reviewed"):
            info["artifact_id" if info["kind"] == "prediction" else "reviewed_mask_id"] = sources.pop()
        distinct = {owner[:3] for owner in owners}
        if len(distinct) > 1:
            info["shared"] = True
            info["owners"] = len(distinct)
        return info

    return describe
