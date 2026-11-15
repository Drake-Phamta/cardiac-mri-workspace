"""Step 1 - data preparation (chapter 2-3).

Reads the 100 LGE-MRI volumes of the 2018 Left Atrium Segmentation Challenge
(UA-MT h5 copy: image + label, already cropped around the atrium), cuts them
into axial slices, applies per-slice percentile clipping + min-max stretching
and zero-pads every slice to a fixed CANVAS x CANVAS square. Nothing is
shrunk, so labels keep their native resolution.

Outputs (in PREP_DIR):
  images.npy  uint8  (N, CANVAS, CANVAS)
  labels.npy  uint8  (N, CANVAS, CANVAS)
  meta.csv    one row per slice: vol, z, h, w, top, left, split
  splits.json volume ids per split
"""
import argparse
import json
import sys
from pathlib import Path

import h5py
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402


def stretch(slice_2d: np.ndarray) -> np.ndarray:
    """Percentile clipping + min-max to [0, 1] (contrast stretching)."""
    lo, hi = np.percentile(slice_2d, [C.CLIP_LOW, C.CLIP_HIGH])
    if hi <= lo:
        return np.zeros_like(slice_2d, dtype=np.float32)
    out = (np.clip(slice_2d, lo, hi) - lo) / (hi - lo)
    return out.astype(np.float32)


def pad_to_canvas(a: np.ndarray, canvas: int):
    h, w = a.shape
    if h > canvas or w > canvas:
        raise ValueError(f"slice {a.shape} larger than canvas {canvas}")
    top, left = (canvas - h) // 2, (canvas - w) // 2
    out = np.zeros((canvas, canvas), dtype=a.dtype)
    out[top:top + h, left:left + w] = a
    return out, top, left


def read_list(path: Path):
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(C.RAW_DIR))
    ap.add_argument("--out", default=str(C.PREP_DIR))
    args = ap.parse_args()
    raw, out = Path(args.raw), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    train_list = read_list(raw / "train.list")
    test_list = read_list(raw / "test.list")
    assert len(train_list) == 80 and len(test_list) == 20
    splits = {
        "train": train_list[: len(train_list) - C.N_VAL],
        "val": train_list[len(train_list) - C.N_VAL:],
        "test": test_list,
    }
    splits["few"] = splits["train"][: C.N_FEW]
    (out / "splits.json").write_text(json.dumps(splits, indent=1))

    split_of = {v: s for s in ("train", "val", "test") for v in splits[s]}
    vols = splits["train"] + splits["val"] + splits["test"]

    images, labels, rows = [], [], []
    for vol in vols:
        with h5py.File(raw / "2018LA_Seg_Training Set" / vol / "mri_norm2.h5", "r") as f:
            img = f["image"][:].astype(np.float32)
            lab = (f["label"][:] > 0).astype(np.uint8)
        h, w, depth = img.shape
        for z in range(depth):
            s = stretch(img[:, :, z])
            s_pad, top, left = pad_to_canvas(s, C.CANVAS)
            l_pad, _, _ = pad_to_canvas(lab[:, :, z], C.CANVAS)
            images.append(np.rint(s_pad * 255).astype(np.uint8))
            labels.append(l_pad)
            rows.append(dict(vol=vol, z=z, h=h, w=w, top=top, left=left,
                             split=split_of[vol], fg=int(lab[:, :, z].sum())))
        print(f"{vol}: {img.shape}  split={split_of[vol]}")

    np.save(out / "images.npy", np.stack(images))
    np.save(out / "labels.npy", np.stack(labels))
    meta = pd.DataFrame(rows)
    meta.to_csv(out / "meta.csv", index_label="idx")
    print(meta.groupby("split").agg(slices=("z", "size"), vols=("vol", "nunique"),
                                    with_la=("fg", lambda x: int((x > 0).sum()))))


if __name__ == "__main__":
    main()
