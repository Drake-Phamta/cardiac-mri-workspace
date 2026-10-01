"""A synthetic run directory in the shared layout (ml.manifests.RUN_LAYOUT).

It stands in for what ml/train.py and ml/infer.py write, so the evaluation and Contract 2
export can be tested on their own: manifests copied from the split, a dummy checkpoint
file (bytes only, in a temp dir), and raw prediction masks derived deterministically from
the reference masks (shifted by one voxel, so the metrics are not trivial).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from ml import data as D
from ml import manifests as MF


def predict_by_shift(ref: np.ndarray) -> np.ndarray:
    """Reference mask shifted one voxel along x: partial overlap, never identical."""
    return np.roll(ref, 1, axis=2)


def make_run_dir(run_dir: Path, pkg: dict, *, experiment_id: str = "EXP-U-025",
                 subset: str = "25_percent", partition: str = D.HOLDOUT_PARTITION,
                 predictor=predict_by_shift, fail_cases: tuple[str, ...] = (),
                 holdout_authorization: bool = True) -> Path:
    run_dir = Path(run_dir)
    split_bytes = Path(pkg["split_manifest_path"]).read_bytes()
    split = json.loads(split_bytes)
    split_sha = hashlib.sha256(split_bytes).hexdigest()
    split_rel = MF.RUN_LAYOUT["split_manifest_copy"]
    (run_dir / split_rel).parent.mkdir(parents=True, exist_ok=True)
    (run_dir / split_rel).write_bytes(split_bytes)
    subset_rel = MF.RUN_LAYOUT["training_subset_manifest"].format(subset=subset)
    subset_doc = MF.training_subset_manifest(split, subset, split_sha)
    MF.write_json_new(run_dir / subset_rel, subset_doc)
    pop_rel = MF.RUN_LAYOUT["population_manifest"].format(partition=partition)
    pop_doc = MF.population_manifest(split, partition, split_sha)
    MF.write_json_new(run_dir / pop_rel, pop_doc)
    ckpt_rel = f"{MF.RUN_LAYOUT['checkpoints']}/best.pt"
    (run_dir / ckpt_rel).parent.mkdir(parents=True, exist_ok=True)
    (run_dir / ckpt_rel).write_bytes(b"synthetic checkpoint bytes - not a model")
    ckpt_sha = D.sha256_file(run_dir / ckpt_rel)
    val_rel = MF.RUN_LAYOUT["population_manifest"].format(partition="validation")
    if not (run_dir / val_rel).exists():
        MF.write_json_new(run_dir / val_rel, MF.population_manifest(split, "validation", split_sha))
    val_doc = json.loads((run_dir / val_rel).read_text(encoding="utf-8"))
    run_manifest = {            # the ml-run-manifest/1 fields ml.train writes (`08` section 10)
        "format": MF.RUN_MANIFEST_FORMAT,
        "status": "COMPLETE",
        "experiment_id": experiment_id,
        "model_family": "unet",
        "model_variant": "unet_base32_depth4",
        "decoder": "unet",
        "training_fraction": MF.SUBSET_FRACTIONS[subset],
        "training_subset": subset,
        "split_manifest": {"manifest_id": split["split_id"], "path": split_rel, "sha256": split_sha},
        "training_subset_manifest": {"manifest_id": subset_doc["manifest_id"], "path": subset_rel,
                                     "sha256": D.sha256_file(run_dir / subset_rel)},
        "seed": 2024,
        "preprocessing_version": D.PREPROCESSING_VERSION,
        "postprocessing_version": "none",
        "prediction_variant": "RAW_PREDICTION",
        "evaluation_population_manifest": {"manifest_id": val_doc["manifest_id"], "path": val_rel,
                                           "sha256": D.sha256_file(run_dir / val_rel), "role": "VALIDATION",
                                           "case_count": val_doc["case_count"]},
        "evaluation_metric_version": "ml-eval-1.0.0",
        "training_code_version": "git:synthetic-fixture",
        "checkpoint": {"checkpoint_id": f"{experiment_id}/best", "path": ckpt_rel, "sha256": ckpt_sha},
        "evaluation_code_version": "git:synthetic-fixture",
        "num_test_cases": val_doc["case_count"],
    }
    MF.write_json_new(run_dir / MF.RUN_LAYOUT["run_manifest"], run_manifest)

    if partition == D.HOLDOUT_PARTITION:
        allow = D.CaseAllowlist.for_holdout(split, allow_holdout=True)   # what infer does when authorised
    else:
        allow = D.CaseAllowlist.for_validation(split)
    paths = D.case_paths(pkg["dataset"], pkg["package_root"], allowlist=allow)
    pred_rel = MF.RUN_LAYOUT["predictions"].format(partition=partition)
    cases = []
    for cid in allow:
        if cid in fail_cases:
            cases.append({"case_id": cid, "status": "FAILED", "failure_reason": "synthetic failure"})
            continue
        ref, _, _ = D.load_mask(cid, paths)
        _, mri_header, info = D.load_image(cid, paths)
        pred = predictor(ref).astype(np.uint8)
        digest = D.write_mask_nrrd(run_dir / pred_rel / f"{cid}.nrrd", pred, mri_header)
        cases.append({"case_id": cid, "status": "SUCCEEDED", "file": f"{cid}.nrrd", "sha256": digest,
                      "source_mri_sha256": info["mri_sha256"],
                      "shape_xyz": list(reversed(pred.shape))})
    pm = {
        "format": MF.PREDICTIONS_FORMAT,
        "experiment_id": experiment_id,
        "split_manifest": {"manifest_id": split["split_id"], "path": split_rel, "sha256": split_sha},
        "population": {"partition": partition, "role": pop_doc["role"], "manifest_id": pop_doc["manifest_id"],
                       "path": pop_rel, "sha256": D.sha256_file(run_dir / pop_rel),
                       "case_count": pop_doc["case_count"]},
        "intended_case_ids": allow.case_ids,
        "prediction_variant": "RAW_PREDICTION",
        "postprocessing_version": "none",
        "threshold": 0.5,
        "checkpoint": {"checkpoint_id": f"{experiment_id}/best", "path": ckpt_rel, "sha256": ckpt_sha},
        "holdout_authorization": ({"confirm_frozen_morphology_sha256": "0" * 64}
                                  if partition == D.HOLDOUT_PARTITION and holdout_authorization else None),
        "cases": cases,
    }
    MF.write_json_new(run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=partition), pm)
    return run_dir
