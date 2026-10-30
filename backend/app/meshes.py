"""Read side of the derived-mesh cache that ``backend/mesh/build_cache.py`` writes (V2-01, SCR-05).

``<data>/derived_meshes/<mask_sha256>.l0.json`` describes ``<mask_sha256>.l0.cmesh``: the undecimated (L0,
DR-008c) voxel-face surface of one mask in the voxel-index frame, with the source slice of every face
(``backend/mesh/artifact.py``, format ``cardiac-mesh/1``). Nothing is built here: a mask without a sidecar simply
has no reconstruction, and ``reconstruction_get`` says so (ARTIFACT_NOT_FOUND).

``<reference_sha256>.<prediction_sha256>.err1.json`` describes ``....err1.cmesh``: the FP / FN error mesh of one
prediction against the case's ground truth (``backend/mesh/error_artifact.py``, format ``cardiac-errormesh/1``, DR-005).
It answers ``error_reconstruction_get``; the same rules apply.

Identity. A mesh is content-addressed by the sha256 of its bytes. ``mesh_artifact_id`` is ``MESH_<that sha256>`` and
``error_mesh_artifact_id`` is ``ERRMESH_<that sha256>``, so the client derives both the content route
(``/api/v1/artifacts/<sha256>.cmesh``) and the checksum it must verify from the id alone - API Contract 11 has no
``content_url`` field on either endpoint and adding one would change the contract (see contracts/api/README.md,
"3-D mesh content" and "3-D error mesh"). ``reconstruction_version`` names the builder and the source mask:
``dr008c-L0/v1 sha256:<mask sha256>``.

INT-12 (QA #98 N-9). A derived mesh made from a ground truth is served only when the caller names that ground truth:
``MeshStore(root, ground_truth_masks=...)`` takes the digests of the masks of the EVALUATION cases the backend serves,
and a sidecar whose source is a ground truth outside that set - or an error mesh against one - is rejected, never
loaded. The default is the empty set, so a store built without the list serves no ground-truth-derived mesh at all.

The bytes are verified when served (like every artifact); the sidecar is trusted for counts and shape only.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .experiments import RunRecord

SIDECAR_SUFFIX = ".l0.json"
MESH_SUFFIX = ".l0.cmesh"
ERROR_SIDECAR_SUFFIX = ".err1.json"
ERROR_MESH_SUFFIX = ".err1.cmesh"
FORMAT = "cardiac-mesh/1"
ERROR_FORMAT = "cardiac-errormesh/1"
GROUND_TRUTH_SOURCE = "ground_truth_slices"
HEX64 = re.compile(r"[0-9a-f]{64}")
MESH_ID = re.compile(r"MESH_([0-9a-f]{64})")
ERROR_MESH_ID = re.compile(r"ERRMESH_([0-9a-f]{64})")
MEDIA_TYPE = "application/octet-stream"


def mesh_artifact_id(mesh_sha256: str) -> str:
    return f"MESH_{mesh_sha256}"


def error_mesh_artifact_id(mesh_sha256: str) -> str:
    return f"ERRMESH_{mesh_sha256}"


def _is_count(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


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

    kind = "mesh"


class ErrorMeshEntry:
    def __init__(self, record: Dict[str, Any], path: Path):
        self.record = record
        self.path = path
        self.reference_sha256: str = record["reference_mask_sha256"]
        self.prediction_sha256: str = record["prediction_mask_sha256"]
        self.mesh_sha256: str = record["mesh_sha256"]
        self.shape: List[int] = [int(v) for v in record["shape"]]  # [Nx, Ny, Nz]

    @property
    def artifact_id(self) -> str:
        return error_mesh_artifact_id(self.mesh_sha256)

    kind = "error_mesh"


class MeshStore:
    def __init__(self, root: Optional[Path], ground_truth_masks: Iterable[str] = ()):
        self.root = Path(root) if root is not None else None
        self.ground_truth_masks = frozenset(ground_truth_masks)
        self.by_mask: Dict[str, MeshEntry] = {}
        self.by_error: Dict[Tuple[str, str], ErrorMeshEntry] = {}
        # Both kinds, by the sha256 of their bytes: what the content route serves.
        self.by_mesh: Dict[str, Any] = {}
        self.rejected: List[str] = []
        if self.root is None or not self.root.is_dir():
            return
        for side in sorted(self.root.glob(f"*{SIDECAR_SUFFIX}")):
            self._load_surface(side)
        for side in sorted(self.root.glob(f"*{ERROR_SIDECAR_SUFFIX}")):
            self._load_error(side)

    # -- loading -------------------------------------------------------------
    def _read(self, side: Path) -> Optional[Dict[str, Any]]:
        try:
            record = json.loads(side.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.rejected.append(side.name)
            return None
        return record if isinstance(record, dict) else self._reject(side)

    def _reject(self, side: Path) -> None:
        self.rejected.append(side.name)
        return None

    def _body(self, side_name: str, suffix: str, sidecar_suffix: str, record: Dict[str, Any]) -> Optional[Path]:
        body = self.root / (side_name[: -len(sidecar_suffix)] + suffix)
        if not body.is_file() or body.stat().st_size != record["bytes"]:
            return None
        return body

    def _load_surface(self, side: Path) -> None:
        mask_sha = side.name[: -len(SIDECAR_SUFFIX)]
        record = self._read(side)
        if record is None:
            return
        if record.get("empty"):  # a mask with no foreground: recorded, nothing to serve
            if record.get("mask_sha256") != mask_sha:
                self.rejected.append(side.name)
            return
        if not self._valid(record, mask_sha):
            self.rejected.append(side.name)
            return
        if record.get("source") == GROUND_TRUTH_SOURCE and mask_sha not in self.ground_truth_masks:
            self.rejected.append(side.name)  # a ground truth the backend does not serve (INT-12): never loaded
            return
        body = self._body(side.name, MESH_SUFFIX, SIDECAR_SUFFIX, record)
        if body is None:
            self.rejected.append(side.name)
            return
        entry = MeshEntry(record, body)
        self.by_mask[mask_sha] = entry
        self.by_mesh[entry.mesh_sha256] = entry

    def _load_error(self, side: Path) -> None:
        stem = side.name[: -len(ERROR_SIDECAR_SUFFIX)]
        record = self._read(side)
        if record is None:
            return
        if not self._valid_error(record, stem):
            self.rejected.append(side.name)
            return
        if record["reference_mask_sha256"] not in self.ground_truth_masks:
            self.rejected.append(side.name)  # an error mesh against a ground truth the backend does not serve
            return
        body = self._body(side.name, ERROR_MESH_SUFFIX, ERROR_SIDECAR_SUFFIX, record)
        if body is None:
            self.rejected.append(side.name)
            return
        entry = ErrorMeshEntry(record, body)
        self.by_error[(entry.reference_sha256, entry.prediction_sha256)] = entry
        self.by_mesh[entry.mesh_sha256] = entry

    @staticmethod
    def _valid(record: Dict[str, Any], mask_sha: str) -> bool:
        shape = record.get("shape")
        return (record.get("format") == FORMAT and record.get("level") == 0 and record.get("mask_sha256") == mask_sha
                and isinstance(record.get("mesh_sha256"), str) and bool(HEX64.fullmatch(record["mesh_sha256"]))
                and _is_count(record.get("bytes"))
                and isinstance(shape, list) and len(shape) == 3 and all(isinstance(v, int) for v in shape))

    @staticmethod
    def _valid_error(record: Dict[str, Any], stem: str) -> bool:
        shape = record.get("shape")
        reference, prediction = record.get("reference_mask_sha256"), record.get("prediction_mask_sha256")
        return (record.get("format") == ERROR_FORMAT and record.get("level") == 0
                and isinstance(reference, str) and isinstance(prediction, str)
                and bool(HEX64.fullmatch(reference)) and bool(HEX64.fullmatch(prediction))
                and stem == f"{reference}.{prediction}"
                and isinstance(record.get("mesh_sha256"), str) and bool(HEX64.fullmatch(record["mesh_sha256"]))
                and _is_count(record.get("bytes"))
                and isinstance(shape, list) and len(shape) == 3 and all(isinstance(v, int) for v in shape))

    # -- queries -------------------------------------------------------------
    def for_mask(self, mask_sha256: Optional[str]) -> Optional[MeshEntry]:
        return self.by_mask.get(mask_sha256) if mask_sha256 else None

    def for_error(self, reference_sha256: Optional[str], prediction_sha256: Optional[str]) -> Optional[ErrorMeshEntry]:
        if not reference_sha256 or not prediction_sha256:
            return None
        return self.by_error.get((reference_sha256, prediction_sha256))

    def kind_of(self, mesh_sha256: str) -> Optional[str]:
        """``mesh`` or ``error_mesh`` for a served digest, else None."""
        entry = self.by_mesh.get(mesh_sha256)
        return entry.kind if entry is not None else None

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
