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
from typing import Dict

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


def _artifact(root: Path, artifact_id: str, kind: str, name: str, payload: bytes, media_type: str, **extra) -> dict:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    record = {
        "artifact_id": artifact_id, "kind": kind, "artifact_uri": f"artifact://synthetic/{name}",
        "source_path": name, "media_type": media_type,
        "checksum": {"algorithm": "sha256", "value": hashlib.sha256(payload).hexdigest()}, "immutable": True,
    }
    record.update(extra)
    return record


def _nrrd_bytes(tmp: Path, volume: np.ndarray) -> bytes:
    nrrd.write(str(tmp), volume, HEADER)
    payload = tmp.read_bytes()
    tmp.unlink()
    return payload


def build_contract2(root: Path, experiment_id: str = "EXP-U-025", gates_accepted: bool = True,
                    prefix: str = "") -> Dict[str, object]:
    """One synthetic Contract 2 package: three runs (one FAILED), raw + processed masks."""
    root.mkdir(parents=True, exist_ok=True)
    scratch = root / "scratch.nrrd"

    def ref(manifest_id: str, name: str, payload: bytes) -> dict:
        (root / name).write_bytes(payload)
        return {"manifest_id": manifest_id, "path": name,
                "checksum": {"algorithm": "sha256", "value": hashlib.sha256(payload).hexdigest()}}

    cases = {"9001": prediction_volume(0), "0031": prediction_volume(1), "9003": prediction_volume(2)}
    predictions = {f"RUN_{prefix}{number}": volume for number, volume in cases.items()}
    artifacts = []
    runs = []
    for number, volume in cases.items():
        run_id = f"RUN_{prefix}{number}"
        case_id = f"CASE_{number}"
        raw_id = f"ART_{run_id}_RAW"
        artifacts.append(_artifact(root, raw_id, "RAW_PREDICTION_MASK", f"{run_id}/raw.nrrd",
                                   _nrrd_bytes(scratch, volume), "application/octet-stream",
                                   case_id=case_id, analysis_run_id=run_id))
        processed_id = None
        if number == "9001":
            processed_id = f"ART_{run_id}_PROCESSED"
            processed = volume.copy()
            processed[:, :, 3] = 0  # a deterministic post-processing difference
            artifacts.append(_artifact(root, processed_id, "PROCESSED_PREDICTION_MASK", f"{run_id}/processed.nrrd",
                                       _nrrd_bytes(scratch, processed), "application/octet-stream",
                                       case_id=case_id, analysis_run_id=run_id, source_artifact_id=raw_id))
        failed = number == "9003"
        runs.append({
            "analysis_run_id": run_id, "case_id": case_id, "status": "FAILED" if failed else "SUCCEEDED",
            "attempt_no": 1, "raw_prediction_mask_id": raw_id, "processed_prediction_mask_id": processed_id,
            "metric_set_ids": [], "reconstruction_ids": [],
            "failure_reason": "synthetic failure" if failed else None,
        })
    artifacts.append(_artifact(root, f"ART_{prefix}SUMMARY", "METRICS_SUMMARY", "summary.json", b"{}", "application/json"))
    artifacts.append(_artifact(root, f"ART_{prefix}CASES", "PER_CASE_METRICS", "per_case.json", b"{}", "application/json"))
    artifacts.append(_artifact(root, f"ART_{prefix}SLICES", "PER_SLICE_METRICS", "per_slice.json", b"{}", "application/json"))
    manifest = {
        "contract": "contract2_experiment_artifact",
        "contract_version": "DRAFT v0",
        "manifest_id": f"exp-synthetic-{experiment_id.lower()}",
        "generated_at": "2026-10-01T00:00:00Z",
        "precomputed": True,
        "gates": {"gate_split_01": "ACCEPTED", "gate_ml_01": "ACCEPTED" if gates_accepted else "BLOCKED"},
        "experiment": {
            "experiment_id": experiment_id, "model_family": "synthetic-unet", "model_variant": "v1",
            "decoder": "standard", "training_fraction": 0.25,
            "split_manifest": ref("synthetic_split", "split.json", b"split"),
            "training_subset_manifest": ref("subset-25", "subset.json", b"subset"),
            "seed": 2024, "preprocessing_version": "prep-v1", "postprocessing_version": "none",
            "prediction_variant": "RAW_PREDICTION",
            "evaluation_population_manifest": dict(ref("holdout-final-54", "holdout.json", b"holdout"),
                                                   role="FINAL_HOLDOUT", case_count=54),
            "evaluation_metric_version": "dice-v1", "training_code_version": "git:synthetic",
            "checkpoint": {"checkpoint_id": "ckpt-synthetic", "path": "checkpoint.bin",
                           "checksum": ref("x", "checkpoint.bin", b"checkpoint")["checksum"]},
            "evaluation_code_version": "eval-v1", "num_test_cases": 54,
            "metrics_summary": {"artifact_id": f"ART_{prefix}SUMMARY"},
            "per_case_metrics": {"artifact_id": f"ART_{prefix}CASES"},
            "per_slice_metrics": {"artifact_id": f"ART_{prefix}SLICES"},
        },
        "artifacts": artifacts,
        "analysis_runs": runs,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return {"root": root, "manifest": manifest, "predictions": predictions}
