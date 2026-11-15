"""Which U-Net training recipe works best with 8 labelled volumes?

Six recipes = loss {bce_dice, soft_dice, focal_tversky} x augmentation {none, on},
U-Net on the IP 8-volume set, 3 seeds each:
  bce_dice+none   the IP U-Net, night-1 runs/unet_few_s*
  the other five  runs_ml/recipe_<loss>_aug<aug>_s*
GateFuse (night-1 runs/gate_few_s*) is the reference to beat; it cannot be
augmented itself, because it reads features cached from the original slices.

  Friedman over the recipes (test Dice; one score per volume = the mean over seeds)
  Wilcoxon + bootstrap CI against the IP U-Net (Holm over 5) and against GateFuse (Holm over 6)
  gap closed = (recipe - IP U-Net) / (GateFuse - IP U-Net); the plan asks whether a recipe closes >= 50 %
  best recipe = the highest VALIDATION Dice (mean over seeds of the mean over the 8 validation
                volumes). The test set plays no part in the choice. Night 3 trains it at 72 volumes.

Once the chosen recipe has been trained at 72 volumes (runs_ml/recipe72_best_s*), it is compared there with the
IP U-Net (night-1 runs/unet_full_s*) and with GateFuse (runs/gate_full_s*), on the 20 test volumes, exactly like
the 8-volume comparisons: one score per volume = the mean over seeds, Wilcoxon + bootstrap CI, Holm over the two
comparisons of each metric (Dice, HD95). The three arms are named like at 8 volumes.

Output in --out (default LA_WORK/analysis/recipe_report/):
  recipes.csv  friedman.csv  comparisons.csv  best_recipe.json  recipes.png
  recipe72_arms.csv  recipe72_comparisons.csv      only once the chosen recipe has runs at 72 volumes

  python code/recipe_report.py --scores LA_WORK/analysis/evaluate_ml/per_case.csv
"""
import argparse
import json
import sys
from functools import partial
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
import stats_ml as S  # noqa: E402

LOSSES = ("bce_dice", "soft_dice", "focal_tversky")
AUGS = ("none", "on")
RECIPES = [f"{loss}+{aug}" for aug in AUGS for loss in LOSSES]
BASELINE = "bce_dice+none"
GATE = "GateFuse"
N_SEEDS = 3
LABELS = {8: "few", 72: "full"}          # the IP training set: the first 8 volumes, or all 72


def recipe_arm(r, n_vols=8):
    """<loss>+<aug> for a U-Net trained on the first n_vols volumes of the IP split (8 or 72), GateFuse for the
    IP gate there."""
    if r.split_set != "ip" or r.labels != LABELS[n_vols] or r.n_train_vols != n_vols:
        return None
    if r.model == "unet" and r.unet_base == 16:
        return f"{r.loss}+{r.aug}"
    if r.model == "gate" and S.is_default(r):
        return GATE
    return None


def recipe_table(test, val):
    """One row per arm: seeds, validation Dice, test Dice with CI, HD95 and the share of the gap closed."""
    test_dice, test_hd95 = S.per_volume(test, "dice"), S.per_volume(test, "hd95")
    val_dice = val.groupby(["arm", "seed"]).dice.mean().groupby("arm").mean()          # per run, then over seeds
    rows = []
    for a in RECIPES + [GATE]:
        if a not in test_dice:
            continue
        lo, hi = S.bootstrap_ci(test_dice[a].dropna())
        seeds = test[test.arm == a].groupby("seed").dice.mean()
        rows.append(dict(arm=a, n_seeds=len(seeds), val_dice=val_dice.get(a, np.nan), test_dice=test_dice[a].mean(),
                         test_dice_lo=lo, test_dice_hi=hi, test_dice_seed_sd=seeds.std(),
                         test_hd95=test_hd95[a].mean()))
    table = pd.DataFrame(rows)
    if {BASELINE, GATE} <= set(table.arm):
        base, gate = (table.set_index("arm").test_dice[k] for k in (BASELINE, GATE))
        table["gap_closed"] = (table.test_dice - base) / (gate - base)
    return table


