"""Tests for ml.evaluate: known-answer fixture (`13` section 11), empty-slice rule (TC-EXP-009),
failed-case protocol (`08` section 8.1), bootstrap determinism (DR-014), comparability
(TC-EXP-007), holdout slots, DR-010 selections and the run-directory driver.

Run from the repository root:  python -m pytest ml/tests -q
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from ml import data as D
from ml import evaluate as E
from ml.tests import runfixture, synth


# --- the known-answer fixture -------------------------------------------------------
#
#   slice 0   GT empty,          prediction empty      BOTH_EMPTY    Dice NOT_APPLICABLE
#   slice 1   GT 4 voxels,       prediction 4 voxels   BOTH_PRESENT  TP 2 FP 2 FN 2 -> Dice 0.5
#   slice 2   GT 4 voxels,       prediction empty      REF_ONLY      TP 0 FP 0 FN 4 -> Dice 0
#   slice 3   GT empty,          prediction 3 voxels   PRED_ONLY     TP 0 FP 3 FN 0 -> Dice 0
#
#   case:  TP 2, FP 5, FN 6, |pred| 7, |GT| 8
#          Dice 2*2/(2*2+5+6) = 4/15      IoU 2/(2+5+6) = 2/13      RVE (7-8)/8*100 = -12.5 %

def known_pair():
    ref = np.zeros((4, 4, 4), np.uint8)
    pred = np.zeros((4, 4, 4), np.uint8)
    ref[1, 0, 0:4] = 1                 # GT row of 4
    pred[1, 0, 2:4] = 1                # overlaps 2 of them
    pred[1, 1, 0:2] = 1                # 2 false positives
    ref[2, 2, 0:4] = 1                 # GT the model misses entirely
    pred[3, 3, 0:3] = 1                # 3 false positives on an empty-GT slice
    return pred, ref


def test_known_answer_counts_dice_iou_rve():
    pred, ref = known_pair()
    c = E.confusion_counts(pred, ref)
    assert c == {"tp": 2, "fp": 5, "fn": 6, "pred_voxels": 7, "ref_voxels": 8}
    rec = E.evaluate_case("CASE_9001", pred, ref)["record"]
    assert rec["dice_3d"] == pytest.approx(4 / 15)
    assert rec["iou_3d"] == pytest.approx(2 / 13)
    assert rec["relative_volume_error_percent"] == pytest.approx(-12.5)
    assert rec["volume_unit"] == "voxels"
    assert (rec["tp_voxels"], rec["fp_voxels"], rec["fn_voxels"]) == (2, 5, 6)
    assert rec["fp_ratio_of_reference"] == pytest.approx(5 / 8)
    assert rec["fn_ratio_of_reference"] == pytest.approx(6 / 8)
    # dice and IoU are linked: IoU = D / (2 - D)
    assert rec["iou_3d"] == pytest.approx(rec["dice_3d"] / (2 - rec["dice_3d"]))


def test_known_answer_per_slice_and_empty_slice_rule():
    pred, ref = known_pair()
    rows = E.per_slice_metrics(pred, ref)
    assert [r["category"] for r in rows] == ["BOTH_EMPTY", "BOTH_PRESENT", "REF_ONLY", "PRED_ONLY"]
    assert [r["dice"] for r in rows] == [None, 0.5, 0.0, 0.0]
    assert rows[0]["dice_status"] == E.NOT_APPLICABLE
    assert [(r["tp"], r["fp"], r["fn"]) for r in rows] == [(0, 0, 0), (2, 2, 2), (0, 0, 4), (0, 3, 0)]
    assert [r["normalized_position"] for r in rows] == pytest.approx([0, 1 / 3, 2 / 3, 1])
    rec = E.evaluate_case("CASE_9001", pred, ref)["record"]
    # NOT_APPLICABLE is excluded from the mean, not counted as 1
    assert rec["mean_slice_dice"] == pytest.approx(0.5 / 3)
    assert (rec["slices_applicable"], rec["slices_not_applicable"]) == (3, 1)
    assert (rec["slices_pred_only"], rec["slices_ref_only"]) == (1, 1)


def test_perfect_and_disjoint_cases():
    _, ref = known_pair()
    rec = E.evaluate_case("CASE_9002", ref, ref)["record"]
    assert rec["dice_3d"] == 1.0 and rec["iou_3d"] == 1.0 and rec["relative_volume_error_percent"] == 0.0
    empty = np.zeros_like(ref)
    rec = E.evaluate_case("CASE_9003", empty, ref)["record"]
    assert rec["dice_3d"] == 0.0 and rec["iou_3d"] == 0.0 and rec["relative_volume_error_percent"] == -100.0


def test_empty_reference_is_a_failed_case_not_a_score():
    empty = np.zeros((3, 4, 4), np.uint8)
    with pytest.raises(E.CaseEvaluationError) as exc:
        E.evaluate_case("CASE_9004", empty, empty)
    assert exc.value.reason_code == "REFERENCE_MASK_EMPTY"
    pred = empty.copy()
    pred[1, 1, 1] = 1
    with pytest.raises(E.CaseEvaluationError):
        E.evaluate_case("CASE_9004", pred, empty)


def test_non_binary_and_mismatched_masks_are_refused():
    _, ref = known_pair()
    with pytest.raises(E.CaseEvaluationError) as exc:
        E.evaluate_case("CASE_9005", ref * 255, ref)
    assert exc.value.reason_code == "NON_BINARY_MASK"
    with pytest.raises(E.CaseEvaluationError) as exc:
        E.evaluate_case("CASE_9005", ref[:3], ref)
    assert exc.value.reason_code == "SHAPE_MISMATCH"
    with pytest.raises(E.CaseEvaluationError):
        E.evaluate_case("CASE_9005", ref.astype(np.float32), ref)


# --- DR-010 selections -----------------------------------------------------------------

def test_worst_slice_selection_known_answer():
    pred, ref = known_pair()
    sel = E.evaluate_case("CASE_9001", pred, ref)["worst_slice_selection"]
    assert set(sel) >= {"rule_id", "selection_version", "slices"}
    assert sel["rule_id"] == "DR-010" and sel["eligible_slice_count"] == 2
    # slice 3 (FP-only) and slice 0 (both empty) are not anatomical candidates
    assert sel["slices"] == [
        {"slice_index": 2, "dice": 0.0, "false_positives": 0, "false_negatives": 4},
        {"slice_index": 1, "dice": 0.5, "false_positives": 2, "false_negatives": 2},
    ]
    fp = E.evaluate_case("CASE_9001", pred, ref)["problematic_fp_slices"]
    assert fp["slices"] == [{"slice_index": 3, "false_positives": 3}]


def test_worst_slice_tie_breaks():
    def row(k, dice, fp, fn, ref=5):
        return {"slice_index": k, "dice": dice, "fp": fp, "fn": fn, "ref_voxels": ref,
                "category": "BOTH_PRESENT"}
    rows = [row(0, 0.0, 1, 3), row(1, 0.0, 6, 4), row(2, 0.2, 0, 1), row(3, 0.0, 2, 2),
            row(4, 0.0, 50, 0, ref=0)]                          # empty GT: excluded
    sel = E.worst_slice_selection(rows)
    assert [s["slice_index"] for s in sel["slices"]] == [1, 0, 3, 2]
    assert [s["slice_index"] for s in E.worst_slice_selection(rows, limit=2)["slices"]] == [1, 0]


def test_outlier_selection_tie_breaks():
    recs = [{"case_id": c, "status": "SUCCEEDED", "dice_3d": d, "fp_fn_voxels": f}
            for c, d, f in [("CASE_0003", 0.5, 10), ("CASE_0001", 0.5, 10), ("CASE_0002", 0.5, 20),
                            ("CASE_0004", 0.9, 1), ("CASE_0005", 0.1, 1)]]
    sel = E.outlier_selection(recs)
    assert [c["case_id"] for c in sel["cases"]] == ["CASE_0005", "CASE_0002", "CASE_0001"]


# --- failed-case protocol and cohort summary ------------------------------------------------

def _population(ids, role="VALIDATION"):
    return {"role": role, "partition": "validation", "manifest_id": "pop", "case_ids": list(ids)}


def test_failed_cases_are_reported_never_dropped():
    pred, ref = known_pair()

    def load_pair(cid):
        if cid == "CASE_0002":
            raise E.PredictionUnavailable("INFERENCE_FAILED", "worker crashed")
        if cid == "CASE_0003":
            return pred[:2], ref, {}
        return pred, ref, {}

    ids = ["CASE_0001", "CASE_0002", "CASE_0003"]
    res = E.evaluate_population(ids, load_pair, population=_population(ids),
                                prediction_variant="RAW_PREDICTION")
    assert (res["intended_n"], res["successful_n"], res["failed_n"]) == (3, 1, 2)
    assert {f["case_id"]: f["reason_code"] for f in res["failures"]} == \
        {"CASE_0002": "INFERENCE_FAILED", "CASE_0003": "SHAPE_MISMATCH"}
    s = E.cohort_summary(res)
    assert (s["intended_n"], s["successful_n"], s["failed_n"]) == (3, 1, 2)
    assert s["metrics"]["dice_3d"]["n"] == 1
    assert s["metrics"]["dice_3d"]["mean"] == pytest.approx(4 / 15)
    assert s["metrics"]["dice_3d"]["mean_with_failures_as_zero"] == pytest.approx(4 / 15 / 3)


def test_data_access_refusal_propagates():
    def load_pair(cid):
        raise D.HoldoutAccessError("no")
    with pytest.raises(D.HoldoutAccessError):
        E.evaluate_population(["CASE_0001"], load_pair, population=_population(["CASE_0001"]),
                              prediction_variant="RAW_PREDICTION")


def test_prediction_variant_must_be_explicit():
    with pytest.raises(ValueError):
        E.evaluate_population(["CASE_0001"], lambda c: None, population=_population(["CASE_0001"]),
                              prediction_variant="raw")


def test_cohort_summary_known_values():
    res = {"evaluation_metric_version": E.EVALUATION_METRIC_VERSION, "prediction_variant": "RAW_PREDICTION",
           "population": _population(["CASE_0001", "CASE_0002", "CASE_0003", "CASE_0004"]),
           "failures": [],
           "cases": [{"case_id": f"CASE_000{i + 1}", "status": "SUCCEEDED", "dice_3d": v, "iou_3d": v,
                      "fp_fn_voxels": 0} for i, v in enumerate([0.6, 0.7, 0.8, 0.9])]}
    s = E.cohort_summary(res, metrics=("dice_3d",))
    d = s["metrics"]["dice_3d"]
    assert d["mean"] == pytest.approx(0.75) and d["median"] == pytest.approx(0.75)
    assert d["std"] == pytest.approx(np.std([0.6, 0.7, 0.8, 0.9], ddof=1))
    assert d["min"] == 0.6 and d["max"] == 0.9
    lo, hi = d["ci95_mean"]["low"], d["ci95_mean"]["high"]
    assert 0.6 <= lo < 0.75 < hi <= 0.9


# --- bootstrap ------------------------------------------------------------------------------

def test_bootstrap_is_deterministic_and_seeded():
    values = [0.81, 0.77, 0.9, 0.62, 0.88, 0.71, 0.93, 0.85]
    a = E.bootstrap_ci_mean(values)
    b = E.bootstrap_ci_mean(list(values))
    assert a == b and a["seed"] == 2024 and a["resamples"] == 10000 and a["level"] == 0.95
    assert a["low"] < float(np.mean(values)) < a["high"]
    assert E.bootstrap_ci_mean(values, seed=7) != a
    const = E.bootstrap_ci_mean([0.5] * 6)
    assert const["low"] == pytest.approx(0.5) and const["high"] == pytest.approx(0.5)
    one = E.bootstrap_ci_mean([0.5])
    assert one["low"] is None and "n=1" in one["note"]


# --- comparability and paired comparison -----------------------------------------------------

def _result(values, *, version=E.EVALUATION_METRIC_VERSION, variant="RAW_PREDICTION",
            ids=None, failures=(), role="FINAL_HOLDOUT"):
    ids = ids or [f"CASE_{n:04d}" for n in range(1, len(values) + 1)]
    cases = [{"case_id": c, "status": "SUCCEEDED", "dice_3d": v, "fp_fn_voxels": 0}
             for c, v in zip(ids, values) if c not in failures]
    return {"evaluation_metric_version": version, "prediction_variant": variant,
            "reference_mask_kind": "GROUND_TRUTH", "geometry_policy": E.GEOMETRY_POLICY,
            "population": {"role": role, "case_ids": list(ids)},
            "intended_n": len(ids), "successful_n": len(cases),
            "failures": [{"case_id": c, "reason_code": "X", "reason": "x"} for c in failures],
            "cases": cases}


def test_paired_comparison_known_differences():
    a = _result([0.5, 0.6, 0.7, 0.8])
    b = _result([0.6, 0.6, 0.9, 0.7])
    out = E.paired_comparison(a, b)
    assert out["comparability"]["label"] == "COMPARABLE"
    st = out["paired_statistics"]
    assert st["n_pairs"] == 4
    assert st["mean"] == pytest.approx((0.1 + 0.0 + 0.2 - 0.1) / 4)
    assert (st["n_run_b_higher"], st["n_run_a_higher"], st["n_equal"]) == (2, 1, 1)
    assert st["ci95_mean"]["low"] <= st["mean"] <= st["ci95_mean"]["high"]
    assert E.paired_comparison(a, b) == out                           # deterministic


def test_paired_comparison_lists_unpaired_failures():
    a = _result([0.5, 0.6, 0.7, 0.8], failures=("CASE_0002",))
    b = _result([0.6, 0.6, 0.9, 0.7], failures=("CASE_0004",))
    out = E.paired_comparison(a, b)
    assert out["paired_statistics"]["n_pairs"] == 2
    assert out["unpaired_cases"] == [{"case_id": "CASE_0002", "missing_in": ["run_a"]},
                                     {"case_id": "CASE_0004", "missing_in": ["run_b"]}]


@pytest.mark.parametrize("change,failed", [
    ({"version": "ml-eval-0.9"}, "same_evaluation_metric_version"),
    ({"variant": "PROCESSED_PREDICTION"}, "explicit_prediction_variant"),
    ({"ids": ["CASE_0001", "CASE_0002", "CASE_0003", "CASE_0099"]}, "same_population"),
    ({"role": "VALIDATION"}, "same_population"),
])
def test_non_comparable_runs_get_no_delta(change, failed):
    a = _result([0.5, 0.6, 0.7, 0.8])
    b = _result([0.6, 0.6, 0.9, 0.7], **change)
    out = E.paired_comparison(a, b)
    assert out["comparability"]["label"] == "NON_COMPARABLE"
    assert failed in out["comparability"]["failed_checks"]
    assert out["paired_statistics"] is None


def test_ablation_may_compare_raw_with_processed_explicitly():
    a = _result([0.5, 0.6, 0.7, 0.8])
    b = _result([0.6, 0.6, 0.9, 0.7], variant="PROCESSED_PREDICTION")
    assert E.paired_comparison(a, b, same_prediction_variant=False)["comparability"]["comparable"]
    c = _result([0.6, 0.6, 0.9, 0.7], variant="UNSTATED")
    assert not E.paired_comparison(a, c, same_prediction_variant=False)["comparability"]["comparable"]


# --- holdout slots ----------------------------------------------------------------------------

def test_holdout_slots_exclude_the_suspected_linkage(tmp_path):
    split = json.loads(json.dumps(synth.make_contract_package(tmp_path)["split"]))
    ids = synth.C_HOLDOUT
    values = np.linspace(0.5, 0.9, len(ids)).tolist()
    res = _result(values, ids=ids)
    rep = E.holdout_report(res, split)
    assert rep["primary_all_holdout"]["intended_n"] == 54
    sens = rep["sensitivity_without_suspected_linkage"]
    assert sens["intended_n"] == 53 and sens["excluded_case_ids"] == synth.C_SUSPECTED
    kept = [v for c, v in zip(ids, values) if c not in synth.C_SUSPECTED]
    assert sens["metrics"]["dice_3d"]["mean"] == pytest.approx(np.mean(kept))
    paired = E.paired_holdout_report(res, _result([v + 0.01 for v in values], ids=ids), split)
    assert paired["primary_all_holdout"]["paired_statistics"]["n_pairs"] == 54
    assert paired["sensitivity_without_suspected_linkage"]["paired_statistics"]["n_pairs"] == 53
    with pytest.raises(ValueError):
        E.holdout_report(_result(values[:10], ids=ids[:10]), split)   # not the locked population


def test_real_split_suspected_linkage_is_case_0027():
    if not D.DEFAULT_SPLIT_MANIFEST.exists():
        pytest.skip("split manifest not on this branch yet (PR #35)")
    holdout, suspected = E.holdout_slot_ids(D.load_split_manifest())
    assert len(holdout) == 54 and suspected == ["CASE_0027"]


# --- the run-directory driver -----------------------------------------------------------------

@pytest.fixture(scope="module")
def cpkg(tmp_path_factory):
    return synth.make_contract_package(tmp_path_factory.mktemp("cpkg"))


def test_evaluate_run_validation_writes_immutable_outputs(cpkg, tmp_path):
    run = runfixture.make_run_dir(tmp_path / "EXP-U-025", cpkg, partition="validation")
    out = E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"],
                         package_root=cpkg["package_root"], log=None)
    per_case = json.loads((out / "per_case_metrics.json").read_text(encoding="utf-8"))
    assert per_case["intended_n"] == per_case["successful_n"] == len(synth.C_VALIDATION)
    assert per_case["evaluation_metric_version"] == E.EVALUATION_METRIC_VERSION
    # recompute one case from the files (TC-EXP-002)
    cid = synth.C_VALIDATION[0]
    pred, _, _ = D.read_nrrd_zyx(run / "predictions" / "validation" / f"{cid}.nrrd")
    allow = D.CaseAllowlist.for_validation(cpkg["split"])
    ref, _, _ = D.load_mask(cid, D.case_paths(cpkg["dataset"], cpkg["package_root"], allowlist=allow))
    rec = next(r for r in per_case["cases"] if r["case_id"] == cid)
    assert rec["dice_3d"] == pytest.approx(E.evaluate_case(cid, pred, ref)["record"]["dice_3d"])
    assert 0.0 < rec["dice_3d"] < 1.0
    manifest = json.loads((out / "evaluation_manifest.json").read_text(encoding="utf-8"))
    for item in list(manifest["outputs"].values()) + list(manifest["metric_sets"].values()):
        assert D.sha256_file(run / item["path"]) == item["sha256"]
    ms = json.loads((run / manifest["metric_sets"][cid]["path"]).read_text(encoding="utf-8"))
    assert ms["worst_slice_selection"]["rule_id"] == "DR-010"
    with pytest.raises(FileExistsError):
        E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"],
                       package_root=cpkg["package_root"], log=None)


def test_interrupted_evaluation_leaves_nothing_recorded(cpkg, tmp_path, monkeypatch):
    run = runfixture.make_run_dir(tmp_path / "EXP-D-100", cpkg, experiment_id="EXP-D-100",
                                  partition="validation")

    def boom():
        raise RuntimeError("simulated crash before the commit point")
    monkeypatch.setattr(E.MF, "code_version", boom)
    with pytest.raises(RuntimeError):
        E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"],
                       package_root=cpkg["package_root"], log=None)
    assert not (run / "evaluation" / "validation").exists()
    monkeypatch.undo()
    out = E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"],
                         package_root=cpkg["package_root"], log=None)
    manifest = json.loads((out / "evaluation_manifest.json").read_text(encoding="utf-8"))
    assert manifest["outputs"]["per_case_metrics"]["path"] == "evaluation/validation/per_case_metrics.json"


def test_evaluate_run_holdout_needs_explicit_permission(cpkg, tmp_path):
    run = runfixture.make_run_dir(tmp_path / "EXP-U-025", cpkg)
    with pytest.raises(D.HoldoutAccessError):
        E.evaluate_run(run, "final_holdout", dataset_manifest=cpkg["dataset"],
                       package_root=cpkg["package_root"], log=None)
    run2 = runfixture.make_run_dir(tmp_path / "EXP-U-050", cpkg, experiment_id="EXP-U-050",
                                   holdout_authorization=False)
    with pytest.raises(D.HoldoutAccessError):
        E.evaluate_run(run2, "final_holdout", dataset_manifest=cpkg["dataset"],
                       package_root=cpkg["package_root"], allow_holdout=True, log=None)
    out = E.evaluate_run(run, "final_holdout", dataset_manifest=cpkg["dataset"],
                         package_root=cpkg["package_root"], allow_holdout=True, log=None)
    summary = json.loads((out / "metrics_summary.json").read_text(encoding="utf-8"))
    slots = summary["holdout_slots"]
    assert slots["primary_all_holdout"]["intended_n"] == 54
    assert slots["sensitivity_without_suspected_linkage"]["intended_n"] == 53


def test_evaluate_run_records_inference_failures(cpkg, tmp_path):
    cid = synth.C_VALIDATION[1]
    run = runfixture.make_run_dir(tmp_path / "EXP-D-025", cpkg, experiment_id="EXP-D-025",
                                  partition="validation", fail_cases=(cid,))
    out = E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"],
                         package_root=cpkg["package_root"], log=None)
    per_case = json.loads((out / "per_case_metrics.json").read_text(encoding="utf-8"))
    assert per_case["successful_n"] == 1 and per_case["failures"][0]["case_id"] == cid
    assert per_case["failures"][0]["reason_code"] == "INFERENCE_FAILED"


def test_evaluate_run_detects_a_changed_prediction(cpkg, tmp_path):
    run = runfixture.make_run_dir(tmp_path / "EXP-U-100", cpkg, experiment_id="EXP-U-100",
                                  partition="validation")
    cid = synth.C_VALIDATION[0]
    pred_path = run / "predictions" / "validation" / f"{cid}.nrrd"
    pred_path.write_bytes(pred_path.read_bytes().replace(b"pynrrd", b"PYNRRD"))
    out = E.evaluate_run(run, "validation", dataset_manifest=cpkg["dataset"],
                         package_root=cpkg["package_root"], log=None)
    per_case = json.loads((out / "per_case_metrics.json").read_text(encoding="utf-8"))
    assert per_case["failures"] == [{"case_id": cid, "reason_code": "PREDICTION_CHECKSUM_MISMATCH",
                                     "reason": f"{cid}: prediction file changed"}]
