"""Metric endpoints, served from the saved Contract 2 metric artifacts.

Source formats (``ml/evaluate.py``, evaluation_metric_version ``ml-eval-1.0.0``):

    METRICS_SUMMARY     ml-metrics-summary/1   cohort statistics (+ bootstrap 95 % CIs)
    PER_CASE_METRICS    ml-per-case-metrics/1  one record per successful case + failures
    PER_SLICE_METRICS   ml-per-slice-metrics/1 per case, one row per slice (07 section 6)
    METRIC_SET          ml-metric-set/1        one case: prediction/reference identity

Every value served comes from those files; nothing is recomputed from images
and nothing is invented. When an artifact is missing, malformed, or its
provenance does not match what this backend ingested, the endpoint answers the
contract's unavailable state (``ARTIFACT_NOT_FOUND`` with a reason).

The two DR-010 selections are applied here, on the server, from the saved
per-slice and per-case values (the client never ranks):

- worst slice: slices with non-empty ground truth, Dice ascending, then
  FP+FN descending, then slice_index ascending - every eligible slice, ranked;
- outlier: the three SUCCEEDED cases with the lowest case Dice, then FP+FN
  descending, then case_id ascending. An INFERENCE_REVIEW case (INT-12) is
  WITHHELD and never a candidate; cohort summaries keep the whole population.
"""

from __future__ import annotations

import json
import math
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .contract import ApiError

FORMATS = {
    "metrics_summary": "ml-metrics-summary/1",
    "per_case_metrics": "ml-per-case-metrics/1",
    "per_slice_metrics": "ml-per-slice-metrics/1",
}
METRIC_SET_FORMAT = "ml-metric-set/1"
C2_VARIANT = {"RAW_PREDICTION": "RAW", "PROCESSED_PREDICTION": "PROCESSED"}
# contract metric name -> (per-case record key, summary metric key)
METRIC_SOURCES = {
    "dice": ("dice_3d", "dice_3d"),
    "iou": ("iou_3d", "iou_3d"),
    "false_positives": ("fp_voxels", "fp_voxels"),
    "false_negatives": ("fn_voxels", "fn_voxels"),
    "relative_volume_error": ("relative_volume_error_percent", "relative_volume_error_percent"),
}
SUMMARY_STATISTICS = ["n", "mean", "std", "median", "q1", "q3", "min", "max", "ci95_low", "ci95_high"]
WORST_SLICE = {"rule_id": "DR-010", "selection_version": "dr010-worst-slice/v1"}
OUTLIER = {"rule_id": "DR-010", "selection_version": "dr010-outlier/v1", "metric_name": "dice", "cardinality": 3}
WITHHELD_REASON = "INFERENCE_REVIEW case (INT-12): ground-truth-derived values are withheld by the app"


def _unavailable(reason: str, **detail: Any) -> ApiError:
    return ApiError("ARTIFACT_NOT_FOUND", dict({"reason": reason}, **detail))


def _number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return value


def _metric_values(record: dict) -> Dict[str, Any]:
    values = {name: record.get(source) for name, (source, _) in METRIC_SOURCES.items()}
    for key in ("false_positives", "false_negatives"):
        if not isinstance(values[key], int) or isinstance(values[key], bool):
            raise _unavailable("METRICS_FORMAT_UNSUPPORTED", field=key)
    for key in ("dice", "iou"):
        if _number(values[key]) is None or not 0.0 <= values[key] <= 1.0:
            raise _unavailable("METRICS_FORMAT_UNSUPPORTED", field=key)
    values["relative_volume_error"] = _number(values["relative_volume_error"])
    return values


def _statistics(values: List[float]) -> Dict[str, Optional[float]]:
    """n/mean/std/median/q1/q3/min/max of saved per-case values; no CI is computed here."""
    data = sorted(value for value in values if _number(value) is not None)
    n = len(data)
    if n == 0:
        return {key: (0 if key == "n" else None) for key in SUMMARY_STATISTICS}

    def quantile(q: float) -> float:  # numpy's default (linear) definition
        position = (n - 1) * q
        low = int(math.floor(position))
        high = min(low + 1, n - 1)
        return data[low] + (data[high] - data[low]) * (position - low)

    mean = sum(data) / n
    std = math.sqrt(sum((value - mean) ** 2 for value in data) / (n - 1)) if n > 1 else None
    return {"n": n, "mean": mean, "std": std, "median": quantile(0.5), "q1": quantile(0.25),
            "q3": quantile(0.75), "min": data[0], "max": data[-1], "ci95_low": None, "ci95_high": None}


