import numpy as np
import pandas as pd
import pytest

import calibration as K
import config as C


def counts_for(true_freq):
    """2 x 256 counts with 10 000 voxels per level, a fraction true_freq(p) of them atrium."""
    n = np.full(256, 10_000)
    atrium = np.rint(n * true_freq(K.probs())).astype(int)
    return np.stack([n - atrium, atrium])


def test_level_counts_only_count_the_widened_box():
    gt = np.zeros((10, 40, 40), bool)
    gt[4:6, 10:20, 10:20] = True
    prob = np.full(gt.shape, 7, np.uint8)
    c = K.level_counts(prob, gt, margin=2)
    assert c.sum() == (2 + 4) * (10 + 4) * (10 + 4)                 # box 2 x 10 x 10 widened by 2 on every side
    assert c[1].sum() == gt.sum() and c[:, 7].sum() == c.sum()


def test_box_is_clipped_at_the_volume_edges():
    gt = np.zeros((5, 8, 8), bool)
    gt[0, 0, 0] = True
    assert K.level_counts(np.zeros(gt.shape, np.uint8), gt, margin=10).sum() == gt.size


def test_calibrated_predictions_have_almost_no_ece():
    c = counts_for(lambda p: p)
    assert K.ece(c) < 0.002


def test_overconfident_predictions_are_fixed_by_a_temperature_above_one():
    # the truth is p squeezed towards 0.5: the model is too sure of itself
    c = counts_for(lambda p: 1 / (1 + np.exp(-np.log(p / (1 - p)) / 2)))
    T = K.fit_temperature(c)
    assert T == pytest.approx(2, abs=0.1)
    assert K.ece(c) > 0.05 and K.ece(c, T) < 0.01
    assert K.nll(c, T) < K.nll(c)


def test_brier_matches_the_direct_formula():
    rng = np.random.default_rng(0)
    level = rng.integers(0, 256, 5000)
    y = rng.random(5000) < 0.3
    c = np.stack([np.bincount(level[~y], minlength=256), np.bincount(level[y], minlength=256)])
    assert K.brier(c) == pytest.approx(np.mean((K.probs()[level] - y) ** 2))


def test_reliability_bins_hold_every_voxel():
    rel = K.reliability(counts_for(lambda p: p))
    assert len(rel) == K.N_BINS and rel.n_voxels.sum() == 256 * 10_000
    assert np.allclose(rel.frac_atrium, rel.mean_p, atol=0.002)


def test_disagreement_and_auroc():
    a = np.zeros((4, 4), bool)
    a[:2] = True
    assert K.disagreement([a, a, a]) == 0.0
    assert K.disagreement([a, ~a]) == 1.0
    assert K.auroc([0.3, 0.4], [0.1, 0.2])[0] == 1.0
    assert K.auroc([0.1], [0.2, 0.3])[0] == 0.0
    assert np.isnan(K.auroc([], [0.2])[0])


def sure(gt, rng):
    """Confident and right on most voxels, wrong on a few: overconfident."""
    wrong = rng.random(gt.shape) < 0.03
    return np.where(gt ^ wrong, 250, 5)


def soft(gt, rng):
    return np.where(gt, 180, 60) + rng.integers(-20, 20, gt.shape)


def test_main_writes_every_table_on_tiny_runs(tiny_work, fake_run, tmp_path, monkeypatch):
    monkeypatch.setattr(C, "PREP_DIR", tiny_work / "prep")
    for seed in (0, 1):
        fake_run(tmp_path / "runs" / f"gate_few_s{seed}", prob=sure, seed=seed)
        fake_run(tmp_path / "runs" / f"unet_few_s{seed}", prob=soft, model="unet", seed=seed)
    fake_run(tmp_path / "runs" / "gate_w32_s0", prob=soft, width=32)                   # not the IP recipe
    out = tmp_path / "out"
    K.main([str(tmp_path / "runs"), "--out", str(out)])
    runs = pd.read_csv(out / "calibration_runs.csv")
    assert sorted(runs.arm.unique()) == ["ip_gate_few", "ip_unet_few"] and len(runs) == 4
    assert runs["T"].between(0.05, 20).all() and runs[["ece", "ece_ts", "brier", "brier_ts"]].stack().between(0, 1).all()
    # 'sure' puts 250 on 97 % of the voxels it calls atrium, 'soft' only 180: GateFuse is more overconfident here
    assert (runs[runs.arm == "ip_gate_few"]["T"] > runs[runs.arm == "ip_unet_few"]["T"].max()).all()
    dis = pd.read_csv(out / "disagreement.csv")
    assert (dis.n_seeds == 2).all() and dis.disagreement.between(0, 1).all()
    for name in ("calibration_summary.csv", "calibration_volumes.csv", "calibration_tests.csv", "reliability.csv",
                 "disagreement_auroc.csv", "reliability.png", "disagreement.png"):
        assert (out / name).exists(), name
    flags = pd.read_csv(out / "disagreement_auroc.csv")
    assert {"auroc", "auroc_lo", "auroc_hi", "auroc_n_boot"} <= set(flags.columns)
    assert list(flags.arm) == ["ip_gate_few", "ip_unet_few", "all_arms_pooled"]               # one test volume per arm


