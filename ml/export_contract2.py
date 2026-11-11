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
(--split-manifest, default the repository's; no override, #64 R-1), and the training,
inference and evaluation code versions must be clean commits unless --allow-dirty-code is
passed (and recorded). The predictions manifest must carry a GATE-IMG-01 authorization
record (ml.holdout, #64 N-1) that authorizes this run's experiment_id + checkpoints/best.pt
sha256, and the evaluation must have been made under the same record.

Gate states are explicit inputs with no default: the manifest records what the operator
asserts, and contracts/ingestion/contract2_experiment_artifact/validate_contract2.py refuses
anything but ACCEPTED / ACCEPTED.

Failed cases (DR-018 rules 1 and 3). A case that failed in inference or in evaluation gets NO
analysis run. It stays listed, with its reason, in the PER_CASE_METRICS artifact's `failures`
(written by ml.evaluate), so `08` section 8.1 holds: nothing is dropped silently. The export
record names the failed case ids. `experiment.num_test_cases` is the intended population (54);
runs plus failures equal it.

PROCESSED runs (DR-018 rule 3). EXP-D-PP (ml.postprocess.derive_run) is exported with mask kind
PROCESSED_PREDICTION_MASK: per case one RAW_PREDICTION_MASK (the byte copy of the raw mask it
derives from, kept in the derived run), one PROCESSED_PREDICTION_MASK that cites it
(`source_artifact_id`), and a METRIC_SET whose prediction is the processed mask.
`postprocessing_config_sha256` and `derived_from` are written to <manifest_id>.export.json (the
Contract 2 schema admits no extra fields). A derived run holds no checkpoint file: the checkpoint
is identified by `derived_from.checkpoint_sha256`, and Contract 2 needs the file under the artifact
root, so the exporter takes the SOURCE run (--source-run), verifies its checkpoints/best.pt against
that sha256 and places it (hard link, else copy) at the derived run's checkpoints/best.pt.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import re
import shutil
import sys
from pathlib import Path

from ml import data as D
from ml import holdout as H
from ml import manifests as MF

CONTRACT ="contract2_experiment_artifact"
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


def materialize_derived_checkpoint(run_dir: Path, source_run: Path | None, derived: dict, ckpt: dict) -> None:
    """Contract 2 needs the checkpoint file under the artifact root. A derived run has none, so place the
    verified source checkpoint there (hard link on the same volume, else a copy)."""
    target = run_dir / ckpt["path"]
    if target.is_file():
        if D.sha256_file(target) != derived["checkpoint_sha256"]:
            raise ExportError(f"{ckpt['path']} in the derived run is not the checkpoint named by derived_from")
        return
    if source_run is None:
        raise ExportError("a derived (EXP-D-PP) run holds no checkpoint file: pass the source run "
                          "(--source-run <EXP-D-100 run>) so its checkpoint can be verified and placed")
    source = Path(source_run) / ckpt["path"]
    if not source.is_file():
        raise ExportError(f"the source run has no {ckpt['path']}")
    if D.sha256_file(source) != derived["checkpoint_sha256"]:
        raise ExportError("the source run's checkpoint sha256 differs from derived_from.checkpoint_sha256")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, target)
    except OSError:
        shutil.copyfile(source, target)
    if D.sha256_file(target) != derived["checkpoint_sha256"]:
        raise ExportError("the placed checkpoint does not match derived_from.checkpoint_sha256")


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
    post = (pm.get("postprocessing") or {}).get("code_version")
    if post is not None:
        out["postprocessing_code_version"] = post
    return out


def build_manifest(run_dir: str | Path, *, gate_split_01: str, gate_ml_01: str,
                   manifest_id: str | None = None, generated_at: str | None = None,
                   split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST,
                   allow_dirty_code: bool = False, allow_unfrozen_split: bool = False,
                   source_run: str | Path | None = None) -> dict:
    """The Contract 2 manifest for <run>'s final_holdout evaluation (not written to disk).

    split_manifest is the FROZEN split (default: the repository's) and must have the pinned
    sha256 ml.data.FROZEN_SPLIT_SHA256; the run's copy and every recorded split sha256 must
    equal it. This exporter handles final_holdout only, so the TEST-ONLY allow_unfrozen_split
    is refused. A training / inference / evaluation code version that is not a clean commit
    ("+dirty", "MIXED:...", "UNKNOWN") is refused unless allow_dirty_code=True, which export()
    records next to the manifest. The holdout authorization embedded in the predictions
    manifest must authorize this run, and the evaluation must name the same record.

    Failed cases get no analysis run (DR-018); PROCESSED_PREDICTION runs (EXP-D-PP, derived) are
    exported with PROCESSED_PREDICTION_MASK artifacts and need `source_run` for their checkpoint.
    """
    run_dir = Path(run_dir)
    try:
        H.refuse_unfrozen_split(PARTITION, allow_unfrozen_split)
        H.refuse_split_inside_run(split_manifest, run_dir)
    except MF.SplitMismatchError as exc:
        raise ExportError(str(exc)) from exc
    for name, state in (("gate_split_01", gate_split_01), ("gate_ml_01", gate_ml_01)):
        if state not in GATE_STATES:
            raise ExportError(f"{name} must be one of {GATE_STATES}, got {state!r}")
    pm_rel = MF.RUN_LAYOUT["predictions_manifest"].format(partition=PARTITION)
    em_rel = MF.RUN_LAYOUT["evaluation"].format(partition=PARTITION) + "/evaluation_manifest.json"
    try:
        rm = MF.validate_run_manifest(D.load_json(run_dir / MF.RUN_LAYOUT["run_manifest"]))
        pm = MF.validate_predictions_manifest(D.load_json(run_dir / pm_rel))
        em = MF.validate_evaluation_manifest(D.load_json(run_dir / em_rel))
    except FileNotFoundError as exc:
        raise ExportError(f"missing manifest: {Path(exc.filename or '').name or exc}") from exc
    except MF.ManifestError as exc:
        raise ExportError(str(exc)) from exc
    exp = rm["experiment_id"]
    if pm["population"]["partition"] != PARTITION or pm["population"]["role"] != MF.ROLES[PARTITION]:
        raise ExportError("predictions manifest is not a final_holdout / FINAL_HOLDOUT ml-predictions/1 manifest")
    if em["partition"] != PARTITION or em["population"]["role"] != MF.ROLES[PARTITION]:
        raise ExportError("evaluation manifest is not a final_holdout / FINAL_HOLDOUT ml-evaluation/1 manifest")
    if not (exp == pm.get("experiment_id") == em.get("experiment_id")):
        raise ExportError("run, predictions and evaluation name different experiments")
    if em["predictions_manifest"]["path"] != pm_rel:
        raise ExportError("the evaluation scored a different predictions manifest")
    _checksum(run_dir, pm_rel, em["predictions_manifest"]["sha256"], "predictions manifest")
    try:
        frozen_sha = MF.require_frozen_split(split_manifest, allow_unfrozen_split=allow_unfrozen_split)
    except MF.SplitMismatchError as exc:
        raise ExportError(f"the named split is not the frozen split: {exc}") from exc
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
    if ckpt["path"] != H.BEST_CHECKPOINT:
        raise ExportError(f"the run's checkpoint is {ckpt['path']!r}; holdout authorization covers {H.BEST_CHECKPOINT}")
    variant = pm["prediction_variant"]
    try:
        derived = MF.derived_from(pm)
    except MF.ManifestError as exc:
        raise ExportError(str(exc)) from exc
    config_sha = pm.get("postprocessing_config_sha256")
    if variant == "PROCESSED_PREDICTION":
        if derived is None:
            raise ExportError("a PROCESSED_PREDICTION run is exported only as a derived run "
                              "(ml.postprocess derive): its predictions manifest has no derived_from")
        if em.get("postprocessing_config_sha256") != config_sha:
            raise ExportError("the evaluation was made with another post-processing config than the predictions")
        if not (em["postprocessing_version"] == pm["postprocessing_version"] == rm["postprocessing_version"]):
            raise ExportError("the post-processing version differs between run, predictions and evaluation")
    elif derived is not None or config_sha is not None:
        raise ExportError("a RAW_PREDICTION run carries no derived_from / post-processing config")
    if derived is not None:
        if ckpt["sha256"] != derived["checkpoint_sha256"]:
            raise ExportError("the run's checkpoint differs from derived_from.checkpoint_sha256")
        materialize_derived_checkpoint(run_dir, Path(source_run) if source_run is not None else None, derived, ckpt)
    best_sha = _checksum(run_dir, ckpt["path"], ckpt["sha256"], "checkpoint")["value"]
    try:
        H.verify_embedded(pm["holdout_authorization"], split_sha256=frozen_sha, experiment_id=exp,
                          checkpoint_sha256=best_sha, prediction_variant=variant,
                          postprocessing_config_sha256=config_sha)
    except D.DataAccessError as exc:
        raise ExportError(f"holdout authorization: {exc}") from exc
    if (em.get("holdout_authorization") or {}).get("record_sha256") != pm["holdout_authorization"]["record_sha256"]:
        raise ExportError("the evaluation was not made under the predictions' holdout authorization record")
    if pm["prediction_variant"] != em["prediction_variant"]:
        raise ExportError("prediction variant differs between predictions and evaluation")
    intended = list(pm["intended_case_ids"])
    if sorted(c["case_id"] for c in pm["cases"]) != sorted(intended):
        raise ExportError("predictions manifest cases differ from its intended population")
    # DR-018 rules 1 and 3: a failed case has no analysis run; it stays listed, with its reason, in the
    # PER_CASE_METRICS failures. Every intended case is exactly a run (it has a metric set) or a failure.
    scored = set(em["metric_sets"])
    failed_pred = {c["case_id"] for c in pm["cases"] if c.get("status") != "SUCCEEDED"}
    pcm = em["outputs"]["per_case_metrics"]
    _checksum(run_dir, pcm["path"], pcm["sha256"], "per-case metrics")      # verified before it is read
    per_case = D.load_json(run_dir / pcm["path"])
    listed_rows = per_case.get("failures", [])
    listed = {f["case_id"] for f in listed_rows}
    if len(listed_rows) != len(listed) or listed & scored or scored | listed != set(intended):
        raise ExportError("every intended case must be exactly one of: a scored case (an analysis run) or a "
                          "failure listed in the PER_CASE_METRICS failures")
    if not failed_pred <= listed:
        raise ExportError("a case whose prediction failed must be listed in the PER_CASE_METRICS failures "
                          "and have no analysis run")
    if em.get("failed_n") != len(listed) or em.get("successful_n") != len(scored):
        raise ExportError("evaluation manifest counts differ from its metric sets and failures")
    failed = sorted(listed)

    pop = em["population"]
    pop_doc = D.load_json(run_dir / pop["path"])
    if (pop_doc.get("role") != "FINAL_HOLDOUT" or pop_doc.get("partition") != PARTITION
            or sorted(pop_doc["case_ids"]) != sorted(intended)):
        raise ExportError("population manifest is not the predicted final_holdout population")
    split_ref, subset_ref = rm["split_manifest"], rm["training_subset_manifest"]
    if pop_doc.get("source_split_manifest_sha256") != split_ref["sha256"]:
        raise ExportError("holdout population was derived from a different split manifest")

    mask_kind = "RAW_PREDICTION_MASK" if variant == "RAW_PREDICTION" else "PROCESSED_PREDICTION_MASK"
    pred_dir = Path(pm_rel).parent.as_posix()
    artifacts, runs = [], []
    for case in sorted(pm["cases"], key=lambda c: c["case_id"]):
        cid = case["case_id"]
        if cid not in scored:
            continue                               # no analysis run for a failed case (DR-018 rule 1)
        run_id = f"RUN_{exp}_{cid}"
        raw_id = f"ART_{exp}_{cid}_RAW"
        metric_id = f"ART_{exp}_{cid}_METRICS"
        if variant == "RAW_PREDICTION":
            artifacts.append(_artifact(
                run_dir, artifact_id=raw_id, kind="RAW_PREDICTION_MASK",
                uri=f"artifact://experiments/{exp}/runs/{run_id}/raw_prediction.nrrd",
                rel=f"{pred_dir}/{case['file']}", expected_sha=case["sha256"],
                case_id=cid, analysis_run_id=run_id))
            processed_id, prediction_id = None, raw_id
        else:
            processed_id = prediction_id = f"ART_{exp}_{cid}_PROCESSED"
            artifacts.append(_artifact(
                run_dir, artifact_id=raw_id, kind="RAW_PREDICTION_MASK",
                uri=f"artifact://experiments/{exp}/runs/{run_id}/raw_prediction.nrrd",
                rel=f"{pred_dir}/{case['raw_source_file']}", expected_sha=case["raw_source_sha256"],
                case_id=cid, analysis_run_id=run_id))
            artifacts.append(_artifact(
                run_dir, artifact_id=processed_id, kind=mask_kind,
                uri=f"artifact://experiments/{exp}/runs/{run_id}/processed_prediction.nrrd",
                rel=f"{pred_dir}/{case['file']}", expected_sha=case["sha256"],
                case_id=cid, analysis_run_id=run_id, source_artifact_id=raw_id,
                source_mask_kind="RAW_PREDICTION"))
        ms = em["metric_sets"][cid]
        artifacts.append(_artifact(
            run_dir, artifact_id=metric_id, kind="METRIC_SET",
            uri=f"artifact://experiments/{exp}/runs/{run_id}/metric_set.json",
            rel=ms["path"], expected_sha=ms["sha256"], case_id=cid, analysis_run_id=run_id,
            reference_mask_id=f"GT_{cid}", reference_mask_kind="GROUND_TRUTH",
            prediction_mask_id=prediction_id, prediction_mask_kind=variant,
            evaluation_version=em["evaluation_metric_version"]))
        runs.append({"analysis_run_id": run_id, "case_id": cid, "status": "SUCCEEDED", "attempt_no": 1,
                     "raw_prediction_mask_id": raw_id, "processed_prediction_mask_id": processed_id,
                     "metric_set_ids": [metric_id], "reconstruction_ids": [], "failure_reason": None})
    if not runs:
        raise ExportError("no case was scored: there is nothing to export")
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
           allow_dirty_code: bool = False, allow_unfrozen_split: bool = False,
           source_run: str | Path | None = None) -> Path:
    """Write contract2/<manifest_id>.json and, next to it, <manifest_id>.export.json: the
    export record (frozen split sha256, code versions, whether dirty code or an unfrozen
    split was allowed, the failed case ids, and for a PROCESSED run the post-processing config
    sha256 and `derived_from`). The Contract 2 schema admits no extra fields, so the record is a
    separate file."""
    run_dir = Path(run_dir)
    manifest = build_manifest(run_dir, gate_split_01=gate_split_01, gate_ml_01=gate_ml_01,
                              manifest_id=manifest_id, split_manifest=split_manifest,
                              allow_dirty_code=allow_dirty_code, allow_unfrozen_split=allow_unfrozen_split,
                              source_run=source_run)
    out_dir = run_dir / MF.RUN_LAYOUT["contract2"]
    rm = MF.validate_run_manifest(D.load_json(run_dir / MF.RUN_LAYOUT["run_manifest"]))
    pm = MF.validate_predictions_manifest(
        D.load_json(run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=PARTITION)))
    em = MF.validate_evaluation_manifest(
        D.load_json(run_dir / MF.RUN_LAYOUT["evaluation"].format(partition=PARTITION) / "evaluation_manifest.json"))
    versions = code_versions(rm, pm, em)
    per_case = D.load_json(run_dir / em["outputs"]["per_case_metrics"]["path"])
    record = {"format": "ml-contract2-export/1", "manifest_id": manifest["manifest_id"],
              "frozen_split_sha256": D.sha256_file(split_manifest),
              "code_versions": versions,
              "dirty_code_versions": {k: v for k, v in versions.items() if not MF.is_clean_code_version(v)},
              "allow_dirty_code": bool(allow_dirty_code),
              "frozen_split_pinned_sha256": D.FROZEN_SPLIT_SHA256,
              "allow_unfrozen_split": bool(allow_unfrozen_split),
              "holdout_authorization_record_sha256": pm["holdout_authorization"]["record_sha256"],
              "prediction_variant": pm["prediction_variant"],
              "postprocessing_config_sha256": pm.get("postprocessing_config_sha256"),
              "derived_from": MF.derived_from(pm),
              "failed_case_ids": sorted(f["case_id"] for f in per_case.get("failures", [])),
              "analysis_run_count": len(manifest["analysis_runs"]),
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
                    help="the FROZEN split (default: the repository's); any other sha256 is refused")
    ap.add_argument("--source-run", type=Path, default=None,
                    help="for a derived EXP-D-PP run: the EXP-D-100 run directory (its checkpoint is verified "
                         "and placed under the derived run, Contract 2 needs the file)")
    ap.add_argument("--allow-dirty-code", action="store_true",
                    help="export although a code version is not a clean commit (recorded in the export record)")
    ap.add_argument("--validate", action="store_true", help="run validate_contract2.py on the result")
    args = ap.parse_args(argv)
    try:
        path = export(args.run_dir, gate_split_01=args.gate_split_01, gate_ml_01=args.gate_ml_01,
                      manifest_id=args.manifest_id, split_manifest=args.split_manifest,
                      allow_dirty_code=args.allow_dirty_code, source_run=args.source_run)
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
