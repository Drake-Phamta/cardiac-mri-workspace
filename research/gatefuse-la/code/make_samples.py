"""Write the sample images required by the submission (samples/):
8 axial test slices (contrast-stretched, native size) with their reference
masks, plus one complete test volume in the original h5 format for the
volume demo. Files: <case>_z<slice>_img.png, <case>_z<slice>_mask.png.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import gt_volume, image_volume, load_meta, load_splits, open_arrays  # noqa: E402


def main(n=8):
    meta, splits = load_meta(), load_splits()
    images, labels, _ = open_arrays()
    out = C.REPO / "samples"
    out.mkdir(exist_ok=True)
    for vol in splits["test"][:n]:
        img, gt = image_volume(meta, images, vol), gt_volume(meta, labels, vol)
        areas = gt.sum(axis=(1, 2))
        z = int(np.flatnonzero(areas)[len(np.flatnonzero(areas)) // 2])   # middle of the atrium
        stem = f"{vol[:8]}_z{z:02d}"
        Image.fromarray(img[z]).save(out / f"{stem}_img.png")
        Image.fromarray((gt[z] * 255).astype(np.uint8)).save(out / f"{stem}_mask.png")
        print("wrote", stem)
    vol = splits["test"][0]
    shutil.copy(C.RAW_DIR / "2018LA_Seg_Training Set" / vol / "mri_norm2.h5", out / f"volume_{vol[:8]}.h5")
    print("wrote volume", vol)


if __name__ == "__main__":
    main()
