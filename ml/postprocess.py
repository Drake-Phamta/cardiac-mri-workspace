"""Deterministic post-processing of binary 3D prediction masks (GATE-IMG-01, `07` section 5).

The candidate set is the closed list pre-declared in
`management/day39/RECOVERY_OVERRIDE_DAY39.md` section 4. Every candidate takes the RAW binary
mask volume, `[z, y, x]` as `ml.infer` / `ml.data.read_nrrd_zyx` give it (`z`, the slice axis,
is array axis 0), and returns a binary mask of the SAME dtype ({0, 1}, uint8 for the masks
`ml.infer` writes). The input array is never modified.

    ID    operations, in order
    PP-0  identity (reference only, NOT eligible for selection)
    PP-1  keep the largest 3D connected component (26-connectivity)
    PP-2  per-slice 2D hole filling, then PP-1
    PP-3  3D closing (3x3x3 cube, 1 iteration), then PP-1
    PP-4  3D opening (3x3x3 cube, 1 iteration), then PP-1
    PP-5  3D closing (as PP-3), then per-slice 2D hole filling, then PP-1

An empty mask stays empty under every candidate.

Exact semantics (all with scipy.ndimage, nothing else):
  * largest component: `ndimage.label` with `generate_binary_structure(3, 3)` (26-connectivity).
    The component with the most voxels is kept; on an exact size tie the one with the LOWEST
    label, i.e. the one whose first voxel comes first in C order (z, then y, then x), is kept.
  * 2D hole filling: `ndimage.binary_fill_holes` on every `[y, x]` slice (axis 0 is the slice
    axis), default structuring element `generate_binary_structure(2, 1)`: the background is
    4-connected and floods in from the slice border, so a background region that touches the
    slice border is never a hole. Slices are filled independently of each other.
  * closing: `ndimage.binary_closing`, 3x3x3 cube, 1 iteration, `border_value=0`. scipy
    pads nothing, so on the bare volume the erosion half of the closing would eat foreground that
    touches the volume border. The volume is therefore zero-padded by ONE voxel before the closing
    and cropped afterwards: the closing is then extensive (output contains input) everywhere and the
    volume border neither erodes nor shrinks the result. A closing never reaches beyond the volume
    (the padding is cropped).
  * opening: `ndimage.binary_opening`, 3x3x3 cube, 1 iteration, `border_value=0`, no padding. The
    outside of the volume counts as background, so a 3x3x3 cube must lie inside the volume to
    support a voxel; a structure at least 3 voxels thick keeps its voxels on the border slice,
    and only thinner structure is removed.

`CONFIGS` is the candidate table; `apply(config, mask)` runs one. The winner of the selection is
frozen as a JSON file, format `ml-postprocess-config/1`; its sha256 (`config_sha256`) is the
`postprocessing_config_sha256` of the GATE-IMG-01 authorization record.

    python -m ml.postprocess derive --source-run <EXP-D-100 run> --population validation|holdout
        --config <frozen.json> --out-run <new run dir> [--holdout-authorization <record.json>]

derives the EXP-D-PP run from a RAW run's predictions (see `derive_run`).
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

import numpy as np
from scipy import ndimage

from ml import data as D
from ml import evaluate as E
from ml import holdout as H
from ml import manifests as MF

POSTPROCESS_VERSION = "ml-postprocess-1.0.0"
CONFIG_FORMAT = "ml-postprocess-config/1"
SOURCE_RULE = "management/day39/RECOVERY_OVERRIDE_DAY39.md §4"
PREDICTION_VARIANT = "PROCESSED_PREDICTION"
DERIVED_EXPERIMENT_ID = MF.DERIVED_EXPERIMENT_ID          # "EXP-D-PP"
SOURCE_EXPERIMENT_ID = MF.DERIVED_SOURCE_EXPERIMENT_ID    # "EXP-D-100"
SLICE_AXIS = 0                                            # arrays are [z, y, x]
MODULE_PATH = "ml/postprocess.py"
FROZEN_CONFIG_NAME = "postprocess_config.frozen.json"
RAW_COPY_DIR = "raw_source"                               # inside predictions/<partition>/

# --- the operations (canonical parameter sets; a config file must match one of them exactly) ----

OP_LARGEST = {"op": "largest_component_3d", "connectivity": 26,
              "structuring_element": "generate_binary_structure(3, 3)",
              "tie_break": "lowest label (first voxel in C order)"}
OP_FILL = {"op": "fill_holes_2d_per_slice", "slice_axis": SLICE_AXIS,
           "background_connectivity": 4, "structuring_element": "generate_binary_structure(2, 1)"}
OP_CLOSE = {"op": "closing_3d", "structuring_element": "cube", "size": 3, "iterations": 1,
            "border_value": 0, "border": "zero-padded by 1 voxel before closing, cropped after "
                                         "(volume edge does not erode)"}
OP_OPEN = {"op": "opening_3d", "structuring_element": "cube", "size": 3, "iterations": 1,
           "border_value": 0, "border": "outside the volume is background; no padding"}
OPERATIONS = {op["op"]: op for op in (OP_LARGEST, OP_FILL, OP_CLOSE, OP_OPEN)}


def _config(config_id: str, ops: list[dict], summary: str, eligible: bool = True) -> dict:
    return {"id": config_id, "eligible": eligible, "summary": summary,
            "operations": [copy.deepcopy(o) for o in ops]}


CONFIGS: dict[str, dict] = {c["id"]: c for c in (
    _config("PP-0", [], "identity (the raw mask); reference only, not eligible", eligible=False),
    _config("PP-1", [OP_LARGEST], "largest 3D connected component (26-connectivity)"),
    _config("PP-2", [OP_FILL, OP_LARGEST], "per-slice 2D hole filling, then PP-1"),
    _config("PP-3", [OP_CLOSE, OP_LARGEST], "3D closing (3x3x3 cube, 1 iteration), then PP-1"),
    _config("PP-4", [OP_OPEN, OP_LARGEST], "3D opening (3x3x3 cube, 1 iteration), then PP-1"),
    _config("PP-5", [OP_CLOSE, OP_FILL, OP_LARGEST], "3D closing (as PP-3), per-slice 2D hole filling, then PP-1"),
)}
ELIGIBLE_IDS = tuple(i for i, c in CONFIGS.items() if c["eligible"])

_CUBE = np.ones((3, 3, 3), dtype=bool)
_CONN26 = ndimage.generate_binary_structure(3, 3)


class PostprocessError(ValueError):
    """A mask or a config file the post-processing refuses."""


# --- the pure functions ----------------------------------------------------------------------

def largest_component_3d(mask: np.ndarray) -> np.ndarray:
    """Boolean mask of the largest 26-connected component (empty in, empty out)."""
    labels, n = ndimage.label(mask, structure=_CONN26)
    if n == 0:
        return np.zeros(mask.shape, dtype=bool)
    sizes = np.bincount(labels.ravel(), minlength=n + 1)[1:]
    return labels == (1 + int(np.argmax(sizes)))          # argmax: the first (lowest label) on a tie


def fill_holes_2d_per_slice(mask: np.ndarray) -> np.ndarray:
    """Fill the holes of every [y, x] slice (axis 0 is the slice axis), slice by slice."""
    out = np.zeros(mask.shape, dtype=bool)
    for k in range(mask.shape[SLICE_AXIS]):
        out[k] = ndimage.binary_fill_holes(mask[k])
    return out


def closing_3d(mask: np.ndarray) -> np.ndarray:
    """3x3x3-cube closing, 1 iteration, on the volume zero-padded by one voxel (cropped after)."""
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    closed = ndimage.binary_closing(padded, structure=_CUBE, iterations=1, border_value=0)
    return closed[1:-1, 1:-1, 1:-1]


def opening_3d(mask: np.ndarray) -> np.ndarray:
    """3x3x3-cube opening, 1 iteration; the outside of the volume is background."""
    return ndimage.binary_opening(mask, structure=_CUBE, iterations=1, border_value=0)


_FUNCTIONS = {"largest_component_3d": largest_component_3d,
              "fill_holes_2d_per_slice": fill_holes_2d_per_slice,
              "closing_3d": closing_3d, "opening_3d": opening_3d}


def _as_bool(mask) -> np.ndarray:
    a = np.asarray(mask)
    if a.ndim != 3:
        raise PostprocessError(f"expected a 3D [z, y, x] mask, got shape {a.shape}")
    if a.dtype == np.bool_:
        return a
    if not np.issubdtype(a.dtype, np.integer):
        raise PostprocessError(f"mask dtype {a.dtype} is not bool or integer")
    if a.size and (int(a.min()) < 0 or int(a.max()) > 1):
        raise PostprocessError("mask values must be in {0, 1}")
    return a.astype(bool)


def _operations(config) -> list[dict]:
    """The ordered operation list of a candidate id, a CONFIGS entry or a frozen config dict."""
    if isinstance(config, str):
        if config not in CONFIGS:
            raise PostprocessError(f"unknown post-processing candidate {config!r}; known: {sorted(CONFIGS)}")
        return CONFIGS[config]["operations"]
    ops = config.get("operations") if isinstance(config, dict) else None
    if not isinstance(ops, list):
        raise PostprocessError("a config needs an `operations` list")
    return ops


def apply_operations(operations: list[dict], mask) -> np.ndarray:
    """Run `operations` in order on a binary [z, y, x] mask; same dtype out as in.

    Each operation must be one of the canonical parameter sets in OPERATIONS (a different
    kernel size, iteration count or connectivity is refused, never silently reinterpreted).
    """
    src = np.asarray(mask)
    current = _as_bool(src)
    for op in operations:
        canon = OPERATIONS.get(op.get("op")) if isinstance(op, dict) else None
        if canon is None or op != canon:
            raise PostprocessError(f"operation {op!r} is not one of the canonical operations")
    if not current.any():
        return np.zeros(src.shape, dtype=src.dtype)           # empty in -> empty out
    for op in operations:
        current = _FUNCTIONS[op["op"]](current)
    return current.astype(src.dtype)


def apply(config, mask) -> np.ndarray:
    """Apply a candidate (id such as "PP-3", a CONFIGS entry, or a frozen config) to a mask."""
    return apply_operations(_operations(config), mask)


# --- the frozen config -----------------------------------------------------------------------

def config_sha256(path) -> str:
    """sha256 of the file's bytes (the `postprocessing_config_sha256` of the authorization record)."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def module_code_version(repo_root: str | os.PathLike = D.REPO_ROOT) -> dict:
    """{"commit", "dirty", "version"}: the last git commit that changed ml/postprocess.py, and whether
    the file differs from it. Without git: commit None, version "UNKNOWN"."""
    try:
        commit = subprocess.run(["git", "-C", str(repo_root), "log", "-n", "1", "--format=%H", "--", MODULE_PATH],
                                capture_output=True, text=True, timeout=30, check=True).stdout.strip()
        status = subprocess.run(["git", "-C", str(repo_root), "status", "--porcelain", "--", MODULE_PATH],
                                capture_output=True, text=True, timeout=30, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "dirty": None, "version": "UNKNOWN"}
    if not commit:
        return {"commit": None, "dirty": True, "version": "UNKNOWN"}
    dirty = bool(status)
    return {"commit": commit, "dirty": dirty, "version": f"git:{commit}" + ("+dirty" if dirty else "")}


