#!/usr/bin/env python3
"""Synthetic, data-free checks for Contract 2 DRAFT v0, including the DR-018 completeness rules.

``build`` writes a complete 54-case package into a temporary root: one run per
evaluated case, or, for a failed case, no run and one entry in the PER_CASE_METRICS
``failures`` list (the shape ``ml/evaluate.py`` writes). Every refusal below is a
mutation of that package.
"""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
from pathlib import Path

from validate_contract2 import ContractError, validate_manifest


HERE = Path(__file__).resolve().parent
CASES = [f"CASE_{number:04d}" for number in range(1, 55)]
EXP = "EXP-D-050"


def _write(root: Path, name: str, payload: bytes) -> dict:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return {"algorithm": "sha256", "value": hashlib.sha256(payload).hexdigest()}


def _json(document: dict) -> bytes:
    return json.dumps(document, indent=1).encode("utf-8")


def _ref(manifest_id: str, path: str, checksum: dict) -> dict:
    return {"manifest_id": manifest_id, "path": path, "checksum": checksum}


def build(root: Path, failed: tuple = (), variant: str = "RAW_PREDICTION") -> dict:
    """A valid 54-case manifest; the cases in ``failed`` have no run and are listed as failures."""
    processed = variant == "PROCESSED_PREDICTION"
    mask_kind = "PROCESSED_PREDICTION_MASK" if processed else "RAW_PREDICTION_MASK"
    split_sum = _write(root, "split.json", b"split-v1")
    subset_sum = _write(root, "subset.json", b"subset-v1")
    holdout_sum = _write(root, "holdout.json", _json({"role": "FINAL_HOLDOUT", "case_ids": CASES}))
    checkpoint_sum = _write(root, "checkpoint.bin", b"checkpoint-v1")
    summary_sum = _write(root, "summary.json", b"summary")
    slice_sum = _write(root, "per-slice.json", b"per-slice")
    failures = [{"case_id": case_id, "reason_code": "EVALUATION_ERROR", "reason": "synthetic failure"}
                for case_id in failed]
    case_sum = _write(root, "per-case.json", _json({
        "format": "ml-per-case-metrics/1", "experiment_id": EXP, "prediction_variant": variant,
        "population": {"role": "FINAL_HOLDOUT", "partition": "final_holdout", "case_ids": CASES},
        "intended_n": len(CASES), "successful_n": len(CASES) - len(failed), "failed_n": len(failed),
        "failures": failures, "cases": [],
    }))
    artifacts = []
    runs = []
    for case_id in CASES:
        if case_id in failed:
            continue
        number = case_id.split("_")[1]
        run_id = f"RUN_{number}"
        base = f"artifact://experiments/{EXP}/runs/{run_id}"
        raw_id = f"ART_{EXP}_{case_id}_RAW"
        artifacts.append({
            "artifact_id": raw_id, "kind": "RAW_PREDICTION_MASK", "artifact_uri": f"{base}/raw.mask",
            "source_path": f"masks/{case_id}.mask", "media_type": "application/octet-stream",
            "checksum": _write(root, f"masks/{case_id}.mask", f"raw-mask-{case_id}".encode()),
            "immutable": True, "case_id": case_id, "analysis_run_id": run_id,
        })
        processed_id = None
        prediction_id = raw_id
        if processed:
            processed_id = f"ART_{EXP}_{case_id}_PROCESSED"
            prediction_id = processed_id
            artifacts.append({
                "artifact_id": processed_id, "kind": "PROCESSED_PREDICTION_MASK",
                "artifact_uri": f"{base}/processed.mask", "source_path": f"masks/{case_id}_processed.mask",
                "media_type": "application/octet-stream",
                "checksum": _write(root, f"masks/{case_id}_processed.mask", f"processed-mask-{case_id}".encode()),
                "immutable": True, "case_id": case_id, "analysis_run_id": run_id, "source_artifact_id": raw_id,
            })
        metric_id = f"ART_{EXP}_{case_id}_METRICS"
        artifacts.append({
            "artifact_id": metric_id, "kind": "METRIC_SET", "artifact_uri": f"{base}/metric.json",
            "source_path": f"metrics/{case_id}.json", "media_type": "application/json",
            "checksum": _write(root, f"metrics/{case_id}.json", f"metric-{case_id}".encode()),
            "immutable": True, "case_id": case_id, "analysis_run_id": run_id,
            "reference_mask_id": f"GT_{case_id}", "reference_mask_kind": "GROUND_TRUTH",
            "prediction_mask_id": prediction_id, "prediction_mask_kind": variant, "evaluation_version": "eval-v1",
        })
        reconstruction_ids = []
        if case_id == CASES[0]:
            reconstruction_ids = ["ART_RECON"]
            artifacts.append({
                "artifact_id": "ART_RECON", "kind": "RECONSTRUCTION_3D", "artifact_uri": f"{base}/mesh.obj",
                "source_path": "mesh.obj", "media_type": "model/obj", "checksum": _write(root, "mesh.obj", b"mesh"),
                "immutable": True, "case_id": case_id, "analysis_run_id": run_id, "source_artifact_id": prediction_id,
                "source_mask_kind": variant,
            })
        runs.append({
            "analysis_run_id": run_id, "case_id": case_id, "status": "SUCCEEDED", "attempt_no": 1,
            "raw_prediction_mask_id": raw_id, "processed_prediction_mask_id": processed_id,
            "metric_set_ids": [metric_id], "reconstruction_ids": reconstruction_ids, "failure_reason": None,
        })
    for artifact_id, kind, name, checksum in (
        ("ART_SUMMARY", "METRICS_SUMMARY", "summary.json", summary_sum),
        ("ART_CASE_METRICS", "PER_CASE_METRICS", "per-case.json", case_sum),
        ("ART_SLICE_METRICS", "PER_SLICE_METRICS", "per-slice.json", slice_sum),
    ):
        artifacts.append({
            "artifact_id": artifact_id, "kind": kind, "artifact_uri": f"artifact://experiments/{EXP}/{name}",
            "source_path": name, "media_type": "application/json", "checksum": checksum, "immutable": True,
        })
    return {
        "contract": "contract2_experiment_artifact",
        "contract_version": "DRAFT v0",
        "manifest_id": "exp-synthetic-001",
        "generated_at": "2026-09-16T00:00:00Z",
        "precomputed": True,
        "gates": {"gate_split_01": "ACCEPTED", "gate_ml_01": "ACCEPTED"},
        "experiment": {
            "experiment_id": EXP,
            "model_family": "synthetic-unet",
            "model_variant": "v1",
            "decoder": "standard",
            "training_fraction": 0.5,
            "split_manifest": _ref("split-path-a-seed2024", "split.json", split_sum),
            "training_subset_manifest": _ref("subset-path-a-50", "subset.json", subset_sum),
            "seed": 2024,
            "preprocessing_version": "prep-v1",
            "postprocessing_version": "morphology-v1" if processed else "none",
            "prediction_variant": variant,
            "evaluation_population_manifest": {
                "manifest_id": "holdout-final-54", "path": "holdout.json", "role": "FINAL_HOLDOUT",
                "case_count": 54, "checksum": holdout_sum,
            },
            "evaluation_metric_version": "dice-v1",
            "training_code_version": "git:abc123",
            "checkpoint": {"checkpoint_id": "ckpt-exp-d-050", "path": "checkpoint.bin", "checksum": checkpoint_sum},
            "evaluation_code_version": "eval-v1",
            "num_test_cases": 54,
            "metrics_summary": {"artifact_id": "ART_SUMMARY"},
            "per_case_metrics": {"artifact_id": "ART_CASE_METRICS"},
            "per_slice_metrics": {"artifact_id": "ART_SLICE_METRICS"},
        },
        "artifacts": artifacts,
        "analysis_runs": runs,
    }


