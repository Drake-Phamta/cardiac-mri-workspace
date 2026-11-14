"""FastAPI service for API Contract 11 v1.0.0.

Every route is bound to one contract endpoint id, and the error codes it may
answer are exactly that endpoint's ``errors`` list: answering any other code
is a programming error (a 500 that the tests catch), never a silent drift.

Run locally (from the repository root; derived data under CARDIAC_BACKEND_DATA,
outside any git work tree):

    python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

Deployed, uvicorn binds the overlay interface address passed to the deploy
script (0.0.0.0 only on explicit request).
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional
from urllib.parse import parse_qsl

from fastapi import Body, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.routing import Match

from . import __version__, imaging
from .cases import CaseRecord, CaseStore
from .config import Settings
from .contract import ApiError
from .experiments import SOURCE_KIND, ExperimentStore, Package
from ..mesh import artifact as mesh_module
from .meshes import MEDIA_TYPE as MESH_MEDIA_TYPE
from .metrics import C2_VARIANT, MetricsService
from .middleware import BodyLimitMiddleware, RequestLogMiddleware
from .routes import health
from .routes import cases as case_routes
from .routes import experiments as experiment_routes
from .routes import runs as run_routes
from .routes import reviews as review_routes
from .routes.common import ARTIFACT_NAME, artifact_url, body_object, endpoint, error, ok, revision_of
from .state import SLICE, Backend, parse_slice, require_ground_truth, require_succeeded
from .storage import Storage, etag, now

# Whole-string patterns only (fullmatch): `$` would also accept a trailing newline.
CHECKSUM = re.compile(r"sha256:([0-9a-f]{64})")
MAX_NOTE = 4000
# Request log: only these query keys are recorded (never the free-text case search `q`),
# and only values made of identifier characters.
LOGGED_QUERY_KEYS = frozenset({"mode", "limit", "page", "prediction_variant", "variant", "ids", "source_mask_id",
                               "case_id", "analysis_run_id", "experiment_id", "status", "finding_type"})
LOGGED_QUERY_VALUE = re.compile(r"[A-Za-z0-9_.,:-]{1,128}")


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    backend = Backend(settings)
    contract = backend.contract
    cases: CaseStore = backend.cases
    experiments: ExperimentStore = backend.experiments
    storage: Storage = backend.storage
    metrics: MetricsService = backend.metrics
    base = contract.base_path
    enums = contract.enums

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

    # The slice views a slice switch starts with (L4); each answers one content_url.
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

    app.add_middleware(RequestLogMiddleware, path=settings.request_log, describe=describe)

    # -- plumbing --------------------------------------------------------------
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

    def evidence(row: Any) -> Dict[str, Any]:
        return {
            "study_id": row["study_id"], "experiment_id": row["experiment_id"], "case_id": row["case_id"],
            "analysis_run_id": row["analysis_run_id"], "prediction_variant": row["prediction_variant"],
            "slice_index": row["slice_index"],
            "region_reference": None if row["region_reference"] is None else json.loads(row["region_reference"]),
        }

    health.add_routes(app, backend)

    case_routes.add_routes(app, backend)

    experiment_routes.add_routes(app, backend)

    run_routes.add_routes(app, backend)

    review_routes.add_routes(app, backend)

    # -- findings --------------------------------------------------------------
    finding_fields = ["study_id", "experiment_id", "case_id", "analysis_run_id", "prediction_variant",
                      "slice_index", "finding_type", "note", "region_reference"]

    @app.post(f"{base}/findings")
    @endpoint(contract, "finding_create")
    def finding_create(payload: Any = Body(None)) -> Any:
        body = body_object(payload, finding_fields, ["study_id", "finding_type", "note"])
        values = {field: body.get(field) for field in finding_fields}
        if values["study_id"] != settings.study_id:
            raise ApiError("ARTIFACT_NOT_FOUND", {"study_id": values["study_id"]})
        if values["finding_type"] not in enums["finding_type"]:
            raise ApiError("VALIDATION_ERROR", {"field": "finding_type", "allowed": enums["finding_type"]})
        if not isinstance(values["note"], str) or len(values["note"]) > MAX_NOTE:
            raise ApiError("VALIDATION_ERROR", {"field": "note", "reason": f"a string of at most {MAX_NOTE} characters"})
        for field in ("experiment_id", "case_id", "analysis_run_id"):
            if values[field] is not None and not isinstance(values[field], str):
                raise ApiError("VALIDATION_ERROR", {"field": field})
        region = values["region_reference"]
        if region is not None and (not isinstance(region, dict) or len(json.dumps(region)) > 4096):
            raise ApiError("VALIDATION_ERROR", {"field": "region_reference", "reason": "null or a JSON object"})
        case = backend.get_case(values["case_id"]) if values["case_id"] is not None else None
        variant = values["prediction_variant"]
        if values["analysis_run_id"] is None and variant is not None:
            raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant", "reason": "only with an analysis_run_id"})
        if values["analysis_run_id"] is not None:
            if variant not in enums["prediction_variant"]:
                raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant",
                                                    "reason": "required with an analysis_run_id",
                                                    "allowed": enums["prediction_variant"]})
            run = backend.get_run(values["analysis_run_id"])
            if run.mask_id(variant) is None:
                raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant",
                                                    "reason": f"the run has no {variant} prediction"})
            if case is None:
                case = backend.get_case(run.case_id)
                values["case_id"] = run.case_id
            elif run.case_id != case.case_id:
                raise ApiError("VALIDATION_ERROR", {"reason": "analysis_run_id belongs to another case"})
            if values["experiment_id"] is not None and values["experiment_id"] != run.experiment_id:
                raise ApiError("VALIDATION_ERROR", {"reason": "analysis_run_id belongs to another experiment"})
        if values["experiment_id"] is not None and values["experiment_id"] not in experiments.experiments:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": values["experiment_id"]})
        if values["slice_index"] is not None:
            if case is None or isinstance(values["slice_index"], bool) or not isinstance(values["slice_index"], int):
                raise ApiError("VALIDATION_ERROR", {"field": "slice_index", "reason": "an integer, with a case"})
            parse_slice(case, str(values["slice_index"]) if values["slice_index"] >= 0 else "x")
        row = storage.create_finding(values)
        return ok({
            "finding_id": row["finding_id"], "case_id": row["case_id"], "analysis_run_id": row["analysis_run_id"],
            "slice_index": row["slice_index"], "finding_type": row["finding_type"], "status": row["status"],
            "evidence": evidence(row), "revision": row["revision"],
        }, status=201, tag=etag(row["finding_id"], row["revision"]))

    @app.get(f"{base}/findings")
    @endpoint(contract, "findings_list")
    def findings_list(case_id: Optional[str] = Query(None), analysis_run_id: Optional[str] = Query(None),
                      experiment_id: Optional[str] = Query(None), status: Optional[str] = Query(None),
                      finding_type: Optional[str] = Query(None)) -> Any:
        if status is not None and status not in enums["finding_status"]:
            raise ApiError("VALIDATION_ERROR", {"field": "status", "allowed": enums["finding_status"]})
        if finding_type is not None and finding_type not in enums["finding_type"]:
            raise ApiError("VALIDATION_ERROR", {"field": "finding_type", "allowed": enums["finding_type"]})
        rows = storage.findings({"case_id": case_id, "analysis_run_id": analysis_run_id,
                                 "experiment_id": experiment_id, "status": status, "finding_type": finding_type})
        return ok({"items": [{
            "finding_id": row["finding_id"], "status": row["status"], "evidence": evidence(row),
            "finding_type": row["finding_type"], "note": row["note"], "revision": row["revision"],
        } for row in rows]})

    @app.patch(f"{base}/findings/{{finding_id}}")
    @endpoint(contract, "finding_patch")
    def finding_patch(finding_id: str, payload: Any = Body(None)) -> Any:
        body = body_object(payload, ["note", "status", "expected_revision"], ["expected_revision"])
        if "note" not in body and "status" not in body:
            raise ApiError("VALIDATION_ERROR", {"reason": "nothing to change: send note and/or status"})
        if "status" in body and body["status"] not in enums["finding_status"]:
            raise ApiError("VALIDATION_ERROR", {"field": "status", "allowed": enums["finding_status"]})
        if "note" in body and (not isinstance(body["note"], str) or len(body["note"]) > MAX_NOTE):
            raise ApiError("VALIDATION_ERROR", {"field": "note"})
        row = storage.patch_finding(finding_id, revision_of(body), body.get("note"), body.get("status"))
        tag = etag(row["finding_id"], row["revision"])
        return ok({"finding_id": row["finding_id"], "status": row["status"], "note": row["note"],
                   "evidence": evidence(row), "revision": row["revision"], "etag": tag}, tag=tag)

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
