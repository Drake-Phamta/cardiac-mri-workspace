"""Score run folders of the Machine Learning course experiments.

Works for the night-1 runs (LA_WORK/runs/<model>_<labels>_s<seed>, trained by
train.py) and the train_ml.py runs (LA_WORK/runs_ml/<name>). Every run is scored
on the val and test volumes of its own split (the volumes in pred_val.npz and
pred_test.npz), with the metrics of metrics.py after each post-processing
variant of postprocess.py, exactly as evaluate.py does for the IP report.

Output in --out (default LA_WORK/analysis/evaluate_ml/):
  per_case.csv     one row per (run, split, post-processing, volume):
                   run, source, model, labels, fusion, width, unet_base, loss, aug,
                   split_set, n_train_vols, iters, seed, split, pp, vol,
                   dice, jaccard, hd95, asd, vol_err
  summary.csv      mean over the volumes of each (run, split, pp)
  per_run/         the rows of each run, kept so that the next call only
                   scores runs that are new (use --fresh to score all again)

split_set is "ip" for the IP split (prep/splits.json) or the name of the
--split-file (n4, n8_draw1, fold0_full, ...). A run that is still training
(no summary.json yet) is skipped and named.

  python code/evaluate_ml.py                       # every run in runs/ and runs_ml/
  python code/evaluate_ml.py work/runs_ml/gate_w32_s0 --workers 2
"""
import argparse
import json
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import gt_volume, load_meta, open_arrays  # noqa: E402
from metrics import all_metrics  # noqa: E402
from postprocess import VARIANTS, postprocess  # noqa: E402

METRICS = ["dice", "jaccard", "hd95", "asd", "vol_err"]


def describe_run(run_dir: Path) -> dict:
    """The configuration of one run as flat fields. Night-1 runs were trained by
    train.py, which has none of the ML options: they get the defaults of train_ml.py."""
    info = dict(run=run_dir.name, source=run_dir.parent.name)
    if run_dir.name == "classical":
        return dict(info, model="classical", labels="none", fusion="none", width=0, unet_base=0, loss="none",
                    aug="none", split_set="ip", n_train_vols=0, iters=0, seed=0)
    cfg = json.loads((run_dir / "config.json").read_text(encoding="utf-8"))
    split_file = cfg.get("split_file")
    return dict(info, model=cfg["model"], labels=cfg["labels"],
                fusion=cfg.get("fusion", "token") if cfg["model"] == "gate" else "none",
                width=cfg["width"], unet_base=cfg["unet_base"], loss=cfg.get("loss", "bce_dice"),
                aug=cfg.get("aug", "none"), split_set=Path(split_file).stem if split_file else "ip",
                n_train_vols=cfg["n_train_vols"], iters=cfg["iters"], seed=cfg["seed"])


def is_run_folder(path: Path) -> bool:
    return (path / "config.json").exists() or path.name == "classical"


def is_finished(run_dir: Path) -> bool:
    # train_ml.py writes summary.json after the predictions; classical.py has no summary
    if run_dir.name == "classical":
        return (run_dir / "pred_test.npz").exists()
    return (run_dir / "summary.json").exists() and (run_dir / "pred_test.npz").exists()


def find_runs(paths) -> tuple:
    """Run folders among the given paths (a run folder, or a folder of run folders).
    Returns (finished runs, unfinished run folders)."""
    finished, unfinished = [], []
    for path in map(Path, paths):
        if not path.is_dir():
            print(f"not a folder, skipped: {path}")
            continue
        candidates = [path] if is_run_folder(path) else sorted(p for p in path.iterdir() if is_run_folder(p))
        for run_dir in candidates:
            (finished if is_finished(run_dir) else unfinished).append(run_dir)
    return finished, unfinished


def score_run(job) -> tuple:
    """(run folder, all rows of the run). Runs in a worker process, so it opens the data itself."""
    run_dir, splits, variants = job
    info = describe_run(run_dir)
    meta = load_meta()
    _, labels, _ = open_arrays()
    rows = []
    for split in splits:
        path = run_dir / f"pred_{split}.npz"
        if not path.exists():
            continue
        preds = np.load(path)
        # classical.py already returns a cleaned mask, as in evaluate.py
        pps = ("raw",) if info["model"] == "classical" else variants
        for vol in preds.files:
            gt = gt_volume(meta, labels, vol)
            mask = preds[vol] >= 128
            for pp in pps:
                rows.append(dict(info, split=split, pp=pp, vol=vol, **all_metrics(postprocess(mask, pp), gt)))
    return run_dir, rows


