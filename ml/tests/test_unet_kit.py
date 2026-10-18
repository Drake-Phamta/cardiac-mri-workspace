"""The UNet kit: queue config, authorization builder, holdout pipeline and aggregate builder.

Synthetic fixtures only (ml/tests/synth.py and runfixture.py patterns): no dataset bytes, no checkpoint, no GPU,
no subprocess. The pipeline is driven through its `runner` hook, so the commands are checked, never executed.
Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from ml import data as D
from ml import evaluate as E
from ml import holdout as H
from ml import manifests as MF
from ml import queue as Q
from ml.tests import runfixture, synth

TOOLS_ML = Path(__file__).resolve().parents[2] / "tools" / "ml"
sys.path.insert(0, str(TOOLS_ML))
import holdout_pipeline as HP               # noqa: E402
import make_holdout_authorization as MA     # noqa: E402
import results_aggregate as RA              # noqa: E402

QUEUE = Path(__file__).resolve().parents[1] / "configs" / "queues" / "unet_adr_ml_001.json"
OLD_CLOSED_AT = "2020-01-01T00:00:00+00:00"        # old, so `--authorized-at now` is always after it
SIGNED_AT = "2026-10-20T09:00:00+07:00"
U_RUNS = (("EXP-U-025", "25_percent"), ("EXP-U-050", "50_percent"), ("EXP-U-100", "100_percent"))
D_RUNS = (("EXP-D-025", "25_percent"), ("EXP-D-050", "50_percent"), ("EXP-D-100", "100_percent"))


# --- fixtures ----------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("cpkg"))


@pytest.fixture()
def kit(cpkg, tmp_path, monkeypatch):
    """The synthetic split is THE frozen split; tmp_path/repo holds the decision record, the frozen PP config and
    the gate record (the first authorization record, here for the D runs)."""
    frozen = runfixture.pin_frozen_split(monkeypatch, cpkg, tmp_path / "repo")
    repo = tmp_path / "repo"
    pp_config = repo / "gate" / "postprocess_config.frozen.json"
    pp_config.parent.mkdir(parents=True, exist_ok=True)
    pp_config.write_bytes(MF.json_bytes({"format": "ml-postprocess-config/1", "config_id": "PP-4"}))
    pp_sha = D.sha256_file(pp_config)
    gate = runfixture.write_authorization(
        repo / "gate" / "holdout_authorization.json",
        runfixture.authorization_record(frozen, [("EXP-D-025", "a" * 64), ("EXP-D-050", "b" * 64),
                                                 ("EXP-D-100", "c" * 64), ("EXP-D-PP", "c" * 64)],
                                        postprocessing_config_sha256=pp_sha, closed_at=OLD_CLOSED_AT))
    return SimpleNamespace(repo=repo, frozen=frozen, pp_config=pp_config, pp_sha=pp_sha, gate=gate,
                           runs=tmp_path / "runs", tmp=tmp_path, cpkg=cpkg)


def trained_run(kit, exp: str, subset: str) -> tuple[Path, str]:
    """A finished training run: run_state COMPLETE, run manifest COMPLETE, its own best.pt bytes; no holdout file."""
    run = runfixture.make_run_dir(kit.runs / exp, kit.cpkg, experiment_id=exp, subset=subset, partition="validation")
    best = run / "checkpoints" / "best.pt"
    best.write_bytes(f"synthetic checkpoint of {exp}".encode())
    sha = D.sha256_file(best)
    rm_path = run / "run_manifest.json"
    rm = json.loads(rm_path.read_text(encoding="utf-8"))
    rm["checkpoint"].update(sha256=sha, epoch=7)
    rm["model_family"] = "unet" if exp.startswith("EXP-U") else "dinov2"
    rm_path.write_bytes(MF.json_bytes(rm))
    (run / "config.json").write_bytes(MF.json_bytes({"experiment_id": exp}))
    (run / "run_state.json").write_bytes(MF.json_bytes({"status": "COMPLETE", "best_sha256": sha, "epochs_done": 3}))
    return run, sha


def make_u_runs(kit) -> dict[str, tuple[Path, str]]:
    return {e: trained_run(kit, e, s) for e, s in U_RUNS}


def sign(kit, runs, name="U.rec.json", **over):
    """Build the record with the tool itself, as the leader would."""
    out = kit.repo / "gate" / name
    args = ["--runs-root", str(kit.runs), "--experiments", *[e for e, _ in runs],
            "--authorized-by", "Synthetic Leader", "--authorized-at", SIGNED_AT, "--out", str(out),
            "--gate-record", str(kit.gate), "--frozen-config", str(kit.pp_config)]
    assert MA.main(args) == 0
    return out


def mark_holdout(run: Path, record_sha: str | None, *, predicted=True, scored=False, manifest=True, partial=False):
    """Minimal holdout footprint of a run, as ml.infer / ml.evaluate leave it (the pipeline reads presence and
    the record sha256 only)."""
    block = {"holdout_authorization": {"record_sha256": record_sha}} if record_sha else {"holdout_authorization": None}
    pred = run / "predictions" / PART
    if predicted:
        pred.mkdir(parents=True, exist_ok=True)
        (pred / "predictions_manifest.json").write_bytes(MF.json_bytes(block))
    if partial:
        pred.mkdir(parents=True, exist_ok=True)
        (pred / "progress.jsonl").write_text('{"event": "start"}\n', encoding="utf-8")
    if scored:
        ev = run / "evaluation" / PART
        ev.mkdir(parents=True, exist_ok=True)
        if manifest:
            (ev / "evaluation_manifest.json").write_bytes(MF.json_bytes(block))


PART = D.HOLDOUT_PARTITION


def config(kit, record, experiments=("EXP-U-025", "EXP-U-050", "EXP-U-100"), **over):
    kw = dict(record_path=record, runs_root=kit.runs, experiments=list(experiments), aggregate_base=None,
              aggregate_out=kit.tmp / "aggregate.json", require_clean_code=False, pp_config=kit.pp_config)
    kw.update(over)
    return HP.Config(**kw)


def d_counterparts_scored(kit):
    """EXP-D-* scored on the holdout under the first record, as on the leader's PC."""
    gate_sha = D.sha256_file(kit.gate)
    for e, s in D_RUNS:
        run = runfixture.make_run_dir(kit.runs / e, kit.cpkg, experiment_id=e, subset=s, partition="validation")
        mark_holdout(run, gate_sha, predicted=True, scored=True)


