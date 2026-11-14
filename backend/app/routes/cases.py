"""The study, its case list, one case, its MRI and ground-truth slices and its geometry."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, Query

from ..contract import ApiError
from ..state import SLICE, Backend, parse_slice, require_ground_truth
from .common import artifact_url, endpoint, ok


def add_routes(app: FastAPI, backend: Backend) -> None:
    contract, settings = backend.contract, backend.settings
    cases, experiments = backend.cases, backend.experiments
    base, enums = contract.base_path, contract.enums

    @app.get(f"{base}/studies/{{study_id}}")
    @endpoint(contract, "study_get")
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
                "reconstruction_3d": any(run.reconstruction_ids or run.derived_reconstruction_ids
                                         for run in experiments.runs.values()),
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
    @endpoint(contract, "case_list")
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
    @endpoint(contract, "case_get")
    def case_get(case_id: str) -> Any:
        case = backend.get_case(case_id)
        payload = {
            "case_id": case.case_id,
            "mode": case.mode,
            "ground_truth_available": case.ground_truth_available,
            "available_run_ids": sorted(run.run_id for run in experiments.runs_for_case(case.case_id)),
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/cases/{{case_id}}/slices/{{slice_index}}/mri")
    @endpoint(contract, "mri_slice_get")
    def mri_slice_get(case_id: str, slice_index: str) -> Any:
        case = backend.get_case(case_id)
        z = parse_slice(case, slice_index)
        digest = case.slice_checksum("mri", z)
        if not case.slice_path("mri", z).is_file():
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "slice not in the data cache"})
        payload = {
            "source_volume_id": case.volume_id, "source_version": case.source_version(),
            "checksum": "sha256:" + digest, "content_url": artifact_url(contract, digest), "media_type": contract.media_type,
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/cases/{{case_id}}/slices/{{slice_index}}/ground-truth")
    @endpoint(contract, "ground_truth_slice_get")
    def ground_truth_slice_get(case_id: str, slice_index: str) -> Any:
        case = backend.get_case(case_id)
        z = parse_slice(case, slice_index)
        require_ground_truth(case)
        digest = case.slice_checksum("gt", z)
        if not case.slice_path("gt", z).is_file():
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "slice not in the data cache"})
        payload = {
            "reference_mask_id": case.reference_mask_id, "checksum": "sha256:" + digest,
            "content_url": artifact_url(contract, digest), "media_type": contract.media_type,
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/cases/{{case_id}}/geometry")
    @endpoint(contract, "geometry_get")
    def geometry_get(case_id: str) -> Any:
        return ok(backend.get_case(case_id).geometry())
