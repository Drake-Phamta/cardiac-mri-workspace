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
def evaluated_run(cpkg, tmp_path, clean_code):
    run = runfixture.make_run_dir(tmp_path / "EXP-D-050", cpkg, experiment_id="EXP-D-050",
                                  subset="50_percent")
    E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], allow_holdout=True,
                   split_manifest=cpkg["split_manifest_path"], log=None)
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


def test_dirty_code_is_refused_unless_explicitly_allowed_and_recorded(cpkg, tmp_path, monkeypatch):
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: {"commit": "b" * 40, "dirty": True,
                                                             "version": "git:" + "b" * 40 + "+dirty"})
    run = runfixture.make_run_dir(tmp_path / "EXP-D-025", cpkg, experiment_id="EXP-D-025")
    E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                   allow_holdout=True, split_manifest=cpkg["split_manifest_path"], log=None)
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


def test_failed_cases_block_the_export(cpkg, tmp_path, clean_code):
    run = runfixture.make_run_dir(tmp_path / "EXP-U-100", cpkg, experiment_id="EXP-U-100",
                                  subset="100_percent", fail_cases=(synth.C_HOLDOUT[3],))
    E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], allow_holdout=True,
                   split_manifest=cpkg["split_manifest_path"], log=None)
    with pytest.raises(X.ExportError, match="FAILED"):
        build(run, cpkg)


def test_predictions_from_another_checkpoint_block_the_export(evaluated_run, cpkg):
    rm_path = evaluated_run / "run_manifest.json"
    rm = json.loads(rm_path.read_text(encoding="utf-8"))
    rm["checkpoint"]["sha256"] = "0" * 64
    rm_path.write_text(json.dumps(rm), encoding="utf-8")
    with pytest.raises(X.ExportError, match="checkpoint"):
        build(evaluated_run, cpkg)