# --- the committed queue config ------------------------------------------------------------------------

def test_queue_config_is_the_adr_ml_001_unet_family():
    queue_id, configs, pairs = Q.load_queue(QUEUE, epochs=50, batch=8)
    assert queue_id == "unet-adr-ml-001"
    assert [c["experiment_id"] for c in configs] == ["EXP-U-025", "EXP-U-050", "EXP-U-100"]
    assert [c["subset"] for c in configs] == ["25_percent", "50_percent", "100_percent"]
    for c in configs:
        assert (c["variant"], c["img"], c["lr"], c["seed"], c["precision"], c["device"], c["num_workers"],
                c["require_clean_code"], c["epochs"], c["batch"]) == \
               ("unet_base32_depth4", 560, 0.0001, 2024, "bf16", "cuda", 0, True, 50, 8)
    assert pairs == [("EXP-U-025", "EXP-U-100"), ("EXP-U-050", "EXP-U-100"), ("EXP-U-025", "EXP-U-050")]


def test_queue_config_refuses_to_run_without_e_and_batch_and_holds_no_path():
    with pytest.raises(Exception, match="epochs must be int"):
        Q.load_queue(QUEUE)                              # SET_E / SET_BATCH are placeholders ml.train refuses
    text = QUEUE.read_text(encoding="utf-8")
    assert "SET_E" in text and "SET_BATCH" in text
    assert not re.search(r"[A-Za-z]:[\\/]|\\\\|/home/|/Users/", text)


# --- the authorization builder ---------------------------------------------------------------------------

def test_authorization_record_is_valid_and_copies_the_gate(kit, capsys):
    runs = make_u_runs(kit)
    out = sign(kit, U_RUNS)
    printed = capsys.readouterr().out
    record, sha = H.load_record(out)                       # strict JSON, every field and type
    assert sha == D.sha256_file(out) and f"record sha256 {sha}" in printed
    gate, _ = H.load_record(kit.gate)
    for field in ("closed_at", "decision_ref", "split_sha256", "postprocessing_config_sha256"):
        assert record[field] == gate[field]
    assert record["postprocessing_config_sha256"] == kit.pp_sha == D.sha256_file(kit.pp_config)
    assert record["authorized_by"] == "Synthetic Leader" and record["authorized_at"] == SIGNED_AT
    assert record["authorized_runs"] == [{"experiment_id": e, "checkpoint_sha256": runs[e][1]}
                                         for e, _ in U_RUNS]
    for e, (run, best_sha) in runs.items():
        assert best_sha == D.sha256_file(run / "checkpoints" / "best.pt")
        H.verify_record(record, split_sha256=kit.frozen, experiment_id=e, checkpoint_sha256=best_sha)
    raw = out.read_bytes()
    assert b"\r" not in raw and not raw.startswith(b"\xef\xbb\xbf") and raw.endswith(b"}\n")
    raw.decode("utf-8")


def test_authorization_never_invents_the_signer(kit, capsys):
    make_u_runs(kit)
    base = ["--runs-root", str(kit.runs), "--experiments", "EXP-U-025", "--out", str(kit.tmp / "x.json"),
            "--gate-record", str(kit.gate), "--frozen-config", str(kit.pp_config)]
    with pytest.raises(SystemExit):
        MA.main(base + ["--authorized-at", SIGNED_AT])                       # no --authorized-by
    with pytest.raises(SystemExit):
        MA.main(base + ["--authorized-by", "Someone"])                       # no --authorized-at
    for blank in ("", "   "):
        assert MA.main(base + ["--authorized-by", blank, "--authorized-at", SIGNED_AT]) == 2
    assert not (kit.tmp / "x.json").exists()
    assert MA.main(base + ["--authorized-by", "Someone", "--authorized-at", "now"]) == 0     # the word now is an argument
    assert json.loads((kit.tmp / "x.json").read_text(encoding="utf-8"))["authorized_by"] == "Someone"


def test_authorization_refuses_a_time_before_the_gate_closed(kit, capsys):
    make_u_runs(kit)
    late_gate = runfixture.write_authorization(
        kit.repo / "gate" / "late.json", runfixture.authorization_record(
            kit.frozen, [("EXP-D-025", "a" * 64)], postprocessing_config_sha256=kit.pp_sha,
            closed_at="2026-10-18T07:15:00+07:00"))
    out = kit.tmp / "early.json"
    assert MA.main(["--runs-root", str(kit.runs), "--experiments", "EXP-U-025", "--authorized-by", "N",
                    "--authorized-at", "2026-10-17T09:00:00+07:00", "--out", str(out),
                    "--gate-record", str(late_gate), "--frozen-config", str(kit.pp_config)]) == 2
    assert "authorized_at is before closed_at" in capsys.readouterr().out and not out.exists()


