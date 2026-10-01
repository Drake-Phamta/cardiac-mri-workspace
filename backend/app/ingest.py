"""Contract 1 ingestion of the rule-selected cases into the derived data cache.

Selection (leader decisions 2026-10-01, all rule-based, chosen before any
metric exists):

- INTEGRATION_CASE_001 = the lowest-numbered case of the split's ``validation``
  partition;
- every one of the 20 ``validation`` cases, in EVALUATION mode;
- the INT-12 inference-only case = the lowest-numbered ``final_holdout`` case
  other than CASE_0027, in INFERENCE_REVIEW mode. Its ground-truth file is
  never opened: nothing derived from it reaches the cache.

What Contract 1 asks for and this does: GATE-DATA-01 ACCEPTED is asserted;
every artifact is addressed by sha256; re-ingesting identical bytes is a
NO_OP and changed bytes are CHECKSUM_CONFLICT, never an overwrite; masks must
be exactly {0, 255}; MRI and mask geometry must match exactly; no metadata
beyond the allowlist is copied. The one recorded deviation: LASC headers are
the default affine (QA-002 F2), which Contract 1 rejects as a validated
geometry. Here the case is ingested with geometry_validation_status
GEOMETRY_NOT_VALIDATED and served in voxel-index units only - no mm, no mL.

Output (gitignored, derived from patient images; never commit it):

    <out>/index.json                     what was ingested + sha256 -> file index
    <out>/contract1_record.json          Contract-1-shaped record of the ingest
    <out>/cases/<CASE>/case.json         per-case metadata and slice checksums
    <out>/cases/<CASE>/mri/<z>.png       8-bit slices at native resolution
    <out>/cases/<CASE>/gt/<z>.png        reference mask slices, EVALUATION only

Usage (from the repository root):

    python -m backend.app.ingest --package-root D:/02_Research/cardiac-data/lasc2018/extracted
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from . import imaging
from .config import BACKEND_ROOT, REPO_ROOT

INGEST_VERSION = "backend-ingest/1"
GEOMETRY_CONTRACT_VERSION = "dr008a-dr012/v1.0.0"
EXCLUDED_FROM_INT12 = "CASE_0027"
DEFAULT_PACKAGE_ROOT = Path(os.environ.get("CARDIAC_PACKAGE_ROOT", r"D:\02_Research\cardiac-data\lasc2018\extracted"))
DEFAULT_DATASET_MANIFEST = REPO_ROOT / "data" / "manifests" / "dataset_manifest.json"
DEFAULT_SPLIT_MANIFEST = REPO_ROOT / "data" / "manifests" / "split_manifest_path_a_seed2024.json"


class IngestError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _case_number(case_id: str) -> int:
    return int(case_id.split("_", 1)[1])


def rule_based_selection(split: dict) -> List[Dict[str, str]]:
    """The cases this backend serves, by the leader's rules, in a stable order."""
    partitions = split["partitions"]
    validation = sorted(partitions["validation"]["case_ids"], key=_case_number)
    holdout = sorted(partitions["final_holdout"]["case_ids"], key=_case_number)
    if not validation:
        raise IngestError("SELECTION_INVALID", "the split has no validation partition")
    candidates = [case_id for case_id in holdout if case_id != EXCLUDED_FROM_INT12]
    if not candidates:
        raise IngestError("SELECTION_INVALID", "no final_holdout case is eligible for INT-12")
    selection = [{"case_id": validation[0], "role": "INTEGRATION_CASE_001", "mode": "EVALUATION",
                  "split_partition": "validation"}]
    selection += [{"case_id": case_id, "role": "VALIDATION", "mode": "EVALUATION", "split_partition": "validation"}
                  for case_id in validation[1:]]
    selection.append({"case_id": candidates[0], "role": "INFERENCE_ONLY_INT12", "mode": "INFERENCE_REVIEW",
                      "split_partition": "final_holdout"})
    return selection


