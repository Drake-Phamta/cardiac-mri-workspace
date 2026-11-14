"""Reviews of a prediction: create, change status, upload an edited slice, commit a reviewed mask, read it back."""

import re
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Request

from .. import imaging
from ..cases import CaseRecord
from ..contract import ApiError
from ..experiments import SOURCE_KIND
from ..state import Backend, parse_slice, require_succeeded
from ..storage import etag
from .common import artifact_url, body_object, endpoint, ok, revision_of

REVIEWER = re.compile(r"[A-Za-z0-9_.@-]{1,64}")


def provenance(row: Any) -> Dict[str, Any]:
    return {
        "review_id": row["review_id"], "case_id": row["case_id"], "run_id": row["run_id"],
        "source_mask_id": row["source_mask_id"], "source_mask_kind": row["source_mask_kind"],
        "prediction_variant": row["prediction_variant"], "version": row["version"],
        "parent_reviewed_mask_id": row["parent_reviewed_mask_id"], "created_at": row["created_at"],
        "reviewer_id": row["reviewer_id"],
    }


def add_routes(app: FastAPI, backend: Backend) -> None:
    contract, settings = backend.contract, backend.settings
    cases, experiments, storage = backend.cases, backend.experiments, backend.storage
    base, enums = contract.base_path, contract.enums

    def reviewer_of(request: Request) -> Optional[str]:
        value = request.headers.get(settings.reviewer_header)
        return value if value and REVIEWER.fullmatch(value) else None

    def review_payload(row: Any) -> Dict[str, Any]:
        return {"review_id": row["review_id"], "status": row["status"], "revision": row["revision"],
                "etag": etag(row["review_id"], row["revision"])}

    @app.post(f"{base}/analysis-runs/{{run_id}}/reviews")
    @endpoint(contract, "review_create")
    def review_create(run_id: str, request: Request, payload: Any = Body(None)) -> Any:
        run = backend.get_run(run_id)
        body = body_object(payload, ["status", "source_mask_id", "prediction_variant"],
                           ["status", "source_mask_id", "prediction_variant"])
        if body["status"] not in enums["review_status"]:
            raise ApiError("VALIDATION_ERROR", {"field": "status", "allowed": enums["review_status"]})
        if body["prediction_variant"] not in enums["prediction_variant"]:
            raise ApiError("VALIDATION_ERROR", {"field": "prediction_variant", "allowed": enums["prediction_variant"]})
        if not isinstance(body["source_mask_id"], str):
            raise ApiError("VALIDATION_ERROR", {"field": "source_mask_id"})
        require_succeeded(run)
        case = backend.run_case(run)
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
    @endpoint(contract, "review_patch")
    def review_patch(review_id: str, request: Request, payload: Any = Body(None)) -> Any:
        body = body_object(payload, ["status", "expected_revision"], ["status", "expected_revision"])
        if body["status"] not in enums["review_status"]:
            raise ApiError("VALIDATION_ERROR", {"field": "status", "allowed": enums["review_status"]})
        row = storage.patch_review(review_id, body["status"], revision_of(body), reviewer_of(request))
        data = review_payload(row)
        return ok(data, tag=data["etag"])

    @app.put(f"{base}/reviews/{{review_id}}/working-mask/slices/{{slice_index}}")
    @endpoint(contract, "working_mask_put")
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
    @endpoint(contract, "review_commit")
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
            "revision": row["review_revision"], "status": contract.review_rules["commit_result_state"],
            "source_mask_id": row["source_mask_id"],
            "source_mask_kind": row["source_mask_kind"], "provenance": provenance(row),
        }
        data.update(case.geometry())
        return ok(data, status=201, tag=etag(review_id, row["review_revision"]))

    @app.get(f"{base}/reviews/{{review_id}}/reviewed-masks")
    @endpoint(contract, "reviewed_masks_list")
    def reviewed_masks_list(review_id: str) -> Any:
        if storage.get_review(review_id) is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"review_id": review_id})
        return ok({"items": [{
            "reviewed_mask_id": row["reviewed_mask_id"], "source_mask_id": row["source_mask_id"],
            "revision": row["review_revision"], "checksum": row["checksum"], "provenance": provenance(row),
        } for row in storage.reviewed_masks(review_id)]})

    @app.get(f"{base}/reviewed-masks/{{reviewed_mask_id}}/slices/{{slice_index}}")
    @endpoint(contract, "reviewed_mask_slice_get")
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
                "content_url": artifact_url(contract, stored["sha256"]), "media_type": contract.media_type}
        data.update(case.geometry())
        return ok(data)
