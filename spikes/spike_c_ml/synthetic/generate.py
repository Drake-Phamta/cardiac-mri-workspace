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

THE SHAPE IS A PLACEHOLDER
    The real cohort shape is Spike D criterion A6, which is unmeasured. The
    default below is a plausible order of magnitude so the probe has something
    to run on. Every number derived from it must be re-derived once A6 lands -
    and if A6 reports a materially different in-plane size, the memory figures
    change roughly with its square.
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 2024                               # the project's canonical seed

# PLACEHOLDER until Spike D criterion A6.
DEFAULT_SHAPE = (576, 576, 88)            # Nx, Ny, Nz - DR-008a ordering


def make_volume(shape, seed: int = SEED) -> np.ndarray:
    """int16 LGE-like volume: smooth structure plus noise, clipped to 12-bit."""
    nx, ny, nz = shape
    rng = np.random.default_rng(seed)
    x = np.arange(nx, dtype=np.float32)[:, None, None]
    y = np.arange(ny, dtype=np.float32)[None, :, None]
    z = np.arange(nz, dtype=np.float32)[None, None, :]
    cx, cy, cz = nx / 2, ny / 2, nz / 2

    r = np.sqrt(((x - cx) / (nx * 0.34)) ** 2
                + ((y - cy) / (ny * 0.32)) ** 2
                + ((z - cz) / (nz * 0.40)) ** 2)
    vol = np.clip(1.0 - r, 0.0, 1.0) * 800.0
    vol += 150.0 * np.sin(x / 8.0) * np.cos(y / 12.0)
    vol += rng.normal(0.0, 30.0, size=(nx, ny, nz)).astype(np.float32)
    return np.clip(vol, 0, 4095).astype(np.int16)


def make_mask(shape) -> np.ndarray:
    """Binary LA-cavity-shaped target. Values are 0 and 1, recorded not assumed."""
    nx, ny, nz = shape
    x = np.arange(nx)[:, None, None]
    y = np.arange(ny)[None, :, None]
    z = np.arange(nz)[None, None, :]
    cx, cy, cz = nx / 2, ny / 2, nz / 2
    inside = (((x - cx) / (nx * 0.21)) ** 2
              + ((y - cy) / (ny * 0.19)) ** 2
              + ((z - cz) / (nz * 0.27)) ** 2) <= 1.0
    return inside.astype(np.uint8)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    ap.add_argument("--shape", default=",".join(map(str, DEFAULT_SHAPE)),
                    help="Nx,Ny,Nz - PLACEHOLDER until Spike D criterion A6")
    ap.add_argument("--cases", type=int, default=2)
    args = ap.parse_args()

    shape = tuple(int(v) for v in args.shape.split(","))
    os.makedirs(args.out, exist_ok=True)

    written = []
    for i in range(args.cases):
        vol = make_volume(shape, seed=SEED + i)
        mask = make_mask(shape)
        vp = os.path.join(args.out, f"synth_{i:03d}_volume_int16.npy")
        mp = os.path.join(args.out, f"synth_{i:03d}_mask_uint8.npy")
        np.save(vp, vol)
        np.save(mp, mask)
        written.append({"volume": os.path.basename(vp), "mask": os.path.basename(mp),
                        "volume_bytes": os.path.getsize(vp),
                        "foreground_fraction": round(float(mask.mean()), 6)})

    manifest = {
        "_status": "SYNTHETIC - shape-matched probe input, NOT dataset bytes",
        "_cannot_answer": [
            "convergence behaviour",
            "achievable segmentation quality",
            "interaction between output stride and the REAL LA boundary thickness",
        ],
        "_shape_is_placeholder": ("Real cohort shape is Spike D criterion A6, unmeasured. "
                                  "Memory scales roughly with the square of the in-plane size, "
                                  "so every figure derived from this must be re-derived."),
        "seed": SEED,
        "shape_xyz": list(shape),
        "dtype_volume": "int16",
        "dtype_mask": "uint8",
        "mask_label_mapping": {"0": "background", "1": "foreground"},
        "cases": written,
    }
    with open(os.path.join(args.out, "synthetic_manifest.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write("\n")

    mb = 1024 * 1024
    print()
    print(f"  shape  {list(shape)}  int16   seed {SEED}")
    for w in written:
        print(f"  {w['volume']:<32} {w['volume_bytes'] / mb:7.1f} MB   "
              f"foreground {w['foreground_fraction'] * 100:.2f}%")
    print()
    print("  SYNTHETIC. C0 is a hardware-and-throughput probe only.")
    print("  Shape is a PLACEHOLDER until Spike D criterion A6.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
