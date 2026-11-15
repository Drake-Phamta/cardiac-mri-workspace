from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import learning_curve as L
from conftest import SCORE_DEFAULTS


def row(**fields):
    return SimpleNamespace(**dict(SCORE_DEFAULTS, **fields))


@pytest.mark.parametrize("fields, expected", [
    (dict(), "gate_n8"),                                                              # night-1 gate_few
    (dict(model="unet", fusion="none", labels="full", n_train_vols=72), "unet_n72"),
    (dict(split_set="n4", n_train_vols=4), "gate_n4"),
    (dict(split_set="n36", labels="full", n_train_vols=36), "gate_n36"),
    (dict(split_set="n8_draw2"), "gate_n8_draw2"),
    (dict(split_set="n8", labels="full"), "gate_n8long"),
    (dict(width=32), None),                                                           # gate width runs
    (dict(model="unet", fusion="none", loss="soft_dice"), None),                       # recipe runs
    (dict(split_set="fold0_few"), None),                                              # CV runs
    (dict(model="concat", fusion="none"), None),
])
def test_lc_arm_sorts_runs_into_points(fields, expected):
    assert L.lc_arm(row(**fields)) == expected


def test_power_law_fit_recovers_its_parameters():
    ns = np.array(L.NESTED, float)
    p = L.fit_curve(ns, L.power_law(ns, 0.92, 0.4, 0.8))
    assert p == pytest.approx([0.92, 0.4, 0.8], abs=1e-3)
    assert L.fit_curve(ns[:3], [0.8, 0.85, 0.9]) is None


def test_crossover_is_where_the_fitted_gap_drops_below_the_threshold():
    gate, unet = (0.92, 0.2, 0.5), (0.92, 0.6, 0.8)
    n_star = L.crossover(gate, unet)
    gap = lambda n: L.power_law(n, *gate) - L.power_law(n, *unet)  # noqa: E731
    assert gap(n_star) < L.GAP_SMALL <= gap(n_star / 1.02)
    assert L.crossover((0.95, 0.1, 0.5), (0.90, 0.1, 0.5)) == np.inf             # gate always 0.05 ahead


def curve(n, model):
    """Synthetic truth: U-Net needs more labels than GateFuse, both reach 0.92."""
    return L.power_law(n, 0.92, *((0.2, 0.5) if model == "gate" else (0.6, 0.8)))


def fake_curve_scores(make_scores, with_extras=True):
    rng = np.random.default_rng(0)
    noise = rng.normal(0, 0.02, 20)                         # volume difficulty, shared by every arm
    parts = []
    for model in L.MODELS:
        fields = dict(model=model, fusion="token" if model == "gate" else "none")
        for n in L.NESTED:
            split = "ip" if n in (8, 72) else f"n{n}"
            labels = "few" if n < 16 else "full"
            parts.append(make_scores(curve(n, model) + noise + rng.normal(0, 0.005, 20), split_set=split,
                                     labels=labels, n_train_vols=n, **fields))
        if with_extras:
            for split in ("n8_draw1", "n8_draw2"):
                parts.append(make_scores(curve(8, model) + noise - 0.01, seeds=(0,), split_set=split, **fields))
            parts.append(make_scores(curve(8, model) + noise + 0.01, split_set="n8", labels="full", **fields))
    return pd.concat(parts, ignore_index=True)


def test_main_writes_points_gap_fit_draws_and_schedule(make_scores, tmp_path):
    path = tmp_path / "per_case.csv"
    fake_curve_scores(make_scores).to_csv(path, index=False)
    L.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    out = tmp_path / "out"
    pts = pd.read_csv(out / "points.csv")
    assert len(pts) == 10 and (pts.n_seeds == 3).all() and (pts.dice_lo < pts.dice).all()
    gap = pd.read_csv(out / "gap.csv")
    dice_gap = gap[gap.metric == "dice"].set_index("n")["diff"]
    assert dice_gap[4] > dice_gap[16] > dice_gap[72]
    cross = pd.read_csv(out / "crossover.csv").iloc[0]
    assert cross.n_star == pytest.approx(L.crossover((0.92, 0.2, 0.5), (0.92, 0.6, 0.8)), rel=0.3)
    assert cross.boot_lo <= cross.n_star <= cross.boot_hi
    assert set(pd.read_csv(out / "draws.csv").set) == {"n8 (IP few)", "n8_draw1", "n8_draw2"}
    sched = pd.read_csv(out / "schedule.csv")
    assert (sched[sched.family == "long_minus_short"]["diff"] > 0).all()
    assert (out / "learning_curve.png").exists() and (out / "gap.png").exists()


def test_main_works_with_night1_points_only(make_scores, tmp_path, capsys):
    scores = fake_curve_scores(make_scores, with_extras=False)
    path = tmp_path / "per_case.csv"
    scores[scores.split_set == "ip"].to_csv(path, index=False)
    L.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    printed = capsys.readouterr().out
    assert "missing" in printed and "gate_n4" in printed and "no fit yet" in printed
    assert len(pd.read_csv(tmp_path / "out" / "points.csv")) == 4
