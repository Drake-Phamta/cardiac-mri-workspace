"""Derived-mesh step: build the L0 meshes of every served mask into ``<data>/derived_meshes/`` (V2-01, SCR-05).

    python -m backend.mesh.build_cache --data <CARDIAC_BACKEND_DATA> [--runs RUN_ID ...] [--no-ground-truth]
                                       [--no-error-meshes]

For each served run (a Contract 2 package under ``<data>/experiments``) the RAW and PROCESSED prediction masks,
and for each EVALUATION case its ground truth, it writes the undecimated voxel-face surface plus the source slice
of every face (``artifact.py``, format ``cardiac-mesh/1``) as

    <data>/derived_meshes/<mask_sha256>.l0.cmesh    the mesh bytes
    <data>/derived_meshes/<mask_sha256>.l0.json     sidecar: counts, shape, sha256 of the bytes

keyed by the sha256 of the SOURCE MASK (the prediction NRRD's checksum from its Contract 2 manifest; for a
ground truth the mask checksum recorded by the ingest). Files are write-once like the data cache: a re-run is a
NO_OP, and a file that exists with other bytes is a CHECKSUM_CONFLICT, never overwritten. The sidecar is written
last, so a mesh without a sidecar is an interrupted build and is rebuilt.

For each RAW and PROCESSED prediction of an EVALUATION case it also writes the ERROR mesh against the case's ground
truth (DR-005; ``error_artifact.py``, format ``cardiac-errormesh/2``: the FP and FN voxel-face surfaces, every face with
its source slice, its class and its connected error region, plus the region table) as

    <data>/derived_meshes/<reference_sha256>.<prediction_sha256>.err2.cmesh    the error mesh bytes
    <data>/derived_meshes/<reference_sha256>.<prediction_sha256>.err2.json     sidecar: counts, shape, sha256, regions

keyed by BOTH masks' sha256 and the format version (``err2``), write-once in the same way. Never built for an
INFERENCE_REVIEW case (INT-12: CASE_0001 has no ground truth in the cache and is in ``inference_only_ids``).

The regions are labelled with scipy (``error_geometry.label_error_class``; scipy is not in ``backend/requirements.txt``,
so an error mesh that has to be BUILT on a host without it fails with SCIPY_REQUIRED - build on the operator PC and copy
``derived_meshes/``, or pass ``--no-error-meshes``). A pair that is already built is a NO_OP and needs no scipy.

Files of the first format version (``*.err1.cmesh`` / ``*.err1.json``, built by an earlier run of this step) are NOT
touched: the build leaves them in place, never reads them, and reports how many there are and how large (the backend
serves ``err2`` only, so a pair is never answered by two formats). Remove them yourself once nothing needs them.

Contract 2 and API Contract 11 are unchanged: this step only adds derived, patient-derived files outside git.
CASE_0001 (INT-12) has no ground truth in the cache, so none is built for it; its predictions are meshed.

Ground truth is rebuilt from the data cache's ground-truth slice PNGs, each checked against the checksum the cache
recorded for it; a prediction is read from its NRRD, checked against its manifest checksum. Memory: one 640x640x88
volume at a time (about 36 MB) plus the four most recent predictions the experiment store keeps, and for the error
meshes the ground truth of one case.
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

from . import artifact, error_artifact
from .error_geometry import DEFAULT_CONNECTIVITY

DERIVED_DIR = "derived_meshes"
MESH_SUFFIX = ".l0.cmesh"
SIDECAR_SUFFIX = ".l0.json"
# The error mesh of one (ground truth, prediction) pair: both digests and the format version in the name.
ERROR_SUFFIX = ".err2.cmesh"
ERROR_SIDECAR_SUFFIX = ".err2.json"
# The first version of the error mesh (no regions; never released): its files are left alone and never served.
LEGACY_ERROR_SUFFIXES = (".err1.cmesh", ".err1.json")
ERROR_SOURCE = "error_mesh"
DATA_ENV = "CARDIAC_BACKEND_DATA"


class BuildError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


def mesh_path(root: Path, mask_sha256: str) -> Path:
    return Path(root) / f"{mask_sha256}{MESH_SUFFIX}"


def sidecar_path(root: Path, mask_sha256: str) -> Path:
    return Path(root) / f"{mask_sha256}{SIDECAR_SUFFIX}"


def error_mesh_path(root: Path, reference_sha256: str, prediction_sha256: str) -> Path:
    return Path(root) / f"{reference_sha256}.{prediction_sha256}{ERROR_SUFFIX}"


def error_sidecar_path(root: Path, reference_sha256: str, prediction_sha256: str) -> Path:
    return Path(root) / f"{reference_sha256}.{prediction_sha256}{ERROR_SIDECAR_SUFFIX}"


def legacy_error_files(root: Path) -> List[Path]:
    """The first-format error-mesh files (``*.err1.cmesh`` / ``*.err1.json``) in the cache folder, sorted; read-only."""
    root = Path(root)
    if not root.is_dir():
        return []
    return sorted(path for suffix in LEGACY_ERROR_SUFFIXES for path in root.glob(f"*{suffix}"))


def _require_scipy() -> None:
    """The regions are labelled with scipy: say so before a volume is read, not with a bare ImportError."""
    try:
        import scipy.ndimage  # noqa: F401
    except ImportError as exc:
        raise BuildError("SCIPY_REQUIRED", "the error meshes label their regions with scipy.ndimage, which is not "
                                           "installed here (it is not part of backend/requirements.txt): build them "
                                           "where scipy is installed and copy derived_meshes/, or pass "
                                           "--no-error-meshes") from exc


def _write_atomic(path: Path, payload: bytes) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def _verified_record(side: Path, body: Path) -> Optional[Dict[str, Any]]:
    """The sidecar of a finished build, after checking that the mesh next to it still has the recorded bytes; None
    when there is no sidecar (nothing built, or an interrupted build). A mismatch is a CHECKSUM_CONFLICT."""
    if not side.is_file():
        return None
    record = json.loads(side.read_text(encoding="utf-8"))
    if record.get("empty"):
        return record
    if not body.is_file() or hashlib.sha256(body.read_bytes()).hexdigest() != record.get("mesh_sha256"):
        raise BuildError("CHECKSUM_CONFLICT", f"{body.name} no longer matches its sidecar; derived meshes are "
                                              f"never overwritten - move the pair aside to rebuild it")
    return record


def _write_pair(side: Path, body: Path, payload: bytes, record: Dict[str, Any]) -> None:
    """Body first, sidecar last (a body without a sidecar is an interrupted build); never over other bytes."""
    if body.exists() and body.read_bytes() != payload:
        raise BuildError("CHECKSUM_CONFLICT", f"{body.name} exists with different bytes (interrupted build?); "
                                              f"derived meshes are never overwritten - move it aside")
    if not body.exists():
        _write_atomic(body, payload)
    _write_atomic(side, (json.dumps(record, sort_keys=True, indent=2) + "\n").encode("utf-8"))


def store_volume(root: Path, mask_sha256: str, volume_zyx: Any, source: str) -> Dict[str, Any]:
    """Build and store the mesh of one mask, write-once. Returns the sidecar (plus ``action``).

    ``volume_zyx`` is the (z, y, x) volume or a callable producing it; a callable is not called when the mesh
    already exists (a re-run reads no mask).
    """
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    side, body = sidecar_path(root, mask_sha256), mesh_path(root, mask_sha256)
    existing = _verified_record(side, body)
    if existing is not None:
        return dict(existing, action="NO_OP")
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
    record = dict(info, mask_sha256=mask_sha256, source=source)
    _write_pair(side, body, payload, record)
    return dict(record, action="NEW")


def store_error_volumes(root: Path, reference_sha256: str, prediction_sha256: str, reference_volume: Any,
                        prediction_volume: Any, connectivity: int = DEFAULT_CONNECTIVITY) -> Dict[str, Any]:
    """Build and store the error mesh of one (ground truth, prediction) pair, write-once. Returns the sidecar (plus
    ``action``): NEW, or NO_OP when the pair was built before (neither volume is then read - both may be callables).

    The file name has no connectivity: one pair, one file, and the connectivity is in its header and sidecar. Asking for
    another connectivity than the one a pair was built with is a CONNECTIVITY_CONFLICT, never a silent NO_OP.
    """
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    side = error_sidecar_path(root, reference_sha256, prediction_sha256)
    body = error_mesh_path(root, reference_sha256, prediction_sha256)
    existing = _verified_record(side, body)
    if existing is not None:
        if existing.get("connectivity") != connectivity:
            raise BuildError("CONNECTIVITY_CONFLICT", f"{body.name} was built with connectivity "
                                                      f"{existing.get('connectivity')}, not {connectivity}; derived "
                                                      f"meshes are never overwritten - move the pair aside to rebuild it")
        return dict(existing, action="NO_OP")
    _require_scipy()
    reference = reference_volume() if callable(reference_volume) else reference_volume
    prediction = prediction_volume() if callable(prediction_volume) else prediction_volume
    payload, info = error_artifact.build_error_artifact(prediction, reference, prediction_sha256=prediction_sha256,
                                                         reference_sha256=reference_sha256, connectivity=connectivity)
    record = dict(info, source=ERROR_SOURCE)
    _write_pair(side, body, payload, record)
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
              log=print, error_meshes: bool = True) -> Dict[str, Any]:
    """Build every derived mesh of the data root; ``ground_truth=False`` reads no ground truth at all (so no
    ground-truth mesh and no error mesh), ``error_meshes=False`` skips only the error meshes."""
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
    error_results: List[Dict[str, Any]] = []
    seen = set()

    def note(into: List[Dict[str, Any]], label: str, sidecar: Dict[str, Any], elapsed: float, extra: str = "") -> None:
        into.append({"label": label, "action": sidecar["action"], "seconds": elapsed,
                     "bytes": sidecar.get("bytes", 0), "triangles": sidecar.get("triangle_count", 0),
                     "vertices": sidecar.get("vertex_count", 0), "components": sidecar.get("component_count"),
                     "header_bytes": sidecar.get("header_bytes")})
        log(f"{sidecar['action']:5} {label:34} tri={sidecar.get('triangle_count', 0):>7} "
            f"bytes={sidecar.get('bytes', 0):>8} {elapsed:6.2f}s{extra}", flush=True)

    def record(label: str, mask_sha: str, volume_fn, source: str) -> None:
        if mask_sha in seen:
            return
        seen.add(mask_sha)
        started = time.perf_counter()
        sidecar = store_volume(root, mask_sha, volume_fn, source)
        note(results, label, sidecar, time.perf_counter() - started)

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
    summary = summarise(results)
    if ground_truth and error_meshes:
        # One ground truth is held at a time, so the runs go case by case. A pair already seen (EXP-D-PP serves
        # the RAW prediction of EXP-D-100 as its own RAW mask) is built once.
        held: Dict[str, np.ndarray] = {}
        pairs = set()

        def ground_truth_of(case: Any) -> np.ndarray:
            if case.case_id not in held:
                held.clear()
                held[case.case_id] = ground_truth_volume(case)
            return held[case.case_id]

        for run in sorted(selected, key=lambda item: (item.case_id, item.experiment_id)):
            case = cases.get(run.case_id)
            # INT-12 and every case without a ground truth: no error mesh can exist for them.
            if (run.status != "SUCCEEDED" or case is None or case.case_id in cases.inference_only_ids
                    or not case.ground_truth_available or not case.data.get("mask_sha256")):
                continue
            for variant in ("RAW", "PROCESSED"):
                mask_id = run.mask_id(variant)
                if mask_id is None:
                    continue
                reference_sha = case.data["mask_sha256"]
                prediction_sha = run.package.artifacts[mask_id]["checksum"]["value"]
                if (reference_sha, prediction_sha) in pairs:
                    continue
                pairs.add((reference_sha, prediction_sha))
                started = time.perf_counter()
                sidecar = store_error_volumes(
                    root, reference_sha, prediction_sha, lambda case=case: ground_truth_of(case),
                    lambda run=run, variant=variant: experiments.prediction_volume(run, variant)[2])
                note(error_results, f"{run.run_id} {variant} ERROR", sidecar, time.perf_counter() - started,
                     f" fp={sidecar.get('fp_voxels', 0)} fn={sidecar.get('fn_voxels', 0)} "
                     f"regions={sidecar.get('component_count', 0)}")
        errors = summarise(error_results)
        errors["pairs"] = errors.pop("masks")
        summary["error_meshes"] = errors
        legacy = legacy_error_files(root)
        if legacy:
            # Left in place on purpose (never deleted by this step, never served): say how many and how large.
            errors["legacy_v1_files"] = len(legacy)
            errors["legacy_v1_bytes"] = sum(path.stat().st_size for path in legacy)
            log(f"NOTE {len(legacy)} first-format error-mesh files (*.err1.*, {errors['legacy_v1_bytes']} bytes) are "
                f"left in place; the backend serves *.err2.* only - remove them yourself once nothing needs them",
                flush=True)
    return summary


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
    # Error meshes only: the regions per mesh and the size of the JSON header that carries their table (new and old).
    served = [r for r in results if r["action"] in ("NEW", "NO_OP")]
    for key, name in (("components", "components_min_median_max"), ("header_bytes", "header_bytes_min_median_max")):
        values = [r[key] for r in served if r.get(key) is not None]
        if values:
            summary[name] = [min(values), int(statistics.median(values)), max(values)]
    return summary


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build the L0 derived meshes of every served mask (SCR-05)")
    parser.add_argument("--data", type=Path, default=Path(os.environ[DATA_ENV]) if os.environ.get(DATA_ENV) else None,
                        required=DATA_ENV not in os.environ, help=f"the backend data root (or set {DATA_ENV})")
    parser.add_argument("--runs", nargs="*", help="only these run ids (and, for ground truth, their cases)")
    parser.add_argument("--no-ground-truth", action="store_true",
                        help="read no ground truth: skip the ground-truth meshes and the error meshes derived from it")
    parser.add_argument("--no-error-meshes", action="store_true", help="skip the FP / FN error meshes only")
    args = parser.parse_args(argv)
    try:
        summary = build_all(args.data, args.runs, ground_truth=not args.no_ground_truth,
                            error_meshes=not args.no_error_meshes)
    except BuildError as exc:
        print(f"FAIL [{exc.code}] {exc}", file=sys.stderr)
        return 2
    print("SUMMARY " + json.dumps(summary, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
