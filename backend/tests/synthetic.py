"""A synthetic, data-free package that mirrors the real one's structure.

Nothing here is patient data: volumes are generated arrays written as NRRD
with the same default-affine header the LASC package carries (unit spacing,
zero origin), so ingestion, geometry status and serving are exercised exactly
as on the real cases. The Contract 2 package is synthetic too; its gates read
ACCEPTED only because the validator demands it, and it is evidence of nothing.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, List, Tuple

import nrrd
import numpy as np

NX, NY, NZ = 12, 10, 6  # non-square on purpose: a transposed slice cannot pass
HEADER = {
    "space": "left-posterior-superior",
    "space directions": np.eye(3),
    "space origin": np.zeros(3),
    "encoding": "raw",
}
TRAIN = ["CASE_0055"]
VALIDATION = ["CASE_9003", "CASE_9001"]  # unsorted on purpose; 9001 is INTEGRATION_CASE_001
HOLDOUT = ["CASE_9101", "CASE_0027", "CASE_0031"]  # rule skips CASE_0027 -> INT-12 = CASE_0031
INT12 = "CASE_0031"
INTEGRATION = "CASE_9001"


def mri_volume(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(NX, NY, NZ), dtype=np.uint8)


def gt_volume(seed: int) -> np.ndarray:
    volume = np.zeros((NX, NY, NZ), dtype=np.uint8)
    volume[2 + seed % 3: 8, 3:7, 1:5] = 255
    return volume


def prediction_volume(shift: int) -> np.ndarray:
    """A {0, 1} prediction, as ml/ writes them (write_mask_nrrd on the source grid)."""
    volume = np.zeros((NX, NY, NZ), dtype=np.uint8)
    volume[3 + shift: 9, 2:6 + shift, 1:4] = 1
    return volume


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_package(root: Path) -> Dict[str, object]:
    """Write the package, dataset manifest and split manifest under root."""
    package = root / "package"
    cases = []
    volumes: Dict[str, Dict[str, np.ndarray]] = {}
    for seed, case_id in enumerate(TRAIN + VALIDATION + HOLDOUT):
        partition = "Testing Set" if case_id in HOLDOUT else "Training Set"
        case_dir = package / partition / f"SCAN{seed:04d}"
        case_dir.mkdir(parents=True, exist_ok=True)
        mri, gt = mri_volume(seed), gt_volume(seed)
        nrrd.write(str(case_dir / "lgemri.nrrd"), mri, HEADER)
        if case_id == INT12:
            # The INT-12 ground truth must never be opened: a file that is not
            # an NRRD at all proves it, because reading it would fail.
            (case_dir / "laendo.nrrd").write_bytes(b"not an nrrd - must never be read")
        else:
            nrrd.write(str(case_dir / "laendo.nrrd"), gt, HEADER)
        volumes[case_id] = {"mri": mri, "gt": gt}
        cases.append({
            "case_id": case_id,
            "partition_as_released": partition,
            "mri": {"path_relative": f"{partition}/SCAN{seed:04d}/lgemri.nrrd", "shape": [NX, NY, NZ]},
            "mask": {"path_relative": f"{partition}/SCAN{seed:04d}/laendo.nrrd", "shape": [NX, NY, NZ]},
        })
    dataset_manifest = root / "dataset_manifest.json"
    dataset_manifest.write_text(json.dumps({"manifest_version": "synthetic", "acquisition": {"source_url": "synthetic"},
                                            "cases": cases}, indent=2), encoding="utf-8")
    split_manifest = root / "split_manifest.json"
    split_manifest.write_text(json.dumps({
        "split_id": "synthetic_split",
        "source_dataset_manifest": {"sha256": _sha(dataset_manifest)},
        "partitions": {
            "train": {"case_ids": TRAIN},
            "validation": {"case_ids": VALIDATION},
            "final_holdout": {"case_ids": HOLDOUT},
        },
    }, indent=2), encoding="utf-8")
    return {"package": package, "dataset_manifest": dataset_manifest, "split_manifest": split_manifest,
            "volumes": volumes}


def _nrrd_bytes(tmp: Path, volume: np.ndarray) -> bytes:
    nrrd.write(str(tmp), volume, HEADER)
    payload = tmp.read_bytes()
    tmp.unlink()
    return payload


METRIC_VERSION = "ml-eval-1.0.0"


def _zyx(volume_xyz: np.ndarray) -> np.ndarray:
    return np.transpose(volume_xyz, (2, 1, 0))


def case_metrics(case_id: str, prediction_xyz: np.ndarray, reference_xyz: np.ndarray) -> Tuple[dict, List[dict]]:
    """ml/evaluate.py's case record and per-slice rows (ml-eval-1.0.0 semantics), recomputed here."""
    p, r = _zyx(prediction_xyz) != 0, _zyx(reference_xyz) != 0
    tp = int(np.count_nonzero(p & r))
    pv, rv = int(np.count_nonzero(p)), int(np.count_nonzero(r))
    fp, fn = pv - tp, rv - tp
    rows = []
    for k in range(p.shape[0]):
        tpk = int(np.count_nonzero(p[k] & r[k]))
        pvk, rvk = int(np.count_nonzero(p[k])), int(np.count_nonzero(r[k]))
        fpk, fnk = pvk - tpk, rvk - tpk
        if rvk == 0 and pvk == 0:
            category, dice = "BOTH_EMPTY", None
        elif rvk == 0:
            category, dice = "PRED_ONLY", 0.0
        elif pvk == 0:
            category, dice = "REF_ONLY", 0.0
        else:
            category, dice = "BOTH_PRESENT", 2 * tpk / (2 * tpk + fpk + fnk)
        rows.append({"slice_index": k, "normalized_position": k / (p.shape[0] - 1), "category": category,
                     "dice": dice, "dice_status": "NOT_APPLICABLE" if dice is None else "VALUE",
                     "tp": tpk, "fp": fpk, "fn": fnk, "ref_voxels": rvk, "pred_voxels": pvk})
    applicable = [row["dice"] for row in rows if row["dice"] is not None]
    record = {"case_id": case_id, "status": "SUCCEEDED", "dice_3d": 2 * tp / (2 * tp + fp + fn),
              "iou_3d": tp / (tp + fp + fn), "tp_voxels": tp, "fp_voxels": fp, "fn_voxels": fn,
              "pred_voxels": pv, "ref_voxels": rv, "fp_fn_voxels": fp + fn,
              "relative_volume_error_percent": (pv - rv) / rv * 100.0, "volume_unit": "voxels",
              "num_slices": len(rows), "mean_slice_dice": float(np.mean(applicable)) if applicable else None}
    return record, rows


