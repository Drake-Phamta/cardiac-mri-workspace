"""Calibration of the predicted probabilities, and seed disagreement as a warning sign.

Runs: GateFuse and U-Net with the IP recipe, on the IP split (runs/, 8 and 72
labelled volumes, 3 seeds) and on the CV folds (runs_ml/, when present).

  ECE    expected calibration error over 15 equal-width bins of p, the predicted
         probability of atrium: sum over bins of (share of voxels in the bin) x
         |fraction of atrium voxels in the bin - mean p in the bin|
  Brier  mean of (p - y)^2
  Both only count voxels inside the bounding box of the reference atrium,
  widened by MARGIN voxels: the far background is easy (p = 0, y = 0) and would
  make every model look calibrated.
  Temperature scaling: p_T = sigmoid(logit(p) / T), T fitted on the run's
  validation volumes (lowest negative log-likelihood), then ECE and Brier again on test.

The predictions are stored as uint8 (p rounded to 1/255), so every voxel has
one of 256 levels. Each volume is reduced to a 2 x 256 table of voxel counts
(reference label x level), and everything above is computed exactly from it.

Seed disagreement: for an arm with 2 or more seeds, per test volume,
1 - the mean Dice between the masks of its seeds. It needs no reference, so it
could warn about a bad volume at use time. AUROC of this score for flagging the
volumes whose mean seed Dice is below 0.85, and its Spearman correlation with Dice.

Output in --out (default LA_WORK/analysis/calibration/):
  calibration_runs.csv      per run: T and test ECE and Brier, before and after scaling
  calibration_summary.csv   per arm: mean and SD over seeds (or folds)
  calibration_volumes.csv   per run and test volume
  calibration_tests.csv     GateFuse vs U-Net on per-volume ECE and Brier (Wilcoxon, bootstrap CI, Holm)
  reliability.csv / .png    fraction of atrium vs mean p in each bin, pooled over seeds
  disagreement.csv, disagreement_auroc.csv, disagreement.png

  python code/calibration.py
"""
import argparse
import itertools
import sys
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.stats import mannwhitneyu, spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
import stats_ml as S  # noqa: E402
from data import gt_volume, load_meta, open_arrays  # noqa: E402
from evaluate_ml import describe_run, find_runs  # noqa: E402
from metrics import dice  # noqa: E402

N_BINS = 15
MARGIN = 10              # voxels (6.25 mm) added on every side of the reference bounding box
BAD_DICE = 0.85
P_LEVEL = np.arange(256) / 255.0
# level 0 holds every p below 0.5/255 (and 255 every p above 1 - 0.5/255); the logit needs a finite value there
_P = np.clip(P_LEVEL, 1e-3, 1 - 1e-3)
LOGIT = np.log(_P / (1 - _P))


# ---------------------------------------------------------------- counts and scores
def bounding_box(gt: np.ndarray, margin=MARGIN) -> tuple:
    idx = np.nonzero(gt)
    if not idx[0].size:
        return tuple(slice(None) for _ in gt.shape)
    return tuple(slice(max(0, i.min() - margin), i.max() + 1 + margin) for i in idx)


def level_counts(prob_u8: np.ndarray, gt: np.ndarray, margin=MARGIN) -> np.ndarray:
    """2 x 256 voxel counts inside the box: row = reference label (0, 1), column = stored level."""
    box = bounding_box(gt, margin)
    code = gt[box].astype(np.int64).ravel() * 256 + prob_u8[box].astype(np.int64).ravel()
    return np.bincount(code, minlength=512).reshape(2, 256)


def probs(T=1.0) -> np.ndarray:
    """p of each stored level after temperature scaling (T = 1: the stored p)."""
    return 1 / (1 + np.exp(-LOGIT / T))


def ece(counts, T=1.0, n_bins=N_BINS) -> float:
    p = probs(T)
    n, atrium = counts.sum(axis=0), counts[1]
    b = np.minimum((p * n_bins).astype(int), n_bins - 1)
    # per bin: (n_b / N) * |atrium_b / n_b - sum_p_b / n_b| = |atrium_b - sum_p_b| / N
    gap = np.bincount(b, weights=atrium, minlength=n_bins) - np.bincount(b, weights=n * p, minlength=n_bins)
    return float(np.abs(gap).sum() / n.sum())


def brier(counts, T=1.0) -> float:
    p = probs(T)
    return float((counts[1] * (1 - p) ** 2 + counts[0] * p ** 2).sum() / counts.sum())


def nll(counts, T=1.0) -> float:
    p = np.clip(probs(T), 1e-12, 1 - 1e-12)          # a small T rounds p to exactly 0 or 1
    return float(-(counts[1] * np.log(p) + counts[0] * np.log(1 - p)).sum() / counts.sum())


def fit_temperature(counts) -> float:
    return float(minimize_scalar(lambda t: nll(counts, t), bounds=(0.05, 20), method="bounded").x)


