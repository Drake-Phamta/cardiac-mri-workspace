"""Derived-mesh step: build the L0 mesh of every served mask into ``<data>/derived_meshes/`` (V2-01, SCR-05).

    python -m backend.mesh.build_cache --data <CARDIAC_BACKEND_DATA> [--runs RUN_ID ...] [--no-ground-truth]

For each served run (a Contract 2 package under ``<data>/experiments``) the RAW and PROCESSED prediction masks,
and for each EVALUATION case its ground truth, it writes the undecimated voxel-face surface plus the source slice
of every face (``artifact.py``, format ``cardiac-mesh/1``) as

    <data>/derived_meshes/<mask_sha256>.l0.cmesh    the mesh bytes
    <data>/derived_meshes/<mask_sha256>.l0.json     sidecar: counts, shape, sha256 of the bytes

keyed by the sha256 of the SOURCE MASK (the prediction NRRD's checksum from its Contract 2 manifest; for a
ground truth the mask checksum recorded by the ingest). Files are write-once like the data cache: a re-run is a
NO_OP, and a file that exists with other bytes is a CHECKSUM_CONFLICT, never overwritten. The sidecar is written
last, so a mesh without a sidecar is an interrupted build and is rebuilt.

Contract 2 and API Contract 11 are unchanged: this step only adds derived, patient-derived files outside git.
CASE_0001 (INT-12) has no ground truth in the cache, so none is built for it; its predictions are meshed.

Ground truth is rebuilt from the data cache's ground-truth slice PNGs, each checked against the checksum the cache
recorded for it; a prediction is read from its NRRD, checked against its manifest checksum. Memory: one 640x640x88
volume at a time (about 36 MB) plus the four most recent predictions the experiment store keeps.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from . import artifact

DERIVED_DIR = "derived_meshes"
MESH_SUFFIX = ".l0.cmesh"
SIDECAR_SUFFIX = ".l0.json"
DATA_ENV = "CARDIAC_BACKEND_DATA"


class BuildError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


def mesh_path(root: Path, mask_sha256: str) -> Path:
    return Path(root) / f"{mask_sha256}{MESH_SUFFIX}"


def sidecar_path(root: Path, mask_sha256: str) -> Path:
    return Path(root) / f"{mask_sha256}{SIDECAR_SUFFIX}"


def _write_atomic(path: Path, payload: bytes) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def store_volume(root: Path, mask_sha256: str, volume_zyx: Any, source: str) -> Dict[str, Any]:
    """Build and store the mesh of one mask, write-once. Returns the sidecar (plus ``action``).

    ``volume_zyx`` is the (z, y, x) volume or a callable producing it; a callable is not called when the mesh
    already exists (a re-run reads no mask).
    """
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    side, body = sidecar_path(root, mask_sha256), mesh_path(root, mask_sha256)
    if side.is_file():
        record = json.loads(side.read_text(encoding="utf-8"))
        if record.get("empty"):
            return dict(record, action="NO_OP")
        if not body.is_file() or hashlib.sha256(body.read_bytes()).hexdigest() != record.get("mesh_sha256"):
            raise BuildError("CHECKSUM_CONFLICT", f"{body.name} no longer matches its sidecar; derived meshes are "
                                                  f"never overwritten - move the pair aside to rebuild it")
        return dict(record, action="NO_OP")
    from .geometry import GeometryError  # lazy: nothing above needs it

    volume = volume_zyx() if callable(volume_zyx) else volume_zyx
    try:
        payload, info = artifact.build_mesh_artifact(volume)
    except GeometryError as exc:
        if exc.code != "MASK_EMPTY":
            raise
        record = {"format": artifact.FORMAT, "builder": artifact.BUILDER, "level": 0, "mask_sha256": mask_sha256,
                  "empty": True, "shape": [int(volume.shape[2]), int(volume.shape[1]), int(volume.shape[0])],
                  "source": source}
        _write_atomic(side, (json.dumps(record, sort_keys=True, indent=2) + "\n").encode("utf-8"))
        return dict(record, action="EMPTY")
    if body.exists() and body.read_bytes() != payload:
        raise BuildError("CHECKSUM_CONFLICT", f"{body.name} exists with different bytes (interrupted build?); "
                                              f"derived meshes are never overwritten - move it aside")
    if not body.exists():
        _write_atomic(body, payload)
    record = dict(info, mask_sha256=mask_sha256, source=source)
    _write_atomic(side, (json.dumps(record, sort_keys=True, indent=2) + "\n").encode("utf-8"))
    return dict(record, action="NEW")


def ground_truth_volume(case: Any) -> np.ndarray:
    """The case's ground truth as a (z, y, x) uint8 volume, from the cache's slice PNGs (each verified)."""
    from backend.app import imaging

    checksums = case.data["slices"]["gt"]
    if len(checksums) != case.nz:
        raise BuildError("GT_INCOMPLETE", f"{case.case_id}: {len(checksums)} ground-truth slices for {case.nz}")
    volume = np.zeros((case.nz, case.ny, case.nx), dtype=np.uint8)
    for z, digest in enumerate(checksums):
        payload = case.slice_path("gt", z).read_bytes()
        if imaging.sha256_bytes(payload) != digest:
            raise BuildError("GT_CHECKSUM", f"{case.case_id}: ground-truth slice {z} does not match the cache")
        volume[z] = imaging.decode_png(payload)
    return volume


def build_all(data: Path, runs: Optional[List[str]] = None, ground_truth: bool = True,
              log=print) -> Dict[str, Any]:
    from backend.app.cases import CaseStore
    from backend.app.config import inside_git_worktree
    from backend.app.experiments import ExperimentStore

    data = Path(data)
    root = data / DERIVED_DIR
    if inside_git_worktree(root):
        raise BuildError("OUTPUT_INSIDE_GIT_WORKTREE", f"{root} is inside a git work tree; derived meshes are "
                                                       f"patient-derived data and live outside the repository")
    cases = CaseStore(data / "data_cache")
    experiments = ExperimentStore(data / "experiments", cases, data / "var" / "render_cache")
    wanted = None if runs is None else set(runs)
    selected = sorted((run for run in experiments.runs.values() if wanted is None or run.run_id in wanted),
                      key=lambda run: (run.experiment_id, run.case_id))
    if wanted is not None and len(selected) != len(wanted):
        missing = sorted(wanted - {run.run_id for run in selected})
        raise BuildError("RUN_NOT_FOUND", f"no such served run: {missing}")
    results: List[Dict[str, Any]] = []
    seen = set()

    def record(label: str, mask_sha: str, volume_fn, source: str) -> None:
        if mask_sha in seen:
            return
        seen.add(mask_sha)
        started = time.perf_counter()
        sidecar = store_volume(root, mask_sha, volume_fn, source)
        elapsed = time.perf_counter() - started
        results.append({"label": label, "action": sidecar["action"], "seconds": elapsed,
                        "bytes": sidecar.get("bytes", 0), "triangles": sidecar.get("triangle_count", 0),
                        "vertices": sidecar.get("vertex_count", 0)})
        log(f"{sidecar['action']:5} {label:34} tri={sidecar.get('triangle_count', 0):>7} "
            f"bytes={sidecar.get('bytes', 0):>8} {elapsed:6.2f}s", flush=True)

    for run in selected:
        if run.status != "SUCCEEDED" or cases.get(run.case_id) is None:
            continue
        for variant in ("RAW", "PROCESSED"):
            mask_id = run.mask_id(variant)
            if mask_id is None:
                continue
            artifact_record = run.package.artifacts[mask_id]
            record(f"{run.run_id} {variant}", artifact_record["checksum"]["value"],
                   lambda run=run, variant=variant: experiments.prediction_volume(run, variant)[2], "prediction")
    if ground_truth:
        wanted_cases = None if wanted is None else {run.case_id for run in selected}
        for case in cases.ordered():
            if not case.ground_truth_available or not case.data.get("mask_sha256"):
                continue
            if wanted_cases is not None and case.case_id not in wanted_cases:
                continue
            record(f"{case.case_id} GROUND_TRUTH", case.data["mask_sha256"],
                   lambda case=case: ground_truth_volume(case), "ground_truth_slices")
    return summarise(results)


def summarise(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    built = [r for r in results if r["action"] == "NEW"]
    summary: Dict[str, Any] = {
        "masks": len(results), "new": len(built), "no_op": sum(r["action"] == "NO_OP" for r in results),
        "empty": sum(r["action"] == "EMPTY" for r in results),
        "total_bytes": sum(r["bytes"] for r in results if r["action"] in ("NEW", "NO_OP")),
    }
    if built:
        sizes, times, tris = [r["bytes"] for r in built], [r["seconds"] for r in built], [r["triangles"] for r in built]
        summary.update({
            "built_bytes_min_median_max": [min(sizes), int(statistics.median(sizes)), max(sizes)],
            "built_seconds_min_median_max": [round(min(times), 2), round(statistics.median(times), 2), round(max(times), 2)],
            "built_seconds_total": round(sum(times), 1),
            "built_triangles_min_median_max": [min(tris), int(statistics.median(tris)), max(tris)],
        })
    return summary


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build the L0 derived meshes of every served mask (SCR-05)")
    parser.add_argument("--data", type=Path, default=Path(os.environ[DATA_ENV]) if os.environ.get(DATA_ENV) else None,
                        required=DATA_ENV not in os.environ, help=f"the backend data root (or set {DATA_ENV})")
    parser.add_argument("--runs", nargs="*", help="only these run ids (and, for ground truth, their cases)")
    parser.add_argument("--no-ground-truth", action="store_true", help="skip the ground-truth meshes")
    args = parser.parse_args(argv)
    try:
        summary = build_all(args.data, args.runs, ground_truth=not args.no_ground_truth)
    except BuildError as exc:
        print(f"FAIL [{exc.code}] {exc}", file=sys.stderr)
        return 2
    print("SUMMARY " + json.dumps(summary, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
