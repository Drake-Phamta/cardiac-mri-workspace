"""Does morphological post-processing help less when there are more labelled volumes?

For the learning-curve runs of GateFuse and U-Net (n = 4, 8, 16, 36, 72; see
learning_curve.py), per test volume (mean over seeds) and for each variant of
postprocess.py (lcc, lcc_fill, lcc_fill_close; the IP report uses lcc_fill_close):

  Dice gain = Dice after post-processing - Dice raw        (> 0: better)
  HD95 gain = HD95 raw - HD95 after post-processing        (> 0: smaller distance)

  gain.csv      mean gain per (model, variant, metric, n) with a 95 % bootstrap CI and a
                Wilcoxon test (post-processed vs raw, Holm over the 5 values of n)
  spearman.csv  Spearman's rho between n and the gain, over the 5 mean gains (exact p from all
                orderings of the 5 values: 5 points are too few for the usual approximation) and
                over all (volume, n) rows (descriptive: a volume appears once for every n)
  pp_gain.png

  python code/pp_vs_n.py --scores LA_WORK/analysis/evaluate_ml/per_case.csv
"""
import argparse
import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
import stats_ml as S  # noqa: E402
from learning_curve import MODELS, NAME, NESTED, arm, lc_arm  # noqa: E402
from postprocess import VARIANTS  # noqa: E402

PP = [v for v in VARIANTS if v != "raw"]
PP_COLOR = dict(zip(PP, [S.BLUE, S.ORANGE, S.AQUA]))


def wide(scores, metric):
    """vol x '<arm>:<pp>' table of the metric, mean over seeds."""
    return S.per_volume(scores.assign(arm=scores.arm + ":" + scores.pp), metric)


def gains(scores):
    rows = []
    for metric in ("dice", "hd95"):
        table = wide(scores, metric)
        for model in MODELS:
            for variant in PP:
                pairs = [(f"{arm(model, n)}:{variant}", f"{arm(model, n)}:raw") for n in NESTED]
                res = S.compare(table, pairs, f"{model}:{variant}:{metric}", higher_is_better=metric == "dice")
                if res.empty:
                    continue
                sign = 1 if metric == "dice" else -1          # HD95: a gain is a drop of the distance
                res = res.assign(model=model, variant=variant, metric=metric,
                                 n=res.a.str.extract(r"_n(\d+):")[0].astype(int), gain=sign * res["diff"],
                                 gain_lo=np.where(sign > 0, res.ci_low, -res.ci_high),
                                 gain_hi=np.where(sign > 0, res.ci_high, -res.ci_low))
                rows.append(res)
    if not rows:
        return pd.DataFrame()
    cols = ["model", "variant", "metric", "n", "n_vols", "gain", "gain_lo", "gain_hi", "a_better", "p", "p_holm"]
    return S.concat(rows)[cols]


def spearman_exact(x, y) -> tuple:
    """Spearman's rho and its exact two-sided p over every ordering of y (for a handful of points)."""
    rho = spearmanr(x, y).statistic
    others = np.array([spearmanr(x, order).statistic for order in itertools.permutations(y)])
    return float(rho), float(np.mean(np.abs(others) >= abs(rho) - 1e-12))


def per_volume_gains(scores, model, variant, metric):
    """(n, gain) for every (volume, n) of one model."""
    table = wide(scores, metric)
    ns, values = [], []
    for n in NESTED:
        after, raw = f"{arm(model, n)}:{variant}", f"{arm(model, n)}:raw"
        if after in table and raw in table:
            g = (table[after] - table[raw]).dropna() * (1 if metric == "dice" else -1)
            ns += [n] * len(g)
            values += g.tolist()
    return np.array(ns), np.array(values)


def spearman(scores, gain):
    rows = []
    for (model, variant, metric), g in gain.groupby(["model", "variant", "metric"]):
        if len(g) < 3:
            continue
        rho_m, p_m = spearman_exact(g.n.to_numpy(), g.gain.to_numpy())
        ns, values = per_volume_gains(scores, model, variant, metric)
        rho_v, p_v = spearmanr(ns, values)
        rows.append(dict(model=model, variant=variant, metric=metric, n_values=len(g), rho_means=rho_m,
                         p_means=p_m, n_rows=len(values), rho_volumes=rho_v, p_volumes=p_v))
    return pd.DataFrame(rows)


def plot(gain, out):
    if gain.empty:
        return
    fig, axes = S.plt.subplots(2, 2, figsize=(8.4, 5.6), sharex=True, squeeze=False)
    for col, model in enumerate(MODELS):
        for row, (metric, label) in enumerate((("dice", "Dice gain"), ("hd95", "HD95 gain (voxels)"))):
            ax = axes[row, col]
            ax.axhline(0, color=S.INK2, lw=0.8)
            for variant in PP:
                g = gain[(gain.model == model) & (gain.variant == variant) & (gain.metric == metric)]
                if len(g):
                    ax.errorbar(g.n, g.gain, yerr=[g.gain - g.gain_lo, g.gain_hi - g.gain], marker="o", ms=5,
                                color=PP_COLOR[variant], ecolor=PP_COLOR[variant], elinewidth=1, capsize=2,
                                label=variant)
            ax.set_xscale("log")
            ax.set_xticks(NESTED, [str(n) for n in NESTED])
            ax.set_xlim(3.3, 90)
            ax.minorticks_off()
            if row == 0:
                ax.set_title(NAME[model], fontsize=9)
            if row == 1:
                ax.set_xlabel("labelled training volumes n")
            if col == 0:
                ax.set_ylabel(label)
    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels, frameon=False, fontsize=8, ncol=len(PP), loc="lower center",
               bbox_to_anchor=(0.5, 1.0))
    S.save_fig(fig, out, "pp_gain")


def main(argv=None):
    ap = argparse.ArgumentParser(description="post-processing gain against the number of labelled volumes")
    ap.add_argument("--scores", default=str(S.SCORES), help="per_case.csv of evaluate_ml.py")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "pp_vs_n"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(a.scores)
    scores = S.with_arm(df[df.split == "test"], lc_arm)
    scores = scores[scores.arm.isin([arm(m, n) for m in MODELS for n in NESTED])]
    have = scores.groupby("arm").pp.nunique()
    print("post-processing variants per point: " + ", ".join(f"{k} {v}" for k, v in have.items()))
    gain = gains(scores)
    gain.to_csv(out / "gain.csv", index=False)
    rho = spearman(scores, gain) if len(gain) else pd.DataFrame()
    rho.to_csv(out / "spearman.csv", index=False)
    if len(gain):
        main_pp = gain[gain.variant == "lcc_fill_close"]
        print(main_pp[["model", "metric", "n", "gain", "gain_lo", "gain_hi", "p_holm"]].round(4).to_string(index=False))
    if len(rho):
        print(rho.round(3).to_string(index=False))
    plot(gain, out)


if __name__ == "__main__":
    main()
