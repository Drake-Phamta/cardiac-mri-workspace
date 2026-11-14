"""Holdout guardrails (#64 QA R-1 and N-1, plus N-2) on synthetic run directories.

Every refusal below must happen before a holdout reference mask is read, and must leave no
evaluation behind. Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import json

import pytest

from ml import data as D
from ml import evaluate as E
from ml import export_contract2 as X
from ml import holdout as H
from ml import infer as I
from ml import manifests as MF
from ml.tests import runfixture, synth

EXP = "EXP-H-001"
REPO_FROZEN_SHA = "c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d"


@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("cpkg"))


@pytest.fixture()
def pinned(cpkg, tmp_path, monkeypatch):
    """The synthetic split is THE frozen split for this test; tmp_path/repo holds the decision record."""
    return runfixture.pin_frozen_split(monkeypatch, cpkg, tmp_path / "repo")


def valid_record(**over):
    return runfixture.authorization_record(D.FROZEN_SPLIT_SHA256, [(EXP, runfixture.CHECKPOINT_SHA256)], **over)


@pytest.fixture()
def holdout(cpkg, tmp_path, pinned):
    """(run, record path): holdout predictions made under a valid record that authorizes this run."""
    auth = runfixture.write_authorization(tmp_path / "authorization.json", valid_record())
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    return run, auth


def evaluate(run, cpkg, auth, **kw):
    kw.setdefault("allow_holdout", True)
    kw.setdefault("split_manifest", cpkg["split_manifest_path"])
    return E.evaluate_run(run, D.HOLDOUT_PARTITION, dataset_manifest=cpkg["dataset"],
                          package_root=cpkg["package_root"], holdout_authorization=auth, log=None, **kw)


def cli(run, cpkg, *extra, population=D.HOLDOUT_PARTITION):
    return E.main(["run", "--run-dir", str(run), "--population", population,
                   "--dataset-manifest", str(cpkg["dataset_manifest_path"]),
                   "--package-root", str(cpkg["package_root"]),
                   "--split-manifest", str(cpkg["split_manifest_path"]), *extra])


def refused(run, partition=D.HOLDOUT_PARTITION) -> bool:
    return not (run / "evaluation" / partition).exists()


class ReadBeforeRefusal(BaseException):
    """A BaseException, so no `except Exception` (failed-case protocol, CLI refusal) can swallow it."""


def no_reads(monkeypatch):
    """Booby-trap the case loaders: a refusal must come before any case is read."""
    def trap(*a, **k):
        raise ReadBeforeRefusal("a case was read before the refusal")
    monkeypatch.setattr(D, "load_mask", trap)
    monkeypatch.setattr(D, "load_image", trap)


# --- the positive path ---------------------------------------------------------------------------

def test_a_valid_record_evaluates_the_synthetic_holdout(holdout, cpkg):
    run, auth = holdout
    out = evaluate(run, cpkg, auth)
    summary = json.loads((out / "metrics_summary.json").read_text(encoding="utf-8"))
    assert summary["holdout_slots"]["primary_all_holdout"]["intended_n"] == 54
    assert summary["holdout_slots"]["sensitivity_without_suspected_linkage"]["intended_n"] == 53
    em = json.loads((out / "evaluation_manifest.json").read_text(encoding="utf-8"))
    assert em["holdout_authorization"] == {"record_sha256": D.sha256_file(auth),
                                           "record": json.loads(auth.read_text(encoding="utf-8"))}
    assert em["frozen_split"] == {"pinned_sha256": D.FROZEN_SPLIT_SHA256, "split_sha256": D.FROZEN_SPLIT_SHA256,
                                  "is_frozen": True, "allow_unfrozen_split": False}


def test_the_cli_evaluates_the_holdout_with_a_valid_record(holdout, cpkg, capsys):
    run, auth = holdout
    assert cli(run, cpkg, "--allow-holdout", "--holdout-authorization", str(auth)) == 0
    assert "wrote" in capsys.readouterr().out and not refused(run)


def test_a_record_with_bom_notes_and_a_frozen_morphology_sha_is_accepted(cpkg, tmp_path, pinned):
    record = valid_record(postprocessing_config_sha256="a" * 64, notes="RAW and PROCESSED share this record",
                          closed_at="2026-10-03T02:00:00Z")
    auth = tmp_path / "bom.json"
    auth.write_bytes(b"\xef\xbb\xbf" + MF.json_bytes(record))                        # a PowerShell-style BOM
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    assert evaluate(run, cpkg, auth).is_dir()


# --- N-1: refusals -------------------------------------------------------------------------------

@pytest.mark.parametrize("raw", [b"yes", b'"yes"', b"[]", b"", b'{"gate": ', b"\xff\xfe{\x00}\x00",
                                 b'{"gate": "GATE-IMG-01", "gate": "GATE-IMG-01"}', b'{"x": NaN}'],
                         ids=["bare-yes", "json-string-yes", "list", "empty", "truncated", "utf16",
                              "duplicate-key", "nan"])
def test_n1_a_record_that_is_not_a_json_object_is_refused(holdout, cpkg, tmp_path, monkeypatch, raw):
    run, _ = holdout
    bad = tmp_path / "bad.json"
    bad.write_bytes(raw)
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError):
        evaluate(run, cpkg, bad)
    assert refused(run)


def test_n1_c3_a_bare_yes_no_longer_opens_the_holdout(holdout, cpkg, tmp_path, monkeypatch, capsys):
    """QA probe C3: --allow-holdout with the record "yes" gave exit 0 and a 54-case evaluation."""
    run, auth = holdout
    yes = tmp_path / "yes.json"
    yes.write_text("yes", encoding="utf-8")
    no_reads(monkeypatch)
    assert cli(run, cpkg, "--allow-holdout", "--holdout-authorization", str(yes)) == 2
    assert "REFUSED: HoldoutAuthorizationError" in capsys.readouterr().out
    pm_path = run / "predictions" / "final_holdout" / "predictions_manifest.json"     # "yes" inside the manifest
    pm = json.loads(pm_path.read_text(encoding="utf-8"))
    pm["holdout_authorization"] = "yes"
    pm_path.write_bytes(MF.json_bytes(pm))
    with pytest.raises(H.HoldoutAuthorizationError, match="not made under this authorization record"):
        evaluate(run, cpkg, auth)
    assert refused(run)


@pytest.mark.parametrize("over, match", [({"gate_status": "OPEN"}, "not CLOSED"),
                                         ({"gate_status": "closed"}, "not CLOSED"),
                                         ({"gate": "GATE-ML-01"}, "gate must be")])
def test_n1_the_gate_must_be_closed(cpkg, tmp_path, pinned, monkeypatch, over, match):
    auth = runfixture.write_authorization(tmp_path / "auth.json", valid_record(**over))
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError, match=match):
        evaluate(run, cpkg, auth)
    assert refused(run)


@pytest.mark.parametrize("split_sha", ["f" * 64, REPO_FROZEN_SHA], ids=["other-split", "repo-split-not-this-one"])
def test_n1_the_record_split_must_be_the_frozen_split(cpkg, tmp_path, pinned, monkeypatch, split_sha):
    auth = runfixture.write_authorization(tmp_path / "auth.json", valid_record(split_sha256=split_sha))
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError, match="not the frozen split"):
        evaluate(run, cpkg, auth)
    assert refused(run)


@pytest.mark.parametrize("runs", [[("EXP-H-OTHER", runfixture.CHECKPOINT_SHA256)], [(EXP, "e" * 64)]],
                         ids=["other-experiment", "other-checkpoint"])
def test_n1_this_run_must_be_in_authorized_runs(cpkg, tmp_path, pinned, monkeypatch, runs):
    record = runfixture.authorization_record(D.FROZEN_SPLIT_SHA256, runs)
    auth = runfixture.write_authorization(tmp_path / "auth.json", record)
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError, match="authorized_runs"):
        evaluate(run, cpkg, auth)
    assert refused(run)


def test_n1_a_replaced_best_checkpoint_is_refused(holdout, cpkg, monkeypatch):
    run, auth = holdout
    (run / "checkpoints" / "best.pt").write_bytes(b"another checkpoint")
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError, match="authorized_runs"):
        evaluate(run, cpkg, auth)
    assert refused(run)


def test_n1_predictions_made_under_another_record_are_refused(holdout, cpkg, tmp_path, monkeypatch):
    run, _ = holdout
    other = runfixture.write_authorization(tmp_path / "other.json", valid_record(authorized_by="Someone Else"))
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError, match="not made under this authorization record"):
        evaluate(run, cpkg, other)
    assert refused(run)


def test_n1_the_decision_record_must_exist_in_the_checkout(cpkg, tmp_path, pinned, monkeypatch):
    auth = runfixture.write_authorization(tmp_path / "auth.json",
                                          valid_record(decision_ref="decisions/not_committed.md"))
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutAuthorizationError, match="decision_ref"):
        evaluate(run, cpkg, auth)
    assert refused(run)


def _drop(key):
    def f(r):
        del r[key]
    return f


def _set(key, value):
    def f(r):
        r[key] = value
    return f


def _run_field(key, value):
    def f(r):
        r["authorized_runs"][0][key] = value
    return f


MALFORMED = {
    **{f"missing-{k}": _drop(k) for k in H.FIELDS},
    "unknown-field": _set("approved", True),
    "format-wrong": _set("format", "ml-holdout-authorization/0"),
    "gate_status-bool": _set("gate_status", True),
    "closed_at-number": _set("closed_at", 20261003),
    "closed_at-not-iso": _set("closed_at", "yesterday"),
    "closed_at-no-offset": _set("closed_at", "2026-10-03T09:00:00"),
    "authorized-before-closed": _set("authorized_at", "2026-10-02T09:00:00+07:00"),
    "decision_ref-absolute": _set("decision_ref", "C:/decisions/x.md"),
    "decision_ref-backslash": _set("decision_ref", "decisions\\x.md"),
    "decision_ref-dotdot": _set("decision_ref", "../x.md"),
    "decision_ref-null": _set("decision_ref", None),
    "split_sha256-upper": _set("split_sha256", "C5" * 32),
    "split_sha256-short": _set("split_sha256", "c5c65a09"),
    "postprocessing-not-sha": _set("postprocessing_config_sha256", "none"),
    "authorized_runs-empty": _set("authorized_runs", []),
    "authorized_runs-string": _set("authorized_runs", EXP),
    "authorized_runs-no-sha": _set("authorized_runs", [{"experiment_id": EXP}]),
    "authorized_runs-extra-key": _run_field("epoch", 3),
    "authorized_runs-sha-bad": _run_field("checkpoint_sha256", "zz"),
    "authorized_runs-id-blank": _run_field("experiment_id", " "),
    "authorized_runs-duplicate": lambda r: r["authorized_runs"].append(dict(r["authorized_runs"][0])),
    "authorized_by-empty": _set("authorized_by", ""),
    "authorized_by-list": _set("authorized_by", ["Khanh"]),
    "notes-number": _set("notes", 5),
}


@pytest.mark.parametrize("name", sorted(MALFORMED))
def test_n1_missing_or_mistyped_fields_are_refused(pinned, name):
    record = json.loads(json.dumps(valid_record()))
    MALFORMED[name](record)
    with pytest.raises(H.HoldoutAuthorizationError):
        H.validate_record(record)
    H.validate_record(valid_record())                                         # the unmutated record is valid


def test_n1_a_malformed_record_is_refused_end_to_end_by_the_cli(cpkg, tmp_path, pinned, monkeypatch, capsys):
    record = valid_record()
    del record["authorized_by"]
    auth = runfixture.write_authorization(tmp_path / "auth.json", record)
    run = runfixture.make_run_dir(tmp_path / EXP, cpkg, experiment_id=EXP, holdout_authorization=auth)
    no_reads(monkeypatch)
    assert cli(run, cpkg, "--allow-holdout", "--holdout-authorization", str(auth)) == 2
    assert "missing fields ['authorized_by']" in capsys.readouterr().out
    assert refused(run)


def test_c1_c2_c4_cli_probes_still_refuse(holdout, cpkg, monkeypatch, capsys):
    run, auth = holdout
    no_reads(monkeypatch)
    assert cli(run, cpkg, "--holdout-authorization", str(auth)) == 2                   # C1: no --allow-holdout
    assert cli(run, cpkg, "--allow-holdout") == 2                                       # C2: no record
    assert cli(run, cpkg, "--holdout-authorization", str(auth), population="validation") == 2   # C4: wrong population
    out = capsys.readouterr().out
    assert out.count("REFUSED") == 3
    assert refused(run)


# --- R-1: the frozen split only -------------------------------------------------------------------

def test_r1_the_default_is_the_repository_frozen_split():
    assert D.FROZEN_SPLIT_SHA256 == REPO_FROZEN_SHA
    for fn in (E.evaluate_run, E.compare_runs, I.predict_population, X.build_manifest, X.export):
        assert fn.__kwdefaults__["split_manifest"] == D.DEFAULT_SPLIT_MANIFEST, fn.__name__
    if D.DEFAULT_SPLIT_MANIFEST.exists():
        assert MF.require_frozen_split(D.DEFAULT_SPLIT_MANIFEST) == REPO_FROZEN_SHA


@pytest.mark.parametrize("argv", [["run", "--run-dir", "r", "--population", "validation"],
                                  ["compare", "--run-a", "a", "--run-b", "b", "--population", "validation"]])
def test_r1_the_evaluate_cli_has_no_unfrozen_split_switch(argv):
    with pytest.raises(SystemExit):                     # argparse: unrecognized arguments (exit 2)
        E.main(argv + ["--allow-unfrozen-split"])


def _forged_validation_run(cpkg, tmp_path):
    """QA H9: a run whose split copy moves a holdout case into validation, every in-run sha updated."""
    moved = synth.C_HOLDOUT[0]
    forged = json.loads(json.dumps(cpkg["split"]))
    forged["partitions"]["final_holdout"]["case_ids"].remove(moved)
    forged["partitions"]["validation"]["case_ids"].append(moved)
    forged_path = tmp_path / "forged_split.json"
    forged_path.write_bytes(MF.json_bytes(forged))
    run = runfixture.make_run_dir(tmp_path / "EXP-H9", dict(cpkg, split=forged, split_manifest_path=forged_path),
                                  experiment_id="EXP-H9", partition="validation")
    return run, forged_path


def test_r1_h9b_c6_naming_the_runs_own_split_copy_is_refused(cpkg, tmp_path, monkeypatch, capsys):
    """QA probes H9b / C6: --split-manifest <run>/manifests/split_manifest.json scored CASE_0101."""
    run, forged_path = _forged_validation_run(cpkg, tmp_path)
    copy = run / "manifests" / "split_manifest.json"
    no_reads(monkeypatch)
    assert E.main(["run", "--run-dir", str(run), "--population", "validation",
                   "--dataset-manifest", str(cpkg["dataset_manifest_path"]),
                   "--package-root", str(cpkg["package_root"]), "--split-manifest", str(copy)]) == 2
    assert "REFUSED: SplitMismatchError" in capsys.readouterr().out
    with pytest.raises(MF.SplitMismatchError, match="inside the run directory"):     # even with the API test switch
        E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                       split_manifest=copy, allow_unfrozen_split=True, log=None)
    with pytest.raises(MF.SplitMismatchError, match="not the frozen split"):        # a copy outside the run
        E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                       split_manifest=forged_path, log=None)
    with pytest.raises(MF.SplitMismatchError):
        E.compare_runs(run, run, "validation", split_manifest=copy, allow_unfrozen_split=True)
    assert refused(run, "validation")


def test_r1_a_relabelled_split_is_refused(cpkg, tmp_path, pinned, monkeypatch, capsys):
    """Relabelling partitions (validation <-> final_holdout) changes the bytes, so the pin refuses it."""
    relabelled = json.loads(json.dumps(cpkg["split"]))
    parts = relabelled["partitions"]
    parts["validation"], parts["final_holdout"] = parts["final_holdout"], parts["validation"]
    path = tmp_path / "relabelled_split.json"
    path.write_bytes(MF.json_bytes(relabelled))
    run = runfixture.make_run_dir(tmp_path / "EXP-RL", cpkg, experiment_id="EXP-RL", partition="validation")
    no_reads(monkeypatch)
    assert E.main(["run", "--run-dir", str(run), "--population", "validation",
                   "--dataset-manifest", str(cpkg["dataset_manifest_path"]),
                   "--package-root", str(cpkg["package_root"]), "--split-manifest", str(path)]) == 2
    assert "is not the frozen split" in capsys.readouterr().out
    assert refused(run, "validation")


def test_r1_final_holdout_never_accepts_the_test_switch(holdout, cpkg, monkeypatch):
    run, auth = holdout
    no_reads(monkeypatch)
    with pytest.raises(H.HoldoutSplitError):
        evaluate(run, cpkg, auth, allow_unfrozen_split=True)
    with pytest.raises(D.HoldoutAccessError):
        E.compare_runs(run, run, D.HOLDOUT_PARTITION, split_manifest=cpkg["split_manifest_path"],
                       allow_unfrozen_split=True)
    with pytest.raises(D.HoldoutAccessError):
        I.predict_population(run, D.HOLDOUT_PARTITION, holdout_authorization=auth,
                             split_manifest=cpkg["split_manifest_path"], allow_unfrozen_split=True, log=None)
    assert refused(run)


# --- N-2: a relabelled population role --------------------------------------------------------------

def test_n2_a_relabelled_predictions_population_role_is_refused(holdout, cpkg, tmp_path, monkeypatch):
    run, auth = holdout
    pm_path = run / "predictions" / "final_holdout" / "predictions_manifest.json"
    pm = json.loads(pm_path.read_text(encoding="utf-8"))
    pm["population"]["role"] = "VALIDATION"
    pm_path.write_bytes(MF.json_bytes(pm))
    val = runfixture.make_run_dir(tmp_path / "EXP-N2", cpkg, experiment_id="EXP-N2", partition="validation")
    no_reads(monkeypatch)
    with pytest.raises(ValueError, match="role"):
        evaluate(run, cpkg, auth)
    vpm_path = val / "predictions" / "validation" / "predictions_manifest.json"
    vpm = json.loads(vpm_path.read_text(encoding="utf-8"))
    vpm["population"]["role"] = "FINAL_HOLDOUT"
    vpm_path.write_bytes(MF.json_bytes(vpm))
    with pytest.raises(ValueError, match="role"):
        E.evaluate_run(val, "validation", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                       split_manifest=cpkg["split_manifest_path"], log=None)
    assert refused(run) and refused(val, "validation")
