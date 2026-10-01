"""Read side of the derived data cache that ingest.py writes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional


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
        self._refuse_unsafe_holdout()
        # INT-12: the cases whose ground-truth-derived values are never served.
        self.inference_only_ids = set(self.index.get("inference_only_case_ids", [])) | {
            case_id for case_id, record in self.cases.items() if record.mode == "INFERENCE_REVIEW"}
        self.modes_known = "inference_only_case_ids" in self.index

    def _refuse_unsafe_holdout(self) -> None:
        """At most one final_holdout case (the INT-12 case), and never with its ground truth."""
        holdout = [record for record in self.cases.values() if record.data.get("split_partition") == "final_holdout"]
        if len(holdout) > 1:
            raise RuntimeError(f"data cache serves {len(holdout)} final_holdout cases; at most one (INT-12) is allowed")
        for record in holdout:
            if record.ground_truth_available or record.data.get("slices", {}).get("gt") or record.mode != "INFERENCE_REVIEW":
                raise RuntimeError(f"{record.case_id} is a final_holdout case served with ground truth; refusing to start")

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
