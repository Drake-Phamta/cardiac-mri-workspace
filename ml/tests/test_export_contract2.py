"""Contract 2 export on a synthetic run directory, validated by the repository's own
contracts/ingestion/contract2_experiment_artifact/validate_contract2.py.

Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import json
import subprocess
import sys

import pytest

from ml import data as D
from ml import evaluate as E
from ml import export_contract2 as X
from ml import manifests as MF
from ml.tests import runfixture, synth

CLEAN = {"commit": "a" * 40, "dirty": False, "version": "git:" + "a" * 40}


@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("cpkg"))


@pytest.fixture()
def clean_code(monkeypatch):
    """The evaluation records the code version of this checkout; pin it to a clean commit so
    the tests do not depend on whether the working tree has uncommitted edits."""
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: dict(CLEAN))


@pytest.fixture()
def pinned(cpkg, tmp_path, monkeypatch):
    """The synthetic split is THE frozen split for this test (the exporter is holdout-only and has no
    unfrozen-split switch); tmp_path/repo holds the GATE-IMG-01 decision record."""
    return runfixture.pin_frozen_split(monkeypatch, cpkg, tmp_path / "repo")


def holdout_run(cpkg, tmp_path, experiment_id, **kw):
    """A synthetic run whose holdout predictions were made under a valid authorization record,
    and that record's path."""
    auth = runfixture.write_authorization(tmp_path / f"{experiment_id}.authorization.json",
                                          runfixture.authorization_record(
                                              D.FROZEN_SPLIT_SHA256, [(experiment_id, runfixture.CHECKPOINT_SHA256)]))
    run = runfixture.make_run_dir(tmp_path / experiment_id, cpkg, experiment_id=experiment_id,
                                  holdout_authorization=auth, **kw)
    return run, auth


def evaluate_holdout(run, cpkg, auth):
    return E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                          package_root=cpkg["package_root"], allow_holdout=True, holdout_authorization=auth,
                          split_manifest=cpkg["split_manifest_path"], log=None)


@pytest.fixture()
def evaluated_run(cpkg, tmp_path, clean_code, pinned):
    run, auth = holdout_run(cpkg, tmp_path, "EXP-D-050", subset="50_percent")
    evaluate_holdout(run, cpkg, auth)
    return run


def build(run, cpkg, **kw):
    kw.setdefault("gate_split_01", "ACCEPTED")
    kw.setdefault("gate_ml_01", "ACCEPTED")
    return X.build_manifest(run, split_manifest=cpkg["split_manifest_path"], **kw)


def test_export_passes_the_contract2_validator(evaluated_run, cpkg):
    manifest = build(evaluated_run, cpkg)
    result = X.validate(manifest, evaluated_run)
    assert result["status"] == "PASS", result
    assert result["analysis_runs"] == 54
    exp = manifest["experiment"]
    assert exp["num_test_cases"] == 54 and exp["training_fraction"] == 0.5
    assert exp["postprocessing_version"] == "none" and exp["prediction_variant"] == "RAW_PREDICTION"
    assert exp["evaluation_metric_version"] == E.EVALUATION_METRIC_VERSION
    assert manifest["manifest_id"] == "exp-d-050-raw-holdout"
    kinds = [a["kind"] for a in manifest["artifacts"]]
    assert kinds.count("RAW_PREDICTION_MASK") == kinds.count("METRIC_SET") == 54
    assert {"METRICS_SUMMARY", "PER_CASE_METRICS", "PER_SLICE_METRICS"} <= set(kinds)


def test_written_manifest_passes_the_validator_cli(evaluated_run, cpkg):
    path = X.export(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED",
                    split_manifest=cpkg["split_manifest_path"])
    proc = subprocess.run([sys.executable, str(X.VALIDATOR), "--manifest", str(path),
                           "--root", str(evaluated_run)], capture_output=True, text=True,
                          encoding="utf-8")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert proc.stdout.startswith("PASS")
    record = json.loads(path.with_name(path.stem + ".export.json").read_text(encoding="utf-8"))
    assert record["allow_dirty_code"] is False and record["dirty_code_versions"] == {}
    assert record["frozen_split_sha256"] == D.sha256_file(cpkg["split_manifest_path"])
    pm = json.loads((evaluated_run / "predictions" / "final_holdout" / "predictions_manifest.json")
                    .read_text(encoding="utf-8"))
    assert record["holdout_authorization_record_sha256"] == pm["holdout_authorization"]["record_sha256"]
    with pytest.raises(FileExistsError):
        X.export(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED",
                 split_manifest=cpkg["split_manifest_path"])