def choose(table):
    """The recipe with the highest validation Dice (GateFuse is not a recipe)."""
    rec = table[table.arm.isin(RECIPES)].dropna(subset=["val_dice"])
    if rec.empty:
        return None
    best = rec.loc[rec.val_dice.idxmax()]
    loss, aug = best.arm.split("+")
    incomplete = [r for r in RECIPES if r not in set(rec.arm) or rec.set_index("arm").n_seeds.get(r, 0) < N_SEEDS]
    choice = dict(recipe=best.arm, loss=loss, aug=aug, val_dice=float(best.val_dice), n_seeds=int(best.n_seeds),
                  chosen_on="validation Dice, mean over seeds of the mean over the validation volumes",
                  provisional=bool(incomplete), incomplete_recipes=incomplete,
                  val_dice_of_every_recipe={r.arm: float(r.val_dice) for r in rec.itertuples()})
    if best.arm == BASELINE:
        choice["note"] = "the IP U-Net is best: night-1 runs/unet_full_s* already train it at 72 volumes"
    else:
        choice["night3_args"] = {str(s): ["code/train_ml.py", "--model", "unet", "--labels", "full", "--loss", loss,
                                          "--aug", aug, "--seed", str(s), "--device", "cuda", "--out",
                                          str(C.WORK / "runs_ml" / f"recipe72_best_s{s}")] for s in range(N_SEEDS)}
    return choice


def at_72(test, val, recipe):
    """The recipe chosen on validation against the IP U-Net and GateFuse at 72 labelled volumes.

    test and val hold the rows of the arms named by recipe_arm(r, 72). Same statistics as the 8-volume
    comparisons: one score per volume = the mean over seeds, then stats_ml.compare (Wilcoxon, bootstrap CI)
    with Holm over the two comparisons of each metric. Returns (arms, comparisons), or None while the recipe
    has no runs at 72 volumes (or is the IP U-Net itself, which needs none)."""
    arms = [recipe, BASELINE, GATE]
    if recipe == BASELINE or any(a not in set(test.arm) for a in arms):
        return None
    dice, hd95 = S.per_volume(test, "dice"), S.per_volume(test, "hd95")
    role = {recipe: "chosen", BASELINE: "ip_unet", GATE: "gatefuse"}
    val_dice = val.groupby(["arm", "seed"]).dice.mean().groupby("arm").mean()
    rows = []
    for metric, table in (("dice", dice), ("hd95", hd95)):
        for a in arms:
            lo, hi = S.bootstrap_ci(table[a].dropna())
            seeds = test[test.arm == a].groupby("seed")[metric].mean()
            rows.append(dict(metric=metric, arm=a, role=role[a], n_vols=int(table[a].notna().sum()),
                             n_seeds=len(seeds), mean=table[a].mean(), ci_low=lo, ci_high=hi, seed_sd=seeds.std(),
                             val_dice=val_dice.get(a, np.nan)))
    comp = S.concat([S.compare(dice, [(recipe, BASELINE), (recipe, GATE)], "recipe72_dice"),
                     S.compare(hd95, [(recipe, BASELINE), (recipe, GATE)], "recipe72_hd95", higher_is_better=False)])
    return pd.DataFrame(rows), comp


