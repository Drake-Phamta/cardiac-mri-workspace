"""Classical baseline - no learning (chapters 3, 5 and 7).

  1. 3D Gaussian smoothing, sigma                          (ch. 3, noise suppression)
  2. global Otsu threshold scaled by k                      (ch. 5, thresholding)
  3. morphological opening, diamond element of radius r     (ch. 7, cut thin bridges
     between the atrium and the pulmonary veins / aorta / ventricle)
  4. 3D connected components; keep the component with most voxels inside
     the central half of the ROI (the volumes are cropped around the atrium)
  5. closing (radius 1) + slice-wise hole filling             (ch. 7)

(sigma, k, r) are chosen by grid search on the 8 validation volumes plus the
first 16 training volumes (mean 3D Dice); the test set is never used.

The search was run coarse-to-fine: whenever the optimum sat on the edge of the
grid, the grid was extended (286 combinations in total, sigma 0.5-5,
k 1.0-1.8, r 2-32; merged table in results/tables/classical_grid_all.csv).
Dice rises with the opening radius up to r = 24 and collapses at r = 32,
where the opening erases the atrium itself. The grid below is the final,
fine round; re-running it reproduces the reported choice (2.0, 1.2, 24).
"""
import itertools
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage
from skimage.filters import threshold_otsu

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import gt_volume, image_volume, load_meta, load_splits, open_arrays  # noqa: E402
from metrics import dice  # noqa: E402
from postprocess import fill_holes_slicewise  # noqa: E402

SIGMAS = (2.0, 3.0, 4.0)
KS = (1.1, 1.2, 1.3, 1.4)
RADII = (20, 24, 28)
_CROSS = ndimage.generate_binary_structure(3, 1)


def central_score(lab, n):
    z, h, w = lab.shape
    box = lab[z // 4: 3 * z // 4, h // 4: 3 * h // 4, w // 4: 3 * w // 4]
    return ndimage.sum(np.ones_like(box), box, index=np.arange(1, n + 1))


def segment(vol_u8, sigma, k, r):
    v = ndimage.gaussian_filter(vol_u8.astype(np.float32), sigma)
    m = v > k * threshold_otsu(v)
    if r > 0:
        m = ndimage.binary_dilation(ndimage.binary_erosion(m, _CROSS, iterations=r), _CROSS, iterations=r)
    lab, n = ndimage.label(m, structure=np.ones((3, 3, 3), bool))
    if n == 0:
        return m
    m = lab == (1 + int(np.argmax(central_score(lab, n))))
    m = ndimage.binary_closing(m, _CROSS, iterations=1)
    return fill_holes_slicewise(m)


def _grid_one(args):
    vol, img, gt = args
    rows = []
    for sigma, k, r in itertools.product(SIGMAS, KS, RADII):
        rows.append(dict(vol=vol, sigma=sigma, k=k, r=r, dice=dice(segment(img, sigma, k, r), gt)))
    return rows


def main():
    meta, splits = load_meta(), load_splits()
    images, labels, _ = open_arrays()
    tune_vols = splits["val"] + splits["train"][:16]
    jobs = [(v, image_volume(meta, images, v), gt_volume(meta, labels, v)) for v in tune_vols]
    with Pool(6) as pool:
        rows = [r for part in pool.map(_grid_one, jobs) for r in part]
    grid = pd.DataFrame(rows).groupby(["sigma", "k", "r"]).dice.mean().reset_index()
    grid = grid.sort_values("dice", ascending=False)
    C.TABLES.mkdir(parents=True, exist_ok=True)
    grid.to_csv(C.TABLES / "classical_grid.csv", index=False)
    best = grid.iloc[0]
    params = dict(sigma=float(best.sigma), k=float(best.k), r=int(best.r), tune_dice=float(best.dice))
    print("best params", params)

    out = C.RUN_DIR / "classical"
    out.mkdir(parents=True, exist_ok=True)
    (out / "params.json").write_text(json.dumps(params, indent=1))
    for split in ("val", "test"):
        preds = {v: segment(image_volume(meta, images, v), params["sigma"], params["k"], params["r"])
                 for v in splits[split]}
        np.savez_compressed(out / f"pred_{split}.npz",
                            **{v: (m.astype(np.uint8) * 255) for v, m in preds.items()})
        if split == "test":
            d = [dice(preds[v], gt_volume(meta, labels, v)) for v in splits[split]]
            print(f"test Dice {np.mean(d):.4f} +- {np.std(d):.4f}")


if __name__ == "__main__":
    main()
