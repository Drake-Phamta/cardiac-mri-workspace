"""Analysis runs: one run, its metrics, its per-slice metrics, error map and prediction, and its 3-D meshes."""

from typing import Any, Optional

from fastapi import Body, FastAPI, Query

from .. import imaging
from ..contract import ApiError
from ..experiments import SOURCE_KIND
from ...mesh import artifact as mesh_module
from ..state import Backend, parse_slice, require_ground_truth, require_succeeded
from .common import artifact_url, body_object, endpoint, ok


def add_routes(app: FastAPI, backend: Backend) -> None:
    contract, experiments, metrics = backend.contract, backend.experiments, backend.metrics
    base = contract.base_path

    @app.post(f"{base}/cases/{{case_id}}/analysis-runs")
    @endpoint(contract, "analysis_run_create")
    def analysis_run_create(case_id: str, payload: Any = Body(None)) -> Any:
        backend.get_case(case_id)
        body = body_object(payload, ["experiment_id"], ["experiment_id"])
        if not isinstance(body["experiment_id"], str):
            raise ApiError("VALIDATION_ERROR", {"field": "experiment_id"})
        raise ApiError("RUN_NOT_DEPLOYABLE", {
            "reason": "this deployment serves precomputed Contract 2 runs only; no live configuration is deployable",
        })

    @app.get(f"{base}/analysis-runs/{{run_id}}")
    @endpoint(contract, "analysis_run_get")
    def analysis_run_get(run_id: str) -> Any:
        run = backend.get_run(run_id)
        return ok({
            "run_id": run.run_id, "case_id": run.case_id, "experiment_id": run.experiment_id,
            "status": run.status, "attempt_no": run.attempt_no, "precomputed": True,
            "raw_prediction_artifact_id": run.raw_mask_id,
            "processed_prediction_artifact_id": run.processed_mask_id,
            "reconstruction_ids": list(run.reconstruction_ids) + list(run.derived_reconstruction_ids),
            "failure_code": "ANALYSIS_FAILED" if run.status == "FAILED" else None,
            "failure_reason": run.failure_reason,
        })

    @app.get(f"{base}/analysis-runs/{{run_id}}/metrics")
    @endpoint(contract, "analysis_run_metrics")
    def analysis_run_metrics(run_id: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = backend.get_run(run_id)
        case = backend.run_case(run)
        variant = backend.variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        experiments.mask_artifact(run, variant)
        return ok(metrics.run_metrics(run, variant))

    @app.get(f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/metrics")
    @endpoint(contract, "analysis_slice_metrics")
    def analysis_slice_metrics(run_id: str, slice_index: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = backend.get_run(run_id)
        case = backend.run_case(run)
        variant = backend.variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        z = parse_slice(case, slice_index)
        experiments.mask_artifact(run, variant)
        return ok(metrics.slice_metrics(run, variant, z))

    @app.get(f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/error")
    @endpoint(contract, "analysis_slice_error")
    def analysis_slice_error(run_id: str, slice_index: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = backend.get_run(run_id)
        case = backend.run_case(run)
        variant = backend.variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        z = parse_slice(case, slice_index)
        experiments.mask_artifact(run, variant)
        return ok(metrics.slice_error(run, variant, z))

    @app.get(f"{base}/analysis-runs/{{run_id}}/slices/{{slice_index}}/prediction")
    @endpoint(contract, "prediction_slice_get")
    def prediction_slice_get(run_id: str, slice_index: str, variant: Optional[str] = Query(None)) -> Any:
        run = backend.get_run(run_id)
        case = backend.run_case(run)
        z = parse_slice(case, slice_index)
        chosen = backend.variant_or_not_found(variant)
        require_succeeded(run)
        mask_id, artifact, digest = experiments.prediction_slice(run, chosen, z)
        payload = {
            "prediction_mask_id": mask_id, "prediction_variant": chosen,
            "source_version": f"{artifact['checksum']['value'][:16]}/{imaging.MASK_RENDER_VERSION}",
            "checksum": "sha256:" + digest, "content_url": artifact_url(contract, digest), "media_type": contract.media_type,
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/analysis-runs/{{run_id}}/reconstruction")
    @endpoint(contract, "reconstruction_get")
    def reconstruction_get(run_id: str, source_mask_id: Optional[str] = Query(None)) -> Any:
        """A mesh reference for one source mask of the run: its RAW or PROCESSED prediction, or the case's ground
        truth. Meshes are in the voxel-index frame (x = column, y = row, z = slice), hence the identity transform;
        the bytes are served at /artifacts/<sha256>.cmesh, with the sha256 taken from ``mesh_artifact_id``."""
        run = backend.get_run(run_id)
        case = backend.run_case(run)
        require_succeeded(run)
        artifacts = run.package.artifacts
        if source_mask_id is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"source_mask_id": source_mask_id})
        mask_sha: Optional[str]
        if source_mask_id in {run.raw_mask_id, run.processed_mask_id}:
            source_kind = SOURCE_KIND[artifacts[source_mask_id]["kind"]]
            mask_sha = artifacts[source_mask_id]["checksum"]["value"]
        elif case.ground_truth_available and source_mask_id == case.reference_mask_id:
            source_kind, mask_sha = "GROUND_TRUTH", case.data.get("mask_sha256")
        elif not case.ground_truth_available and source_mask_id == f"MASK_{case.case_id}":
            # The INT-12 case: GROUND_TRUTH_UNAVAILABLE is not in reconstruction_get's error list, so the
            # refusal is ARTIFACT_NOT_FOUND carrying that reason.
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "GROUND_TRUTH_UNAVAILABLE", "case_id": case.case_id,
                                                  "mode": case.mode})
        else:
            raise ApiError("ARTIFACT_NOT_FOUND", {"source_mask_id": source_mask_id})
        entry = backend.meshes.for_mask(mask_sha)
        if entry is not None:
            if entry.shape != case.shape:
                raise ApiError("GEOMETRY_MISMATCH", {"reason": "the derived mesh was built for another volume shape"})
            payload = {
                "mesh_artifact_id": entry.artifact_id, "source_mask_id": source_mask_id,
                "source_mask_kind": source_kind,
                "reconstruction_version": mesh_module.reconstruction_version(str(mask_sha)),
                # Identity: with geometry not validated there is no physical world frame to map to.
                "mesh_to_world_transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            }
            payload.update(case.geometry())
            return ok(payload)
        listed = [artifact_id for artifact_id in run.reconstruction_ids
                  if artifacts[artifact_id].get("source_artifact_id") == source_mask_id]
        if source_kind == "GROUND_TRUTH" or not listed:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "no reconstruction of this source mask "
                                                            "(derived mesh not built)"})
        mesh = artifacts[listed[0]]  # a Contract 2 package that lists its own mesh
        payload = {
            "mesh_artifact_id": mesh["artifact_id"], "source_mask_id": source_mask_id,
            "source_mask_kind": source_kind,
            "reconstruction_version": mesh.get("evaluation_version") or "sha256:" + mesh["checksum"]["value"],
            "mesh_to_world_transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        }
        payload.update(case.geometry())
        return ok(payload)

    @app.get(f"{base}/analysis-runs/{{run_id}}/error-reconstruction")
    @endpoint(contract, "error_reconstruction_get")
    def error_reconstruction_get(run_id: str, prediction_variant: Optional[str] = Query(None)) -> Any:
        run = backend.get_run(run_id)
        case = backend.run_case(run)
        variant = backend.variant_or_not_found(prediction_variant)
        require_ground_truth(case)
        require_succeeded(run, "ANALYSIS_FAILED")
        experiments.mask_artifact(run, variant)
        raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "no 3-D error reconstruction artifact (DR-005 open)"})
