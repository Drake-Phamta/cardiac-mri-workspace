"""Contract 2 experiment artifacts: experiments, analysis runs, prediction masks.

Every package under ``experiments_root`` (a ``*.json`` manifest at depth 1 or 2
whose ``contract`` is ``contract2_experiment_artifact``) is checked with the
repository's own ``validate_contract2.validate_manifest`` before anything in
it is served: both gates ACCEPTED, precomputed, checksums verified, provenance
intact. A package that fails is listed in ``rejected`` with its code and is
never partially served. Without any accepted package every run, metric and
mesh endpoint answers its legitimately-unavailable state.
"""

from __future__ import annotations

import importlib.util
import json
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from . import imaging
from .cases import CaseStore
from .config import REPO_ROOT
from .contract import ApiError

CONTRACT2 = "contract2_experiment_artifact"
VARIANT_BY_KIND = {"RAW_PREDICTION_MASK": "RAW", "PROCESSED_PREDICTION_MASK": "PROCESSED"}
SOURCE_KIND = {"RAW_PREDICTION_MASK": "RAW_PREDICTION", "PROCESSED_PREDICTION_MASK": "PROCESSED_PREDICTION"}


def _load_validator():
    path = REPO_ROOT / "contracts" / "ingestion" / "contract2_experiment_artifact" / "validate_contract2.py"
    spec = importlib.util.spec_from_file_location("validate_contract2", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class RunRecord:
    def __init__(self, run: dict, experiment_id: str, package: "Package"):
        self.run_id: str = run["analysis_run_id"]
        self.case_id: str = run["case_id"]
        self.experiment_id = experiment_id
        self.status: str = run["status"]
        self.attempt_no: int = int(run["attempt_no"])
        self.raw_mask_id: str = run["raw_prediction_mask_id"]
        self.processed_mask_id: Optional[str] = run.get("processed_prediction_mask_id")
        self.metric_set_ids: List[str] = list(run.get("metric_set_ids") or [])
        self.reconstruction_ids: List[str] = list(run.get("reconstruction_ids") or [])
        self.failure_reason: Optional[str] = run.get("failure_reason")
        self.package = package

    def mask_id(self, variant: str) -> Optional[str]:
        return self.raw_mask_id if variant == "RAW" else self.processed_mask_id if variant == "PROCESSED" else None


class Package:
    def __init__(self, manifest: dict, root: Path):
        self.manifest = manifest
        self.root = root
        self.manifest_id: str = manifest["manifest_id"]
        self.experiment: dict = manifest["experiment"]
        self.artifacts: Dict[str, dict] = {item["artifact_id"]: item for item in manifest["artifacts"]}

    def artifact_path(self, artifact_id: str) -> Path:
        return self.root / Path(*self.artifacts[artifact_id]["source_path"].split("/"))


class ExperimentStore:
    def __init__(self, root: Path, cases: CaseStore, render_cache: Path, max_volumes: int = 4):
        self.root = Path(root)
        self.cases = cases
        self.render_cache = Path(render_cache)
        self.packages: Dict[str, Package] = {}
        self.experiments: Dict[str, Package] = {}
        self.runs: Dict[str, RunRecord] = {}
        self.artifact_owner: Dict[str, Package] = {}
        self.rejected: List[dict] = []
        self.runs_without_case: List[str] = []
        self.render_blobs: Dict[str, Path] = {}
        self._volumes: "OrderedDict[str, np.ndarray]" = OrderedDict()
        self._max_volumes = max_volumes
        self._lock = threading.Lock()
        self._load()

    # -- loading -------------------------------------------------------------
    def _candidates(self) -> List[Path]:
        if not self.root.is_dir():
            return []
        found = sorted(self.root.glob("*.json")) + sorted(self.root.glob("*/*.json"))
        return [path for path in found if path.name != "index.json"]

    def _load(self) -> None:
        validator = None
        for path in self._candidates():
            try:
                manifest = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(manifest, dict) or manifest.get("contract") != CONTRACT2:
                continue
            if validator is None:
                validator = _load_validator()
            try:
                validator.validate_manifest(manifest, path.parent)
            except validator.ContractError as exc:
                self.rejected.append({"manifest": path.name, "code": exc.code, "message": str(exc)})
                continue
            package = Package(manifest, path.parent)
            experiment_id = package.experiment["experiment_id"]
            clash = (
                experiment_id in self.experiments
                or any(artifact_id in self.artifact_owner for artifact_id in package.artifacts)
                or any(run["analysis_run_id"] in self.runs for run in manifest["analysis_runs"])
            )
            if clash:
                self.rejected.append({"manifest": path.name, "code": "DUPLICATE_ARTIFACT",
                                      "message": "experiment, artifact or run id already served by another package"})
                continue
            self.packages[package.manifest_id] = package
            self.experiments[experiment_id] = package
            for artifact_id in package.artifacts:
                self.artifact_owner[artifact_id] = package
            for run in manifest["analysis_runs"]:
                if self.cases.get(run["case_id"]) is None:
                    self.runs_without_case.append(run["analysis_run_id"])
                    continue
                self.runs[run["analysis_run_id"]] = RunRecord(run, experiment_id, package)
        self._load_render_index()

    def _load_render_index(self) -> None:
        if not self.render_cache.is_dir():
            return
        for index_path in self.render_cache.glob("*/index.json"):
            try:
                checksums = json.loads(index_path.read_text(encoding="utf-8"))["slices"]
            except (OSError, KeyError, json.JSONDecodeError):
                continue
            for z, digest in enumerate(checksums):
                self.render_blobs[digest] = index_path.parent / f"{z:04d}.png"

    # -- queries -------------------------------------------------------------
    def run(self, run_id: str) -> Optional[RunRecord]:
        return self.runs.get(run_id)

    def runs_for_case(self, case_id: str) -> List[RunRecord]:
        return [run for run in self.runs.values() if run.case_id == case_id]

    def experiment_ids(self) -> List[str]:
        return sorted(self.experiments)

    def artifact(self, artifact_id: str) -> Optional[dict]:
        package = self.artifact_owner.get(artifact_id)
        return package.artifacts[artifact_id] if package else None

    def mask_artifact(self, run: RunRecord, variant: str) -> Tuple[str, dict]:
        mask_id = run.mask_id(variant)
        if mask_id is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": f"no {variant} prediction for this run"})
        return mask_id, run.package.artifacts[mask_id]

    def prediction_volume(self, run: RunRecord, variant: str) -> Tuple[str, dict, np.ndarray]:
        """The (z, y, x) {0, 255} prediction volume, verified against its checksum."""
        mask_id, artifact = self.mask_artifact(run, variant)
        case = self.cases.get(run.case_id)
        with self._lock:
            cached = self._volumes.get(mask_id)
            if cached is not None:
                self._volumes.move_to_end(mask_id)
                return mask_id, artifact, cached
        path = run.package.artifact_path(mask_id)
        if imaging.sha256_file(path) != artifact["checksum"]["value"]:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "prediction bytes no longer match their checksum"})
        data, _header = imaging.read_nrrd(path)
        volume = imaging.binary_mask(imaging.to_zyx(data))
        if case is None or list(volume.shape) != [case.nz, case.ny, case.nx]:
            raise ApiError("GEOMETRY_MISMATCH", {"reason": "prediction shape differs from the case volume"})
        volume.setflags(write=False)
        with self._lock:
            self._volumes[mask_id] = volume
            while len(self._volumes) > self._max_volumes:
                self._volumes.popitem(last=False)
        return mask_id, artifact, volume

    def prediction_slice(self, run: RunRecord, variant: str, z: int) -> Tuple[str, dict, str]:
        """Render (once) and return (mask_id, artifact, sha256 hex) for one slice."""
        mask_id, artifact = self.mask_artifact(run, variant)
        directory = self.render_cache / mask_id
        index_path = directory / "index.json"
        if not index_path.exists():
            mask_id, artifact, volume = self.prediction_volume(run, variant)
            directory.mkdir(parents=True, exist_ok=True)
            checksums = []
            for index in range(volume.shape[0]):
                payload = imaging.encode_png(volume[index])
                digest = imaging.sha256_bytes(payload)
                (directory / f"{index:04d}.png").write_bytes(payload)
                checksums.append(digest)
            # Written last and atomically: an index exists only for a complete render.
            temporary = index_path.with_name(index_path.name + ".tmp")
            temporary.write_text(json.dumps({"artifact_id": mask_id, "source_checksum": artifact["checksum"]["value"],
                                             "render_version": imaging.MASK_RENDER_VERSION, "slices": checksums}),
                                 encoding="utf-8")
            temporary.replace(index_path)
            with self._lock:
                for index, digest in enumerate(checksums):
                    self.render_blobs[digest] = directory / f"{index:04d}.png"
        rendered = json.loads(index_path.read_text(encoding="utf-8"))
        if rendered.get("source_checksum") != artifact["checksum"]["value"]:
            raise ApiError("ARTIFACT_NOT_FOUND", {"reason": "rendered slices belong to different prediction bytes"})
        return mask_id, artifact, rendered["slices"][z]
