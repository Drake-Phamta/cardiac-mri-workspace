"""Paired statistics for the Machine Learning course comparisons.

Every comparison is paired by volume. A configuration ("arm") is first reduced
to one score per volume, the mean over its seeds; two arms are then compared on
the volumes both have.

  wilcoxon_p    two-sided Wilcoxon signed-rank test, as in evaluate.py
  holm          Holm step-down correction inside one declared family of tests
  bootstrap_ci  95 % CI of the mean paired difference, resampling volumes
  compare       a table of paired comparisons inside one family
  friedman      Friedman test over three or more arms, with Kendall's W

The other analysis scripts import these. Run as a script, it answers the
cross-validation question of the evaluation part: over the 80 out-of-fold
volumes of the 5-fold runs (each tested exactly once), is the 95 % CI of
GateFuse - U-Net away from 0, and how much narrower is it than on the 20 IP
test volumes? Output in --out (default LA_WORK/analysis/stats_ml/):

  comparisons.csv   GateFuse vs U-Net, IP test and CV, 8 and full labels, Dice and HD95
  cv_coverage.csv   out-of-fold volumes per CV arm and fold (80 when all folds are done)
  ci_width.png      the CIs side by side

  python code/stats_ml.py --scores LA_WORK/analysis/evaluate_ml/per_case.csv
"""
import argparse
import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
from scipy.stats import friedmanchisquare, wilcoxon

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

N_BOOT = 10000
MIN_PAIRS = 5                 # fewer paired volumes than this: no test
SCORES = C.WORK / "analysis" / "evaluate_ml" / "per_case.csv"

# categorical palette (blue, orange, aqua: the first three slots stay apart for colour-blind readers)
BLUE, ORANGE, AQUA, GREY = "#2a78d6", "#eb6834", "#1baf7a", "#8a8a86"
MODEL_COLOR = {"gate": BLUE, "unet": ORANGE}
INK, INK2 = "#0b0b0b", "#52514e"
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e1e0d9", "grid.linewidth": 0.6, "axes.axisbelow": True,
    "figure.facecolor": "white", "axes.facecolor": "white", "savefig.bbox": "tight", "lines.linewidth": 2})


# ---------------------------------------------------------------- tests
def wilcoxon_p(a, b) -> float:
    d = np.asarray(a, float) - np.asarray(b, float)
    return 1.0 if not np.any(d != 0) else float(wilcoxon(a, b).pvalue)


def holm(pvalues, family_size=None) -> np.ndarray:
    """Holm-adjusted p-values in the input order. family_size > len(pvalues) when
    some declared comparisons are missing: they count as p = 1, so the
    correction stays that of the declared family."""
    p = np.asarray(pvalues, float)
    m = max(len(p), family_size or 0)
    adjusted, running = np.empty(len(p)), 0.0
    for rank, i in enumerate(np.argsort(p)):
        running = max(running, (m - rank) * p[i])
        adjusted[i] = min(1.0, running)
    return adjusted


def bootstrap_ci(diff, n_boot=N_BOOT, seed=0, level=0.95) -> tuple:
    """Percentile CI of the mean of the paired differences, resampling volumes with replacement."""
    diff = np.asarray(diff, float)
    idx = np.random.default_rng(seed).integers(0, len(diff), size=(n_boot, len(diff)))
    lo, hi = np.percentile(diff[idx].mean(axis=1), [50 * (1 - level), 50 * (1 + level)])
    return float(lo), float(hi)


def per_volume(scores: pd.DataFrame, metric="dice") -> pd.DataFrame:
    """vol x arm table of the metric averaged over seeds; scores needs an 'arm' column."""
    return scores.groupby(["vol", "arm"])[metric].mean().unstack("arm")


def compare(table: pd.DataFrame, pairs, family: str, higher_is_better=True) -> pd.DataFrame:
    """Paired comparisons a vs b (columns of a vol x arm table) inside one family.
    diff = a - b; a_better counts the volumes where a is better."""
    rows = []
    for a, b in pairs:
        if a not in table or b not in table:
            continue
        both = table[[a, b]].dropna()
        if len(both) < MIN_PAIRS:
            continue
        d = both[a] - both[b]
        lo, hi = bootstrap_ci(d)
        rows.append(dict(family=family, a=a, b=b, n_vols=len(both), mean_a=both[a].mean(), mean_b=both[b].mean(),
                         diff=d.mean(), ci_low=lo, ci_high=hi,
                         a_better=int((d > 0).sum() if higher_is_better else (d < 0).sum()),
                         p=wilcoxon_p(both[a], both[b])))
    out = pd.DataFrame(rows)
    if len(out):
        out["p_holm"] = holm(out.p, family_size=len(pairs))
        out["family_size"] = len(pairs)
    if len(out) < len(pairs):
        print(f"family {family}: {len(out)} of {len(pairs)} comparisons have data (Holm counts all {len(pairs)})")
    return out


