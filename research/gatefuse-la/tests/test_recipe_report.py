import json
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import recipe_report as R
from conftest import SCORE_DEFAULTS

# test and validation Dice of each arm; soft_dice+on is best on validation, focal_tversky+on on test
ARMS = {"bce_dice+none": (0.82, 0.80), "soft_dice+none": (0.83, 0.81), "focal_tversky+none": (0.83, 0.80),
        "bce_dice+on": (0.84, 0.82), "soft_dice+on": (0.84, 0.84), "focal_tversky+on": (0.86, 0.82),
        "GateFuse": (0.85, 0.83)}


def fields(arm):
    if arm == "GateFuse":
        return dict(model="gate")
    loss, aug = arm.split("+")
    return dict(model="unet", fusion="none", loss=loss, aug=aug)


def fake_scores(make_scores, arms=ARMS):
    rng = np.random.default_rng(0)
    hard = rng.normal(0, 0.03, 20)
    parts = []
    for arm, (test, val) in arms.items():
        parts.append(make_scores(test + hard + rng.normal(0, 0.003, 20), **fields(arm)))
        parts.append(make_scores(np.full(8, val), split="val", **fields(arm)))
    parts.append(make_scores(np.full(20, 0.95), model="unet", fusion="none", labels="full", n_train_vols=72))
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