def score_all(jobs, workers):
    """Yields (run folder, rows) for each job as soon as it is scored."""
    if workers <= 1 or len(jobs) <= 1:
        yield from map(score_run, jobs)
        return
    with Pool(workers) as pool:
        yield from pool.imap_unordered(score_run, jobs)


def cache_file(cache_dir: Path, run_dir: Path) -> Path:
    return cache_dir / f"{run_dir.parent.name}__{run_dir.name}.csv"


def read_cache(path: Path, run_dir: Path, splits, variants):
    """The cached rows of a run, or None when they are missing, older than the
    predictions or lack a requested split or variant."""
    if not path.exists() or path.stat().st_mtime < (run_dir / "pred_test.npz").stat().st_mtime:
        return None
    rows = pd.read_csv(path)
    wanted = set(variants) if run_dir.name != "classical" else {"raw"}
    if not (set(splits) <= set(rows.split) and wanted <= set(rows.pp)):
        return None
    return rows[rows.split.isin(splits) & rows.pp.isin(wanted)]


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    keys = [c for c in df.columns if c not in METRICS + ["vol"]]
    out = df.groupby(keys, dropna=False)[METRICS].mean()
    out["n_vols"] = df.groupby(keys, dropna=False).size()
    return out.reset_index()


def parse(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("paths", nargs="*", help="run folders or folders of runs (default: LA_WORK/runs and runs_ml)")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "evaluate_ml"))
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--splits", nargs="+", default=["val", "test"], choices=["val", "test"])
    ap.add_argument("--pp", nargs="+", default=list(VARIANTS), choices=list(VARIANTS))
    ap.add_argument("--fresh", action="store_true", help="score every run again, ignoring per_run/")
    a = ap.parse_args(argv)
    a.paths = a.paths or [str(C.RUN_DIR), str(C.WORK / "runs_ml")]
    a.out = Path(a.out)
    return a


def main(argv=None):
    a = parse(argv)
    runs, unfinished = find_runs(a.paths)
    if unfinished:
        print(f"skipped {len(unfinished)} runs without summary.json (still training or failed): "
              + ", ".join(r.name for r in unfinished))
    cache_dir = a.out / "per_run"
    cache_dir.mkdir(parents=True, exist_ok=True)
    parts, todo = [], []
    for run_dir in runs:
        cached = None if a.fresh else read_cache(cache_file(cache_dir, run_dir), run_dir, a.splits, a.pp)
        if cached is None:
            todo.append(run_dir)
        else:
            parts.append(cached)
    print(f"{len(runs)} finished runs: {len(parts)} from per_run/, {len(todo)} to score with {a.workers} workers")

    t0 = time.time()
    jobs = [(run_dir, a.splits, a.pp) for run_dir in todo]
    for i, (run_dir, rows) in enumerate(score_all(jobs, a.workers), start=1):
        print(f"  [{i}/{len(jobs)}] {run_dir.parent.name}/{run_dir.name} ({time.time() - t0:.0f}s)", flush=True)
        if rows:
            df = pd.DataFrame(rows)
            df.to_csv(cache_file(cache_dir, run_dir), index=False)
            parts.append(df)
    if not parts:
        print("nothing to write")
        return
    df = pd.concat(parts, ignore_index=True).sort_values(["source", "run", "split", "pp", "vol"])
    df.to_csv(a.out / "per_case.csv", index=False)
    summ = summarise(df)
    summ.to_csv(a.out / "summary.csv", index=False)
    show = summ[(summ.split == "test") & (summ.pp == "raw")]
    print(show[["source", "run", "dice", "hd95", "n_vols"]].to_string(index=False))
    print(f"wrote {a.out / 'per_case.csv'} ({len(df)} rows) and summary.csv")


if __name__ == "__main__":
    main()
