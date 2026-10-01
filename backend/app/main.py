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

import functools
import json
import re
from typing import Any, Callable, Dict, List, Optional
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
from .contract import ApiError, Contract
from .experiments import SOURCE_KIND, ExperimentStore, Package, RunRecord
from .metrics import MetricsService
from .middleware import BodyLimitMiddleware, RequestLogMiddleware
from .storage import Storage, etag, now

# Whole-string patterns only (fullmatch): `$` would also accept a trailing newline.
SLICE = re.compile(r"[0-9]{1,6}")
REVIEWER = re.compile(r"[A-Za-z0-9_.@-]{1,64}")
ARTIFACT_NAME = re.compile(r"([0-9a-f]{64})\.png")
CHECKSUM = re.compile(r"sha256:([0-9a-f]{64})")
C2_VARIANT = {"RAW_PREDICTION": "RAW", "PROCESSED_PREDICTION": "PROCESSED"}
MAX_NOTE = 4000
# Request log: only these query keys are recorded (never the free-text case search `q`),
# and only values made of identifier characters.
LOGGED_QUERY_KEYS = frozenset({"mode", "limit", "page", "prediction_variant", "variant", "ids", "source_mask_id",
                               "case_id", "analysis_run_id", "experiment_id", "status", "finding_type"})
LOGGED_QUERY_VALUE = re.compile(r"[A-Za-z0-9_.,:-]{1,128}")