def friedman(table: pd.DataFrame, family: str):
    """Friedman test over the arms (columns) on the volumes every arm has, or None
    with fewer than 3 arms. Kendall's W = statistic / (n (k - 1)) is its effect size (0..1)."""
    both = table.dropna()
    k, n = both.shape[1], len(both)
    if k < 3 or n < MIN_PAIRS:
        print(f"family {family}: Friedman needs 3 arms and {MIN_PAIRS} volumes, has {k} and {n}")
        return None
    stat, p = friedmanchisquare(*[both[c] for c in both])
    return dict(family=family, arms=" ".join(both.columns), k=k, n_vols=n, statistic=float(stat), p=float(p),
                kendall_w=float(stat / (n * (k - 1))))


# ---------------------------------------------------------------- shared helpers
def load_scores(path, split="test", pp="raw") -> pd.DataFrame:
    df = pd.read_csv(path)
    return df[(df.split == split) & (df.pp == pp)].copy()


def concat(tables) -> pd.DataFrame:
    """pd.concat of the non-empty tables: an empty one would turn the integer columns into floats."""
    tables = [t for t in tables if len(t)]
    return pd.concat(tables, ignore_index=True) if tables else pd.DataFrame()


def with_arm(scores: pd.DataFrame, arm_of) -> pd.DataFrame:
    """scores with an 'arm' column set to arm_of(row); rows that belong to no arm (None) are dropped."""
    return scores.assign(arm=[arm_of(r) for r in scores.itertuples()]).dropna(subset=["arm"])


def is_default(r) -> bool:
    """True for a run with the IP training recipe (loss, augmentation, gate, width)."""
    return (r.loss == "bce_dice" and r.aug == "none" and r.fusion in ("token", "none")
            and (r.model == "unet" or r.width == 128))


def save_fig(fig, out: Path, name: str):
    out.mkdir(parents=True, exist_ok=True)
    fig.savefig(out / f"{name}.png", dpi=200)
    plt.close(fig)
    print("saved", out / f"{name}.png")


# ---------------------------------------------------------------- CV question
def cv_arm(r):
    """ip_<model>_<labels> for the IP split, cv_<model>_<labels> for the fold runs, None otherwise."""
    if r.model not in ("gate", "unet") or not is_default(r):
        return None
    if r.split_set == "ip":
        return f"ip_{r.model}_{r.labels}"
    if r.split_set.startswith("fold"):
        return f"cv_{r.model}_{r.split_set.split('_')[1]}"          # fold3_few -> few
    return None


def cv_comparisons(scores: pd.DataFrame) -> pd.DataFrame:
    scores = with_arm(scores, cv_arm)
    parts = []
    for metric, higher in (("dice", True), ("hd95", False)):
        table = per_volume(scores, metric)
        for where in ("ip", "cv"):
            pairs = [(f"{where}_gate_{lab}", f"{where}_unet_{lab}") for lab in ("few", "full")]
            res = compare(table, pairs, f"{where}_{metric}", higher_is_better=higher)
            parts.append(res.assign(metric=metric))
    out = concat(parts)
    if len(out):
        out["ci_width"] = out.ci_high - out.ci_low
    return out


def cv_coverage(scores: pd.DataFrame) -> pd.DataFrame:
    cv = scores[scores.split_set.str.startswith("fold")]
    return cv.groupby(["model", "split_set"]).agg(n_vols=("vol", "nunique"), n_seeds=("seed", "nunique")).reset_index()


def plot_ci_width(res: pd.DataFrame, out: Path):
    res = res[res.metric == "dice"]
    if res.empty:
        return
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    names = {"ip": "IP test", "cv": "5-fold CV"}
    labels = []
    for i, r in enumerate(res.itertuples()):
        where, lab = r.family.split("_")[0], r.a.split("_")[-1]
        color = BLUE if where == "cv" else GREY
        ax.errorbar(r.diff, i, xerr=[[r.diff - r.ci_low], [r.ci_high - r.diff]], fmt="o", ms=8, color=color,
                    ecolor=color, elinewidth=2, capsize=3)
        ax.text(r.ci_high + 0.002, i, f"{r.diff:+.3f} [{r.ci_low:+.3f}, {r.ci_high:+.3f}]", va="center",
                fontsize=7.5, color=INK)
        labels.append(f"{names[where]}, {lab} labels (n = {r.n_vols})")
    ax.axvline(0, color=INK2, lw=0.8, ls="--")
    ax.set_yticks(range(len(labels)), labels)
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Dice: GateFuse - U-Net (mean over volumes, 95 % bootstrap CI)")
    save_fig(fig, out, "ci_width")


def main(argv=None):
    ap = argparse.ArgumentParser(description="GateFuse vs U-Net on the IP test set and over the CV folds")
    ap.add_argument("--scores", default=str(SCORES), help="per_case.csv of evaluate_ml.py")
    ap.add_argument("--pp", default="raw", help="post-processing variant to compare")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "stats_ml"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    scores = load_scores(a.scores, "test", a.pp)
    cov = cv_coverage(scores)
    cov.to_csv(out / "cv_coverage.csv", index=False)
    if cov.empty:
        print("no CV runs scored yet: only the IP test comparisons")
    else:
        print(cov.to_string(index=False))
    res = cv_comparisons(scores)
    res.to_csv(out / "comparisons.csv", index=False)
    if len(res):
        print(res[["family", "a", "b", "n_vols", "diff", "ci_low", "ci_high", "p", "p_holm"]].round(4).to_string(index=False))
    plot_ci_width(res, out)


if __name__ == "__main__":
    main()
