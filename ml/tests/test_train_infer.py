"""End-to-end tests for ml.train, ml.infer and ml.queue on synthetic data (CPU, img=112).

Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

from ml import data as D
from ml import evaluate as E
from ml import export_contract2 as X
from ml import infer as I
from ml import queue as Q
from ml import train as T
from ml.tests import synth

IMG = 112


def make_config(pkg, root, **over):
    cfg = {"experiment_id": "EXP-T-001", "variant": "unet_base16_depth4", "subset": "50_percent",
           "epochs": 1, "batch": 4, "lr": 1e-4, "img": IMG, "seed": 2024, "precision": "fp32",
           "device": "cpu",
           "paths": {"split_manifest": str(pkg["split_manifest_path"]),
                     "dataset_manifest": str(pkg["dataset_manifest_path"]),
                     "package_root": str(pkg["package_root"]),
                     "cache_root": str(root / "cache"), "runs_root": str(root / "runs")}}
    cfg.update(over)
    return cfg


def read_log(run_dir):
    return [json.loads(x) for x in (run_dir / "train_log.jsonl").read_text(encoding="utf-8").splitlines() if x]


@pytest.fixture(scope="module")
def pkg(tmp_path_factory):
    return synth.make_package(tmp_path_factory.mktemp("pkg"))


@pytest.fixture(scope="module")
def trained(pkg, tmp_path_factory):
    """One complete tiny run, trained with holdout access booby-trapped."""
    root = tmp_path_factory.mktemp("work")
    cfg = make_config(pkg, root)
    original = D.CaseAllowlist.__init__

    def guarded(self, case_ids, split, *, allow_holdout=False, **kw):
        assert allow_holdout is False, "training code requested holdout access"
        return original(self, case_ids, split, allow_holdout=allow_holdout, **kw)

    mp = pytest.MonkeyPatch()
    mp.setattr(D.CaseAllowlist, "__init__", guarded)
    try:
        result = T.run_experiment(cfg, log=lambda *a: None)
    finally:
        mp.undo()
    return {"cfg": cfg, "root": root, "result": result, "run_dir": T.run_dir_for(T.validate_config(cfg))}


# --- training -------------------------------------------------------------------------------

def test_one_epoch_end_to_end(trained):
    assert trained["result"]["status"] == "COMPLETED"
    run = trained["run_dir"]
    rm = json.loads((run / "run_manifest.json").read_text(encoding="utf-8"))
    for key in ("experiment_id", "model_family", "model_variant", "decoder", "training_fraction",
                "split_manifest", "seed", "preprocessing_version", "postprocessing_version",
                "prediction_variant", "evaluation_population_manifest", "evaluation_metric_version",
                "training_code_version", "checkpoint", "evaluation_code_version", "num_test_cases",
                "metrics_summary", "per_case_metrics", "per_slice_metrics"):
        assert rm.get(key) is not None, key                                     # `08` section 10
    assert rm["training_fraction"] == 0.5 and rm["postprocessing_version"] == "none"
    assert rm["prediction_variant"] == "RAW_PREDICTION" and rm["num_test_cases"] == len(synth.VALIDATION)
    assert rm["split_manifest"]["sha256"] == D.sha256_file(trained["cfg"]["paths"]["split_manifest"])
    assert rm["checkpoint"]["sha256"] == D.sha256_file(run / "checkpoints" / "best.pt")
    assert rm["training_code_version"].startswith("git:")
    assert "img 112 != ADR-ML-001 560" in rm["recipe_deviations_from_adr_ml_001"]
    log = read_log(run)
    assert [e["event"] for e in log] == ["start", "epoch"]
    ep = log[1]
    assert np.isfinite(ep["train_loss_mean"]) and 0.0 <= ep["val_mean_dice_3d"] <= 1.0
    assert ep["train_slices"] == sum(synth.SHAPES[c][2] for c in synth.SUBSETS["50_percent"])
    assert set(ep["val_dice_per_case"]) == set(synth.VALIDATION)
    assert ep["peak_memory"]["metric"] and ep["wall_time_s"]["epoch"] > 0
    assert ep["last_sha256"] == D.sha256_file(run / "checkpoints" / "last.pt")
    # post-training validation artifacts exist and are hashed
    for ref in (rm["metrics_summary"], rm["per_case_metrics"], rm["per_slice_metrics"]):
        assert D.sha256_file(run / ref["path"]) == ref["sha256"]


def test_best_checkpoint_reproduces_the_recorded_predictions(trained, pkg):
    run = trained["run_dir"]
    payload = I.load_checkpoint_payload(run / "checkpoints" / "best.pt")
    model = I.model_from_checkpoint(payload, "cpu")
    pm = json.loads((run / "predictions" / "validation" / "predictions_manifest.json").read_text(encoding="utf-8"))
    assert pm["checkpoint"]["sha256"] == D.sha256_file(run / "checkpoints" / "best.pt")
    cid = synth.VALIDATION[0]
    allow = D.CaseAllowlist.for_validation(pkg["split"])
    image, _, _ = D.load_image(cid, D.case_paths(pkg["dataset"], pkg["package_root"], allowlist=allow))
    mask = I.predict_native_mask(model, D.model_input_stack(image, IMG), image.shape[1:], device="cpu",
                                 precision="fp32", batch=4)
    stored, _, _ = D.read_nrrd_zyx(run / "predictions" / "validation" / f"{cid}.nrrd")
    assert np.array_equal(mask, stored)
    # the cache holds exactly what inference computes on the fly
    side = D.read_cache_sidecar(trained["root"] / "cache" / synth.SPLIT_ID / f"img{IMG}", cid)
    cached = np.load(trained["root"] / "cache" / synth.SPLIT_ID / f"img{IMG}" / side["files"]["image"]["name"])
    assert np.array_equal(cached.astype(np.float32), D.model_input_stack(image, IMG))


def test_complete_run_is_skipped_and_a_changed_config_refused(trained):
    assert T.run_experiment(trained["cfg"], log=None)["status"] == "SKIPPED_COMPLETE"
    with pytest.raises(T.ConfigMismatch):
        T.run_experiment(dict(trained["cfg"], lr=2e-4), log=None)


@pytest.mark.parametrize("change", [{"batch": 3}, {"precision": "bf16"}, {"typo_key": 1},
                                   {"subset": "75_percent"}, {"img": 100}, {"variant": "resnet"},
                                   {"experiment_id": "../escape"}, {"device": "cuda:0"}])
def test_bad_configs_are_refused(pkg, tmp_path, change):
    # "cuda:0" is refused rather than reinterpreted, so no run can silently drop bf16
    with pytest.raises((T.ConfigError, ValueError)):
        T.validate_config(make_config(pkg, tmp_path, **change))


@pytest.mark.parametrize("device,asked,config,expect", [
    ("cuda", None, {"precision": "bf16"}, ("cuda", "bf16")),
    ("cuda:0", None, {"precision": "bf16"}, ("cuda:0", "bf16")),
    (torch.device("cuda", 0), None, {}, ("cuda:0", "bf16")),
    (torch.device("cuda"), "fp32", {"precision": "bf16"}, ("cuda", "fp32")),
    ("cpu", "bf16", {"precision": "bf16"}, ("cpu", "fp32")),
    (None, None, {"device": "cpu", "precision": "bf16"}, ("cpu", "fp32")),
])
def test_infer_runtime_recognises_every_cuda_spelling(device, asked, config, expect):
    assert I.resolve_runtime(device, asked, config) == expect


def test_runs_root_is_not_machine_specific(monkeypatch):
    assert T.DEFAULT_RUNS_ROOT == (Path(os.environ["CARDIAC_RUNS_ROOT"]) if os.environ.get("CARDIAC_RUNS_ROOT")
                                   else D.main_checkout_root().parent / "cardiac-runs")


def test_run_dir_inside_git_is_refused(pkg):
    cfg = make_config(pkg, D.REPO_ROOT / "ml" / "_no", experiment_id="EXP-T-GIT")
    with pytest.raises(T.ConfigError):
        T.run_experiment(cfg, log=None)
    assert not (D.REPO_ROOT / "ml" / "_no").exists()


def test_resume_after_interruption_matches_an_uninterrupted_run(pkg, tmp_path, monkeypatch):
    cfg = make_config(pkg, tmp_path, experiment_id="EXP-T-RESUME", epochs=2)

    def crash(epoch):
        if epoch == 1:
            raise KeyboardInterrupt("simulated interruption after epoch 1")
    monkeypatch.setattr(T, "_after_epoch_hook", crash)
    with pytest.raises(KeyboardInterrupt):
        T.run_experiment(cfg, log=None)
    run = T.run_dir_for(T.validate_config(cfg))
    assert T.run_status(run) == "PARTIAL"
    monkeypatch.setattr(T, "_after_epoch_hook", None)
    assert T.run_experiment(cfg, log=None)["status"] == "COMPLETED"
    log = read_log(run)
    assert [e["event"] for e in log] == ["start", "epoch", "resume", "epoch"]
    assert log[2]["from_epoch"] == 2 and [e["epoch"] for e in log if e["event"] == "epoch"] == [1, 2]

    straight = make_config(pkg, tmp_path, experiment_id="EXP-T-STRAIGHT", epochs=2)
    T.run_experiment(straight, log=None)
    a = torch.load(run / "checkpoints" / "last.pt", weights_only=True)["model_state"]
    b = torch.load(T.run_dir_for(T.validate_config(straight)) / "checkpoints" / "last.pt",
                   weights_only=True)["model_state"]
    assert all(torch.equal(a[k], b[k]) for k in a), "resumed training diverged from the uninterrupted run"


def test_interruption_between_last_and_best_rederives_best(pkg, tmp_path, monkeypatch):
    cfg = make_config(pkg, tmp_path, experiment_id="EXP-T-BEST", epochs=2)
    real_save = T._save_atomic

    def save_then_die(obj, path):
        digest = real_save(obj, path)
        if path.name == "last.pt" and obj["epoch"] == 2:
            raise KeyboardInterrupt("simulated interruption between last.pt and best.pt")
        return digest
    monkeypatch.setattr(T, "_save_atomic", save_then_die)
    with pytest.raises(KeyboardInterrupt):
        T.run_experiment(cfg, log=None)
    monkeypatch.setattr(T, "_save_atomic", real_save)
    assert T.run_experiment(cfg, log=None)["status"] == "COMPLETED"
    run = T.run_dir_for(T.validate_config(cfg))
    rm = json.loads((run / "run_manifest.json").read_text(encoding="utf-8"))
    best = torch.load(run / "checkpoints" / "best.pt", weights_only=True)
    last = torch.load(run / "checkpoints" / "last.pt", weights_only=True)
    assert best["epoch"] == last["best"]["epoch"] == rm["checkpoint"]["epoch"]
    assert all(torch.equal(best["model_state"][k], last["best_model_state"][k]) for k in best["model_state"])


def test_training_code_never_names_holdout_access():
    for name in ("train.py", "queue.py"):
        src = (D.REPO_ROOT / "ml" / name).read_text(encoding="utf-8")
        assert not re.search(r"allow_holdout\s*=\s*True|for_holdout\(|HOLDOUT_PARTITION", src), name


# --- inference --------------------------------------------------------------------------------

def test_infer_refuses_holdout_without_the_flag(trained, capsys):
    run = trained["run_dir"]
    assert I.main(["--run-dir", str(run), "--population", "holdout"]) == 2
    assert "REFUSED" in capsys.readouterr().out
    with pytest.raises(D.HoldoutAccessError):
        I.predict_population(run, "final_holdout", log=None)
    with pytest.raises(D.HoldoutAccessError):
        I.predict_population(run, "final_holdout", holdout_authorization={"confirm_frozen_morphology_sha256":
                                                                          "not-a-sha"}, log=None)
    assert not (run / "predictions" / "final_holdout").exists()
    assert I.main(["--run-dir", str(run), "--confirm-frozen-morphology", "a" * 64]) == 2   # validation + flag


def test_infer_checks_the_morphology_file(trained, tmp_path):
    cfg_file = tmp_path / "morphology.json"
    cfg_file.write_text('{"ops": []}\n', encoding="utf-8")
    with pytest.raises(D.HoldoutAccessError):
        I.predict_population(trained["run_dir"], "final_holdout",
                             holdout_authorization={"confirm_frozen_morphology_sha256": "b" * 64},
                             morphology_config=cfg_file, log=None)


def test_infer_refuses_to_overwrite(trained, capsys):
    run = trained["run_dir"]
    with pytest.raises(FileExistsError):
        I.predict_population(run, "validation", log=None)
    assert I.main(["--run-dir", str(run)]) == 2
    assert "REFUSED" in capsys.readouterr().out
    assert I.predict_population(run, "validation", skip_if_complete=True, log=None).name == "validation"


def test_infer_refuses_unrecorded_files(trained):
    run = trained["run_dir"]
    stray_dir = run / "predictions" / "final_holdout"
    stray_dir.mkdir(parents=True)
    (stray_dir / f"{synth.HOLDOUT[0]}.nrrd").write_bytes(b"not ours")
    with pytest.raises(FileExistsError):
        I.predict_population(run, "final_holdout", holdout_authorization={
            "confirm_frozen_morphology_sha256": "c" * 64}, log=None)
    assert (stray_dir / f"{synth.HOLDOUT[0]}.nrrd").read_bytes() == b"not ours"


def test_infer_failure_is_retried_or_explicitly_accepted(pkg, tmp_path, monkeypatch):
    cfg = make_config(pkg, tmp_path, experiment_id="EXP-T-FAIL", post_train_validation=False)
    T.run_experiment(cfg, log=None)
    run = T.run_dir_for(T.validate_config(cfg))
    real = D.load_image
    victim = synth.VALIDATION[1]

    def flaky(cid, paths):
        if cid == victim:
            raise OSError("simulated read error")
        return real(cid, paths)
    monkeypatch.setattr(D, "load_image", flaky)
    with pytest.raises(I.PredictionFailures):
        I.predict_population(run, "validation", log=None)
    assert not (run / "predictions" / "validation" / "predictions_manifest.json").exists()
    monkeypatch.setattr(D, "load_image", real)
    I.predict_population(run, "validation", log=None)                  # retries only the failed case
    pm = json.loads((run / "predictions" / "validation" / "predictions_manifest.json").read_text(encoding="utf-8"))
    assert pm["succeeded_n"] == 2 and pm["failed_n"] == 0
    progress = [json.loads(x) for x in (run / "predictions" / "validation" / "progress.jsonl")
                .read_text(encoding="utf-8").splitlines()]
    assert [(p["case_id"], p["status"]) for p in progress if p["event"] == "case"] == [
        (synth.VALIDATION[0], "SUCCEEDED"), (victim, "FAILED"), (victim, "SUCCEEDED")]

    cfg2 = make_config(pkg, tmp_path, experiment_id="EXP-T-FAIL2", post_train_validation=False)
    T.run_experiment(cfg2, log=None)
    run2 = T.run_dir_for(T.validate_config(cfg2))
    monkeypatch.setattr(D, "load_image", flaky)
    I.predict_population(run2, "validation", accept_failures=True, log=None)
    pm2 = json.loads((run2 / "predictions" / "validation" / "predictions_manifest.json").read_text(encoding="utf-8"))
    assert pm2["failed_n"] == 1 and pm2["cases"][1]["failure_reason"].startswith("OSError")


# --- the whole chain on a Contract-2-shaped package --------------------------------------------

def test_train_infer_evaluate_export_chain(tmp_path):
    cpkg = synth.make_contract_package(tmp_path / "cpkg")
    cfg = make_config(cpkg, tmp_path, experiment_id="EXP-U-025", subset="25_percent")
    assert T.run_experiment(cfg, log=None)["status"] == "COMPLETED"
    run = T.run_dir_for(T.validate_config(cfg))
    I.predict_population(run, "final_holdout", holdout_authorization={
        "confirm_frozen_morphology_sha256": "d" * 64}, log=None)
    E.evaluate_run(run, "final_holdout", dataset_manifest=cpkg["dataset"], package_root=cpkg["package_root"],
                   allow_holdout=True, log=None)
    manifest = X.build_manifest(run, gate_split_01="ACCEPTED", gate_ml_01="ACCEPTED")
    result = X.validate(manifest, run)
    assert result["status"] == "PASS", result
    assert manifest["experiment"]["checkpoint"]["checksum"]["value"] == D.sha256_file(run / "checkpoints" / "best.pt")
    summary = json.loads((run / "evaluation" / "final_holdout" / "metrics_summary.json").read_text(encoding="utf-8"))
    assert summary["holdout_slots"]["sensitivity_without_suspected_linkage"]["intended_n"] == 53


# --- queue ------------------------------------------------------------------------------------

def test_queue_skips_complete_runs_new_and_survives_a_failure(trained, pkg, tmp_path):
    new = make_config(pkg, trained["root"], experiment_id="EXP-T-QUEUE")
    broken = make_config(pkg, trained["root"], experiment_id="EXP-T-BROKEN")
    broken["paths"] = dict(broken["paths"], split_manifest=str(tmp_path / "missing.json"))
    queue_file = tmp_path / "queue.json"
    queue_file.write_text(json.dumps({"queue_id": "q-test", "experiments": [trained["cfg"], broken, new]}),
                          encoding="utf-8")
    dry = Q.run_queue(queue_file, dry_run=True, echo=lambda *a: None)
    assert [r["action"] for r in dry["results"]] == ["skip", "start", "start"]
    env = dict(os.environ, CUDA_VISIBLE_DEVICES="-1", HF_HUB_OFFLINE="1")      # never touch the GPU
    out = Q.run_queue(queue_file, env=env, python=sys.executable, echo=lambda *a: None)
    assert [r["outcome"] for r in out["results"]] == ["skipped", "failed", "completed"]
    assert out["failed"] == ["EXP-T-BROKEN"]
    events = [json.loads(x)["event"] for x in open(out["log"], encoding="utf-8")]
    assert events[0] == "queue_start" and events[-1] == "queue_end" and "launch" in events
    assert T.run_status(T.run_dir_for(T.validate_config(new))) == "COMPLETE"
    again = Q.run_queue(queue_file, env=env, python=sys.executable, echo=lambda *a: None)
    assert [r["outcome"] for r in again["results"]][::2] == ["skipped", "skipped"]


def test_matrix_template_cannot_run_but_is_otherwise_the_adr_recipe(tmp_path):
    template = D.REPO_ROOT / "ml" / "configs" / "matrix_queue.template.json"
    with pytest.raises(T.ConfigError):
        Q.load_queue(template)                                          # placeholders are refused
    q = json.loads(template.read_text(encoding="utf-8"))
    filled = [dict(c, epochs=10, batch=4) for c in q["experiments"]]
    assert [c["experiment_id"] for c in filled] == ["EXP-U-025", "EXP-U-050", "EXP-U-100",
                                                    "EXP-D-025", "EXP-D-050", "EXP-D-100"]
    for c in filled:
        assert T.recipe_deviations(T.validate_config(c)) == []
    path = tmp_path / "filled.json"
    path.write_text(json.dumps(filled), encoding="utf-8")               # bare-list form
    queue_id, configs = Q.load_queue(path)
    assert queue_id == "filled" and len(configs) == 6


def test_queue_validates_every_config_before_running(pkg, tmp_path):
    bad = make_config(pkg, tmp_path, experiment_id="EXP-T-BAD", batch=5)
    queue_file = tmp_path / "queue.json"
    queue_file.write_text(json.dumps({"queue_id": "q-bad", "experiments": [make_config(pkg, tmp_path), bad]}),
                          encoding="utf-8")
    with pytest.raises(T.ConfigError):
        Q.run_queue(queue_file, echo=lambda *a: None)
    assert not (tmp_path / "runs").exists()