def _break(run: Path, how: str):
    if how == "state-running":
        p = run / "run_state.json"
        p.write_bytes(MF.json_bytes({"status": "RUNNING", "best_sha256": D.sha256_file(run / "checkpoints" / "best.pt")}))
    elif how == "no-state":
        (run / "run_state.json").unlink()
    elif how == "no-manifest":
        (run / "run_manifest.json").unlink()
    elif how == "no-best":
        (run / "checkpoints" / "best.pt").unlink()
    elif how == "best-replaced":
        (run / "checkpoints" / "best.pt").write_bytes(b"another checkpoint")
    elif how == "no-dir":
        run.rename(run.with_name(run.name + ".moved"))


@pytest.mark.parametrize("how, text", [
    ("state-running", "not COMPLETE"), ("no-state", "run_state.json is missing"),
    ("no-manifest", "run_manifest.json is missing"), ("no-best", "best.pt does not exist"),
    ("best-replaced", "replaced after training"), ("no-dir", "does not exist")])
def test_authorization_refuses_an_incomplete_or_altered_run(kit, capsys, how, text):
    runs = make_u_runs(kit)
    _break(runs["EXP-U-050"][0], how)
    out = kit.repo / "gate" / "U.rec.json"
    code = MA.main(["--runs-root", str(kit.runs), "--experiments", "EXP-U-025", "EXP-U-050", "EXP-U-100",
                    "--authorized-by", "N", "--authorized-at", SIGNED_AT, "--out", str(out),
                    "--gate-record", str(kit.gate), "--frozen-config", str(kit.pp_config)])
    printed = capsys.readouterr().out
    assert code == 2 and text in printed and "EXP-U-050" in printed and not out.exists()


@pytest.mark.parametrize("field, value, text", [
    ("training_fraction", 0.5, "is a 0.25 run but the run trained on fraction 0.5"),
    ("model_family", "dinov2", "names the UNet family but the run's model_family is 'dinov2'")])
def test_authorization_refuses_a_run_whose_id_says_something_else(kit, capsys, field, value, text):
    run, _ = trained_run(kit, "EXP-U-025", "25_percent")
    path = run / "run_manifest.json"
    rm = json.loads(path.read_text(encoding="utf-8"))
    rm[field] = value
    path.write_bytes(MF.json_bytes(rm))
    out = kit.tmp / "m.json"
    code = MA.main(["--run-dirs", str(run), "--authorized-by", "N", "--authorized-at", SIGNED_AT, "--out", str(out),
                    "--gate-record", str(kit.gate), "--frozen-config", str(kit.pp_config)])
    assert code == 2 and text in capsys.readouterr().out and not out.exists()


@pytest.mark.parametrize("kind, text", [
    ("scored", "already scored"), ("predicted", "already predicted"), ("partial", "partial holdout predictions")])
def test_authorization_refuses_a_run_that_was_already_used_on_the_holdout(kit, capsys, kind, text):
    runs = make_u_runs(kit)
    mark_holdout(runs["EXP-U-025"][0], "d" * 64, predicted=kind in ("scored", "predicted"),
                 scored=kind == "scored", partial=kind == "partial")
    out = kit.repo / "gate" / "U.rec.json"
    code = MA.main(["--runs-root", str(kit.runs), "--experiments", "EXP-U-025", "EXP-U-100",
                    "--authorized-by", "N", "--authorized-at", SIGNED_AT, "--out", str(out),
                    "--gate-record", str(kit.gate), "--frozen-config", str(kit.pp_config)])
    printed = capsys.readouterr().out
    assert code == 2 and text in printed and "EXP-U-025" in printed and not out.exists()


def test_authorization_refuses_a_checkpoint_the_gate_record_already_authorized(kit, capsys):
    run, sha = trained_run(kit, "EXP-U-025", "25_percent")
    other = runfixture.write_authorization(
        kit.repo / "gate" / "earlier.json", runfixture.authorization_record(
            kit.frozen, [("EXP-U-025", sha)], postprocessing_config_sha256=kit.pp_sha, closed_at=OLD_CLOSED_AT))
    code = MA.main(["--run-dirs", str(run), "--authorized-by", "N", "--authorized-at", SIGNED_AT,
                    "--out", str(kit.tmp / "again.json"), "--gate-record", str(kit.gate),
                    "--frozen-config", str(kit.pp_config), "--also-check-record", str(other)])
    assert code == 2 and "already authorized in earlier.json" in capsys.readouterr().out


def test_authorization_checks_the_frozen_config_and_never_overwrites(kit, capsys):
    make_u_runs(kit)
    kit.pp_config.write_bytes(b'{"config_id": "PP-9"}\n')          # not the config the gate record froze
    args = ["--runs-root", str(kit.runs), "--experiments", "EXP-U-025", "--authorized-by", "N",
            "--authorized-at", SIGNED_AT, "--out", str(kit.tmp / "o.json"), "--gate-record", str(kit.gate),
            "--frozen-config", str(kit.pp_config)]
    assert MA.main(args) == 2 and "the gate record freezes" in capsys.readouterr().out
    kit.pp_config.write_bytes(MF.json_bytes({"format": "ml-postprocess-config/1", "config_id": "PP-4"}))
    assert MA.main(args) == 0
    first = (kit.tmp / "o.json").read_bytes()
    assert MA.main(args) == 2 and "never overwritten" in capsys.readouterr().out
    assert (kit.tmp / "o.json").read_bytes() == first


# --- the pipeline: plan, dry run, refusals ---------------------------------------------------------------