class PackageMetrics:
    """The saved metric artifacts of one Contract 2 package, loaded and checked once."""

    def __init__(self, package: Any):
        self.package = package
        documents = {}
        for key, expected in FORMATS.items():
            try:
                path = package.experiment_artifact_path(key)
                document = json.loads(Path(path).read_text(encoding="utf-8"))
            except (KeyError, OSError, ValueError):
                raise _unavailable("METRICS_NOT_READABLE", artifact=key)
            if not isinstance(document, dict) or document.get("format") != expected:
                raise _unavailable("METRICS_FORMAT_UNSUPPORTED", artifact=key, expected=expected)
            if document.get("experiment_id") != package.experiment["experiment_id"]:
                raise _unavailable("METRICS_PROVENANCE_MISMATCH", artifact=key)
            documents[key] = document
        versions = {document.get("evaluation_metric_version") for document in documents.values()}
        if versions != {package.experiment["evaluation_metric_version"]}:
            raise _unavailable("METRICS_PROVENANCE_MISMATCH", detail="evaluation_metric_version differs")
        variants = {document.get("prediction_variant") for document in documents.values()}
        if variants != {package.experiment["prediction_variant"]}:
            raise _unavailable("METRICS_PROVENANCE_MISMATCH", detail="prediction_variant differs")
        self.metric_version: str = package.experiment["evaluation_metric_version"]
        self.variant: str = C2_VARIANT[package.experiment["prediction_variant"]]
        per_case = documents["per_case_metrics"]
        self.population: List[str] = list(per_case["population"]["case_ids"])
        self.records: Dict[str, dict] = {record["case_id"]: record for record in per_case["cases"]
                                         if record.get("status") == "SUCCEEDED"}
        self.failures: Dict[str, dict] = {item["case_id"]: item for item in per_case.get("failures", [])}
        self.per_slice: Dict[str, List[dict]] = documents["per_slice_metrics"]["cases"]
        self.cohort: dict = documents["metrics_summary"]["cohort"]
        self.intended_n: int = int(documents["metrics_summary"]["intended_n"])
        self.successful_n: int = int(documents["metrics_summary"]["successful_n"])

    def metric_set(self, run: Any, mask_id: str) -> Tuple[dict, dict]:
        """The METRIC_SET artifact of this run for this prediction mask, and its document."""
        for metric_id in run.metric_set_ids:
            artifact = self.package.artifacts.get(metric_id)
            if artifact and artifact.get("prediction_mask_id") == mask_id:
                try:
                    document = json.loads(self.package.artifact_path(metric_id).read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    raise _unavailable("METRICS_NOT_READABLE", artifact=metric_id)
                if document.get("format") != METRIC_SET_FORMAT or document.get("case_id") != run.case_id:
                    raise _unavailable("METRICS_FORMAT_UNSUPPORTED", artifact=metric_id)
                return artifact, document
        raise _unavailable("NO_METRIC_SET_FOR_VARIANT", run_id=run.run_id, prediction_mask_id=mask_id)


def worst_slice_selection(rows: List[dict]) -> Dict[str, Any]:
    eligible = [row for row in rows if int(row.get("ref_voxels", 0)) > 0]
    for row in eligible:
        if _number(row.get("dice")) is None:
            raise _unavailable("METRICS_FORMAT_UNSUPPORTED", detail="an eligible slice has no Dice")
    ranked = sorted(eligible, key=lambda row: (row["dice"], -(int(row["fp"]) + int(row["fn"])), int(row["slice_index"])))
    return dict(WORST_SLICE, slices=[{"slice_index": int(row["slice_index"]), "dice": float(row["dice"]),
                                      "false_positives": int(row["fp"]), "false_negatives": int(row["fn"])}
                                     for row in ranked])


class MetricsService:
    def __init__(self, experiments: Any, cases: Any):
        self.experiments = experiments
        self.cases = cases
        self._loaded: Dict[str, PackageMetrics] = {}
        self._lock = threading.Lock()

    def package_metrics(self, package: Any) -> PackageMetrics:
        with self._lock:
            loaded = self._loaded.get(package.manifest_id)
        if loaded is None:
            loaded = PackageMetrics(package)
            with self._lock:
                self._loaded[package.manifest_id] = loaded
        return loaded

    def withheld(self, case_id: str) -> bool:
        return case_id in self.cases.inference_only_ids

    # -- one run ---------------------------------------------------------------
    def _run_context(self, run: Any, variant: str) -> Tuple[PackageMetrics, dict, dict, List[dict]]:
        loaded = self.package_metrics(run.package)
        if variant != loaded.variant:
            raise _unavailable("NO_METRICS_FOR_VARIANT", evaluated_variant=loaded.variant)
        mask_id = run.mask_id(variant)
        artifact, document = loaded.metric_set(run, mask_id)
        prediction_checksum = run.package.artifacts[mask_id]["checksum"]["value"]
        if (document.get("prediction_mask") or {}).get("sha256") != prediction_checksum:
            raise _unavailable("METRICS_PROVENANCE_MISMATCH", detail="metric set scored other prediction bytes")
        case = self.cases.get(run.case_id)
        reference_sha = (document.get("reference_mask") or {}).get("sha256")
        if case is None or case.data.get("mask_sha256") is None or reference_sha != case.data["mask_sha256"]:
            raise _unavailable("METRICS_PROVENANCE_MISMATCH",
                               detail="metric set scored a reference mask this backend did not ingest")
        rows = loaded.per_slice.get(run.case_id)
        if not isinstance(rows, list) or len(rows) != case.nz:
            raise _unavailable("METRICS_FORMAT_UNSUPPORTED", detail="per-slice rows do not cover the volume")
        return loaded, artifact, document, rows

    def run_metrics(self, run: Any, variant: str) -> Dict[str, Any]:
        loaded, artifact, document, rows = self._run_context(run, variant)
        record = document.get("metrics") or {}
        selection = worst_slice_selection(rows)
        saved = document.get("worst_slice_selection") or {}
        if saved.get("slices") is not None and [s["slice_index"] for s in saved["slices"]] != \
                [s["slice_index"] for s in selection["slices"]][: len(saved["slices"])]:
            raise _unavailable("SELECTION_INCONSISTENT", detail="saved worst-slice order differs from DR-010")
        return {
            "reference_mask_id": self.cases.get(run.case_id).reference_mask_id,
            "prediction_mask_id": artifact["prediction_mask_id"],
            "prediction_variant": variant,
            "aggregation_level": "CASE_3D",
            "metric_state": "COMPUTED",
            "metric_version": loaded.metric_version,
            "metric_values": _metric_values(record),
            "worst_slice_selection": selection,
        }

    def slice_metrics(self, run: Any, variant: str, slice_index: int) -> Dict[str, Any]:
        loaded, artifact, _document, rows = self._run_context(run, variant)
        row = rows[slice_index]
        if int(row.get("slice_index", -1)) != slice_index:
            raise _unavailable("METRICS_FORMAT_UNSUPPORTED", detail="per-slice rows are out of order")
        dice = _number(row.get("dice"))
        applicable = row.get("dice_status") != "NOT_APPLICABLE" and dice is not None
        return {
            "slice_index": slice_index,
            "metric_state": "COMPUTED" if applicable else "NOT_APPLICABLE",
            "metric_value": dice if applicable else None,
            "reference_mask_id": self.cases.get(run.case_id).reference_mask_id,
            "prediction_mask_id": artifact["prediction_mask_id"],
            "metric_version": loaded.metric_version,
        }

    def slice_error(self, run: Any, variant: str, slice_index: int) -> Dict[str, Any]:
        raise _unavailable("NO_ERROR_ARTIFACT", detail="no versioned slice-error artifact is exported; "
                                                       "derive the overlay from the GT and prediction slices")

    # -- one experiment --------------------------------------------------------
    def experiment_metrics(self, package: Any) -> Dict[str, Any]:
        loaded = self.package_metrics(package)
        source = loaded.cohort.get("metrics") or {}
        summary = {}
        for name, (_record_key, summary_key) in METRIC_SOURCES.items():
            stats = source.get(summary_key) or {}
            ci = stats.get("ci95_mean") or {}
            summary[name] = {
                "n": stats.get("n") if isinstance(stats.get("n"), int) else None,
                "mean": _number(stats.get("mean")), "std": _number(stats.get("std")),
                "median": _number(stats.get("median")), "q1": _number(stats.get("q1")),
                "q3": _number(stats.get("q3")), "min": _number(stats.get("min")), "max": _number(stats.get("max")),
                "ci95_low": _number(ci.get("low")), "ci95_high": _number(ci.get("high")),
            }
        return {"evaluation_n": loaded.intended_n, "successful_n": loaded.successful_n,
                "metric_summary": summary, "prediction_variant": loaded.variant,
                "metric_version": loaded.metric_version}

    def experiment_cases(self, package: Any) -> Dict[str, Any]:
        if not self.cases.modes_known:
            raise _unavailable("CASE_MODES_UNKNOWN", detail="the data cache does not record the INT-12 designation")
        loaded = self.package_metrics(package)
        rows = []
        for case_id in sorted(loaded.population, key=lambda value: int(value.split("_", 1)[1])):
            run_id = package.run_by_case.get(case_id)
            if case_id in loaded.failures:
                failure = loaded.failures[case_id]
                rows.append({"case_id": case_id, "status": "FAILED",
                             "reason": f"{failure.get('reason_code')}: {failure.get('reason')}",
                             "analysis_run_id": run_id, "metric_values": None})
            elif case_id in loaded.records and self.withheld(case_id):
                rows.append({"case_id": case_id, "status": "WITHHELD", "reason": WITHHELD_REASON,
                             "analysis_run_id": run_id, "metric_values": None})
            elif case_id in loaded.records:
                rows.append({"case_id": case_id, "status": "SUCCEEDED", "reason": None,
                             "analysis_run_id": run_id, "metric_values": _metric_values(loaded.records[case_id])})
            else:
                rows.append({"case_id": case_id, "status": "EXCLUDED",
                             "reason": "no saved per-case result for this population case",
                             "analysis_run_id": run_id, "metric_values": None})
        candidates = [row for row in rows if row["status"] == "SUCCEEDED"]
        ranked = sorted(candidates, key=lambda row: (
            row["metric_values"]["dice"],
            -(row["metric_values"]["false_positives"] + row["metric_values"]["false_negatives"]),
            row["case_id"]))
        return {
            "items": rows,
            "metric_version": loaded.metric_version,
            "prediction_variant": loaded.variant,
            "outlier_selection": {
                "rule_id": OUTLIER["rule_id"], "selection_version": OUTLIER["selection_version"],
                "experiment_id": package.experiment["experiment_id"], "prediction_variant": loaded.variant,
                "metric_name": OUTLIER["metric_name"],
                "cases": [{"case_id": row["case_id"], "analysis_run_id": row["analysis_run_id"],
                           "metric_value": row["metric_values"]["dice"],
                           "false_positives": row["metric_values"]["false_positives"],
                           "false_negatives": row["metric_values"]["false_negatives"]}
                          for row in ranked[: OUTLIER["cardinality"]]],
            },
        }

    def compare(self, packages: List[Any]) -> Dict[str, Any]:
        loaded = [self.package_metrics(package) for package in packages]

        def same(values: List[Any]) -> bool:
            return len(set(values)) == 1

        checks = {
            "same evaluation population": same([p.experiment["evaluation_population_manifest"]["checksum"]["value"]
                                                for p in packages]),
            "same split manifest": same([p.experiment["split_manifest"]["checksum"]["value"] for p in packages]),
            "same evaluation metric version": same([item.metric_version for item in loaded]),
            "same prediction variant": same([item.variant for item in loaded]),
        }
        failed = [name for name, ok in checks.items() if not ok]
        common = sorted(set.intersection(*[set(item.records) for item in loaded]),
                        key=lambda value: int(value.split("_", 1)[1]))
        summary = {}
        for package, item in zip(packages, loaded):
            summary[package.experiment["experiment_id"]] = {
                name: _statistics([item.records[case_id].get(record_key) for case_id in common])
                for name, (record_key, _summary_key) in METRIC_SOURCES.items()
            }
        return {
            "comparable": not failed,
            "compatibility_reason": None if not failed else "not " + "; not ".join(failed),
            "common_evaluation_population": common,
            "metric_version": loaded[0].metric_version if checks["same evaluation metric version"] else None,
            "prediction_variant": loaded[0].variant if checks["same prediction variant"] else None,
            "summary": summary,
        }
