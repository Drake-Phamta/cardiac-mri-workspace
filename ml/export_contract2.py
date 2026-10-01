"""Build a Contract 2 (DRAFT v0) experiment-artifact manifest from a run directory.

    python -m ml.export_contract2 --run-dir <run> --gate-split-01 OPEN --gate-ml-01 OPEN --validate

The run directory is the Contract 2 artifact root: every path in the manifest is relative
to it (forward slashes) and every file is re-hashed here, never copied from a record.

Reads
    run_manifest.json                                     training identity (ml-run-manifest/1)
    manifests/split_manifest.json                         the run's copy of the split manifest
    manifests/training_subset_<subset>.json               effective training cases
    manifests/population_final_holdout.json               the 54-case evaluation population
    <checkpoint path from run_manifest.json>              the selected checkpoint
    predictions/final_holdout/predictions_manifest.json   + one raw mask NRRD per case
    evaluation/final_holdout/evaluation_manifest.json     + per-case, per-slice, summary, metric sets
Writes
    contract2/<manifest_id>.json                          (refuses to overwrite)
    contract2/<manifest_id>.export.json                   export record: frozen split sha256,
                                                          code versions, allow_dirty_code

The run's split copy and every recorded split sha256 must equal the FROZEN split manifest
(--split-manifest, default the repository's), and the training, inference and evaluation
code versions must be clean commits unless --allow-dirty-code is passed (and recorded).

Gate states are explicit inputs with no default: the manifest records what the operator
asserts, and contracts/ingestion/contract2_experiment_artifact/validate_contract2.py refuses
anything but ACCEPTED / ACCEPTED. A run whose predictions or evaluation recorded a FAILED
case cannot be exported: Contract 2 DRAFT v0 requires a raw prediction mask for every
analysis run, so a failure would have to be dropped - which `08` section 8.1 forbids.
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import sys
from pathlib import Path

from ml import data as D
from ml import manifests as MF

CONTRACT = "contract2_experiment_artifact"
CONTRACT_VERSION = "DRAFT v0"
GATE_STATES = ("ACCEPTED", "BLOCKED", "OPEN")
VALIDATOR = D.REPO_ROOT / "contracts" / "ingestion" / "contract2_experiment_artifact" / "validate_contract2.py"
MEDIA_TYPES = {".nrrd": "application/x-nrrd", ".json": "application/json"}
PARTITION = D.HOLDOUT_PARTITION


class ExportError(RuntimeError):
    """The run directory cannot be exported faithfully."""


def _checksum(run_dir: Path, rel: str, expected: str | None, what: str) -> dict:
    path = run_dir / rel
    if not path.is_file():
        raise ExportError(f"{what}: {rel} does not exist in the run directory")
    actual = D.sha256_file(path)
    if expected is not None and actual != expected:
        raise ExportError(f"{what}: {rel} sha256 {actual} != recorded {expected}")
    return {"algorithm": "sha256", "value": actual}


def _artifact(run_dir: Path, *, artifact_id: str, kind: str, uri: str, rel: str,
              expected_sha: str | None, **extra) -> dict:
    out = {"artifact_id": artifact_id, "kind": kind, "artifact_uri": uri, "source_path": rel,
           "media_type": MEDIA_TYPES.get(Path(rel).suffix, "application/octet-stream"),
           "checksum": _checksum(run_dir, rel, expected_sha, artifact_id), "immutable": True}
    out.update(extra)
    return out


def default_manifest_id(experiment_id: str, prediction_variant: str) -> str:
    stem = re.sub(r"^exp-", "", experiment_id.lower())
    variant = "raw" if prediction_variant == "RAW_PREDICTION" else "processed"
    return f"exp-{stem}-{variant}-holdout"


def code_versions(rm: dict, pm: dict, em: dict) -> dict:
    """Every code version that produced this export (training, inference when recorded, evaluation)."""
    out = {"training_code_version": rm.get("training_code_version"),
           "evaluation_code_version": em.get("evaluation_code_version")}
    inference = (pm.get("inference") or {}).get("code_version")
    if inference is not None:
        out["inference_code_version"] = inference
    return out


def build_manifest(run_dir: str | Path, *, gate_split_01: str, gate_ml_01: str,
                   manifest_id: str | None = None, generated_at: str | None = None,
                   split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST,
                   allow_dirty_code: bool = False) -> dict:
    """The Contract 2 manifest for <run>'s final_holdout evaluation (not written to disk).

    split_manifest is the FROZEN split (default: the repository's); the run's copy and every
    recorded split sha256 must equal it. A training / inference / evaluation code version
    that is not a clean commit ("+dirty", "MIXED:...", "UNKNOWN") is refused unless
    allow_dirty_code=True, which export() records next to the manifest.
    """
    run_dir = Path(run_dir)
    for name, state in (("gate_split_01", gate_split_01), ("gate_ml_01", gate_ml_01)):
        if state not in GATE_STATES:
            raise ExportError(f"{name} must be one of {GATE_STATES}, got {state!r}")
    rm = D.load_json(run_dir / MF.RUN_LAYOUT["run_manifest"])
    if rm.get("format") != MF.RUN_MANIFEST_FORMAT:
        raise ExportError(f"run_manifest.json is not {MF.RUN_MANIFEST_FORMAT}")
    exp = rm["experiment_id"]
    pm_rel = MF.RUN_LAYOUT["predictions_manifest"].format(partition=PARTITION)
    em_rel = MF.RUN_LAYOUT["evaluation"].format(partition=PARTITION) + "/evaluation_manifest.json"
    pm = D.load_json(run_dir / pm_rel)
    em = D.load_json(run_dir / em_rel)
    if pm.get("format") != MF.PREDICTIONS_FORMAT or pm["population"]["partition"] != PARTITION:
        raise ExportError("predictions manifest is not a final_holdout ml-predictions/1 manifest")
    if em.get("format") != "ml-evaluation/1" or em.get("partition") != PARTITION:
        raise ExportError("evaluation manifest is not a final_holdout ml-evaluation/1 manifest")
    if not (exp == pm.get("experiment_id") == em.get("experiment_id")):
        raise ExportError("run, predictions and evaluation name different experiments")
    if em["predictions_manifest"]["path"] != pm_rel:
        raise ExportError("the evaluation scored a different predictions manifest")
    _checksum(run_dir, pm_rel, em["predictions_manifest"]["sha256"], "predictions manifest")
    frozen_sha = D.sha256_file(split_manifest)
    for what, sha in (("run manifest", rm["split_manifest"]["sha256"]),
                      ("predictions manifest", pm["split_manifest"]["sha256"]),
                      ("run split copy", D.sha256_file(run_dir / rm["split_manifest"]["path"]))):
        if sha != frozen_sha:
            raise ExportError(f"{what} split sha256 {sha} is not the frozen split manifest {frozen_sha}")
    dirty = {k: v for k, v in code_versions(rm, pm, em).items() if not MF.is_clean_code_version(v)}
    if dirty and not allow_dirty_code:
        raise ExportError(f"code versions are not clean commits: {dirty}; re-run from a committed tree, "
                          f"or pass allow_dirty_code / --allow-dirty-code (recorded with the export)")
    ckpt = rm["checkpoint"]
    if pm["checkpoint"]["sha256"] != ckpt["sha256"]:
        raise ExportError("holdout predictions were not made with the run's recorded checkpoint")
    if pm["prediction_variant"] != em["prediction_variant"]:
        raise ExportError("prediction variant differs between predictions and evaluation")
    failed = [c["case_id"] for c in pm["cases"] if c.get("status") != "SUCCEEDED"]
    if failed or em.get("failed_n"):
        raise ExportError(f"{len(failed) or em.get('failed_n')} FAILED case(s) (e.g. {failed[:3]}): "
                          f"Contract 2 DRAFT v0 needs a raw mask for every analysis run; exporting would "
                          f"drop failures (08 section 8.1). Decision needed: amend the contract.")
    intended = list(pm["intended_case_ids"])
    if sorted(c["case_id"] for c in pm["cases"]) != sorted(intended):
        raise ExportError("predictions manifest cases differ from its intended population")
    if set(em["metric_sets"]) != set(intended):
        raise ExportError("evaluation metric sets do not cover the intended population")

    pop = em["population"]
    pop_doc = D.load_json(run_dir / pop["path"])
    if pop_doc.get("role") != "FINAL_HOLDOUT" or sorted(pop_doc["case_ids"]) != sorted(intended):
        raise ExportError("population manifest is not the predicted final_holdout population")
    split_ref, subset_ref = rm["split_manifest"], rm["training_subset_manifest"]
    if pop_doc.get("source_split_manifest_sha256") != split_ref["sha256"]:
        raise ExportError("holdout population was derived from a different split manifest")

    variant = pm["prediction_variant"]
    mask_kind = "RAW_PREDICTION_MASK" if variant == "RAW_PREDICTION" else "PROCESSED_PREDICTION_MASK"
    if mask_kind != "RAW_PREDICTION_MASK":
        raise ExportError("only RAW_PREDICTION runs are exported here; EXP-D-PP needs its raw run cited")
    pred_dir = Path(pm_rel).parent.as_posix()
    artifacts, runs = [], []
    for case in sorted(pm["cases"], key=lambda c: c["case_id"]):
        cid = case["case_id"]
        run_id = f"RUN_{exp}_{cid}"
        raw_id = f"ART_{exp}_{cid}_RAW"
        metric_id = f"ART_{exp}_{cid}_METRICS"
        artifacts.append(_artifact(
            run_dir, artifact_id=raw_id, kind="RAW_PREDICTION_MASK",
            uri=f"artifact://experiments/{exp}/runs/{run_id}/raw_prediction.nrrd",
            rel=f"{pred_dir}/{case['file']}", expected_sha=case["sha256"],
            case_id=cid, analysis_run_id=run_id))
        ms = em["metric_sets"][cid]
        artifacts.append(_artifact(
            run_dir, artifact_id=metric_id, kind="METRIC_SET",
            uri=f"artifact://experiments/{exp}/runs/{run_id}/metric_set.json",
            rel=ms["path"], expected_sha=ms["sha256"], case_id=cid, analysis_run_id=run_id,
            reference_mask_id=f"GT_{cid}", reference_mask_kind="GROUND_TRUTH",
            prediction_mask_id=raw_id, prediction_mask_kind=variant,
            evaluation_version=em["evaluation_metric_version"]))
        runs.append({"analysis_run_id": run_id, "case_id": cid, "status": "SUCCEEDED", "attempt_no": 1,
                     "raw_prediction_mask_id": raw_id, "processed_prediction_mask_id": None,
                     "metric_set_ids": [metric_id], "reconstruction_ids": [], "failure_reason": None})
    kinds = {"metrics_summary": "METRICS_SUMMARY", "per_case_metrics": "PER_CASE_METRICS",
             "per_slice_metrics": "PER_SLICE_METRICS"}
    refs = {}
    for key, kind in kinds.items():
        out = em["outputs"][key]
        art_id = f"ART_{exp}_{kind}"
        artifacts.append(_artifact(
            run_dir, artifact_id=art_id, kind=kind,
            uri=f"artifact://experiments/{exp}/evaluation/{PARTITION}/{Path(out['path']).name}",
            rel=out["path"], expected_sha=out["sha256"]))
        refs[key] = {"artifact_id": art_id}

    experiment = {
        "experiment_id": exp,
        "model_family": rm["model_family"],
        "model_variant": rm["model_variant"],
        "decoder": rm["decoder"],
        "training_fraction": rm["training_fraction"],
        "split_manifest": {"manifest_id": split_ref["manifest_id"], "path": split_ref["path"],
                           "checksum": _checksum(run_dir, split_ref["path"], split_ref["sha256"],
                                                 "split manifest")},
        "training_subset_manifest": {"manifest_id": subset_ref["manifest_id"], "path": subset_ref["path"],
                                     "checksum": _checksum(run_dir, subset_ref["path"], subset_ref["sha256"],
                                                           "training subset manifest")},
        "seed": rm["seed"],
        "preprocessing_version": rm["preprocessing_version"],
        "postprocessing_version": pm["postprocessing_version"],
        "prediction_variant": variant,
        "evaluation_population_manifest": {
            "manifest_id": pop["manifest_id"], "path": pop["path"], "role": "FINAL_HOLDOUT",
            "case_count": len(pop_doc["case_ids"]),
            "checksum": _checksum(run_dir, pop["path"], pop["sha256"], "population manifest")},
        "evaluation_metric_version": em["evaluation_metric_version"],
        "training_code_version": rm["training_code_version"],
        "checkpoint": {"checkpoint_id": ckpt["checkpoint_id"], "path": ckpt["path"],
                       "checksum": _checksum(run_dir, ckpt["path"], ckpt["sha256"], "checkpoint")},
        "evaluation_code_version": em["evaluation_code_version"],
        "num_test_cases": len(intended),
        **refs,
    }
    return {
        "contract": CONTRACT,
        "contract_version": CONTRACT_VERSION,
        "manifest_id": manifest_id or default_manifest_id(exp, variant),
        "generated_at": generated_at or MF.now_iso(),
        "precomputed": True,
        "gates": {"gate_split_01": gate_split_01, "gate_ml_01": gate_ml_01},
        "experiment": experiment,
        "artifacts": artifacts,
        "analysis_runs": runs,
    }


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_contract2", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate(manifest: dict, run_dir: str | Path) -> dict:
    """Run the repository's Contract 2 validator. Returns {"status": "PASS"|"FAIL", ...}."""
    v = load_validator()
    try:
        return v.validate_manifest(manifest, Path(run_dir))
    except v.ContractError as exc:
        return {"status": "FAIL", "code": exc.code, "message": str(exc)}


def export(run_dir: str | Path, *, gate_split_01: str, gate_ml_01: str,
           manifest_id: str | None = None, split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST,
           allow_dirty_code: bool = False) -> Path:
    """Write contract2/<manifest_id>.json and, next to it, <manifest_id>.export.json: the
    export record (frozen split sha256, code versions, and whether dirty code was allowed).
    The Contract 2 schema admits no extra fields, so the record is a separate file."""
    run_dir = Path(run_dir)
    manifest = build_manifest(run_dir, gate_split_01=gate_split_01, gate_ml_01=gate_ml_01,
                              manifest_id=manifest_id, split_manifest=split_manifest,
                              allow_dirty_code=allow_dirty_code)
    out_dir = run_dir / MF.RUN_LAYOUT["contract2"]
    rm = D.load_json(run_dir / MF.RUN_LAYOUT["run_manifest"])
    pm = D.load_json(run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=PARTITION))
    em = D.load_json(run_dir / MF.RUN_LAYOUT["evaluation"].format(partition=PARTITION) / "evaluation_manifest.json")
    versions = code_versions(rm, pm, em)
    record = {"format": "ml-contract2-export/1", "manifest_id": manifest["manifest_id"],
              "frozen_split_sha256": D.sha256_file(split_manifest),
              "code_versions": versions,
              "dirty_code_versions": {k: v for k, v in versions.items() if not MF.is_clean_code_version(v)},
              "allow_dirty_code": bool(allow_dirty_code),
              "gates_as_asserted": manifest["gates"],
              "exported_at": MF.now_iso()}
    path = MF.write_json_new(out_dir / f"{manifest['manifest_id']}.json", manifest)
    MF.write_json_new(out_dir / f"{manifest['manifest_id']}.export.json", record)
    return path


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Export a run's final_holdout evaluation as Contract 2 DRAFT v0")
    ap.add_argument("--run-dir", required=True, type=Path)
    ap.add_argument("--gate-split-01", required=True, choices=GATE_STATES,
                    help="the recorded state of GATE-SPLIT-01 (no default, never assumed)")
    ap.add_argument("--gate-ml-01", required=True, choices=GATE_STATES,
                    help="the recorded state of GATE-ML-01 (no default, never assumed)")
    ap.add_argument("--manifest-id", default=None)
    ap.add_argument("--split-manifest", type=Path, default=D.DEFAULT_SPLIT_MANIFEST,
                    help="the FROZEN split the run must have used (default: the repository's)")
    ap.add_argument("--allow-dirty-code", action="store_true",
                    help="export although a code version is not a clean commit (recorded in the export record)")
    ap.add_argument("--validate", action="store_true", help="run validate_contract2.py on the result")
    args = ap.parse_args(argv)
    try:
        path = export(args.run_dir, gate_split_01=args.gate_split_01, gate_ml_01=args.gate_ml_01,
                      manifest_id=args.manifest_id, split_manifest=args.split_manifest,
                      allow_dirty_code=args.allow_dirty_code)
    except (ExportError, KeyError, FileNotFoundError, ValueError) as exc:
        print(f"EXPORT REFUSED: {type(exc).__name__}: {exc}")
        return 2
    print(f"wrote {path}")
    if args.validate:
        result = validate(D.load_json(path), args.run_dir)
        if result["status"] != "PASS":
            print(f"validate_contract2: FAIL [{result['code']}] {result['message']}")
            return 2
        print(f"validate_contract2: PASS ({result['analysis_runs']} analysis runs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
