#!/usr/bin/env python3
"""Synthetic, data-free checks for Contract 2 DRAFT v0."""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
from pathlib import Path

from validate_contract2 import ContractError, validate_manifest


HERE = Path(__file__).resolve().parent


def _write(root: Path, name: str, payload: bytes) -> dict:
    path = root / name
    path.write_bytes(payload)
    return {"algorithm": "sha256", "value": hashlib.sha256(payload).hexdigest()}


def _ref(manifest_id: str, path: str, checksum: dict) -> dict:
    return {"manifest_id": manifest_id, "path": path, "checksum": checksum}


def make_manifest(root: Path) -> dict:
    split_sum = _write(root, "split.json", b"split-v1")
    subset_sum = _write(root, "subset.json", b"subset-v1")
    holdout_sum = _write(root, "holdout.json", b"holdout-54")
    checkpoint_sum = _write(root, "checkpoint.bin", b"checkpoint-v1")
    raw_sum = _write(root, "raw.mask", b"raw-mask")
    recon_sum = _write(root, "mesh.obj", b"mesh")
    metric_sum = _write(root, "metric.json", b"metric")
    summary_sum = _write(root, "summary.json", b"summary")
    case_sum = _write(root, "per-case.json", b"per-case")
    slice_sum = _write(root, "per-slice.json", b"per-slice")
    return {
        "contract": "contract2_experiment_artifact",
        "contract_version": "DRAFT v0",
        "manifest_id": "exp-synthetic-001",
        "generated_at": "2026-09-16T00:00:00Z",
        "precomputed": True,
        "gates": {"gate_split_01": "ACCEPTED", "gate_ml_01": "ACCEPTED"},
        "experiment": {
            "experiment_id": "EXP-D-050",
            "model_family": "synthetic-unet",
            "model_variant": "v1",
            "decoder": "standard",
            "training_fraction": 0.5,
            "split_manifest": _ref("split-path-a-seed2024", "split.json", split_sum),
            "training_subset_manifest": _ref("subset-path-a-50", "subset.json", subset_sum),
            "seed": 2024,
            "preprocessing_version": "prep-v1",
            "postprocessing_version": "none",
            "prediction_variant": "RAW_PREDICTION",
            "evaluation_population_manifest": {
                "manifest_id": "holdout-final-54",
                "path": "holdout.json",
                "role": "FINAL_HOLDOUT",
                "case_count": 54,
                "checksum": holdout_sum,
            },
            "evaluation_metric_version": "dice-v1",
            "training_code_version": "git:abc123",
            "checkpoint": {
                "checkpoint_id": "ckpt-exp-d-050",
                "path": "checkpoint.bin",
                "checksum": checkpoint_sum,
            },
            "evaluation_code_version": "eval-v1",
            "num_test_cases": 54,
            "metrics_summary": {"artifact_id": "ART_SUMMARY"},
            "per_case_metrics": {"artifact_id": "ART_CASE_METRICS"},
            "per_slice_metrics": {"artifact_id": "ART_SLICE_METRICS"},
        },
        "artifacts": [
            {
                "artifact_id": "ART_RAW",
                "kind": "RAW_PREDICTION_MASK",
                "artifact_uri": "artifact://experiments/EXP-D-050/runs/RUN_0001/raw.mask",
                "source_path": "raw.mask",
                "media_type": "application/octet-stream",
                "checksum": raw_sum,
                "immutable": True,
                "case_id": "CASE_0001",
                "analysis_run_id": "RUN_0001",
            },
            {
                "artifact_id": "ART_RECON",
                "kind": "RECONSTRUCTION_3D",
                "artifact_uri": "artifact://experiments/EXP-D-050/runs/RUN_0001/mesh.obj",
                "source_path": "mesh.obj",
                "media_type": "model/obj",
                "checksum": recon_sum,
                "immutable": True,
                "case_id": "CASE_0001",
                "analysis_run_id": "RUN_0001",
                "source_artifact_id": "ART_RAW",
                "source_mask_kind": "RAW_PREDICTION",
            },
            {
                "artifact_id": "ART_METRIC",
                "kind": "METRIC_SET",
                "artifact_uri": "artifact://experiments/EXP-D-050/runs/RUN_0001/metric.json",
                "source_path": "metric.json",
                "media_type": "application/json",
                "checksum": metric_sum,
                "immutable": True,
                "case_id": "CASE_0001",
                "analysis_run_id": "RUN_0001",
                "reference_mask_id": "GT_CASE_0001",
                "reference_mask_kind": "GROUND_TRUTH",
                "prediction_mask_id": "ART_RAW",
                "prediction_mask_kind": "RAW_PREDICTION",
                "evaluation_version": "eval-v1",
            },
            {
                "artifact_id": "ART_SUMMARY",
                "kind": "METRICS_SUMMARY",
                "artifact_uri": "artifact://experiments/EXP-D-050/summary.json",
                "source_path": "summary.json",
                "media_type": "application/json",
                "checksum": summary_sum,
                "immutable": True,
            },
            {
                "artifact_id": "ART_CASE_METRICS",
                "kind": "PER_CASE_METRICS",
                "artifact_uri": "artifact://experiments/EXP-D-050/per-case.json",
                "source_path": "per-case.json",
                "media_type": "application/json",
                "checksum": case_sum,
                "immutable": True,
            },
            {
                "artifact_id": "ART_SLICE_METRICS",
                "kind": "PER_SLICE_METRICS",
                "artifact_uri": "artifact://experiments/EXP-D-050/per-slice.json",
                "source_path": "per-slice.json",
                "media_type": "application/json",
                "checksum": slice_sum,
                "immutable": True,
            },
        ],
        "analysis_runs": [
            {
                "analysis_run_id": "RUN_0001",
                "case_id": "CASE_0001",
                "status": "SUCCEEDED",
                "attempt_no": 1,
                "raw_prediction_mask_id": "ART_RAW",
                "processed_prediction_mask_id": None,
                "metric_set_ids": ["ART_METRIC"],
                "reconstruction_ids": ["ART_RECON"],
                "failure_reason": None,
            }
        ],
    }