def resampled_auroc(score, bad, unit, n_boot, seed):
    """AUROC of every bootstrap resample, the slow way: draw volumes, stack all their rows, call auroc()."""
    draw = np.random.default_rng(seed).integers(0, unit.max() + 1, size=(n_boot, unit.max() + 1))
    out = []
    for d in draw:
        rows = np.concatenate([np.flatnonzero(unit == u) for u in d])
        b = bad[rows]
        if b.any() and not b.all():
            out.append(K.auroc(score[rows][b], score[rows][~b])[0])
    return np.array(out)


def test_auroc_ci_is_the_percentile_interval_of_resampled_volumes():
    rng = np.random.default_rng(5)
    score = np.round(rng.random(20), 1)                                            # rounded: plenty of ties
    bad = score + rng.normal(0, 0.3, 20) > 0.7
    lo, hi, n_used = K.auroc_ci(score, bad, n_boot=400, seed=5)
    a = resampled_auroc(score, bad, np.arange(20), 400, 5)
    assert (lo, hi) == pytest.approx(tuple(np.percentile(a, [2.5, 97.5])), abs=1e-12) and n_used == len(a)
    assert lo <= K.auroc(score[bad], score[~bad])[0] <= hi


def test_auroc_ci_resamples_volumes_when_several_rows_share_one():
    rng = np.random.default_rng(6)
    vols = np.tile(np.arange(10), 3)                                  # 3 arms test the same 10 volumes
    score = np.round(rng.random(30), 1)
    bad = score + rng.normal(0, 0.3, 30) > 0.7                         # a volume can be flagged in one arm only
    lo, hi, n_used = K.auroc_ci(score, bad, units=vols, n_boot=400, seed=6)
    a = resampled_auroc(score, bad, vols, 400, 6)
    assert (lo, hi) == pytest.approx(tuple(np.percentile(a, [2.5, 97.5])), abs=1e-12) and n_used == len(a)
    # the same volumes repeated change nothing: the CI of the copies is the CI of one copy
    one = K.auroc_ci(score[:10], bad[:10], n_boot=400, seed=6)
    copies = K.auroc_ci(np.tile(score[:10], 3), np.tile(bad[:10], 3), units=vols, n_boot=400, seed=6)
    assert copies == pytest.approx(one)


def test_auroc_ci_of_a_perfect_flag_is_one_and_leaves_out_resamples_without_both_groups():
    lo, hi, n_used = K.auroc_ci([0.3, 0.4, 0.1, 0.2], [True, True, False, False], n_boot=2000)
    assert (lo, hi) == (1.0, 1.0)
    assert 0.8 * 2000 < n_used < 2000                                  # 1 resample of 4 volumes in 8 is one-sided


def test_auroc_ci_is_repeatable_and_empty_without_both_groups():
    score, bad = np.linspace(0, 1, 12), np.arange(12) % 3 == 0
    assert K.auroc_ci(score, bad) == K.auroc_ci(score, bad)
    assert K.auroc_ci(score, bad, seed=1) != K.auroc_ci(score, bad, seed=2)
    for flags in (np.zeros(12, bool), np.ones(12, bool)):
        lo, hi, n_used = K.auroc_ci(score, flags)
        assert np.isnan(lo) and np.isnan(hi) and n_used == 0


def test_flagging_gives_the_ci_of_the_auroc_next_to_it():
    rng = np.random.default_rng(0)
    vols = [f"v{i:02d}" for i in range(20)]
    parts = []
    for arm, n_bad in (("ip_gate_few", 6), ("ip_unet_few", 8), ("ip_gate_full", 0)):
        mean_dice = np.where(np.arange(20) < n_bad, 0.70, 0.92) + rng.normal(0, 0.02, 20)
        parts.append(pd.DataFrame(dict(arm=arm, split_set="ip", vol=vols, n_seeds=3, mean_dice=mean_dice,
                                       disagreement=(1 - mean_dice) * 0.5 + rng.normal(0, 0.05, 20))))
    dis = pd.concat(parts)
    flags = K.flagging(dis).set_index("arm")
    assert list(flags.index) == ["ip_gate_few", "ip_gate_full", "ip_unet_few", "all_arms_pooled"]
    for arm in ("ip_gate_few", "ip_unet_few", "all_arms_pooled"):
        f = flags.loc[arm]
        assert 0.5 < f.auroc_lo <= f.auroc <= f.auroc_hi <= 1 and 0 < f.auroc_n_boot <= K.S.N_BOOT
    empty = flags.loc["ip_gate_full"]                                  # no volume below 0.85: no AUROC, no CI
    assert empty[["auroc", "auroc_lo", "auroc_hi"]].isna().all() and empty.auroc_n_boot == 0
    pooled = flags.loc["all_arms_pooled"]
    assert pooled.n_vols == 60 and pooled.n_below_085 == 14
    bad = dis.mean_dice < K.BAD_DICE                                   # the pooled CI resamples 20 volumes, not 60 rows
    by_volume = K.auroc_ci(dis.disagreement, bad, units=dis.vol)[:2]
    assert (pooled.auroc_lo, pooled.auroc_hi) == pytest.approx(by_volume)
    assert (pooled.auroc_lo, pooled.auroc_hi) != pytest.approx(K.auroc_ci(dis.disagreement, bad)[:2])