def frozen_config(config_id: str, code_version: str) -> dict:
    """The `ml-postprocess-config/1` document of an eligible candidate."""
    if config_id not in ELIGIBLE_IDS:
        raise PostprocessError(f"{config_id!r} cannot be frozen; eligible: {list(ELIGIBLE_IDS)}")
    if not isinstance(code_version, str) or not code_version.startswith("git:"):
        raise PostprocessError("code_version must be 'git:<commit>'")
    return {"format": CONFIG_FORMAT, "config_id": config_id,
            "operations": copy.deepcopy(CONFIGS[config_id]["operations"]),
            "code_version": code_version, "source_rule": SOURCE_RULE}


def write_frozen_config(path, config_id: str, code_version: str) -> str:
    """Write the frozen config to a NEW file; return its sha256."""
    MF.write_json_new(path, frozen_config(config_id, code_version))
    return config_sha256(path)


def load_frozen_config(path) -> tuple[dict, str]:
    """(config, sha256 of the file bytes). The file must be exactly the documented format, name an
    eligible candidate, and carry exactly that candidate's operations."""
    raw = Path(path).read_bytes()
    try:
        doc = json.loads(raw.decode("utf-8-sig"))
    except ValueError as exc:
        raise PostprocessError(f"{Path(path).name} is not valid JSON: {exc}") from exc
    keys = {"format", "config_id", "operations", "code_version", "source_rule"}
    if not isinstance(doc, dict) or set(doc) != keys:
        raise PostprocessError(f"a frozen config has exactly the keys {sorted(keys)}")
    if doc["format"] != CONFIG_FORMAT:
        raise PostprocessError(f"format must be {CONFIG_FORMAT!r}")
    if doc["config_id"] not in ELIGIBLE_IDS:
        raise PostprocessError(f"config_id {doc['config_id']!r} is not an eligible candidate {list(ELIGIBLE_IDS)}")
    if doc["operations"] != CONFIGS[doc["config_id"]]["operations"]:
        raise PostprocessError(f"operations do not match the declared candidate {doc['config_id']}")
    if doc["source_rule"] != SOURCE_RULE:
        raise PostprocessError("source_rule is not the pre-declared GATE-IMG-01 rule")
    if not isinstance(doc["code_version"], str) or not doc["code_version"].startswith("git:"):
        raise PostprocessError("code_version must be 'git:<commit>'")
    return doc, hashlib.sha256(raw).hexdigest()


