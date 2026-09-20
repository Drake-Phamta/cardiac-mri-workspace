#!/usr/bin/env python3
"""Generate the data-free Contract 11 fixture bundle; never hand-write it."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


TOKEN = re.compile(r"\{([a-z_][a-z0-9_]*)\}", re.IGNORECASE)
LIST_TOP_LEVEL_FIELDS = {
    "next_page", "mode", "metric_version", "prediction_variant", "evaluation_population",
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


def field_value(field: str, contract: dict):
    """Return a typed placeholder determined only by a contract field name."""
    geometry_version = contract["geometry_contract"]["version"]
    values = {
        "geometry_contract_version": geometry_version,
        "geometry_validation_status": "VALIDATED",
        "shape": [576, 576, 88], "index_convention": "x=column,y=row,z=slice",
        "spacing": [1.25, 1.25, 8.0], "origin": [0, 0, 0],
        "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1], "slice_index": 44,
        "revision": 1, "working_revision": 1, "etag": 'W/"revision-1"',
        "status": "IN_PROGRESS", "checksum": "sha256:fixture-derived-not-clinical",
        "prediction_variant": "RAW", "comparable": True, "metric_state": "NOT_APPLICABLE",
        "metric_value": None, "items": [], "next_page": None, "case_counts": {"total": 1},
        "capabilities": ["fixture"], "experiment_summary": {"status": "fixture"},
        "provenance": {"source": "contract-generated-fixture"},
        "evidence": {"source": "contract-generated-fixture"}, "summary": {"status": "fixture"},
    }
    if field in values:
        return values[field]
    if field.endswith("_id"):
        return f"{field.upper()}_0043"
    if field.endswith("_ids"):
        return [f"{field.upper()}_0043"]
    return f"{field}_fixture"


def tokens_for(path: str) -> list[str]:
    return TOKEN.findall(path)


def request_for(endpoint: dict, contract: dict) -> dict:
    params = {token: param_value(token) for token in tokens_for(endpoint["path"])}
    body = None
    if endpoint.get("request_fields"):
        body = {field: field_value(field, contract) for field in endpoint["request_fields"]}
        if endpoint.get("revision_required"):
            body["expected_revision"] = 1
    return {"params": params, "body": body}


def success_data(endpoint: dict, contract: dict) -> dict:
    fields = endpoint.get("response_fields", [])
    data: dict = {}
    if "items" in fields:
        row = {}
        for field in fields:
            if field == "items":
                continue
            if field in LIST_TOP_LEVEL_FIELDS:
                data[field] = field_value(field, contract)
            else:
                row[field] = field_value(field, contract)
        data["items"] = [row]
    else:
        data = {field: field_value(field, contract) for field in fields}
    if endpoint.get("geometry_response"):
        for field in contract["geometry_contract"]["required_response_fields"]:
            data[field] = field_value(field, contract)
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
        if endpoint_id == "analysis_run_get":
            # A successful read of an existing run is not a review in progress.
            default_data["status"] = "SUCCEEDED"
        endpoint_scenarios = {
            "default": {"request": request, "response": {"status": 200, "data": default_data}},
            "error_case": {
                "request": request,
                "response": error_response(endpoint["errors"][0], errors_by_code),
            },
        }
        if endpoint_id in {"ground_truth_slice_get", "analysis_slice_metrics"}:
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
        if endpoint_id == "analysis_run_get":
            for name, status in (("run_running", "RUNNING"), ("run_failed", "FAILED")):
                data = dict(default_data)
                data["status"] = status
                endpoint_scenarios[name] = {
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
        "contract": contract["contract"], "contract_version": contract["contract_version"],
        "base_path": contract["base_path"],
        "endpoints": [
            {"id": e["id"], "method": e["method"], "path": e["path"], "response_kind": e["response_kind"]}
            for e in contract["endpoints"]
        ],
        "errors": [{"code": e["code"], "http_status": e["http_status"]} for e in contract["errors"]],
        "geometry": {
            "geometry_contract_version": contract["geometry_contract"]["version"],
            "geometry_validation_status": "VALIDATED",
        },
        "scenarios": scenarios,
    }


def main(argv: list[str] | None = None) -> int:
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
