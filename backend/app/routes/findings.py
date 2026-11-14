"""Findings: a note about a study, case, run or slice, with its evidence; create, list and edit."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Query

from ..contract import ApiError
from ..state import Backend, parse_slice
from ..storage import etag
from .common import body_object, endpoint, ok, revision_of

MAX_NOTE = 4000


def evidence(row: Any) -> Dict[str, Any]:
    return {
        "study_id": row["study_id"], "experiment_id": row["experiment_id"], "case_id": row["case_id"],
        "analysis_run_id": row["analysis_run_id"], "prediction_variant": row["prediction_variant"],
        "slice_index": row["slice_index"],
        "region_reference": None if row["region_reference"] is None else json.loads(row["region_reference"]),
    }


def add_routes(app: FastAPI, backend: Backend) -> None:
    contract, settings = backend.contract, backend.settings
    experiments, storage = backend.experiments, backend.storage
    base, enums = contract.base_path, contract.enums

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
