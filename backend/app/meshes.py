"""Read side of the mesh cache that ``backend/mesh/build_cache.py`` writes.

``<data>/derived_meshes/<mask_sha256>.l0.json`` describes ``<mask_sha256>.l0.cmesh``: the full-resolution (L0)
voxel-face surface of one mask in the voxel-index frame (format ``cardiac-mesh/1``, see ``backend/mesh/artifact.py``).
Nothing is built here: a mask without a sidecar has no reconstruction.

A mesh is addressed by the sha256 of its bytes: ``mesh_artifact_id`` is ``MESH_<sha256>``, so the client gets both
the content route (``/api/v1/artifacts/<sha256>.cmesh``) and the checksum to verify from the id alone, because
``reconstruction_get`` has no ``content_url`` field in API Contract 11. The bytes are verified when served; the
sidecar is trusted for counts and shape only.

``<prediction_mask_sha256>.<ground_truth_mask_sha256>.errors.json`` is the error geometry of one prediction against
its ground truth (format ``cardiac-error-geometry/1``). It is addressed the same way: ``error_mesh_artifact_id`` is
``ERRGEOM_<sha256 of the file>`` and the bytes are served at ``/api/v1/artifacts/<sha256>.json``.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .experiments import RunRecord

SIDECAR_SUFFIX = ".l0.json"
MESH_SUFFIX = ".l0.cmesh"
ERRORS_SUFFIX = ".errors.json"
FORMAT = "cardiac-mesh/1"
ERRORS_FORMAT = "cardiac-error-geometry/1"
HEX64 = re.compile(r"[0-9a-f]{64}")
MESH_ID = re.compile(r"MESH_([0-9a-f]{64})")
MEDIA_TYPE = "application/octet-stream"
ERRORS_MEDIA_TYPE = "application/json"


def mesh_artifact_id(mesh_sha256: str) -> str:
    return f"MESH_{mesh_sha256}"


class ErrorEntry:
    """One error geometry file: its sha256 (the artifact id), the grid it was built on and its path."""

    def __init__(self, path: Path, payload: bytes, document: Dict[str, Any]):
        self.path = path
        self.sha256 = hashlib.sha256(payload).hexdigest()
        self.shape: List[int] = [int(v) for v in document["shape"]]

    @property
    def artifact_id(self) -> str:
        return f"ERRGEOM_{self.sha256}"


class MeshEntry:
    def __init__(self, record: Dict[str, Any], path: Path):
        self.record = record
        self.path = path
        self.mask_sha256: str = record["mask_sha256"]
        self.mesh_sha256: str = record["mesh_sha256"]
        self.shape: List[int] = [int(v) for v in record["shape"]]  # [Nx, Ny, Nz]

    @property
    def artifact_id(self) -> str:
        return mesh_artifact_id(self.mesh_sha256)


class MeshStore:
    def __init__(self, root: Optional[Path]):
        self.root = Path(root) if root is not None else None
        self.by_mask: Dict[str, MeshEntry] = {}
        self.by_mesh: Dict[str, MeshEntry] = {}
        self.errors_by_masks: Dict[Tuple[str, str], ErrorEntry] = {}
        self.errors_by_sha: Dict[str, ErrorEntry] = {}
        self.rejected: List[str] = []
        if self.root is None or not self.root.is_dir():
            return
        self._load_errors()
        for side in sorted(self.root.glob(f"*{SIDECAR_SUFFIX}")):
            mask_sha = side.name[: -len(SIDECAR_SUFFIX)]
            try:
                record = json.loads(side.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                self.rejected.append(side.name)
                continue
            if not isinstance(record, dict) or record.get("empty") or not self._valid(record, mask_sha):
                if not (isinstance(record, dict) and record.get("empty") and record.get("mask_sha256") == mask_sha):
                    self.rejected.append(side.name)
                continue
            body = self.root / f"{mask_sha}{MESH_SUFFIX}"
            if not body.is_file() or body.stat().st_size != record["bytes"]:
                self.rejected.append(side.name)
                continue
            entry = MeshEntry(record, body)
            self.by_mask[mask_sha] = entry
            self.by_mesh[entry.mesh_sha256] = entry

    @staticmethod
    def _valid(record: Dict[str, Any], mask_sha: str) -> bool:
        shape = record.get("shape")
        return (record.get("format") == FORMAT and record.get("level") == 0 and record.get("mask_sha256") == mask_sha
                and isinstance(record.get("mesh_sha256"), str) and bool(HEX64.fullmatch(record["mesh_sha256"]))
                and isinstance(record.get("bytes"), int) and not isinstance(record.get("bytes"), bool)
                and isinstance(shape, list) and len(shape) == 3 and all(isinstance(v, int) for v in shape))

    def _load_errors(self) -> None:
        for path in sorted(self.root.glob(f"*{ERRORS_SUFFIX}")):
            masks = tuple(path.name[: -len(ERRORS_SUFFIX)].split("."))
            try:
                payload = path.read_bytes()
                document = json.loads(payload.decode("ascii"))
            except (OSError, ValueError):
                self.rejected.append(path.name)
                continue
            if len(masks) != 2 or not all(HEX64.fullmatch(sha) for sha in masks) or not self._valid_errors(document):
                self.rejected.append(path.name)
                continue
            entry = ErrorEntry(path, payload, document)
            self.errors_by_masks[masks] = entry
            self.errors_by_sha[entry.sha256] = entry

    @staticmethod
    def _valid_errors(document: Any) -> bool:
        if not isinstance(document, dict):
            return False
        shape = document.get("shape")
        return (document.get("format") == ERRORS_FORMAT and document.get("frame") == "voxel-index"
                and isinstance(document.get("components"), list)
                and isinstance(shape, list) and len(shape) == 3 and all(isinstance(v, int) for v in shape))

    def for_mask(self, mask_sha256: Optional[str]) -> Optional[MeshEntry]:
        return self.by_mask.get(mask_sha256) if mask_sha256 else None

    def errors_for(self, prediction_sha256: Optional[str], ground_truth_sha256: Optional[str]) -> Optional[ErrorEntry]:
        return self.errors_by_masks.get((prediction_sha256 or "", ground_truth_sha256 or ""))

    def errors_content(self, sha256: str) -> Optional[bytes]:
        entry = self.errors_by_sha.get(sha256)
        if entry is None:
            return None
        try:
            return entry.path.read_bytes()
        except OSError:
            return None

    def content(self, mesh_sha256: str) -> Optional[bytes]:
        entry = self.by_mesh.get(mesh_sha256)
        if entry is None:
            return None
        try:
            return entry.path.read_bytes()
        except OSError:
            return None

    def run_mesh_ids(self, run: RunRecord, case_shape: Optional[List[int]]) -> List[str]:
        """The ``mesh_artifact_id`` of every prediction variant of the run that has a mesh of the case's shape."""
        ids = []
        for variant in ("RAW", "PROCESSED"):
            mask_id = run.mask_id(variant)
            if mask_id is None or mask_id not in run.package.artifacts:
                continue
            entry = self.for_mask(run.package.artifacts[mask_id]["checksum"]["value"])
            if entry is not None and (case_shape is None or entry.shape == list(case_shape)) \
                    and entry.artifact_id not in ids:
                ids.append(entry.artifact_id)
        return ids
