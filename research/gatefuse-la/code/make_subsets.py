"""Split files for the learning curve: how the result changes with the number
of labelled training volumes.

Writes one JSON per training set into LA_WORK/splits/ (or --out-dir), in the
format train_ml.py --split-file reads: {"train": [...], "val": [...], "test": [...]}.

  n4, n8, n16, n36, n72   the first n volumes of the IP training list, in list
                          order, so each set contains every smaller one (nested).
                          n8 is the IP "few" set and n72 the full IP training set.
  n8_draw1, n8_draw2      8 volumes drawn at random from the 72 (numpy seeds 1
                          and 2), to see how much an 8-volume result depends on
                          which 8 volumes were labelled.

val and test are the IP lists, unchanged, in every file.

  python code/make_subsets.py
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import load_splits  # noqa: E402

NESTED = (4, 8, 16, 36, 72)
DRAW_SEEDS = (1, 2)


def make_subsets(ip: dict) -> dict:
    """ip: the IP split with "train", "val" and "test" lists. Returns {file name: split}."""
    train = ip["train"]
    if len(train) < max(NESTED):
        raise ValueError(f"the training list has {len(train)} volumes, fewer than {max(NESTED)}")
    subsets = {f"n{n}": train[:n] for n in NESTED}
    for seed in DRAW_SEEDS:
        pick = np.random.default_rng(seed).choice(len(train), size=8, replace=False)
        subsets[f"n8_draw{seed}"] = [train[i] for i in sorted(pick)]
    return {name: dict(train=vols, val=ip["val"], test=ip["test"]) for name, vols in subsets.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=str(C.WORK / "splits"))
    out_dir = Path(ap.parse_args().out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, split in make_subsets(load_splits()).items():
        (out_dir / f"{name}.json").write_text(json.dumps(split, indent=1))
        print(f"{out_dir / name}.json: {len(split['train'])} training volumes")


if __name__ == "__main__":
    main()