def postprocessing_version(config_id: str) -> str:
    return f"{POSTPROCESS_VERSION}:{config_id}"


# --- EXP-D-PP: derive a PROCESSED run from the RAW predictions of EXP-D-100 -------------------

def _copy_new(src: Path, dst: Path) -> str:
    """Byte-copy `src` to a NEW `dst` (or confirm an existing `dst` is byte-identical); return sha256."""
    data = src.read_bytes()
    if dst.exists():
        if dst.read_bytes() != data:
            raise FileExistsError(f"{dst.name} exists and differs from {src.name}; derived runs never overwrite")
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        with open(dst, "xb") as f:
            f.write(data)
    return hashlib.sha256(data).hexdigest()


def derive_run(source_run: str | Path, partition: str, config_path: str | Path, out_run: str | Path, *,
               holdout_authorization: str | os.PathLike | None = None,
               split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST,
               allow_unfrozen_split: bool = False, log=print) -> Path:
    """Create <out_run> (experiment EXP-D-PP) from <source_run>'s RAW predictions of `partition`.

    Reads only the source run's prediction files (never the MRI or the reference masks, so nothing
    but the predictions of the named population is touched), applies the frozen config to every
    successful case and writes, all under <out_run> and never over an existing file:
        manifests/split_manifest.json, training_subset_<subset>.json, population_<partition>.json
                                                          byte copies of the source's
        postprocessing/postprocess_config.frozen.json     byte copy of the config (sha256 = the record's)
        predictions/<partition>/<case>.nrrd               PROCESSED masks, the RAW header geometry
        predictions/<partition>/raw_source/<case>.nrrd    byte copies of the RAW masks they derive from
        predictions/<partition>/predictions_manifest.json PROCESSED_PREDICTION, postprocessing_version,
                                                          postprocessing_config_sha256,
                                                          derived_from {experiment_id, partition,
                                                          predictions_manifest_sha256, checkpoint_sha256, ...}
        config.json, run_manifest.json (the latter written last)
    The source's checkpoint is NOT copied: it is identified by derived_from.checkpoint_sha256, which
    the holdout authorization must list for EXP-D-PP (ml.holdout).

    final_holdout needs holdout_authorization (ml.holdout record) that authorizes EXP-D-PP and the
    source run with the sha256 of the source's checkpoints/best.pt, freezes this very config
    (record.postprocessing_config_sha256 == the config file's sha256), and is the record the source's
    RAW holdout predictions were made under; it is embedded exactly as ml.infer embeds it.
    A failed RAW case stays FAILED in the derived manifest; a case that cannot be processed aborts
    the derivation (nothing is committed; a temporary directory is left for inspection).
    """
    source_run, out_run, config_path = Path(source_run), Path(out_run), Path(config_path)
    if partition not in ("validation", D.HOLDOUT_PARTITION):
        raise ValueError("partition must be 'validation' or 'final_holdout'")
    holdout = partition == D.HOLDOUT_PARTITION
    loaded = None
    if holdout:
        H.refuse_unfrozen_split(partition, allow_unfrozen_split)
        if holdout_authorization is None:
            raise H.HoldoutAuthorizationError("deriving the final_holdout run needs --holdout-authorization "
                                              "<record.json> (GATE-IMG-01)")
        loaded = H.load_record(holdout_authorization)        # JSON + structure first; run checks below
    elif holdout_authorization is not None:
        raise ValueError("a holdout authorization was given for a non-holdout population")
    for run in (source_run, out_run):
        H.refuse_split_inside_run(split_manifest, run)
    if source_run.resolve() == out_run.resolve() or out_run.resolve().is_relative_to(source_run.resolve()) \
            or source_run.resolve().is_relative_to(out_run.resolve()):
        raise ValueError("the derived run directory must be separate from the source run directory")
    config, config_sha = load_frozen_config(config_path)
    config_id = config["config_id"]

    pm_rel = MF.RUN_LAYOUT["predictions_manifest"].format(partition=partition)
    pm_path = source_run / pm_rel
    pm = MF.validate_predictions_manifest(D.load_json(pm_path))
    pm_sha = D.sha256_file(pm_path)
    if pm["experiment_id"] != SOURCE_EXPERIMENT_ID:
        raise ValueError(f"{DERIVED_EXPERIMENT_ID} is derived from {SOURCE_EXPERIMENT_ID} only, "
                         f"not from {pm['experiment_id']!r}")
    if pm["prediction_variant"] != "RAW_PREDICTION" or pm.get("derived_from") is not None:
        raise ValueError("the source predictions must be RAW_PREDICTION (a derived run cannot be derived again)")
    if pm["population"]["partition"] != partition or pm["population"]["role"] != MF.ROLES[partition]:
        raise ValueError(f"source predictions manifest is for {pm['population']['partition']!r}, not {partition!r}")
    split, split_sha = E.load_run_split(source_run, partition, frozen_split=split_manifest,
                                        allow_unfrozen_split=allow_unfrozen_split)
    rm_src = MF.validate_run_manifest(D.load_json(source_run / MF.RUN_LAYOUT["run_manifest"]))
    if rm_src["experiment_id"] != SOURCE_EXPERIMENT_ID or rm_src["status"] != "COMPLETE":
        raise ValueError("the source run manifest is not a COMPLETE EXP-D-100 run")
    ckpt = pm["checkpoint"]
    if holdout and ckpt.get("path") != H.BEST_CHECKPOINT:
        raise H.HoldoutAuthorizationError(f"holdout predictions must come from {H.BEST_CHECKPOINT}")
    best = source_run / ckpt["path"]
    if not best.is_file():
        raise FileNotFoundError(f"{ckpt['path']} is missing from the source run; its sha256 cannot be verified")
    best_sha = D.sha256_file(best)
    if best_sha != ckpt["sha256"] or best_sha != rm_src["checkpoint"]["sha256"]:
        raise ValueError("the source checkpoint's sha256 differs from the predictions / run manifest")

    authorization = None
    if holdout:                                  # verified before anything is read or written
        authorization = H.verified_block(*loaded, split_sha256=split_sha, experiment_id=DERIVED_EXPERIMENT_ID,
                                         checkpoint_sha256=best_sha, prediction_variant=PREDICTION_VARIANT,
                                         postprocessing_config_sha256=config_sha)
        H.verify_record(authorization["record"], split_sha256=split_sha, experiment_id=SOURCE_EXPERIMENT_ID,
                        checkpoint_sha256=best_sha)
        H.require_same_record(pm["holdout_authorization"], authorization,
                              "the source run's RAW holdout predictions")
        authorization["verified_at"] = MF.now_iso()
        allow = D.CaseAllowlist.for_holdout(split, allow_holdout=True)
    else:
        allow = D.CaseAllowlist.for_validation(split)
    intended = list(pm["intended_case_ids"])
    if sorted(intended) != sorted(allow.case_ids) or sorted(c["case_id"] for c in pm["cases"]) != sorted(intended):
        raise ValueError("source predictions do not cover the exact population; no silent subset")

    final_dir = out_run / MF.RUN_LAYOUT["predictions"].format(partition=partition)
    if final_dir.exists():
        raise FileExistsError(f"{final_dir.name}: derived predictions are immutable and exist already")

    # run-level copies (byte-identical to the source's; an existing copy must be identical)
    split_rel = MF.RUN_LAYOUT["split_manifest_copy"]
    _copy_new(source_run / split_rel, out_run / split_rel)
    pop_ref = pm["population"]
    if D.sha256_file(source_run / pop_ref["path"]) != pop_ref["sha256"]:
        raise ValueError("the source population manifest differs from its predictions manifest")
    _copy_new(source_run / pop_ref["path"], out_run / pop_ref["path"])
    subset = rm_src["training_subset"]
    subset_rel = MF.RUN_LAYOUT["training_subset_manifest"].format(subset=subset)
    if rm_src["training_subset_manifest"]["path"] != subset_rel:
        raise ValueError("the source run manifest names an unexpected training subset manifest path")
    if _copy_new(source_run / subset_rel, out_run / subset_rel) != rm_src["training_subset_manifest"]["sha256"]:
        raise ValueError("the source training subset manifest differs from its run manifest")
    config_rel = f"postprocessing/{FROZEN_CONFIG_NAME}"
    _copy_new(config_path, out_run / config_rel)

    derived_from = {"experiment_id": SOURCE_EXPERIMENT_ID, "partition": partition,
                    "predictions_manifest_sha256": pm_sha, "checkpoint_sha256": best_sha,
                    "checkpoint_id": ckpt["checkpoint_id"]}
    tmp_dir = final_dir.with_name(f".{final_dir.name}.{uuid.uuid4().hex[:8]}.tmp")
    (tmp_dir / RAW_COPY_DIR).mkdir(parents=True, exist_ok=False)
    cases = []
    for n, entry in enumerate(pm["cases"], 1):
        cid = entry["case_id"]
        if entry["status"] != "SUCCEEDED":
            cases.append({"case_id": cid, "status": "FAILED",
                          "failure_reason": f"RAW_PREDICTION_FAILED: {entry.get('failure_reason')}"[:300]})
        else:
            raw_path = pm_path.parent / entry["file"]
            raw, header, digest = D.read_nrrd_zyx(raw_path)
            if digest != entry["sha256"]:
                raise ValueError(f"{cid}: the raw prediction file changed after it was recorded")
            processed = apply(config, raw)
            processed_sha = D.write_mask_nrrd(tmp_dir / f"{cid}.nrrd", processed, header)
            if _copy_new(raw_path, tmp_dir / RAW_COPY_DIR / f"{cid}.nrrd") != digest:
                raise ValueError(f"{cid}: the raw copy does not match the recorded sha256")
            cases.append({"case_id": cid, "status": "SUCCEEDED", "file": f"{cid}.nrrd", "sha256": processed_sha,
                          "source_mri_sha256": entry.get("source_mri_sha256"),
                          "shape_xyz": list(reversed(processed.shape)),
                          "raw_source_file": f"{RAW_COPY_DIR}/{cid}.nrrd", "raw_source_sha256": digest,
                          "raw_predicted_voxels": int(np.count_nonzero(raw)),
                          "predicted_voxels": int(np.count_nonzero(processed))})
        if log:
            log(f"  [{n}/{len(pm['cases'])}] {cid} {cases[-1]['status']}")
    cv = MF.code_version()
    mod = module_code_version()
    manifest = {
        "format": MF.PREDICTIONS_FORMAT,
        "experiment_id": DERIVED_EXPERIMENT_ID,
        "split_manifest": {"manifest_id": split.get("split_id"), "path": split_rel, "sha256": split_sha},
        "population": dict(pop_ref),
        "intended_case_ids": intended,
        "prediction_variant": PREDICTION_VARIANT,
        "postprocessing_version": postprocessing_version(config_id),
        "postprocessing_config_sha256": config_sha,
        "postprocessing": {"config_id": config_id, "config_path": config_rel, "operations": config["operations"],
                           "module_version": POSTPROCESS_VERSION, "code_version": cv["version"],
                           "code_dirty": cv["dirty"], "module_code_version": mod["version"]},
        "derived_from": derived_from,
        "threshold": pm["threshold"],
        "checkpoint": dict(ckpt),
        "model_variant": pm.get("model_variant"),
        "img": pm.get("img"),
        "preprocessing_version": pm.get("preprocessing_version"),
        "frozen_split": {"expected_sha256": D.FROZEN_SPLIT_SHA256, "actual_sha256": split_sha,
                         "is_frozen": split_sha == D.FROZEN_SPLIT_SHA256,
                         "allow_unfrozen_split": allow_unfrozen_split},
        "holdout_authorization": authorization,
        "succeeded_n": sum(c["status"] == "SUCCEEDED" for c in cases),
        "failed_n": sum(c["status"] != "SUCCEEDED" for c in cases),
        "cases": cases,
        "created_at": MF.now_iso(),
    }
    MF.write_json_new(tmp_dir / "predictions_manifest.json", MF.validate_predictions_manifest(manifest))
    os.rename(tmp_dir, final_dir)                # commit point: predictions/<partition> exists complete or not at all
    _write_run_files(out_run, rm_src, pop_ref, partition, config_id, config_sha, derived_from, subset_rel,
                     split_rel, split_sha, cv, mod)
    return final_dir


