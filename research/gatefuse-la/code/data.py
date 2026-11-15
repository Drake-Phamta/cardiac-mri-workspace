"""Helpers to read the prepared slices, cached features and to rebuild volumes."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402


def load_meta() -> pd.DataFrame:
    return pd.read_csv(C.PREP_DIR / "meta.csv", index_col="idx")


def load_splits() -> dict:
    return json.loads((C.PREP_DIR / "splits.json").read_text())


def volume_index(meta: pd.DataFrame, vol: str) -> np.ndarray:
    """Global slice indices of one volume, ordered by z."""
    sub = meta[meta.vol == vol].sort_values("z")
    return sub.index.to_numpy()


def crop_volume(canvas_stack: np.ndarray, row) -> np.ndarray:
    """(z, CANVAS, CANVAS) -> native (z, h, w) by removing the zero padding."""
    t, l, h, w = int(row.top), int(row.left), int(row.h), int(row.w)
    return canvas_stack[:, t:t + h, l:l + w]


def gt_volume(meta: pd.DataFrame, labels: np.ndarray, vol: str) -> np.ndarray:
    idx = volume_index(meta, vol)
    return crop_volume(np.asarray(labels[idx]), meta.loc[idx[0]]).astype(bool)


def image_volume(meta: pd.DataFrame, images: np.ndarray, vol: str) -> np.ndarray:
    idx = volume_index(meta, vol)
    return crop_volume(np.asarray(images[idx]), meta.loc[idx[0]])


def open_arrays(need_features=()):
    images = np.load(C.PREP_DIR / "images.npy", mmap_mode="r")
    labels = np.load(C.PREP_DIR / "labels.npy", mmap_mode="r")
    feats = {e: np.load(C.FEAT_DIR / f"{e}.npy", mmap_mode="r") for e in need_features}
    return images, labels, feats
