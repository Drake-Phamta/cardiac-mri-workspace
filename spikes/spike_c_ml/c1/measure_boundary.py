#!/usr/bin/env python3
"""
C1-5 — LA boundary thickness in voxels versus each decoder's effective output stride.

Question (C1_MEASUREMENT_PLAN.md §4, C1-5): can the decoder resolve the structure at
all? A ViT backbone sees 14x14 patches; if the left atrium has parts thinner than the
decoder's effective output stride, those parts cannot be represented no matter how well
the model trains. Synthetic data has no anatomy, so C0 could not answer this.

Method (stated so a reviewer can disagree with a specific step):
  1. read the ground-truth LA cavity masks of the SELECTED TRAINING CASES only
     (the caller passes the allowlisted ids; holdout/validation ids are refused upstream);
  2. per non-empty axial slice, skeletonize the mask (skimage.morphology.skeletonize)
     and take local thickness = 2 * Euclidean distance to background at each skeleton
     pixel (scipy.ndimage.distance_transform_edt) — the diameter of the largest disc
     centred on the medial axis;
  3. report the distribution in NATIVE voxels and rescaled to the model input
     (thickness * img / native_width);
  4. compare with each decoder's effective output stride at the model input:
       unet (full resolution)                1.0  px
       dinov2 progressive decoder (14 / 8)    1.75 px
       dinov2 linear decoder (patch 14)       14.0 px
     and report the fraction of skeleton points thinner than each stride.

Physical units are NOT reported: spacing in this release is an identity placeholder
(PR-SCI-02 / TC-SCI-002). Everything here is in voxels.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize

STRIDES = {"unet_full_resolution": 1.0, "dinov2_progressive": 14.0 / 8.0, "dinov2_linear": 14.0}


def slice_thickness(mask2d: np.ndarray) -> np.ndarray:
    m = mask2d > 0
    if not m.any():
        return np.empty(0)
    dist = ndimage.distance_transform_edt(m)
    skel = skeletonize(m)
    return 2.0 * dist[skel]


def measure(masks: dict[str, np.ndarray], img: int) -> dict:
    """masks: case_id -> uint8 array [Z, H, W] at native resolution."""
    native, scaled, per_case = [], [], {}
    for cid, vol in sorted(masks.items()):
        width = vol.shape[2]
        vals = [slice_thickness(vol[z]) for z in range(vol.shape[0])]
        vals = np.concatenate([v for v in vals if v.size]) if any(v.size for v in vals) else np.empty(0)
        native.append(vals)
        scaled.append(vals * (img / float(width)))
        per_case[cid] = {
            "native_width": int(width),
            "skeleton_points": int(vals.size),
            "p5_native": float(np.percentile(vals, 5)) if vals.size else None,
            "p50_native": float(np.percentile(vals, 50)) if vals.size else None,
        }
    native = np.concatenate(native) if native else np.empty(0)
    scaled = np.concatenate(scaled) if scaled else np.empty(0)

    def pct(a):
        if not a.size:
            return None
        return {f"p{q}": round(float(np.percentile(a, q)), 3) for q in (1, 5, 10, 25, 50, 75)}

    return {
        "unit": "voxels (identity spacing placeholder; no physical units)",
        "model_input_size": img,
        "cases": len(masks),
        "skeleton_points": int(native.size),
        "thickness_native": pct(native),
        "thickness_at_model_input": pct(scaled),
        "fraction_thinner_than_stride_at_model_input": {
            k: round(float((scaled < s).mean()), 5) if scaled.size else None for k, s in STRIDES.items()
        },
        "effective_output_stride_at_model_input": STRIDES,
        "per_case": per_case,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--npz-dir", type=Path, required=True,
                    help="directory of <case_id>_mask_native.npy files written by run_feasibility.py")
    ap.add_argument("--img", type=int, default=560)
    ap.add_argument("--json-out", type=Path, required=True)
    args = ap.parse_args()
    masks = {p.name.split("_mask_native")[0]: np.load(p) for p in sorted(args.npz_dir.glob("*_mask_native.npy"))}
    if not masks:
        raise SystemExit("no *_mask_native.npy files found")
    t0 = time.perf_counter()
    out = measure(masks, args.img)
    out["elapsed_seconds"] = round(time.perf_counter() - t0, 2)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("cases", "skeleton_points", "thickness_native",
                                          "fraction_thinner_than_stride_at_model_input")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