def _write_run_files(out_run: Path, rm_src: dict, pop_ref: dict, partition: str, config_id: str, config_sha: str,
                     derived_from: dict, subset_rel: str, split_rel: str, split_sha: str, cv: dict, mod: dict) -> None:
    identity = {"config_sha256": config_sha, "checkpoint_sha256": derived_from["checkpoint_sha256"]}
    config_file = out_run / MF.RUN_LAYOUT["config"]
    if config_file.exists():
        have = D.load_json(config_file)
        if {"config_sha256": have["postprocessing"]["config_sha256"],
                "checkpoint_sha256": have["derived_from"]["checkpoint_sha256"]} != identity:
            raise ValueError("this derived run directory was made from another config or checkpoint")
    else:
        MF.write_json_new(config_file, {
            "experiment_id": DERIVED_EXPERIMENT_ID,
            "kind": "derived run: post-processing of the RAW predictions of " + SOURCE_EXPERIMENT_ID,
            "derived_from": {"experiment_id": SOURCE_EXPERIMENT_ID,
                             "checkpoint_sha256": derived_from["checkpoint_sha256"]},
            "postprocessing": {"config_id": config_id, "config_sha256": config_sha,
                               "version": postprocessing_version(config_id), "module_version": POSTPROCESS_VERSION},
            "created_at": MF.now_iso()})
    manifest_file = out_run / MF.RUN_LAYOUT["run_manifest"]
    if manifest_file.exists():
        have = D.load_json(manifest_file)
        if have.get("postprocessing_config_sha256") != config_sha or \
                have.get("derived_from", {}).get("checkpoint_sha256") != derived_from["checkpoint_sha256"]:
            raise ValueError("the run manifest of this derived run directory belongs to another config or checkpoint")
        return
    pop_doc_path = out_run / pop_ref["path"]
    pop_doc = D.load_json(pop_doc_path)
    rm = {
        "format": MF.RUN_MANIFEST_FORMAT, "status": "COMPLETE", "experiment_id": DERIVED_EXPERIMENT_ID,
        "model_family": rm_src["model_family"], "model_variant": rm_src["model_variant"],
        "decoder": rm_src["decoder"], "training_fraction": rm_src["training_fraction"],
        "training_subset": rm_src["training_subset"],
        "split_manifest": {"manifest_id": rm_src["split_manifest"]["manifest_id"], "path": split_rel,
                           "sha256": split_sha},
        "training_subset_manifest": {"manifest_id": rm_src["training_subset_manifest"]["manifest_id"],
                                     "path": subset_rel, "sha256": rm_src["training_subset_manifest"]["sha256"]},
        "seed": rm_src["seed"], "preprocessing_version": rm_src["preprocessing_version"],
        "postprocessing_version": postprocessing_version(config_id), "prediction_variant": PREDICTION_VARIANT,
        "evaluation_population_manifest": {"manifest_id": pop_ref["manifest_id"], "path": pop_ref["path"],
                                           "sha256": pop_ref["sha256"], "role": MF.ROLES[partition],
                                           "case_count": pop_doc["case_count"]},
        "evaluation_metric_version": E.EVALUATION_METRIC_VERSION,
        "training_code_version": rm_src["training_code_version"],
        "checkpoint": dict(rm_src["checkpoint"]),
        "evaluation_code_version": cv["version"],
        "num_test_cases": pop_doc["case_count"],
        "derived_from": {"experiment_id": SOURCE_EXPERIMENT_ID,
                         "checkpoint_sha256": derived_from["checkpoint_sha256"],
                         "note": "the checkpoint is identified by sha256; it is not stored in this run directory"},
        "postprocessing_config_sha256": config_sha,
        "postprocessing_code_version": cv["version"],
        "postprocessing_module_code_version": mod["version"],
    }
    MF.write_json_new(manifest_file, MF.validate_run_manifest(rm))