def _refuse_tracked_output(out: Path) -> None:
    """The cache holds patient-derived pixels: it must be ignored by git."""
    out = Path(out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        inside = subprocess.run(["git", "-C", str(out.parent), "rev-parse", "--is-inside-work-tree"],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        return
    probe = out / "cases" / "probe.png"
    ignored = subprocess.run(["git", "-C", str(out.parent), "check-ignore", "-q", str(probe)],
                             capture_output=True, timeout=10)
    if ignored.returncode != 0:
        raise IngestError("OUTPUT_NOT_IGNORED", f"{out} is inside a git work tree and not ignored; refusing to write patient-derived slices there")


def _write_once(path: Path, payload: bytes) -> None:
    """Content files are immutable: identical bytes are a NO_OP, different bytes a conflict."""
    if path.exists():
        if path.read_bytes() != payload:
            raise IngestError("CHECKSUM_CONFLICT", f"{path} exists with different bytes; derived artifacts are never overwritten")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def _render_slices(volume_zyx: np.ndarray, directory: Path, cache_root: Path, blobs: Dict[str, str]) -> List[str]:
    checksums = []
    for z in range(volume_zyx.shape[0]):
        payload = imaging.encode_png(volume_zyx[z])
        digest = imaging.sha256_bytes(payload)
        target = directory / f"{z:04d}.png"
        _write_once(target, payload)
        blobs[digest] = target.relative_to(cache_root).as_posix()
        checksums.append(digest)
    return checksums


def ingest_case(selection: Dict[str, str], dataset_case: dict, package_root: Path, out: Path,
                blobs: Dict[str, str]) -> dict:
    case_id = selection["case_id"]
    withheld = selection["mode"] == "INFERENCE_REVIEW"
    mri_path = package_root / Path(*dataset_case["mri"]["path_relative"].split("/"))
    if not mri_path.is_file():
        raise IngestError("NRRD_UNREADABLE", f"{case_id}: MRI file not found under the package root")
    volume_sha = imaging.sha256_file(mri_path)
    case_dir = out / "cases" / case_id
    existing = case_dir / "case.json"
    if existing.exists():
        prior = json.loads(existing.read_text(encoding="utf-8"))
        if prior.get("volume_sha256") != volume_sha:
            raise IngestError("CHECKSUM_CONFLICT", f"{case_id}: the cached case was built from different MRI bytes")
        if prior.get("mode") != selection["mode"]:
            raise IngestError("CHECKSUM_CONFLICT", f"{case_id}: the cached case has mode {prior.get('mode')}")
        for kind in ("mri", "gt"):
            for z, digest in enumerate(prior["slices"][kind]):
                blobs[digest] = f"cases/{case_id}/{kind}/{z:04d}.png"
        prior["ingest_action"] = "NO_OP"
        return prior

    data, header = imaging.read_nrrd(mri_path)
    if data.dtype != np.uint8:
        raise IngestError("NRRD_INVALID", f"{case_id}: MRI dtype {data.dtype} is not uint8; the identity render needs uint8")
    shape_xyz = [int(v) for v in data.shape]
    if shape_xyz != list(dataset_case["mri"]["shape"]):
        raise IngestError("GEOMETRY_MISMATCH", f"{case_id}: MRI shape {shape_xyz} differs from the dataset manifest")
    geometry = imaging.geometry_from_header(header)
    if not geometry["axis_aligned"]:
        raise IngestError("GEOMETRY_NOT_VALIDATED", f"{case_id}: non-axis-aligned direction (DR-012)")
    mri_zyx = imaging.to_zyx(data)
    del data

    mask_sha: Optional[str] = None
    gt_checksums: List[str] = []
    if not withheld:
        mask_path = package_root / Path(*dataset_case["mask"]["path_relative"].split("/"))
        if not mask_path.is_file():
            raise IngestError("NRRD_UNREADABLE", f"{case_id}: mask file not found under the package root")
        mask_sha = imaging.sha256_file(mask_path)
        mask_data, mask_header = imaging.read_nrrd(mask_path)
        if [int(v) for v in mask_data.shape] != shape_xyz:
            raise IngestError("GEOMETRY_MISMATCH", f"{case_id}: MRI/mask shape differs")
        mask_geometry = imaging.geometry_from_header(mask_header)
        for field in ("spacing", "origin", "direction"):
            if not np.allclose(mask_geometry[field], geometry[field]):
                raise IngestError("GEOMETRY_MISMATCH", f"{case_id}: MRI/mask {field} differs")
        values = set(np.unique(mask_data).tolist())
        if not values <= {0, 255}:
            raise IngestError("LABEL_VALUES_INVALID", f"{case_id}: mask values {sorted(values)} are not within {{0, 255}}")
        gt_zyx = imaging.to_zyx(mask_data.astype(np.uint8))
        del mask_data
        gt_checksums = _render_slices(gt_zyx, case_dir / "gt", out, blobs)
    mri_checksums = _render_slices(mri_zyx, case_dir / "mri", out, blobs)

    record = {
        "case_id": case_id,
        "role": selection["role"],
        "mode": selection["mode"],
        "ground_truth_available": not withheld,
        "ground_truth_withheld": withheld,
        "split_partition": selection["split_partition"],
        "source_partition": dataset_case.get("partition_as_released"),
        "volume_id": f"VOL_{case_id}",
        "reference_mask_id": None if withheld else f"MASK_{case_id}",
        "volume_sha256": volume_sha,
        "mask_sha256": mask_sha,
        "shape": shape_xyz,
        "spacing": geometry["spacing"],
        "origin": geometry["origin"],
        "direction": geometry["direction"],
        "geometry_contract_version": GEOMETRY_CONTRACT_VERSION,
        "geometry_validation_status": "GEOMETRY_NOT_VALIDATED",
        "geometry_note": (
            "default affine header (unit spacing, zero origin): voxel-index units only, no mm/mL"
            if geometry["default_header"] else "header geometry not independently validated: voxel-index units only"
        ),
        "render_version": imaging.RENDER_VERSION,
        "mask_render_version": imaging.MASK_RENDER_VERSION,
        "slices": {"mri": mri_checksums, "gt": gt_checksums},
        "ingest_version": INGEST_VERSION,
        "ingested_at": _now(),
        "ingest_action": "NEW",
    }
    _write_once(existing, (json.dumps(record, indent=2) + "\n").encode("utf-8"))
    return record


def _contract1_record(dataset_manifest: dict, records: List[dict]) -> dict:
    """A Contract-1-shaped record of the ingest (geometry recorded, not validated)."""
    acquisition = dataset_manifest.get("acquisition", {})
    cases = []
    for record in records:
        cases.append({
            "case_id": record["case_id"],
            "dataset_id": "LASC2018",
            "mode_capability": record["mode"],
            "ground_truth_withheld": record["ground_truth_withheld"],
            "volume_id": record["volume_id"],
            "ground_truth_mask_id": record["reference_mask_id"],
            "mri_volume": {"volume_id": record["volume_id"], "checksum": {"algorithm": "sha256", "value": record["volume_sha256"]},
                           "shape_xyz": record["shape"], "geometry_validation_status": record["geometry_validation_status"]},
            "ground_truth_mask": None if record["ground_truth_withheld"] else {
                "mask_id": record["reference_mask_id"],
                "checksum": {"algorithm": "sha256", "value": record["mask_sha256"]},
                "label_semantics": "LA cavity", "source": "dataset annotation",
                "label_values": [0, 255], "foreground_value": 255, "background_value": 0,
            },
            "metadata": {"source_partition": record["source_partition"]},
        })
    return {
        "contract": "contract1_raw_dataset",
        "contract_version": "DRAFT v0",
        "frozen_as": "v1.0",
        "record_kind": "backend ingest record; geometry recorded as GEOMETRY_NOT_VALIDATED (QA-002 F2), not validated",
        "gate": {"gate_data_01": "ACCEPTED"},
        "dataset": {"dataset_id": "LASC2018", "name": "LASC 2018 / official Cardiac Atlas source",
                    "source_url": acquisition.get("source_url"),
                    "geometry_validation_status": "GEOMETRY_NOT_VALIDATED"},
        "cases": cases,
    }


def run_ingest(package_root: Path, dataset_manifest_path: Path, split_manifest_path: Path, out: Path,
               only: Optional[List[str]] = None, check_ignored: bool = True) -> dict:
    dataset_bytes = Path(dataset_manifest_path).read_bytes()
    dataset_manifest = json.loads(dataset_bytes.decode("utf-8"))
    split = json.loads(Path(split_manifest_path).read_text(encoding="utf-8"))
    pinned = (split.get("source_dataset_manifest") or {}).get("sha256")
    dataset_sha = imaging.sha256_bytes(dataset_bytes)
    if pinned and pinned != dataset_sha:
        raise IngestError("PROVENANCE_INVALID", f"split pins dataset manifest {pinned[:12]}, got {dataset_sha[:12]}")
    out = Path(out).resolve()
    if check_ignored:
        _refuse_tracked_output(out)
    out.mkdir(parents=True, exist_ok=True)
    by_id = {case["case_id"]: case for case in dataset_manifest["cases"]}
    selection = rule_based_selection(split)
    if only:
        selection = [item for item in selection if item["case_id"] in set(only)]
    blobs: Dict[str, str] = {}
    records = []
    for item in selection:
        dataset_case = by_id.get(item["case_id"])
        if dataset_case is None:
            raise IngestError("CASE_NOT_FOUND", f"{item['case_id']} is not in the dataset manifest")
        record = ingest_case(item, dataset_case, Path(package_root), out, blobs)
        records.append(record)
        print(f"{record['ingest_action']:5} {record['case_id']} {record['role']:22} {record['mode']:16} "
              f"shape={record['shape']} gt_slices={len(record['slices']['gt'])}", flush=True)
    index_path = out / "index.json"
    previous = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    cases = sorted(set(previous.get("cases", [])) | {record["case_id"] for record in records}, key=_case_number)
    merged_blobs = dict(previous.get("blobs", {}))
    merged_blobs.update(blobs)
    index = {
        "ingest_version": INGEST_VERSION,
        "generated_at": _now(),
        "split_id": split.get("split_id"),
        "dataset_manifest_sha256": dataset_sha,
        "selection_rules": {
            "INTEGRATION_CASE_001": "lowest-numbered validation case",
            "VALIDATION": "all validation cases",
            "INFERENCE_ONLY_INT12": f"lowest-numbered final_holdout case other than {EXCLUDED_FROM_INT12}; ground truth withheld",
        },
        "cases": cases,
        "blobs": merged_blobs,
    }
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    all_records = [json.loads((out / "cases" / case_id / "case.json").read_text(encoding="utf-8")) for case_id in cases]
    (out / "contract1_record.json").write_text(
        json.dumps(_contract1_record(dataset_manifest, all_records), indent=2) + "\n", encoding="utf-8")
    return index


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Contract 1 ingestion of the rule-selected cases into the backend data cache")
    parser.add_argument("--package-root", type=Path, default=DEFAULT_PACKAGE_ROOT)
    parser.add_argument("--dataset-manifest", type=Path, default=DEFAULT_DATASET_MANIFEST)
    parser.add_argument("--split-manifest", type=Path, default=DEFAULT_SPLIT_MANIFEST)
    parser.add_argument("--out", type=Path, default=BACKEND_ROOT / "data_cache")
    parser.add_argument("--only", nargs="*", help="ingest only these selected case ids (debugging)")
    args = parser.parse_args(argv)
    try:
        index = run_ingest(args.package_root, args.dataset_manifest, args.split_manifest, args.out, args.only)
    except IngestError as exc:
        print(f"FAIL [{exc.code}] {exc}", file=sys.stderr)
        return 2
    print(f"PASS: {len(index['cases'])} case(s) in {args.out}, {len(index['blobs'])} slice artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
