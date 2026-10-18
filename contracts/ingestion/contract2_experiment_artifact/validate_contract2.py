#!/usr/bin/env python3
"""Validator for Contract 2 precomputed experiment artifacts (DRAFT v0).

This is an offline review/acceptance tool, not a production ingestion module.
It verifies provenance, gates, checksums and immutable re-ingestion semantics
using the repository's Draft 2020-12 JSON Schema validator plus Python checks.

DR-018 completeness checks (given the package root, they read the PER_CASE_METRICS
artifact and the evaluation population manifest): runs plus listed failures equal
``num_test_cases``; every population case appears exactly once, as a run or as a
failure; each run's case and run ids match its artifacts; the mask kind matches
the prediction variant (RAW masks for RAW runs, PROCESSED masks for PROCESSED runs).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


class ContractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _utf8_console() -> None:
    """Keep the CLI byte contract stable when Windows uses a legacy code page."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="strict")


def _fail(code: str, message: str) -> None:
    raise ContractError(code, message)


def _default_schema() -> dict:
    try:
        return json.loads(Path(__file__).with_name("schema.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail("SCHEMA_INVALID", f"cannot load Contract 2 schema: {exc}")


def _validate_against_schema(manifest: object, schema: dict) -> None:
    if not isinstance(manifest, dict):
        _fail("SCHEMA_INVALID", "manifest must be a JSON object")
    try:
        import jsonschema
    except ImportError:
        _fail("SCHEMA_VALIDATION_UNAVAILABLE", "jsonschema is required to validate Contract 2")
    try:
        validator = jsonschema.Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(manifest), key=lambda error: list(error.path))
    except Exception as exc:
        _fail("SCHEMA_INVALID", f"formal schema could not be applied: {exc}")
    if errors:
        error = errors[0]
        location = ".".join(str(part) for part in error.path) or "manifest"
        _fail("SCHEMA_INVALID", f"{location}: {error.message}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_path(root: Path, value: object, kind: str) -> Path:
    if not isinstance(value, str) or (
        not value
        or Path(value).is_absolute()
        or ":" in value.split("/")[0]
        or "\\" in value
        or ".." in Path(value).parts
    ):
        _fail("SCHEMA_INVALID", f"{kind}: path must be relative and use forward slashes")
    path = (root / Path(*value.split("/"))).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        _fail("SCHEMA_INVALID", f"{kind}: path escapes package root")
    return path


def _checksum_object(value: object, kind: str) -> str:
    if not isinstance(value, dict) or set(value) != {"algorithm", "value"}:
        _fail("SCHEMA_INVALID", f"{kind}: checksum must contain algorithm and value only")
    if value.get("algorithm") != "sha256" or not isinstance(value.get("value"), str):
        _fail("SCHEMA_INVALID", f"{kind}: checksum must use sha256")
    checksum = value["value"]
    if not re.fullmatch(r"[0-9a-f]{64}", checksum):
        _fail("SCHEMA_INVALID", f"{kind}: checksum must be lowercase SHA-256")
    return checksum


def _verify_file(root: Path, source_path: object, checksum: object, kind: str) -> str:
    path = _safe_path(root, source_path, kind)
    expected = _checksum_object(checksum, kind)
    if not path.is_file():
        _fail("ARTIFACT_UNREADABLE", f"{kind}: file does not exist: {source_path}")
    actual = _sha256(path)
    if actual != expected:
        _fail("CHECKSUM_MISMATCH", f"{kind}: checksum differs from manifest")
    return expected


def _validate_manifest_ref(root: Path, ref: dict, kind: str) -> None:
    if not isinstance(ref, dict) or set(ref) != {"manifest_id", "path", "checksum"}:
        _fail("SCHEMA_INVALID", f"{kind}: manifest reference is incomplete or has extra fields")
    if not isinstance(ref["manifest_id"], str) or not ref["manifest_id"]:
        _fail("SCHEMA_INVALID", f"{kind}: manifest_id is required")
    _verify_file(root, ref["path"], ref["checksum"], kind)


def _validate_checkpoint(root: Path, checkpoint: dict) -> None:
    if not isinstance(checkpoint, dict) or set(checkpoint) != {"checkpoint_id", "path", "checksum"}:
        _fail("SCHEMA_INVALID", "experiment.checkpoint: reference is incomplete or has extra fields")
    if not isinstance(checkpoint["checkpoint_id"], str) or not checkpoint["checkpoint_id"]:
        _fail("SCHEMA_INVALID", "experiment.checkpoint.checkpoint_id is required")
    _verify_file(root, checkpoint["path"], checkpoint["checksum"], "experiment.checkpoint")


CASE_TOKEN = re.compile(r"CASE_[0-9]+")
MASK_KIND_BY_VARIANT = {"RAW_PREDICTION": "RAW_PREDICTION_MASK", "PROCESSED_PREDICTION": "PROCESSED_PREDICTION_MASK"}


def _json_file(root: Path, source_path: object, kind: str) -> dict:
    """A JSON file under the package root (its checksum has already been verified)."""
    path = _safe_path(root, source_path, kind)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        _fail("ARTIFACT_UNREADABLE", f"{kind}: cannot read it as JSON: {exc}")
    if not isinstance(document, dict):
        _fail("ARTIFACT_UNREADABLE", f"{kind}: must be a JSON object")
    return document


def _case_id_list(value: object, kind: str) -> list:
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        _fail("EVALUATION_POPULATION_INVALID", f"{kind}: case_ids must be a list of case id strings")
    if len(set(value)) != len(value):
        _fail("EVALUATION_POPULATION_INVALID", f"{kind}: a case id is listed twice")
    return value


def _check_completeness(experiment: dict, root: Path, artifact_by_id: dict, runs: list) -> int:
    """DR-018: one run or one listed failure per population case; ids and mask kinds tie out.

    Returns the number of failures listed in the PER_CASE_METRICS artifact.
    """
    variant = experiment["prediction_variant"]
    expected_kind = MASK_KIND_BY_VARIANT.get(variant)
    if expected_kind is None:
        _fail("PROVENANCE_INVALID", f"experiment.prediction_variant {variant!r} is not a prediction variant")
    per_case = _json_file(root, artifact_by_id[experiment["per_case_metrics"]["artifact_id"]]["source_path"],
                          "experiment.per_case_metrics")
    if per_case.get("prediction_variant") != variant:
        _fail("PROVENANCE_INVALID", "PER_CASE_METRICS prediction_variant differs from experiment.prediction_variant")
    failures = per_case.get("failures")
    if not isinstance(failures, list):
        _fail("EVALUATION_POPULATION_INVALID", "PER_CASE_METRICS failures must be a list (empty when no case failed)")
    failed_ids = []
    for item in failures:
        if not (isinstance(item, dict) and isinstance(item.get("case_id"), str) and item["case_id"]
                and isinstance(item.get("reason_code"), str) and item["reason_code"]
                and isinstance(item.get("reason"), str)):
            _fail("EVALUATION_POPULATION_INVALID", "each failure needs case_id, reason_code and reason strings")
        failed_ids.append(item["case_id"])
    population = per_case.get("population")
    if not isinstance(population, dict):
        _fail("EVALUATION_POPULATION_INVALID", "PER_CASE_METRICS population is missing")
    population_ids = _case_id_list(population.get("case_ids"), "PER_CASE_METRICS population")
    manifest_ref = experiment["evaluation_population_manifest"]
    manifest_ids = _case_id_list(
        _json_file(root, manifest_ref["path"], "experiment.evaluation_population_manifest").get("case_ids"),
        "evaluation population manifest")
    if sorted(manifest_ids) != sorted(population_ids):
        _fail("EVALUATION_POPULATION_INVALID",
              "the evaluated population differs from the evaluation population manifest")

    run_cases = []
    for run in runs:
        if not (isinstance(run.get("case_id"), str) and run["case_id"]):
            _fail("PROVENANCE_INVALID", f"{run.get('analysis_run_id')}: case_id is required")
        if run.get("status") != "SUCCEEDED":
            _fail("EVALUATION_POPULATION_INVALID",
                  f"{run['analysis_run_id']}: a failed case has no run; list it in the PER_CASE_METRICS failures (DR-018)")
        run_cases.append(run["case_id"])
    repeated = sorted({case_id for case_id in run_cases if run_cases.count(case_id) > 1})
    if repeated:
        _fail("DUPLICATE_ANALYSIS_RUN", f"analysis runs: case(s) {repeated} have more than one run")
    repeated = sorted({case_id for case_id in failed_ids if failed_ids.count(case_id) > 1})
    if repeated:
        _fail("EVALUATION_POPULATION_INVALID", f"listed failures: case(s) {repeated} are listed more than once")
    both = sorted(set(run_cases) & set(failed_ids))
    if both:
        _fail("EVALUATION_POPULATION_INVALID", f"case(s) {both} are both an analysis run and a listed failure")
    if len(runs) + len(failed_ids) != experiment["num_test_cases"]:
        _fail("EVALUATION_POPULATION_INVALID",
              f"{len(runs)} analysis run(s) + {len(failed_ids)} listed failure(s) != num_test_cases "
              f"{experiment['num_test_cases']}")
    covered = set(run_cases) | set(failed_ids)
    if covered != set(population_ids):
        _fail("EVALUATION_POPULATION_INVALID",
              f"population cases without a run or a failure: {sorted(set(population_ids) - covered)}; "
              f"run or failure cases outside the population: {sorted(covered - set(population_ids))}")

    claimed: dict[str, str] = {}
    paths: dict[str, str] = {}
    for run in runs:
        run_id, case_id = run["analysis_run_id"], run["case_id"]
        raw_id, processed_id = run["raw_prediction_mask_id"], run.get("processed_prediction_mask_id")
        if variant == "PROCESSED_PREDICTION" and processed_id is None:
            _fail("PROVENANCE_INVALID", f"{run_id}: a PROCESSED_PREDICTION run must reference its processed mask")
        owned = [raw_id] + ([processed_id] if processed_id is not None else []) \
            + list(run["metric_set_ids"]) + list(run["reconstruction_ids"])
        for artifact_id in owned:
            artifact = artifact_by_id[artifact_id]
            if claimed.setdefault(artifact_id, run_id) != run_id:
                _fail("PROVENANCE_INVALID", f"{artifact_id}: shared by runs {claimed[artifact_id]} and {run_id}")
            if paths.setdefault(artifact["source_path"], artifact_id) != artifact_id:
                _fail("PROVENANCE_INVALID", f"{artifact_id}: reads the same file as {paths[artifact['source_path']]}")
            if artifact.get("case_id") != case_id or artifact.get("analysis_run_id") != run_id:
                _fail("PROVENANCE_INVALID", f"{artifact_id}: case_id/analysis_run_id differ from run {run_id} ({case_id})")
            if f"/runs/{run_id}/" not in artifact["artifact_uri"]:
                _fail("PROVENANCE_INVALID", f"{artifact_id}: artifact_uri is not under run {run_id}")
            tokens = set(CASE_TOKEN.findall(artifact_id)) | set(CASE_TOKEN.findall(artifact["source_path"]))
            if tokens - {case_id}:
                _fail("PROVENANCE_INVALID",
                      f"{artifact_id}: names case(s) {sorted(tokens - {case_id})} but run {run_id} is {case_id}")
        for metric_id in run["metric_set_ids"]:
            metric = artifact_by_id[metric_id]
            label = metric.get("prediction_mask_kind")
            if label != variant:
                _fail("PROVENANCE_INVALID",
                      f"{metric_id}: prediction_mask_kind {label!r} differs from the experiment's {variant}")
            target = artifact_by_id[metric["prediction_mask_id"]]
            if target["kind"] != expected_kind:
                _fail("PROVENANCE_INVALID", f"{metric_id}: labelled {label} but scores a {target['kind']}")
        for reconstruction_id in run["reconstruction_ids"]:
            reconstruction = artifact_by_id[reconstruction_id]
            label = reconstruction.get("source_mask_kind")
            source = artifact_by_id[reconstruction["source_artifact_id"]]
            if label is not None and MASK_KIND_BY_VARIANT.get(label) != source["kind"]:
                _fail("PROVENANCE_INVALID",
                      f"{reconstruction_id}: source_mask_kind {label!r} does not match {source['kind']}")
    return len(failed_ids)


def _validate_artifact(
    artifact: dict,
    *,
    root: Path,
    seen_ids: set[str],
    seen_uris: set[str],
    existing: dict[str, str],
) -> tuple[str, str]:
    required = {
        "artifact_id", "kind", "artifact_uri", "source_path", "media_type",
        "checksum", "immutable",
    }
    missing = sorted(required - set(artifact))
    if missing:
        _fail("SCHEMA_INVALID", f"artifact: missing fields {missing}")
    allowed = required | {
        "case_id", "analysis_run_id", "source_artifact_id", "source_mask_kind",
        "reference_mask_id", "reference_mask_kind", "prediction_mask_id",
        "prediction_mask_kind", "evaluation_version",
    }
    unexpected = sorted(set(artifact) - allowed)
    if unexpected:
        _fail("SCHEMA_INVALID", f"artifact {artifact.get('artifact_id')}: unexpected fields {unexpected}")
    artifact_id = artifact["artifact_id"]
    if not isinstance(artifact_id, str) or not re.fullmatch(r"ART_[A-Za-z0-9._-]+", artifact_id):
        _fail("SCHEMA_INVALID", "artifact_id is invalid")
    if artifact_id in seen_ids:
        _fail("DUPLICATE_ARTIFACT", f"artifact_id is repeated: {artifact_id}")
    seen_ids.add(artifact_id)
    uri = artifact["artifact_uri"]
    if (
        not isinstance(uri, str)
        or not re.fullmatch(r"artifact://[A-Za-z0-9][A-Za-z0-9._/-]*", uri)
        or ".." in uri.removeprefix("artifact://").split("/")
    ):
        _fail("SCHEMA_INVALID", f"{artifact_id}: artifact_uri is invalid")
    if uri in seen_uris:
        _fail("DUPLICATE_ARTIFACT", f"artifact_uri is repeated: {uri}")
    seen_uris.add(uri)
    if artifact["immutable"] is not True:
        _fail("SCHEMA_INVALID", f"{artifact_id}: experiment artifacts must be immutable")
    checksum = _verify_file(root, artifact["source_path"], artifact["checksum"], artifact_id)
    if uri in existing:
        if existing[uri] != checksum:
            _fail("CHECKSUM_CONFLICT", f"{artifact_id}: changed checksum for immutable artifact {uri}")
        action = "NO_OP"
    else:
        action = "NEW"
    return artifact_id, action


def validate_manifest(
    manifest: dict,
    root: Path,
    existing: dict[str, str] | None = None,
    schema: dict | None = None,
) -> dict:
    _validate_against_schema(manifest, schema if schema is not None else _default_schema())
    existing = existing or {}
    if manifest.get("contract") != "contract2_experiment_artifact" or manifest.get("contract_version") != "DRAFT v0":
        _fail("SCHEMA_INVALID", "contract must be contract2_experiment_artifact DRAFT v0")
    if not isinstance(manifest.get("manifest_id"), str) or not re.fullmatch(
        r"exp-[a-z0-9][a-z0-9._-]*", manifest["manifest_id"]
    ):
        _fail("SCHEMA_INVALID", "manifest_id is invalid")
    if manifest.get("precomputed") is not True:
        _fail("PRECOMPUTED_FLAG_REQUIRED", "precomputed must be true for Contract 2")
    gates = manifest.get("gates")
    if not isinstance(gates, dict):
        _fail("SCHEMA_INVALID", "gates are required")
    if gates.get("gate_split_01") != "ACCEPTED":
        _fail("GATE_SPLIT_01_NOT_ACCEPTED", "GATE-SPLIT-01 is not ACCEPTED")
    if gates.get("gate_ml_01") != "ACCEPTED":
        _fail("GATE_ML_01_NOT_ACCEPTED", "GATE-ML-01 is not ACCEPTED")

    experiment = manifest.get("experiment")
    if not isinstance(experiment, dict):
        _fail("SCHEMA_INVALID", "experiment is required")
    required_experiment = {
        "experiment_id", "model_family", "model_variant", "decoder", "training_fraction",
        "split_manifest", "training_subset_manifest", "seed", "preprocessing_version",
        "postprocessing_version", "prediction_variant", "evaluation_population_manifest",
        "evaluation_metric_version", "training_code_version", "checkpoint",
        "evaluation_code_version", "num_test_cases", "metrics_summary",
        "per_case_metrics", "per_slice_metrics",
    }
    missing = sorted(required_experiment - set(experiment))
    if missing:
        _fail("SCHEMA_INVALID", f"experiment: missing fields {missing}")
    if experiment["training_fraction"] not in {0.25, 0.5, 1.0}:
        _fail("SCHEMA_INVALID", "experiment.training_fraction must be 0.25, 0.50 or 1.00")
    if experiment["num_test_cases"] != 54:
        _fail("EVALUATION_POPULATION_INVALID", "Contract 2 Path A artifacts must evaluate 54 holdout cases")
    if experiment["prediction_variant"] == "RAW_PREDICTION" and experiment["postprocessing_version"] != "none":
        _fail("PROVENANCE_INVALID", "RAW_PREDICTION must declare postprocessing_version=none")
    if experiment["prediction_variant"] == "PROCESSED_PREDICTION" and experiment["postprocessing_version"] == "none":
        _fail("PROVENANCE_INVALID", "PROCESSED_PREDICTION must declare a postprocessing version")
    _validate_manifest_ref(root, experiment["split_manifest"], "experiment.split_manifest")
    _validate_manifest_ref(root, experiment["training_subset_manifest"], "experiment.training_subset_manifest")
    evaluation = experiment["evaluation_population_manifest"]
    if not isinstance(evaluation, dict) or evaluation.get("role") != "FINAL_HOLDOUT" or evaluation.get("case_count") != 54:
        _fail("EVALUATION_POPULATION_INVALID", "evaluation population must be the 54-case FINAL_HOLDOUT")
    _validate_manifest_ref(root, {
        "manifest_id": evaluation.get("manifest_id"),
        "path": evaluation.get("path"),
        "checksum": evaluation.get("checksum"),
    }, "experiment.evaluation_population_manifest")
    _validate_checkpoint(root, experiment["checkpoint"])

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        _fail("SCHEMA_INVALID", "artifacts must be a non-empty array")
    artifact_by_id: dict[str, dict] = {}
    actions = []
    seen_ids: set[str] = set()
    seen_uris: set[str] = set()
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            _fail("SCHEMA_INVALID", "each artifact must be an object")
        artifact_id, action = _validate_artifact(
            artifact, root=root, seen_ids=seen_ids, seen_uris=seen_uris, existing=existing
        )
        artifact_by_id[artifact_id] = artifact
        actions.append({"artifact_uri": artifact["artifact_uri"], "action": action})

    def artifact_ref(ref: dict, expected_kind: str, field: str) -> dict:
        if not isinstance(ref, dict) or set(ref) != {"artifact_id"}:
            _fail("SCHEMA_INVALID", f"{field}: invalid artifact reference")
        target = artifact_by_id.get(ref["artifact_id"])
        if target is None:
            _fail("PROVENANCE_INVALID", f"{field}: unknown artifact {ref.get('artifact_id')}")
        if target["kind"] != expected_kind:
            _fail("PROVENANCE_INVALID", f"{field}: expected {expected_kind}, got {target['kind']}")
        return target

    artifact_ref(experiment["metrics_summary"], "METRICS_SUMMARY", "experiment.metrics_summary")
    artifact_ref(experiment["per_case_metrics"], "PER_CASE_METRICS", "experiment.per_case_metrics")
    artifact_ref(experiment["per_slice_metrics"], "PER_SLICE_METRICS", "experiment.per_slice_metrics")

    for artifact in artifacts:
        kind = artifact["kind"]
        source_id = artifact.get("source_artifact_id")
        if kind == "PROCESSED_PREDICTION_MASK":
            source = artifact_by_id.get(source_id)
            if not source or source["kind"] != "RAW_PREDICTION_MASK":
                _fail("PROVENANCE_INVALID", f"{artifact['artifact_id']}: processed mask must cite one raw mask")
        elif kind == "RECONSTRUCTION_3D":
            source = artifact_by_id.get(source_id)
            if not source or source["kind"] not in {"RAW_PREDICTION_MASK", "PROCESSED_PREDICTION_MASK"}:
                _fail("PROVENANCE_INVALID", f"{artifact['artifact_id']}: reconstruction source mask is invalid")
        elif kind == "METRIC_SET":
            if not artifact.get("reference_mask_id") or not artifact.get("prediction_mask_id"):
                _fail("METRIC_REFERENCE_REQUIRED", f"{artifact['artifact_id']}: metrics require prediction and reference masks")
            if artifact.get("reference_mask_kind") not in {"GROUND_TRUTH", "REVIEWED"}:
                _fail("METRIC_REFERENCE_REQUIRED", f"{artifact['artifact_id']}: metric reference kind is invalid")
            prediction = artifact_by_id.get(artifact["prediction_mask_id"])
            if not prediction or prediction["kind"] not in {"RAW_PREDICTION_MASK", "PROCESSED_PREDICTION_MASK"}:
                _fail("PROVENANCE_INVALID", f"{artifact['artifact_id']}: metric prediction reference is invalid")
            if not artifact.get("evaluation_version"):
                _fail("PROVENANCE_INVALID", f"{artifact['artifact_id']}: evaluation_version is required")

    runs = manifest.get("analysis_runs")
    if not isinstance(runs, list) or not runs:
        _fail("SCHEMA_INVALID", "analysis_runs must be a non-empty array")
    seen_runs: set[str] = set()
    for run in runs:
        if not isinstance(run, dict):
            _fail("SCHEMA_INVALID", "each analysis run must be an object")
        run_id = run.get("analysis_run_id")
        if not isinstance(run_id, str) or run_id in seen_runs:
            _fail("DUPLICATE_ANALYSIS_RUN", f"invalid or repeated analysis_run_id: {run_id}")
        seen_runs.add(run_id)
        raw = artifact_by_id.get(run.get("raw_prediction_mask_id"))
        if not raw or raw["kind"] != "RAW_PREDICTION_MASK":
            _fail("PROVENANCE_INVALID", f"{run_id}: raw_prediction_mask_id must reference a raw mask")
        processed_id = run.get("processed_prediction_mask_id")
        if processed_id is not None:
            processed = artifact_by_id.get(processed_id)
            if not processed or processed["kind"] != "PROCESSED_PREDICTION_MASK":
                _fail("PROVENANCE_INVALID", f"{run_id}: processed_prediction_mask_id is invalid")
            if processed.get("source_artifact_id") != raw["artifact_id"]:
                _fail("PROVENANCE_INVALID", f"{run_id}: processed mask does not derive from this raw mask")
        metric_ids = run.get("metric_set_ids")
        reconstruction_ids = run.get("reconstruction_ids")
        if not isinstance(metric_ids, list) or not isinstance(reconstruction_ids, list):
            _fail("SCHEMA_INVALID", f"{run_id}: metric_set_ids and reconstruction_ids must be arrays")
        for metric_id in metric_ids:
            metric = artifact_by_id.get(metric_id)
            if not metric or metric["kind"] != "METRIC_SET":
                _fail("PROVENANCE_INVALID", f"{run_id}: metric_set_ids contains an invalid artifact")
            allowed_predictions = {raw["artifact_id"]}
            if processed_id is not None:
                allowed_predictions.add(processed_id)
            if metric.get("prediction_mask_id") not in allowed_predictions:
                _fail("PROVENANCE_INVALID", f"{run_id}: metric is not tied to this run's prediction")
        for reconstruction_id in reconstruction_ids:
            reconstruction = artifact_by_id.get(reconstruction_id)
            if not reconstruction or reconstruction["kind"] != "RECONSTRUCTION_3D":
                _fail("PROVENANCE_INVALID", f"{run_id}: reconstruction_ids contains an invalid artifact")
            if reconstruction.get("source_artifact_id") not in {
                raw["artifact_id"], processed_id,
            }:
                _fail("PROVENANCE_INVALID", f"{run_id}: reconstruction source is not this run's mask")
    listed_failures = _check_completeness(experiment, root, artifact_by_id, runs)
    return {
        "status": "PASS",
        "manifest_id": manifest["manifest_id"],
        "artifacts": actions,
        "analysis_runs": len(runs),
        "listed_failures": listed_failures,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Contract 2 DRAFT v0")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--existing-index", type=Path)
    args = parser.parse_args(argv)
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        existing = json.loads(args.existing_index.read_text(encoding="utf-8")) if args.existing_index else {}
        schema = json.loads((Path(__file__).with_name("schema.json")).read_text(encoding="utf-8"))
        result = validate_manifest(manifest, args.root, existing, schema)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL [INPUT_INVALID] {exc}")
        return 2
    except ContractError as exc:
        print(f"FAIL [{exc.code}] {exc}")
        return 2
    print(
        f"PASS: Contract 2 DRAFT v0 {result['manifest_id']} — "
        f"{result['analysis_runs']} analysis run(s) + {result['listed_failures']} listed failure(s), "
        f"{len(result['artifacts'])} artifact(s); "
        f"actions={','.join(item['action'] for item in result['artifacts'])}"
    )
    return 0


if __name__ == "__main__":
    _utf8_console()
    raise SystemExit(main())