class Backend:
    """Everything a request needs, built once per process."""

    def __init__(self, settings: Settings):
        settings.refuse_data_inside_git()
        self.settings = settings
        self.contract = Contract.load(settings.contract_path)
        self.cases = CaseStore(settings.data_cache)
        self.experiments = ExperimentStore(settings.experiments_root, self.cases, settings.render_cache)
        self.metrics = MetricsService(self.experiments, self.cases)
        self.storage = Storage(settings.db_path, self.contract.transitions(),
                               self.contract.review_rules["create_allowed_states"])


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
    def error(code: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
        return JSONResponse(contract.error_body(code, details), status_code=contract.http_status(code))

    def endpoint(endpoint_id: str) -> Callable:
        allowed = set(contract.endpoint_errors(endpoint_id))

        def wrap(fn: Callable) -> Callable:
            @functools.wraps(fn)
            def inner(*args: Any, **kwargs: Any) -> Any:
                try:
                    return fn(*args, **kwargs)
                except ApiError as exc:
                    if exc.code not in allowed:
                        raise RuntimeError(f"{endpoint_id} may not answer {exc.code}") from exc
                    return error(exc.code, exc.details)
            return inner
        return wrap

    @app.exception_handler(RequestValidationError)
    def _malformed_body(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error("VALIDATION_ERROR", {"reason": "the request body is not valid JSON"})

    @app.exception_handler(StarletteHTTPException)
    def _no_route(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return error("ARTIFACT_NOT_FOUND", {"reason": "no such route"})
        # 400 / 405 / ...: still the contract envelope, at the HTTP status that happened.
        body = contract.error_body("VALIDATION_ERROR", {"reason": str(exc.detail), "http_status": exc.status_code})
        return JSONResponse(body, status_code=exc.status_code)

    def ok(payload: Dict[str, Any], status: int = 200, tag: Optional[str] = None) -> JSONResponse:
        headers = {"ETag": tag} if tag else None
        return JSONResponse(payload, status_code=status, headers=headers)

    def get_case(case_id: str) -> CaseRecord:
        case = cases.get(case_id)
        if case is None:
            raise ApiError("CASE_NOT_FOUND", {"case_id": case_id})
        return case

    def parse_slice(case: CaseRecord, raw: str) -> int:
        if not SLICE.fullmatch(raw or "") or int(raw) >= case.nz:
            raise ApiError("SLICE_OUT_OF_RANGE", {"slice_index": raw, "valid": [0, case.nz - 1]})
        return int(raw)

    def get_run(run_id: str) -> RunRecord:
        run = experiments.run(run_id)
        if run is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"run_id": run_id})
        return run

    def run_case(run: RunRecord) -> CaseRecord:
        case = cases.get(run.case_id)
        if case is None:  # experiments only serve runs of ingested cases
            raise ApiError("ARTIFACT_NOT_FOUND", {"run_id": run.run_id})
        return case

    def require_ground_truth(case: CaseRecord) -> None:
        if not case.ground_truth_available:
            raise ApiError("GROUND_TRUTH_UNAVAILABLE", {"case_id": case.case_id, "mode": case.mode})

    def variant_or_not_found(raw: Optional[str]) -> str:
        if raw not in enums["prediction_variant"]:
            raise ApiError("ARTIFACT_NOT_FOUND", {"prediction_variant": raw, "allowed": enums["prediction_variant"]})
        return str(raw)

    def require_succeeded(run: RunRecord, failed_code: str = "RUN_NOT_SUCCEEDED") -> None:
        if run.status == "FAILED":
            raise ApiError(failed_code, {"run_id": run.run_id, "status": run.status, "failure_reason": run.failure_reason})
        if run.status != "SUCCEEDED":
            raise ApiError("RUN_NOT_SUCCEEDED", {"run_id": run.run_id, "status": run.status})

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

    def reviewer_of(request: Request) -> Optional[str]:
        value = request.headers.get(settings.reviewer_header)
        return value if value and REVIEWER.fullmatch(value) else None

    def url(digest: str) -> str:
        return f"{base}/artifacts/{digest}.png"

    def provenance(row: Any) -> Dict[str, Any]:
        return {
            "review_id": row["review_id"], "case_id": row["case_id"], "run_id": row["run_id"],
            "source_mask_id": row["source_mask_id"], "source_mask_kind": row["source_mask_kind"],
            "prediction_variant": row["prediction_variant"], "version": row["version"],
            "parent_reviewed_mask_id": row["parent_reviewed_mask_id"], "created_at": row["created_at"],
            "reviewer_id": row["reviewer_id"],
        }

    def evidence(row: Any) -> Dict[str, Any]:
        return {
            "study_id": row["study_id"], "experiment_id": row["experiment_id"], "case_id": row["case_id"],
            "analysis_run_id": row["analysis_run_id"], "prediction_variant": row["prediction_variant"],
            "slice_index": row["slice_index"],
            "region_reference": None if row["region_reference"] is None else json.loads(row["region_reference"]),
        }

    def experiment_variant(package: Package) -> str:
        return C2_VARIANT.get(package.experiment["prediction_variant"], package.experiment["prediction_variant"])

    # -- service ---------------------------------------------------------------
    @app.get("/health")
    def health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "cardiac-mri-backend",
            "version": __version__,
            "contract_version": contract.version,
            "geometry_contract_version": contract.geometry_version,
            "study_id": settings.study_id,
            "data_ready": bool(cases.cases),
            "cases": cases.counts(),
            "experiments": len(experiments.experiments),
            "runs": len(experiments.runs),
            "rejected_experiment_packages": [item["code"] for item in experiments.rejected],
            "storage": storage.counts(),
            "time": now(),
        }

    @app.get(f"{base}/artifacts/{{name}}")
    def artifact(name: str) -> Response:
        match = ARTIFACT_NAME.fullmatch(name)
        if not match:
            return error("ARTIFACT_NOT_FOUND", {"artifact": name})
        digest = match.group(1)
        payload: Optional[bytes] = None
        for index in (cases.blobs, experiments.render_blobs):
            path = index.get(digest)
            if path is not None and path.is_file():
                payload = path.read_bytes()
                break
        if payload is None:
            payload = storage.blob(digest)
        if payload is None or imaging.sha256_bytes(payload) != digest:
            return error("ARTIFACT_NOT_FOUND", {"artifact": name})
        return Response(payload, media_type=contract.media_type, headers={
            "ETag": f'"sha256:{digest}"', "Cache-Control": "private, max-age=31536000, immutable",
        })

    # -- study and cases -------------------------------------------------------
    @app.get(f"{base}/studies/{{study_id}}")
    @endpoint("study_get")
    def study_get(study_id: str) -> Any:
        if study_id != settings.study_id:
            raise ApiError("ARTIFACT_NOT_FOUND", {"study_id": study_id})
        counts = cases.counts()
        experiment_ids = experiments.experiment_ids()
        return ok({
            "study_id": study_id,
            "dataset": {
                "dataset_id": "LASC2018",
                "name": "LASC 2018 left-atrium segmentation (official Cardiac Atlas source)",
                "version": "dataset-manifest-sha256:" + str(cases.index.get("dataset_manifest_sha256", "unknown"))[:16],
            },
            "case_counts": counts,
            "capabilities": {
                "ground_truth_evaluation": counts.get("EVALUATION", 0) > 0,
                "inference_review": counts.get("INFERENCE_REVIEW", 0) > 0,
                "reconstruction_3d": any(run.reconstruction_ids for run in experiments.runs.values()),
                "review": True,
                "live_analysis": False,
            },
            "experiment_summary": {
                "status": "AVAILABLE" if experiment_ids else "UNAVAILABLE",
                "experiment_ids": experiment_ids,
                "reason": None if experiment_ids else "NO_ACCEPTED_EXPERIMENT_ARTIFACTS",
            },
        })

    @app.get(f"{base}/studies/{{study_id}}/cases")
    @endpoint("case_list")
    def case_list(study_id: str, mode: Optional[str] = Query(None), q: Optional[str] = Query(None),
                  limit: Optional[str] = Query(None), page: Optional[str] = Query(None)) -> Any:
        if study_id != settings.study_id:
            raise ApiError("ARTIFACT_NOT_FOUND", {"study_id": study_id})
        if mode is not None and mode not in enums["case_mode"]:
            raise ApiError("VALIDATION_ERROR", {"field": "mode", "allowed": enums["case_mode"]})
        size = 100
        if limit is not None:
            if not SLICE.fullmatch(limit) or not 1 <= int(limit) <= 500:
                raise ApiError("VALIDATION_ERROR", {"field": "limit", "allowed": [1, 500]})
            size = int(limit)
        offset = 0
        if page is not None:
            if not SLICE.fullmatch(page):
                raise ApiError("VALIDATION_ERROR", {"field": "page"})
            offset = int(page)
        needle = (q or "").strip().upper()
        rows = [case for case in cases.ordered()
                if (mode is None or case.mode == mode) and (not needle or needle in case.case_id)]
        window = rows[offset: offset + size]
        return ok({
            "items": [{"case_id": case.case_id, "mode_capability": case.mode,
                       "ground_truth_available": case.ground_truth_available} for case in window],
            "next_page": str(offset + size) if offset + size < len(rows) else None,
            "mode": mode,
        })

    @app.get(f"{base}/cases/{{case_id}}")
    @endpoint("case_get")
    def case_get(case_id: str) -> Any:
        case = get_case(case_id)
        payload = {
            "case_id": case.case_id,
            "mode": case.mode,
            "ground_truth_available": case.ground_truth_available,
            "available_run_ids": sorted(run.run_id for run in experiments.runs_for_case(case.case_id)),
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/cases/{{case_id}}/slices/{{slice_index}}/mri")
    @endpoint("mri_slice_get")
    def mri_slice_get(case_id: str, slice_index: str) -> Any:
        case = get_case(case_id)
        z = parse_slice(case, slice_index)
        digest = case.slice_checksum("mri", z)
        if not case.slice_path("mri", z).is_file():
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "slice not in the data cache"})
        payload = {
            "source_volume_id": case.volume_id, "source_version": case.source_version(),
            "checksum": "sha256:" + digest, "content_url": url(digest), "media_type": contract.media_type,
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/cases/{{case_id}}/slices/{{slice_index}}/ground-truth")
    @endpoint("ground_truth_slice_get")
    def ground_truth_slice_get(case_id: str, slice_index: str) -> Any:
        case = get_case(case_id)
        z = parse_slice(case, slice_index)
        require_ground_truth(case)
        digest = case.slice_checksum("gt", z)
        if not case.slice_path("gt", z).is_file():
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "slice not in the data cache"})
        payload = {
            "reference_mask_id": case.reference_mask_id, "checksum": "sha256:" + digest,
            "content_url": url(digest), "media_type": contract.media_type,
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/cases/{{case_id}}/geometry")
    @endpoint("geometry_get")
    def geometry_get(case_id: str) -> Any:
        return ok(get_case(case_id).geometry())

    # -- experiments -----------------------------------------------------------
    @app.get(f"{base}/experiments")
    @endpoint("experiment_list")
    def experiment_list(prediction_variant: Optional[str] = Query(None)) -> Any:
        if prediction_variant is not None and prediction_variant not in enums["prediction_variant"]:
            raise ApiError("ARTIFACT_NOT_FOUND", {"prediction_variant": prediction_variant})
        packages = [experiments.experiments[key] for key in experiments.experiment_ids()]
        if prediction_variant is not None:
            packages = [package for package in packages if experiment_variant(package) == prediction_variant]
        variants = {experiment_variant(package) for package in packages}
        populations = {package.experiment["evaluation_population_manifest"]["manifest_id"] for package in packages}
        return ok({
            "items": [{"experiment_id": package.experiment["experiment_id"]} for package in packages],
            "prediction_variant": prediction_variant or (variants.pop() if len(variants) == 1 else None),
            "evaluation_population": populations.pop() if len(populations) == 1 else None,
        })

    @app.get(f"{base}/experiments/compare")
    @endpoint("experiment_compare")
    def experiment_compare(ids: Optional[str] = Query(None)) -> Any:
        requested = [value for value in (ids or "").split(",") if value]
        if len(requested) < 2 or len(set(requested)) != len(requested):
            raise ApiError("VALIDATION_ERROR", {"field": "ids", "reason": "two or more distinct experiment ids"})
        packages = []
        for experiment_id in requested:
            package = experiments.experiments.get(experiment_id)
            if package is None:
                raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
            packages.append(package)
        return ok(metrics.compare(packages))

    @app.get(f"{base}/experiments/{{experiment_id}}")
    @endpoint("experiment_get")
    def experiment_get(experiment_id: str) -> Any:
        package = experiments.experiments.get(experiment_id)
        if package is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
        experiment = package.experiment
        return ok({
            "experiment_id": experiment["experiment_id"],
            "model_family": experiment["model_family"],
            "training_fraction": experiment["training_fraction"],
            "split_manifest_id": experiment["split_manifest"]["manifest_id"],
            "subset_manifest_id": experiment["training_subset_manifest"]["manifest_id"],
            "preprocessing_version": experiment["preprocessing_version"],
            "postprocessing_version": experiment["postprocessing_version"],
            "checkpoint": {"checkpoint_id": experiment["checkpoint"]["checkpoint_id"],
                           "checksum": "sha256:" + experiment["checkpoint"]["checksum"]["value"]},
            "evaluation_version": experiment["evaluation_code_version"],
            "prediction_variant": experiment_variant(package),
        })

    @app.get(f"{base}/experiments/{{experiment_id}}/metrics")
    @endpoint("experiment_metrics")
    def experiment_metrics(experiment_id: str) -> Any:
        package = experiments.experiments.get(experiment_id)
        if package is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
        return ok(metrics.experiment_metrics(package))

    @app.get(f"{base}/experiments/{{experiment_id}}/cases")
    @endpoint("experiment_cases")
    def experiment_cases(experiment_id: str) -> Any:
        package = experiments.experiments.get(experiment_id)
        if package is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
        return ok(metrics.experiment_cases(package))

    # -- analysis runs ---------------------------------------------------------
    @app.post(f"{base}/cases/{{case_id}}/analysis-runs")
    @endpoint("analysis_run_create")
    def analysis_run_create(case_id: str, payload: Any = Body(None)) -> Any:
        get_case(case_id)
        body = body_object(payload, ["experiment_id"], ["experiment_id"])
        if not isinstance(body["experiment_id"], str):
            raise ApiError("VALIDATION_ERROR", {"field": "experiment_id"})
        raise ApiError("RUN_NOT_DEPLOYABLE", {
            "reason": "this deployment serves precomputed Contract 2 runs only; no live configuration is deployable",
        })

    @app.get(f"{base}/analysis-runs/{{run_id}}")
    @endpoint("analysis_run_get")
    def analysis_run_get(run_id: str) -> Any:
        run = get_run(run_id)
        return ok({
            "run_id": run.run_id, "case_id": run.case_id, "experiment_id": run.experiment_id,
            "status": run.status, "attempt_no": run.attempt_no, "precomputed": True,
            "raw_prediction_artifact_id": run.raw_mask_id,
            "processed_prediction_artifact_id": run.processed_mask_id,
            "reconstruction_ids": list(run.reconstruction_ids),
            "failure_code": "ANALYSIS_FAILED" if run.status == "FAILED" else None,
            "failure_reason": run.failure_reason,
        })

    @app.get(f"{base}/analysis-runs/{{run_id}}/metrics")
    @endpoint("analysis_run_metrics")
    def analysis_run_metrics(run_id: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = get_run(run_id)
        case = run_case(run)
        variant = variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        experiments.mask_artifact(run, variant)
        return ok(metrics.run_metrics(run, variant))

    @app.get(f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/metrics")
    @endpoint("analysis_slice_metrics")
    def analysis_slice_metrics(run_id: str, slice_index: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = get_run(run_id)
        case = run_case(run)
        variant = variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        z = parse_slice(case, slice_index)
        experiments.mask_artifact(run, variant)
        return ok(metrics.slice_metrics(run, variant, z))

    @app.get(f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/error")
    @endpoint("analysis_slice_error")
    def analysis_slice_error(run_id: str, slice_index: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = get_run(run_id)
        case = run_case(run)
        variant = variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        z = parse_slice(case, slice_index)
        experiments.mask_artifact(run, variant)
        return ok(metrics.slice_error(run, variant, z))

    @app.get(f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/prediction")
    @endpoint("prediction_slice_get")
    def prediction_slice_get(run_id: str, slice_index: str, variant: Optional[str] = Query(None)) -> Any:
        run = get_run(run_id)
        case = run_case(run)
        z = parse_slice(case, slice_index)
        chosen = variant_or_not_found(variant)
        require_succeeded(run)
        mask_id, artifact, digest = experiments.prediction_slice(run, chosen, z)
        payload = {
            "prediction_mask_id": mask_id, "prediction_variant": chosen,
            "source_version": f"{artifact['checksum']['value'][:16]}/{imaging.MASK_RENDER_VERSION}",
            "checksum": "sha256:" + digest, "content_url": url(digest), "media_type": contract.media_type,
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/analysis-runs/{{run_id}}/reconstruction")
    @endpoint("reconstruction_get")
    def reconstruction_get(run_id: str, source_mask_id: Optional[str] = Query(None)) -> Any:
        run = get_run(run_id)
        case = run_case(run)
        require_succeeded(run)
        if source_mask_id not in {run.raw_mask_id, run.processed_mask_id} or source_mask_id is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"source_mask_id": source_mask_id})
        artifacts = run.package.artifacts
        meshes = [artifact_id for artifact_id in run.reconstruction_ids
                  if artifacts[artifact_id].get("source_artifact_id") == source_mask_id]
        if not meshes:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "no reconstruction of this source mask"})
        mesh = artifacts[meshes[0]]
        payload = {
            "mesh_artifact_id": mesh["artifact_id"], "source_mask_id": source_mask_id,
            "source_mask_kind": SOURCE_KIND[artifacts[source_mask_id]["kind"]],
            "reconstruction_version": mesh.get("evaluation_version") or "sha256:" + mesh["checksum"]["value"],
            # Meshes are produced in the source mask's voxel-index frame; with
            # geometry not validated there is no physical world frame to map to.
            "mesh_to_world_transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/analysis-runs/{{run_id}}/error-reconstruction")
    @endpoint("error_reconstruction_get")
    def error_reconstruction_get(run_id: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = get_run(run_id)
        case = run_case(run)
        variant = variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        experiments.mask_artifact(run, variant)
        raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "no 3-D error reconstruction artifact (DR-005 open)"})

    # -- reviews ---------------------------------------------------------------
    def review_payload(row: Any) -> Dict[str, Any]:
        return {"review_id": row["review_id"], "status": row["status"], "revision": row["revision"],
                "etag": etag(row["review_id"], row["revision"])}

    @app.post(f"{base}/analysis-runs/{{run_id}}/reviews")
    @endpoint("review_create")
    def review_create(run_id: str, request: Request, payload: Any = Body(None)) -> Any:
        run = get_run(run_id)
        body = body_object(payload, ["status", "source_mask_id", "prediction_variant"],
                           ["status", "source_mask_id", "prediction_variant"])
        if body["status"] not in enums["review_status"]:
            raise ApiError("VALIDATION_ERROR", {"field": "status", "allowed": enums["review_status"]})
        if body["prediction_variant"] not in enums["prediction_variant"]:
            raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant", "allowed": enums["prediction_variant"]})
        if not isinstance(body["source_mask_id"], str):
            raise ApiError("VALIDATION_ERROR", {"field": "source_mask_id"})
        require_succeeded(run)
        case = run_case(run)
        source = body["source_mask_id"]
        if source == case.reference_mask_id or cases.mask_owner(source) is not None:
            raise ApiError("VALIDATION_ERROR", {"field": "source_mask_id", "reason": "ground truth is never a review source"})
        expected = run.mask_id(body["prediction_variant"])
        if expected is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": f"no {body['prediction_variant']} prediction for this run"})
        if source != expected:
            raise ApiError("VALIDATION_ERROR", {"field": "source_mask_id",
                                                "reason": "not this run's prediction for the requested variant"})
        kind = SOURCE_KIND[run.package.artifacts[source]["kind"]]
        row, created = storage.create_review(run.run_id, run.case_id, source, kind, body["prediction_variant"],
                                             body["status"], reviewer_of(request))
        data = review_payload(row)
        data.update({"run_id": row["run_id"], "source_mask_id": row["source_mask_id"],
                     "prediction_variant": row["prediction_variant"]})
        return ok(data, status=201 if created else 200, tag=data["etag"])

    @app.patch(f"{base}/reviews/{{review_id}}")
    @endpoint("review_patch")
    def review_patch(review_id: str, request: Request, payload: Any = Body(None)) -> Any:
        body = body_object(payload, ["status", "expected_revision"], ["status", "expected_revision"])
        if body["status"] not in enums["review_status"]:
            raise ApiError("VALIDATION_ERROR", {"field": "status", "allowed": enums["review_status"]})
        row = storage.patch_review(review_id, body["status"], revision_of(body), reviewer_of(request))
        data = review_payload(row)
        return ok(data, tag=data["etag"])

    @app.put(f"{base}/reviews/{{review_id}}/working-mask/slices/{{slice_index}}")
    @endpoint("working_mask_put")
    def working_mask_put(review_id: str, slice_index: str, request: Request, payload: Any = Body(None)) -> Any:
        review = storage.get_review(review_id)
        if review is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"review_id": review_id})
        case = get_case_for_review(review)
        z = parse_slice(case, slice_index)
        fields = ["source_mask_id", "expected_revision", "slice_index", "geometry_contract_version",
                  "geometry_validation_status", "mask_payload"]
        body = body_object(payload, fields, fields)
        if body["slice_index"] != z or isinstance(body["slice_index"], bool):
            raise ApiError("VALIDATION_ERROR", {"field": "slice_index", "reason": "must equal the path slice_index"})
        source = body["source_mask_id"]
        if source == case.reference_mask_id or cases.mask_owner(source) is not None:
            raise ApiError("VALIDATION_ERROR", {"field": "source_mask_id", "reason": "ground truth is never an implicit source prediction"})
        if source != review["source_mask_id"]:
            raise ApiError("VALIDATION_ERROR", {"field": "source_mask_id", "reason": "not this review's source mask"})
        if body["geometry_contract_version"] != contract.geometry_version:
            raise ApiError("GEOMETRY_MISMATCH", {"field": "geometry_contract_version", "expected": contract.geometry_version})
        expected_status = case.geometry()["geometry_validation_status"]
        if body["geometry_validation_status"] != expected_status:
            raise ApiError("GEOMETRY_MISMATCH", {"field": "geometry_validation_status", "expected": expected_status})
        expected_revision = revision_of(body)
        mask = imaging.decode_mask_payload(body["mask_payload"], case.ny, case.nx, enums["mask_payload_encoding"])
        row = storage.put_working_slice(review_id, z, imaging.encode_png(mask), expected_revision, reviewer_of(request))
        data = {"review_id": review_id, "working_revision": row["revision"], "source_mask_id": source, "slice_index": z}
        data.update(case.geometry())
        return ok(data, tag=etag(review_id, row["revision"]))

    def get_case_for_review(review: Any) -> CaseRecord:
        case = cases.get(review["case_id"])
        if case is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"case_id": review["case_id"]})
        return case

    @app.post(f"{base}/reviews/{{review_id}}/commit")
    @endpoint("review_commit")
    def review_commit(review_id: str, request: Request, payload: Any = Body(None)) -> Any:
        review = storage.get_review(review_id)
        if review is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"review_id": review_id})
        body = body_object(payload, ["expected_revision"], ["expected_revision"])
        expected_revision = revision_of(body)
        run = experiments.run(review["run_id"])
        if run is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"run_id": review["run_id"]})
        case = get_case_for_review(review)

        def build(row: Any, working: Dict[int, Any], base_volume: Any):
            mask_id, artifact, source_volume = experiments.prediction_volume(run, row["prediction_variant"])
            if mask_id != row["source_mask_id"]:
                raise ApiError("GEOMETRY_MISMATCH", {"reason": "the review's source mask is not the run's prediction"})
            volume = (source_volume if base_volume is None else base_volume).copy()
            for index, edited in working.items():
                if edited.shape != volume.shape[1:]:
                    raise ApiError("GEOMETRY_MISMATCH", {"slice_index": index})
                volume[index] = edited
            return volume, "sha256:" + artifact["checksum"]["value"]

        row = storage.commit(review_id, expected_revision, build, reviewer_of(request))
        data = {
            "reviewed_mask_id": row["reviewed_mask_id"], "checksum": row["checksum"],
            "revision": row["review_revision"], "source_mask_id": row["source_mask_id"],
            "source_mask_kind": row["source_mask_kind"], "provenance": provenance(row),
        }
        data.update(case.geometry())
        return ok(data, status=201, tag=etag(review_id, row["review_revision"]))

    @app.get(f"{base}/reviews/{{review_id}}/reviewed-masks")
    @endpoint("reviewed_masks_list")
    def reviewed_masks_list(review_id: str) -> Any:
        if storage.get_review(review_id) is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"review_id": review_id})
        return ok({"items": [{
            "reviewed_mask_id": row["reviewed_mask_id"], "source_mask_id": row["source_mask_id"],
            "revision": row["review_revision"], "checksum": row["checksum"], "provenance": provenance(row),
        } for row in storage.reviewed_masks(review_id)]})

    @app.get(f"{base}/reviewed-masks/{{reviewed_mask_id}}/slices/{{slice_index}}")
    @endpoint("reviewed_mask_slice_get")
    def reviewed_mask_slice_get(reviewed_mask_id: str, slice_index: str) -> Any:
        row = storage.reviewed_mask(reviewed_mask_id)
        if row is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reviewed_mask_id": reviewed_mask_id})
        case = cases.get(row["case_id"])
        if case is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"case_id": row["case_id"]})
        z = parse_slice(case, slice_index)
        stored = storage.reviewed_mask_slice(reviewed_mask_id, z)
        if stored is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reviewed_mask_id": reviewed_mask_id, "slice_index": z})
        data = {"reviewed_mask_id": reviewed_mask_id, "slice_index": z, "checksum": "sha256:" + stored["sha256"],
                "content_url": url(stored["sha256"]), "media_type": contract.media_type}
        data.update(case.geometry())
        return ok(data)

    # -- findings --------------------------------------------------------------
    finding_fields = ["study_id", "experiment_id", "case_id", "analysis_run_id", "prediction_variant",
                      "slice_index", "finding_type", "note", "region_reference"]

    @app.post(f"{base}/findings")
    @endpoint("finding_create")
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
        case = get_case(values["case_id"]) if values["case_id"] is not None else None
        variant = values["prediction_variant"]
        if values["analysis_run_id"] is None and variant is not None:
            raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant", "reason": "only with an analysis_run_id"})
        if values["analysis_run_id"] is not None:
            if variant not in enums["prediction_variant"]:
                raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant",
                                                    "reason": "required with an analysis_run_id",
                                                    "allowed": enums["prediction_variant"]})
            run = get_run(values["analysis_run_id"])
            if run.mask_id(variant) is None:
                raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant",
                                                    "reason": f"the run has no {variant} prediction"})
            if case is None:
                case = get_case(run.case_id)
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
    @endpoint("findings_list")
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
    @endpoint("finding_patch")
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
