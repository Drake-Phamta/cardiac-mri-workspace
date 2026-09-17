#!/usr/bin/env python3
"""Synthetic checks for API Contract 11 DRAFT v0."""

from __future__ import annotations

import copy
import json
import tempfile
from pathlib import Path

from generate_fixture import generate_fixture
from validate_api_contract import ContractError, validate_contract


HERE = Path(__file__).resolve().parent


def expect_error(contract: dict, code: str) -> None:
    try:
        validate_contract(contract)
    except ContractError as exc:
        assert exc.code == code, (exc.code, str(exc))
    else:
        raise AssertionError(f"expected {code}")


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
    result = validate_contract(contract)
    assert result == {
        "status": "PASS",
        "contract": "api_contract_11",
        "version": "DRAFT v0",
        "endpoint_count": 28,
        "error_count": 15,
    }
    fixture = generate_fixture(contract)
    assert {item["id"] for item in fixture["endpoints"]} == {item["id"] for item in contract["endpoints"]}
    assert {item["code"] for item in fixture["errors"]} == {item["code"] for item in contract["errors"]}
    assert fixture["geometry"]["geometry_contract_version"] == "GEOM_CANONICAL_V1"
    print("PASS valid contract and schema-derived fixture")

    broken = copy.deepcopy(contract)
    broken["errors"] = [item for item in broken["errors"] if item["code"] != "GROUND_TRUTH_UNAVAILABLE"]
    expect_error(broken, "ERROR_CATALOG_INCOMPLETE")

    broken = copy.deepcopy(contract)
    geometry_endpoint = next(item for item in broken["endpoints"] if item["id"] == "geometry_get")
    geometry_endpoint["response_fields"].remove("geometry_contract_version")
    expect_error(broken, "GEOMETRY_CONTRACT_MISSING")

    broken = copy.deepcopy(contract)
    gt_endpoint = next(item for item in broken["endpoints"] if item["id"] == "ground_truth_slice_get")
    gt_endpoint["ground_truth_behavior"] = "AVAILABILITY_DECLARED"
    expect_error(broken, "GROUND_TRUTH_RULE")

    broken = copy.deepcopy(contract)
    review_endpoint = next(item for item in broken["endpoints"] if item["id"] == "review_patch")
    review_endpoint["revision_required"] = False
    expect_error(broken, "REVISION_CONTROL_MISSING")

    broken = copy.deepcopy(contract)
    commit_endpoint = next(item for item in broken["endpoints"] if item["id"] == "review_commit")
    commit_endpoint["immutability"] = "READ_ONLY"
    expect_error(broken, "IMMUTABLE_POLICY_INVALID")

    broken = copy.deepcopy(contract)
    compare_endpoint = next(item for item in broken["endpoints"] if item["id"] == "experiment_compare")
    compare_endpoint["errors"].remove("NON_COMPARABLE_EXPERIMENTS")
    expect_error(broken, "COMPARISON_CONTRACT_MISSING")

    broken = copy.deepcopy(contract)
    broken["fixture_rules"]["handwritten_fixtures_allowed"] = True
    expect_error(broken, "FIXTURE_POLICY_INVALID")

    with tempfile.TemporaryDirectory(prefix="api-contract-") as temp:
        output = Path(temp) / "generated_fixture.json"
        output.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
        assert json.loads(output.read_text(encoding="utf-8"))["base_path"] == "/api/v1"
    print("api_contract_checks=PASS cases=7")


if __name__ == "__main__":
    main()
