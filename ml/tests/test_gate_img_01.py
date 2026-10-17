"""GATE-IMG-01 selection (ml/gate_img_01.py): the pre-declared rule, the refusal of any population but
validation, and a full run on a synthetic validation run directory.

Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import json
import re

import numpy as np
import pytest

from ml import data as D
from ml import evaluate as E
from ml import gate_img_01 as G
from ml import manifests as MF
from ml import postprocess as PP
from ml.tests import runfixture, synth

ELIGIBLE = PP.ELIGIBLE_IDS


# --- the rule ------------------------------------------------------------------------------------

def test_highest_mean_dice_wins():
    means = {"PP-0": 0.95, "PP-1": 0.90, "PP-2": 0.80, "PP-3": 0.93, "PP-4": 0.70, "PP-5": 0.60}
    got = G.select_winner(means, ELIGIBLE)
    assert got["winner"] == "PP-3" and got["tied"] == ["PP-3"] and got["best"] == 0.93


def test_pp0_is_never_eligible_even_when_it_is_best():
    means = {"PP-0": 0.99, "PP-1": 0.50, "PP-2": 0.40, "PP-3": 0.30, "PP-4": 0.20, "PP-5": 0.10}
    assert G.select_winner(means, ELIGIBLE)["winner"] == "PP-1"


def test_a_tie_within_0_001_goes_to_the_lower_id():
    means = {"PP-0": 0.5, "PP-1": 0.8000, "PP-2": 0.8010, "PP-3": 0.8001, "PP-4": 0.2, "PP-5": 0.8008}
    got = G.select_winner(means, ELIGIBLE)
    assert got["best"] == 0.8010 and got["tied"] == ["PP-1", "PP-2", "PP-3", "PP-5"]   # PP-4 is far below
    assert got["winner"] == "PP-1"
    just_outside = {"PP-0": 0.5, "PP-1": 0.8000, "PP-2": 0.8011, "PP-3": 0.1, "PP-4": 0.1, "PP-5": 0.1}
    assert G.select_winner(just_outside, ELIGIBLE)["winner"] == "PP-2"      # 0.0011 apart: not a tie


def test_change_against_pp0_is_worded_improves_worsens_unchanged():
    assert G.change_word(0.0123) == "improves" and G.change_word(-0.0123) == "worsens"
    assert G.change_word(0.0) == "unchanged" and G.change_word(0.001) == "unchanged"
    assert G.change_word(-0.001) == "unchanged" and G.change_word(0.0011) == "improves"


# --- refusals ---------------------------------------------------------------------------------

@pytest.mark.parametrize("population", ["holdout", "final_holdout", "train", "", "VALIDATION"])
def test_any_population_but_validation_is_refused_before_anything_is_read(population, tmp_path):
    with pytest.raises(G.GateRefused):
        G.run_gate(tmp_path / "does-not-exist", population, selection_dir=tmp_path / "sel", detail_dir=tmp_path / "det")
    assert not (tmp_path / "sel").exists() and not (tmp_path / "det").exists()


def test_cli_refuses_the_holdout(tmp_path, capsys):
    assert G.main(["--source-run", str(tmp_path / "x"), "--population", "holdout"]) == 2
    assert "validation population only" in capsys.readouterr().out
    assert G.main(["--source-run", str(tmp_path / "x"), "--population", "final_holdout"]) == 2


def test_the_module_never_builds_a_holdout_allowlist():
    source = open(G.__file__, encoding="utf-8").read()
    assert "for_holdout" not in source and "allow_holdout" not in source


# --- a full run on a synthetic validation run ---------------------------------------------------------

@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("gpkg"))


def speck(ref):
    pred = runfixture.predict_by_shift(ref).astype(np.uint8)
    pred[0, 0, 0] = 1
    return pred


@pytest.fixture()
def gate_run(cpkg, tmp_path, monkeypatch):
    runfixture.pin_frozen_split(monkeypatch, cpkg, tmp_path / "repo")
    clean = {"commit": "a" * 40, "dirty": False, "version": "git:" + "a" * 40}
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: dict(clean))
    monkeypatch.setattr(PP, "module_code_version", lambda *a, **k: dict(clean))
    src = runfixture.make_run_dir(tmp_path / "EXP-D-100", cpkg, experiment_id="EXP-D-100", subset="100_percent",
                                  partition="validation", predictor=speck)
    E.evaluate_run(src, "validation", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                   split_manifest=cpkg["split_manifest_path"], log=None)
    return src


def run(gate_run, cpkg, tmp_path, **kw):
    return G.run_gate(gate_run, "validation", selection_dir=tmp_path / "sel", detail_dir=tmp_path / "detail",
                      split_manifest=cpkg["split_manifest_path"], dataset_manifest=cpkg["dataset"],
                      package_root=cpkg["package_root"], log=None, **kw)


def test_gate_run_writes_the_record_the_frozen_config_and_the_detail(gate_run, cpkg, tmp_path):
    summary = run(gate_run, cpkg, tmp_path)
    sel = summary["selection"]
    # the winner is the lowest id among the candidates within 0.001 of the best eligible mean
    means = {c: v["mean_dice_3d"] for c, v in summary["candidates"].items()}
    best = max(means[c] for c in ELIGIBLE)
    assert sel["winner"] == min((c for c in ELIGIBLE if best - means[c] <= 0.001 + 1e-12),
                                key=lambda c: int(c[-1]))
    # the speck is a false positive: removing it (PP-1) cannot lower the Dice below PP-0
    assert means["PP-1"] > means["PP-0"] and sel["change_vs_pp0"] in ("improves", "unchanged")
    assert summary["pp0_reproduces_recorded_raw_evaluation"] is True
    assert summary["intended_n"] == 2 and all(c["successful_n"] == 2 for c in summary["candidates"].values())
    # PP-0's mean is exactly the recorded raw evaluation's mean
    recorded = json.loads((gate_run / "evaluation/validation/per_case_metrics.json").read_text(encoding="utf-8"))
    assert means["PP-0"] == float(np.mean([c["dice_3d"] for c in recorded["cases"]]))
    # files
    frozen = tmp_path / "sel" / "postprocess_config.frozen.json"
    config, sha = PP.load_frozen_config(frozen)
    assert config["config_id"] == sel["winner"] and sha == summary["frozen_config_sha256"] == PP.config_sha256(frozen)
    md = (tmp_path / "sel" / "SELECTION.md").read_text(encoding="utf-8")
    assert sha in md and summary["predictions_manifest_sha256"] in md and "ml-eval-1.0.0" in md
    assert re.search(r"improves|worsens|unchanged", md) and "No final-holdout case was read" in md
    assert f"Winner: {sel['winner']}" in md
    assert "python -m ml.gate_img_01 --source-run <CARDIAC_RUNS_ROOT>/EXP-D-100 --population validation" in md
    # no absolute path and no per-case value in the committed text
    assert not re.search(r"[A-Za-z]:[\\/]", md) and str(tmp_path) not in md
    for case_id in D.partition_case_ids(D.load_split_manifest(cpkg["split_manifest_path"]), "validation"):
        assert case_id not in md
    for cid in PP.CONFIGS:                                              # per-case detail only outside the selection dir
        detail = json.loads((tmp_path / "detail" / f"per_case_{cid}.json").read_text(encoding="utf-8"))
        assert len(detail["cases"]) == 2 and detail["candidate"] == cid
    assert (tmp_path / "detail" / "gate_run.json").is_file()
    assert sorted(p.name for p in (tmp_path / "sel").iterdir()) == ["SELECTION.md", "postprocess_config.frozen.json"]


def test_gate_scoring_equals_derive_and_evaluate_for_the_winner(gate_run, cpkg, tmp_path):
    summary = run(gate_run, cpkg, tmp_path)
    winner = summary["selection"]["winner"]
    out = tmp_path / "derived"
    PP.derive_run(gate_run, "validation", tmp_path / "sel" / "postprocess_config.frozen.json", out,
                  split_manifest=cpkg["split_manifest_path"], log=None)
    E.evaluate_run(out, "validation", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                   split_manifest=cpkg["split_manifest_path"], log=None)
    derived = json.loads((out / "evaluation/validation/per_case_metrics.json").read_text(encoding="utf-8"))
    assert float(np.mean([c["dice_3d"] for c in derived["cases"]])) == summary["candidates"][winner]["mean_dice_3d"]


def test_gate_refuses_to_overwrite_and_a_dirty_tree(gate_run, cpkg, tmp_path, monkeypatch):
    run(gate_run, cpkg, tmp_path)
    with pytest.raises(FileExistsError):
        run(gate_run, cpkg, tmp_path)
    with pytest.raises(FileExistsError):
        G.run_gate(gate_run, "validation", selection_dir=tmp_path / "sel2", detail_dir=tmp_path / "detail",
                   split_manifest=cpkg["split_manifest_path"], dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], log=None)
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: {"commit": "b" * 40, "dirty": True,
                                                             "version": "git:" + "b" * 40 + "+dirty"})
    with pytest.raises(RuntimeError, match="clean commit"):
        G.run_gate(gate_run, "validation", selection_dir=tmp_path / "sel3", detail_dir=tmp_path / "detail3",
                   split_manifest=cpkg["split_manifest_path"], dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], log=None)


def test_gate_only_takes_the_raw_predictions_of_exp_d_100(cpkg, tmp_path, monkeypatch):
    runfixture.pin_frozen_split(monkeypatch, cpkg, tmp_path / "repo")
    clean = {"commit": "a" * 40, "dirty": False, "version": "git:" + "a" * 40}
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: dict(clean))
    monkeypatch.setattr(PP, "module_code_version", lambda *a, **k: dict(clean))
    other = runfixture.make_run_dir(tmp_path / "EXP-D-050", cpkg, experiment_id="EXP-D-050", subset="50_percent",
                                    partition="validation")
    with pytest.raises(ValueError, match="EXP-D-100"):
        G.run_gate(other, "validation", selection_dir=tmp_path / "sel", detail_dir=tmp_path / "det",
                   split_manifest=cpkg["split_manifest_path"], dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], log=None)
