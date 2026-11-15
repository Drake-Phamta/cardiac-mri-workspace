"""Step 5 - evaluation of every run and post-processing variant.

Reads RUN_DIR/<model>_<labels>_s<seed>/pred_{val,test}.npz (probabilities as
uint8) and RUN_DIR/classical/pred_*.npz, applies the post-processing
variants, and writes to results/tables/:

  per_case.csv      one row per (run, split, post-processing, volume)
  summary.csv       mean over cases per run, then mean +- SD over seeds
  wilcoxon.csv      paired Wilcoxon signed-rank tests on per-case Dice
  efficiency.csv    trainable parameters and training time per configuration
"""
import json
import re
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import wilcoxon

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import gt_volume, load_meta, load_splits, open_arrays  # noqa: E402
from metrics import all_metrics  # noqa: E402
from postprocess import VARIANTS, postprocess  # noqa: E402

RUN_RE = re.compile(r"^(?P<model>[a-z0-9]+)_(?P<labels>full|few)_s(?P<seed>\d+)$")
MODEL_ORDER = ["classical", "unet", "dinov3", "mricore", "concat", "gate", "gatedge"]


def run_info(run_dir: Path):
    if run_dir.name == "classical":
        return dict(model="classical", labels="none", seed=0)
    m = RUN_RE.match(run_dir.name)
    return None if m is None else dict(model=m["model"], labels=m["labels"], seed=int(m["seed"]))


def _eval_run(args):
    run_dir, info, gts = args
    rows = []
    for split in ("val", "test"):
        path = run_dir / f"pred_{split}.npz"
        if not path.exists():
            continue
        preds = np.load(path)
        variants = ("raw",) if info["model"] == "classical" else VARIANTS
        for vol in preds.files:
            mask = preds[vol] >= 128
            for pp in variants:
                met = all_metrics(postprocess(mask, pp), gts[vol])
                rows.append(dict(run=run_dir.name, **info, split=split, pp=pp, vol=vol, **met))
    return rows


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    per_run = df.groupby(["model", "labels", "split", "pp", "seed"])[["dice", "jaccard", "hd95", "asd", "vol_err"]].mean()
    agg = per_run.groupby(["model", "labels", "split", "pp"]).agg(["mean", "std"])
    agg.columns = [f"{m}_{s}" for m, s in agg.columns]
    agg["n_seeds"] = per_run.groupby(["model", "labels", "split", "pp"]).size()
    return agg.reset_index()


def paired_tests(df: pd.DataFrame) -> pd.DataFrame:
    test = df[(df.split == "test") & (df.pp == "raw")]
    case = test.groupby(["model", "labels", "vol"]).dice.mean().reset_index()
    rows = []
    pairs = [("gate", "dinov3"), ("gate", "mricore"), ("gate", "concat"), ("concat", "dinov3"),
             ("mricore", "dinov3"), ("gate", "unet"), ("dinov3", "unet"), ("mricore", "unet"),
             ("gatedge", "gate"), ("gatedge", "unet")]
    for labels in ("full", "few"):
        for a, b in pairs:
            xa = case[(case.model == a) & (case.labels == labels)].set_index("vol").dice
            xb = case[(case.model == b) & (case.labels == labels)].set_index("vol").dice
            common = xa.index.intersection(xb.index)
            if len(common) < 5:
                continue
            d = xa[common] - xb[common]
            p = wilcoxon(xa[common], xb[common]).pvalue if np.any(d != 0) else 1.0
            rows.append(dict(labels=labels, a=a, b=b, n=len(common), mean_diff=float(d.mean()),
                             a_better=int((d > 0).sum()), p_value=float(p)))
    return pd.DataFrame(rows)


def efficiency() -> pd.DataFrame:
    rows = []
    for run_dir in sorted(C.RUN_DIR.iterdir()):
        info = run_info(run_dir)
        if info is None or info["model"] == "classical" or not (run_dir / "summary.json").exists():
            continue
        s = json.loads((run_dir / "summary.json").read_text())
        rows.append(dict(**info, n_params=s["n_params"], train_sec=s["train_sec"], best_iter=s["best_iter"],
                         best_val_dice=s["best_val_dice"]))
    df = pd.DataFrame(rows)
    return df.groupby(["model", "labels"]).agg(n_params=("n_params", "first"), train_min=("train_sec", lambda x: x.mean() / 60),
                                               best_iter=("best_iter", "mean"), val_dice=("best_val_dice", "mean")).reset_index()


def main():
    meta, splits = load_meta(), load_splits()
    _, labels, _ = open_arrays()
    gts = {v: gt_volume(meta, labels, v) for v in splits["val"] + splits["test"]}
    jobs = []
    for run_dir in sorted(C.RUN_DIR.iterdir()):
        info = run_info(run_dir) if run_dir.is_dir() else None
        if info is not None and (run_dir / "pred_test.npz").exists():
            jobs.append((run_dir, info, gts))
    print(f"evaluating {len(jobs)} runs")
    with Pool(8) as pool:
        rows = [r for part in pool.map(_eval_run, jobs) for r in part]
    df = pd.DataFrame(rows)
    C.TABLES.mkdir(parents=True, exist_ok=True)
    df.to_csv(C.TABLES / "per_case.csv", index=False)
    summ = summarise(df)
    summ.to_csv(C.TABLES / "summary.csv", index=False)
    paired_tests(df).to_csv(C.TABLES / "wilcoxon.csv", index=False)
    efficiency().to_csv(C.TABLES / "efficiency.csv", index=False)
    show = summ[(summ.split == "test") & (summ.pp == "raw")]
    print(show[["model", "labels", "dice_mean", "dice_std", "hd95_mean", "asd_mean", "n_seeds"]].to_string(index=False))


if __name__ == "__main__":
    main()
