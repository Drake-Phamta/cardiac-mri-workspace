"""Split files for 5-fold cross-validation over the 80 non-test volumes.

The IP test set (20 volumes) is left out entirely. The other 80 volumes (the
IP training and validation lists) are shuffled once with numpy seed 0 and cut
into 5 groups of 16. For fold k:

  test   group k (16 volumes). Over the 5 folds every one of the 80 volumes is
         tested exactly once, so each gets one out-of-fold prediction.
  val    the first 8 volumes of group k + 1 (group 0 for the last fold), only
         to choose the checkpoint; no volume is a validation volume twice.
  train  the other 56 volumes                                -> fold{k}_full.json
         or the first 8 of them in the shuffled order         -> fold{k}_few.json
         (same val and test, so the full and few runs of a fold are paired)

The files go to LA_WORK/splits/ (or --out-dir) in the format train_ml.py
--split-file reads.

  python code/make_folds.py
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import load_splits  # noqa: E402

N_FOLDS = 5
N_VAL = 8
N_FEW = 8
SEED = 0


def make_folds(ip: dict, seed: int = SEED) -> dict:
    """ip: the IP split with "train", "val" and "test" lists. Returns {file name: split}."""
    vols = ip["train"] + ip["val"]
    if len(vols) % N_FOLDS:
        raise ValueError(f"{len(vols)} volumes do not split into {N_FOLDS} equal folds")
    shuffled = [vols[i] for i in np.random.default_rng(seed).permutation(len(vols))]
    size = len(vols) // N_FOLDS
    groups = [shuffled[k * size:(k + 1) * size] for k in range(N_FOLDS)]
    folds = {}
    for k in range(N_FOLDS):
        test = groups[k]
        val = groups[(k + 1) % N_FOLDS][:N_VAL]
        train = [v for v in shuffled if v not in test and v not in val]
        folds[f"fold{k}_full"] = dict(train=train, val=val, test=test)
        folds[f"fold{k}_few"] = dict(train=train[:N_FEW], val=val, test=test)
    return folds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=str(C.WORK / "splits"))
    out_dir = Path(ap.parse_args().out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, split in make_folds(load_splits()).items():
        (out_dir / f"{name}.json").write_text(json.dumps(split, indent=1))
        print(f"{out_dir / name}.json: train {len(split['train'])}, val {len(split['val'])}, "
              f"test {len(split['test'])}")


if __name__ == "__main__":
    main()