# --- CLI -------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Deterministic post-processing of binary prediction masks")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("derive", help="derive the EXP-D-PP run from EXP-D-100's RAW predictions")
    d.add_argument("--source-run", required=True, type=Path, help="the EXP-D-100 run directory")
    d.add_argument("--population", required=True, choices=["validation", "holdout"])
    d.add_argument("--config", required=True, type=Path, help="the frozen ml-postprocess-config/1 file")
    d.add_argument("--out-run", required=True, type=Path, help="the NEW EXP-D-PP run directory")
    d.add_argument("--holdout-authorization", type=Path, default=None, metavar="RECORD_JSON",
                   help="required with --population holdout: the GATE-IMG-01 authorization record")
    d.add_argument("--split-manifest", type=Path, default=D.DEFAULT_SPLIT_MANIFEST,
                   help="the FROZEN split (default: the repository's); any other sha256 is refused")
    args = ap.parse_args(argv)
    partition = D.HOLDOUT_PARTITION if args.population == "holdout" else "validation"
    if partition == D.HOLDOUT_PARTITION and args.holdout_authorization is None:
        print("REFUSED: --population holdout needs --holdout-authorization <record.json> (GATE-IMG-01)")
        return 2
    if partition != D.HOLDOUT_PARTITION and args.holdout_authorization is not None:
        print("REFUSED: --holdout-authorization only applies to --population holdout")
        return 2
    try:
        out = derive_run(args.source_run, partition, args.config, args.out_run,
                         holdout_authorization=args.holdout_authorization, split_manifest=args.split_manifest)
    except (D.DataAccessError, FileExistsError, FileNotFoundError, MF.ManifestError, ValueError) as exc:
        print(f"REFUSED: {type(exc).__name__}: {exc}")
        return 2
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
