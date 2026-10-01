#!/usr/bin/env python3
"""Validate the semantic rules of API Contract 11 DRAFT v0."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


class ContractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _fail(code: str, message: str) -> None:
    raise ContractError(code, message)


EXPECTED_ERRORS = {
    "CASE_NOT_FOUND", "SLICE_OUT_OF_RANGE", "ARTIFACT_NOT_FOUND",
    "GROUND_TRUTH_UNAVAILABLE", "INVALID_REVIEW_TRANSITION", "STALE_REVISION",
    "IMMUTABLE_ARTIFACT", "GEOMETRY_NOT_VALIDATED", "GEOMETRY_MISMATCH",
    "RUN_NOT_DEPLOYABLE", "RUN_NOT_SUCCEEDED", "NON_COMPARABLE_EXPERIMENTS",
    "ANALYSIS_FAILED", "VALIDATION_ERROR", "UNAUTHORIZED",
}
GEOMETRY_FIELDS = {
    "geometry_contract_version", "geometry_validation_status", "shape",
    "index_convention", "spacing", "origin", "direction",
}
REQUIRED_ENDPOINTS = {
    "study_get", "case_list", "case_get", "mri_slice_get", "ground_truth_slice_get",
    "geometry_get", "experiment_list", "experiment_get", "experiment_metrics",
    "experiment_cases", "experiment_compare", "analysis_run_create", "analysis_run_get",
    "analysis_run_metrics", "analysis_slice_metrics", "analysis_slice_error",
    "prediction_slice_get", "reconstruction_get", "error_reconstruction_get",
    "review_create", "review_patch", "working_mask_put", "review_commit",
    "reviewed_masks_list", "reviewed_mask_slice_get", "finding_create", "findings_list",
    "finding_patch",
}
EXPECTED_GEOMETRY_VERSION = "dr008a-dr012/v1.0.0"


def _default_schema() -> dict:
    try:
        return json.loads(Path(__file__).with_name("schema.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail("SCHEMA_INVALID", f"cannot load formal API schema: {exc}")


def _validate_against_schema(contract: object, schema: dict) -> None:
    if not isinstance(contract, dict):
        _fail("SCHEMA_INVALID", "contract must be a JSON object")
    try:
        import jsonschema
    except ImportError:
        _fail("SCHEMA_VALIDATION_UNAVAILABLE", "jsonschema is required to validate API Contract 11")
    try:
        validator = jsonschema.Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(contract), key=lambda error: list(error.path))
    except Exception as exc:
        _fail("SCHEMA_INVALID", f"formal schema could not be applied: {exc}")
    if errors:
        error = errors[0]
        location = ".".join(str(part) for part in error.path) or "contract"
        _fail("SCHEMA_INVALID", f"{location}: {error.message}")


def _unique(values: list[str], label: str) -> None:
    if len(values) != len(set(values)):
        _fail("SCHEMA_INVALID", f"{label} contains duplicates")


def validate_contract(contract: dict, schema: dict | None = None) -> dict:
    _validate_against_schema(contract, schema if schema is not None else _default_schema())
    if contract.get("contract") != "api_contract_11" or contract.get("contract_version") != "DRAFT v0":
        _fail("SCHEMA_INVALID", "contract must be api_contract_11 DRAFT v0")
    if contract.get("base_path") != "/api/v1":
        _fail("SCHEMA_INVALID", "base_path must be /api/v1")

    geometry = contract.get("geometry_contract")
    if not isinstance(geometry, dict):
        _fail("GEOMETRY_CONTRACT_MISSING", "geometry contract is required")
    if geometry.get("version") != EXPECTED_GEOMETRY_VERSION:
        _fail("GEOMETRY_CONTRACT_MISSING", f"geometry contract version must be {EXPECTED_GEOMETRY_VERSION}")
    if geometry.get("validation_status_field") != "geometry_validation_status":
        _fail("GEOMETRY_CONTRACT_MISSING", "geometry validation status field is missing")
    if set(geometry.get("required_response_fields", [])) != GEOMETRY_FIELDS:
        _fail("GEOMETRY_CONTRACT_MISSING", "geometry response field set is incomplete")
    if geometry.get("invalid_geometry_error") != "GEOMETRY_NOT_VALIDATED":
        _fail("GEOMETRY_CONTRACT_MISSING", "invalid geometry must use GEOMETRY_NOT_VALIDATED")

    errors = contract.get("errors")
    if not isinstance(errors, list):
        _fail("ERROR_CATALOG_INCOMPLETE", "error catalog is required")
    error_codes = [item.get("code") for item in errors if isinstance(item, dict)]
    _unique(error_codes, "error catalog")
    if set(error_codes) != EXPECTED_ERRORS:
        _fail("ERROR_CATALOG_INCOMPLETE", f"error catalog must contain exactly the 15 §10 codes; got {sorted(set(error_codes))}")

    endpoints = contract.get("endpoints")
    if not isinstance(endpoints, list):
        _fail("ENDPOINT_CATALOG_INCOMPLETE", "endpoint catalog is required")
    endpoint_ids = [item.get("id") for item in endpoints if isinstance(item, dict)]
    _unique(endpoint_ids, "endpoint catalog")
    if set(endpoint_ids) != REQUIRED_ENDPOINTS:
        missing = sorted(REQUIRED_ENDPOINTS - set(endpoint_ids))
        extra = sorted(set(endpoint_ids) - REQUIRED_ENDPOINTS)
        _fail("ENDPOINT_CATALOG_INCOMPLETE", f"endpoint catalog mismatch; missing={missing}, extra={extra}")
    known_errors = set(error_codes)
    revision_controlled_endpoints = {"review_patch", "working_mask_put", "review_commit", "finding_patch"}

    for endpoint in endpoints:
        if not isinstance(endpoint, dict):
            _fail("SCHEMA_INVALID", "each endpoint must be an object")
        endpoint_id = endpoint["id"]
        endpoint_errors = endpoint.get("errors", [])
        if not set(endpoint_errors) <= known_errors:
            _fail("SCHEMA_INVALID", f"{endpoint_id}: references an unknown error code")
        fields = set(endpoint.get("response_fields", []))
        if endpoint_id in revision_controlled_endpoints and endpoint.get("revision_required") is not True:
            _fail("REVISION_CONTROL_MISSING", f"{endpoint_id}: existing-resource writes require a revision")
        if endpoint.get("geometry_response"):
            if not GEOMETRY_FIELDS <= fields:
                _fail("GEOMETRY_CONTRACT_MISSING", f"{endpoint_id}: geometry response omits required fields")
        if endpoint_id == "ground_truth_slice_get":
            if endpoint.get("ground_truth_behavior") != "ERROR_IF_ABSENT" or "GROUND_TRUTH_UNAVAILABLE" not in endpoint_errors:
                _fail("GROUND_TRUTH_RULE", "ground-truth endpoint must return explicit unavailable error")
            if endpoint.get("ground_truth_behavior") == "ZERO_PLACEHOLDER":
                _fail("GROUND_TRUTH_RULE", "ground-truth endpoint must not promise an all-zero placeholder")
        if endpoint_id == "experiment_compare":
            required_compare = {"comparable", "compatibility_reason", "common_evaluation_population", "metric_version", "prediction_variant"}
            if not required_compare <= fields or "NON_COMPARABLE_EXPERIMENTS" not in endpoint_errors:
                _fail("COMPARISON_CONTRACT_MISSING", "experiment compare must expose comparability and its reason")
        if endpoint.get("revision_required"):
            if endpoint.get("method") not in {"PATCH", "PUT"} and endpoint_id != "review_commit":
                _fail("REVISION_CONTROL_MISSING", f"{endpoint_id}: invalid revision-controlled method")
            request_fields = set(endpoint.get("request_fields", []))
            if "expected_revision" not in request_fields or "STALE_REVISION" not in endpoint_errors:
                _fail("REVISION_CONTROL_MISSING", f"{endpoint_id}: expected_revision/STALE_REVISION missing")
        if endpoint.get("artifact_write"):
            if endpoint.get("immutability") not in {"WORKING_ONLY", "NEW_VERSION"}:
                _fail("IMMUTABLE_POLICY_INVALID", f"{endpoint_id}: artifact write must be working-only or new-version")
            if "IMMUTABLE_ARTIFACT" not in endpoint_errors and endpoint.get("immutability") == "NEW_VERSION":
                _fail("IMMUTABLE_POLICY_INVALID", f"{endpoint_id}: immutable artifact error is missing")

        required_method = {
            "case_get": "GET",
            "mri_slice_get": "GET",
            "geometry_get": "GET",
            "analysis_run_create": "POST",
            "working_mask_put": "PUT",
        }.get(endpoint_id)
        if required_method and endpoint.get("method") != required_method:
            _fail("ENDPOINT_RULE_MISSING", f"{endpoint_id}: method must be {required_method}")
        path = endpoint.get("path", "")
        if "{case_id}" in path and "CASE_NOT_FOUND" not in endpoint_errors:
            _fail("ENDPOINT_RULE_MISSING", f"{endpoint_id}: case-scoped endpoint must expose CASE_NOT_FOUND")
        if "{slice_index}" in path and "SLICE_OUT_OF_RANGE" not in endpoint_errors:
            _fail("ENDPOINT_RULE_MISSING", f"{endpoint_id}: slice endpoint must expose SLICE_OUT_OF_RANGE")
        if endpoint.get("geometry_response") and "GEOMETRY_NOT_VALIDATED" not in endpoint_errors:
            _fail("ENDPOINT_RULE_MISSING", f"{endpoint_id}: geometry response must expose GEOMETRY_NOT_VALIDATED")
        if endpoint_id == "working_mask_put":
            request_fields = set(endpoint.get("request_fields", []))
            required_geometry_request = {"geometry_contract_version", "geometry_validation_status"}
            if not required_geometry_request <= request_fields:
                _fail("ENDPOINT_RULE_MISSING", "working_mask_put: request must carry geometry version and validation status")

    artifact_rules = contract.get("artifact_rules")
    if not isinstance(artifact_rules, dict):
        _fail("IMMUTABLE_POLICY_INVALID", "artifact_rules must be an object")
    if artifact_rules.get("ground_truth_missing_behavior") != "GROUND_TRUTH_UNAVAILABLE":
        _fail("GROUND_TRUTH_RULE", "artifact rule must use GROUND_TRUTH_UNAVAILABLE")
    if artifact_rules.get("raw_prediction_kind") in artifact_rules.get("never_overwrite_kinds", []):
        pass
    else:
        _fail("IMMUTABLE_POLICY_INVALID", "raw predictions must be in the never-overwrite set")
    if artifact_rules.get("reviewed_mask_kind") not in artifact_rules.get("never_overwrite_kinds", []):
        _fail("IMMUTABLE_POLICY_INVALID", "reviewed masks must be in the never-overwrite set")

    revision = contract.get("revision_rules", {})
    if revision != {
        "expected_revision_field": "expected_revision",
        "etag_header": "ETag",
        "stale_error_code": "STALE_REVISION",
        "mutating_methods": ["PATCH", "PUT", "POST_COMMIT"],
        "last_write_wins_allowed": False,
    }:
        _fail("REVISION_CONTROL_MISSING", "revision rules must reject stale last-write-wins updates")
    fixtures = contract.get("fixture_rules", {})
    if fixtures != {
        "generated_from_schema": True,
        "handwritten_fixtures_allowed": False,
        "generator": "generate_fixture.py",
    }:
        _fail("FIXTURE_POLICY_INVALID", "fixtures must be generated from the accepted schema")
    return {
        "status": "PASS",
        "contract": contract["contract"],
        "version": contract["contract_version"],
        "endpoint_count": len(endpoints),
        "error_count": len(errors),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate API Contract 11 DRAFT v0")
    parser.add_argument("--contract", dest="contract", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        contract = json.loads(args.contract.read_text(encoding="utf-8"))
        schema = json.loads(args.contract.with_name("schema.json").read_text(encoding="utf-8"))
        result = validate_contract(contract, schema)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL [INPUT_INVALID] {exc}")
        return 2
    except ContractError as exc:
        print(f"FAIL [{exc.code}] {exc}")
        return 2
    print(f"PASS: API Contract 11 {result['version']}; {result['endpoint_count']} endpoints, {result['error_count']} errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
