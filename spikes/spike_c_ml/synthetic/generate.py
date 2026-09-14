#!/usr/bin/env python3
"""
Shape-matched synthetic volumes for the Spike C0 compute probe.

THROWAWAY SPIKE CODE under spikes/spike_c_ml/. Not production.

`SPIKE_C_ML/TASK.md` is explicit that C0 does not wait for real data:

    "Synthetic volumes matching the expected shape and dtype. Real data is
     not required and C0 must not wait for Spike D."

C0 is a HARDWARE-AND-THROUGHPUT PROBE. Peak memory and throughput depend on
tensor shapes and dtypes, not on what the voxels mean, so synthetic input
answers C0-2 through C0-5 exactly as well as real input would.

What synthetic input CANNOT answer is stated in TASK.md and repeated in every
artifact this produces:

    "Synthetic data cannot establish convergence behaviour, achievable
     segmentation quality, or the interaction between output stride and the
     REAL LA cavity boundary thickness. C0 is a hardware-and-throughput probe
     only."

THE SHAPE AND DTYPE ARE THE COHORT'S (revision 3, 2026-09-14)
    Earlier revisions generated int16 at a placeholder 576x576x88. Spike D
    criterion A6 (PR #25) has since measured the cohort: MRI and masks are
    uint8, 69 cases at 576x576x88 and 85 at 640x640x88, masks valued {0, 255}.
    The PR #17 review (point 4) asked for the probe input to match; the
    defaults below now generate both sizes at that dtype.
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 2024                               # the project's canonical seed

# Spike D criterion A6 (PR #25): the two in-plane sizes of the cohort, Nx, Ny, Nz.
COHORT_SHAPES = [(576, 576, 88), (640, 640, 88)]
COHORT_CASES = {(576, 576, 88): 69, (640, 640, 88): 85}
MASK_FOREGROUND = 255                     # the cohort's masks are {0, 255} (Spike D A10)


def make_volume(shape, seed: int = SEED) -> np.ndarray:
    """uint8 LGE-like volume: smooth structure plus noise, using the full 0-255 range."""
    nx, ny, nz = shape
    rng = np.random.default_rng(seed)
    x = np.arange(nx, dtype=np.float32)[:, None, None]
    y = np.arange(ny, dtype=np.float32)[None, :, None]
    z = np.arange(nz, dtype=np.float32)[None, None, :]
    cx, cy, cz = nx / 2, ny / 2, nz / 2

    r = np.sqrt(((x - cx) / (nx * 0.34)) ** 2
                + ((y - cy) / (ny * 0.32)) ** 2
                + ((z - cz) / (nz * 0.40)) ** 2)
    vol = np.clip(1.0 - r, 0.0, 1.0) * 170.0 + 20.0
    vol = vol + 30.0 * np.sin(x / 8.0) * np.cos(y / 12.0)
    vol += rng.normal(0.0, 8.0, size=(nx, ny, nz)).astype(np.float32)
    return np.clip(np.rint(vol), 0, 255).astype(np.uint8)


def make_mask(shape) -> np.ndarray:
    """LA-cavity-shaped target, valued {0, 255} like the cohort's masks."""
    nx, ny, nz = shape
    x = np.arange(nx)[:, None, None]
    y = np.arange(ny)[None, :, None]
    z = np.arange(nz)[None, None, :]
    cx, cy, cz = nx / 2, ny / 2, nz / 2
    inside = (((x - cx) / (nx * 0.21)) ** 2
              + ((y - cy) / (ny * 0.19)) ** 2
              + ((z - cz) / (nz * 0.27)) ** 2) <= 1.0
    return (inside.astype(np.uint8) * MASK_FOREGROUND).astype(np.uint8)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    ap.add_argument("--shape", action="append", default=None,
                    help="Nx,Ny,Nz; repeat for several. Default: both cohort shapes from "
                         "Spike D A6, 576,576,88 and 640,640,88")
    ap.add_argument("--cases", type=int, default=1, help="cases per shape")
    args = ap.parse_args()

    shapes = ([tuple(int(v) for v in s.split(",")) for s in args.shape] if args.shape
              else COHORT_SHAPES)
    os.makedirs(args.out, exist_ok=True)

    written = []
    i = 0
    for shape in shapes:
        tag = "x".join(map(str, shape))
        for _ in range(args.cases):
            vol = make_volume(shape, seed=SEED + i)
            mask = make_mask(shape)
            vp = os.path.join(args.out, f"synth_{i:03d}_{tag}_volume_uint8.npy")
            mp = os.path.join(args.out, f"synth_{i:03d}_{tag}_mask_uint8.npy")
            np.save(vp, vol)
            np.save(mp, mask)
            written.append({"volume": os.path.basename(vp), "mask": os.path.basename(mp),
                            "shape_xyz": list(shape),
                            "volume_bytes": os.path.getsize(vp),
                            "foreground_fraction": round(float((mask > 0).mean()), 6)})
            i += 1

    manifest = {
        "_status": "SYNTHETIC - shape- and dtype-matched probe input, NOT dataset bytes",
        "_cannot_answer": [
            "convergence behaviour",
            "achievable segmentation quality",
            "interaction between output stride and the REAL LA boundary thickness",
        ],
        "_cohort_reference": ("Spike D criterion A6, PR #25: uint8, 69 cases 576x576x88 and "
                              "85 cases 640x640x88; masks {0, 255}"),
        "seed": SEED,
        "shapes_xyz": [list(s) for s in shapes],
        "cohort_cases_per_shape": {"x".join(map(str, s)): COHORT_CASES.get(s) for s in shapes},
        "dtype_volume": "uint8",
        "dtype_mask": "uint8",
        "mask_label_mapping": {"0": "background", str(MASK_FOREGROUND): "foreground"},
        "cases": written,
    }
    with open(os.path.join(args.out, "synthetic_manifest.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")

    mb = 1024 * 1024
    print()
    print(f"  uint8, seed {SEED}, masks {{0, {MASK_FOREGROUND}}}")
    for w in written:
        print(f"  {w['volume']:<44} {w['volume_bytes'] / mb:7.1f} MB   "
              f"foreground {w['foreground_fraction'] * 100:.2f}%")
    print()
    print("  SYNTHETIC. C0 is a hardware-and-throughput probe only.")
    print("  Shapes and dtype follow Spike D A6 (PR #25).")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
