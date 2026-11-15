"""Step 4 - morphological post-processing (chapter 7).

The network predicts every axial slice independently, so the stacked 3D mask
can contain detached blobs and small holes. The variants below are compared
in the post-processing ablation:

  raw            threshold 0.5 only
  lcc            keep the largest 3D connected component (26-connectivity)
  lcc_fill       + fill holes slice by slice
  lcc_fill_close + binary closing with a 3x3x3 ball before hole filling
"""
import numpy as np
from scipy import ndimage

VARIANTS = ("raw", "lcc", "lcc_fill", "lcc_fill_close")
_STRUCT26 = np.ones((3, 3, 3), dtype=bool)
_BALL1 = ndimage.generate_binary_structure(3, 1)


def largest_cc(mask: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(mask, structure=_STRUCT26)
    if n <= 1:
        return mask.astype(bool)
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def fill_holes_slicewise(mask: np.ndarray) -> np.ndarray:
    """mask is (z, h, w); fill enclosed background inside every axial slice."""
    return np.stack([ndimage.binary_fill_holes(s) for s in mask])


def postprocess(mask: np.ndarray, variant: str) -> np.ndarray:
    m = mask.astype(bool)
    if variant == "raw":
        return m
    m = largest_cc(m)
    if variant == "lcc":
        return m
    if variant == "lcc_fill_close":
        m = ndimage.binary_closing(m, structure=_BALL1, iterations=1)
    return fill_holes_slicewise(m)
