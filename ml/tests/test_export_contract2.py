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
from ml.tests import runfixture, synth


@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("cpkg"))


@pytest.fixture()
def evaluated_run(cpkg, tmp_path):
    run = runfixture.make_run_dir(tmp_path / "EXP-D-050", cpkg, experiment_id="EXP-D-050",
                                  subset="50_percent")
    E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], allow_holdout=True, log=None)
    return run


def test_export_passes_the_contract2_validator(evaluated_run):
    manifest = X.build_manifest(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")
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


def test_written_manifest_passes_the_validator_cli(evaluated_run):
    path = X.export(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")
    proc = subprocess.run([sys.executable, str(X.VALIDATOR), "--manifest", str(path),
                           "--root", str(evaluated_run)], capture_output=True, text=True,
                          encoding="utf-8")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert proc.stdout.startswith("PASS")
    with pytest.raises(FileExistsError):
        X.export(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")


def test_open_gates_are_recorded_and_refused_by_the_validator(evaluated_run):
    manifest = X.build_manifest(evaluated_run, gate_split_01="OPEN", gate_ml_01="OPEN")
    assert manifest["gates"] == {"gate_split_01": "OPEN", "gate_ml_01": "OPEN"}
    result = X.validate(manifest, evaluated_run)
    assert result["status"] == "FAIL" and result["code"] == "GATE_SPLIT_01_NOT_ACCEPTED"
    with pytest.raises(X.ExportError):
        X.build_manifest(evaluated_run, gate_split_01="MAYBE", gate_ml_01="OPEN")


def test_cli_requires_explicit_gates(evaluated_run, capsys):
    with pytest.raises(SystemExit):
        X.main(["--run-dir", str(evaluated_run)])
    assert X.main(["--run-dir", str(evaluated_run), "--gate-split-01", "OPEN",
                   "--gate-ml-01", "OPEN", "--validate"]) == 2
    assert "GATE_SPLIT_01_NOT_ACCEPTED" in capsys.readouterr().out


def test_a_changed_artifact_is_caught(evaluated_run):
    target = evaluated_run / "evaluation" / "final_holdout" / "per_case_metrics.json"
    target.write_bytes(target.read_bytes() + b" ")
    with pytest.raises(X.ExportError):
        X.build_manifest(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")


def test_failed_cases_block_the_export(cpkg, tmp_path):
    run = runfixture.make_run_dir(tmp_path / "EXP-U-100", cpkg, experiment_id="EXP-U-100",
                                  subset="100_percent", fail_cases=(synth.C_HOLDOUT[3],))
    E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                   package_root=cpkg["package_root"], allow_holdout=True, log=None)
    with pytest.raises(X.ExportError, match="FAILED"):
        X.build_manifest(run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")


def test_predictions_from_another_checkpoint_block_the_export(evaluated_run):
    rm_path = evaluated_run / "run_manifest.json"
    rm = json.loads(rm_path.read_text(encoding="utf-8"))
    rm["checkpoint"]["sha256"] = "0" * 64
    rm_path.write_text(json.dumps(rm), encoding="utf-8")
    with pytest.raises(X.ExportError, match="checkpoint"):
        X.build_manifest(evaluated_run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")
