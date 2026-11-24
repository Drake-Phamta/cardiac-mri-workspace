import json
from functools import partial
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import recipe_report as R
import stats_ml as S
from conftest import SCORE_DEFAULTS

# test and validation Dice of each arm; soft_dice+on is best on validation, focal_tversky+on on test
ARMS = {"bce_dice+none": (0.82, 0.80), "soft_dice+none": (0.83, 0.81), "focal_tversky+none": (0.83, 0.80),
        "bce_dice+on": (0.84, 0.82), "soft_dice+on": (0.84, 0.84), "focal_tversky+on": (0.86, 0.82),
        "GateFuse": (0.85, 0.83)}
# the same at 72 volumes: the recipe chosen on validation is clearly behind the IP U-Net and GateFuse
ARMS72 = {"bce_dice+none": (0.91, 0.90), "soft_dice+on": (0.88, 0.86), "GateFuse": (0.905, 0.89)}


def fields(arm):
    if arm == "GateFuse":
        return dict(model="gate")
    loss, aug = arm.split("+")
    return dict(model="unet", fusion="none", loss=loss, aug=aug)


def fake_scores(make_scores, arms=ARMS, arms72=None):
    """Scores of the 8-volume arms; the 72-volume arms when arms72 is given (else one distractor U-Net run there)."""
    rng = np.random.default_rng(0)
    hard = rng.normal(0, 0.03, 20)
    parts = []
    for arm, (test, val) in arms.items():
        parts.append(make_scores(test + hard + rng.normal(0, 0.003, 20), **fields(arm)))
        parts.append(make_scores(np.full(8, val), split="val", **fields(arm)))
    if arms72 is None:
        parts.append(make_scores(np.full(20, 0.95), model="unet", fusion="none", labels="full", n_train_vols=72))
    for arm, (test, val) in (arms72 or {}).items():
        big = dict(fields(arm), labels="full", n_train_vols=72)
        parts.append(make_scores(test + hard + rng.normal(0, 0.003, 20), **big))
        parts.append(make_scores(np.full(8, val), split="val", **big))
    parts.append(make_scores(np.full(20, 0.70), model="unet", fusion="none", split_set="n4", n_train_vols=4))
    return pd.concat(parts, ignore_index=True)


@pytest.mark.parametrize("extra, expected", [
    (dict(model="unet", fusion="none"), "bce_dice+none"),
    (dict(model="unet", fusion="none", loss="focal_tversky", aug="on"), "focal_tversky+on"),
    (dict(model="gate"), "GateFuse"),
    (dict(model="gate", fusion="scalar"), None),
    (dict(model="unet", fusion="none", labels="full", n_train_vols=72), None),
    (dict(model="unet", fusion="none", split_set="n8_draw1"), None),
])
def test_recipe_arm(extra, expected):
    assert R.recipe_arm(SimpleNamespace(**dict(SCORE_DEFAULTS, **extra))) == expected


def test_best_recipe_is_chosen_on_validation_not_test(make_scores, tmp_path):
    path = tmp_path / "per_case.csv"
    fake_scores(make_scores).to_csv(path, index=False)
    R.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    choice = json.loads((tmp_path / "out" / "best_recipe.json").read_text())
    assert choice["recipe"] == "soft_dice+on" and not choice["provisional"]
    assert choice["val_dice"] == pytest.approx(0.841)                     # make_scores adds 0.001 x seed
    assert choice["night3_args"]["2"][choice["night3_args"]["2"].index("--loss") + 1] == "soft_dice"
    assert "--labels" in choice["night3_args"]["0"] and "full" in choice["night3_args"]["0"]
    table = pd.read_csv(tmp_path / "out" / "recipes.csv").set_index("arm")
    assert table.loc["focal_tversky+on", "test_dice"] > table.loc["soft_dice+on", "test_dice"]
    assert table.loc["bce_dice+none", "gap_closed"] == pytest.approx(0) and \
        table.loc["GateFuse", "gap_closed"] == pytest.approx(1)
    comp = pd.read_csv(tmp_path / "out" / "comparisons.csv")
    assert (comp[comp.family == "vs_ip_unet"].b == "bce_dice+none").all() and len(comp) == 5 + 6
    assert pd.read_csv(tmp_path / "out" / "friedman.csv").k.iloc[0] == 6
    assert (tmp_path / "out" / "recipes.png").exists()
    assert not (tmp_path / "out" / "recipe72_arms.csv").exists()          # no run of the chosen recipe at 72 volumes


def test_choice_is_provisional_while_recipes_are_missing(make_scores, tmp_path):
    arms = {k: v for k, v in ARMS.items() if k in ("bce_dice+none", "soft_dice+none", "GateFuse")}
    path = tmp_path / "per_case.csv"
    fake_scores(make_scores, arms).to_csv(path, index=False)
    R.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    choice = json.loads((tmp_path / "out" / "best_recipe.json").read_text())
    assert choice["recipe"] == "soft_dice+none" and choice["provisional"]
    assert len(choice["incomplete_recipes"]) == 4
    assert pd.read_csv(tmp_path / "out" / "comparisons.csv").n_vols.dtype.kind == "i"