def plot(table, choice, out):
    if table.empty:
        return
    t = table.set_index("arm")
    arms = [a for a in RECIPES + [GATE] if a in t.index]
    fig, ax = S.plt.subplots(figsize=(6.4, 0.42 * len(arms) + 1.0))
    for i, a in enumerate(arms):
        r = t.loc[a]
        color = S.MODEL_COLOR["gate"] if a == GATE else S.MODEL_COLOR["unet"]
        best = choice is not None and a == choice["recipe"]
        ax.errorbar(r.test_dice, i, xerr=[[r.test_dice - r.test_dice_lo], [r.test_dice_hi - r.test_dice]], fmt="o",
                    ms=8, color=color, ecolor=color, elinewidth=1.5, capsize=3)
        ax.text(1.01, i, f"val {r.val_dice:.3f}" + ("  (chosen)" if best else ""), transform=ax.get_yaxis_transform(),
                va="center", fontsize=7.5, color=S.INK)
    ax.set_yticks(range(len(arms)), [a.replace("+", " + aug ") if a != GATE else a for a in arms])
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("test Dice, 8 labelled volumes (mean over volumes, 95 % bootstrap CI)")
    S.save_fig(fig, out, "recipes")


def main(argv=None):
    ap = argparse.ArgumentParser(description="U-Net recipes at 8 labelled volumes")
    ap.add_argument("--scores", default=str(S.SCORES), help="per_case.csv of evaluate_ml.py")
    ap.add_argument("--out", default=str(C.WORK / "analysis" / "recipe_report"))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    test_rows, val_rows = S.load_scores(a.scores, "test", "raw"), S.load_scores(a.scores, "val", "raw")
    test, val = S.with_arm(test_rows, recipe_arm), S.with_arm(val_rows, recipe_arm)
    missing = [r for r in RECIPES + [GATE] if r not in set(test.arm)]
    if missing:
        print("missing (not trained or not scored yet): " + ", ".join(missing))
    table = recipe_table(test, val)
    table.to_csv(out / "recipes.csv", index=False)
    if table.empty:
        return
    print(table.round(4).to_string(index=False))
    dice = S.per_volume(test, "dice")
    res = S.friedman(dice[[r for r in RECIPES if r in dice]], "recipes")
    pd.DataFrame([res] if res else []).to_csv(out / "friedman.csv", index=False)
    if res:
        print(f"Friedman over {res['k']} recipes, {res['n_vols']} volumes: chi2 {res['statistic']:.2f}, "
              f"p {res['p']:.4f}, Kendall W {res['kendall_w']:.3f}")
    comp = S.concat([S.compare(dice, [(r, BASELINE) for r in RECIPES if r != BASELINE], "vs_ip_unet"),
                     S.compare(dice, [(r, GATE) for r in RECIPES], "vs_gatefuse")])
    comp.to_csv(out / "comparisons.csv", index=False)
    if len(comp):
        print(comp[["family", "a", "b", "diff", "ci_low", "ci_high", "p", "p_holm"]].round(4).to_string(index=False))
    choice = choose(table)
    if choice is None:
        print("no recipe has validation scores yet: nothing to choose")
    else:
        (out / "best_recipe.json").write_text(json.dumps(choice, indent=1), encoding="utf-8")
        print(f"best recipe on VALIDATION: {choice['recipe']} (val Dice {choice['val_dice']:.4f}, "
              f"{choice['n_seeds']} seeds)" + ("  PROVISIONAL, incomplete: " + ", ".join(choice["incomplete_recipes"])
                                               if choice["provisional"] else ""))
        big = at_72(S.with_arm(test_rows, partial(recipe_arm, n_vols=72)),
                    S.with_arm(val_rows, partial(recipe_arm, n_vols=72)), choice["recipe"])
        if big is None:
            print(f"72 volumes: nothing to compare ({choice['recipe']} has no scored runs there, or is the IP U-Net)")
        else:
            arms72, comp72 = big
            arms72.to_csv(out / "recipe72_arms.csv", index=False)
            comp72.to_csv(out / "recipe72_comparisons.csv", index=False)
            print(arms72.round(4).to_string(index=False))
            print(comp72[["family", "a", "b", "diff", "ci_low", "ci_high", "a_better", "p", "p_holm"]].round(4)
                  .to_string(index=False))
    plot(table, choice, out)


if __name__ == "__main__":
    main()