def _describe(values: List[float]) -> dict:
    x = np.asarray(values, dtype=np.float64)
    q1, median, q3 = np.quantile(x, [0.25, 0.5, 0.75])
    means = x[np.random.default_rng(2024).integers(0, x.size, size=(1000, x.size))].mean(axis=1)
    low, high = np.quantile(means, [0.025, 0.975])
    return {"n": int(x.size), "mean": float(x.mean()), "std": float(x.std(ddof=1)) if x.size > 1 else None,
            "median": float(median), "q1": float(q1), "q3": float(q3), "min": float(x.min()), "max": float(x.max()),
            "ci95_mean": {"method": "percentile bootstrap of the mean over cases", "low": float(low), "high": float(high)}}


def _write(run_dir: Path, rel: str, payload: bytes) -> dict:
    path = run_dir / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return {"algorithm": "sha256", "value": hashlib.sha256(payload).hexdigest()}


def _json(document: dict) -> bytes:
    return json.dumps(document, indent=1).encode("utf-8")


def build_contract2(run_dir: Path, package: Dict[str, object], experiment_id: str = "EXP-U-025",
                    gates_accepted: bool = True, prefix: str = "") -> Dict[str, object]:
    """One synthetic run directory exported the way ml/export_contract2.py exports it.

    Layout (artifact root = run_dir): manifests/, checkpoints/best.pt,
    predictions/final_holdout/<case>.nrrd, evaluation/final_holdout/{per_case_metrics,
    per_slice_metrics, metrics_summary}.json + metric_sets/<case>.json, and the
    manifest at contract2/<manifest_id>.json. Metrics are recomputed with the
    ml-eval-1.0.0 formulas from the synthetic references, so values are consistent.
    Population: the INT-12 case, two evaluation cases that are ingested, one FAILED
    run, and two holdout cases the backend does not ingest.
    """
    volumes = package["volumes"]
    population = ["CASE_0027", "CASE_0031", "CASE_9001", "CASE_9003", "CASE_9101"]
    failed = {"CASE_9003"}
    shifts = {"CASE_0027": 2, "CASE_0031": 1, "CASE_9001": 0, "CASE_9003": 2, "CASE_9101": 1}
    references = {case_id: volumes[case_id]["gt"] for case_id in population}
    references["CASE_0031"] = gt_volume(7)  # the package file is withheld (not an NRRD); score in memory
    exp = experiment_id
    scratch = run_dir / "scratch.nrrd"
    run_dir.mkdir(parents=True, exist_ok=True)
    artifacts, runs, records, per_slice, failures, predictions, prediction_files = [], [], [], {}, [], {}, {}
    for case_id in population:
        number = case_id.split("_")[1]
        run_id = f"RUN_{prefix}{number}"
        raw_id = f"ART_{run_id}_RAW"
        volume = prediction_volume(shifts[case_id])
        predictions[run_id] = volume
        rel = f"predictions/final_holdout/{case_id}.nrrd"
        prediction_files[run_id] = run_dir / rel
        raw_sum = _write(run_dir, rel, _nrrd_bytes(scratch, volume))
        artifacts.append({"artifact_id": raw_id, "kind": "RAW_PREDICTION_MASK",
                          "artifact_uri": f"artifact://experiments/{exp}/runs/{run_id}/raw_prediction.nrrd",
                          "source_path": rel, "media_type": "application/x-nrrd", "checksum": raw_sum,
                          "immutable": True, "case_id": case_id, "analysis_run_id": run_id})
        processed_id = None
        if case_id == "CASE_9001":
            processed_id = f"ART_{run_id}_PROCESSED"
            processed = volume.copy()
            processed[:, :, 3] = 0  # a deterministic post-processing difference
            prel = f"predictions/final_holdout/{case_id}_processed.nrrd"
            artifacts.append({"artifact_id": processed_id, "kind": "PROCESSED_PREDICTION_MASK",
                              "artifact_uri": f"artifact://experiments/{exp}/runs/{run_id}/processed_prediction.nrrd",
                              "source_path": prel, "media_type": "application/x-nrrd",
                              "checksum": _write(run_dir, prel, _nrrd_bytes(scratch, processed)), "immutable": True,
                              "case_id": case_id, "analysis_run_id": run_id, "source_artifact_id": raw_id})
        metric_ids = []
        if case_id in failed:
            failures.append({"case_id": case_id, "reason_code": "EVALUATION_ERROR", "reason": "synthetic failure"})
        else:
            record, rows = case_metrics(case_id, volume, references[case_id])
            records.append(record)
            per_slice[case_id] = rows
            eligible = sorted((row for row in rows if row["ref_voxels"] > 0),
                              key=lambda row: (row["dice"], -(row["fp"] + row["fn"]), row["slice_index"]))
            reference_file = Path(package["package"]) / next(
                item for item in json.loads(Path(package["dataset_manifest"]).read_text(encoding="utf-8"))["cases"]
                if item["case_id"] == case_id)["mask"]["path_relative"]
            metric_set = {
                "format": "ml-metric-set/1", "experiment_id": exp, "case_id": case_id,
                "evaluation_metric_version": METRIC_VERSION,
                "prediction_mask": {"kind": "RAW_PREDICTION", "path": rel, "sha256": raw_sum["value"]},
                "reference_mask": {"kind": "GROUND_TRUTH", "dataset_path_relative": "synthetic",
                                   "sha256": hashlib.sha256(reference_file.read_bytes()).hexdigest()},
                "metrics": record,
                "worst_slice_selection": {
                    "rule_id": "DR-010", "selection_version": "dr010-worst-slice/1.0.0", "metric_version": METRIC_VERSION,
                    "rule": "extra key, ignored by the API", "eligible_slice_count": len(eligible),
                    "slices": [{"slice_index": row["slice_index"], "dice": row["dice"], "false_positives": row["fp"],
                                "false_negatives": row["fn"]} for row in eligible]},
                "problematic_fp_slices": {"slices": []},
            }
            metric_id = f"ART_{run_id}_METRICS"
            mrel = f"evaluation/final_holdout/metric_sets/{case_id}.json"
            artifacts.append({"artifact_id": metric_id, "kind": "METRIC_SET",
                              "artifact_uri": f"artifact://experiments/{exp}/runs/{run_id}/metric_set.json",
                              "source_path": mrel, "media_type": "application/json",
                              "checksum": _write(run_dir, mrel, _json(metric_set)), "immutable": True,
                              "case_id": case_id, "analysis_run_id": run_id, "reference_mask_id": f"GT_{case_id}",
                              "reference_mask_kind": "GROUND_TRUTH", "prediction_mask_id": raw_id,
                              "prediction_mask_kind": "RAW_PREDICTION", "evaluation_version": METRIC_VERSION})
            metric_ids.append(metric_id)
        runs.append({"analysis_run_id": run_id, "case_id": case_id,
                     "status": "FAILED" if case_id in failed else "SUCCEEDED", "attempt_no": 1,
                     "raw_prediction_mask_id": raw_id, "processed_prediction_mask_id": processed_id,
                     "metric_set_ids": metric_ids, "reconstruction_ids": [],
                     "failure_reason": "synthetic failure" if case_id in failed else None})
    header = {"evaluation_metric_version": METRIC_VERSION, "experiment_id": exp,
              "population": {"role": "FINAL_HOLDOUT", "partition": "final_holdout", "case_ids": population},
              "prediction_variant": "RAW_PREDICTION", "reference_mask_kind": "GROUND_TRUTH",
              "intended_n": len(population), "successful_n": len(records), "failed_n": len(failures),
              "failures": failures}
    cohort = {"metrics": {key: _describe([record[key] for record in records])
                          for key in ("dice_3d", "iou_3d", "relative_volume_error_percent", "fp_voxels", "fn_voxels")},
              "outlier_selection": {"rule_id": "DR-010-outlier", "selection_version": "dr010-outlier/1.0.0", "cases": []}}
    outputs = {
        "per_case_metrics": dict(header, format="ml-per-case-metrics/1", cases=records),
        "per_slice_metrics": dict(header, format="ml-per-slice-metrics/1", cases=per_slice),
        "metrics_summary": dict(header, format="ml-metrics-summary/1", cohort=cohort),
    }
    kinds = {"metrics_summary": "METRICS_SUMMARY", "per_case_metrics": "PER_CASE_METRICS",
             "per_slice_metrics": "PER_SLICE_METRICS"}
    refs = {}
    for key, document in outputs.items():
        rel = f"evaluation/final_holdout/{key}.json"
        art_id = f"ART_{prefix}{kinds[key]}"
        artifacts.append({"artifact_id": art_id, "kind": kinds[key],
                          "artifact_uri": f"artifact://experiments/{exp}/evaluation/final_holdout/{key}.json",
                          "source_path": rel, "media_type": "application/json",
                          "checksum": _write(run_dir, rel, _json(document)), "immutable": True})
        refs[key] = {"artifact_id": art_id}

    def manifest_ref(manifest_id: str, rel: str, payload: bytes) -> dict:
        return {"manifest_id": manifest_id, "path": rel, "checksum": _write(run_dir, rel, payload)}

    manifest = {
        "contract": "contract2_experiment_artifact",
        "contract_version": "DRAFT v0",
        "manifest_id": f"exp-{exp.lower().replace('exp-', '')}-raw-holdout",
        "generated_at": "2026-10-01T00:00:00Z",
        "precomputed": True,
        "gates": {"gate_split_01": "ACCEPTED", "gate_ml_01": "ACCEPTED" if gates_accepted else "BLOCKED"},
        "experiment": dict({
            "experiment_id": exp, "model_family": "unet", "model_variant": "unet_base32_depth4",
            "decoder": "unet", "training_fraction": 0.25,
            "split_manifest": manifest_ref("synthetic_split", "manifests/split_manifest.json", b"split"),
            "training_subset_manifest": manifest_ref("subset-25", "manifests/training_subset_25_percent.json", b"subset"),
            "seed": 2024, "preprocessing_version": "ml-preproc-1.0.0", "postprocessing_version": "none",
            "prediction_variant": "RAW_PREDICTION",
            "evaluation_population_manifest": dict(manifest_ref(
                "holdout-final-54", "manifests/population_final_holdout.json", b"holdout"),
                role="FINAL_HOLDOUT", case_count=54),
            "evaluation_metric_version": METRIC_VERSION, "training_code_version": "git:synthetic",
            "checkpoint": {"checkpoint_id": f"{exp}/best", "path": "checkpoints/best.pt",
                           "checksum": _write(run_dir, "checkpoints/best.pt", b"synthetic checkpoint bytes")},
            "evaluation_code_version": "git:synthetic", "num_test_cases": 54,
        }, **refs),
        "artifacts": artifacts,
        "analysis_runs": runs,
    }
    manifest_path = run_dir / "contract2" / f"{manifest['manifest_id']}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"root": run_dir, "manifest": manifest, "manifest_path": manifest_path, "predictions": predictions,
            "prediction_files": prediction_files, "records": {record["case_id"]: record for record in records},
            "per_slice": per_slice}