def test_baseline_as_best_needs_no_night3_run(make_scores, tmp_path):
    arms = dict(ARMS, **{"bce_dice+none": (0.82, 0.90)})
    path = tmp_path / "per_case.csv"
    fake_scores(make_scores, arms).to_csv(path, index=False)
    R.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    choice = json.loads((tmp_path / "out" / "best_recipe.json").read_text())
    assert choice["recipe"] == "bce_dice+none" and "night3_args" not in choice and "note" in choice
    assert not (tmp_path / "out" / "recipe72_comparisons.csv").exists()


@pytest.mark.parametrize("extra, expected", [
    (dict(model="unet", fusion="none", labels="full", n_train_vols=72), "bce_dice+none"),
    (dict(model="unet", fusion="none", labels="full", n_train_vols=72, loss="soft_dice", aug="on"), "soft_dice+on"),
    (dict(model="gate", labels="full", n_train_vols=72), "GateFuse"),
    (dict(model="gate", labels="full", n_train_vols=72, fusion="channel"), None),
    (dict(model="unet", fusion="none", labels="full", n_train_vols=72, unet_base=32), None),
    (dict(model="unet", fusion="none", labels="full", n_train_vols=72, split_set="fold1_full"), None),
    (dict(model="unet", fusion="none"), None),                                              # 8 volumes
])
def test_recipe_arm_at_72_volumes(extra, expected):
    assert R.recipe_arm(SimpleNamespace(**dict(SCORE_DEFAULTS, **extra)), 72) == expected


def arms_at_72(make_scores, arms72=ARMS72, recipe="soft_dice+on"):
    rows = fake_scores(make_scores, arms72=arms72)
    arm_of = partial(R.recipe_arm, n_vols=72)
    test = S.with_arm(rows[rows.split == "test"], arm_of)
    return test, R.at_72(test, S.with_arm(rows[rows.split == "val"], arm_of), recipe)


def test_the_chosen_recipe_is_compared_at_72_volumes_pairing_by_volume(make_scores):
    test, (arms, comp) = arms_at_72(make_scores)
    dice = arms[arms.metric == "dice"].set_index("arm")
    assert list(arms.metric) == ["dice"] * 3 + ["hd95"] * 3
    assert dice.role.to_dict() == {"soft_dice+on": "chosen", "bce_dice+none": "ip_unet", "GateFuse": "gatefuse"}
    assert (dice.n_vols == 20).all() and (dice.n_seeds == 3).all()
    for arm in dice.index:                                           # the mean over volumes of the mean over seeds
        assert dice.loc[arm, "mean"] == pytest.approx(test[test.arm == arm].dice.mean())
        assert dice.loc[arm, "ci_low"] < dice.loc[arm, "mean"] < dice.loc[arm, "ci_high"]
    assert dice.loc["soft_dice+on", "val_dice"] == pytest.approx(0.861)
    d = comp[comp.family == "recipe72_dice"]
    assert list(d.a) == ["soft_dice+on"] * 2 and list(d.b) == ["bce_dice+none", "GateFuse"]
    assert d["diff"].tolist() == pytest.approx([0.88 - 0.91, 0.88 - 0.905], abs=0.003)
    assert (d.n_vols == 20).all() and (d.a_better == 0).all() and (d.family_size == 2).all()
    assert (d.ci_high < 0).all() and (d.ci_high - d.ci_low < 0.01).all()      # paired: far narrower than the SD per volume
    assert (d.p < 1e-5).all() and d.p_holm.tolist() == pytest.approx((2 * d.p).tolist())      # Holm over the two
    h = comp[comp.family == "recipe72_hd95"]                                    # fake HD95 is 20 (1 - Dice): lower is better
    assert (h["diff"] > 0).all() and (h.a_better == 0).all() and (h.family_size == 2).all()


def test_72_volume_comparison_needs_all_three_arms(make_scores):
    for missing in ARMS72:
        assert arms_at_72(make_scores, {k: v for k, v in ARMS72.items() if k != missing})[1] is None
    assert arms_at_72(make_scores, recipe="bce_dice+none")[1] is None             # the IP U-Net chosen: nothing to add


def test_main_writes_the_72_volume_tables(make_scores, tmp_path):
    path = tmp_path / "per_case.csv"
    fake_scores(make_scores, arms72=ARMS72).to_csv(path, index=False)
    R.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    arms = pd.read_csv(tmp_path / "out" / "recipe72_arms.csv")
    comp = pd.read_csv(tmp_path / "out" / "recipe72_comparisons.csv")
    assert set(arms.arm) == {"soft_dice+on", "bce_dice+none", "GateFuse"} and len(arms) == 6
    assert len(comp) == 4 and (comp.a == "soft_dice+on").all() and comp.n_vols.dtype.kind == "i"
    assert len(pd.read_csv(tmp_path / "out" / "comparisons.csv")) == 5 + 6        # the 8-volume tables do not change
