#!/usr/bin/env python3
"""Synthetic checks for API Contract 11 v1.0.0."""

from __future__ import annotations

import copy
import json
import tempfile
from pathlib import Path

from generate_fixture import generate_fixture
from validate_api_contract import ContractError, validate_contract, validate_response


HERE = Path(__file__).resolve().parent


def expect_error(contract: dict, code: str, schema: dict) -> None:
    try:
        validate_contract(contract, schema)
    except ContractError as exc:
        assert exc.code == code, (exc.code, str(exc))
    else:
        raise AssertionError(f"expected {code}")


def endpoint(contract: dict, endpoint_id: str) -> dict:
    return next(item for item in contract["endpoints"] if item["id"] == endpoint_id)


def main() -> None:
    schema = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
    contract = json.loads((HERE / "contract.json").read_text(encoding="utf-8"))
    try:
        import jsonschema
    except ImportError:
        print("schema_validation=SKIPPED (jsonschema not installed)")
    else:
        schema_errors = list(jsonschema.Draft202012Validator(schema).iter_errors(contract))
        assert not schema_errors, [error.message for error in schema_errors]
        print("schema_errors=0")
    result = validate_contract(contract, schema)
    assert result == {
        "status": "PASS",
        "contract": "api_contract_11",
        "version": "1.0.0",
        "endpoint_count": 28,
        "error_count": 15,
        "hero_endpoint_count": 23,
    }, result
    fixture = generate_fixture(contract)
    assert fixture["contract_version"] == "1.0.0"
    assert {item["id"] for item in fixture["endpoints"]} == {item["id"] for item in contract["endpoints"]}
    assert {item["code"] for item in fixture["errors"]} == {item["code"] for item in contract["errors"]}
    assert fixture["geometry"]["geometry_contract_version"] == "dr008a-dr012/v1.0.0"
    assert set(fixture["scenarios"]) == {item["id"] for item in contract["endpoints"]}
    for endpoint_id in ("review_patch", "working_mask_put", "review_commit"):
        assert "stale_revision" in fixture["scenarios"][endpoint_id]
    assert fixture["scenarios"]["analysis_run_get"]["default"]["response"]["data"]["status"] == "SUCCEEDED"
    for endpoint_id in ("prediction_slice_get", "analysis_slice_metrics"):
        response = fixture["scenarios"][endpoint_id]["run_not_succeeded"]["response"]
        assert response["status"] == 409
        assert response["error"]["code"] == "RUN_NOT_SUCCEEDED"
    print("PASS valid contract and schema-derived fixture")

    # Every generated scenario, success or error, passes the same response
    # validator the backend is tested with.
    checked = 0
    for endpoint_id, by_name in fixture["scenarios"].items():
        for name, scenario in by_name.items():
            response = scenario["response"]
            body = response.get("data") if response["status"] < 400 else {"error": response["error"]}
            problems = validate_response(contract, endpoint_id, response["status"], body)
            assert not problems, (endpoint_id, name, problems)
            checked += 1
    print(f"PASS {checked} generated scenarios validate against the contract")

    # The agreed review/finding statuses (V4 lane, 2026-10-01).
    default = {
        endpoint_id: fixture["scenarios"][endpoint_id]["default"]
        for endpoint_id in ("review_create", "review_patch", "finding_create", "findings_list", "finding_patch")
    }
    assert default["review_create"]["response"]["data"]["status"] == "NOT_REVIEWED"
    assert default["review_create"]["request"]["body"]["status"] == "NOT_REVIEWED"
    assert default["review_patch"]["request"]["body"]["status"] == "FLAGGED"
    assert default["review_patch"]["response"]["data"]["status"] == "FLAGGED"
    assert default["finding_create"]["response"]["data"]["status"] == "OPEN"
    assert default["findings_list"]["response"]["data"]["items"][0]["status"] == "OPEN"
    assert default["finding_patch"]["request"]["body"]["status"] == "RESOLVED"
    assert default["finding_patch"]["response"]["data"]["status"] == "RESOLVED"
    inference = fixture["scenarios"]["case_get"]["inference_review"]["response"]["data"]
    assert inference["mode"] == "INFERENCE_REVIEW" and inference["ground_truth_available"] is False
    worst = fixture["scenarios"]["analysis_run_metrics"]["default"]["response"]["data"]["worst_slice_selection"]
    assert worst["rule_id"] == "DR-010" and [s["slice_index"] for s in worst["slices"]] == [44, 12, 60]
    print("PASS review/finding statuses, inference-review case and worst-slice selection in the fixture")

    # The response validator refuses what the contract forbids.
    envelope = {"code": "STALE_REVISION", "message": "m", "request_id": "r", "details": None}
    rejected = [
        ("review_patch", 200, {"review_id": "R", "status": "APPROVED", "revision": 2, "etag": "x"}),
        ("analysis_slice_metrics", 200, {
            "slice_index": 3, "metric_state": "NOT_APPLICABLE", "metric_value": 0.0,
            "reference_mask_id": "A", "prediction_mask_id": "B", "metric_version": "v",
        }),
        ("mri_slice_get", 409, {"error": envelope}),
        ("case_get", 404, {"error": {"code": "CASE_NOT_FOUND", "message": "m"}}),
    ]
    with_unit = dict(fixture["scenarios"]["case_get"]["default"]["response"]["data"])
    with_unit["volume_ml"] = 12.5
    rejected.append(("case_get", 200, with_unit))
    unordered = json.loads(json.dumps(fixture["scenarios"]["analysis_run_metrics"]["default"]["response"]["data"]))
    unordered["worst_slice_selection"]["slices"].reverse()
    rejected.append(("analysis_run_metrics", 200, unordered))
    drifted = dict(fixture["scenarios"]["geometry_get"]["default"]["response"]["data"])
    drifted["geometry_contract_version"] = "dr008a-dr012/v1.0.1"
    rejected.append(("geometry_get", 200, drifted))
    bad_checksum = dict(fixture["scenarios"]["mri_slice_get"]["default"]["response"]["data"])
    bad_checksum["checksum"] = "sha256:not-a-digest"
    rejected.append(("mri_slice_get", 200, bad_checksum))
    for endpoint_id, status, body in rejected:
        assert validate_response(contract, endpoint_id, status, body), (endpoint_id, status, body)
    print(f"PASS the response validator rejects all {len(rejected)} contract violations")

    # List endpoints: an empty page is valid, a missing top-level field is not,
    # and neither is a row that lacks a row field.
    list_ids = [item["id"] for item in contract["endpoints"] if "items" in item["response_fields"]]
    assert sorted(list_ids) == sorted(
        ["case_list", "experiment_list", "experiment_cases", "reviewed_masks_list", "findings_list"]
    )
    for endpoint_id in list_ids:
        empty = fixture["scenarios"][endpoint_id]["empty"]["response"]["data"]
        assert empty["items"] == [] and not validate_response(contract, endpoint_id, 200, empty), endpoint_id
    assert not validate_response(contract, "findings_list", 200, {"items": []})
    assert validate_response(contract, "case_list", 200, {"items": [], "mode": None})  # next_page missing
    row_missing = json.loads(json.dumps(fixture["scenarios"]["reviewed_masks_list"]["default"]["response"]["data"]))
    del row_missing["items"][0]["checksum"]
    assert validate_response(contract, "reviewed_masks_list", 200, row_missing)
    print(f"PASS empty pages validate on all {len(list_ids)} list endpoints; missing top-level and row fields do not")

    broken = copy.deepcopy(contract)
    broken["errors"] = [item for item in broken["errors"] if item["code"] != "GROUND_TRUTH_UNAVAILABLE"]
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "geometry_get")["response_fields"].remove("geometry_contract_version")
    expect_error(broken, "GEOMETRY_CONTRACT_MISSING", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "ground_truth_slice_get")["ground_truth_behavior"] = "AVAILABILITY_DECLARED"
    expect_error(broken, "GROUND_TRUTH_RULE", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "review_patch")["revision_required"] = False
    expect_error(broken, "REVISION_CONTROL_MISSING", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "review_commit")["immutability"] = "READ_ONLY"
    expect_error(broken, "IMMUTABLE_POLICY_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "experiment_compare")["errors"].remove("NON_COMPARABLE_EXPERIMENTS")
    expect_error(broken, "COMPARISON_CONTRACT_MISSING", schema)

    broken = copy.deepcopy(contract)
    broken["fixture_rules"]["handwritten_fixtures_allowed"] = True
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["geometry_contract"]["version"] = None
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["artifact_rules"] = None
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "mri_slice_get")["errors"].remove("SLICE_OUT_OF_RANGE")
    expect_error(broken, "ENDPOINT_RULE_MISSING", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "analysis_run_create")["method"] = "GET"
    expect_error(broken, "ENDPOINT_RULE_MISSING", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "working_mask_put")["request_fields"].remove("geometry_contract_version")
    expect_error(broken, "ENDPOINT_RULE_MISSING", schema)

    # --- v1.0 rules ---------------------------------------------------------
    broken = copy.deepcopy(contract)
    broken["contract_version"] = "DRAFT v0"
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["domain_enums"]["review_status"] = ["IN_PROGRESS", "APPROVED"]
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["domain_enums"]["review_status_transitions"]["FLAGGED"].append("ACCEPTED")
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["enum_bindings"]["review_status"].remove("review_patch.request.status")
    expect_error(broken, "ENUM_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["enum_bindings"]["finding_status"].append("finding_patch.no_such_field")
    expect_error(broken, "ENUM_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "analysis_run_metrics")["response_fields"].remove("worst_slice_selection")
    expect_error(broken, "SELECTION_CONTRACT_MISSING", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "analysis_slice_metrics")["response_fields"].append("worst_slice_selection")
    expect_error(broken, "SELECTION_CONTRACT_MISSING", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "analysis_slice_error")["errors"].remove("GROUND_TRUTH_UNAVAILABLE")
    expect_error(broken, "CASE_CAPABILITY_INVALID", schema)

    broken = copy.deepcopy(contract)
    broken["case_capability"]["ground_truth_dependent_endpoints"].remove("error_reconstruction_get")
    expect_error(broken, "CASE_CAPABILITY_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "review_create")["request_fields"].remove("source_mask_id")
    expect_error(broken, "REVIEW_STATE_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "review_commit")["errors"].remove("INVALID_REVIEW_TRANSITION")
    expect_error(broken, "REVIEW_STATE_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "analysis_run_metrics")["hero_flow"] = False
    expect_error(broken, "HERO_FLOW_INCOMPLETE", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "mri_slice_get")["response_fields"].remove("content_url")
    expect_error(broken, "BINARY_DELIVERY_INVALID", schema)

    broken = copy.deepcopy(contract)
    del endpoint(broken, "findings_list")["row_fields"]
    expect_error(broken, "SCHEMA_INVALID", schema)

    broken = copy.deepcopy(contract)
    endpoint(broken, "case_list")["row_fields"].append("no_such_field")
    expect_error(broken, "LIST_CONTRACT_INVALID", schema)

    with tempfile.TemporaryDirectory(prefix="api-contract-") as temp:
        output = Path(temp) / "generated_fixture.json"
        output.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
        assert json.loads(output.read_text(encoding="utf-8"))["base_path"] == "/api/v1"
    print("api_contract_checks=PASS cases=27")


if __name__ == "__main__":
    main()