def reliability(counts, T=1.0, n_bins=N_BINS) -> pd.DataFrame:
    p = probs(T)
    n = counts.sum(axis=0)
    b = np.minimum((p * n_bins).astype(int), n_bins - 1)
    n_b = np.bincount(b, weights=n, minlength=n_bins)
    with np.errstate(invalid="ignore", divide="ignore"):
        return pd.DataFrame(dict(bin=np.arange(n_bins), n_voxels=n_b,
                                 mean_p=np.bincount(b, weights=n * p, minlength=n_bins) / n_b,
                                 frac_atrium=np.bincount(b, weights=counts[1], minlength=n_bins) / n_b))


def disagreement(masks) -> float:
    """1 - mean Dice over all pairs of seed masks (0 when the seeds agree on every voxel)."""
    return 1.0 - float(np.mean([dice(a, b) for a, b in itertools.combinations(masks, 2)]))


def auroc(bad, good) -> tuple:
    """(AUROC, one-sided p): chance that a flagged volume scores higher than a good one
    (Mann-Whitney U / (n_bad n_good), ties count one half)."""
    if len(bad) == 0 or len(good) == 0:
        return float("nan"), float("nan")
    res = mannwhitneyu(bad, good, alternative="greater")
    return float(res.statistic / (len(bad) * len(good))), float(res.pvalue)


# ---------------------------------------------------------------- reading the runs
def arm_of(info: dict):
    return S.cv_arm(SimpleNamespace(**info))


def scan_group(run_dirs, meta, labels):
    """The runs of one arm on one split (same volumes; one run per seed).
    Returns {run: {"val": {vol: counts}, "test": {vol: counts}}} and the per-volume
    test rows (Dice of every seed and the seed disagreement)."""
    counts = {r.name: {"val": {}, "test": {}} for r in run_dirs}
    rows = []
    for split in ("val", "test"):
        preds = {r.name: np.load(r / f"pred_{split}.npz") for r in run_dirs if (r / f"pred_{split}.npz").exists()}
        if not preds:
            continue
        for vol in next(iter(preds.values())).files:
            gt = gt_volume(meta, labels, vol)
            masks = []
            for name, p in preds.items():
                counts[name][split][vol] = level_counts(p[vol], gt)
                masks.append(p[vol] >= 128)
            if split == "test":
                rows.append(dict(vol=vol, n_seeds=len(masks), mean_dice=float(np.mean([dice(m, gt) for m in masks])),
                                 disagreement=disagreement(masks) if len(masks) > 1 else float("nan")))
    return counts, rows


def analyse(run_dirs):
    """All tables from a list of finished run folders."""
    meta = load_meta()
    _, labels, _ = open_arrays()
    groups = defaultdict(list)
    for r in run_dirs:
        info = describe_run(r)
        arm = arm_of(info)
        if arm is not None:
            groups[(arm, info["split_set"])].append((r, info))
    run_rows, vol_rows, dis_rows, pooled = [], [], [], defaultdict(lambda: np.zeros((2, 256)))
    for (arm, split_set), members in sorted(groups.items()):
        counts, rows = scan_group([r for r, _ in members], meta, labels)
        dis_rows += [dict(arm=arm, split_set=split_set, **row) for row in rows]
        for r, info in members:
            if not counts[r.name]["val"] or not counts[r.name]["test"]:
                print(f"{r.name}: no pred_val.npz or pred_test.npz, skipped")
                continue
            val = sum(counts[r.name]["val"].values())          # pooled over the volumes
            test = sum(counts[r.name]["test"].values())
            T = fit_temperature(val)
            pooled[arm] += test
            run_rows.append(dict(arm=arm, run=r.name, split_set=split_set, seed=info["seed"], T=T,
                                 ece=ece(test), brier=brier(test), ece_ts=ece(test, T), brier_ts=brier(test, T),
                                 n_voxels=int(test.sum())))
            for vol, c in counts[r.name]["test"].items():
                vol_rows.append(dict(arm=arm, run=r.name, seed=info["seed"], vol=vol, ece=ece(c), brier=brier(c),
                                     ece_ts=ece(c, T), brier_ts=brier(c, T)))
    rel = pd.concat([reliability(c).assign(arm=arm) for arm, c in pooled.items()], ignore_index=True) \
        if pooled else pd.DataFrame()
    return pd.DataFrame(run_rows), pd.DataFrame(vol_rows), pd.DataFrame(dis_rows), rel


# ---------------------------------------------------------------- summaries
def summarise_runs(runs: pd.DataFrame) -> pd.DataFrame:
    cols = ["T", "ece", "brier", "ece_ts", "brier_ts"]
    out = runs.groupby("arm")[cols].agg(["mean", "std"])
    out.columns = [f"{c}_{s}" for c, s in out.columns]
    out["n_runs"] = runs.groupby("arm").size()
    return out.reset_index()


def gate_vs_unet(vols: pd.DataFrame) -> pd.DataFrame:
    parts = []
    for metric in ("ece", "brier", "ece_ts"):
        table = S.per_volume(vols, metric)
        pairs = [(f"{w}_gate_{lab}", f"{w}_unet_{lab}") for w in ("ip", "cv") for lab in ("few", "full")]
        parts.append(S.compare(table, pairs, metric, higher_is_better=False).assign(metric=metric))
    return S.concat(parts)


