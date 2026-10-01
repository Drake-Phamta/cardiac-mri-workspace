"""Small manifest helpers shared by evaluation, export, training and inference.

* population_manifest()       - the exact case list of one split partition, as a file
* training_subset_manifest()  - the effective case list of one training subset, as a file
* code_version()              - git commit of the working tree (+dirty flag)
* write_json_new()            - write a JSON file, refusing to overwrite

Every case list written here is copied from the split manifest, never re-derived, and
carries the split manifest's sha256 so a consumer can check where it came from.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import subprocess
from pathlib import Path

from ml.data import (HOLDOUT_PARTITION, REPO_ROOT, DataAccessError, partition_case_ids, subset_case_ids,
                     training_excluded_case_ids)


class SplitMismatchError(DataAccessError):
    """A run's split manifest copy is not the frozen split manifest (the holdout lock refuses it)."""


def is_clean_code_version(version: str | None) -> bool:
    """True for "git:<commit>" from a clean tree; False for +dirty, MIXED:..., UNKNOWN or missing."""
    return (isinstance(version, str) and version.startswith("git:") and "+dirty" not in version
            and not version.startswith("MIXED:"))

POPULATION_FORMAT = "ml-population/1"
SUBSET_FORMAT = "ml-training-subset/1"
RUN_MANIFEST_FORMAT = "ml-run-manifest/1"
PREDICTIONS_FORMAT = "ml-predictions/1"

# Run-directory layout shared by train / infer / evaluate / export. Every path a manifest
# records is relative to the run directory, with forward slashes, so the run directory is
# also the Contract 2 artifact root.
RUN_LAYOUT = {
    "config": "config.json",
    "run_manifest": "run_manifest.json",
    "train_log": "train_log.jsonl",
    "checkpoints": "checkpoints",
    "split_manifest_copy": "manifests/split_manifest.json",
    "training_subset_manifest": "manifests/training_subset_{subset}.json",
    "population_manifest": "manifests/population_{partition}.json",
    "predictions": "predictions/{partition}",
    "predictions_manifest": "predictions/{partition}/predictions_manifest.json",
    "evaluation": "evaluation/{partition}",
    "contract2": "contract2",
}
ROLES = {"train": "TRAIN", "validation": "VALIDATION", HOLDOUT_PARTITION: "FINAL_HOLDOUT"}
SUBSET_FRACTIONS = {"25_percent": 0.25, "50_percent": 0.5, "100_percent": 1.0}


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).astimezone().isoformat(timespec="seconds")


def json_bytes(obj) -> bytes:
    """Canonical-ish JSON bytes: UTF-8, indent 1, LF, trailing newline."""
    return (json.dumps(obj, indent=1, ensure_ascii=False) + "\n").encode("utf-8")


def write_json_new(path: str | os.PathLike, obj) -> Path:
    """Write JSON to a NEW file; FileExistsError if it exists (recorded artifacts are immutable)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "xb") as f:
        f.write(json_bytes(obj))
    return path


def write_json_replace(path: str | os.PathLike, obj) -> Path:
    """Write JSON atomically, replacing a previous version (logs and mutable state only)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(json_bytes(obj))
    os.replace(tmp, path)
    return path


def population_manifest(split: dict, partition: str, split_sha256: str) -> dict:
    """The exact case list of one partition (validation or final_holdout), with provenance."""
    if partition not in ROLES:
        raise ValueError(f"unknown partition {partition!r}")
    ids = partition_case_ids(split, partition)
    return {
        "format": POPULATION_FORMAT,
        "manifest_id": f"{split.get('split_id')}:{partition}",
        "role": ROLES[partition],
        "partition": partition,
        "split_id": split.get("split_id"),
        "source_split_manifest_sha256": split_sha256,
        "case_count": len(ids),
        "case_ids": ids,
    }


def training_subset_manifest(split: dict, subset_key: str, split_sha256: str) -> dict:
    """The effective training cases of one subset, with provenance."""
    if subset_key not in SUBSET_FRACTIONS:
        raise ValueError(f"unknown subset {subset_key!r}; known: {sorted(SUBSET_FRACTIONS)}")
    ids = subset_case_ids(split, subset_key)
    sub = split["training_subsets"][subset_key]
    return {
        "format": SUBSET_FORMAT,
        "manifest_id": f"{split.get('split_id')}:{subset_key}",
        "subset": subset_key,
        "training_fraction": SUBSET_FRACTIONS[subset_key],
        "split_id": split.get("split_id"),
        "source_split_manifest_sha256": split_sha256,
        "nominal_case_count": sub.get("nominal_case_count", sub.get("case_count")),
        "excluded_case_ids": list(sub.get("excluded_case_ids") or []),
        "training_exclusions_all": training_excluded_case_ids(split),
        "case_count": len(ids),
        "effective_case_ids": ids,
    }


def code_version(repo_root: str | os.PathLike = REPO_ROOT, paths: tuple[str, ...] = ("ml",)) -> dict:
    """{"commit", "dirty", "version"} of the repository the code runs from.

    dirty is True when tracked or untracked files under `paths` differ from the commit,
    so a run can never claim a commit it did not actually run. Without git the version
    is "UNKNOWN" and dirty is None - recorded, never guessed.
    """
    try:
        commit = subprocess.run(["git", "-C", str(repo_root), "rev-parse", "HEAD"],
                                capture_output=True, text=True, timeout=30, check=True).stdout.strip()
        status = subprocess.run(["git", "-C", str(repo_root), "status", "--porcelain", "--", *paths],
                                capture_output=True, text=True, timeout=30, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "dirty": None, "version": "UNKNOWN"}
    dirty = bool(status)
    return {"commit": commit, "dirty": dirty, "version": f"git:{commit}" + ("+dirty" if dirty else "")}
