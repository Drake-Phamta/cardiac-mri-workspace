#!/usr/bin/env python3
"""MRI-only cross-case similarity screen; never reads masks or patient IDs.

This is a *screen*, not a patient-identity matcher. It reads one MRI at a time
from the official ZIP and keeps only small per-volume normalized features.
The output is case IDs, correlations, and method metadata, never image bytes.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

import numpy as np

GRID = (24, 24, 22)
TOP = 20
KNOWN_PAIR = frozenset(("CASE_0056", "CASE_0097"))


def feature(volume: np.ndarray) -> np.ndarray:
    """DR-011-conformant per-volume z-score, then fixed normalized-grid sample."""
    if volume.ndim != 3:
        raise ValueError(f"MRI must be 3D, found {volume.shape}")
    raw = volume.astype(np.float32, copy=False)
    mean = float(raw.mean())
    std = float(raw.std())
    if not np.isfinite(std) or std <= 0:
        raise ValueError("MRI has zero or invalid per-volume intensity variance")
    normalized = (raw - mean) / std
    indices = [np.linspace(0, n - 1, steps, dtype=np.int32)
               for n, steps in zip(volume.shape, GRID)]
    sampled = normalized[np.ix_(*indices)].ravel().astype(np.float32)
    sampled -= sampled.mean()
    norm = np.linalg.norm(sampled)
    if not np.isfinite(norm) or norm <= 0:
        raise ValueError("sampled MRI has zero or invalid variance")
    return sampled / norm


def rank_pairs(ids: list[str], features: list[np.ndarray],
               released: dict[str, str], proposed: dict[str, str] | None) -> dict:
    matrix = np.stack(features)
    scores = matrix @ matrix.T  # Pearson of sampled, re-centered features
    pairs = []
    for i, left in enumerate(ids):
        for j in range(i + 1, len(ids)):
            right = ids[j]
            value = float(scores[i, j])
            pairs.append({
                "case_ids": [left, right], "pearson_r": round(value, 6),
                "cross_released_train_testing": released[left] != released[right],
                "cross_proposed_partition": bool(proposed and proposed[left] != proposed[right]),
            })
    pairs.sort(key=lambda p: (-p["pearson_r"], p["case_ids"]))
    cross_release = [p for p in pairs if p["cross_released_train_testing"]]
    cross_proposed = [p for p in pairs if p["cross_proposed_partition"]]
    known = next((p for p in pairs if frozenset(p["case_ids"]) == KNOWN_PAIR), None)
    return {
        "method": {
            "input": "lgemri.nrrd only; no label, wall annotation or patient key opened",
            "normalization": "DR-011 per-volume intensity z-score; no cohort fit",
            "feature": f"normalized-grid sampled {GRID} MRI intensities, re-centered L2",
            "similarity": "Pearson correlation of sampled MRI features",
            "scope": "all unordered case pairs, including released train-testing and proposed partition crossings",
            "limitation": "similarity is not biological patient identity; different-visit scans may not look alike",
        },
        "case_count": len(ids), "pair_count": len(pairs),
        "known_duplicate": known,
        "top_all": pairs[:TOP],
        "top_cross_released_train_testing": cross_release[:TOP],
        "top_cross_proposed_partition": cross_proposed[:TOP],
        "cross_released_pair_count": len(cross_release),
        "cross_proposed_pair_count": len(cross_proposed),
    }


def load_mri_features(archive: Path, dataset: dict) -> tuple[list[str], list[np.ndarray], dict]:
    import nrrd

    cases = sorted(dataset["cases"], key=lambda c: c["case_id"])
    ids, features, released = [], [], {}
    with zipfile.ZipFile(archive) as zf, tempfile.TemporaryDirectory() as tmp:
        names = set(zf.namelist())
        scratch = Path(tmp) / "one_mri.nrrd"
        for index, case in enumerate(cases, start=1):
            case_id = case["case_id"]
            member = case["mri"]["path_relative"].replace("\\", "/")
            if member not in names:
                raise ValueError(f"archive is missing MRI for {case_id}")
            with zf.open(member) as source, scratch.open("wb") as target:
                shutil.copyfileobj(source, target, length=1 << 20)
            try:
                volume, _header = nrrd.read(str(scratch))
                features.append(feature(volume))
            finally:
                scratch.unlink(missing_ok=True)
            ids.append(case_id)
            released[case_id] = case["partition_as_released"]
            if index % 25 == 0 or index == len(cases):
                print(f"MRI-only screen: {index}/{len(cases)} cases", flush=True)
    return ids, features, released


def proposed_partitions(path: Path | None, ids: list[str]) -> dict[str, str] | None:
    if path is None:
        return None
    split = json.loads(path.read_text(encoding="utf-8-sig"))
    result = {cid: name for name, block in split["partitions"].items()
              for cid in block["case_ids"]}
    if set(result) != set(ids):
        raise ValueError("split manifest membership does not match dataset case IDs")
    return result


def selftest() -> int:
    rng = np.random.default_rng(2024)
    a = rng.integers(0, 255, size=(32, 32, 16), dtype=np.uint8)
    b = a.copy()
    c = rng.integers(0, 255, size=a.shape, dtype=np.uint8)
    ids = ["CASE_0056", "CASE_0097", "CASE_0101"]
    ranked = rank_pairs(ids, [feature(v) for v in (a, b, c)],
                        {ids[0]: "Training Set", ids[1]: "Training Set",
                         ids[2]: "Testing Set"},
                        {ids[0]: "train", ids[1]: "validation", ids[2]: "final_holdout"})
    checks = {
        "three synthetic MRIs create three pairs": ranked["pair_count"] == 3,
        "known duplicate is highest and approximately one":
            ranked["top_all"][0]["case_ids"] == ids[:2]
            and ranked["known_duplicate"]["pearson_r"] >= 0.999999,
        "proposed train-validation crossing flagged":
            ranked["known_duplicate"]["cross_proposed_partition"],
        "released train-testing crossings flagged":
            ranked["cross_released_pair_count"] == 2,
        "no label-derived field": "laendo" not in json.dumps(ranked),
    }
    for name, passed in checks.items():
        print(f"{'ok' if passed else 'FAIL'} {name}")
    print(f"selftest: {sum(checks.values())}/{len(checks)} PASS (synthetic only)")
    return 0 if all(checks.values()) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="private official ZIP")
    parser.add_argument("--dataset-manifest", type=Path, help="public dataset manifest")
    parser.add_argument("--split-manifest", type=Path, help="proposed split membership")
    parser.add_argument("--out", type=Path, help="private JSON output path (not under repo)")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.archive or not args.dataset_manifest or not args.out:
        parser.error("--archive, --dataset-manifest and --out are required")
    dataset = json.loads(args.dataset_manifest.read_text(encoding="utf-8-sig"))
    if dataset.get("case_count_total") != 154:
        raise ValueError("screen requires the validated 154-case package")
    ids, features, released = load_mri_features(args.archive, dataset)
    proposed = proposed_partitions(args.split_manifest, ids)
    report = rank_pairs(ids, features, released, proposed)
    report["source_archive_name"] = args.archive.name
    report["source_dataset_sha256"] = dataset["acquisition"]["package_files"][0]["sha256"]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    print(f"private result: {args.out}")
    print(f"known pair: {report['known_duplicate']}")
    print(f"top released train-testing pair: {report['top_cross_released_train_testing'][0]}")
    print("Similarity is not proof of patient identity; no gate is closed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
