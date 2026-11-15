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


def tiny_volume(work: Path, vol: str):
    """(reference mask cropped to the volume, label slices on the canvas) of one tiny_work volume."""
    from data import gt_volume, volume_index
    meta = pd.read_csv(work / "prep" / "meta.csv", index_col="idx")
    labels = np.load(work / "prep" / "labels.npy")
    return gt_volume(meta, labels, vol), labels[volume_index(meta, vol)].astype(bool)


@pytest.fixture(scope="session")
def fake_run(tiny_work):
    """fake_run(folder, prob=..., gate=..., finished=True, **config) writes a run folder like train_ml.py does.

    prob(gt, rng) gives the uint8 probabilities of a volume from its reference mask (default: perfect);
    gate(canvas_labels) gives its gate values (default: no gate file); config overrides config.json fields."""
    def make(folder, prob=lambda gt, rng: gt * 255, gate=None, finished=True, **config):
        cfg = dict(model="gate", labels="few", seed=0, iters=200, batch=16, width=128, unet_base=16, eval_every=100,
                   n_params=1000, n_train_slices=6, n_train_vols=2)
        cfg.update(config)
        folder.mkdir(parents=True)
        (folder / "config.json").write_text(json.dumps(cfg))
        rng = np.random.default_rng(cfg["seed"])
        for split in ("val", "test"):
            vols = {v: tiny_volume(tiny_work, v) for v in TINY_SPLITS[split]}
            np.savez_compressed(folder / f"pred_{split}.npz",
                                **{v: np.asarray(prob(gt, rng)).astype(np.uint8) for v, (gt, _) in vols.items()})
            if gate is not None:
                np.savez_compressed(folder / f"gate_{split}.npz",
                                    **{v: np.asarray(gate(canvas), np.float16) for v, (_, canvas) in vols.items()})
        if finished:
            pd.DataFrame(dict(iter=[100, 200], loss=[0.5, 0.4], val_dice=[0.8, 0.9], lr=[1e-3, 1e-5],
                              sec=[10.0, 20.0])).to_csv(folder / "history.csv", index=False)
            (folder / "summary.json").write_text(json.dumps(dict(best_iter=200, best_val_dice=0.9, train_sec=20.0,
                                                                 n_params=cfg["n_params"])))
        return folder
    return make


SCORE_DEFAULTS = dict(source="runs", model="gate", labels="few", fusion="token", width=128, unet_base=16,
                      loss="bce_dice", aug="none", split_set="ip", n_train_vols=8, iters=2000)


@pytest.fixture(scope="session")
def make_scores():
    """make_scores(dice, seeds=(0, 1, 2), **fields): rows of evaluate_ml.py's per_case.csv for one
    configuration. dice holds one value per volume (seed s adds 0.001 * s); fields override
    SCORE_DEFAULTS and the split ("test"), post-processing ("raw") and volume names."""
    def make(dice, seeds=(0, 1, 2), split="test", pp="raw", vols=None, hd95=None, **fields):
        f = dict(SCORE_DEFAULTS, **fields)
        vols = vols or [f"v{i:02d}" for i in range(len(dice))]
        hd95 = 20 * (1 - np.asarray(dice)) if hd95 is None else np.asarray(hd95)
        name = "_".join(str(f[k]) for k in ("model", "labels", "split_set", "fusion", "width", "loss", "aug", "iters"))
        rows = [dict(f, run=f"{name}_s{s}", seed=s, split=split, pp=pp, vol=v, dice=d + 0.001 * s,
                     jaccard=(d + 0.001 * s) / (2 - d - 0.001 * s), hd95=h, asd=h / 4, vol_err=5.0)
                for s in seeds for v, d, h in zip(vols, dice, hd95)]
        return pd.DataFrame(rows)
    return make


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
