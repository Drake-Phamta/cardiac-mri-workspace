"""Read side of the derived-mesh cache that ``backend/mesh/build_cache.py`` writes (V2-01, SCR-05).

``<data>/derived_meshes/<mask_sha256>.l0.json`` describes ``<mask_sha256>.l0.cmesh``: the undecimated (L0,
DR-008c) voxel-face surface of one mask in the voxel-index frame, with the source slice of every face
(``backend/mesh/artifact.py``, format ``cardiac-mesh/1``). Nothing is built here: a mask without a sidecar simply
has no reconstruction, and ``reconstruction_get`` says so (ARTIFACT_NOT_FOUND).

Identity. A mesh is content-addressed by the sha256 of its bytes. ``mesh_artifact_id`` is ``MESH_<that sha256>``,
so the client derives both the content route (``/api/v1/artifacts/<sha256>.cmesh``) and the checksum it must verify
from the id alone - API Contract 11 has no ``content_url`` field on ``reconstruction_get`` and adding one would
change the contract (see contracts/api/README.md, "3-D mesh content"). ``reconstruction_version`` names the builder
and the source mask: ``dr008c-L0/v1 sha256:<mask sha256>``.

The bytes are verified when served (like every artifact); the sidecar is trusted for counts and shape only.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .experiments import RunRecord

SIDECAR_SUFFIX = ".l0.json"
MESH_SUFFIX = ".l0.cmesh"
FORMAT = "cardiac-mesh/1"
HEX64 = re.compile(r"[0-9a-f]{64}")
MESH_ID = re.compile(r"MESH_([0-9a-f]{64})")
MEDIA_TYPE = "application/octet-stream"


def mesh_artifact_id(mesh_sha256: str) -> str:
    return f"MESH_{mesh_sha256}"


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
        self.rejected: List[str] = []
        if self.root is None or not self.root.is_dir():
            return
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

    def for_mask(self, mask_sha256: Optional[str]) -> Optional[MeshEntry]:
        return self.by_mask.get(mask_sha256) if mask_sha256 else None

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
