#!/usr/bin/env python3
"""Synthetic acceptance tests for Contract 1 DRAFT v0."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from validate_contract1 import ContractError, validate_manifest


HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"


def load_valid() -> dict:
    return json.loads((FIXTURES / "valid_manifest.json").read_text(encoding="utf-8"))


def expect_error(manifest: dict, code: str, existing: dict | None = None) -> None:
    try:
        validate_manifest(manifest, FIXTURES, existing)
    except ContractError as exc:
        assert exc.code == code, f"expected {code}, got {exc.code}: {exc}"
        print(f"PASS {code}")
        return
    raise AssertionError(f"expected {code}, validator accepted the manifest")


def main() -> int:
    schema = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
    assert schema["$schema"].endswith("draft/2020-12/schema")
    result = validate_manifest(load_valid(), FIXTURES)
    assert result["status"] == "PASS"
    assert [item["action"] for item in result["artifacts"]] == ["NEW", "NEW"]
    print("PASS valid manifest")

    gate = load_valid()
    gate["gate"]["gate_data_01"] = "OPEN"
    expect_error(gate, "GATE_DATA_01_NOT_ACCEPTED")

    geometry = load_valid()
    geometry["cases"][0]["mri_volume"]["direction_or_orientation"][0][1] = 0.25
    expect_error(geometry, "GEOMETRY_NOT_VALIDATED")

    shape = load_valid()
    shape["cases"][0]["ground_truth_mask"]["shape_xyz"] = [2, 1, 1]
    expect_error(shape, "GEOMETRY_MISMATCH")

    metadata = load_valid()
    metadata["cases"][0]["metadata"]["patient_name"] = "must-not-enter-app"
    expect_error(metadata, "METADATA_NOT_ALLOWED")

    same = load_valid()
    existing_same = {
        artifact["artifact_uri"]: artifact["checksum"]["value"]
        for artifact in (
            same["cases"][0]["mri_volume"],
            same["cases"][0]["ground_truth_mask"],
        )
    }
    result = validate_manifest(same, FIXTURES, existing_same)
    assert [item["action"] for item in result["artifacts"]] == ["NO_OP", "NO_OP"]
    print("PASS idempotent identical package -> NO_OP")

    changed = load_valid()
    existing_changed = dict(existing_same)
    existing_changed[changed["cases"][0]["mri_volume"]["artifact_uri"]] = "b" * 64
    expect_error(changed, "CHECKSUM_CONFLICT", existing_changed)

    duplicate = load_valid()
    duplicate_case = copy.deepcopy(duplicate["cases"][0])
    duplicate_case["case_id"] = "CASE_0002"
    duplicate_case["mri_volume"]["artifact_uri"] = "artifact://datasets/synthetic-contract1/CASE_0002/mri.nrrd"
    duplicate_case["ground_truth_mask"]["artifact_uri"] = "artifact://datasets/synthetic-contract1/CASE_0002/mask.nrrd"
    duplicate["cases"].append(duplicate_case)
    expect_error(duplicate, "DUPLICATE_CASE_HASH")

    inference = load_valid()
    inference["manifest_id"] = "raw-synthetic-inference"
    inference["cases"][0]["mode_capability"] = "INFERENCE_REVIEW"
    inference["cases"][0]["ground_truth_mask"] = None
    inference["cases"][0]["compatibility"] = None
    result = validate_manifest(inference, FIXTURES)
    assert [item["action"] for item in result["artifacts"]] == ["NEW"]
    print("PASS inference-review manifest without ground-truth mask")

    print("All Contract 1 synthetic checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