EXPECTED_ORDER = [
    "EXP-U-025.infer", "EXP-U-025.evaluate", "EXP-U-050.infer", "EXP-U-050.evaluate",
    "EXP-U-100.infer", "EXP-U-100.evaluate",
    "EXP-U-025__vs__EXP-U-100.compare", "EXP-U-050__vs__EXP-U-100.compare", "EXP-U-025__vs__EXP-U-050.compare",
    "EXP-U-025__vs__EXP-D-025.compare", "EXP-U-050__vs__EXP-D-050.compare", "EXP-U-100__vs__EXP-D-100.compare",
    "EXP-U-025.export", "EXP-U-050.export", "EXP-U-100.export", "aggregate"]


def ready_for_unet(kit):
    make_u_runs(kit)
    d_counterparts_scored(kit)
    return sign(kit, U_RUNS)


def boom(step):
    raise AssertionError(f"a dry run executed {step.key}")


def test_dry_run_prints_the_exact_commands_in_order_and_runs_nothing(kit):
    record = ready_for_unet(kit)
    lines: list[str] = []
    code = HP.run_pipeline(config(kit, record, compare_family_pairs=True), dry_run=True, runner=boom,
                           echo=lines.append)
    assert code == 0, "\n".join(lines)
    plan = HP.build_plan(config(kit, record, compare_family_pairs=True))
    assert [s.key for s in plan.steps] == EXPECTED_ORDER
    assert not plan.problems and all(s.action == "run" for s in plan.steps)
    rec = os.path.abspath(record)
    by = {s.key: s.argv for s in plan.steps}
    run = lambda e: str(kit.runs / e)               # noqa: E731
    assert by["EXP-U-025.infer"][1:] == ["-u", "-m", "ml.infer", "--run-dir", run("EXP-U-025"), "--population",
                                         "holdout", "--holdout-authorization", rec]
    assert by["EXP-U-050.evaluate"][1:] == ["-u", "-m", "ml.evaluate", "run", "--run-dir", run("EXP-U-050"),
                                            "--population", "final_holdout", "--allow-holdout",
                                            "--holdout-authorization", rec]
    comparisons = plan.comparisons_dir
    assert by["EXP-U-025__vs__EXP-D-025.compare"][1:] == [
        "-u", "-m", "ml.evaluate", "compare", "--run-a", run("EXP-U-025"), "--run-b", run("EXP-D-025"),
        "--population", "final_holdout", "--out", str(comparisons / "EXP-U-025__vs__EXP-D-025.final_holdout.json")]
    assert by["EXP-U-025__vs__EXP-U-100.compare"][5:8] == ["--run-a", run("EXP-U-025"), "--run-b"]
    assert by["EXP-U-100.export"][1:] == ["-u", "-m", "ml.export_contract2", "--run-dir", run("EXP-U-100"),
                                          "--gate-split-01", "ACCEPTED", "--gate-ml-01", "ACCEPTED", "--validate"]
    assert plan.log_dir == kit.runs / f"_holdout_{D.sha256_file(record)[:8]}"
    shown = "\n".join(lines)
    for s in plan.steps:
        if s.argv:
            assert HP.display(s.argv) in shown
    assert not plan.log_dir.exists()                # a dry run writes nothing, not even the log directory
    assert not (kit.tmp / "aggregate.json").exists()


def test_without_the_family_flag_no_cross_family_pair_is_planned(kit):
    record = ready_for_unet(kit)
    keys = [s.key for s in HP.build_plan(config(kit, record)).steps]
    assert keys == [k for k in EXPECTED_ORDER if "EXP-D-" not in k]


def test_dry_run_explains_runs_that_are_not_on_this_machine(kit):
    d_counterparts_scored(kit)                      # the D runs are here, Khanh's U runs are not
    lines: list[str] = []
    code = HP.run_pipeline(config(kit, kit.gate, compare_family_pairs=True), dry_run=True, runner=boom,
                           echo=lines.append)
    shown = "\n".join(lines)
    assert code == 2
    for e, _ in U_RUNS:
        assert f"{e}: no run directory at" in shown and "copy the finished run directory" in shown
        assert f"{e} is not in the record's authorized_runs" in shown
    assert "REFUSED: 6 problem(s)" in shown and "python -u -m ml.infer --run-dir" in shown      # commands still shown
    assert "DRY RUN: the commands above are what would run once the problems are fixed." in shown


def test_a_run_whose_checkpoint_is_not_the_authorized_one_is_refused(kit):
    runs = make_u_runs(kit)
    d_counterparts_scored(kit)
    record = sign(kit, U_RUNS)
    (runs["EXP-U-050"][0] / "checkpoints" / "best.pt").write_bytes(b"swapped after signing")
    problems = HP.build_plan(config(kit, record)).problems
    assert any("EXP-U-050" in p and "replaced after training" in p for p in problems)


def test_scored_once_a_run_scored_under_another_record_is_refused(kit):
    record = ready_for_unet(kit)
    mark_holdout(kit.runs / "EXP-U-050", "e" * 64, predicted=True, scored=True)
    calls = []
    lines: list[str] = []
    code = HP.run_pipeline(config(kit, record), runner=lambda s: calls.append(s.key) or 0, echo=lines.append)
    shown = "\n".join(lines)
    assert code == 2 and not calls                  # nothing ran, not even the other runs' inference
    assert "EXP-U-050: already scored on the final holdout" in shown and "a run is scored once" in shown
    assert not HP.build_plan(config(kit, record)).log_dir.exists()


