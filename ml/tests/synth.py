"""Synthetic NRRD package + manifests for the ml/ tests. Never touches real data.

make_package(root) writes a tiny LASC-2018-shaped package under `root`:
    <root>/package/Training Set/<hash>/lgemri.nrrd   uint8 MRI, NRRD axis order (x, y, z)
    <root>/package/Training Set/<hash>/laendo.nrrd   uint8 mask {0, 255}
    <root>/dataset_manifest.json                     the fields ml.data reads
    <root>/split_manifest.json                       train / validation / final_holdout,
                                                     training_subsets, training_exclusions
Shapes are deliberately non-square (x != y) so an axis mix-up cannot pass by symmetry.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

SPLIT_ID = "synthetic_split_v1"
TRAIN = ["SYN_0001", "SYN_0002", "SYN_0003", "SYN_0004"]
VALIDATION = ["SYN_0005", "SYN_0006"]
HOLDOUT = ["SYN_0007"]
EXCLUDED = ["SYN_0004"]
SUBSETS = {"25_percent": ["SYN_0001"], "50_percent": ["SYN_0001", "SYN_0002"],
           "100_percent": ["SYN_0001", "SYN_0002", "SYN_0003"]}
# (x, y, z) per case: two in-plane sizes, like the real cohort (576 / 640).
SHAPES = {"SYN_0001": (40, 32, 6), "SYN_0002": (48, 36, 6), "SYN_0003": (40, 32, 6),
          "SYN_0004": (48, 36, 6), "SYN_0005": (40, 32, 6), "SYN_0006": (48, 36, 6),
          "SYN_0007": (40, 32, 6)}
HEADER = {"space": "left-posterior-superior",
          "space directions": np.eye(3), "space origin": np.zeros(3),
          "kinds": ["domain", "domain", "domain"], "encoding": "raw"}


def make_volume(case_id: str, shape_xyz: tuple[int, int, int]) -> tuple[np.ndarray, np.ndarray]:
    """(mri uint8 xyz, mask uint8 xyz {0, 255}); deterministic per case id."""
    seed = int(case_id.split("_")[1])
    rng = np.random.default_rng(2024 + seed)
    nx, ny, nz = shape_xyz
    i, j, k = np.meshgrid(np.arange(nx), np.arange(ny), np.arange(nz), indexing="ij")
    base = (2 * i + 3 * j + 11 * k + 7 * seed) % 200
    mri = np.clip(base + rng.integers(0, 50, size=shape_xyz), 0, 255).astype(np.uint8)
    # an off-centre ellipse "cavity", present in slices 1..nz-2; slice 0 and the last are empty
    cx, cy = nx * 0.45 + seed % 3, ny * 0.55
    rx, ry = nx * 0.22, ny * 0.25
    inside = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1.0
    inside &= (k >= 1) & (k <= nz - 2)
    mask = np.where(inside, 255, 0).astype(np.uint8)
    mri[inside] = np.clip(mri[inside].astype(np.int32) + 40, 0, 255).astype(np.uint8)
    return mri, mask


def make_package(root: Path) -> dict:
    import nrrd
    root = Path(root)
    pkg = root / "package"
    cases = []
    for n, cid in enumerate(TRAIN + VALIDATION + HOLDOUT):
        released = "Testing Set" if cid in HOLDOUT else "Training Set"
        rel_dir = f"{released}/HASH{n:04d}ABC"
        d = pkg / rel_dir
        d.mkdir(parents=True, exist_ok=True)
        mri, mask = make_volume(cid, SHAPES[cid])
        nrrd.write(str(d / "lgemri.nrrd"), mri, dict(HEADER), index_order="F")
        nrrd.write(str(d / "laendo.nrrd"), mask, dict(HEADER), index_order="F")
        cases.append({
            "case_id": cid,
            "source_dir_relative": rel_dir,
            "partition_as_released": released,
            "mri": {"path_relative": f"{rel_dir}/lgemri.nrrd", "dtype": "uint8",
                    "shape": list(SHAPES[cid])},
            "mask": {"path_relative": f"{rel_dir}/laendo.nrrd", "dtype": "uint8",
                     "shape": list(SHAPES[cid])},
        })
    dataset = {"manifest_version": "synthetic", "case_count_total": len(cases), "cases": cases}
    split = {
        "manifest_version": "synthetic",
        "split_id": SPLIT_ID,
        "partitions": {
            "train": {"case_count": len(TRAIN), "case_ids": list(TRAIN),
                      "effective_training_case_ids": [c for c in TRAIN if c not in EXCLUDED]},
            "validation": {"case_count": len(VALIDATION), "case_ids": list(VALIDATION)},
            "final_holdout": {"case_count": len(HOLDOUT), "case_ids": list(HOLDOUT)},
        },
        "training_subsets": {k: {"case_count": len(v), "effective_case_ids": list(v)}
                             for k, v in SUBSETS.items()},
        "training_exclusions": {"all_excluded_case_ids": list(EXCLUDED)},
        "sensitivity_analysis": {"suspected_holdout_case_ids": list(HOLDOUT)},
    }
    (root / "dataset_manifest.json").write_text(json.dumps(dataset, indent=1) + "\n", encoding="utf-8")
    (root / "split_manifest.json").write_text(json.dumps(split, indent=1) + "\n", encoding="utf-8")
    return {"root": root, "package_root": pkg, "dataset": dataset, "split": split,
            "dataset_manifest_path": root / "dataset_manifest.json",
            "split_manifest_path": root / "split_manifest.json"}
