#!/usr/bin/env python3
"""Validate API Contract 11 v1.0.0, and validate responses against it.

Two entry points:

- ``validate_contract(contract, schema)`` checks the contract document itself
  (formal Draft 2020-12 schema first, then the semantic rules below);
- ``validate_response(contract, endpoint_id, http_status, body)`` checks one
  response a server (or the fixture generator) produced for one endpoint, and
  returns the list of problems. The backend tests and test_api_contract.py use
  the same function, so "validated against the contract" means one thing.

Python 3.9 compatible on purpose: the backend host runs 3.9.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set


class ContractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _fail(code: str, message: str) -> None:
    raise ContractError(code, message)


EXPECTED_VERSION = "1.1.0"
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
# The leader's hero-flow subset (DEP-04 / INT-11, 2026-10-01): study, cases,
# case, slice image, masks per variant, runs + metrics incl. per-slice and the
# worst slice, mesh / error mesh, reviews + reviewed-mask versions, findings.
REQUIRED_HERO_ENDPOINTS = {
    "study_get", "case_list", "case_get", "geometry_get", "mri_slice_get",
    "ground_truth_slice_get", "prediction_slice_get", "analysis_run_get",
    "analysis_run_metrics", "analysis_slice_metrics", "experiment_metrics",
    "experiment_cases", "reconstruction_get", "error_reconstruction_get",
    "review_create", "review_patch", "working_mask_put", "review_commit",
    "reviewed_masks_list", "reviewed_mask_slice_get", "finding_create",
    "findings_list", "finding_patch",
}
EXPECTED_GEOMETRY_VERSION = "dr008a-dr012/v1.0.0"
REVIEW_STATES = ["NOT_REVIEWED", "ACCEPTED", "FLAGGED", "CORRECTED"]
REVIEW_TRANSITIONS = {
    "NOT_REVIEWED": ["ACCEPTED", "FLAGGED", "CORRECTED"],
    "FLAGGED": ["CORRECTED"],
    "ACCEPTED": ["FLAGGED", "CORRECTED"],
}
FINDING_STATES = ["OPEN", "RESOLVED"]
REQUIRED_ENUM_BINDINGS = {
    "review_status": {
        "review_create.status", "review_create.request.status",
        "review_patch.status", "review_patch.request.status",
    },
    "finding_status": {
        "finding_create.status", "findings_list.status",
        "finding_patch.status", "finding_patch.request.status",
    },
    "case_mode": {"case_get.mode", "case_list.mode_capability"},
    "case_result_status": {"experiment_cases.status"},
}
CHECKSUM = re.compile(r"^sha256:[0-9a-f]{64}$")
# Any key that names a physical unit. While geometry is not validated the API
# serves no mm/mL value at all (geometry_contract.unvalidated_geometry_rule).
PHYSICAL_KEY = re.compile(r"(^|_)(mm|ml|mm2|mm3|millimet\w*|millilit\w*|cm|cm3)($|_)", re.IGNORECASE)
TOKEN = re.compile(r"\{([a-z_][a-z0-9_]*)\}", re.IGNORECASE)


def _default_schema() -> dict:
    try:
        return json.loads(Path(__file__).with_name("schema.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail("SCHEMA_INVALID", f"cannot load formal API schema: {exc}")
    raise AssertionError("unreachable")


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


def _unique(values: List[str], label: str) -> None:
    if len(values) != len(set(values)):
        _fail("SCHEMA_INVALID", f"{label} contains duplicates")


def path_tokens(path: str) -> List[str]:
    """Every {token} in an endpoint path, path part and query part."""
    return TOKEN.findall(path)


def _resolve_ref(ref: str, endpoints_by_id: Dict[str, dict]) -> bool:
    """True when a binding reference names a real field, request field or token."""
    owner, _, rest = ref.partition(".")
    if owner == "*":
        return any(rest in item.get("response_fields", []) for item in endpoints_by_id.values())
    endpoint = endpoints_by_id.get(owner)
    if endpoint is None:
        return False
    if rest.startswith("request."):
        return rest[len("request."):] in endpoint.get("request_fields", [])
    if rest.startswith("param."):
        return rest[len("param."):] in path_tokens(endpoint["path"])
    return rest in endpoint.get("response_fields", [])


def validate_contract(contract: dict, schema: Optional[dict] = None) -> dict:
    _validate_against_schema(contract, schema if schema is not None else _default_schema())
    if contract.get("contract") != "api_contract_11" or contract.get("contract_version") != EXPECTED_VERSION:
        _fail("SCHEMA_INVALID", f"contract must be api_contract_11 {EXPECTED_VERSION}")
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
    endpoints_by_id = {item["id"]: item for item in endpoints}
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
        # List endpoints say which fields live on each item; the rest are
        # top-level. An empty page (items: []) is then valid, because row
        # fields are vacuously present and top-level fields are still checked.
        row_fields = endpoint.get("row_fields")
        if "items" in fields and not row_fields:
            _fail("LIST_CONTRACT_INVALID", f"{endpoint_id}: a list endpoint must declare row_fields")
        if row_fields is not None:
            if "items" not in fields:
                _fail("LIST_CONTRACT_INVALID", f"{endpoint_id}: row_fields on an endpoint without items")
            if not set(row_fields) <= fields - {"items"}:
                _fail("LIST_CONTRACT_INVALID", f"{endpoint_id}: row_fields must be declared response_fields")

    _validate_v1_rules(contract, endpoints_by_id)

    artifact_rules = contract.get("artifact_rules")
    if not isinstance(artifact_rules, dict):
        _fail("IMMUTABLE_POLICY_INVALID", "artifact_rules must be an object")
    if artifact_rules.get("ground_truth_missing_behavior") != "GROUND_TRUTH_UNAVAILABLE":
        _fail("GROUND_TRUTH_RULE", "artifact rule must use GROUND_TRUTH_UNAVAILABLE")
    if artifact_rules.get("raw_prediction_kind") not in artifact_rules.get("never_overwrite_kinds", []):
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
        "hero_endpoint_count": sum(1 for item in endpoints if item.get("hero_flow") is True),
    }


def _validate_v1_rules(contract: dict, endpoints_by_id: Dict[str, dict]) -> None:
    """The v1.0 additions: enums, review states, case capability, selection, hero."""
    enums = contract["domain_enums"]
    if enums.get("review_status") != REVIEW_STATES:
        _fail("REVIEW_STATE_INVALID", f"review_status must be exactly {REVIEW_STATES} (FR-REV-001)")
    if enums.get("review_status_transitions") != REVIEW_TRANSITIONS:
        _fail("REVIEW_STATE_INVALID", "review_status_transitions must be exactly the 05 section 6 transitions")
    if enums.get("finding_status") != FINDING_STATES:
        _fail("ENUM_INVALID", f"finding_status must be exactly {FINDING_STATES}")
    for source, targets in enums["review_status_transitions"].items():
        if source not in REVIEW_STATES or not set(targets) <= set(REVIEW_STATES) or source in targets:
            _fail("REVIEW_STATE_INVALID", f"transition {source} -> {targets} leaves the state set or loops")

    bindings = contract["enum_bindings"]
    for enum_name, refs in bindings.items():
        values = enums.get(enum_name)
        if not isinstance(values, list):
            _fail("ENUM_INVALID", f"enum_bindings names {enum_name}, which is not a domain_enums list")
        for ref in refs:
            if not _resolve_ref(ref, endpoints_by_id):
                _fail("ENUM_INVALID", f"enum binding {enum_name} -> {ref} does not name a contract field")
    for enum_name, required_refs in REQUIRED_ENUM_BINDINGS.items():
        missing = required_refs - set(bindings.get(enum_name, []))
        if missing:
            _fail("ENUM_INVALID", f"{enum_name} must be enforced on {sorted(missing)}")

    review = contract["review_rules"]
    review_endpoints = ("review_create", "review_patch", "review_commit")
    for endpoint_id in review_endpoints:
        if review["invalid_transition_error"] not in endpoints_by_id[endpoint_id]["errors"]:
            _fail("REVIEW_STATE_INVALID", f"{endpoint_id} must expose INVALID_REVIEW_TRANSITION")
    if not set(review["create_allowed_states"]) <= set(REVIEW_STATES):
        _fail("REVIEW_STATE_INVALID", "create_allowed_states leaves the review state set")
    if review["commit_result_state"] in enums["review_status_transitions"]:
        _fail("REVIEW_STATE_INVALID", "the commit result state must have no outgoing PATCH transition")
    for field in review["scope_fields"]:
        if field != "run_id" and field not in endpoints_by_id["review_create"].get("request_fields", []):
            _fail("REVIEW_STATE_INVALID", f"review_create must carry the review scope field {field} (DR-009)")

    capability = contract["case_capability"]
    gt_dependent = {
        endpoint_id for endpoint_id, item in endpoints_by_id.items()
        if item.get("ground_truth_behavior") in {"REQUIRED", "ERROR_IF_ABSENT"}
    }
    if set(capability["ground_truth_dependent_endpoints"]) != gt_dependent:
        _fail("CASE_CAPABILITY_INVALID", f"ground_truth_dependent_endpoints must be exactly {sorted(gt_dependent)}")
    for endpoint_id in gt_dependent:
        if "GROUND_TRUTH_UNAVAILABLE" not in endpoints_by_id[endpoint_id]["errors"]:
            _fail("CASE_CAPABILITY_INVALID", f"{endpoint_id} must expose GROUND_TRUTH_UNAVAILABLE for INFERENCE_REVIEW cases")
    if not {"mode", "ground_truth_available"} <= set(endpoints_by_id["case_get"]["response_fields"]):
        _fail("CASE_CAPABILITY_INVALID", "case_get must state mode and ground_truth_available")
    if not {"case_id", "mode_capability", "ground_truth_available"} <= set(endpoints_by_id["case_list"].get("row_fields", [])):
        _fail("CASE_CAPABILITY_INVALID", "case_list rows must state case_id, mode_capability and ground_truth_available")
    if set(capability["modes"]) != set(enums["case_mode"]):
        _fail("CASE_CAPABILITY_INVALID", "case_capability.modes must cover exactly domain_enums.case_mode")

    selection = contract["selection_rules"]["worst_slice_selection"]
    carrier = endpoints_by_id[selection["endpoint"]]
    if selection["field"] not in carrier["response_fields"]:
        _fail("SELECTION_CONTRACT_MISSING", "analysis_run_metrics must return worst_slice_selection (DR-010a option b)")
    carriers = [
        endpoint_id for endpoint_id, item in endpoints_by_id.items()
        if "worst_slice_selection" in item.get("response_fields", [])
    ]
    if carriers != [selection["endpoint"]]:
        _fail("SELECTION_CONTRACT_MISSING", f"exactly one endpoint carries worst_slice_selection; got {carriers}")

    outliers = contract["selection_rules"]["outlier_selection"]
    outlier_carriers = [
        endpoint_id for endpoint_id, item in endpoints_by_id.items()
        if "outlier_selection" in item.get("response_fields", [])
    ]
    if outlier_carriers != [outliers["endpoint"]] or "outlier_selection" in endpoints_by_id[outliers["endpoint"]].get("row_fields", []):
        _fail("SELECTION_CONTRACT_MISSING", f"experiment_cases alone carries a top-level outlier_selection (DR-010); got {outlier_carriers}")
    finding_request = endpoints_by_id["finding_create"].get("request_fields", [])
    if "prediction_variant" not in finding_request or "prediction_variant" not in contract["field_shapes"]["evidence"]:
        _fail("ENUM_INVALID", "a finding anchor carries an optional prediction_variant (request and evidence)")

    metric_fields = contract["metric_rules"]["case_metric_fields"]
    if contract["field_shapes"].get("metric_values") != metric_fields:
        _fail("METRIC_CONTRACT_INVALID", "field_shapes.metric_values must equal metric_rules.case_metric_fields")
    shapes = contract["field_shapes"]
    for shape_name, refs in contract["shape_bindings"].items():
        if shape_name not in shapes:
            _fail("SCHEMA_INVALID", f"shape_bindings names unknown shape {shape_name}")
        for ref in refs:
            if not _resolve_ref(ref, endpoints_by_id):
                _fail("SCHEMA_INVALID", f"shape binding {shape_name} -> {ref} does not name a contract field")

    delivery = contract["binary_delivery"]
    for endpoint_id in delivery["applies_to"]:
        fields = set(endpoints_by_id[endpoint_id]["response_fields"])
        if not {"checksum", "content_url", "media_type"} <= fields:
            _fail("BINARY_DELIVERY_INVALID", f"{endpoint_id} must carry checksum, content_url and media_type")
    binary_endpoints = {
        endpoint_id for endpoint_id, item in endpoints_by_id.items() if item["response_kind"] == "BINARY"
    }
    if not binary_endpoints <= set(delivery["applies_to"]):
        _fail("BINARY_DELIVERY_INVALID", "every BINARY endpoint must follow binary_delivery")

    not_hero = sorted(
        endpoint_id for endpoint_id in REQUIRED_HERO_ENDPOINTS
        if endpoints_by_id[endpoint_id].get("hero_flow") is not True
    )
    if not_hero:
        _fail("HERO_FLOW_INCOMPLETE", f"hero-flow endpoints not marked: {not_hero}")


# ---------------------------------------------------------------------------
# Response validation — one function for the generator, the backend and CI.
# ---------------------------------------------------------------------------

def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _walk_keys(value: Any, prefix: str = "") -> Iterable[str]:
    if isinstance(value, dict):
        for key, inner in value.items():
            yield f"{prefix}{key}"
            yield from _walk_keys(inner, f"{prefix}{key}.")
    elif isinstance(value, list):
        for inner in value:
            yield from _walk_keys(inner, prefix)


def _field_values(body: dict, field: str, row_fields: Set[str]) -> List[Any]:
    """Every value of a response field: each row for row fields, else top level."""
    if field in row_fields:
        return [row[field] for row in body.get("items") or [] if isinstance(row, dict) and field in row]
    return [body[field]] if field in body else []


def _check_geometry(contract: dict, at: str, data: dict, problems: List[str]) -> None:
    geometry = contract["geometry_contract"]
    for field in geometry["required_response_fields"]:
        if field not in data:
            problems.append(f"{at}: missing geometry field {field}")
    if "geometry_contract_version" in data and data["geometry_contract_version"] != geometry["version"]:
        problems.append(f"{at}: geometry_contract_version {data['geometry_contract_version']!r} is not {geometry['version']}")
    if "index_convention" in data and data["index_convention"] != geometry["index_convention"]:
        problems.append(f"{at}: index_convention {data['index_convention']!r} is not {geometry['index_convention']!r}")
    shape = data.get("shape")
    if "shape" in data and not (isinstance(shape, list) and len(shape) == 3 and all(_is_int(v) and v > 0 for v in shape)):
        problems.append(f"{at}: shape must be three positive integers [Nx, Ny, Nz]")
    for field, length in (("spacing", 3), ("origin", 3), ("direction", 9)):
        value = data.get(field)
        if field in data and not (isinstance(value, list) and len(value) == length and all(_is_number(v) for v in value)):
            problems.append(f"{at}: {field} must be {length} numbers")


def _check_worst_slice(contract: dict, at: str, block: Any, problems: List[str]) -> None:
    rule = contract["selection_rules"]["worst_slice_selection"]
    if not isinstance(block, dict):
        problems.append(f"{at}: worst_slice_selection must be an object")
        return
    for field in rule["block_fields"]:
        if field not in block:
            problems.append(f"{at}: worst_slice_selection is missing {field}")
    if block.get("rule_id") != rule["rule_id"]:
        problems.append(f"{at}: worst_slice_selection.rule_id must be {rule['rule_id']}")
    if block.get("selection_version") != rule["selection_version"]:
        problems.append(f"{at}: worst_slice_selection.selection_version must be {rule['selection_version']}")
    slices = block.get("slices")
    if not isinstance(slices, list):
        problems.append(f"{at}: worst_slice_selection.slices must be a list")
        return
    keys = []
    for position, item in enumerate(slices):
        where = f"{at}: worst_slice_selection.slices[{position}]"
        if not isinstance(item, dict) or set(item) != set(rule["slice_fields"]):
            problems.append(f"{where} must have exactly {rule['slice_fields']}")
            return
        item_ok = True
        if not (_is_int(item["slice_index"]) and item["slice_index"] >= 0):
            problems.append(f"{where}.slice_index must be a non-negative integer")
            item_ok = False
        if not (_is_number(item["dice"]) and 0.0 <= item["dice"] <= 1.0):
            problems.append(f"{where}.dice must be a number in [0, 1]")
            item_ok = False
        for field in ("false_positives", "false_negatives"):
            if not (_is_int(item[field]) and item[field] >= 0):
                problems.append(f"{where}.{field} must be a non-negative integer count")
                item_ok = False
        if not item_ok:
            return
        keys.append((item["dice"], -(item["false_positives"] + item["false_negatives"]), item["slice_index"]))
    # The SERVER ranks (DR-010); a response served out of order is invalid.
    if keys and keys != sorted(keys):
        problems.append(f"{at}: worst_slice_selection.slices are not in DR-010 order")
    if len({key[2] for key in keys}) != len(keys):
        problems.append(f"{at}: worst_slice_selection lists a slice twice")


def _check_outliers(contract: dict, at: str, block: Any, rows: List[Any], problems: List[str]) -> None:
    rule = contract["selection_rules"]["outlier_selection"]
    if not isinstance(block, dict) or set(block) != set(rule["block_fields"]):
        problems.append(f"{at}: outlier_selection must have exactly {rule['block_fields']}")
        return
    if block["rule_id"] != rule["rule_id"] or block["selection_version"] != rule["selection_version"]:
        problems.append(f"{at}: outlier_selection must be {rule['rule_id']} {rule['selection_version']}")
    if block["metric_name"] != rule["metric_name"]:
        problems.append(f"{at}: outlier_selection.metric_name must be {rule['metric_name']}")
    if block["prediction_variant"] not in contract["domain_enums"]["prediction_variant"]:
        problems.append(f"{at}: outlier_selection.prediction_variant is not a prediction variant")
    cases = block["cases"]
    if not isinstance(cases, list) or len(cases) > rule["cardinality"]:
        problems.append(f"{at}: outlier_selection.cases must be a list of at most {rule['cardinality']}")
        return
    succeeded = {row.get("case_id") for row in rows if isinstance(row, dict) and row.get("status") == "SUCCEEDED"}
    keys = []
    for position, item in enumerate(cases):
        where = f"{at}: outlier_selection.cases[{position}]"
        if not isinstance(item, dict) or set(item) != set(rule["case_fields"]):
            problems.append(f"{where} must have exactly {rule['case_fields']}")
            return
        if not (_is_number(item["metric_value"]) and 0.0 <= item["metric_value"] <= 1.0):
            problems.append(f"{where}.metric_value must be a Dice in [0, 1]")
            return
        if not all(_is_int(item[field]) and item[field] >= 0 for field in ("false_positives", "false_negatives")):
            problems.append(f"{where} false_positives/false_negatives must be non-negative counts")
            return
        if rows and item["case_id"] not in succeeded:
            problems.append(f"{where}: {item['case_id']} is not a SUCCEEDED row (WITHHELD, FAILED and EXCLUDED never qualify)")
        keys.append((item["metric_value"], -(item["false_positives"] + item["false_negatives"]), str(item["case_id"])))
    if keys != sorted(keys):
        problems.append(f"{at}: outlier_selection.cases are not in DR-010 order")


def _check_metric_values(at: str, value: Any, problems: List[str]) -> None:
    if not isinstance(value, dict):
        problems.append(f"{at}: metric_values must be an object")
        return
    for key in ("dice", "iou"):
        number = value.get(key)
        if not (_is_number(number) and 0.0 <= number <= 1.0):
            problems.append(f"{at}: metric_values.{key} must be a number in [0, 1]")
    for key in ("false_positives", "false_negatives"):
        count = value.get(key)
        if not (_is_int(count) and count >= 0):
            problems.append(f"{at}: metric_values.{key} must be a non-negative voxel count")
    rve = value.get("relative_volume_error")
    if rve is not None and not _is_number(rve):
        problems.append(f"{at}: metric_values.relative_volume_error must be a number or null")


def _check_summary(contract: dict, at: str, summary: Any, problems: List[str]) -> None:
    metrics = contract["metric_rules"]["case_metric_fields"]
    statistics = contract["metric_rules"]["summary_statistics"]
    if not isinstance(summary, dict) or set(summary) != set(metrics):
        problems.append(f"{at}: a metric summary maps exactly {metrics}")
        return
    for metric, stats in summary.items():
        if not isinstance(stats, dict) or set(stats) != set(statistics):
            problems.append(f"{at}: summary of {metric} must have exactly {statistics}")
            continue
        bad = [key for key, number in stats.items() if number is not None and not _is_number(number)]
        if bad:
            problems.append(f"{at}: summary of {metric} has non-numeric {bad}")
        if stats["n"] is not None and not (_is_int(stats["n"]) and stats["n"] >= 0):
            problems.append(f"{at}: summary of {metric}.n must be a count")


def validate_response(contract: dict, endpoint_id: str, http_status: int, body: Any) -> List[str]:
    """Return every way one response breaks the contract (empty list = valid)."""
    endpoints = {item["id"]: item for item in contract["endpoints"]}
    errors = {item["code"]: item for item in contract["errors"]}
    endpoint = endpoints.get(endpoint_id)
    at = endpoint_id
    if endpoint is None:
        return [f"{at}: not a contract endpoint"]
    problems: List[str] = []

    if http_status >= 400:
        envelope = body.get("error") if isinstance(body, dict) else None
        if not isinstance(envelope, dict) or set(envelope) != {"code", "message", "request_id", "details"}:
            return [f"{at}: an error response must be {{error: {{code, message, request_id, details}}}}"]
        code = envelope["code"]
        if code not in endpoint["errors"]:
            problems.append(f"{at}: answered {code}, which the endpoint does not list")
        elif errors[code]["http_status"] != http_status:
            problems.append(f"{at}: {code} must be HTTP {errors[code]['http_status']}, got {http_status}")
        if not isinstance(envelope["message"], str) or not envelope["message"]:
            problems.append(f"{at}: error message must be a non-empty string")
        return problems

    if not isinstance(body, dict):
        return [f"{at}: a success response must be a JSON object"]
    fields = endpoint.get("response_fields", [])
    row_fields = set(endpoint.get("row_fields", []))
    is_list = "items" in fields
    if is_list and not isinstance(body.get("items"), list):
        problems.append(f"{at}: items must be a list")
    # Top-level fields must be present at the top level; row fields on every
    # row, which an empty page satisfies vacuously.
    for field in fields:
        if field == "items" or field in row_fields:
            continue
        if field not in body:
            problems.append(f"{at}: missing response field {field}")
    if is_list and isinstance(body.get("items"), list):
        for position, row in enumerate(body["items"]):
            missing = sorted(row_fields - set(row)) if isinstance(row, dict) else sorted(row_fields)
            if missing:
                problems.append(f"{at}: items[{position}] is missing row fields {missing}")

    if endpoint.get("geometry_response"):
        _check_geometry(contract, at, body, problems)
    for value in _field_values(body, "geometry_validation_status", row_fields):
        if value not in contract["domain_enums"]["geometry_validation_status"]:
            problems.append(f"{at}: geometry_validation_status {value!r} is not in the enum")

    for enum_name, refs in contract["enum_bindings"].items():
        allowed = contract["domain_enums"][enum_name]
        for ref in refs:
            owner, _, rest = ref.partition(".")
            if owner not in {endpoint_id, "*"} or rest.startswith(("request.", "param.")):
                continue
            for value in _field_values(body, rest, row_fields):
                if value not in allowed:
                    problems.append(f"{at}: {rest}={value!r} is not one of {enum_name} {allowed}")

    for shape_name, refs in contract["shape_bindings"].items():
        keys = contract["field_shapes"][shape_name]
        for ref in refs:
            owner, _, rest = ref.partition(".")
            if owner != endpoint_id or rest.startswith("request."):
                continue
            for value in _field_values(body, rest, row_fields):
                if value is None and endpoint_id == "experiment_cases":
                    continue  # a row without values (FAILED / EXCLUDED / WITHHELD) is checked below
                if not isinstance(value, dict):
                    problems.append(f"{at}: {rest} must be an object with {keys}")
                    continue
                missing = [key for key in keys if key not in value]
                if missing:
                    problems.append(f"{at}: {rest} is missing {missing}")

    for value in _field_values(body, "checksum", row_fields):
        if not (isinstance(value, str) and CHECKSUM.match(value)):
            problems.append(f"{at}: checksum {value!r} must be sha256:<64 lowercase hex>")
    for field in ("revision", "working_revision"):
        for value in _field_values(body, field, row_fields):
            if not (_is_int(value) and value >= 1):
                problems.append(f"{at}: {field} must be a positive integer")
    for value in _field_values(body, "ground_truth_available", row_fields):
        if not isinstance(value, bool):
            problems.append(f"{at}: ground_truth_available must be a boolean")
    for value in _field_values(body, "slice_index", row_fields):
        if value is not None and not (_is_int(value) and value >= 0):
            problems.append(f"{at}: slice_index must be a non-negative integer")

    if endpoint_id in contract["binary_delivery"]["applies_to"]:
        if body.get("media_type") != contract["binary_delivery"]["media_type"]:
            problems.append(f"{at}: media_type must be {contract['binary_delivery']['media_type']}")
        url = body.get("content_url")
        if not (isinstance(url, str) and url.startswith(f"{contract['base_path']}/artifacts/")):
            problems.append(f"{at}: content_url must be an immutable {contract['base_path']}/artifacts/ URL")

    if "metric_state" in body:
        state = body["metric_state"]
        if "metric_value" in body:
            value = body["metric_value"]
            if state == "NOT_APPLICABLE" and value is not None:
                problems.append(f"{at}: NOT_APPLICABLE must carry metric_value null, never a number (07 section 6)")
            if state == "COMPUTED" and not (_is_number(value) and 0.0 <= value <= 1.0):
                problems.append(f"{at}: COMPUTED must carry a metric_value in [0, 1]")
    if "metric_values" in body:
        _check_metric_values(at, body["metric_values"], problems)
    if endpoint_id == "experiment_cases" and isinstance(body.get("items"), list):
        for position, row in enumerate(body["items"]):
            if not isinstance(row, dict):
                continue
            where = f"{at}: items[{position}]"
            if row.get("status") == "SUCCEEDED":
                _check_metric_values(where, row.get("metric_values"), problems)
            elif row.get("metric_values") is not None:
                problems.append(f"{where}: a {row.get('status')} row carries metric_values null, never numbers")
        if "outlier_selection" in body:
            _check_outliers(contract, at, body["outlier_selection"], body["items"], problems)
    if endpoint_id == "experiment_metrics" and "metric_summary" in body:
        _check_summary(contract, f"{at}: metric_summary", body["metric_summary"], problems)
    if endpoint_id == "experiment_compare" and "summary" in body:
        summary = body["summary"]
        if not isinstance(summary, dict) or not summary:
            problems.append(f"{at}: summary maps each compared experiment_id to a metric summary")
        else:
            for experiment_id, per_experiment in summary.items():
                _check_summary(contract, f"{at}: summary[{experiment_id}]", per_experiment, problems)
    for value in _field_values(body, "evidence", row_fields):
        if isinstance(value, dict):
            variant = value.get("prediction_variant")
            if value.get("analysis_run_id") is not None and variant not in contract["domain_enums"]["prediction_variant"]:
                problems.append(f"{at}: evidence with an analysis_run_id needs its prediction_variant")
            if value.get("analysis_run_id") is None and variant is not None:
                problems.append(f"{at}: evidence without an analysis_run_id carries prediction_variant null")
    if "worst_slice_selection" in fields and "worst_slice_selection" in body:
        _check_worst_slice(contract, at, body["worst_slice_selection"], problems)

    statuses = _field_values(body, "geometry_validation_status", row_fields)
    physical_ok = bool(statuses) and all(value == "VALIDATED_AXIS_ALIGNED" for value in statuses)
    if not physical_ok:
        offending = sorted({key for key in _walk_keys(body) if PHYSICAL_KEY.search(key.rsplit(".", 1)[-1])})
        if offending:
            problems.append(f"{at}: physical-unit fields {offending} while geometry is not validated")
    return problems


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Validate API Contract 11 v1.0.0")
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
    print(
        f"PASS: API Contract 11 {result['version']}; {result['endpoint_count']} endpoints "
        f"({result['hero_endpoint_count']} hero-flow), {result['error_count']} errors"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