def test_open_gates_are_recorded_and_refused_by_the_validator(evaluated_run, cpkg):
    manifest = build(evaluated_run, cpkg, gate_split_01="OPEN", gate_ml_01="OPEN")
    assert manifest["gates"] == {"gate_split_01": "OPEN", "gate_ml_01": "OPEN"}
    result = X.validate(manifest, evaluated_run)
    assert result["status"] == "FAIL" and result["code"] == "GATE_SPLIT_01_NOT_ACCEPTED"
    with pytest.raises(X.ExportError):
        build(evaluated_run, cpkg, gate_split_01="MAYBE", gate_ml_01="OPEN")


def test_cli_requires_explicit_gates(evaluated_run, cpkg, capsys):
    with pytest.raises(SystemExit):
        X.main(["--run-dir", str(evaluated_run)])
    assert X.main(["--run-dir", str(evaluated_run), "--gate-split-01", "OPEN", "--gate-ml-01", "OPEN",
                   "--split-manifest", str(cpkg["split_manifest_path"]), "--validate"]) == 2
    assert "GATE_SPLIT_01_NOT_ACCEPTED" in capsys.readouterr().out


def test_export_refuses_a_split_other_than_the_frozen_one(evaluated_run, cpkg, tmp_path, capsys):
    # default frozen split = the repository's manifest, which the synthetic run did not use
    if D.DEFAULT_SPLIT_MANIFEST.exists():
        with pytest.raises(X.ExportError, match="frozen split"):
            X.build_manifest(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")
    # H9 for the exporter: a split copy that moves a holdout case, with the run manifest's sha updated
    forged = json.loads(json.dumps(cpkg["split"]))
    moved = forged["partitions"]["final_holdout"]["case_ids"].pop()
    forged["partitions"]["validation"]["case_ids"].append(moved)
    copy = evaluated_run / "manifests" / "split_manifest.json"
    copy.write_bytes(MF.json_bytes(forged))
    rm_path = evaluated_run / "run_manifest.json"
    rm = json.loads(rm_path.read_text(encoding="utf-8"))
    rm["split_manifest"]["sha256"] = D.sha256_file(copy)
    rm_path.write_bytes(MF.json_bytes(rm))
    with pytest.raises(X.ExportError, match="frozen split"):
        build(evaluated_run, cpkg)
    assert X.main(["--run-dir", str(evaluated_run), "--gate-split-01", "ACCEPTED", "--gate-ml-01",
                   "ACCEPTED", "--split-manifest", str(cpkg["split_manifest_path"])]) == 2
    assert "EXPORT REFUSED" in capsys.readouterr().out


def test_dirty_code_is_refused_unless_explicitly_allowed_and_recorded(cpkg, tmp_path, monkeypatch, pinned):
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: {"commit": "b" * 40, "dirty": True,
                                                             "version": "git:" + "b" * 40 + "+dirty"})
    run, auth = holdout_run(cpkg, tmp_path, "EXP-D-025")
    evaluate_holdout(run, cpkg, auth)
    with pytest.raises(X.ExportError, match="clean commits"):
        build(run, cpkg)
    path = X.export(run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED",
                    split_manifest=cpkg["split_manifest_path"], allow_dirty_code=True)
    record = json.loads(path.with_name(path.stem + ".export.json").read_text(encoding="utf-8"))
    assert record["allow_dirty_code"] is True
    assert record["dirty_code_versions"] == {"evaluation_code_version": "git:" + "b" * 40 + "+dirty"}
    assert not MF.is_clean_code_version("UNKNOWN") and not MF.is_clean_code_version("MIXED:git:a;git:b")


def test_a_changed_artifact_is_caught(evaluated_run, cpkg):
    target = evaluated_run / "evaluation" / "final_holdout" / "per_case_metrics.json"
    target.write_bytes(target.read_bytes() + b" ")
    with pytest.raises(X.ExportError):
        build(evaluated_run, cpkg)


def test_failed_cases_block_the_export(cpkg, tmp_path, clean_code, pinned):
    run, auth = holdout_run(cpkg, tmp_path, "EXP-U-100", subset="100_percent", fail_cases=(synth.C_HOLDOUT[3],))
    evaluate_holdout(run, cpkg, auth)
    with pytest.raises(X.ExportError, match="FAILED"):
        build(run, cpkg)


