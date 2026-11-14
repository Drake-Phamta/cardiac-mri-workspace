"""The stores a request needs, built once per app, and the lookups several route modules share.

Each lookup raises ApiError with a contract error code; the route's endpoint guard turns it into the answer.
"""

from __future__ import annotations

import re
from typing import Optional

from .cases import CaseRecord, CaseStore
from .config import Settings
from .contract import ApiError, Contract
from .experiments import ExperimentStore, RunRecord
from .meshes import MeshStore
from .metrics import MetricsService
from .storage import Storage

# Whole-string patterns only (fullmatch): `$` would also accept a trailing newline.
SLICE = re.compile(r"[0-9]{1,6}")


class Backend:
    def __init__(self, settings: Settings):
        settings.refuse_data_inside_git()
        self.settings = settings
        self.contract = Contract.load(settings.contract_path)
        self.cases = CaseStore(settings.data_cache)
        self.experiments = ExperimentStore(settings.experiments_root, self.cases, settings.render_cache)
        self.metrics = MetricsService(self.experiments, self.cases)
        self.meshes = MeshStore(settings.derived_meshes)
        for run in self.experiments.runs.values():
            case = self.cases.get(run.case_id)
            run.derived_reconstruction_ids = self.meshes.run_mesh_ids(run, case.shape if case else None) if case else []
        self.storage = Storage(settings.db_path, self.contract.transitions(),
                               self.contract.review_rules["create_allowed_states"])

    def get_case(self, case_id: str) -> CaseRecord:
        case = self.cases.get(case_id)
        if case is None:
            raise ApiError("CASE_NOT_FOUND", {"case_id": case_id})
        return case

    def get_run(self, run_id: str) -> RunRecord:
        run = self.experiments.run(run_id)
        if run is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"run_id": run_id})
        return run

    def run_case(self, run: RunRecord) -> CaseRecord:
        case = self.cases.get(run.case_id)
        if case is None:  # experiments only serve runs of ingested cases
            raise ApiError("ARTIFACT_NOT_FOUND", {"run_id": run.run_id})
        return case

    def variant_or_not_found(self, raw: Optional[str]) -> str:
        allowed = self.contract.enums["prediction_variant"]
        if raw not in allowed:
            raise ApiError("ARTIFACT_NOT_FOUND", {"prediction_variant": raw, "allowed": allowed})
        return str(raw)


def parse_slice(case: CaseRecord, raw: str) -> int:
    if not SLICE.fullmatch(raw or "") or int(raw) >= case.nz:
        raise ApiError("SLICE_OUT_OF_RANGE", {"slice_index": raw, "valid": [0, case.nz - 1]})
    return int(raw)


def require_ground_truth(case: CaseRecord) -> None:
    if not case.ground_truth_available:
        raise ApiError("GROUND_TRUTH_UNAVAILABLE", {"case_id": case.case_id, "mode": case.mode})


def require_succeeded(run: RunRecord, failed_code: str = "RUN_NOT_SUCCEEDED") -> None:
    if run.status == "FAILED":
        raise ApiError(failed_code, {"run_id": run.run_id, "status": run.status, "failure_reason": run.failure_reason})
    if run.status != "SUCCEEDED":
        raise ApiError("RUN_NOT_SUCCEEDED", {"run_id": run.run_id, "status": run.status})
