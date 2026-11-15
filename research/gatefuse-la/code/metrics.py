"""3D segmentation metrics computed on native-resolution volumes.

Dice, Jaccard (IoU), 95 % Hausdorff distance (HD95, medpy definition: max of
the two directed 95th percentiles), symmetric average surface distance
(ASD) and the absolute error of the atrial volume in percent (vol_err).
Distances are in voxels; 1 voxel = 0.625 mm for the Utah LGE-MRI data.
"""
import numpy as np
from scipy import ndimage


def dice(pred: np.ndarray, gt: np.ndarray) -> float:
    p, g = pred.astype(bool), gt.astype(bool)
    s = p.sum() + g.sum()
    return 1.0 if s == 0 else 2.0 * np.logical_and(p, g).sum() / s


def jaccard(pred: np.ndarray, gt: np.ndarray) -> float:
    p, g = pred.astype(bool), gt.astype(bool)
    u = np.logical_or(p, g).sum()
    return 1.0 if u == 0 else np.logical_and(p, g).sum() / u


def _surface(mask: np.ndarray) -> np.ndarray:
    struct = ndimage.generate_binary_structure(mask.ndim, 1)
    return mask ^ ndimage.binary_erosion(mask, structure=struct, border_value=0)


def surface_distances(pred: np.ndarray, gt: np.ndarray, spacing=1.0):
    p, g = pred.astype(bool), gt.astype(bool)
    if not p.any() or not g.any():
        return None, None
    ps, gs = _surface(p), _surface(g)
    dt_g = ndimage.distance_transform_edt(~gs, sampling=spacing)
    dt_p = ndimage.distance_transform_edt(~ps, sampling=spacing)
    return dt_g[ps], dt_p[gs]          # pred->gt, gt->pred


def all_metrics(pred: np.ndarray, gt: np.ndarray, spacing=1.0) -> dict:
    d_pg, d_gp = surface_distances(pred, gt, spacing)
    if d_pg is None:
        hd95 = asd = float("nan")
    else:
        hd95 = float(max(np.percentile(d_pg, 95), np.percentile(d_gp, 95)))
        asd = float((d_pg.mean() + d_gp.mean()) / 2)
    vg = float(gt.astype(bool).sum())
    vol_err = 100.0 * abs(float(pred.astype(bool).sum()) - vg) / vg if vg else float("nan")
    return dict(dice=float(dice(pred, gt)), jaccard=float(jaccard(pred, gt)), hd95=hd95, asd=asd,
                vol_err=vol_err)
