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
