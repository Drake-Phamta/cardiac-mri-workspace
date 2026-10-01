"""Metric endpoints' data source.

Until saved Contract 2 metric artifacts are ingested (PR 3), every metric
query answers the contract's legitimately-unavailable state. A number is never
synthesised here (metric_rules.unavailable_rule).
"""

from __future__ import annotations

from typing import Any, Dict

from .contract import ApiError

NOT_INGESTED = {"reason": "METRICS_NOT_INGESTED", "detail": "no saved Contract 2 metric artifact is served yet"}


class MetricsService:
    def __init__(self, experiments: Any, cases: Any):
        self.experiments = experiments
        self.cases = cases

    def run_metrics(self, run: Any, variant: str) -> Dict[str, Any]:
        raise ApiError("ARTIFACT_NOT_FOUND", dict(NOT_INGESTED))

    def slice_metrics(self, run: Any, variant: str, slice_index: int) -> Dict[str, Any]:
        raise ApiError("ARTIFACT_NOT_FOUND", dict(NOT_INGESTED))

    def slice_error(self, run: Any, variant: str, slice_index: int) -> Dict[str, Any]:
        raise ApiError("ARTIFACT_NOT_FOUND", dict(NOT_INGESTED))

    def experiment_metrics(self, package: Any) -> Dict[str, Any]:
        raise ApiError("ARTIFACT_NOT_FOUND", dict(NOT_INGESTED))

    def experiment_cases(self, package: Any) -> Dict[str, Any]:
        raise ApiError("ARTIFACT_NOT_FOUND", dict(NOT_INGESTED))

    def compare(self, packages: Any) -> Dict[str, Any]:
        raise ApiError("ARTIFACT_NOT_FOUND", dict(NOT_INGESTED))
