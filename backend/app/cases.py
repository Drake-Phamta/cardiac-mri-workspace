"""Read side of the derived data cache that ingest.py writes."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# INT-12 (DR-017): the inference-only case. The rule is "CASE_0001 is always INFERENCE_REVIEW" - the store
# enforces it on its own, whatever the cache index designates.
INT12_CASE_ID = "CASE_0001"


def authorized_by_valid(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def authorized_runs_problems(runs: object) -> List[str]:
    """Why ``runs`` is not a valid ``authorized_runs`` list; empty when it is.

    A non-empty list of exactly ``{experiment_id, checkpoint_sha256}`` (the shape ml/holdout.py writes), each
    experiment listed once: ml/holdout.py refuses a record that lists an experiment twice, and a record that
    named one experiment with two checkpoints would authorize whichever the reader happens to find first
    (QA_PR98_D39 N-7).
    """
    if not isinstance(runs, list) or not runs:
        return ["authorized_runs must be a non-empty list"]
    problems: List[str] = []
    seen = set()
    for position, run in enumerate(runs):
        if not isinstance(run, dict) or set(run) != {"experiment_id", "checkpoint_sha256"}:
            problems.append(f"authorized_runs[{position}] must be exactly {{experiment_id, checkpoint_sha256}}")
            continue
        name = run["experiment_id"]
        if not (isinstance(name, str) and name.strip() and name == name.strip()):  # ml/holdout.py _is_name
            problems.append(f"authorized_runs[{position}].experiment_id must be a non-empty string")
        elif name in seen:
            problems.append(f"authorized_runs[{position}].experiment_id {name!r} is listed twice")
        else:
            seen.add(name)
        if not (isinstance(run["checkpoint_sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", run["checkpoint_sha256"])):
            problems.append(f"authorized_runs[{position}].checkpoint_sha256 must be a lowercase 64-hex sha256")
    return problems


def authorized_runs_valid(runs: object) -> bool:
    return not authorized_runs_problems(runs)


class CaseRecord:
    def __init__(self, data: dict, root: Path):
        self.data = data
        self.root = root
        self.case_id: str = data["case_id"]
        self.mode: str = data["mode"]
        self.ground_truth_available: bool = bool(data["ground_truth_available"])
        self.shape: List[int] = list(data["shape"])  # [Nx, Ny, Nz]
        self.volume_id: str = data["volume_id"]
        self.reference_mask_id: Optional[str] = data.get("reference_mask_id")

    @property
    def nx(self) -> int:
        return self.shape[0]

    @property
    def ny(self) -> int:
        return self.shape[1]

    @property
    def nz(self) -> int:
        return self.shape[2]

    def geometry(self) -> dict:
        return {
            "geometry_contract_version": self.data["geometry_contract_version"],
            "geometry_validation_status": self.data["geometry_validation_status"],
            "shape": list(self.shape),
            "index_convention": "x=column,y=row,z=slice",
            "spacing": list(self.data["spacing"]),
            "origin": list(self.data["origin"]),
            "direction": list(self.data["direction"]),
        }

    def slice_checksum(self, kind: str, z: int) -> str:
        return self.data["slices"][kind][z]

    def slice_path(self, kind: str, z: int) -> Path:
        return self.root / "cases" / self.case_id / kind / f"{z:04d}.png"

    def source_version(self) -> str:
        return f"{self.data['volume_sha256'][:16]}/{self.data['render_version']}"


class CaseStore:
    """Every ingested case, keyed by id, plus the sha256 -> file index."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.cases: Dict[str, CaseRecord] = {}
        self.blobs: Dict[str, Path] = {}
        self.index: dict = {}
        self.inference_only_ids: set = set()
        self.modes_known = False
        self.digest_owners: Dict[str, List[Tuple[str, str, int]]] = {}
        index_path = self.root / "index.json"
        if not index_path.exists():
            return
        self.index = json.loads(index_path.read_text(encoding="utf-8"))
        for case_id in self.index.get("cases", []):
            case_path = self.root / "cases" / case_id / "case.json"
            if case_path.exists():
                record = CaseRecord(json.loads(case_path.read_text(encoding="utf-8")), self.root)
                self.cases[case_id] = record
        for digest, relative in self.index.get("blobs", {}).items():
            self.blobs[digest] = self.root / Path(*relative.split("/"))
        # Content addressing means identical slices (an empty mask, say) share one
        # digest: every owner is kept, so the request log never guesses one.
        for case_id, record in self.cases.items():
            for kind in ("mri", "gt"):
                for z, digest in enumerate(record.data["slices"][kind]):
                    self.digest_owners.setdefault(digest, []).append((case_id, kind, z))
        self._refuse_unsafe_holdout()
        # INT-12: the cases whose ground-truth-derived values are never served. CASE_0001 is always one of
        # them, whatever the index says (the index is data on disk; the rule is code).
        self.inference_only_ids = set(self.index.get("inference_only_case_ids", [])) | {INT12_CASE_ID} | {
            case_id for case_id, record in self.cases.items() if record.mode == "INFERENCE_REVIEW"}
        self.modes_known = "inference_only_case_ids" in self.index

    def _refuse_unsafe_holdout(self) -> None:
        """The holdout lock.

        Without the DR-022 authorization metadata: at most one final_holdout case (the INT-12 case), and
        never with its ground truth. With it (a cache built by ``ingest --include-holdout`` under a closed
        GATE-IMG-01 record): the other holdout cases may be served in EVALUATION mode, but the INT-12 case -
        every case the cache lists as inference-only - is INFERENCE_REVIEW without ground truth, always.
        """
        int12 = self.cases.get(INT12_CASE_ID)
        if int12 is not None and (int12.mode != "INFERENCE_REVIEW" or self._serves_ground_truth(int12)):
            raise RuntimeError(f"{INT12_CASE_ID} is the INT-12 case and must be INFERENCE_REVIEW without ground truth "
                               f"whatever the cache index designates; refusing to start")
        holdout = [record for record in self.cases.values() if record.data.get("split_partition") == "final_holdout"]
        authorization = self.index.get("holdout_authorization")
        if authorization is None:
            if len(holdout) > 1:
                raise RuntimeError(f"data cache serves {len(holdout)} final_holdout cases; at most one (INT-12) "
                                   f"is allowed without a GATE-IMG-01 authorization record")
            for record in holdout:
                if self._serves_ground_truth(record) or record.mode != "INFERENCE_REVIEW":
                    raise RuntimeError(f"{record.case_id} is a final_holdout case served with ground truth; refusing to start")
            return
        if not (isinstance(authorization, dict)
                and authorization.get("format") == "ml-holdout-authorization/1"
                and authorization.get("gate") == "GATE-IMG-01" and authorization.get("gate_status") == "CLOSED"
                and authorization.get("split_sha256") == self.index.get("split_sha256")
                and isinstance(authorization.get("record_sha256"), str) and len(authorization["record_sha256"]) == 64):
            raise RuntimeError("data cache holds holdout cases under a malformed or mismatched GATE-IMG-01 record; "
                               "refusing to start")
        run_problems = authorized_runs_problems(authorization.get("authorized_runs"))
        if run_problems or not authorized_by_valid(authorization.get("authorized_by")):
            raise RuntimeError("the GATE-IMG-01 record of this data cache authorizes no run, authorizes one twice or "
                               "names nobody (authorized_runs / authorized_by)"
                               + (": " + "; ".join(run_problems) if run_problems else "")
                               + "; re-run the ingest with the record; refusing to start")
        designated = self.index.get("inference_only_case_ids")
        if not isinstance(designated, list) or not designated:
            raise RuntimeError("data cache with an authorization record does not designate the INT-12 case; refusing to start")
        for record in self.cases.values():
            if (record.case_id in designated or record.mode == "INFERENCE_REVIEW") and (
                    self._serves_ground_truth(record) or record.mode != "INFERENCE_REVIEW"):
                raise RuntimeError(f"{record.case_id} is the INT-12 inference-only case but is served with ground "
                                   f"truth; refusing to start")
        for record in holdout:
            if record.case_id not in designated and record.mode != "EVALUATION":
                raise RuntimeError(f"{record.case_id} is a final_holdout case in mode {record.mode}; refusing to start")

    @staticmethod
    def _serves_ground_truth(record: CaseRecord) -> bool:
        return bool(record.ground_truth_available or record.data.get("slices", {}).get("gt")
                    or record.reference_mask_id or record.data.get("mask_sha256"))

    def get(self, case_id: str) -> Optional[CaseRecord]:
        return self.cases.get(case_id)

    def ordered(self) -> List[CaseRecord]:
        return [self.cases[key] for key in sorted(self.cases, key=lambda value: int(value.split("_", 1)[1]))]

    def counts(self) -> Dict[str, int]:
        counts = {"total": len(self.cases), "EVALUATION": 0, "INFERENCE_REVIEW": 0}
        for record in self.cases.values():
            counts[record.mode] = counts.get(record.mode, 0) + 1
        return counts

    def mask_owner(self, mask_id: str) -> Optional[CaseRecord]:
        for record in self.cases.values():
            if record.reference_mask_id == mask_id:
                return record
        return None
