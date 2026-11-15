import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import pytest

import evaluate_ml
from conftest import CODE, TINY_SPLITS

N_VOLS = len(TINY_SPLITS["val"]) + len(TINY_SPLITS["test"])


def noisy(gt, rng):
    """The reference with about 5 % of its voxels flipped."""
    flip = rng.random(gt.shape) < 0.05
    return (gt ^ flip) * 255


@pytest.fixture(scope="module")
def runs(tmp_path_factory, fake_run):
    root = tmp_path_factory.mktemp("runs")
    fake_run(root / "runs" / "gate_few_s0")                                              # night-1 style config
    fake_run(root / "runs_ml" / "lc_n4_unet_s1", prob=noisy, model="unet", seed=1, split_file="work/splits/n4.json",
             loss="bce_dice", aug="none", fusion="token")
    fake_run(root / "runs_ml" / "still_training", finished=False)
    return root


def test_describe_run_gives_night1_runs_the_default_options(runs):
    info = evaluate_ml.describe_run(runs / "runs" / "gate_few_s0")
    assert info["source"] == "runs" and info["run"] == "gate_few_s0"
    assert (info["fusion"], info["loss"], info["aug"], info["split_set"]) == ("token", "bce_dice", "none", "ip")


def test_describe_run_names_the_split_file_and_drops_fusion_for_unet(runs):
    info = evaluate_ml.describe_run(runs / "runs_ml" / "lc_n4_unet_s1")
    assert (info["model"], info["seed"], info["split_set"], info["fusion"]) == ("unet", 1, "n4", "none")


def test_find_runs_skips_unfinished_runs_and_takes_single_folders(runs):
    finished, unfinished = evaluate_ml.find_runs([runs / "runs", runs / "runs_ml"])
    assert [r.name for r in finished] == ["gate_few_s0", "lc_n4_unet_s1"]
    assert [r.name for r in unfinished] == ["still_training"]
    finished, _ = evaluate_ml.find_runs([runs / "runs" / "gate_few_s0"])
    assert [r.name for r in finished] == ["gate_few_s0"]


def run_script(work, args):
    env = dict(os.environ, LA_WORK=str(work), CUDA_VISIBLE_DEVICES="-1", PYTHONIOENCODING="utf-8")
    done = subprocess.run([sys.executable, "-X", "utf8", str(CODE / "evaluate_ml.py"), *args], env=env,
                          capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    return done.stdout


def test_scores_every_run_split_variant_and_volume(tiny_work, runs, tmp_path):
    out = run_script(tiny_work, [str(runs / "runs"), str(runs / "runs_ml"), "--workers", "2", "--out", str(tmp_path)])
    assert "still_training" in out
    df = pd.read_csv(tmp_path / "per_case.csv")
    assert len(df) == 2 * N_VOLS * 4                                  # 2 runs x volumes x 4 variants
    # closing erodes the first and last slice of these 3-slice volumes, so it is left out here
    perfect = df[(df.run == "gate_few_s0") & (df.pp != "lcc_fill_close")]
    assert np.allclose(perfect.dice, 1.0) and np.allclose(perfect.hd95, 0.0)
    flipped = df[(df.run == "lc_n4_unet_s1") & (df.pp == "raw")]
    assert (flipped.dice < 0.95).all()
    assert set(df.split) == {"val", "test"} and set(df.split_set) == {"ip", "n4"}
    summary = pd.read_csv(tmp_path / "summary.csv")
    assert len(summary) == 2 * 2 * 4 and (summary.n_vols == 1).all()


def test_second_call_reuses_the_scores_of_unchanged_runs(tiny_work, runs, tmp_path):
    run_script(tiny_work, [str(runs / "runs"), "--workers", "1", "--out", str(tmp_path)])
    first = pd.read_csv(tmp_path / "per_case.csv")
    out = run_script(tiny_work, [str(runs / "runs"), "--workers", "1", "--out", str(tmp_path)])
    assert "1 from per_run/, 0 to score" in out
    pd.testing.assert_frame_equal(pd.read_csv(tmp_path / "per_case.csv"), first)


def test_cache_is_ignored_when_it_lacks_a_variant_or_predates_the_run(runs, tmp_path):
    run_dir = runs / "runs" / "gate_few_s0"
    path = tmp_path / "cache.csv"
    pd.DataFrame(dict(split=["val", "test"], pp=["raw", "raw"])).to_csv(path, index=False)
    assert evaluate_ml.read_cache(path, run_dir, ["val", "test"], ["raw"]) is not None
    assert evaluate_ml.read_cache(path, run_dir, ["val", "test"], ["raw", "lcc"]) is None
    old = (run_dir / "pred_test.npz").stat().st_mtime - 10
    os.utime(path, (old, old))
    assert evaluate_ml.read_cache(path, run_dir, ["val", "test"], ["raw"]) is None


def test_classical_run_is_scored_without_post_processing(tiny_work, fake_run, tmp_path):
    run_dir = fake_run(tmp_path / "runs" / "classical", finished=False)
    (run_dir / "config.json").unlink()
    (run_dir / "params.json").write_text(json.dumps({}))
    assert evaluate_ml.find_runs([tmp_path / "runs"])[0] == [run_dir]
    run_script(tiny_work, [str(tmp_path / "runs"), "--out", str(tmp_path / "out")])
    df = pd.read_csv(tmp_path / "out" / "per_case.csv")
    assert set(df.pp) == {"raw"} and set(df.model) == {"classical"} and len(df) == N_VOLS