@pytest.mark.parametrize("record_sha, kw", [
    ("f" * 64, dict(predicted=True)),                                   # predicted under another record
    (None, dict(predicted=True)),                                       # predicted under none
    ("f" * 64, dict(predicted=True, scored=True, manifest=False)),      # an evaluation directory with no manifest
    (None, dict(predicted=True, scored=True))])                         # scored under none
def test_scored_once_predictions_under_another_record_or_none_are_refused(kit, record_sha, kw):
    record = ready_for_unet(kit)
    mark_holdout(kit.runs / "EXP-U-100", record_sha, **kw)
    problems = HP.build_plan(config(kit, record)).problems
    assert any(p.startswith("EXP-U-100") for p in problems), problems


def test_the_identical_command_resumes_where_it_stopped(kit):
    record = ready_for_unet(kit)
    sha = D.sha256_file(record)
    mark_holdout(kit.runs / "EXP-U-025", sha, predicted=True, scored=True)       # finished before the crash
    mark_holdout(kit.runs / "EXP-U-050", sha, predicted=True)                     # inference done, evaluation not
    mark_holdout(kit.runs / "EXP-U-100", None, predicted=False, partial=True)     # crashed during inference
    plan = HP.build_plan(config(kit, record))
    assert not plan.problems, plan.problems
    action = {s.key: (s.action, s.note) for s in plan.steps}
    assert action["EXP-U-025.infer"][0] == "skip" and action["EXP-U-025.evaluate"][0] == "skip"
    assert action["EXP-U-050.infer"][0] == "skip" and action["EXP-U-050.evaluate"][0] == "run"
    assert action["EXP-U-100.infer"] == ("run", "resumes the partial inference")
    assert action["EXP-U-100.evaluate"][0] == "run"


def test_an_unusable_aggregate_base_is_refused_before_anything_runs(kit):
    record = ready_for_unet(kit)
    bad = kit.tmp / "base.json"
    bad.write_text('{"format": "something-else"}', encoding="utf-8")
    problems = HP.build_plan(config(kit, record, aggregate_base=str(bad))).problems
    assert any("--aggregate-base base.json is not a cardiac-results-aggregate/1 file" in p for p in problems)
    missing = HP.build_plan(config(kit, record, aggregate_base=str(kit.tmp / "nowhere.json")))
    assert not missing.problems and any("a fresh aggregate will be written" in n for n in missing.notes)


def test_a_dirty_checkout_is_refused_before_anything_runs(kit, monkeypatch):
    record = ready_for_unet(kit)
    monkeypatch.setattr(MF, "code_version", lambda *a, **k: {"commit": "x", "dirty": True, "version": "git:x+dirty"})
    problems = HP.build_plan(config(kit, record, require_clean_code=True)).problems
    assert any("not a clean commit" in p for p in problems)


def test_a_comparison_counterpart_that_was_never_scored_is_refused(kit):
    runs = make_u_runs(kit)                         # no D runs on this machine
    record = sign(kit, U_RUNS)
    problems = HP.build_plan(config(kit, record, compare_family_pairs=True)).problems
    assert any("EXP-D-025 is not in --experiments and has no evaluation/final_holdout" in p for p in problems)
    assert not HP.build_plan(config(kit, record)).problems     # without the flag the family pairs are not needed
    assert runs


# --- the pipeline: execution -------------------------------------------------------------------------------

