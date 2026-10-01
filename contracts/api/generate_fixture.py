#!/usr/bin/env python3
"""Generate the data-free Contract 11 fixture bundle; never hand-write it.

Every value is a placeholder derived from a contract field name, an enum in
``domain_enums`` or a shape in ``field_shapes``. Nothing here is a measurement:
the numbers in metric fields only exercise the response shape, and the bundle
says so in ``data_policy``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import List, Optional


TOKEN = re.compile(r"\{([a-z_][a-z0-9_]*)\}", re.IGNORECASE)
# Used only for list endpoints that do not declare row_fields in the contract.
LIST_TOP_LEVEL_FIELDS = {
    "next_page", "mode", "metric_version", "prediction_variant", "evaluation_population",
}
DATA_POLICY = (
    "synthetic and data-free: every value is a placeholder generated from the contract, "
    "never a measurement, image, mask or patient-derived byte"
)

# Statuses by endpoint, agreed with the V4 client lane on 2026-10-01. Endpoints
# that are not listed keep the historical placeholder (experiment_cases and
# analysis_run_create are deliberately unchanged in v1.0).
STATUS_BY_ENDPOINT = {
    "review_create": "NOT_REVIEWED",
    "review_patch": "FLAGGED",
    "finding_create": "OPEN",
    "findings_list": "OPEN",
    "finding_patch": "RESOLVED",
    "analysis_run_get": "SUCCEEDED",
}
# Objects with a declared shape in field_shapes, typed only where bound.
SHAPED_ENDPOINTS = {
    "provenance": {"review_commit", "reviewed_masks_list"},
}


def param_value(token: str):
    """Return a deterministic, non-clinical value for one URL token."""
    values = {
        "case_id": "CASE_0043", "run_id": "RUN_0043", "review_id": "REVIEW_0043",
        "reviewed_mask_id": "REVIEWED_MASK_0043_R1", "study_id": "STUDY_DEMO",
        "experiment_id": "EXP_DEMO", "finding_id": "FINDING_0043", "slice_index": 44,
        "variant": "RAW", "experiment_ids": ["EXP_DEMO_A", "EXP_DEMO_B"],
        "mask_id": "MASK_PROCESSED_0043",
    }
    return values.get(token, f"X_{token.upper()}")


def fixture_checksum(label: str) -> str:
    """A real sha256 of a declared fixture label, so the checksum format is exact."""
    return "sha256:" + hashlib.sha256(f"contract11-fixture:{label}".encode("utf-8")).hexdigest()


def field_value(field: str, contract: dict, endpoint_id: Optional[str] = None):
    """Return a typed placeholder determined by a contract field name (and endpoint)."""
    geometry_version = contract["geometry_contract"]["version"]
    checksum = fixture_checksum(endpoint_id or field)
    if field == "status" and endpoint_id in STATUS_BY_ENDPOINT:
        return STATUS_BY_ENDPOINT[endpoint_id]
    if field == "mode" and endpoint_id == "case_list":
        return None  # the echo of the mode filter; the fixture request applies none
    if field == "provenance" and endpoint_id in SHAPED_ENDPOINTS["provenance"]:
        return {
            "review_id": "REVIEW_0043", "case_id": "CASE_0043", "run_id": "RUN_0043",
            "source_mask_id": "RAW_PREDICTION_ARTIFACT_ID_0043", "source_mask_kind": "RAW_PREDICTION",
            "prediction_variant": "RAW", "version": 1, "parent_reviewed_mask_id": None,
            "created_at": "2026-10-01T00:00:00Z", "reviewer_id": None,
        }
    values = {
        "geometry_contract_version": geometry_version,
        "geometry_validation_status": "GEOMETRY_NOT_VALIDATED",
        "shape": [576, 576, 88], "index_convention": contract["geometry_contract"]["index_convention"],
        "spacing": [1.0, 1.0, 1.0], "origin": [0.0, 0.0, 0.0],
        "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1], "slice_index": 44,
        "revision": 1, "working_revision": 1, "etag": 'W/"revision-1"',
        "status": "IN_PROGRESS", "checksum": checksum,
        "content_url": f"{contract['base_path']}/artifacts/{checksum.split(':', 1)[1]}.png",
        "media_type": contract["binary_delivery"]["media_type"],
        "prediction_variant": "RAW", "comparable": True, "metric_state": "NOT_APPLICABLE",
        "metric_value": None, "items": [], "next_page": None,
        "mode": "EVALUATION", "mode_capability": "EVALUATION", "ground_truth_available": True,
        "aggregation_level": "CASE_3D", "precomputed": True, "attempt_no": 1,
        "failure_code": None, "failure_reason": None,
        "source_mask_id": "RAW_PREDICTION_ARTIFACT_ID_0043", "source_mask_kind": "RAW_PREDICTION",
        "finding_type": "UNDER_SEGMENTATION", "region_reference": None,
        "mesh_to_world_transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        "dataset": {"dataset_id": "DATASET_FIXTURE", "name": "fixture dataset", "version": "fixture"},
        "case_counts": {"total": 2, "EVALUATION": 1, "INFERENCE_REVIEW": 1},
        "capabilities": {
            "ground_truth_evaluation": True, "inference_review": True, "reconstruction_3d": True,
            "review": True, "live_analysis": False,
        },
        "experiment_summary": {"status": "UNAVAILABLE", "experiment_ids": [], "reason": "FIXTURE"},
        "metric_values": {
            "dice": 0.5, "iou": 0.25, "false_positives": 100, "false_negatives": 200,
            "relative_volume_error": -10.0,
        },
        "worst_slice_selection": {
            "rule_id": contract["selection_rules"]["worst_slice_selection"]["rule_id"],
            "selection_version": contract["selection_rules"]["worst_slice_selection"]["selection_version"],
            # Ranked as the server must rank them (DR-010): Dice ascending, then
            # FP+FN descending, then slice_index ascending.
            "slices": [
                {"slice_index": 44, "dice": 0.25, "false_positives": 30, "false_negatives": 10},
                {"slice_index": 12, "dice": 0.25, "false_positives": 5, "false_negatives": 5},
                {"slice_index": 60, "dice": 0.5, "false_positives": 1, "false_negatives": 2},
            ],
        },
        "provenance": {"source": "contract-generated-fixture"},
        "evidence": {
            "study_id": "STUDY_DEMO", "experiment_id": "EXP_DEMO", "case_id": "CASE_0043",
            "analysis_run_id": "RUN_0043", "slice_index": 44, "region_reference": None,
        },
        "mask_payload": {"encoding": "BITPACK_BASE64", "data": "<base64 of Ny*Nx bits, row-major, MSB first>"},
        "summary": {"status": "fixture"},
    }
    if field in values:
        return values[field]
    if field.endswith("_id"):
        return f"{field.upper()}_0043"
    if field.endswith("_ids"):
        return [f"{field.upper()}_0043"]
    return f"{field}_fixture"


def tokens_for(path: str) -> List[str]:
    return TOKEN.findall(path)


def request_for(endpoint: dict, contract: dict) -> dict:
    params = {token: param_value(token) for token in tokens_for(endpoint["path"])}
    body = None
    if endpoint.get("request_fields"):
        body = {field: field_value(field, contract, endpoint["id"]) for field in endpoint["request_fields"]}
        if endpoint.get("revision_required"):
            body["expected_revision"] = 1
    return {"params": params, "body": body}


def success_data(endpoint: dict, contract: dict) -> dict:
    fields = endpoint.get("response_fields", [])
    endpoint_id = endpoint["id"]
    data: dict = {}
    if "items" in fields:
        declared_rows = endpoint.get("row_fields")
        row = {}
        for field in fields:
            if field == "items":
                continue
            is_row = field in declared_rows if declared_rows is not None else field not in LIST_TOP_LEVEL_FIELDS
            if is_row:
                row[field] = field_value(field, contract, endpoint_id)
            else:
                data[field] = field_value(field, contract, endpoint_id)
        data["items"] = [row]
    else:
        data = {field: field_value(field, contract, endpoint_id) for field in fields}
    if endpoint.get("geometry_response"):
        for field in contract["geometry_contract"]["required_response_fields"]:
            data[field] = field_value(field, contract, endpoint_id)
    return data


def error_response(code: str, errors_by_code: dict) -> dict:
    error = errors_by_code[code]
    return {
        "status": error["http_status"],
        "error": {
            "code": code, "message": error["message_template"],
            "request_id": "req_fixture_0001", "details": None,
        },
    }


def generate_fixture(contract: dict) -> dict:
    """Generate one complete bundle from the accepted Contract 11 instance."""
    errors_by_code = {error["code"]: error for error in contract["errors"]}
    scenarios = {}
    for endpoint in contract["endpoints"]:
        endpoint_id = endpoint["id"]
        request = request_for(endpoint, contract)
        default_data = success_data(endpoint, contract)
        if endpoint_id == "case_list":
            # One row per mode, so a list screen meets both from day one.
            inference_row = dict(default_data["items"][0])
            inference_row.update({
                "case_id": "CASE_0044", "mode_capability": "INFERENCE_REVIEW", "ground_truth_available": False,
            })
            default_data["items"].append(inference_row)
        if endpoint_id == "analysis_run_metrics":
            default_data["metric_state"] = "COMPUTED"
        endpoint_scenarios = {
            "default": {"request": request, "response": {"status": 200, "data": default_data}},
            "error_case": {
                "request": request,
                "response": error_response(endpoint["errors"][0], errors_by_code),
            },
        }
        if "items" in endpoint.get("response_fields", []):
            # A real backend answers an empty page (no findings yet, a filter
            # that matches nothing): top-level fields present, items empty.
            empty = {key: value for key, value in default_data.items() if key != "items"}
            empty["items"] = []
            endpoint_scenarios["empty"] = {"request": request, "response": {"status": 200, "data": empty}}
        if endpoint_id in {"ground_truth_slice_get", "analysis_slice_metrics", "analysis_run_metrics"}:
            endpoint_scenarios["ground_truth_unavailable"] = {
                "request": request,
                "response": error_response("GROUND_TRUTH_UNAVAILABLE", errors_by_code),
            }
        if endpoint_id in {"prediction_slice_get", "analysis_slice_metrics"}:
            endpoint_scenarios["run_not_succeeded"] = {
                "request": request,
                "response": error_response("RUN_NOT_SUCCEEDED", errors_by_code),
            }
        if endpoint_id in {"review_patch", "working_mask_put", "review_commit"}:
            endpoint_scenarios["stale_revision"] = {
                "request": request,
                "response": error_response("STALE_REVISION", errors_by_code),
            }
        if endpoint_id == "review_patch":
            endpoint_scenarios["invalid_transition"] = {
                "request": request,
                "response": error_response("INVALID_REVIEW_TRANSITION", errors_by_code),
            }
        if endpoint_id == "analysis_run_get":
            for name, status in (("run_running", "RUNNING"), ("run_failed", "FAILED")):
                data = dict(default_data)
                data["status"] = status
                if status == "FAILED":
                    data["failure_code"] = "ANALYSIS_FAILED"
                    data["failure_reason"] = "fixture failure"
                endpoint_scenarios[name] = {
                    "request": request, "response": {"status": 200, "data": data},
                }
        if endpoint_id == "case_get":
            # INT-12 / PR-MODE-01: the inference & review capability, explicit.
            data = dict(default_data)
            data.update({"mode": "INFERENCE_REVIEW", "ground_truth_available": False})
            endpoint_scenarios["inference_review"] = {
                "request": request, "response": {"status": 200, "data": data},
            }
        if endpoint_id == "analysis_run_metrics":
            data = json.loads(json.dumps(default_data))
            data["worst_slice_selection"]["slices"] = []
            endpoint_scenarios["no_eligible_slices"] = {
                "request": request, "response": {"status": 200, "data": data},
            }
        if endpoint_id == "reconstruction_get":
            endpoint_scenarios["geometry_mismatch"] = {
                "request": request,
                "response": error_response("GEOMETRY_MISMATCH", errors_by_code),
            }
        if endpoint_id == "experiment_compare":
            endpoint_scenarios["not_comparable"] = {
                "request": request,
                "response": error_response("NON_COMPARABLE_EXPERIMENTS", errors_by_code),
            }
        scenarios[endpoint_id] = endpoint_scenarios

    return {
        "bundle": "api_contract_11_fixture_bundle", "bundle_version": "v0",
        "generated_by": "contracts/api/generate_fixture.py",
        "generated_command": (
            "python contracts/api/generate_fixture.py --contract contracts/api/contract.json "
            "--output app/core/fixtures/.generated/api_bundle.json"
        ),
        "data_policy": DATA_POLICY,
        "contract": contract["contract"], "contract_version": contract["contract_version"],
        "base_path": contract["base_path"],
        "endpoints": [
            {"id": e["id"], "method": e["method"], "path": e["path"], "response_kind": e["response_kind"]}
            for e in contract["endpoints"]
        ],
        "errors": [{"code": e["code"], "http_status": e["http_status"]} for e in contract["errors"]],
        "geometry": {
            "geometry_contract_version": contract["geometry_contract"]["version"],
            "geometry_validation_status": "GEOMETRY_NOT_VALIDATED",
        },
        "scenarios": scenarios,
    }


def main(argv: Optional[List[str]] = None) -> int:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Generate the Contract 11 fixture bundle")
    parser.add_argument("--contract", type=Path, default=here / "contract.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(generate_fixture(contract), indent=2) + "\n", encoding="utf-8")
    print(f"generated {args.output} from {args.contract}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