def expect_error(manifest: dict, root: Path, code: str, existing: dict | None = None, contains: str = "") -> None:
    try:
        validate_manifest(manifest, root, existing)
    except ContractError as exc:
        assert exc.code == code, (exc.code, str(exc))
        assert contains in str(exc), (contains, str(exc))
    else:
        raise AssertionError(f"expected {code}")


def artifact(manifest: dict, artifact_id: str) -> dict:
    return next(item for item in manifest["artifacts"] if item["artifact_id"] == artifact_id)


def run_of(manifest: dict, case_id: str) -> dict:
    return next(run for run in manifest["analysis_runs"] if run["case_id"] == case_id)


def rewrite_json(root: Path, manifest: dict, artifact_id: str, change) -> dict:
    """Edit a JSON artifact on disk and keep its manifest checksum honest, so only the rule under test fails."""
    item = artifact(manifest, artifact_id)
    path = root / item["source_path"]
    document = json.loads(path.read_text(encoding="utf-8"))
    change(document)
    item["checksum"] = _write(root, item["source_path"], _json(document))
    return manifest


_FRESH = [0]


def fresh(base: Path, change=None, failed: tuple = (), variant: str = "RAW_PREDICTION", artifact_id: str = "ART_CASE_METRICS"):
    """A new package (own root, so no mutation leaks into another) whose JSON artifact is edited by ``change``."""
    _FRESH[0] += 1
    root = base / f"mutation_{_FRESH[0]}"
    manifest = build(root, failed=failed, variant=variant)
    if change is not None:
        rewrite_json(root, manifest, artifact_id, change)
    return manifest, root


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="contract2-", dir=HERE) as temp:
        base = Path(temp)
        root = base / "all_succeeded"
        manifest = build(root)
        result = validate_manifest(manifest, root)
        assert result["status"] == "PASS"
        assert result["analysis_runs"] == 54 and result["listed_failures"] == 0
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
        artifact(changed, "ART_EXP-D-050_CASE_0001_METRICS")["reference_mask_id"] = None
        expect_error(changed, root, "METRIC_REFERENCE_REQUIRED")
        changed = copy.deepcopy(manifest)
        artifact(changed, "ART_RECON")["source_artifact_id"] = "ART_UNKNOWN"
        expect_error(changed, root, "PROVENANCE_INVALID")
        expect_error(manifest, root, "CHECKSUM_CONFLICT", {manifest["artifacts"][0]["artifact_uri"]: "0" * 64})
        changed = copy.deepcopy(manifest)
        changed["artifacts"][0]["source_path"] = "../raw.mask"
        expect_error(changed, root, "SCHEMA_INVALID")

        # --- DR-018: one run per case, or one listed failure -------------------------
        # A pass case with one failure: 53 runs + 1 listed failure = 54, and the failed case has no run.
        one_failure_root = base / "one_failure"
        one_failure = build(one_failure_root, failed=("CASE_0054",))
        assert all(run["case_id"] != "CASE_0054" for run in one_failure["analysis_runs"])
        result = validate_manifest(one_failure, one_failure_root)
        assert (result["analysis_runs"], result["listed_failures"]) == (53, 1), result
        # A PROCESSED experiment (EXP-D-PP shape) passes with processed masks, and so does one with a failure.
        processed_root = base / "processed"
        processed = build(processed_root, failed=("CASE_0002",), variant="PROCESSED_PREDICTION")
        assert validate_manifest(processed, processed_root)["listed_failures"] == 1

        # (a) the count: dropped case (a run removed, nothing listed), or one extra listed failure.
        mutated = copy.deepcopy(manifest)
        mutated["analysis_runs"].pop()
        expect_error(mutated, root, "EVALUATION_POPULATION_INVALID", contains="!= num_test_cases 54")
        mutated = copy.deepcopy(one_failure)
        mutated["analysis_runs"].pop()  # a second case vanishes silently
        expect_error(mutated, one_failure_root, "EVALUATION_POPULATION_INVALID", contains="52 analysis run(s) + 1")
        mutated = copy.deepcopy(manifest)
        mutated["analysis_runs"].append(copy.deepcopy(mutated["analysis_runs"][0]))
        mutated["analysis_runs"][-1]["analysis_run_id"] = "RUN_9999"
        expect_error(mutated, root, "DUPLICATE_ANALYSIS_RUN", contains="CASE_0001")

        # (b) every case exactly once: two runs on one case (another case goes missing, the count still adds up),
        # a case both a run and a failure, a failure outside the population, a different population manifest.
        mutated = copy.deepcopy(manifest)
        run_of(mutated, "CASE_0002")["case_id"] = "CASE_0001"
        expect_error(mutated, root, "DUPLICATE_ANALYSIS_RUN", contains="CASE_0001")
        mutated, mutated_root = fresh(base, lambda d: d["failures"][0].update(case_id="CASE_0001"), failed=("CASE_0054",))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="both an analysis run")
        mutated, mutated_root = fresh(base, lambda d: d["failures"][0].update(case_id="CASE_0999"), failed=("CASE_0054",))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="CASE_0999")
        mutated, mutated_root = fresh(base, lambda d: d["failures"].append(copy.deepcopy(d["failures"][0])),
                                      failed=("CASE_0054",))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="more than once")
        mutated, mutated_root = fresh(base, lambda d: d["failures"][0].pop("reason_code"), failed=("CASE_0054",))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="reason_code")
        mutated, mutated_root = fresh(base)  # the evaluated population differs from the population manifest
        mutated["experiment"]["evaluation_population_manifest"]["checksum"] = _write(
            mutated_root, "holdout.json", _json({"role": "FINAL_HOLDOUT", "case_ids": CASES[:-1] + ["CASE_0099"]}))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="population manifest")
        mutated, mutated_root = fresh(base, lambda d: d.pop("failures"))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="failures must be a list")
        mutated = copy.deepcopy(manifest)
        run_of(mutated, "CASE_0003")["status"] = "FAILED"
        run_of(mutated, "CASE_0003")["failure_reason"] = "x"
        expect_error(mutated, root, "EVALUATION_POPULATION_INVALID", contains="a failed case has no run")
        mutated, mutated_root = fresh(base, lambda d: d.update(population="not an object"))
        expect_error(mutated, mutated_root, "EVALUATION_POPULATION_INVALID", contains="population is missing")

        # (c) a run's case_id matches its artifacts: one mask shared by two runs (and by every run), a swapped case_id,
        # an artifact that names another case or sits under another run, two artifacts reading one file.
        mutated = copy.deepcopy(manifest)
        run_of(mutated, "CASE_0002")["raw_prediction_mask_id"] = run_of(mutated, "CASE_0001")["raw_prediction_mask_id"]
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="metric is not tied")
        mutated = copy.deepcopy(manifest)
        first = run_of(mutated, "CASE_0001")["raw_prediction_mask_id"]
        for run in mutated["analysis_runs"]:  # all 54 runs on one mask
            run["raw_prediction_mask_id"] = first
            run["metric_set_ids"] = [run["metric_set_ids"][0]]
        expect_error(mutated, root, "PROVENANCE_INVALID")
        mutated = copy.deepcopy(manifest)
        one, two = run_of(mutated, "CASE_0001"), run_of(mutated, "CASE_0002")
        one["case_id"], two["case_id"] = "CASE_0002", "CASE_0001"
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="differ from run")
        mutated = copy.deepcopy(manifest)
        two = run_of(mutated, "CASE_0002")
        two["metric_set_ids"] = two["metric_set_ids"] + [run_of(mutated, "CASE_0001")["metric_set_ids"][0]]
        expect_error(mutated, root, "PROVENANCE_INVALID")
        mutated = copy.deepcopy(manifest)
        artifact(mutated, "ART_EXP-D-050_CASE_0001_RAW")["artifact_uri"] = \
            "artifact://experiments/EXP-D-050/runs/RUN_9999/raw.mask"
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="not under run")
        mutated = copy.deepcopy(manifest)
        item = artifact(mutated, "ART_EXP-D-050_CASE_0001_RAW")
        item["source_path"] = "masks/CASE_0002_copy.mask"
        item["checksum"] = _write(root, item["source_path"], b"raw-mask-CASE_0001")
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="names case(s)")
        mutated = copy.deepcopy(manifest)
        first, second = (artifact(mutated, f"ART_EXP-D-050_CASE_000{n}_RAW") for n in (1, 2))
        second["source_path"], second["checksum"] = first["source_path"], first["checksum"]
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="reads the same file")
        mutated = copy.deepcopy(manifest)
        del artifact(mutated, "ART_EXP-D-050_CASE_0001_RAW")["case_id"]
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="differ from run")

        # (d) the mask kind matches the prediction variant.
        mutated = copy.deepcopy(manifest)  # a PROCESSED label on a RAW mask, in the metric set
        artifact(mutated, "ART_EXP-D-050_CASE_0001_METRICS")["prediction_mask_kind"] = "PROCESSED_PREDICTION"
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="differs from the experiment's")
        mutated = copy.deepcopy(manifest)  # a PROCESSED experiment whose runs only have RAW masks
        mutated["experiment"]["prediction_variant"] = "PROCESSED_PREDICTION"
        mutated["experiment"]["postprocessing_version"] = "morphology-v1"
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="PER_CASE_METRICS prediction_variant")
        mutated, mutated_root = fresh(base, lambda d: d.update(prediction_variant="PROCESSED_PREDICTION"))
        mutated["experiment"]["prediction_variant"] = "PROCESSED_PREDICTION"
        mutated["experiment"]["postprocessing_version"] = "morphology-v1"
        expect_error(mutated, mutated_root, "PROVENANCE_INVALID", contains="must reference its processed mask")
        mutated = copy.deepcopy(processed)  # a RAW label on a PROCESSED mask
        artifact(mutated, "ART_EXP-D-050_CASE_0001_METRICS")["prediction_mask_kind"] = "RAW_PREDICTION"
        expect_error(mutated, processed_root, "PROVENANCE_INVALID", contains="differs from the experiment's")
        mutated = copy.deepcopy(processed)  # a metric set that scores the RAW mask while labelled PROCESSED
        metric = artifact(mutated, "ART_EXP-D-050_CASE_0001_METRICS")
        metric["prediction_mask_id"] = run_of(mutated, "CASE_0001")["raw_prediction_mask_id"]
        expect_error(mutated, processed_root, "PROVENANCE_INVALID")
        mutated = copy.deepcopy(manifest)
        artifact(mutated, "ART_RECON")["source_mask_kind"] = "PROCESSED_PREDICTION"
        expect_error(mutated, root, "PROVENANCE_INVALID", contains="source_mask_kind")
        mutated, mutated_root = fresh(base, lambda d: d.update(prediction_variant="PROCESSED_PREDICTION"))
        expect_error(mutated, mutated_root, "PROVENANCE_INVALID", contains="PER_CASE_METRICS prediction_variant")

        # An unreadable PER_CASE_METRICS artifact cannot confirm completeness.
        unreadable_root = base / "unreadable"
        unreadable = build(unreadable_root)
        artifact(unreadable, "ART_CASE_METRICS")["checksum"] = _write(unreadable_root, "per-case.json", b"per-case")
        expect_error(unreadable, unreadable_root, "ARTIFACT_UNREADABLE")

        schema = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
        assert schema["$schema"].endswith("draft/2020-12/schema")
        try:
            import jsonschema
        except ImportError:
            print("schema_checks=SKIPPED (jsonschema not installed)")
        else:
            jsonschema.Draft202012Validator(schema).validate(manifest)
            jsonschema.Draft202012Validator(schema).validate(one_failure)
            print("schema_errors=0")
        print("contract2_checks=PASS cases=9 dr018_checks=PASS")


if __name__ == "__main__":
    main()