def test_export_refuses_the_test_switch_and_a_split_inside_the_run(evaluated_run, cpkg):
    """#64 R-1: the exporter is final_holdout only, so it has no unfrozen-split switch at all."""
    with pytest.raises(X.ExportError, match="TEST-ONLY"):
        build(evaluated_run, cpkg, allow_unfrozen_split=True)
    with pytest.raises(X.ExportError, match="inside the run directory"):
        X.build_manifest(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED",
                         split_manifest=evaluated_run / "manifests" / "split_manifest.json")
    with pytest.raises(SystemExit):
        X.main(["--run-dir", str(evaluated_run), "--gate-split-01", "ACCEPTED", "--gate-ml-01", "ACCEPTED",
                "--split-manifest", str(cpkg["split_manifest_path"]), "--allow-unfrozen-split"])


@pytest.mark.parametrize("embedded", ["yes", {"confirm_frozen_morphology_sha256": "0" * 64}, None])
def test_export_refuses_a_presence_only_authorization(evaluated_run, cpkg, embedded):
    """#64 N-1 at the exporter: the predictions manifest must carry a structured record that
    authorizes this run - a presence-only value ("yes", the old 64 zeros) is refused."""
    pm_path = evaluated_run / "predictions" / "final_holdout" / "predictions_manifest.json"
    pm = json.loads(pm_path.read_text(encoding="utf-8"))
    pm["holdout_authorization"] = embedded
    pm_path.write_bytes(MF.json_bytes(pm))
    em_path = evaluated_run / "evaluation" / "final_holdout" / "evaluation_manifest.json"
    em = json.loads(em_path.read_text(encoding="utf-8"))
    em["predictions_manifest"]["sha256"] = D.sha256_file(pm_path)            # keep the sha chain intact
    em_path.write_bytes(MF.json_bytes(em))
    with pytest.raises(X.ExportError, match="holdout authorization"):
        build(evaluated_run, cpkg)


def test_export_refuses_a_record_that_does_not_authorize_the_run(evaluated_run, cpkg):
    pm_path = evaluated_run / "predictions" / "final_holdout" / "predictions_manifest.json"
    pm = json.loads(pm_path.read_text(encoding="utf-8"))
    pm["holdout_authorization"]["record"]["authorized_runs"] = [
        {"experiment_id": "EXP-OTHER", "checkpoint_sha256": runfixture.CHECKPOINT_SHA256}]
    pm_path.write_bytes(MF.json_bytes(pm))
    em_path = evaluated_run / "evaluation" / "final_holdout" / "evaluation_manifest.json"
    em = json.loads(em_path.read_text(encoding="utf-8"))
    em["predictions_manifest"]["sha256"] = D.sha256_file(pm_path)
    em_path.write_bytes(MF.json_bytes(em))
    with pytest.raises(X.ExportError, match="authorized_runs"):
        build(evaluated_run, cpkg)


def test_export_refuses_an_evaluation_under_another_record(evaluated_run, cpkg):
    em_path = evaluated_run / "evaluation" / "final_holdout" / "evaluation_manifest.json"
    em = json.loads(em_path.read_text(encoding="utf-8"))
    em["holdout_authorization"] = None
    em_path.write_bytes(MF.json_bytes(em))
    with pytest.raises(X.ExportError, match="same|under the predictions"):
        build(evaluated_run, cpkg)


@pytest.mark.parametrize("which", ["predictions", "evaluation"])
def test_export_refuses_a_relabelled_population_role(evaluated_run, cpkg, which):
    """N-2 at the exporter: a population labelled anything but FINAL_HOLDOUT is refused."""
    if which == "predictions":
        path = evaluated_run / "predictions" / "final_holdout" / "predictions_manifest.json"
    else:
        path = evaluated_run / "evaluation" / "final_holdout" / "evaluation_manifest.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["population"]["role"] = "VALIDATION"
    path.write_bytes(MF.json_bytes(doc))
    if which == "predictions":
        em_path = evaluated_run / "evaluation" / "final_holdout" / "evaluation_manifest.json"
        em = json.loads(em_path.read_text(encoding="utf-8"))
        em["predictions_manifest"]["sha256"] = D.sha256_file(path)
        em_path.write_bytes(MF.json_bytes(em))
    with pytest.raises(X.ExportError, match="FINAL_HOLDOUT"):
        build(evaluated_run, cpkg)


def test_predictions_from_another_checkpoint_block_the_export(evaluated_run, cpkg):
    rm_path = evaluated_run / "run_manifest.json"
    rm = json.loads(rm_path.read_text(encoding="utf-8"))
    rm["checkpoint"]["sha256"] = "0" * 64
    rm_path.write_text(json.dumps(rm), encoding="utf-8")
    with pytest.raises(X.ExportError, match="checkpoint"):
        build(evaluated_run, cpkg)