def flagging(dis: pd.DataFrame) -> pd.DataFrame:
    rows = []
    dis = dis.dropna(subset=["disagreement"])
    for arm, d in list(dis.groupby("arm")) + [("all_arms_pooled", dis)]:
        bad = d.mean_dice < BAD_DICE
        a, p = auroc(d.disagreement[bad], d.disagreement[~bad])
        rho, rho_p = spearmanr(d.disagreement, d.mean_dice) if len(d) > 2 else (float("nan"), float("nan"))
        rows.append(dict(arm=arm, n_vols=len(d), n_below_085=int(bad.sum()), auroc=a, auroc_p=p,
                         spearman_rho=float(rho), spearman_p=float(rho_p)))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- figures
def plot_reliability(rel: pd.DataFrame, out: Path):
    panels = sorted({a.split("_", 1)[0] + "_" + a.rsplit("_", 1)[1] for a in rel.arm})    # ip_few, cv_full ...
    if not panels:
        return
    fig, axes = S.plt.subplots(1, len(panels), figsize=(2.9 * len(panels), 3.0), squeeze=False)
    for ax, panel in zip(axes[0], panels):
        where, lab = panel.split("_")
        ax.plot([0, 1], [0, 1], color=S.INK2, lw=0.8, ls="--")
        for model, marker in (("gate", "o"), ("unet", "s")):
            r = rel[(rel.arm == f"{where}_{model}_{lab}") & (rel.n_voxels > 0)]
            if len(r):
                ax.plot(r.mean_p, r.frac_atrium, marker=marker, ms=5, color=S.MODEL_COLOR[model],
                        label="GateFuse" if model == "gate" else "U-Net")
        ax.set_title(f"{'IP test' if where == 'ip' else 'CV folds'}, {lab} labels", fontsize=9)
        ax.set_xlabel("mean predicted p in bin")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
    axes[0, 0].set_ylabel("fraction of atrium voxels")
    axes[0, 0].legend(frameon=False, fontsize=8, loc="upper left")
    S.save_fig(fig, out, "reliability")


def plot_disagreement(dis: pd.DataFrame, out: Path):
    dis = dis[dis.arm.str.startswith("ip_")].dropna(subset=["disagreement"])
    labs = sorted(set(dis.arm.str.rsplit("_", n=1).str[1]))
    if not labs:
        return
    fig, axes = S.plt.subplots(1, len(labs), figsize=(3.4 * len(labs), 3.0), squeeze=False)
    for ax, lab in zip(axes[0], labs):
        for model, marker in (("gate", "o"), ("unet", "s")):
            d = dis[dis.arm == f"ip_{model}_{lab}"]
            ax.scatter(d.disagreement, d.mean_dice, s=28, marker=marker, color=S.MODEL_COLOR[model],
                       edgecolors="white", linewidths=1, label="GateFuse" if model == "gate" else "U-Net")
        ax.axhline(BAD_DICE, color=S.INK2, lw=0.8, ls="--")
        ax.set_title(f"IP test, {lab} labels", fontsize=9)
    fig.supxlabel("seed disagreement = 1 - mean Dice between the masks of the seeds", fontsize=8)
    axes[0, 0].set_ylabel("mean Dice over seeds")
    axes[0, 0].legend(frameon=False, fontsize=8, loc="lower left")
    S.save_fig(fig, out, "disagreement")


def main(argv=None):
    ap = argparse.ArgumentParser(description="calibration and seed disagreement")
    ap.add_argument("paths", nargs="*", help="run folders or folders of runs (default: LA_WORK/runs and runs_ml)")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "calibration"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    run_dirs, unfinished = find_runs(a.paths or [str(C.RUN_DIR), str(C.WORK / "runs_ml")])
    if unfinished:
        print(f"skipped {len(unfinished)} unfinished runs: " + ", ".join(r.name for r in unfinished))
    runs, vols, dis, rel = analyse(run_dirs)
    if runs.empty:
        print("no GateFuse or U-Net run with the IP recipe found")
        return
    runs.to_csv(out / "calibration_runs.csv", index=False)
    summ = summarise_runs(runs)
    summ.to_csv(out / "calibration_summary.csv", index=False)
    vols.to_csv(out / "calibration_volumes.csv", index=False)
    gate_vs_unet(vols).to_csv(out / "calibration_tests.csv", index=False)
    rel.to_csv(out / "reliability.csv", index=False)
    dis.to_csv(out / "disagreement.csv", index=False)
    flags = flagging(dis)
    flags.to_csv(out / "disagreement_auroc.csv", index=False)
    print(summ[["arm", "n_runs", "T_mean", "ece_mean", "ece_ts_mean", "brier_mean", "brier_ts_mean"]].round(4)
          .to_string(index=False))
    print(flags.round(3).to_string(index=False))
    plot_reliability(rel, out)
    plot_disagreement(dis, out)


if __name__ == "__main__":
    main()
