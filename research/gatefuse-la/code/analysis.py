"""Error analysis on the test set (72 training volumes, threshold 0.5, 3 seeds).

For every wrong voxel (false positive or false negative) we record
  * whether it lies in the band of +-2 voxels around the reference surface
    (computed with 3D dilation/erosion, chapter 7), and
  * whether its slice lies in the top or bottom 20 % of the atrium's
    slice range (or outside it) - where the pulmonary veins and the floor of
    the atrium are.
The last row gives the share of the reference atrium lying in each region,
so the error shares can be read as densities.
Output: results/tables/error_analysis.csv
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import gt_volume, load_meta, load_splits, open_arrays  # noqa: E402

MODELS = ["unet", "dinov3", "mricore", "concat", "gate", "gatedge"]
_ST = ndimage.generate_binary_structure(3, 1)


def regions(gt):
    band = ndimage.binary_dilation(gt, _ST, 2) & ~ndimage.binary_erosion(gt, _ST, 2)
    zs = np.flatnonzero(gt.any(axis=(1, 2)))
    lo, hi = zs[0], zs[-1]
    span = hi - lo + 1
    z = np.arange(gt.shape[0])
    ends = (z < lo + 0.2 * span) | (z > hi - 0.2 * span)
    return band, ends[:, None, None] & np.ones_like(gt)


def main():
    meta, splits = load_meta(), load_splits()
    _, labels, _ = open_arrays()
    gts = {v: gt_volume(meta, labels, v) for v in splits["test"]}
    reg = {v: regions(g) for v, g in gts.items()}
    rows = []
    for m in MODELS:
        for seed in C.SEEDS:
            path = C.RUN_DIR / f"{m}_full_s{seed}" / "pred_test.npz"
            if not path.exists():
                continue
            preds = np.load(path)
            n_err = n_band = n_ends = n_fp = 0
            for v, gt in gts.items():
                err = (preds[v] >= 128) ^ gt
                band, ends = reg[v]
                n_err += int(err.sum())
                n_band += int((err & band).sum())
                n_ends += int((err & ends).sum())
                n_fp += int((err & ~gt).sum())
            rows.append(dict(model=m, seed=seed, err_voxels=n_err, frac_boundary=n_band / n_err,
                             frac_ends=n_ends / n_err, frac_fp=n_fp / n_err))
    df = pd.DataFrame(rows)
    out = df.groupby("model")[["err_voxels", "frac_boundary", "frac_ends", "frac_fp"]].mean().reindex(MODELS)
    C.TABLES.mkdir(parents=True, exist_ok=True)
    # share of the reference atrium inside each region, to read the error shares as densities
    tot = sum(int(g.sum()) for g in gts.values())
    gt_band = sum(int((g & reg[v][0]).sum()) for v, g in gts.items()) / tot
    gt_ends = sum(int((g & reg[v][1]).sum()) for v, g in gts.items()) / tot
    out.loc["reference_share"] = [np.nan, gt_band, gt_ends, np.nan]
    out.to_csv(C.TABLES / "error_analysis.csv")
    print(out.round(3).to_string())


if __name__ == "__main__":
    main()