def expect_error(manifest: dict, root: Path, code: str, existing: dict | None = None) -> None:
    try:
        validate_manifest(manifest, root, existing)
    except ContractError as exc:
        assert exc.code == code, (exc.code, str(exc))
    else:
        raise AssertionError(f"expected {code}")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="contract2-", dir=HERE) as temp:
        root = Path(temp)
        manifest = make_manifest(root)
        result = validate_manifest(manifest, root)
        assert result["status"] == "PASS"
        assert all(item["action"] == "NEW" for item in result["artifacts"])

        same_index = {
            item["artifact_uri"]: item["checksum"]["value"]
            for item in manifest["artifacts"]
        }
        replay = validate_manifest(manifest, root, same_index)
        assert all(item["action"] == "NO_OP" for item in replay["artifacts"])

        changed = copy.deepcopy(manifest)
        changed["gates"]["gate_split_01"] = "BLOCKED"
        expect_error(changed, root, "GATE_SPLIT_01_NOT_ACCEPTED")
        changed = copy.deepcopy(manifest)
        changed["precomputed"] = False
        expect_error(changed, root, "SCHEMA_INVALID")
        changed = copy.deepcopy(manifest)
        changed["experiment"]["num_test_cases"] = 53
        expect_error(changed, root, "SCHEMA_INVALID")
        changed = copy.deepcopy(manifest)
        changed["artifacts"][2]["reference_mask_id"] = None
        expect_error(changed, root, "METRIC_REFERENCE_REQUIRED")
        changed = copy.deepcopy(manifest)
        changed["artifacts"][1]["source_artifact_id"] = "ART_UNKNOWN"
        expect_error(changed, root, "PROVENANCE_INVALID")
        expect_error(manifest, root, "CHECKSUM_CONFLICT", {manifest["artifacts"][0]["artifact_uri"]: "0" * 64})
        changed = copy.deepcopy(manifest)
        changed["artifacts"][0]["source_path"] = "../raw.mask"
        expect_error(changed, root, "SCHEMA_INVALID")

        schema = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
        assert schema["$schema"].endswith("draft/2020-12/schema")
        try:
            import jsonschema
        except ImportError:
            print("schema_checks=SKIPPED (jsonschema not installed)")
        else:
            jsonschema.Draft202012Validator(schema).validate(manifest)
            print("schema_errors=0")
        print("contract2_checks=PASS cases=9")


if __name__ == "__main__":
    main()
