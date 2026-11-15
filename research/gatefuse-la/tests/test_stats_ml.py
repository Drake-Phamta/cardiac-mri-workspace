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
    folds = pd.read_csv(tmp_path / "out" / "cv_folds.csv")
    assert len(folds) == 10 and (folds.n_vols == 16).all() and folds.dice.between(0.8, 1.0).all()
    assert (tmp_path / "out" / "ci_width.png").exists()


def fold_scores(make_scores, seeds=(0,)):
    """Three folds of 4 volumes, GateFuse 0.03 above U-Net, fold k 0.01 k above fold 0, and runs to ignore."""
    base = np.array([0.80, 0.82, 0.84, 0.86])
    parts = []
    for model, shift in (("gate", 0.03), ("unet", 0.0)):
        for k in range(3):
            vols = [f"cv{i:02d}" for i in range(4 * k, 4 * k + 4)]
            parts.append(make_scores(base + shift + 0.01 * k, seeds=seeds, vols=vols, model=model, source="runs_ml",
                                     split_set=f"fold{k}_few"))
    parts.append(make_scores(np.full(4, 0.5), model="gate", width=32, split_set="fold0_few"))      # not the IP recipe
    parts.append(make_scores(np.full(20, 0.9), model="gate"))                                # the IP split: no fold
    return pd.concat(parts, ignore_index=True)


def test_cv_folds_gives_the_mean_of_every_model_and_fold(make_scores):
    folds = S.cv_folds(fold_scores(make_scores))
    assert list(folds.columns) == ["model", "split_set", "n_vols", "n_seeds", "dice", "hd95", "n_train_vols", "iters"]
    assert list(folds.model) == ["gate"] * 3 + ["unet"] * 3
    assert list(folds.split_set) == ["fold0_few", "fold1_few", "fold2_few"] * 2
    assert (folds.n_vols == 4).all() and (folds.n_seeds == 1).all() and (folds.n_train_vols == 8).all()
    assert (folds.iters == 2000).all()
    assert folds.dice.tolist() == pytest.approx([0.83 + shift + 0.01 * k for shift in (0.03, 0.0) for k in range(3)])
    assert folds.hd95.tolist() == pytest.approx((20 * (1 - folds.dice)).tolist())


def test_cv_folds_scores_a_volume_as_the_mean_over_its_seeds(make_scores):
    folds = S.cv_folds(fold_scores(make_scores, seeds=(0, 1, 2)))
    assert (folds.n_seeds == 3).all() and (folds.n_vols == 4).all()
    assert folds.dice.tolist() == pytest.approx([0.831 + shift + 0.01 * k for shift in (0.03, 0.0) for k in range(3)])


def test_cv_folds_is_empty_without_fold_runs(make_scores):
    folds = S.cv_folds(make_scores(np.full(20, 0.9), model="gate"))
    assert folds.empty and "dice" in folds.columns
