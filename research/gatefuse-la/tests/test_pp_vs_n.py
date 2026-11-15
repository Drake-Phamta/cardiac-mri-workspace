import numpy as np
import pandas as pd
import pytest

import pp_vs_n
from learning_curve import MODELS, NESTED


def fake_scores(make_scores):
    """Every learning-curve point with the 4 variants; post-processing adds 0.08 / n to the Dice."""
    rng = np.random.default_rng(0)
    parts = []
    for model in MODELS:
        for n in NESTED:
            raw = rng.uniform(0.75, 0.9, 20)
            for pp in ("raw", "lcc", "lcc_fill", "lcc_fill_close"):
                parts.append(make_scores(raw + (0.08 / n if pp != "raw" else 0), pp=pp, model=model,
                                         fusion="token" if model == "gate" else "none",
                                         split_set="ip" if n in (8, 72) else f"n{n}",
                                         labels="few" if n < 16 else "full", n_train_vols=n))
    return pd.concat(parts, ignore_index=True)


def test_gain_per_n_and_its_spearman_correlation(make_scores, tmp_path):
    path = tmp_path / "per_case.csv"
    fake_scores(make_scores).to_csv(path, index=False)
    pp_vs_n.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    gain = pd.read_csv(tmp_path / "out" / "gain.csv")
    assert len(gain) == 2 * 3 * 2 * 5                          # models x variants x metrics x n
    dice = gain[(gain.metric == "dice") & (gain.model == "unet") & (gain.variant == "lcc")].set_index("n")
    assert np.allclose(dice.gain, [0.08 / n for n in dice.index])
    assert (dice.gain_lo <= dice.gain).all() and (dice.gain <= dice.gain_hi).all()
    # HD95 = 20 (1 - Dice) here, so the distance drops by 20 x the Dice gain: a positive HD95 gain
    hd = gain[(gain.metric == "hd95") & (gain.model == "unet") & (gain.variant == "lcc")].set_index("n")
    assert np.allclose(hd.gain, [20 * 0.08 / n for n in hd.index])
    rho = pd.read_csv(tmp_path / "out" / "spearman.csv")
    # a perfect ordering of 5 points: 2 of the 120 orderings are as extreme
    assert np.allclose(rho.rho_means, -1.0) and np.allclose(rho.p_means, 2 / 120)
    assert (tmp_path / "out" / "pp_gain.png").exists()


def test_exact_spearman_p_for_few_points():
    assert pp_vs_n.spearman_exact([4, 8, 72], [0.03, 0.02, 0.01]) == pytest.approx((-1.0, 2 / 6))
    rho, p = pp_vs_n.spearman_exact([4, 8, 16, 36, 72], [0.01, 0.03, 0.02, 0.05, 0.04])
    assert rho == pytest.approx(0.8) and 0.1 < p < 0.2


def test_only_curve_points_are_used(make_scores, tmp_path):
    scores = pd.concat([fake_scores(make_scores),
                        make_scores(np.full(20, 0.5), pp="lcc", width=32)])             # a gate-width run
    path = tmp_path / "per_case.csv"
    scores.to_csv(path, index=False)
    pp_vs_n.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    gain = pd.read_csv(tmp_path / "out" / "gain.csv")
    assert len(gain) == 2 * 3 * 2 * 5
