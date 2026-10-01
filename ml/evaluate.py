"""Evaluation: case-level 3D metrics, per-slice metrics, the failed-case protocol, cohort
statistics with bootstrap 95% CIs, paired comparison, the holdout reporting slots and the
DR-010 worst-slice / outlier selections.

SEMANTICS - evaluation_metric_version "ml-eval-1.0.0" (`07` section 6, `08` sections 5-8.1)
    Case level (primary), over the full native-resolution volume of one case:
        dice_3d = 2TP / (2TP + FP + FN)          iou_3d = TP / (TP + FP + FN)
        FP / FN / TP voxel counts; fp_ratio_of_reference = FP / |GT|, fn_ratio_of_reference = FN / |GT|
        relative_volume_error_percent = (|pred| - |GT|) / |GT| x 100, in VOXELS (spacing is an
        identity placeholder in this release; no physical volume is claimed)
        A case whose reference mask is empty cannot be scored: it is a FAILED case
        (REFERENCE_MASK_EMPTY), reported, never dropped.
    Slice level (secondary), `07` section 6 empty-slice rule:
        GT non-empty, prediction empty    -> Dice 0      (category REF_ONLY)
        GT empty, prediction non-empty    -> Dice 0      (category PRED_ONLY)
        both empty                        -> NOT_APPLICABLE, excluded from means (BOTH_EMPTY)
        both non-empty                    -> 2TP / (2TP + FP + FN)   (BOTH_PRESENT)
    Cohort level: from per-case values only (never pooled voxels). n, mean, sample std
        (ddof=1), median, Q1, Q3, min, max, and a 95% CI of the mean: percentile bootstrap,
        10,000 resamples of cases, numpy default_rng(2024) (DR-014). Dice/IoU also report the
        mean with failed cases counted as 0 over the INTENDED N (`08` section 8.1).
    Paired comparison: per-case difference run_b - run_a on the cases successful in both;
        cases missing from either side are listed. Same bootstrap on the mean difference.
        Computed ONLY when the comparable-run gate (`08` section 7) passes; otherwise the runs
        are labelled NON_COMPARABLE and no delta is produced.
    Holdout slots: primary_all_holdout (all final_holdout cases) and
        sensitivity_without_suspected_linkage (minus split manifest
        sensitivity_analysis.suspected_holdout_case_ids, i.e. CASE_0027).
    DR-010 worst slice: among slices with non-empty GT, per-slice Dice ascending, then
        FP+FN descending, then slice_index ascending; returned in the DR-010a option (b)
        shape {rule_id, selection_version, slices: [{slice_index, dice, false_positives,
        false_negatives}]}. FP-only slices are listed separately (problematic_fp_slices).
    DR-010 outlier: the three successfully evaluated cases with the lowest dice_3d; ties by
        FP+FN descending, then case_id ascending.

RUN-DIRECTORY DRIVER
    python -m ml.evaluate run --run-dir <run> --population validation
    python -m ml.evaluate run --run-dir <run> --population final_holdout --allow-holdout
                              --holdout-authorization <record.json>
        reads  <run>/predictions/<population>/predictions_manifest.json (+ the NRRD masks)
               <run>/manifests/split_manifest.json, the reference masks via ml.data
        writes <run>/evaluation/<population>/ (refuses to overwrite):
               per_case_metrics.json, per_slice_metrics.json, metrics_summary.json,
               metric_sets/<case>.json, evaluation_manifest.json
    python -m ml.evaluate compare --run-a <run> --run-b <run> --population final_holdout
    The split is the FROZEN one only (ml.holdout, #64 R-1); final_holdout also needs the
    GATE-IMG-01 authorization record, verified before any case is read (#64 N-1).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import uuid
from collections.abc import Callable, Iterable
from pathlib import Path

import numpy as np

from ml import data as D
from ml import holdout as H
from ml import manifests as MF

EVALUATION_METRIC_VERSION = "ml-eval-1.0.0"
NOT_APPLICABLE = "NOT_APPLICABLE"
REFERENCE_MASK_KIND = "GROUND_TRUTH"
PREDICTION_VARIANTS = ("RAW_PREDICTION", "PROCESSED_PREDICTION")
VOLUME_UNIT = "voxels"
GEOMETRY_POLICY = "voxel-units; spacing is an identity placeholder; no physical volume or distance"
BOOTSTRAP = {"method": "percentile bootstrap of the mean over cases",
             "resamples": 10000, "seed": 2024, "level": 0.95,
             "quantiles": "numpy.quantile default (linear)"}
WORST_SLICE_RULE_ID = "DR-010"
WORST_SLICE_SELECTION_VERSION = "dr010-worst-slice/v1"          # the API contract's literal
WORST_SLICE_RULE = ("slices with non-empty ground truth only; per-slice Dice ascending, "
                    "then FP+FN voxels descending, then slice_index ascending")
OUTLIER_RULE_ID = "DR-010-outlier"
OUTLIER_SELECTION_VERSION = "dr010-outlier/1.0.0"
OUTLIER_RULE = ("the three successfully evaluated cases with the lowest case-level 3D Dice; "
                "ties: FP+FN voxels descending, then case_id ascending")
EMPTY_SLICE_RULE = {"REF_ONLY": "GT non-empty, prediction empty -> Dice 0",
                    "PRED_ONLY": "GT empty, prediction non-empty -> Dice 0",
                    "BOTH_EMPTY": "both empty -> NOT_APPLICABLE, excluded from means",
                    "BOTH_PRESENT": "2TP / (2TP + FP + FN)"}
SUMMARY_METRICS = ("dice_3d", "iou_3d", "relative_volume_error_percent", "fp_voxels",
                   "fn_voxels", "mean_slice_dice")
ZERO_ON_FAILURE = ("dice_3d", "iou_3d")
PREDICTIONS_FORMAT = MF.PREDICTIONS_FORMAT


class CaseEvaluationError(ValueError):
    """One case cannot be scored; recorded as a failed case with a reason code."""

    def __init__(self, reason_code: str, message: str):
        super().__init__(message)
        self.reason_code = reason_code


# --- voxel and slice metrics ------------------------------------------------------

def _binary(arr, what: str) -> np.ndarray:
    a = np.asarray(arr)
    if a.dtype == np.bool_:
        return a
    if not np.issubdtype(a.dtype, np.integer):
        raise CaseEvaluationError("NON_BINARY_MASK", f"{what} mask has dtype {a.dtype}; expected {{0, 1}}")
    if a.size and (int(a.min()) < 0 or int(a.max()) > 1):
        raise CaseEvaluationError("NON_BINARY_MASK", f"{what} mask has values outside {{0, 1}}")
    return a.astype(bool)


def _pair(pred, ref) -> tuple[np.ndarray, np.ndarray]:
    p, r = _binary(pred, "prediction"), _binary(ref, "reference")
    if p.shape != r.shape:
        raise CaseEvaluationError("SHAPE_MISMATCH", f"prediction {p.shape} != reference {r.shape}")
    return p, r


def confusion_counts(pred, ref) -> dict:
    """Voxel counts {tp, fp, fn, pred_voxels, ref_voxels} of two same-shape binary masks."""
    p, r = _pair(pred, ref)
    tp = int(np.count_nonzero(p & r))
    pv, rv = int(np.count_nonzero(p)), int(np.count_nonzero(r))
    return {"tp": tp, "fp": pv - tp, "fn": rv - tp, "pred_voxels": pv, "ref_voxels": rv}


def dice_score(tp: int, fp: int, fn: int) -> float | None:
    d = 2 * tp + fp + fn
    return None if d == 0 else 2 * tp / d


def iou_score(tp: int, fp: int, fn: int) -> float | None:
    d = tp + fp + fn
    return None if d == 0 else tp / d


def per_slice_metrics(pred, ref) -> list[dict]:
    """One row per slice of [Z, H, W] masks, with the `07` section 6 empty-slice rule."""
    p, r = _pair(pred, ref)
    if p.ndim != 3:
        raise CaseEvaluationError("SHAPE_MISMATCH", f"expected [Z, H, W] masks, got {p.shape}")
    tp = np.count_nonzero(p & r, axis=(1, 2))
    pv = np.count_nonzero(p, axis=(1, 2))
    rv = np.count_nonzero(r, axis=(1, 2))
    z = p.shape[0]
    rows = []
    for k in range(z):
        tpk, pvk, rvk = int(tp[k]), int(pv[k]), int(rv[k])
        fpk, fnk = pvk - tpk, rvk - tpk
        if rvk == 0 and pvk == 0:
            category, dice = "BOTH_EMPTY", None
        elif rvk == 0:
            category, dice = "PRED_ONLY", 0.0
        elif pvk == 0:
            category, dice = "REF_ONLY", 0.0
        else:
            category, dice = "BOTH_PRESENT", 2 * tpk / (2 * tpk + fpk + fnk)
        rows.append({"slice_index": k,
                     "normalized_position": k / (z - 1) if z > 1 else 0.0,
                     "category": category,
                     "dice": dice,
                     "dice_status": NOT_APPLICABLE if dice is None else "VALUE",
                     "tp": tpk, "fp": fpk, "fn": fnk, "ref_voxels": rvk, "pred_voxels": pvk})
    return rows


def worst_slice_selection(slice_rows: Iterable[dict], limit: int | None = None) -> dict:
    """DR-010 worst-slice ranking, exactly the API contract block (DR-010a option (b)):
    {rule_id, selection_version, slices: [{slice_index, dice, false_positives, false_negatives}]},
    worst first, over every eligible slice (an empty list is never padded)."""
    rows = list(slice_rows)
    eligible = [r for r in rows if r["ref_voxels"] > 0]
    ranked = sorted(eligible, key=lambda r: (r["dice"], -(r["fp"] + r["fn"]), r["slice_index"]))
    if limit is not None:
        ranked = ranked[:limit]
    return {
        "rule_id": WORST_SLICE_RULE_ID,
        "selection_version": WORST_SLICE_SELECTION_VERSION,
        "slices": [{"slice_index": r["slice_index"], "dice": r["dice"],
                    "false_positives": r["fp"], "false_negatives": r["fn"]} for r in ranked],
    }


def worst_slice_selection_meta(slice_rows: Iterable[dict]) -> dict:
    """What the contract block does not carry: the rule text, metric version and eligible count."""
    rows = list(slice_rows)
    return {"rule": WORST_SLICE_RULE, "metric_version": EVALUATION_METRIC_VERSION,
            "eligible_slice_count": sum(r["ref_voxels"] > 0 for r in rows), "count_unit": "pixels of the slice"}


def problematic_fp_slices(slice_rows: Iterable[dict]) -> dict:
    """FP-only slices (empty GT, non-empty prediction), labelled apart from the worst-slice rule."""
    rows = sorted((r for r in slice_rows if r["category"] == "PRED_ONLY"),
                  key=lambda r: (-r["fp"], r["slice_index"]))
    return {"label": "problematic FP slices (empty ground truth, non-empty prediction); "
                     "NOT the DR-010 worst anatomical slice",
            "slices": [{"slice_index": r["slice_index"], "false_positives": r["fp"]} for r in rows]}


def evaluate_case(case_id: str, pred, ref) -> dict:
    """Score one case at native resolution. Raises CaseEvaluationError when it cannot be scored."""
    c = confusion_counts(pred, ref)
    if c["ref_voxels"] == 0:
        raise CaseEvaluationError("REFERENCE_MASK_EMPTY",
                                  f"{case_id}: reference mask is empty; case-level metrics undefined")
    rows = per_slice_metrics(pred, ref)
    applicable = [r["dice"] for r in rows if r["dice"] is not None]
    selection = worst_slice_selection(rows)
    tp, fp, fn, pv, rv = c["tp"], c["fp"], c["fn"], c["pred_voxels"], c["ref_voxels"]
    record = {
        "case_id": case_id,
        "status": "SUCCEEDED",
        "dice_3d": dice_score(tp, fp, fn),
        "iou_3d": iou_score(tp, fp, fn),
        "tp_voxels": tp, "fp_voxels": fp, "fn_voxels": fn,
        "pred_voxels": pv, "ref_voxels": rv, "fp_fn_voxels": fp + fn,
        "fp_ratio_of_reference": fp / rv, "fn_ratio_of_reference": fn / rv,
        "relative_volume_error_percent": (pv - rv) / rv * 100.0,
        "volume_unit": VOLUME_UNIT,
        "num_slices": len(rows),
        "slices_applicable": len(applicable),
        "slices_not_applicable": sum(r["category"] == "BOTH_EMPTY" for r in rows),
        "slices_pred_only": sum(r["category"] == "PRED_ONLY" for r in rows),
        "slices_ref_only": sum(r["category"] == "REF_ONLY" for r in rows),
        "mean_slice_dice": float(np.mean(applicable)) if applicable else None,
        "median_slice_dice": float(np.median(applicable)) if applicable else None,
        "worst_slice_index": selection["slices"][0]["slice_index"] if selection["slices"] else None,
    }
    return {"record": record, "slices": rows, "worst_slice_selection": selection,
            "worst_slice_selection_meta": worst_slice_selection_meta(rows),
            "problematic_fp_slices": problematic_fp_slices(rows)}


# --- failed-case protocol -----------------------------------------------------------

def path_scrubber(replacements: dict[str, str]) -> Callable[[str], str]:
    """A function that replaces absolute path prefixes in a message with placeholders.

    Failure reasons are written into artifacts that may be shared; they must name files
    relative to the run directory or the package root, never by a machine's absolute path.
    Both separator styles and case are handled (Windows paths).
    """
    import re as _re
    pats = []
    for prefix, placeholder in sorted(replacements.items(), key=lambda kv: -len(kv[0])):
        if not prefix:
            continue
        variants = {prefix, prefix.replace("\\", "/"), prefix.replace("/", "\\")}
        for v in sorted(variants, key=len, reverse=True):
            pats.append((_re.compile(_re.escape(v), _re.IGNORECASE), placeholder))

    def scrub(message: str) -> str:
        for pat, placeholder in pats:
            message = pat.sub(placeholder, message)
        return message
    return scrub


def evaluate_population(intended_case_ids: Iterable[str],
                        load_pair: Callable[[str], tuple],
                        *, population: dict, prediction_variant: str,
                        reference_mask_kind: str = REFERENCE_MASK_KIND, log=None,
                        scrub: Callable[[str], str] = lambda m: m) -> dict:
    """Score every intended case; failures are recorded with a reason, never dropped.

    load_pair(case_id) -> (pred [Z,H,W], ref [Z,H,W], provenance dict). Any exception it
    raises becomes a failure record, EXCEPT a data-access refusal (DataAccessError), which
    is a protocol violation and propagates. Failure reasons pass through `scrub` (see
    path_scrubber) so no absolute path is recorded.
    """
    if prediction_variant not in PREDICTION_VARIANTS:
        raise ValueError(f"prediction_variant must be explicit: one of {PREDICTION_VARIANTS}")
    ids = list(intended_case_ids)
    if len(ids) != len(set(ids)) or not ids:
        raise ValueError("intended case ids must be non-empty and unique")
    if sorted(population.get("case_ids", ids)) != sorted(ids):
        raise ValueError("intended case ids differ from the declared population")
    cases, slices, selections, metas, fp_slices, provenance, failures = [], {}, {}, {}, {}, {}, []
    for n, cid in enumerate(ids, 1):
        try:
            pred, ref, prov = load_pair(cid)
            out = evaluate_case(cid, pred, ref)
        except D.DataAccessError:
            raise
        except CaseEvaluationError as exc:
            failures.append({"case_id": cid, "reason_code": exc.reason_code, "reason": scrub(str(exc))})
        except Exception as exc:  # noqa: BLE001 - every failure is recorded with its reason
            code = getattr(exc, "reason_code", "EVALUATION_ERROR")
            failures.append({"case_id": cid, "reason_code": code,
                             "reason": scrub(f"{type(exc).__name__}: {exc}")})
        else:
            cases.append(out["record"])
            slices[cid] = out["slices"]
            selections[cid] = out["worst_slice_selection"]
            metas[cid] = out["worst_slice_selection_meta"]
            fp_slices[cid] = out["problematic_fp_slices"]
            provenance[cid] = prov
        if log:
            log(f"  [{n}/{len(ids)}] {cid} " + ("ok" if cid in slices else f"FAILED {failures[-1]['reason_code']}"))
    return {
        "evaluation_metric_version": EVALUATION_METRIC_VERSION,
        "population": dict(population, case_ids=ids),
        "prediction_variant": prediction_variant,
        "reference_mask_kind": reference_mask_kind,
        "geometry_policy": GEOMETRY_POLICY,
        "volume_unit": VOLUME_UNIT,
        "intended_n": len(ids),
        "successful_n": len(cases),
        "failed_n": len(failures),
        "failures": failures,
        "cases": cases,
        "per_slice": slices,
        "worst_slice_selections": selections,
        "worst_slice_selection_meta": metas,
        "problematic_fp_slices": fp_slices,
        "provenance": provenance,
    }


# --- cohort statistics --------------------------------------------------------------

def bootstrap_ci_mean(values, *, seed: int = BOOTSTRAP["seed"],
                      resamples: int = BOOTSTRAP["resamples"], level: float = BOOTSTRAP["level"]) -> dict:
    """Percentile-bootstrap CI of the mean. Deterministic for a given seed."""
    x = np.asarray(list(values), dtype=np.float64)
    out = {"method": BOOTSTRAP["method"], "level": level, "resamples": resamples, "seed": seed}
    if x.size < 2:
        return dict(out, low=None, high=None, note=f"n={x.size}: an interval needs at least 2 cases")
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, x.size, size=(resamples, x.size))
    means = x[idx].mean(axis=1)
    lo, hi = np.quantile(means, [(1 - level) / 2, 1 - (1 - level) / 2])
    return dict(out, low=float(lo), high=float(hi))


def describe(values) -> dict:
    x = np.asarray(list(values), dtype=np.float64)
    if x.size == 0:
        return {"n": 0, "mean": None, "std": None, "median": None, "q1": None, "q3": None,
                "min": None, "max": None, "ci95_mean": bootstrap_ci_mean([])}
    q1, med, q3 = np.quantile(x, [0.25, 0.5, 0.75])
    return {"n": int(x.size), "mean": float(x.mean()),
            "std": float(x.std(ddof=1)) if x.size > 1 else None,
            "std_definition": "sample standard deviation (ddof=1)",
            "median": float(med), "q1": float(q1), "q3": float(q3),
            "min": float(x.min()), "max": float(x.max()), "ci95_mean": bootstrap_ci_mean(x)}


def outlier_selection(case_records: Iterable[dict]) -> dict:
    """DR-010 operational outlier: lowest three dice_3d among successfully evaluated cases."""
    ok = [r for r in case_records if r.get("status") == "SUCCEEDED" and r.get("dice_3d") is not None]
    ranked = sorted(ok, key=lambda r: (r["dice_3d"], -r["fp_fn_voxels"], r["case_id"]))[:3]
    return {"rule_id": OUTLIER_RULE_ID, "selection_version": OUTLIER_SELECTION_VERSION,
            "metric_version": EVALUATION_METRIC_VERSION, "rule": OUTLIER_RULE,
            "cases": [{"case_id": r["case_id"], "dice_3d": r["dice_3d"],
                       "fp_fn_voxels": r["fp_fn_voxels"]} for r in ranked]}


def cohort_summary(result: dict, *, exclude_case_ids: Iterable[str] = (),
                   metrics: Iterable[str] = SUMMARY_METRICS) -> dict:
    """Cohort statistics from per-case values, with intended / successful N and failures."""
    excluded = set(exclude_case_ids)
    population = list(result["population"]["case_ids"])
    unknown = excluded - set(population)
    if unknown:
        raise ValueError(f"cannot exclude cases outside the population: {sorted(unknown)}")
    intended = [c for c in population if c not in excluded]
    recs = [r for r in result["cases"] if r["case_id"] not in excluded]
    fails = [f for f in result["failures"] if f["case_id"] not in excluded]
    out = {
        "aggregation_level": "case (per-case values; voxels are never pooled across cases)",
        "evaluation_metric_version": result["evaluation_metric_version"],
        "prediction_variant": result["prediction_variant"],
        "population_role": result["population"].get("role"),
        "intended_n": len(intended),
        "successful_n": len(recs),
        "failed_n": len(fails),
        "failures": fails,
        "excluded_case_ids": sorted(excluded),
        "metrics": {},
    }
    for m in metrics:
        d = describe(r[m] for r in recs if r.get(m) is not None)
        if m in ZERO_ON_FAILURE:
            total = sum(r[m] for r in recs if r.get(m) is not None)
            d["mean_with_failures_as_zero"] = total / len(intended) if intended else None
            d["mean_with_failures_as_zero_definition"] = "sum over successful cases / intended N"
        out["metrics"][m] = d
    out["outlier_selection"] = outlier_selection(recs)
    return out


# --- comparability and paired comparison -----------------------------------------------

def comparability(a: dict, b: dict, *, same_prediction_variant: bool = True) -> dict:
    """The `08` section 7 comparable-run gate over two evaluation results."""
    pa, pb = a["population"], b["population"]
    same_population = (pa.get("role") == pb.get("role")
                       and sorted(pa["case_ids"]) == sorted(pb["case_ids"])
                       and (pa.get("sha256") is None or pb.get("sha256") is None
                            or pa.get("sha256") == pb.get("sha256")))
    variants_explicit = (a.get("prediction_variant") in PREDICTION_VARIANTS
                         and b.get("prediction_variant") in PREDICTION_VARIANTS)
    if same_prediction_variant:
        variants_explicit = variants_explicit and a["prediction_variant"] == b["prediction_variant"]
    checks = {
        "same_population": same_population,
        "same_evaluation_metric_version": a.get("evaluation_metric_version") == b.get("evaluation_metric_version"),
        "same_reference_mask_semantics": a.get("reference_mask_kind") == b.get("reference_mask_kind"),
        "explicit_prediction_variant": variants_explicit,
        "compatible_geometry_policy": a.get("geometry_policy") == b.get("geometry_policy"),
        "failures_reported": all(r.get("intended_n") == r.get("successful_n", -1) + len(r.get("failures", []))
                                 for r in (a, b)),
    }
    failed = [k for k, ok in checks.items() if not ok]
    return {"comparable": not failed, "label": "COMPARABLE" if not failed else "NON_COMPARABLE",
            "checks": checks, "failed_checks": failed,
            "same_prediction_variant_required": same_prediction_variant}


def paired_comparison(a: dict, b: dict, *, metric: str = "dice_3d",
                      exclude_case_ids: Iterable[str] = (), same_prediction_variant: bool = True) -> dict:
    """Per-case difference run_b - run_a on the same population, with a bootstrap 95% CI."""
    comp = comparability(a, b, same_prediction_variant=same_prediction_variant)
    excluded = set(exclude_case_ids)
    out = {"metric": metric, "difference_definition": "run_b - run_a, per case",
           "evaluation_metric_version": a.get("evaluation_metric_version"),
           "comparability": comp, "excluded_case_ids": sorted(excluded)}
    if not comp["comparable"]:
        out["paired_statistics"] = None
        out["note"] = ("NON_COMPARABLE: runs may be shown descriptively, but no delta is reported "
                       "as a head-to-head result (08 section 7)")
        return out
    population = [c for c in a["population"]["case_ids"] if c not in excluded]
    va = {r["case_id"]: r.get(metric) for r in a["cases"]}
    vb = {r["case_id"]: r.get(metric) for r in b["cases"]}
    paired = [c for c in population if va.get(c) is not None and vb.get(c) is not None]
    unpaired = [{"case_id": c, "missing_in": [k for k, v in (("run_a", va), ("run_b", vb))
                                              if v.get(c) is None]}
                for c in population if c not in paired]
    diffs = np.array([vb[c] - va[c] for c in paired], dtype=np.float64)
    stats = describe(diffs)
    stats.update({"n_pairs": len(paired), "intended_n": len(population),
                  "n_run_b_higher": int((diffs > 0).sum()), "n_run_a_higher": int((diffs < 0).sum()),
                  "n_equal": int((diffs == 0).sum())})
    out["paired_statistics"] = stats
    out["unpaired_cases"] = unpaired
    out["pairs"] = [{"case_id": c, "run_a": va[c], "run_b": vb[c], "difference": vb[c] - va[c]}
                    for c in paired]
    return out


# --- holdout reporting slots -----------------------------------------------------------

def holdout_slot_ids(split: dict) -> tuple[list[str], list[str]]:
    holdout = D.partition_case_ids(split, D.HOLDOUT_PARTITION)
    suspected = list((split.get("sensitivity_analysis") or {}).get("suspected_holdout_case_ids") or [])
    if not set(suspected) <= set(holdout):
        raise ValueError(f"suspected holdout ids outside the holdout: {sorted(set(suspected) - set(holdout))}")
    return holdout, suspected


def _require_holdout(result: dict, holdout: list[str]) -> None:
    if result["population"].get("role") != "FINAL_HOLDOUT" or \
            sorted(result["population"]["case_ids"]) != sorted(holdout):
        raise ValueError("holdout slots need the exact locked final_holdout population")


def holdout_report(result: dict, split: dict) -> dict:
    """primary_all_holdout and sensitivity_without_suspected_linkage cohort summaries."""
    holdout, suspected = holdout_slot_ids(split)
    _require_holdout(result, holdout)
    return {
        "primary_all_holdout": dict(population="all final_holdout cases", **cohort_summary(result)),
        "sensitivity_without_suspected_linkage": dict(
            population="final_holdout minus suspected development-to-holdout linkage",
            exclusion_basis="split manifest sensitivity_analysis.suspected_holdout_case_ids (DR-002b)",
            **cohort_summary(result, exclude_case_ids=suspected)),
    }


def paired_holdout_report(a: dict, b: dict, split: dict, *, metric: str = "dice_3d",
                          same_prediction_variant: bool = True) -> dict:
    holdout, suspected = holdout_slot_ids(split)
    _require_holdout(a, holdout)
    _require_holdout(b, holdout)
    return {
        "primary_all_holdout": paired_comparison(a, b, metric=metric,
                                                 same_prediction_variant=same_prediction_variant),
        "sensitivity_without_suspected_linkage": paired_comparison(
            a, b, metric=metric, exclude_case_ids=suspected,
            same_prediction_variant=same_prediction_variant),
    }


# --- run-directory driver ----------------------------------------------------------------

class PredictionUnavailable(RuntimeError):
    def __init__(self, reason_code: str, message: str):
        super().__init__(message)
        self.reason_code = reason_code


def _rel(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _rel_new(path: Path, root: Path) -> str:
    """Like _rel for a path that may not exist yet."""
    return Path(os.path.abspath(path)).relative_to(Path(os.path.abspath(root))).as_posix()


def load_run_split(run_dir: str | Path, partition: str, *,
                   frozen_split: str | Path = D.DEFAULT_SPLIT_MANIFEST,
                   allow_unfrozen_split: bool = False) -> tuple[dict, str]:
    """The run's copy of the split manifest - accepted only when it is byte-identical to the
    FROZEN split (the repository's split manifest unless another file is named explicitly).

    The holdout lock must not trust a file that lives in the run directory it protects: a
    split copy that moves a holdout case into validation, with every in-run sha256 updated,
    would otherwise get that case scored without any flag (QA probe H9).
    """
    run_dir = Path(run_dir)
    # the named split must itself be the FROZEN one, pinned by sha256 in ml.data (QA B-2, #64 R-1)
    frozen_sha = MF.require_frozen_split(frozen_split, allow_unfrozen_split=allow_unfrozen_split)
    pm = MF.validate_predictions_manifest(
        D.load_json(run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=partition)))
    ref = pm["split_manifest"]
    path = run_dir / ref["path"]
    digest = D.sha256_file(path)
    if digest != ref["sha256"]:
        raise MF.SplitMismatchError(f"{ref['path']}: sha256 {digest} != predictions manifest {ref['sha256']}")
    if digest != frozen_sha:
        raise MF.SplitMismatchError(f"the run's split copy (sha256 {digest}) is not the frozen split manifest "
                                    f"(sha256 {frozen_sha}); refusing to evaluate")
    return D.load_split_manifest(path), digest


def _authorize_holdout(run_dir: Path, pm: dict, split_sha: str, loaded: tuple[dict, str]) -> dict:
    """Verify the GATE-IMG-01 record (loaded by ml.holdout.load_record) for this run (#64 N-1)
    before any holdout case is read: it must authorize this experiment_id with the sha256 of THIS
    run's checkpoints/best.pt, the predictions must have been made with that checkpoint, under the
    very same record."""
    if pm["checkpoint"].get("path") != H.BEST_CHECKPOINT:
        raise H.HoldoutAuthorizationError(f"holdout predictions must come from {H.BEST_CHECKPOINT}, "
                                          f"not {pm['checkpoint'].get('path')!r}")
    best = run_dir / H.BEST_CHECKPOINT
    if not best.is_file():
        raise H.HoldoutAuthorizationError(f"{H.BEST_CHECKPOINT} is missing; the authorization cannot be verified")
    best_sha = D.sha256_file(best)
    block = H.verified_block(*loaded, split_sha256=split_sha, experiment_id=pm["experiment_id"],
                             checkpoint_sha256=best_sha, prediction_variant=pm["prediction_variant"],
                             postprocessing_config_sha256=pm.get("postprocessing_config_sha256"))
    if pm["checkpoint"]["sha256"] != best_sha:
        raise H.HoldoutAuthorizationError(f"the holdout predictions were made with checkpoint sha256 "
                                          f"{pm['checkpoint']['sha256']}, not this run's {H.BEST_CHECKPOINT}")
    H.require_same_record(pm["holdout_authorization"], block)
    return block


def evaluate_run(run_dir: str | Path, partition: str, *, dataset_manifest: dict | None = None,
                 package_root: str | Path = D.DEFAULT_PACKAGE_ROOT, allow_holdout: bool = False,
                 split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST, allow_unfrozen_split: bool = False,
                 holdout_authorization: str | os.PathLike | None = None, log=print) -> Path:
    """Score <run>/predictions/<partition>/ against the reference masks; write <run>/evaluation/<partition>/.

    split_manifest is the FROZEN split the run must have used (default: the repository's).
    final_holdout needs allow_holdout=True AND holdout_authorization, the path of the GATE-IMG-01
    record (ml.holdout); it never accepts the TEST-ONLY allow_unfrozen_split.
    """
    run_dir = Path(run_dir)
    if partition not in ("validation", D.HOLDOUT_PARTITION):
        raise ValueError("partition must be 'validation' or 'final_holdout'")
    holdout = partition == D.HOLDOUT_PARTITION
    loaded = None
    if holdout:
        if allow_holdout is not True:
            raise D.HoldoutAccessError("evaluating the final holdout needs allow_holdout=True")
        H.refuse_unfrozen_split(partition, allow_unfrozen_split)
        if holdout_authorization is None:
            raise H.HoldoutAuthorizationError("evaluating the final holdout needs the GATE-IMG-01 authorization "
                                              "record (holdout_authorization / --holdout-authorization)")
        loaded = H.load_record(holdout_authorization)    # JSON + structure first; run checks below
    elif holdout_authorization is not None:
        raise ValueError("a holdout authorization was given for the validation population")
    H.refuse_split_inside_run(split_manifest, run_dir)
    out_dir = run_dir / MF.RUN_LAYOUT["evaluation"].format(partition=partition)
    if out_dir.exists():
        raise FileExistsError(f"{out_dir} exists; recorded evaluations are immutable")
    pm_path = run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=partition)
    pm = MF.validate_predictions_manifest(D.load_json(pm_path))
    if pm["population"]["partition"] != partition or pm["population"]["role"] != MF.ROLES[partition]:
        raise ValueError(f"{MF.RUN_LAYOUT['predictions_manifest'].format(partition=partition)}: population is "
                         f"{pm['population']['partition']!r} / role {pm['population']['role']!r}, not "
                         f"{partition!r} / {MF.ROLES[partition]!r}")
    split, split_sha = load_run_split(run_dir, partition, frozen_split=split_manifest,
                                      allow_unfrozen_split=allow_unfrozen_split)
    authorization = None
    if holdout:
        authorization = _authorize_holdout(run_dir, pm, split_sha, loaded)
        allow = D.CaseAllowlist.for_holdout(split, allow_holdout=True)
    else:
        allow = D.CaseAllowlist.for_validation(split)
    pop_ref = pm["population"]
    pop_path = run_dir / pop_ref["path"]
    if D.sha256_file(pop_path) != pop_ref["sha256"]:
        raise ValueError(f"{pop_path}: population manifest sha256 differs from the predictions manifest")
    pop = D.load_json(pop_path)
    if pop.get("role") != MF.ROLES[partition] or pop.get("partition") != partition:
        raise ValueError(f"population manifest declares role {pop.get('role')!r} / partition "
                         f"{pop.get('partition')!r}, expected {MF.ROLES[partition]!r} / {partition!r}")
    if pop.get("source_split_manifest_sha256") != split_sha or sorted(pop["case_ids"]) != sorted(allow.case_ids):
        raise ValueError("population manifest does not match the run's split manifest partition")
    intended = list(pm["intended_case_ids"])
    if sorted(intended) != sorted(allow.case_ids):
        raise ValueError("predictions do not cover the exact population; no silent subset")
    dataset_manifest = dataset_manifest or D.load_dataset_manifest()
    paths = D.case_paths(dataset_manifest, package_root, allowlist=allow)
    pred_dir = pm_path.parent
    by_case = {c["case_id"]: c for c in pm["cases"]}
    scrub = path_scrubber({str(run_dir.resolve()): "<run>", str(run_dir): "<run>",
                           str(Path(package_root).resolve()): "<package_root>",
                           str(package_root): "<package_root>"})

    def load_pair(cid: str):
        entry = by_case.get(cid)
        if entry is None:
            raise PredictionUnavailable("NO_PREDICTION_RECORD", f"{cid}: no entry in the predictions manifest")
        if entry.get("status") != "SUCCEEDED":
            raise PredictionUnavailable("INFERENCE_FAILED", f"{cid}: {entry.get('failure_reason')}")
        pred_file = pred_dir / entry["file"]
        if not pred_file.is_file():
            raise PredictionUnavailable("PREDICTION_FILE_MISSING",
                                        f"{cid}: {_rel_new(pred_file, run_dir)} is missing")
        pred, pred_header, digest = D.read_nrrd_zyx(pred_file)
        if digest != entry["sha256"]:
            raise CaseEvaluationError("PREDICTION_CHECKSUM_MISMATCH", f"{cid}: prediction file changed")
        ref, ref_header, ref_sha = D.load_mask(cid, paths)
        for key in ("space", "space directions", "space origin"):
            if key in ref_header and not np.array_equal(np.asarray(pred_header.get(key)),
                                                        np.asarray(ref_header[key])):
                raise CaseEvaluationError("GEOMETRY_MISMATCH", f"{cid}: prediction header {key} differs")
        return pred, ref, {"prediction_file": _rel(pred_dir / entry["file"], run_dir),
                           "prediction_sha256": digest,
                           "reference_path_relative": paths[cid].mask_relative,
                           "reference_sha256": ref_sha}

    population = {"role": pop["role"], "partition": partition, "manifest_id": pop["manifest_id"],
                  "path": pop_ref["path"], "sha256": pop_ref["sha256"], "case_ids": intended}
    result = evaluate_population(intended, load_pair, population=population,
                                 prediction_variant=pm["prediction_variant"], log=log, scrub=scrub)
    recorded = {"frozen_split": {"pinned_sha256": D.FROZEN_SPLIT_SHA256, "split_sha256": split_sha,
                                 "is_frozen": split_sha == D.FROZEN_SPLIT_SHA256,
                                 "allow_unfrozen_split": bool(allow_unfrozen_split)},
                "holdout_authorization": authorization}
    return write_evaluation(run_dir, partition, result, experiment_id=pm["experiment_id"],
                            predictions_manifest=pm, predictions_manifest_path=pm_path, split=split,
                            manifest_extra=recorded)


def write_evaluation(run_dir: Path, partition: str, result: dict, *, experiment_id: str,
                     predictions_manifest: dict, predictions_manifest_path: Path, split: dict,
                     manifest_extra: dict | None = None) -> Path:
    """Write every evaluation file into a temporary directory, then rename it into place.

    The rename is the commit point: evaluation/<partition>/ either does not exist or is
    complete, so an interrupted evaluation can simply be run again. Recorded paths are the
    final ones. On any failure before the rename the temporary directory is removed.
    manifest_extra (frozen split facts, the holdout authorization) goes into the evaluation manifest.
    """
    final_dir = run_dir / MF.RUN_LAYOUT["evaluation"].format(partition=partition)
    tmp_dir = final_dir.with_name(f".{final_dir.name}.{uuid.uuid4().hex[:8]}.tmp")
    tmp_dir.mkdir(parents=True, exist_ok=False)
    try:
        _write_evaluation_files(run_dir, tmp_dir, final_dir, partition, result, experiment_id=experiment_id,
                                predictions_manifest=predictions_manifest,
                                predictions_manifest_path=predictions_manifest_path, split=split,
                                manifest_extra=manifest_extra or {})
        os.rename(tmp_dir, final_dir)          # commit point; fails if final_dir appeared meanwhile
    except BaseException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    return final_dir


def _write_evaluation_files(run_dir: Path, tmp_dir: Path, final_dir: Path, partition: str, result: dict, *,
                            experiment_id: str, predictions_manifest: dict, predictions_manifest_path: Path,
                            split: dict, manifest_extra: dict) -> None:
    final_rel = _rel_new(final_dir, run_dir)
    exp = experiment_id
    header = {k: result[k] for k in ("evaluation_metric_version", "population", "prediction_variant",
                                     "reference_mask_kind", "geometry_policy", "volume_unit",
                                     "intended_n", "successful_n", "failed_n", "failures")}
    header["experiment_id"] = exp
    files = {}
    per_case = dict(header, format="ml-per-case-metrics/1", cases=result["cases"])
    files["per_case_metrics"] = MF.write_json_new(tmp_dir / "per_case_metrics.json", per_case)
    per_slice = dict(header, format="ml-per-slice-metrics/1", empty_slice_rule=EMPTY_SLICE_RULE,
                     cases=result["per_slice"])
    files["per_slice_metrics"] = MF.write_json_new(tmp_dir / "per_slice_metrics.json", per_slice)
    summary = dict(header, format="ml-metrics-summary/1", bootstrap=BOOTSTRAP,
                   cohort=cohort_summary(result))
    if partition == D.HOLDOUT_PARTITION:
        summary["holdout_slots"] = holdout_report(result, split)
    files["metrics_summary"] = MF.write_json_new(tmp_dir / "metrics_summary.json", summary)
    metric_sets = {}
    for rec in result["cases"]:
        cid = rec["case_id"]
        prov = result["provenance"][cid]
        ms = {"format": "ml-metric-set/1", "experiment_id": exp, "case_id": cid,
              "evaluation_metric_version": result["evaluation_metric_version"],
              "prediction_mask": {"kind": result["prediction_variant"], "path": prov["prediction_file"],
                                  "sha256": prov["prediction_sha256"]},
              "reference_mask": {"kind": result["reference_mask_kind"],
                                 "dataset_path_relative": prov["reference_path_relative"],
                                 "sha256": prov["reference_sha256"]},
              "metrics": rec,
              "worst_slice_selection": result["worst_slice_selections"][cid],
              "worst_slice_selection_meta": result["worst_slice_selection_meta"][cid],
              "problematic_fp_slices": result["problematic_fp_slices"][cid]}
        metric_sets[cid] = MF.write_json_new(tmp_dir / "metric_sets" / f"{cid}.json", ms)

    def recorded(p: Path) -> dict:            # the FINAL path, the hash of the bytes written
        return {"path": f"{final_rel}/{p.relative_to(tmp_dir).as_posix()}", "sha256": D.sha256_file(p)}

    cv = MF.code_version()
    manifest = {
        "format": "ml-evaluation/1",
        "experiment_id": exp,
        "partition": partition,
        "evaluation_metric_version": result["evaluation_metric_version"],
        "evaluation_code_version": cv["version"],
        "evaluation_code_dirty": cv["dirty"],
        "population": dict(result["population"], case_count=result["intended_n"]),
        "prediction_variant": result["prediction_variant"],
        "postprocessing_version": predictions_manifest.get("postprocessing_version"),
        "predictions_manifest": {"path": _rel(predictions_manifest_path, run_dir),
                                 "sha256": D.sha256_file(predictions_manifest_path)},
        "intended_n": result["intended_n"], "successful_n": result["successful_n"],
        "failed_n": result["failed_n"],
        "outputs": {k: recorded(p) for k, p in files.items()},
        "metric_sets": {cid: recorded(p) for cid, p in metric_sets.items()},
        **manifest_extra,
        "created_at": MF.now_iso(),
    }
    MF.write_json_new(tmp_dir / "evaluation_manifest.json", manifest)


def load_evaluation(run_dir: str | Path, partition: str) -> dict:
    """The per-case metrics of a recorded evaluation, as a result dict for comparisons."""
    return D.load_json(Path(run_dir) / "evaluation" / partition / "per_case_metrics.json")


# --- CLI -------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="score one run's predictions for one population")
    r.add_argument("--run-dir", required=True, type=Path)
    r.add_argument("--population", required=True, choices=["validation", D.HOLDOUT_PARTITION])
    r.add_argument("--allow-holdout", action="store_true",
                   help="required, with --holdout-authorization, to score final_holdout")
    r.add_argument("--holdout-authorization", type=Path, default=None, metavar="RECORD_JSON",
                   help="the GATE-IMG-01 authorization record (format ml-holdout-authorization/1, ml/README.md)")
    r.add_argument("--dataset-manifest", type=Path, default=D.DEFAULT_DATASET_MANIFEST)
    r.add_argument("--package-root", type=Path, default=D.DEFAULT_PACKAGE_ROOT)
    r.add_argument("--split-manifest", type=Path, default=D.DEFAULT_SPLIT_MANIFEST,
                   help="the FROZEN split (default: the repository's); any other sha256 is refused")
    c = sub.add_parser("compare", help="paired comparison of two recorded evaluations")
    c.add_argument("--run-a", required=True, type=Path)
    c.add_argument("--run-b", required=True, type=Path)
    c.add_argument("--population", required=True, choices=["validation", D.HOLDOUT_PARTITION])
    c.add_argument("--metric", default="dice_3d")
    c.add_argument("--allow-variant-mismatch", action="store_true",
                   help="for the raw-vs-processed ablation (EXP-D-PP) only")
    c.add_argument("--split-manifest", type=Path, default=D.DEFAULT_SPLIT_MANIFEST,
                   help="the FROZEN split (default: the repository's); any other sha256 is refused")
    c.add_argument("--out", type=Path, help="write the comparison to this NEW JSON file")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "run":
            if args.holdout_authorization is not None and args.population != D.HOLDOUT_PARTITION:
                raise ValueError("--holdout-authorization only applies to --population final_holdout")
            out = evaluate_run(args.run_dir, args.population,
                               dataset_manifest=D.load_dataset_manifest(args.dataset_manifest),
                               package_root=args.package_root, allow_holdout=args.allow_holdout,
                               split_manifest=args.split_manifest,
                               holdout_authorization=args.holdout_authorization)
            print(f"wrote {out}")
            return 0
        report = compare_runs(args.run_a, args.run_b, args.population, metric=args.metric,
                              same_prediction_variant=not args.allow_variant_mismatch,
                              split_manifest=args.split_manifest)
    except (D.DataAccessError, FileExistsError, FileNotFoundError, ValueError) as exc:
        print(f"REFUSED: {type(exc).__name__}: {exc}")
        return 2
    if args.out:
        MF.write_json_new(args.out, report)
        print(f"wrote {args.out}")
    else:
        print(json.dumps(report, indent=1))
    return 0


def compare_runs(run_a: str | Path, run_b: str | Path, population: str, *, metric: str = "dice_3d",
                 same_prediction_variant: bool = True,
                 split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST,
                 allow_unfrozen_split: bool = False) -> dict:
    """Paired comparison of two recorded evaluations of the same population.

    Both runs must have used the FROZEN split (load_run_split); the holdout population also
    reports the two holdout slots and never accepts the TEST-ONLY allow_unfrozen_split.
    """
    H.refuse_unfrozen_split(population, allow_unfrozen_split)
    for run in (run_a, run_b):
        H.refuse_split_inside_run(split_manifest, run)
    split, _ = load_run_split(run_a, population, frozen_split=split_manifest,
                              allow_unfrozen_split=allow_unfrozen_split)
    load_run_split(run_b, population, frozen_split=split_manifest, allow_unfrozen_split=allow_unfrozen_split)
    a, b = load_evaluation(run_a, population), load_evaluation(run_b, population)
    if population == D.HOLDOUT_PARTITION:
        report = paired_holdout_report(a, b, split, metric=metric, same_prediction_variant=same_prediction_variant)
    else:
        report = paired_comparison(a, b, metric=metric, same_prediction_variant=same_prediction_variant)
    return {"format": "ml-paired-comparison/1", "run_a": a.get("experiment_id"),
            "run_b": b.get("experiment_id"), "population": population, "bootstrap": BOOTSTRAP,
            "report": report}


if __name__ == "__main__":
    raise SystemExit(main())
