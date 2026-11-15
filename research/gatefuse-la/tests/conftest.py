"""Shared by the tests: code/ on sys.path, a tiny synthetic LA_WORK and a way to
run a training script on it (CPU only, a few iterations)."""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

CODE = Path(__file__).resolve().parents[1] / "code"
sys.path.insert(0, str(CODE))

CANVAS, GRID, FEAT_DIM = 256, 32, 768      # fixed in config.py
TINY_SPLITS = {"train": ["T1", "T2", "T3"], "val": ["V1"], "test": ["S1"], "few": ["T1", "T2"]}


def make_tiny_work(root: Path) -> Path:
    """prep/ and features/ with the layout data_prep.py and extract_features.py write,
    filled with random slices (a bright disc as the atrium) and random features."""
    rng = np.random.default_rng(0)
    yy, xx = np.mgrid[:CANVAS, :CANVAS]
    h, w = 200, 150
    top, left = (CANVAS - h) // 2, (CANVAS - w) // 2
    inside = np.zeros((CANVAS, CANVAS), bool)
    inside[top:top + h, left:left + w] = True
    images, labels, rows = [], [], []
    for split in ("train", "val", "test"):
        for vol in TINY_SPLITS[split]:
            for z in range(3):
                cy, cx = 128 + rng.integers(-15, 15), 128 + rng.integers(-15, 15)
                lab = (yy - cy) ** 2 + (xx - cx) ** 2 < (20 + 5 * z) ** 2
                img = np.clip(60 + 120 * lab + rng.normal(0, 20, lab.shape), 0, 255) * inside
                images.append(img.astype(np.uint8))
                labels.append(lab.astype(np.uint8))
                rows.append(dict(vol=vol, z=z, h=h, w=w, top=top, left=left, split=split, fg=int(lab.sum())))
    prep, feat = root / "prep", root / "features"
    prep.mkdir(parents=True)
    feat.mkdir()
    np.save(prep / "images.npy", np.stack(images))
    np.save(prep / "labels.npy", np.stack(labels))
    pd.DataFrame(rows).to_csv(prep / "meta.csv", index_label="idx")
    (prep / "splits.json").write_text(json.dumps(TINY_SPLITS))
    for enc in ("dinov3", "mricore"):
        f = rng.standard_normal((len(rows), FEAT_DIM, GRID, GRID), dtype=np.float32)
        np.save(feat / f"{enc}.npy", f.astype(np.float16))
    return root


@pytest.fixture(scope="session")
def tiny_work(tmp_path_factory):
    return make_tiny_work(tmp_path_factory.mktemp("work"))


@pytest.fixture(scope="session")
def train_on_tiny_work(tiny_work):
    """train_on_tiny_work("train_ml.py", [options], out_dir) runs 5 iterations on the CPU."""
    def run(script, args, out):
        env = dict(os.environ, LA_WORK=str(tiny_work), CUDA_VISIBLE_DEVICES="-1", OMP_NUM_THREADS="2",
                   MKL_NUM_THREADS="2", PYTHONIOENCODING="utf-8")
        cmd = [sys.executable, "-X", "utf8", str(CODE / script), *args,
               "--iters", "5", "--batch", "4", "--eval-every", "1", "--device", "cpu", "--out", str(out)]
        done = subprocess.run(cmd, env=env, capture_output=True, text=True)
        assert done.returncode == 0, done.stderr
        return out
    return run