def test_the_pipeline_stops_at_the_first_failure_and_names_the_log(kit):
    record = ready_for_unet(kit)
    calls: list[str] = []

    def runner(step):
        calls.append(step.key)
        if step.key == "EXP-U-025.infer":
            mark_holdout(kit.runs / "EXP-U-025", D.sha256_file(record))
            return 0
        return 3                                    # EXP-U-025.evaluate fails

    lines: list[str] = []
    code = HP.run_pipeline(config(kit, record), runner=runner, echo=lines.append)
    shown = "\n".join(lines)
    plan = HP.build_plan(config(kit, record))
    assert code == 1 and calls == ["EXP-U-025.infer", "EXP-U-025.evaluate"]
    assert "STOPPED at EXP-U-025.evaluate: exit 3" in shown and str(plan.log_dir / "EXP-U-025.evaluate.log") in shown
    assert "IDENTICAL command" in shown and "FAILED" in shown
    events = [json.loads(x) for x in (plan.log_dir / "pipeline_log.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [e["event"] for e in events] == ["start", "ok", "failed"]
    assert not (kit.tmp / "aggregate.json").exists()


def test_a_step_that_exits_zero_without_its_output_is_a_failure(kit):
    record = ready_for_unet(kit)
    lines: list[str] = []
    code = HP.run_pipeline(config(kit, record), runner=lambda s: 0, echo=lines.append)
    assert code == 1 and "finished but did not write predictions_manifest.json" in "\n".join(lines)


def test_the_real_runner_logs_to_a_file_and_returns_the_exit_code(kit):
    log = kit.tmp / "logs" / "x.log"
    step = HP.Step("x.step", "evaluate", [sys.executable, "-c", "import sys; print('hello'); sys.exit(4)"], log)
    assert HP.subprocess_runner(step) == 4
    text = log.read_text(encoding="utf-8")
    assert text.startswith("=== x.step") and "hello" in text and "--- exit 4" in text


# one real synthetic evaluation, shared by the fake-effects pipeline test and the aggregate tests
@pytest.fixture(scope="module")
def evaluated(cpkg, tmp_path_factory):
    tmp = tmp_path_factory.mktemp("evaluated")
    mp = pytest.MonkeyPatch()
    try:
        frozen = runfixture.pin_frozen_split(mp, cpkg, tmp / "repo")
        record = runfixture.write_authorization(
            tmp / "rec.json", runfixture.authorization_record(
                frozen, [("EXP-U-025", runfixture.CHECKPOINT_SHA256), ("EXP-D-025", runfixture.CHECKPOINT_SHA256)],
                closed_at=OLD_CLOSED_AT))
        runs = {}
        for exp, shift in (("EXP-U-025", 1), ("EXP-D-025", 2)):
            run = runfixture.make_run_dir(tmp / exp, cpkg, experiment_id=exp, subset="25_percent",
                                          predictor=lambda ref, k=shift: np.roll(ref, k, axis=2),
                                          holdout_authorization=record)
            E.evaluate_run(run, PART, dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                           allow_holdout=True, split_manifest=cpkg["split_manifest_path"],
                           holdout_authorization=record, log=None)
            runs[exp] = run
        report = E.compare_runs(runs["EXP-U-025"], runs["EXP-D-025"], PART, split_manifest=cpkg["split_manifest_path"])
        comparison = MF.write_json_new(tmp / "cmp" / f"EXP-U-025__vs__EXP-D-025.{PART}.json", report)
    finally:
        mp.undo()
    return SimpleNamespace(runs=runs, comparison=comparison, report=report, tmp=tmp)


def patched_eval(src: Path, dst: Path, exp: str, record_sha: str | None = None):
    """A copy of a real synthetic evaluation, relabelled as `exp` (and as made under `record_sha`)."""
    shutil.copytree(src, dst, dirs_exist_ok=True)
    p = dst / "metrics_summary.json"
    doc = json.loads(p.read_text(encoding="utf-8"))
    doc["experiment_id"] = exp
    p.write_bytes(MF.json_bytes(doc))
    if record_sha is not None:
        m = dst / "evaluation_manifest.json"
        doc = json.loads(m.read_text(encoding="utf-8"))
        doc["holdout_authorization"] = {"record_sha256": record_sha}
        m.write_bytes(MF.json_bytes(doc))


def test_a_full_run_with_fake_effects_writes_the_summary_and_the_aggregate(kit, evaluated, capsys):
    record = ready_for_unet(kit)
    sha = D.sha256_file(record)
    for e, _ in D_RUNS:                             # the D counterparts need numbers for the aggregate
        patched_eval(evaluated.runs["EXP-D-025"] / "evaluation" / PART, kit.runs / e / "evaluation" / PART, e)
    template = {"EXP-U-025": evaluated.runs["EXP-U-025"] / "evaluation" / PART}
    calls: list[str] = []

    def runner(step):                               # the effects the real CLIs would have
        calls.append(step.key)
        exp = step.key.split(".")[0]
        if step.kind == "infer":
            mark_holdout(kit.runs / exp, sha)
        elif step.kind == "evaluate":
            patched_eval(template["EXP-U-025"], kit.runs / exp / "evaluation" / PART, exp, sha)
        elif step.kind == "compare":
            a, b = exp.split("__vs__")
            doc = dict(evaluated.report, run_a=a, run_b=b, population=PART, format="ml-paired-comparison/1")
            out = Path(step.argv[step.argv.index("--out") + 1])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(MF.json_bytes(doc))
        elif step.kind == "export":
            manifest = step.expect[0]
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_bytes(b"{}\n")
        return 0

    lines: list[str] = []
    code = HP.run_pipeline(config(kit, record, compare_family_pairs=True), runner=runner, echo=lines.append)
    shown = "\n".join(lines)
    assert code == 0, shown
    assert calls == [k for k in EXPECTED_ORDER if k != "aggregate"]
    assert re.search(r"EXP-U-100.export\s+run\s+ok", shown) and "EXP-U-025 -> EXP-D-025" in shown
    agg = json.loads((kit.tmp / "aggregate.json").read_text(encoding="utf-8"))
    assert agg["format"] == "cardiac-results-aggregate/1" and agg["n"] == 54
    assert [r["experiment_id"] for r in agg["runs"]] == ["EXP-U-025", "EXP-U-050", "EXP-U-100",
                                                         "EXP-D-025", "EXP-D-050", "EXP-D-100"]
    assert [r["training_fraction"] for r in agg["runs"]] == [0.25, 0.5, 1.0, 0.25, 0.5, 1.0]
    kinds = {(c["a"], c["b"]): c["kind"] for c in agg["comparisons"]}
    assert kinds[("EXP-U-025", "EXP-D-025")] == "cross_family" and kinds[("EXP-U-025", "EXP-U-100")] == "within_family"
    assert len(agg["comparisons"]) == 6
    # the identical command, run again, has nothing left to score: every inference/evaluation/compare is skipped
    again = HP.build_plan(config(kit, record, compare_family_pairs=True))
    assert [s.key for s in again.steps if s.action == "run"] == [f"EXP-U-{f}.export" for f in ("025", "050", "100")] + ["aggregate"]


def d_record(kit):
    """The DINOv2 scenario of Day 39: trained D runs and a record that also lists EXP-D-PP (same checkpoint as D-100)."""
    shas = {}
    for e, sub in D_RUNS:
        shas[e] = trained_run(kit, e, sub)[1]
    record = runfixture.write_authorization(
        kit.repo / "gate" / "D.rec.json", runfixture.authorization_record(
            kit.frozen, [*shas.items(), ("EXP-D-PP", shas["EXP-D-100"])], postprocessing_config_sha256=kit.pp_sha,
            closed_at=OLD_CLOSED_AT))
    return record, shas


def test_derive_pp_runs_between_inference_and_evaluation_and_needs_the_record(kit):
    """The DINOv2 record scenario (Day 39): EXP-D-PP from EXP-D-100's RAW predictions, an ablation pair, --source-run."""
    record, shas = d_record(kit)
    cfg = config(kit, record, experiments=("EXP-D-025", "EXP-D-050", "EXP-D-100"), derive_from="EXP-D-100")
    plan = HP.build_plan(cfg)
    assert not plan.problems, plan.problems
    assert [s.key for s in plan.steps] == [
        "EXP-D-025.infer", "EXP-D-025.evaluate", "EXP-D-050.infer", "EXP-D-050.evaluate",
        "EXP-D-100.infer", "EXP-D-PP.derive", "EXP-D-100.evaluate", "EXP-D-PP.evaluate",
        "EXP-D-025__vs__EXP-D-100.compare", "EXP-D-050__vs__EXP-D-100.compare", "EXP-D-025__vs__EXP-D-050.compare",
        "EXP-D-100__vs__EXP-D-PP.compare",
        "EXP-D-025.export", "EXP-D-050.export", "EXP-D-100.export", "EXP-D-PP.export", "aggregate"]
    by = {s.key: s.argv for s in plan.steps}
    assert by["EXP-D-PP.derive"][3:] == ["ml.postprocess", "derive", "--source-run", str(kit.runs / "EXP-D-100"),
                                         "--population", "holdout", "--config", str(kit.pp_config), "--out-run",
                                         str(kit.runs / "EXP-D-PP"), "--holdout-authorization",
                                         str(record.resolve())]
    assert by["EXP-D-100__vs__EXP-D-PP.compare"][-1] == "--allow-variant-mismatch"
    assert by["EXP-D-PP.export"][-2:] == ["--source-run", str(kit.runs / "EXP-D-100")]
    # a record that does not list EXP-D-PP, and a config that is not the one the record froze, are refused
    no_pp = runfixture.write_authorization(
        kit.repo / "gate" / "noPP.rec.json", runfixture.authorization_record(
            kit.frozen, list(shas.items()), postprocessing_config_sha256=kit.pp_sha, closed_at=OLD_CLOSED_AT))
    assert any("needs EXP-D-PP in the record" in p for p in HP.build_plan(config(
        kit, no_pp, experiments=("EXP-D-025", "EXP-D-050", "EXP-D-100"), derive_from="EXP-D-100")).problems)
    other = kit.tmp / "other_pp.json"
    other.write_bytes(b'{"config_id": "PP-9"}\n')
    assert any("EXP-D-PP: the record does not authorize this derivation" in p
               for p in HP.build_plan(config(kit, record, experiments=("EXP-D-025", "EXP-D-050", "EXP-D-100"),
                                             derive_from="EXP-D-100", pp_config=other)).problems)
    assert any("derived from EXP-D-100 only" in p for p in HP.build_plan(config(
        kit, record, experiments=("EXP-D-025",), derive_from="EXP-D-025")).problems)


def test_planned_commands_are_accepted_by_the_real_module_parsers(kit):
    """Each kind of planned command is run once against the real module CLI with nothing to work on (no data root,
    run directories that are synthetic and not the frozen split, so every one refuses before it reads anything).
    What is asserted is that argparse accepted the flags: a typo here would fail the leader's real run."""
    import subprocess
    record = ready_for_unet(kit)
    u = {s.key: s.argv for s in HP.build_plan(config(kit, record, compare_family_pairs=True)).steps}
    kit_d = SimpleNamespace(**dict(vars(kit), runs=kit.tmp / "runs_d"))          # its own runs root
    drecord, _ = d_record(kit_d)
    d = {s.key: s.argv for s in HP.build_plan(config(
        kit_d, drecord, experiments=("EXP-D-025", "EXP-D-050", "EXP-D-100"), derive_from="EXP-D-100")).steps}
    argvs = [u["EXP-U-025.infer"], u["EXP-U-025.evaluate"], u["EXP-U-025__vs__EXP-D-025.compare"],
             u["EXP-U-025.export"], d["EXP-D-PP.derive"], d["EXP-D-100__vs__EXP-D-PP.compare"],
             d["EXP-D-PP.export"]]
    assert "--allow-variant-mismatch" in argvs[5] and "--source-run" in argvs[6]
    env = dict(os.environ, CUDA_VISIBLE_DEVICES="-1", PYTHONIOENCODING="utf-8",
               CARDIAC_DATA_ROOT=str(kit.tmp / "no-data-here"), CARDIAC_RUNS_ROOT=str(kit.tmp / "no-runs-here"))
    for argv in argvs:
        done = subprocess.run(argv, cwd=str(TOOLS_ML.parents[1]), env=env, capture_output=True, text=True,
                              timeout=600)
        what = " ".join(argv[3:5])
        assert "usage:" not in done.stderr and "unrecognized arguments" not in done.stderr, (what, done.stderr)
        assert done.returncode in (0, 1, 2, 3), (what, done.returncode, done.stderr[-400:])


# --- the aggregate builder -----------------------------------------------------------------------------------

def test_aggregate_matches_the_metrics_summary_and_the_day39_layout(evaluated):
    run = evaluated.runs["EXP-U-025"]
    summary = json.loads((run / "evaluation" / PART / "metrics_summary.json").read_text(encoding="utf-8"))
    dice = summary["cohort"]["metrics"]["dice_3d"]
    entry = RA.run_entry(run)
    assert list(entry) == ["experiment_id", "training_fraction", "variant", "dice_mean", "dice_ci95", "dice_median",
                           "dice_q1", "dice_q3", "dice_sd", "iou_mean", "mean_slice_dice", "rve_percent_mean",
                           "sensitivity_dice_mean"]
    assert entry["experiment_id"] == "EXP-U-025" and entry["training_fraction"] == 0.25
    assert entry["variant"] == "RAW_PREDICTION"
    assert entry["dice_mean"] == round(dice["mean"], 4) and entry["dice_median"] == round(dice["median"], 4)
    assert entry["dice_sd"] == round(dice["std"], 4)
    assert entry["dice_ci95"] == [round(dice["ci95_mean"]["low"], 4), round(dice["ci95_mean"]["high"], 4)]
    assert entry["sensitivity_dice_mean"] == round(
        summary["holdout_slots"]["sensitivity_without_suspected_linkage"]["metrics"]["dice_3d"]["mean"], 4)
    assert entry["rve_percent_mean"] == round(summary["cohort"]["metrics"]["relative_volume_error_percent"]["mean"], 2)
    stats = evaluated.report["report"]["primary_all_holdout"]["paired_statistics"]
    comp = RA.comparison_entry(evaluated.comparison)
    assert comp == {"a": "EXP-U-025", "b": "EXP-D-025", "mean_delta": round(stats["mean"], 4),
                    "ci95": [round(stats["ci95_mean"]["low"], 4), round(stats["ci95_mean"]["high"], 4)],
                    "b_higher": stats["n_run_b_higher"], "a_higher": stats["n_run_a_higher"]}


def test_aggregate_extends_a_base_is_deterministic_and_holds_no_case_or_path(evaluated, tmp_path):
    dirs = list(evaluated.runs.values())
    fresh = RA.build_aggregate(dirs, [evaluated.comparison])
    assert fresh["n"] == 54 and fresh["metric_version"] == "ml-eval-1.0.0" and fresh["population"] == PART
    assert fresh["comparisons"][0]["kind"] == "cross_family"
    base = dict(fresh, runs=[dict(fresh["runs"][0], experiment_id="EXP-D-100", dice_mean=0.5),
                             dict(fresh["runs"][1], experiment_id="EXP-U-025", dice_mean=0.0)],
                comparisons=[], gate_img_01_validation=[{"id": "PP-0", "dice": 0.5}])
    merged = RA.build_aggregate(dirs, [evaluated.comparison], base=base)
    assert [r["experiment_id"] for r in merged["runs"]] == ["EXP-D-100", "EXP-U-025", "EXP-D-025"]
    assert merged["runs"][1]["dice_mean"] == fresh["runs"][0]["dice_mean"] != 0.0     # the new number replaced the base's
    assert merged["gate_img_01_validation"] == [{"id": "PP-0", "dice": 0.5}]
    out = tmp_path / "agg.json"
    first = RA.write_aggregate(fresh, out)
    assert RA.write_aggregate(RA.build_aggregate(dirs, [evaluated.comparison]), out) == first      # same bytes
    text = out.read_text(encoding="utf-8")
    assert "CASE_" not in text and str(evaluated.tmp) not in text and "\r" not in text and text.endswith("}\n")
    assert main_cli(["--run-dirs", *map(str, dirs), "--comparisons", str(evaluated.comparison.parent),
                     "--out", str(tmp_path / "cli.json")]) == 0
    assert json.loads((tmp_path / "cli.json").read_text(encoding="utf-8")) == fresh


def main_cli(argv):
    return RA.main(argv)


def test_aggregate_refuses_what_it_cannot_state_faithfully(evaluated, tmp_path):
    dirs = list(evaluated.runs.values())
    with pytest.raises(RA.AggregateError, match="not a run of this aggregate"):
        RA.build_aggregate(dirs[:1], [evaluated.comparison])             # the comparison names EXP-D-025
    with pytest.raises(RA.AggregateError, match="no evaluation/final_holdout"):
        RA.build_aggregate([tmp_path / "EXP-U-999"])
    with pytest.raises(RA.AggregateError, match="disagree on the population size"):
        RA.build_aggregate(dirs, base={"format": RA.FORMAT, "population": PART, "n": 53, "metric_version":
                                       "ml-eval-1.0.0", "runs": [], "comparisons": []})
    bad = tmp_path / "bad.final_holdout.json"
    bad.write_text(json.dumps({"format": "something-else"}), encoding="utf-8")
    with pytest.raises(RA.AggregateError, match="not an ml-paired-comparison/1"):
        RA.comparison_entry(bad)
    non = tmp_path / "non.final_holdout.json"
    doc = json.loads(evaluated.comparison.read_text(encoding="utf-8"))
    slot = doc["report"]["primary_all_holdout"]
    slot["comparability"] = {"comparable": False, "label": "NON_COMPARABLE", "failed_checks": ["same_population"]}
    slot["paired_statistics"] = None
    non.write_text(json.dumps(doc), encoding="utf-8")
    assert RA.comparison_entry(non) == {"a": "EXP-U-025", "b": "EXP-D-025", "comparable": False,
                                        "label": "NON_COMPARABLE", "failed_checks": ["same_population"]}


def test_the_kit_never_reads_a_case_or_trains():
    """The tools call the module CLIs; none of them opens a case, a mask or an image itself."""
    for name in ("holdout_pipeline", "make_holdout_authorization", "results_aggregate"):
        text = (TOOLS_ML / f"{name}.py").read_text(encoding="utf-8")
        code = re.sub(r'""".*?"""', "", text, flags=re.S)
        assert not re.search(r"\b(load_image|load_mask|read_nrrd_zyx|case_paths|CaseAllowlist)\b", code), name
        assert not re.search(r"from ml import (train|queue|infer|evaluate|models)\b|import ml\.(train|queue)", code), name
