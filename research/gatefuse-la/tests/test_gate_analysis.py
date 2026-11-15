from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import config as C
import gate_analysis as G
from conftest import SCORE_DEFAULTS


@pytest.mark.parametrize("extra, expected", [
    (dict(), "token_w128"),
    (dict(width=32), "token_w32"),
    (dict(fusion="scalar"), "scalar"),
    (dict(fusion="channel", labels="full", n_train_vols=72), "channel"),
    (dict(fusion="channel", width=64), None),
    (dict(model="concat", fusion="none"), "concat"),
    (dict(model="unet", fusion="none"), None),
    (dict(labels="full", n_train_vols=8, split_set="n8"), None),           # learning-curve schedule control
    (dict(split_set="fold0_few"), None),
])
def test_gate_arm(extra, expected):
    assert G.gate_arm(SimpleNamespace(**dict(SCORE_DEFAULTS, **extra))) == expected


def token_gate(canvas):
    """0.9 on the 8 x 8 tokens that are mostly atrium, 0.1 elsewhere."""
    z = canvas.shape[0]
    share = canvas.reshape(z, 32, 8, 32, 8).mean(axis=(2, 4))
    return np.where(share > 0.5, 0.9, 0.1)


def test_as_grid_handles_every_gate_shape():
    assert G.as_grid(np.zeros((5, 32, 32))).shape == (5, 32, 32)
    assert G.as_grid(np.zeros((5, 1, 1))).shape == (5, 1, 1)
    channel = np.tile([0.2, 0.6], (5, 16))
    assert np.allclose(G.as_grid(channel), 0.4) and G.as_grid(channel).shape == (5, 1, 1)


def test_gate_regions_follow_the_atrium(tiny_work, fake_run, tmp_path, monkeypatch):
    monkeypatch.setattr(C, "PREP_DIR", tiny_work / "prep")
    runs = {"token": fake_run(tmp_path / "token", gate=token_gate),
            "scalar": fake_run(tmp_path / "scalar", gate=lambda c: np.full((len(c), 1, 1), 0.3)),
            "channel": fake_run(tmp_path / "channel", gate=lambda c: np.tile([0.2, 0.6], (len(c), 16)))}
    reg = G.gate_regions(runs)
    # 3-slice volumes erode away entirely, so "inside" is empty here
    assert np.isnan(reg["token"]["inside"])
    assert reg["token"]["boundary"] > reg["token"]["near"] > reg["token"]["far"] == pytest.approx(0.1, abs=0.01)
    assert all(reg["scalar"][k] == pytest.approx(0.3, abs=1e-3) for k in ("boundary", "near", "far"))
    assert all(reg["channel"][k] == pytest.approx(0.4, abs=1e-3) for k in ("boundary", "near", "far"))


def fake_scores(make_scores, rng):
    hard = rng.normal(0, 0.03, 20)
    means = {"token_w128": 0.86, "scalar": 0.85, "channel": 0.855, "concat": 0.87, "dinov3": 0.855,
             "mricore": 0.85, "token_w32": 0.858, "token_w64": 0.859, "token_w256": 0.861}
    parts = []
    for arm, m in means.items():
        if arm.startswith("token_w"):
            fields = dict(width=int(arm[7:]))
        elif arm in ("scalar", "channel"):
            fields = dict(fusion=arm)
        else:
            fields = dict(model=arm, fusion="none")
        parts.append(make_scores(m + hard + rng.normal(0, 0.002, 20), source="runs_ml", **fields))
        if arm in ("token_w128", "concat"):
            parts.append(make_scores(m + 0.05 + hard, labels="full", n_train_vols=72, iters=4000, **fields))
    return pd.concat(parts, ignore_index=True)


def test_main_tests_fusion_and_width_and_reads_run_folders(make_scores, fake_run, tiny_work, tmp_path, monkeypatch):
    monkeypatch.setattr(C, "PREP_DIR", tiny_work / "prep")
    scores = fake_scores(make_scores, np.random.default_rng(0))
    path = tmp_path / "per_case.csv"
    scores.to_csv(path, index=False)
    # folders for the token gate and the scalar gate at 8 volumes only; the rest is reported missing
    for run in scores[(scores.labels == "few") & scores.fusion.isin(["token", "scalar"]) & (scores.width == 128)] \
            .run.unique():
        fake_run(tmp_path / "runs_ml" / run, gate=token_gate, n_params=297594 if "token" in run else 297000)
    G.main(["--scores", str(path), "--runs-root", str(tmp_path), "--out", str(tmp_path / "out")])
    out = tmp_path / "out"
    arms = pd.read_csv(out / "arms.csv")
    assert len(arms) == 9 + 2
    fried = pd.read_csv(out / "friedman.csv").set_index("family")
    assert fried.loc["fusion_few", "k"] == 6 and fried.loc["width_few", "k"] == 4
    comp = pd.read_csv(out / "comparisons.csv")
    fusion = comp[comp.family == "fusion_few"]
    assert (fusion.a == "token_w128").all() and len(fusion) == 5 and (fusion.family_size == 5).all()
    assert fusion.set_index("b").loc["scalar", "diff"] == pytest.approx(0.01, abs=0.002)
    width = comp[comp.family == "width_few"].set_index("a")
    assert width.within_0005.all()                                  # widths differ by <= 0.002 here
    full = comp[comp.family == "fusion_full"]
    assert list(full.b) == ["concat"] and (full.family_size == 5).all()
    eff = pd.read_csv(out / "efficiency.csv").set_index("arm")
    assert eff.loc["token_w128", "n_params"] == 297594 and eff.loc["token_w128", "ms_per_iter"] == pytest.approx(100)
    reg = pd.read_csv(out / "gate_regions.csv")
    assert set(reg.arm) == {"token_w128", "scalar"} and (reg.n_runs == 3).all()
    for name in ("fusion.png", "width.png", "gate_regions.png"):
        assert (out / name).exists(), name
