import numpy as np
import pandas as pd
import pytest

import stats_ml as S


def test_holm_matches_a_hand_computed_example():
    # sorted 0.01, 0.03, 0.04 -> 3 x 0.01, 2 x 0.03, max(previous, 1 x 0.04)
    assert np.allclose(S.holm([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06])
    assert np.allclose(S.holm([0.5, 0.9]), [1.0, 1.0])


def test_holm_counts_missing_comparisons_of_the_declared_family():
    assert np.allclose(S.holm([0.01], family_size=5), [0.05])


def test_wilcoxon_of_identical_scores_is_one():
    assert S.wilcoxon_p([0.8, 0.9, 0.7], [0.8, 0.9, 0.7]) == 1.0


def test_bootstrap_ci_covers_the_mean_and_shrinks_with_more_volumes():
    rng = np.random.default_rng(0)
    assert S.bootstrap_ci(np.full(10, 0.02)) == pytest.approx((0.02, 0.02))
    d20, d80 = rng.normal(0.03, 0.04, 20), rng.normal(0.03, 0.04, 80)
    lo20, hi20 = S.bootstrap_ci(d20)
    lo80, hi80 = S.bootstrap_ci(d80)
    assert lo20 < d20.mean() < hi20 and lo80 < d80.mean() < hi80
    assert 0.35 < (hi80 - lo80) / (hi20 - lo20) < 0.7                # about sqrt(20 / 80) = 0.5


def table(**arms):
    return pd.DataFrame(arms, index=[f"v{i:02d}" for i in range(len(next(iter(arms.values()))))])


def test_compare_reports_direction_ci_and_holm():
    rng = np.random.default_rng(1)
    base = rng.uniform(0.80, 0.90, 20)
    t = table(a=base + 0.02, b=base, c=base + rng.normal(0, 0.01, 20))
    res = S.compare(t, [("a", "b"), ("c", "b"), ("a", "missing")], "fam")
    assert list(res.b) == ["b", "b"] and (res.family_size == 3).all()
    first = res.iloc[0]
    assert first["diff"] == pytest.approx(0.02) and first.a_better == 20 and first.p < 0.001
    assert first.ci_low == pytest.approx(0.02) and first.p_holm == pytest.approx(min(1, 3 * first.p))


def test_compare_counts_lower_as_better_for_distances():
    t = table(a=np.full(8, 3.0) + np.arange(8) * 0.1, b=np.full(8, 5.0))
    res = S.compare(t, [("a", "b")], "hd", higher_is_better=False)
    assert res.iloc[0].a_better == 8 and res.iloc[0]["diff"] < 0


def test_compare_skips_pairs_with_too_few_volumes():
    t = table(a=[0.9, 0.8, 0.7], b=[0.8, 0.7, 0.6])
    assert S.compare(t, [("a", "b")], "small").empty


def test_friedman_needs_three_arms_and_finds_a_better_arm():
    rng = np.random.default_rng(2)
    base = rng.uniform(0.8, 0.9, 20)
    assert S.friedman(table(a=base, b=base), "two") is None
    res = S.friedman(table(a=base + 0.03, b=base + rng.normal(0, 0.005, 20), c=base), "three")
    assert res["k"] == 3 and res["n_vols"] == 20 and res["p"] < 0.001 and 0 <= res["kendall_w"] <= 1


def test_per_volume_averages_the_seeds(make_scores):
    scores = make_scores([0.80, 0.90]).assign(arm="x")
    assert S.per_volume(scores)["x"].tolist() == pytest.approx([0.801, 0.901])


def test_main_compares_ip_test_and_cv(make_scores, tmp_path):
    rng = np.random.default_rng(3)
    ip = rng.uniform(0.8, 0.9, 20)
    cv = rng.uniform(0.8, 0.9, 80)
    parts = [make_scores(ip + 0.02 + rng.normal(0, 0.03, 20), model="gate"), make_scores(ip, model="unet"),
             make_scores(ip + 0.1, model="gate", width=32)]                     # not the IP recipe: ignored
    for k in range(5):
        vols = [f"cv{i:02d}" for i in range(16 * k, 16 * k + 16)]
        for model, shift in (("gate", 0.02), ("unet", 0.0)):
            noise = rng.normal(0, 0.03, 16) if model == "gate" else 0
            parts.append(make_scores(cv[16 * k:16 * k + 16] + shift + noise, seeds=(0,), vols=vols, model=model,
                                     source="runs_ml", split_set=f"fold{k}_few"))
    path = tmp_path / "per_case.csv"
    pd.concat(parts).to_csv(path, index=False)
    S.main(["--scores", str(path), "--out", str(tmp_path / "out")])
    res = pd.read_csv(tmp_path / "out" / "comparisons.csv")
    dice = res[res.metric == "dice"].set_index("family")
    assert dice.loc["ip_dice", "n_vols"] == 20 and dice.loc["cv_dice", "n_vols"] == 80
    assert res.n_vols.dtype.kind == "i"                       # the missing "full" comparisons leave no floats
    assert dice.loc["cv_dice", "ci_width"] < dice.loc["ip_dice", "ci_width"]
    assert (pd.read_csv(tmp_path / "out" / "cv_coverage.csv").n_vols == 16).all()
    assert (tmp_path / "out" / "ci_width.png").exists()
