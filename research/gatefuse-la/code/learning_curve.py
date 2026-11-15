"""Learning curve: how Dice and HD95 change with n, the number of labelled training volumes.

Points, for GateFuse and U-Net with the IP recipe, 3 seeds each (test set,
threshold 0.5, no post-processing; one score per volume = the mean over seeds):
  n = 4, 16, 36   runs_ml/lc_n<n>_<model>_s<seed>, the first n volumes of the IP train list
  n = 8, 72       night-1 runs/<model>_few_s<seed> and <model>_full_s<seed> (the IP few and full sets)
n = 4 and 8 train for 2000 iterations, n >= 16 for 4000 (the IP schedules).

  points     mean Dice and HD95 per (model, n) with a 95 % bootstrap band (resampling test volumes)
  gap        GateFuse - U-Net per n: bootstrap CI, Wilcoxon, Holm over the 5 values of n
  fit        Dice(n) = a - b * n^(-c) per model, refitted on 1000 bootstrap resamples of the
             test volumes; crossover n* = the smallest n where the fitted gap drops below 0.005
  draws      two other random sets of 8 volumes (seed 0) next to the IP set: how much an
             8-volume result depends on which volumes were labelled, beside the seed spread
  schedule   the IP 8-volume set again with the 4000-iteration schedule (lc_n8long_*),
             reported apart from the curve: how much of the step from 8 to 16 is the schedule?

Output in --out (default LA_WORK/analysis/learning_curve/):
  points.csv gap.csv fit.csv crossover.csv draws.csv draws_spread.csv schedule.csv
  learning_curve.png gap.png

  python code/learning_curve.py --scores LA_WORK/analysis/evaluate_ml/per_case.csv
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import curve_fit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
import stats_ml as S  # noqa: E402

NESTED = (4, 8, 16, 36, 72)
MODELS = ("gate", "unet")
NAME = {"gate": "GateFuse", "unet": "U-Net"}
GAP_SMALL = 0.005            # the plan calls a gap below this "closed"
N_FIT_BOOT = 1000
N_GRID = np.geomspace(4, 2000, 600)


# ---------------------------------------------------------------- which run is which point
def lc_arm(r):
    """<model>_n<n> on the curve, <model>_n8_draw<k> for a random draw, <model>_n8long for the
    schedule control; None for runs that are not part of the learning curve."""
    if r.model not in MODELS or not S.is_default(r):
        return None
    if r.split_set.startswith("n8_draw"):
        return f"{r.model}_{r.split_set}"
    if r.n_train_vols == 8 and r.labels == "full":          # 8 volumes, 4000-iteration schedule
        return f"{r.model}_n8long"
    if r.split_set == "ip" or re.fullmatch(r"n\d+", r.split_set):
        return f"{r.model}_n{r.n_train_vols}"
    return None


def arm(model, n):
    return f"{model}_n{n}"


# ---------------------------------------------------------------- curve, bands, fit
def boot_index(n_vols, n_boot, seed=0):
    return np.random.default_rng(seed).integers(0, n_vols, size=(n_boot, n_vols))


def points(scores, dice, hd95, idx):
    """One row per (model, n) present: mean and 95 % bootstrap band of Dice and HD95."""
    seeds = scores.groupby("arm").seed.nunique()
    seed_sd = scores.groupby(["arm", "seed"]).dice.mean().groupby("arm").std()
    rows = []
    for model in MODELS:
        for n in NESTED:
            a = arm(model, n)
            if a not in dice:
                continue
            row = dict(model=model, n=n, n_seeds=int(seeds[a]), dice_seed_sd=seed_sd[a])
            for metric, table in (("dice", dice), ("hd95", hd95)):
                x = table[a].to_numpy()
                lo, hi = np.percentile(np.nanmean(x[idx], axis=1), [2.5, 97.5])
                row.update({metric: np.nanmean(x), f"{metric}_lo": lo, f"{metric}_hi": hi})
            rows.append(row)
    return pd.DataFrame(rows)


def power_law(n, a, b, c):
    return a - b * np.power(n, -c)


def fit_curve(ns, ys):
    """(a, b, c) of Dice(n) = a - b n^-c, or None with fewer than 4 points or no convergence."""
    if len(ns) < 4:
        return None
    try:
        p, _ = curve_fit(power_law, np.asarray(ns, float), np.asarray(ys, float), p0=(0.92, 0.3, 0.5),
                         bounds=([0, 0, 0.01], [1, 10, 3]), maxfev=20000)
    except (RuntimeError, ValueError):
        return None
    return p


def crossover(p_gate, p_unet) -> float:
    """Smallest n (on N_GRID) where the fitted gap GateFuse - U-Net is below GAP_SMALL; inf if none."""
    gap = power_law(N_GRID, *p_gate) - power_law(N_GRID, *p_unet)
    below = np.flatnonzero(gap < GAP_SMALL)
    return float(N_GRID[below[0]]) if len(below) else np.inf


def fits(dice, idx):
    """Power-law fit per model on the mean Dice, and the crossover n* with its bootstrap spread."""
    ns = {m: [n for n in NESTED if arm(m, n) in dice] for m in MODELS}
    params = {m: fit_curve(ns[m], [dice[arm(m, n)].mean() for n in ns[m]]) for m in MODELS}
    fit_rows = [dict(model=m, n_points=len(ns[m]), **(dict(zip("abc", params[m])) if params[m] is not None else {}))
                for m in MODELS]
    if any(params[m] is None for m in MODELS):
        print("power-law fit needs at least 4 values of n per model: no fit yet")
        return pd.DataFrame(fit_rows), pd.DataFrame(), params
    boot = []
    for row in idx[:N_FIT_BOOT]:
        p = {m: fit_curve(ns[m], [dice[arm(m, n)].to_numpy()[row].mean() for n in ns[m]]) for m in MODELS}
        if all(v is not None for v in p.values()):
            boot.append(crossover(p["gate"], p["unet"]))
    boot = np.array(boot)
    lo, med, hi = np.percentile(boot, [2.5, 50, 97.5]) if len(boot) else (np.nan,) * 3
    cross = pd.DataFrame([dict(gap_threshold=GAP_SMALL, n_star=crossover(params["gate"], params["unet"]),
                               boot_median=med, boot_lo=lo, boot_hi=hi, n_boot_fits=len(boot),
                               share_no_crossover_below_2000=float(np.mean(np.isinf(boot))) if len(boot) else np.nan)])
    return pd.DataFrame(fit_rows), cross, params


# ---------------------------------------------------------------- gap, draws, schedule
def gaps(dice, hd95):
    pairs = [(arm("gate", n), arm("unet", n)) for n in NESTED]
    out = S.concat([S.compare(dice, pairs, "gap_dice").assign(metric="dice"),
                    S.compare(hd95, pairs, "gap_hd95", higher_is_better=False).assign(metric="hd95")])
    if len(out):
        out.insert(0, "n", out.a.str.extract(r"_n(\d+)$")[0].astype(int))
    return out


def draws(scores):
    """Seed-0 results of the IP 8-volume set and the two random draws."""
    seed0 = scores[scores.seed == 0]
    rows = []
    for model in MODELS:
        for name, a in (("n8 (IP few)", arm(model, 8)), ("n8_draw1", f"{model}_n8_draw1"),
                        ("n8_draw2", f"{model}_n8_draw2")):
            d = seed0[seed0.arm == a]
            if len(d):
                rows.append(dict(model=model, set=name, dice=d.dice.mean(), hd95=d.hd95.mean(), n_vols=len(d)))
    table = pd.DataFrame(rows)
    spread = []
    for model in MODELS:
        sets = table[table.model == model] if len(table) else table
        per_seed = scores[scores.arm == arm(model, 8)].groupby("seed").dice.mean()
        if len(sets) > 1:
            spread.append(dict(model=model, n_sets=len(sets), set_range=sets.dice.max() - sets.dice.min(),
                               n_seeds=len(per_seed), seed_sd=per_seed.std(),
                               seed_range=per_seed.max() - per_seed.min()))
    return table, pd.DataFrame(spread)


def schedule(dice):
    """4000 vs 2000 iterations on the IP 8-volume set, and the model gap under each schedule."""
    longer = S.compare(dice, [(f"{m}_n8long", arm(m, 8)) for m in MODELS], "long_minus_short")
    gap = S.compare(dice, [("gate_n8long", "unet_n8long"), (arm("gate", 8), arm("unet", 8))], "gap_by_schedule")
    return S.concat([longer, gap])


# ---------------------------------------------------------------- figures
def plot_curve(pts, params, scores, out):
    if pts.empty:
        return
    fig, axes = S.plt.subplots(1, 2, figsize=(9.0, 3.2))
    seed0 = scores[scores.seed == 0].groupby("arm")
    for model, marker in (("gate", "o"), ("unet", "s")):
        p = pts[pts.model == model]
        color = S.MODEL_COLOR[model]
        for ax, metric in zip(axes, ("dice", "hd95")):
            ax.fill_between(p.n, p[f"{metric}_lo"], p[f"{metric}_hi"], color=color, alpha=0.15, lw=0)
            ax.plot(p.n, p[metric], marker=marker, ms=6, color=color, label=NAME[model])
            for name, mk in (("_n8_draw1", "^"), ("_n8_draw2", "v"), ("_n8long", "D")):
                if model + name in seed0.groups:
                    value = seed0.get_group(model + name)[metric].mean()
                    ax.plot(8 * (1.08 if "long" in name else 0.93), value, mk, ms=5, mfc="white", mec=color, mew=1.5)
        if params.get(model) is not None:
            axes[0].plot(N_GRID[N_GRID <= 100], power_law(N_GRID[N_GRID <= 100], *params[model]), color=color,
                         lw=1, ls="--")
    for ax, label in zip(axes, ("Dice (test, mean over seeds)", "HD95 in voxels (test)")):
        ax.set_xscale("log")
        ax.set_xticks(NESTED, [str(n) for n in NESTED])
        ax.minorticks_off()
        ax.set_xlabel("labelled training volumes n")
        ax.set_ylabel(label)
    axes[0].legend(frameon=False, fontsize=8, loc="lower right")
    axes[1].text(0.98, 0.98, "hollow at n = 8: random draws (triangles),\n4000 iterations (diamond); seed 0",
                 transform=axes[1].transAxes, ha="right", va="top", fontsize=7, color=S.INK2)
    S.save_fig(fig, out, "learning_curve")


def plot_gap(gap, params, out):
    g = gap[gap.metric == "dice"] if len(gap) else gap
    if g.empty:
        return
    fig, ax = S.plt.subplots(figsize=(5.2, 3.0))
    ax.axhspan(-GAP_SMALL, GAP_SMALL, color="#e1e0d9", alpha=0.6, lw=0)
    ax.axhline(0, color=S.INK2, lw=0.8)
    ax.errorbar(g.n, g["diff"], yerr=[g["diff"] - g.ci_low, g.ci_high - g["diff"]], fmt="o", ms=7, color=S.BLUE,
                ecolor=S.BLUE, elinewidth=2, capsize=3)
    for r in g.itertuples():
        ax.text(r.n * 1.08, r.diff, f"p_Holm {r.p_holm:.3f}", fontsize=7, color=S.INK2, va="center")
    if params.get("gate") is not None and params.get("unet") is not None:
        grid = N_GRID[N_GRID <= 100]
        ax.plot(grid, power_law(grid, *params["gate"]) - power_law(grid, *params["unet"]), color=S.BLUE, lw=1,
                ls="--", label="difference of the fitted curves")
        ax.legend(frameon=False, fontsize=7, loc="upper right")
    ax.set_xscale("log")
    ax.set_xticks(NESTED, [str(n) for n in NESTED])
    ax.minorticks_off()
    ax.set_xlabel("labelled training volumes n")
    ax.set_ylabel("Dice: GateFuse - U-Net (95 % CI)")
    S.save_fig(fig, out, "gap")


def main(argv=None):
    ap = argparse.ArgumentParser(description="learning curve of GateFuse and U-Net")
    ap.add_argument("--scores", default=str(S.SCORES), help="per_case.csv of evaluate_ml.py")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "learning_curve"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    scores = S.with_arm(S.load_scores(a.scores, "test", "raw"), lc_arm)
    found = scores.groupby("arm").seed.nunique()
    expected = [arm(m, n) for m in MODELS for n in NESTED] + [f"{m}_{k}" for m in MODELS
                                                               for k in ("n8_draw1", "n8_draw2", "n8long")]
    missing = [e for e in expected if e not in found]
    print("seeds per point: " + ", ".join(f"{k} {v}" for k, v in found.items()))
    if missing:
        print("missing (not trained or not scored yet): " + ", ".join(missing))
    if scores.empty:
        return
    dice, hd95 = S.per_volume(scores, "dice"), S.per_volume(scores, "hd95")
    idx = boot_index(len(dice), S.N_BOOT)
    pts = points(scores, dice, hd95, idx)
    pts.to_csv(out / "points.csv", index=False)
    print(pts[["model", "n", "n_seeds", "dice", "dice_lo", "dice_hi", "hd95"]].round(4).to_string(index=False))
    gap = gaps(dice, hd95)
    gap.to_csv(out / "gap.csv", index=False)
    if len(gap):
        print(gap[gap.metric == "dice"][["n", "diff", "ci_low", "ci_high", "p", "p_holm"]].round(4).to_string(index=False))
        rule = gap[(gap.metric == "dice") & (gap.n >= 16) & (gap["diff"] >= 0.01) & (gap.p_holm < 0.05)]
        print("refutation rule of the plan (gap >= 0.01 with Holm p < 0.05 at n >= 16): "
              + (f"met at n = {rule.n.tolist()}" if len(rule) else "not met"))
    fit, cross, params = fits(dice, idx)
    fit.to_csv(out / "fit.csv", index=False)
    cross.to_csv(out / "crossover.csv", index=False)
    if len(cross):
        print(cross.round(2).to_string(index=False))
    table, spread = draws(scores)
    table.to_csv(out / "draws.csv", index=False)
    spread.to_csv(out / "draws_spread.csv", index=False)
    if len(spread):
        print(spread.round(4).to_string(index=False))
    sched = schedule(dice)
    sched.to_csv(out / "schedule.csv", index=False)
    plot_curve(pts, params, scores, out)
    plot_gap(gap, params, out)


if __name__ == "__main__":
    main()
