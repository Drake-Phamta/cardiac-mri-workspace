"""Does the shape of the gate matter, and the width of the GateFuse head?

Arms, all on the IP split with the IP recipe (test Dice, threshold 0.5, no
post-processing; one score per volume = the mean over seeds):
  8 volumes   token gate = the IP GateFuse (width 128, night-1 runs/gate_few_s*),
              scalar and channel gates (runs_ml/gate_scalar_s*, gate_channel_s*),
              concatenation, DINOv3 alone, MRI-CORE alone (night-1 runs),
              token gate at widths 32, 64 and 256 (runs_ml/gate_w<width>_s*)
  72 volumes  token gate and concatenation (night 1), scalar and channel gates (night 3)

  fusion      Friedman over {token, scalar, channel, concat, dinov3, mricore}, then
              Wilcoxon-Holm of the token gate against each (diff = token - other)
  width       Friedman over widths 32, 64, 128, 256 of the token gate, then Wilcoxon-Holm
              against width 128; the plan calls a width "no effect" when the 95 % CI of the
              difference lies inside +-0.005 (column within_0005)
  regions     mean gate value g (1 = all DINOv3, 0 = all MRI-CORE) over the test volumes in
              four regions around the reference atrium, as in the IP report: inside (eroded by
              3 voxels), boundary band (+-3 voxels), near background (3 to 15 voxels out), far
              background. A scalar gate is one value per slice; so is a channel gate once
              averaged over its channels.
  efficiency  trainable parameters, and milliseconds per training iteration from history.csv
              (wall time, validation passes included)

Output in --out (default LA_WORK/analysis/gate_analysis/):
  arms.csv friedman.csv comparisons.csv
  gate_regions.csv efficiency.csv (mean over seeds; per run in *_runs.csv)
  fusion.png width.png gate_regions.png

  python code/gate_analysis.py --scores LA_WORK/analysis/evaluate_ml/per_case.csv
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
import stats_ml as S  # noqa: E402
from data import crop_volume, gt_volume, load_meta, open_arrays, volume_index  # noqa: E402
from figures import upsample_grid  # noqa: E402

TOKEN = "token_w128"
FUSION = [TOKEN, "scalar", "channel", "concat", "dinov3", "mricore"]
WIDTHS = (32, 64, 128, 256)
SIZES = {"few": 8, "full": 72}
REGIONS = ("inside", "boundary", "near", "far")
NO_EFFECT = 0.005


def gate_arm(r):
    """token_w<width>, scalar, channel, concat, dinov3 or mricore; None for other runs."""
    if r.split_set != "ip" or r.loss != "bce_dice" or r.aug != "none" or r.n_train_vols != SIZES.get(r.labels):
        return None
    if r.model in ("dinov3", "mricore", "concat") and r.width == 128:
        return r.model
    if r.model == "gate":
        return f"token_w{r.width}" if r.fusion == "token" else (r.fusion if r.width == 128 else None)
    return None


# ---------------------------------------------------------------- Dice
def arm_table(scores):
    rows = []
    for labels, sub in scores.groupby("labels"):
        dice, hd95 = S.per_volume(sub, "dice"), S.per_volume(sub, "hd95")
        seeds = sub.groupby("arm").seed.nunique()
        for a in dice:
            lo, hi = S.bootstrap_ci(dice[a].dropna())
            rows.append(dict(labels=labels, n_vols_train=SIZES[labels], arm=a, n_seeds=int(seeds[a]),
                             dice=dice[a].mean(), dice_lo=lo, dice_hi=hi, hd95=hd95[a].mean()))
    return pd.DataFrame(rows)


def compare_arms(scores):
    """Friedman and Wilcoxon-Holm tables of the fusion family (8 and 72 volumes) and the width family."""
    fried, comp = [], []
    for labels, sub in scores.groupby("labels"):
        dice = S.per_volume(sub, "dice")
        fried.append(S.friedman(dice[[a for a in FUSION if a in dice]], f"fusion_{labels}"))
        comp.append(S.compare(dice, [(TOKEN, a) for a in FUSION[1:]], f"fusion_{labels}"))
        if labels == "few":
            widths = [f"token_w{w}" for w in WIDTHS]
            fried.append(S.friedman(dice[[a for a in widths if a in dice]], "width_few"))
            res = S.compare(dice, [(f"token_w{w}", TOKEN) for w in WIDTHS if w != 128], "width_few")
            if len(res):
                res["within_0005"] = (res.ci_low > -NO_EFFECT) & (res.ci_high < NO_EFFECT)
            comp.append(res)
    return pd.DataFrame([f for f in fried if f]), pd.concat(comp, ignore_index=True) if comp else pd.DataFrame()


# ---------------------------------------------------------------- gate values by region
def regions(gt):
    """The four regions of the IP report around a reference mask (z, h, w)."""
    st = ndimage.generate_binary_structure(3, 1)
    d3, e3 = ndimage.binary_dilation(gt, st, 3), ndimage.binary_erosion(gt, st, 3)
    d15 = ndimage.binary_dilation(gt, st, 15)
    return {"inside": e3, "boundary": d3 & ~e3, "near": d15 & ~d3, "far": ~d15}


def as_grid(g):
    """Saved gate of one volume -> (z, h, w) grid: token (z, 32, 32) and scalar (z, 1, 1) as they
    are, channel (z, width) averaged over its channels."""
    g = g.astype(np.float32)
    return g.mean(axis=1)[:, None, None] if g.ndim == 2 else g


def gate_regions(run_dirs):
    """run_dirs: {run name: folder}. Mean g per region over the test volumes of each run."""
    meta = load_meta()
    _, labels, _ = open_arrays()
    gates = {name: np.load(d / "gate_test.npz") for name, d in run_dirs.items() if (d / "gate_test.npz").exists()}
    sums = {name: {k: [0.0, 0] for k in REGIONS} for name in gates}
    vols = sorted(set().union(*(set(g.files) for g in gates.values()))) if gates else []
    for vol in vols:
        idx = volume_index(meta, vol)
        reg = regions(gt_volume(meta, labels, vol))
        for name, g in gates.items():
            if vol not in g.files:
                continue
            values = crop_volume(upsample_grid(as_grid(g[vol])), meta.loc[idx[0]])
            for k, mask in reg.items():
                sums[name][k][0] += float(values[mask].sum())
                sums[name][k][1] += int(mask.sum())
    return {name: {k: (s / n if n else np.nan) for k, (s, n) in r.items()} for name, r in sums.items()}


# ---------------------------------------------------------------- efficiency
def efficiency_row(run_dir):
    summary = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
    hist = pd.read_csv(run_dir / "history.csv")
    return dict(n_params=summary["n_params"], ms_per_iter=1000 * hist.sec.iloc[-1] / hist.iter.iloc[-1],
                train_min=summary["train_sec"] / 60, best_iter=summary["best_iter"],
                best_val_dice=summary["best_val_dice"])


def per_run_tables(runs, root):
    """runs: one row per run (labels, arm, seed, source, run). Gate regions and efficiency per run."""
    folders = {r.run: root / r.source / r.run for r in runs.itertuples()}
    missing = [name for name, d in folders.items() if not (d / "summary.json").exists()]
    if missing:
        print(f"no run folder with summary.json for {len(missing)} runs (skipped here): " + ", ".join(missing))
    folders = {name: d for name, d in folders.items() if name not in missing}
    reg = gate_regions(folders)
    rows_r, rows_e = [], []
    for r in runs.itertuples():
        if r.run in reg:
            rows_r.append(dict(labels=r.labels, arm=r.arm, seed=r.seed, run=r.run, **reg[r.run]))
        if r.run in folders:
            rows_e.append(dict(labels=r.labels, arm=r.arm, seed=r.seed, run=r.run, **efficiency_row(folders[r.run])))
    return pd.DataFrame(rows_r), pd.DataFrame(rows_e)


def by_arm(table, cols):
    out = table.groupby(["labels", "arm"])[cols].mean()
    out["n_runs"] = table.groupby(["labels", "arm"]).size()
    return out.reset_index()


# ---------------------------------------------------------------- figures
def plot_fusion(arms, comp, out):
    panels = [lab for lab in SIZES if (arms.labels == lab).any()] if len(arms) else []
    if not panels:
        return
    fig, axes = S.plt.subplots(1, len(panels), figsize=(4.6 * len(panels), 3.0), squeeze=False)
    for ax, labels in zip(axes[0], panels):
        t = arms[arms.labels == labels].set_index("arm")
        names = [a for a in FUSION if a in t.index]
        for i, a in enumerate(names):
            color = S.BLUE if a == TOKEN else S.GREY
            ax.errorbar(t.dice[a], i, xerr=[[t.dice[a] - t.dice_lo[a]], [t.dice_hi[a] - t.dice[a]]], fmt="o", ms=7,
                        color=color, ecolor=color, elinewidth=1.5, capsize=3)
            c = comp[(comp.family == f"fusion_{labels}") & (comp.b == a)] if len(comp) else comp
            if len(c):
                ax.text(1.01, i, f"p_Holm {c.p_holm.iloc[0]:.3f}", transform=ax.get_yaxis_transform(), va="center",
                        fontsize=7, color=S.INK2)
        ax.set_yticks(range(len(names)), ["token gate (IP)" if a == TOKEN else a for a in names])
        ax.invert_yaxis()
        ax.grid(axis="y", visible=False)
        ax.set_title(f"{SIZES[labels]} labelled volumes", fontsize=9)
        ax.set_xlabel("test Dice (95 % bootstrap CI)")
    S.save_fig(fig, out, "fusion")


def plot_width(arms, eff, out):
    t = arms[(arms.labels == "few") & arms.arm.str.startswith("token_w")] if len(arms) else arms
    if t.empty:
        return
    t = t.assign(width=t.arm.str[7:].astype(int)).sort_values("width")
    fig, ax = S.plt.subplots(figsize=(5.0, 3.0))
    if (t.width == 128).any():
        ref = t[t.width == 128].dice.iloc[0]
        ax.axhspan(ref - NO_EFFECT, ref + NO_EFFECT, color="#e1e0d9", alpha=0.6, lw=0)
    ax.errorbar(t.width, t.dice, yerr=[t.dice - t.dice_lo, t.dice_hi - t.dice], fmt="-o", ms=7, color=S.BLUE,
                ecolor=S.BLUE, elinewidth=1.5, capsize=3)
    e = eff[eff.labels == "few"].set_index("arm") if len(eff) else pd.DataFrame()
    for r in t.itertuples():
        if r.arm in e.index:
            ax.annotate(f"{e.n_params[r.arm] / 1000:.0f}k params\n{e.ms_per_iter[r.arm]:.0f} ms/it",
                        (r.width, r.dice_lo), textcoords="offset points", xytext=(0, -6), ha="center", va="top",
                        fontsize=7, color=S.INK2)
    ax.set_xscale("log", base=2)
    ax.set_xticks(WIDTHS, [str(w) for w in WIDTHS])
    ax.minorticks_off()
    ax.set_xlabel("width of the token-gate head (8 labelled volumes)")
    ax.set_ylabel("test Dice (95 % bootstrap CI)")
    S.save_fig(fig, out, "width")


def plot_regions(reg, out):
    if reg.empty:
        return
    reg = reg.assign(name=reg.arm + " (" + reg.labels.map(SIZES).astype(str) + ")")
    fig, axes = S.plt.subplots(1, len(REGIONS), figsize=(2.4 * len(REGIONS), 0.35 * len(reg) + 1.2), sharey=True)
    for ax, k in zip(axes, REGIONS):
        ax.axvline(0.5, color=S.INK2, lw=0.8, ls="--")
        ax.plot(reg[k], range(len(reg)), "o", ms=7, color=S.BLUE)
        ax.set_xlim(0, 1)
        ax.set_title(k, fontsize=9)
        ax.grid(axis="y", visible=False)
    axes[0].set_yticks(range(len(reg)), reg.name)
    axes[0].invert_yaxis()
    fig.supxlabel("mean gate value g (1 = DINOv3, 0 = MRI-CORE), test set, mean over seeds", fontsize=8)
    S.save_fig(fig, out, "gate_regions")


def main(argv=None):
    ap = argparse.ArgumentParser(description="gate design and head width")
    ap.add_argument("--scores", default=str(S.SCORES), help="per_case.csv of evaluate_ml.py")
    ap.add_argument("--runs-root", default=str(C.WORK), help="folder that holds runs/ and runs_ml/")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "gate_analysis"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    scores = S.with_arm(S.load_scores(a.scores, "test", "raw"), gate_arm)
    expected = [f"few:{x}" for x in FUSION + [f"token_w{w}" for w in WIDTHS if w != 128]] + \
               [f"full:{x}" for x in FUSION[:4]]
    found = set(scores.labels + ":" + scores.arm)
    if set(expected) - found:
        print("missing (not trained or not scored yet): " + ", ".join(e for e in expected if e not in found))
    if scores.empty:
        return
    arms = arm_table(scores)
    arms.to_csv(out / "arms.csv", index=False)
    print(arms.round(4).to_string(index=False))
    fried, comp = compare_arms(scores)
    fried.to_csv(out / "friedman.csv", index=False)
    comp.to_csv(out / "comparisons.csv", index=False)
    if len(fried):
        print(fried.round(4).to_string(index=False))
    if len(comp):
        print(comp[["family", "a", "b", "n_vols", "diff", "ci_low", "ci_high", "p", "p_holm"]].round(4)
              .to_string(index=False))
    runs = scores[["labels", "arm", "seed", "source", "run"]].drop_duplicates()
    reg, eff = per_run_tables(runs, Path(a.runs_root))
    reg.to_csv(out / "gate_regions_runs.csv", index=False)
    eff.to_csv(out / "efficiency_runs.csv", index=False)
    reg_arm = by_arm(reg, list(REGIONS)) if len(reg) else reg
    eff_arm = by_arm(eff, ["n_params", "ms_per_iter", "train_min", "best_iter", "best_val_dice"]) if len(eff) else eff
    reg_arm.to_csv(out / "gate_regions.csv", index=False)
    eff_arm.to_csv(out / "efficiency.csv", index=False)
    if len(reg_arm):
        print(reg_arm.round(3).to_string(index=False))
    if len(eff_arm):
        print(eff_arm.round(2).to_string(index=False))
    plot_fusion(arms, comp, out)
    plot_width(arms, eff_arm, out)
    plot_regions(reg_arm, out)


if __name__ == "__main__":
    main()
