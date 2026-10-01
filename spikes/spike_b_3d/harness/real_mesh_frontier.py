#!/usr/bin/env python3
"""
Real-mesh decimation frontier and OFFLINE picking error — Spike B B5, B9, B12 (B14 cohorts).

THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Not production.

Written on Day 22 (2026-10-01) by a Claude agent under the leader's one-day recovery
override (management/day22/RECOVERY_OVERRIDE_DAY22.md). Spike B belongs to Vu Hung Anh;
he confirms, adopts or rejects this on Day 23. Nothing here is an on-device number.

WHAT IS REUSED, UNCHANGED
-------------------------
- mesh/build_mesh.py: extract_surface (exact voxel-face surface — deliberately NOT
  marching cubes, see its docstring), decimate (vertex clustering), to_world, write_obj.
- harness/picking_error.py: ray_mesh_first_hit (Moller-Trumbore), slice_of_world (floor,
  never clamp), load_obj, and its cohort rule: a ray that meets the mask but not the mesh
  is a NO-HIT, the largest possible picking error, and makes the cohort NOT within bound.
  Its march_mask is no longer the ground truth (next section); it is kept as a reference
  column only.

WHAT IS NEW
-----------
(1) a real-mask loader; (2) a deterministic ray set sized for real anatomy instead of the
13 fixture rays; (3) an EXACT cell-by-cell traversal of the mask as ground truth, and the
same walk for every along-ray measurement (depth of a missed ray, clearance of a background
ray, the classification of out-of-bound picks); (4) per-ray candidate triangles for
ray_mesh_first_hit — a speed-up whose answers are checked against the brute-force path on
EVERY out-of-bound ray and every background navigation, plus a random sample, on every run
(`acceleration_checks`). A speed-up that changed one answer would be a defect.

WHY THE GROUND TRUTH IS AN EXACT TRAVERSAL, NOT march_mask
----------------------------------------------------------
The first run scored the exact level-0 surface (every triangle IS a voxel face) at up to 17
slices of error and 86 "navigations where the mask has no surface". A voxel-face surface
cannot do that: march_mask samples the ray every 0.25 voxel and skips a voxel the ray only
clips. `exact_first_voxel` walks every voxel the ray enters - the same Amanatides-Woo walk
as conformance.py's reference `slice_of_ray`, a separate implementation that shares no code
with this file (test_real_mesh_frontier.py compares the two on 2,000 random rays). Still
mask-only, still no mesh. march_mask scores stay in the output (`scored_against_march_mask`)
so the change is visible; march_mask is run only on rays the exact walk finds a voxel for,
because it samples only points of voxels the ray passes through and so cannot find one where
the walk finds none (re-checked each run on the nearest misses: `march_on_nearest_misses`).

THE RAY SET (stated, because B5 is only as meaningful as the rays it is measured on)
-----------------------------------------------------------------------------------
Orthographic bundles: for each direction d, a regular grid of parallel rays (pitch
--grid-pitch voxels, fixed non-lattice offsets 0.37/0.61 so no ray runs exactly along a
voxel edge) covering the projection of the mask's bounding box, each ray starting just
outside that box. Directions are grouped into the fixture's contractual B14 cohorts
(tests/fixtures/geometry b14_grouping), defined geometrically the way the fixture defines
them — by the angle between the ray and the SLICE PLANE:

    interior         ray mostly along +/-z: elevation +/-90 deg, and +/-60 deg at 6 azimuths
    surface_tangent  ray near-parallel to the slice plane: elevation +/-2 and +/-5 deg
                     at 6 azimuths (15, 75, ... 315 deg)
    oblique          diagnostic only, between the two: elevation +/-20 and +/-35 deg

Every direction is a camera orientation, so the set also covers "after rotate" (B6) the
way picking_error.py's six rotations do; zoom does not change which triangle a world-space
ray meets and is therefore not simulated offline (the device run covers it).

OUT-OF-BOUND PICKS, CLASSIFIED (rays that meet the mask, error > 1 or no hit)
---------------------------------------------------------------------------
Along each such ray the exact walk gives the runs of consecutive foreground voxels; the first
run is [t_in, t_out]. With t_hit the distance to the mesh hit:
    no_hit           the mesh is not hit at all (depth = exact max EDT along the ray)
    inflated         t_hit < t_in: the mesh is hit in front of the mask
    local            t_in <= t_hit <= t_out: the hit lies on the first run, displaced
    cross_structure  t_hit > t_out: the first run is not on the mesh (a clipped corner or
                     a collapsed 1-voxel-thin structure); the hit lands on a later surface,
                     and the error is the slice distance to that next surface along the ray
B9 OFFLINE: rays whose exact walk meets no mask voxel are background rays; every one the
mesh resolves to a slice is reported as a navigation where the mask has no surface,
bucketed by the exact clearance (min EDT to the mask along the walk). Nothing is excused.

RESOURCES: the ground truth runs in a process pool (--workers, default min(4, cpu_count));
each worker holds its own copy of the mask plus two cropped distance fields (~0.13 GB with
the interpreter). Use --workers 2 while a GPU job trains on the shared workstation.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # spikes/spike_b_3d
REPO = os.path.dirname(os.path.dirname(ROOT))
sys.path.insert(0, os.path.join(ROOT, "mesh"))
sys.path.insert(0, HERE)

from build_mesh import decimate, extract_surface, to_world, write_obj  # noqa: E402
from picking_error import (SCQ06_BOUND, GRAZING_COS, load_obj, march_mask,  # noqa: E402
                           ray_mesh_first_hit, slice_of_world)

# No absolute default: the private package location comes from the environment or the
# command line (public repository).
DEFAULT_DATA_ROOT = os.environ.get("CARDIAC_DATA_ROOT")
DEFAULT_DATASET_MANIFEST = os.path.join(REPO, "data", "manifests", "dataset_manifest.json")
DEFAULT_SPLIT_MANIFEST = os.path.join(REPO, "data", "manifests", "split_manifest_path_a_seed2024.json")
DEFAULT_MESH_OUT = os.path.join(ROOT, "mesh", "out_real")          # gitignored; + /<case_id>
DEFAULT_EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW", "20261001_real_mesh",
                                "real_mesh_frontier.json")
CONTRACT_VERSION = "dr008a-dr012/v1.0.0"

# Memory guard (2026-10-01): the first default, cpu_count() - 2 = 18 workers, each with its
# own copy of the 640x640x88 mask, exhausted the shared workstation's RAM in a QA re-run and
# killed a GPU training job. Four keeps the pool near 0.5 GB; --workers overrides it.
DEFAULT_WORKERS = min(4, os.cpu_count() or 1)
GRID_OFFSETS = (0.37, 0.61)       # fractions of one grid pitch; keep rays off voxel edges
BOX_MARGIN = 2                    # voxels around the foreground bounding box
EDT_MARGIN = 12                   # voxels of context for clearance / depth measurements
NEAREST_MISS_CHECK = 300          # exact-None rays re-marched with march_mask each run


# --- case selection ------------------------------------------------------------------

def lowest_effective_25_case(split: dict) -> str:
    ids = split["training_subsets"]["25_percent"]["effective_case_ids"]
    return min(ids, key=lambda c: int(c.split("_")[1]))


def check_case_is_training(split: dict, case_id: str) -> dict:
    parts = {name: case_id in p.get("case_ids", []) for name, p in split["partitions"].items()}
    eff25 = case_id in split["training_subsets"]["25_percent"]["effective_case_ids"]
    if parts.get("final_holdout") or parts.get("validation"):
        raise SystemExit(f"{case_id} is in {parts} - Spike B must use a TRAINING case, "
                         "never final_holdout (Day 22 override section 3: no leakage).")
    if not parts.get("train") or not eff25:
        raise SystemExit(f"{case_id} is not an effective 25% training case: {parts}, eff25={eff25}")
    return {"partitions": parts, "in_25_percent_effective": eff25}


def rel(path: str) -> str:
    """Repository-relative path with forward slashes; absolute when on another drive."""
    try:
        return os.path.relpath(path, REPO).replace(os.sep, "/")
    except ValueError:
        return os.path.abspath(path).replace(os.sep, "/")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_mask(path: str):
    import nrrd  # pynrrd; index_order 'F' -> array axes are NRRD axes (x, y, z)

    data, header = nrrd.read(path)
    if data.ndim != 3:
        raise SystemExit(f"expected a 3-D mask, got {data.shape}")
    directions = np.asarray(header.get("space directions"), dtype=np.float64)
    off_diag = directions - np.diag(np.diag(directions))
    if directions.shape != (3, 3) or np.any(off_diag != 0) or np.any(np.diag(directions) <= 0):
        # DR-012: validated axis-aligned geometry only. Never paper over an oblique case.
        raise SystemExit(f"GEOMETRY_NOT_VALIDATED: space directions {directions.tolist()}")
    spacing = np.diag(directions).tolist()
    origin = np.asarray(header.get("space origin", [0, 0, 0]), dtype=np.float64).tolist()
    mask = (data > 0).astype(np.uint8)
    return mask, spacing, origin, header


# --- ray set --------------------------------------------------------------------------

def unit_from(elev_deg: float, azim_deg: float) -> np.ndarray:
    e, a = math.radians(elev_deg), math.radians(azim_deg)
    return np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])


def cohort_directions() -> dict[str, list[tuple[str, np.ndarray]]]:
    out: dict[str, list] = {"interior": [], "surface_tangent": [], "oblique": []}
    out["interior"].append(("el+90", np.array([0.0, 0.0, 1.0])))
    out["interior"].append(("el-90", np.array([0.0, 0.0, -1.0])))
    for el in (60, -60):
        for az in range(0, 360, 60):
            out["interior"].append((f"el{el:+d}_az{az:03d}", unit_from(el, az)))
    for el in (2, -2, 5, -5):
        for az in range(15, 360, 60):
            out["surface_tangent"].append((f"el{el:+d}_az{az:03d}", unit_from(el, az)))
    for el in (20, -20, 35, -35):
        for az in range(45, 360, 60):
            out["oblique"].append((f"el{el:+d}_az{az:03d}", unit_from(el, az)))
    return out


def basis_for(d: np.ndarray):
    ref = np.array([1.0, 0.0, 0.0]) if abs(d[2]) > 0.9 else np.array([0.0, 0.0, 1.0])
    u = np.cross(d, ref)
    u /= np.linalg.norm(u)
    w = np.cross(u, d)
    w /= np.linalg.norm(w)
    return u, w


def ray_bundle(d, box_lo_w, box_hi_w, pitch):
    """A regular grid of parallel rays covering the box's projection, starting before it."""
    u, w = basis_for(d)
    centre = (box_lo_w + box_hi_w) / 2.0
    corners = np.array([[x, y, z] for x in (box_lo_w[0], box_hi_w[0])
                        for y in (box_lo_w[1], box_hi_w[1])
                        for z in (box_lo_w[2], box_hi_w[2])]) - centre
    a_rng = (corners @ u).min(), (corners @ u).max()
    b_rng = (corners @ w).min(), (corners @ w).max()
    t0 = (corners @ d).min() - 1.0
    length = (corners @ d).max() - t0 + 1.0
    na = int(math.floor((a_rng[1] - a_rng[0]) / pitch - GRID_OFFSETS[0])) + 1
    nb = int(math.floor((b_rng[1] - b_rng[0]) / pitch - GRID_OFFSETS[1])) + 1
    a0 = a_rng[0] + GRID_OFFSETS[0] * pitch
    b0 = b_rng[0] + GRID_OFFSETS[1] * pitch
    rays = []
    for k in range(na):
        for j in range(nb):
            a, b = a0 + k * pitch, b0 + j * pitch
            rays.append((k, j, centre + a * u + b * w + t0 * d))
    frame = {"u": u, "w": w, "centre": centre, "a0": a0, "b0": b0, "na": na, "nb": nb,
             "pitch": pitch, "length": length}
    return rays, frame


# --- exact traversal of the mask ---------------------------------------------------------

def _walk_setup(o_w, d_w, spacing, origin, box_lo, box_hi):
    sp = np.asarray(spacing, dtype=np.float64)
    d_w = np.asarray(d_w, dtype=np.float64)
    d_w = d_w / np.linalg.norm(d_w)
    p = (np.asarray(o_w, dtype=np.float64) - np.asarray(origin, dtype=np.float64)) / sp
    v = d_w / sp
    t_in, t_out, in_axis = 0.0, math.inf, int(np.argmax(np.abs(v)))
    for a in range(3):
        if abs(v[a]) <= 1e-12:
            if p[a] < box_lo[a] or p[a] >= box_hi[a]:
                return None
            continue
        t1, t2 = (box_lo[a] - p[a]) / v[a], (box_hi[a] - p[a]) / v[a]
        if t1 > t2:
            t1, t2 = t2, t1
        if t1 > t_in:
            t_in, in_axis = t1, a
        t_out = min(t_out, t2)
    if t_out < t_in:
        return None
    return d_w, p, v, t_in, t_out, in_axis


def exact_walk(o_w, d_w, spacing, origin, box_lo, box_hi):
    """Every voxel the ray passes through inside [box_lo, box_hi), in order (Amanatides-Woo).

    Yields (cell, t_enter, t_exit, entry_axis); t is the world distance along the normalised
    direction. Start an infinitesimal step inside; step tied boundaries together, so a ray
    through an edge or corner never visits a cell it does not enter.
    """
    setup = _walk_setup(o_w, d_w, spacing, origin, box_lo, box_hi)
    if setup is None:
        return
    _d, p, v, t_in, t_out, in_axis = setup
    t = t_in + 1e-9
    at = p + v * t
    cell = [int(math.floor(x)) for x in at]
    step = [1 if x > 0 else -1 if x < 0 else 0 for x in v]
    t_max, t_delta = [], []
    for a in range(3):
        if step[a] == 0:
            t_max.append(math.inf)
            t_delta.append(math.inf)
        else:
            boundary = cell[a] + (1 if step[a] > 0 else 0)
            t_max.append(t + (boundary - at[a]) / v[a])
            t_delta.append(abs(1.0 / v[a]))
    entry_axis, t_enter = in_axis, t_in
    while all(box_lo[a] <= cell[a] < box_hi[a] for a in range(3)) and t <= t_out + 1e-9:
        nxt = min(t_max)
        yield (cell[0], cell[1], cell[2]), t_enter, min(nxt, t_out), entry_axis
        for a in range(3):
            if abs(t_max[a] - nxt) <= 1e-12:
                cell[a] += step[a]
                t_max[a] += t_delta[a]
                entry_axis = a
        t_enter = t = nxt


def exact_first_voxel(o_w, d_w, mask, spacing, origin, box_lo, box_hi):
    """First occupied voxel the ray ENTERS: (slice_index, entry_axis, abs_cos_incidence) or None.

    Same contract as picking_error.march_mask, but exact (the walk above) instead of sampled
    every 0.25 voxel. box_lo / box_hi (voxel indices, inclusive / exclusive) bound the search;
    nothing outside the foreground bounding box can be occupied, so clipping to it is exact.
    """
    d_w = np.asarray(d_w, dtype=np.float64)
    d_w = d_w / np.linalg.norm(d_w)
    for cell, _t0, _t1, axis in exact_walk(o_w, d_w, spacing, origin, box_lo, box_hi):
        if mask[cell[0], cell[1], cell[2]]:
            return cell[2], axis, abs(float(d_w[axis]))
    return None


def foreground_runs(o_w, d_w, mask, spacing, origin, box_lo, box_hi):
    """[(t_in, t_out, z_first)] for each run of consecutive foreground voxels along the ray."""
    runs, current = [], None
    for cell, t0, t1, _axis in exact_walk(o_w, d_w, spacing, origin, box_lo, box_hi):
        if mask[cell[0], cell[1], cell[2]]:
            if current is None:
                current = [t0, t1, cell[2]]
            else:
                current[1] = t1
        elif current is not None:
            runs.append(tuple(current))
            current = None
    if current is not None:
        runs.append(tuple(current))
    return runs


def classify_out_of_bound(t_hit, runs, tol=1e-6):
    """no_hit / inflated / local / cross_structure (see the module docstring)."""
    if t_hit is None:
        return "no_hit"
    t_in, t_out, _z = runs[0]
    if t_hit < t_in - tol:
        return "inflated"
    if t_hit <= t_out + tol:
        return "local"
    return "cross_structure"


# --- ground truth workers ----------------------------------------------------------------

_W: dict = {}


def _init_worker(mask, spacing, origin, inside, outside, clo, chi):
    _W.update(mask=mask, spacing=spacing, origin=origin, inside=inside, outside=outside,
              clo=[int(x) for x in clo], chi=[int(x) for x in chi])


def _truth_job(args):
    """Exact truth, march_mask reference, and the exact depth (hit) or clearance (miss)."""
    ray_index, o, d, search_lo, search_hi = args
    mask, sp, org = _W["mask"], _W["spacing"], _W["origin"]
    clo, chi = _W["clo"], _W["chi"]
    exact = exact_first_voxel(o, d, mask, sp, org, search_lo, search_hi)
    if exact is not None:
        depth = 0.0
        for cell, _t0, _t1, _a in exact_walk(o, d, sp, org, search_lo, search_hi):
            if mask[cell[0], cell[1], cell[2]]:
                depth = max(depth, float(_W["inside"][cell[0] - clo[0], cell[1] - clo[1], cell[2] - clo[2]]))
        return ray_index, exact, march_mask(o, d, mask, sp, org), depth, None
    clearance = float(EDT_MARGIN)
    for cell, _t0, _t1, _a in exact_walk(o, d, sp, org, clo, chi):
        clearance = min(clearance, float(_W["outside"][cell[0] - clo[0], cell[1] - clo[1], cell[2] - clo[2]]))
    return ray_index, None, None, None, clearance


def _march_only_job(args):
    ray_index, o, d = args
    return ray_index, march_mask(o, d, _W["mask"], _W["spacing"], _W["origin"])


# --- mesh hits: picking_error.ray_mesh_first_hit on per-ray candidate triangles --------

def candidate_lists(verts_w, tris, frame):
    """Triangles whose projected bounding box contains each grid ray (conservative)."""
    u, w, c = frame["u"], frame["w"], frame["centre"]
    pa = (verts_w - c) @ u
    pb = (verts_w - c) @ w
    ta, tb = pa[tris], pb[tris]
    eps = 1e-6
    amin, amax = ta.min(1) - eps, ta.max(1) + eps
    bmin, bmax = tb.min(1) - eps, tb.max(1) + eps
    p, a0, b0 = frame["pitch"], frame["a0"], frame["b0"]
    kmin = np.maximum(np.ceil((amin - a0) / p), 0).astype(np.int64)
    kmax = np.minimum(np.floor((amax - a0) / p), frame["na"] - 1).astype(np.int64)
    jmin = np.maximum(np.ceil((bmin - b0) / p), 0).astype(np.int64)
    jmax = np.minimum(np.floor((bmax - b0) / p), frame["nb"] - 1).astype(np.int64)
    cands: dict[tuple[int, int], list[int]] = {}
    live = np.nonzero((kmin <= kmax) & (jmin <= jmax))[0]
    for t in live:
        for k in range(kmin[t], kmax[t] + 1):
            for j in range(jmin[t], jmax[t] + 1):
                cands.setdefault((k, j), []).append(int(t))
    return cands


# --- per-level statistics -------------------------------------------------------------

def cohort_stats(rows, level):
    errs = [r["err"][level] for r in rows if r["err"][level] is not None]
    no_hit = sum(1 for r in rows if r["err"][level] is None)
    hist: dict[str, int] = {}
    for e in errs:
        hist[str(e)] = hist.get(str(e), 0) + 1
    return {
        "samples": len(rows),
        "no_hit": no_hit,
        "max_error_slices": max(errs) if errs else None,
        "mean_error_slices": round(sum(errs) / len(errs), 4) if errs else None,
        "share_exact": round(hist.get("0", 0) / len(rows), 4) if rows else None,
        "error_histogram": dict(sorted(hist.items(), key=lambda kv: int(kv[0]))),
        "mean_incidence_deg": round(sum(r["incidence_deg"] for r in rows) / len(rows), 1) if rows else None,
        # Slices crossed per unit of along-ray displacement. The header affine is the QA-002
        # default, so the unit is a voxel, not a millimetre.
        "mean_slices_per_voxel_unit": round(
            sum(r["slices_per_voxel_unit"] for r in rows) / len(rows), 4) if rows else None,
        # picking_error._cohort_stats rule, unchanged: no-hit is the largest error.
        "within_bound": bool(errs) and max(errs) <= SCQ06_BOUND and no_hit == 0,
        "within_bound_ignoring_no_hit": bool(errs) and max(errs) <= SCQ06_BOUND,
    }


def bucket(v, edges):
    """'0' for exactly zero, then (lo, hi] buckets, then '>last'."""
    if v == 0:
        return "0"
    for lo, hi in zip(edges[:-1], edges[1:]):
        if lo < v <= hi:
            return f"({lo},{hi}]"
    return f">{edges[-1]}"


def _environment() -> dict:
    import platform

    import scipy
    try:
        import nrrd
        nrrd_version = getattr(nrrd, "__version__", "unknown")
    except ImportError:
        nrrd_version = None
    return {"python": platform.python_version(), "numpy": np.__version__,
            "scipy": scipy.__version__, "pynrrd": nrrd_version,
            "platform": platform.platform(), "logical_cpus": os.cpu_count()}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--case-id", help="default: lowest-numbered effective 25%% training case")
    ap.add_argument("--split-manifest", default=DEFAULT_SPLIT_MANIFEST,
                    help="Path A split manifest (PR #35, on main since f5aa763)")
    ap.add_argument("--dataset-manifest", default=DEFAULT_DATASET_MANIFEST)
    ap.add_argument("--data-root", default=DEFAULT_DATA_ROOT,
                    help="extracted LASC package (default: $CARDIAC_DATA_ROOT; no built-in path)")
    ap.add_argument("--cells", default="1,1.25,2,4,8",
                    help="lossless, near-lossless (max vertex move < 1 voxel), then aggressive")
    ap.add_argument("--grid-pitch", type=float, default=3.0)
    ap.add_argument("--mesh-out", help="default: mesh/out_real/<case_id> (gitignored)")
    ap.add_argument("--evidence", default=DEFAULT_EVIDENCE)
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                    help=f"ground-truth worker processes (default min(4, cpu_count) = {DEFAULT_WORKERS}). "
                         "Each worker holds its own copy of the mask and two cropped distance "
                         "fields (~0.13 GB with the interpreter). Use 2 while a GPU job trains.")
    ap.add_argument("--check-rays", type=int, default=300,
                    help="random rays per level re-run without acceleration, on top of every "
                         "out-of-bound ray and every background navigation")
    args = ap.parse_args()
    if not args.data_root:
        raise SystemExit("set CARDIAC_DATA_ROOT or pass --data-root <extracted LASC package>")

    started = dt.datetime.now(dt.timezone(dt.timedelta(hours=7)))

    with open(args.split_manifest, "rb") as fh:
        split_bytes = fh.read()
    split = json.loads(split_bytes.decode("utf-8-sig"))
    case_id = args.case_id or lowest_effective_25_case(split)
    membership = check_case_is_training(split, case_id)

    mesh_out = os.path.abspath(args.mesh_out or os.path.join(DEFAULT_MESH_OUT, case_id))
    try:
        inside_repo = os.path.commonpath([mesh_out, REPO]) == REPO
    except ValueError:              # Windows: different drives, so certainly outside
        inside_repo = False
    if inside_repo:
        ignored = subprocess.run(["git", "-C", REPO, "check-ignore", "-q", mesh_out + "/x.obj"])
        if ignored.returncode != 0:
            raise SystemExit(f"--mesh-out {mesh_out} is not gitignored. Meshes derived from a "
                             "real mask never go into git.")
    os.makedirs(mesh_out, exist_ok=True)

    with open(args.dataset_manifest, "rb") as fh:
        dm_bytes = fh.read()
    dm = json.loads(dm_bytes.decode("utf-8-sig"))
    case = next(c for c in dm["cases"] if c["case_id"] == case_id)
    mask_rel = case["mask"]["path_relative"]
    mask_path = os.path.join(args.data_root, *mask_rel.split("/"))

    t = time.perf_counter()
    mask, spacing, origin, header = load_mask(mask_path)
    read_ms = (time.perf_counter() - t) * 1000.0
    shape = list(mask.shape)
    if shape != case["mask"]["shape"]:
        raise SystemExit(f"mask shape {shape} != manifest {case['mask']['shape']}")
    fg = np.argwhere(mask > 0)
    lo, hi = fg.min(0), fg.max(0)
    print(f"case {case_id}  mask {shape}  fg {len(fg)}  bbox {lo.tolist()}..{hi.tolist()}")

    # F5 (2026-09-16): no per-data-file SHA-256 in the public repository. The mask's hash
    # goes to a gitignored sidecar next to the meshes.
    with open(os.path.join(mesh_out, "data_file_hashes.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"case_id": case_id, "mask_path_relative": mask_rel,
                   "mask_file_sha256": sha256_file(mask_path),
                   "note": "kept out of the repository under F5; cite this sidecar, not the hash"},
                  fh, indent=1)
        fh.write("\n")

    # --- B12: surface + decimation levels -------------------------------------------
    cells = [float(c) if "." in c else int(c) for c in args.cells.split(",")]
    if len(cells) < 3:
        raise SystemExit("B12 needs at least three levels")
    t = time.perf_counter()
    v0, t0 = extract_surface(mask)
    extract_ms = (time.perf_counter() - t) * 1000.0
    print(f"level-0 surface: {len(v0)} vertices, {len(t0)} triangles, {extract_ms:.1f} ms")

    levels = []
    for i, cell in enumerate(cells):
        t = time.perf_counter()
        v, tr = decimate(v0, t0, cell)
        dec_ms = (time.perf_counter() - t) * 1000.0
        vw = to_world(v, spacing, origin)
        name = f"level_{i}_cell{str(cell).replace('.', 'p')}"
        obj = os.path.join(mesh_out, name + ".obj")
        write_obj(obj, vw, tr, header=(
            f"SPIKE_B real-mask mesh - {name} - case {case_id}\n"
            "DERIVED FROM A REAL MASK - never commit; regenerate with real_mesh_frontier.py\n"
            f"cluster cell: {cell} voxel(s); world = origin + voxel * spacing (header affine, "
            "QA-002: default spacing/origin, voxel units, NOT validated mm)"))
        if cell <= 1.0:
            disp = np.zeros(len(v0))
        else:
            keys = np.round(v0 / cell).astype(np.int64)
            _u, inv = np.unique(keys, axis=0, return_inverse=True)
            disp = np.linalg.norm(v0 - v[inv.ravel()], axis=1)
        levels.append({
            "level": i, "cluster_cell_voxels": cell, "name": name,
            "vertex_count": int(len(v)), "triangle_count": int(len(tr)),
            "reduction_vs_level_0": round(1.0 - len(tr) / max(1, len(t0)), 4),
            "decimation_ms": round(dec_ms, 3),
            "generation_ms": round(extract_ms + dec_ms, 3),
            "vertex_displacement_voxels": {"mean": round(float(disp.mean()), 4),
                                           "max": round(float(disp.max()), 4)},
            "obj_file": name + ".obj",
            "obj_bytes": os.path.getsize(obj),
            "obj_sha256": sha256_file(obj),
            "_verts": None, "_tris": None, "_path": obj,
        })
        print(f"  level {i} cell {cell}: {len(v)} v, {len(tr)} t, {dec_ms:.1f} ms")

    # Picking reads the OBJ back from disk - the same bytes the device build bundles.
    for lv in levels:
        lv["_verts"], lv["_tris"] = load_obj(lv["_path"])

    # --- ray set ----------------------------------------------------------------------
    sp, org = np.asarray(spacing, dtype=np.float64), np.asarray(origin, dtype=np.float64)
    box_lo_w = org + (lo - BOX_MARGIN) * sp
    box_hi_w = org + (hi + 1 + BOX_MARGIN) * sp
    rays = []
    bundles = []
    for cohort, dirs in cohort_directions().items():
        for label, d in dirs:
            bundle, frame = ray_bundle(d, box_lo_w, box_hi_w, args.grid_pitch)
            b_index = len(bundles)
            bundles.append({"cohort": cohort, "label": label, "d": d, "frame": frame,
                            "ray_indices": []})
            for k, j, o in bundle:
                bundles[b_index]["ray_indices"].append(len(rays))
                rays.append({"id": f"{cohort}/{label}/{k}/{j}", "cohort": cohort,
                             "bundle": b_index, "k": k, "j": j, "o": o, "d": d})
    print(f"ray set: {len(rays)} rays in {len(bundles)} bundles")

    # --- ground truth, exact depth / clearance ------------------------------------------
    from scipy import ndimage

    search_lo = [int(x) for x in (lo - 1)]
    search_hi = [int(x) for x in (hi + 2)]
    clo = np.maximum(lo - EDT_MARGIN, 0)
    chi = np.minimum(hi + 1 + EDT_MARGIN, np.array(shape))
    sub = mask[clo[0]:chi[0], clo[1]:chi[1], clo[2]:chi[2]] > 0
    outside_dist, nearest = ndimage.distance_transform_edt(~sub, return_indices=True)
    inside_dist = ndimage.distance_transform_edt(sub)

    t = time.perf_counter()
    jobs = [(i, r["o"], r["d"], search_lo, search_hi) for i, r in enumerate(rays)]
    init = (mask, spacing, origin, inside_dist, outside_dist, clo, chi)
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker, initargs=init) as pool:
        for i, exact, g, depth, clearance in pool.map(_truth_job, jobs, chunksize=64):
            r = rays[i]
            r["truth"], r["march"], r["depth"], r["clearance"] = exact, g, depth, clearance
    truth_s = time.perf_counter() - t
    n_hit = sum(1 for r in rays if r["truth"] is not None)
    print(f"ground truth: {n_hit} rays meet the mask, {len(rays) - n_hit} background, {truth_s:.1f} s")

    agree = {"same_slice": 0, "different_slice": 0, "exact_hit_march_none": 0}
    for r in rays:
        e, g = r["truth"], r["march"]
        if e is None:
            continue
        if g is None:
            agree["exact_hit_march_none"] += 1
        elif e[0] == g[0]:
            agree["same_slice"] += 1
        else:
            agree["different_slice"] += 1
    print(f"exact vs march_mask on the {n_hit} mask rays: {agree}")

    # march_mask cannot find a voxel where the exact walk finds none; re-checked on the
    # nearest misses (smallest clearance) every run.
    misses = sorted((i for i, r in enumerate(rays) if r["truth"] is None),
                    key=lambda i: (rays[i]["clearance"], i))[:NEAREST_MISS_CHECK]
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker, initargs=init) as pool:
        nearest_check = list(pool.map(_march_only_job, [(i, rays[i]["o"], rays[i]["d"]) for i in misses],
                                      chunksize=8))
    march_found = [rays[i]["id"] for i, g in nearest_check if g is not None]

    for r in rays:
        if r["truth"] is not None:
            sl, axis, cos_inc = r["truth"]
            r["slice_true"] = sl
            r["incidence_deg"] = round(math.degrees(math.acos(min(1.0, cos_inc))), 1)
            r["incidence_class"] = "steep" if cos_inc >= GRAZING_COS else "grazing"
            r["slices_per_voxel_unit"] = round(abs(r["d"][2]) / spacing[2], 4)
        r["err"], r["obs"], r["nav"], r["hit"] = {}, {}, {}, {}

    # --- per level: mesh hits ------------------------------------------------------------
    rng = np.random.default_rng(20261001)
    for lv in levels:
        t = time.perf_counter()
        V, T = lv["_verts"], lv["_tris"]
        L = lv["level"]
        for b in bundles:
            cands = candidate_lists(V, T, b["frame"])
            for ri in b["ray_indices"]:
                r = rays[ri]
                c = cands.get((r["k"], r["j"]))
                hit = ray_mesh_first_hit(r["o"], r["d"], V, T[c]) if c else None
                obs = slice_of_world(hit, spacing, origin, shape)
                r["obs"][L] = obs
                r["hit"][L] = hit
                if r["truth"] is not None:
                    r["err"][L] = None if obs is None else abs(obs - r["slice_true"])
                else:
                    r["nav"][L] = obs is not None
        lv["picking_s"] = round(time.perf_counter() - t, 2)

    # --- statistics ------------------------------------------------------------------------
    hit_rays = [r for r in rays if r["truth"] is not None]
    bg_rays = [r for r in rays if r["truth"] is None]
    depth_edges = [0, 1, 2, 4]
    clearance_edges = [0, 1, 2, 4, 8]
    worst_cap = 15
    accel_checks = []
    for lv in levels:
        L = lv["level"]
        V, T = lv["_verts"], lv["_tris"]
        by_group = {c: cohort_stats([r for r in hit_rays if r["cohort"] == c], L)
                    for c in ("interior", "surface_tangent", "oblique")}
        lv["b5"] = {
            "by_group": by_group,
            "all_cohorts": cohort_stats(hit_rays, L),
            "by_incidence_diagnostic": {
                cls: cohort_stats([r for r in hit_rays if r["incidence_class"] == cls], L)
                for cls in ("steep", "grazing")},
        }
        # B5 bounds EVERY real pick, not only the two contractual cohorts; B14 asks only
        # that those two are reported separately. So the verdict is over all rays.
        lv["b5"]["verdict"] = ("WITHIN_BOUND" if lv["b5"]["all_cohorts"]["within_bound"]
                               else "NOT_WITHIN_BOUND")
        march_rows = [r for r in hit_rays if r["march"] is not None]
        m_errs = [abs(r["obs"][L] - r["march"][0]) for r in march_rows if r["obs"][L] is not None]
        m_nohit = sum(1 for r in hit_rays if r["obs"][L] is None)
        lv["b5"]["scored_against_march_mask"] = {
            "samples": len(hit_rays), "march_found_a_voxel": len(march_rows),
            "no_hit": m_nohit, "max_error_slices": max(m_errs) if m_errs else None,
            "error_histogram": {str(e): m_errs.count(e) for e in sorted(set(m_errs))},
            "note": "reference only - march_mask skips voxels a ray crosses for < 0.25 voxel",
        }

        # Out-of-bound picks, classified along the exact walk.
        oob = [r for r in hit_rays if r["err"][L] is None or r["err"][L] > SCQ06_BOUND]
        classes: dict[str, dict] = {c: {"count": 0, "error_histogram": {}}
                                    for c in ("no_hit", "inflated", "local", "cross_structure")}
        nohit_depth: dict[str, int] = {}
        for r in oob:
            hp = r["hit"][L]
            t_hit = None if hp is None else float(np.dot(np.asarray(hp) - r["o"], r["d"] / np.linalg.norm(r["d"])))
            if r["obs"][L] is None and hp is not None:
                t_hit = None             # hit outside the volume: treated as no hit
            runs = foreground_runs(r["o"], r["d"], mask, spacing, origin, search_lo, search_hi)
            cls = classify_out_of_bound(t_hit, runs)
            r.setdefault("class", {})[L] = cls
            classes[cls]["count"] += 1
            if cls == "no_hit":
                key = bucket(r["depth"], depth_edges)
                nohit_depth[key] = nohit_depth.get(key, 0) + 1
            else:
                e = str(r["err"][L])
                classes[cls]["error_histogram"][e] = classes[cls]["error_histogram"].get(e, 0) + 1
        for c in classes.values():
            c["error_histogram"] = dict(sorted(c["error_histogram"].items(), key=lambda kv: int(kv[0])))
        lv["b5"]["out_of_bound_classes"] = classes
        lv["b5"]["out_of_bound_total"] = len(oob)
        lv["b5"]["no_hit_exact_max_edt_along_ray"] = dict(sorted(nohit_depth.items()))

        navs = [r for r in bg_rays if r["nav"][L]]
        nav_by_clearance: dict[str, int] = {}
        all_by_clearance: dict[str, int] = {}
        for r in bg_rays:
            key = bucket(r["clearance"], clearance_edges)
            all_by_clearance[key] = all_by_clearance.get(key, 0) + 1
        deviations = []
        for r in navs:
            key = bucket(r["clearance"], clearance_edges)
            nav_by_clearance[key] = nav_by_clearance.get(key, 0) + 1
            vox = np.floor((np.asarray(r["hit"][L]) - org) / sp + 1e-9).astype(np.int64) - clo
            vox = np.clip(vox, 0, np.array(sub.shape) - 1)
            nz = int(nearest[2][vox[0], vox[1], vox[2]]) + int(clo[2])
            deviations.append(abs(r["obs"][L] - nz))
        lv["b9"] = {
            "background_rays": len(bg_rays),
            "background_rays_by_exact_clearance_voxels": dict(sorted(all_by_clearance.items())),
            "navigations_where_mask_has_no_surface": len(navs),
            "navigations_by_exact_clearance_voxels": dict(sorted(nav_by_clearance.items())),
            "nav_slice_distance_to_nearest_mask_voxel_max": max(deviations) if deviations else None,
            "nav_slice_distance_histogram": {str(k): deviations.count(k) for k in sorted(set(deviations))},
        }

        # Acceleration check: brute force over ALL triangles for every out-of-bound ray, every
        # background navigation, and a random sample.
        check = {id(r): r for r in oob + navs}
        for ri in rng.choice(len(rays), size=min(args.check_rays, len(rays)), replace=False):
            check.setdefault(id(rays[int(ri)]), rays[int(ri)])
        mismatches = 0
        for r in check.values():
            full = slice_of_world(ray_mesh_first_hit(r["o"], r["d"], V, T), spacing, origin, shape)
            mismatches += int(full != r["obs"][L])
        accel_checks.append({"level": L, "rays_checked": len(check),
                             "of_which_out_of_bound_or_background_navigation": len(oob) + len(navs),
                             "mismatches_vs_all_triangles": mismatches})

        worst = sorted(oob, key=lambda r: (-(99 if r["err"][L] is None else r["err"][L]), r["id"]))
        lv["examples_outside_bound"] = [{
            "ray": r["id"], "origin_world": [round(float(x), 4) for x in r["o"]],
            "direction_world": [round(float(x), 6) for x in r["d"]],
            "expected_slice": r["slice_true"], "observed_slice": r["obs"][L],
            "error_slices": r["err"][L], "class": r["class"][L],
            "exact_max_edt_along_ray": round(r["depth"], 3),
            "incidence_deg": r["incidence_deg"]} for r in worst[:worst_cap]]
        lv["examples_outside_bound_total"] = len(worst)
        print(f"  level {L}: oob {len(oob)} {{{', '.join(f'{k}: {v['count']}' for k, v in classes.items())}}}, "
              f"bg nav {len(navs)}, accel mismatches {mismatches}/{len(check)}")

    # --- per-ray table, gitignored (derived from the real mask) ---------------------------
    table = os.path.join(mesh_out, "per_ray_table.csv")
    with open(table, "w", encoding="utf-8", newline="\n") as fh:
        wr = csv.writer(fh, lineterminator="\n")
        wr.writerow(["ray", "cohort", "slice_true", "incidence_deg"]
                    + [f"obs_L{lv['level']}" for lv in levels])
        for r in rays:
            wr.writerow([r["id"], r["cohort"], r.get("slice_true", ""), r.get("incidence_deg", "")]
                        + ["" if r["obs"][lv["level"]] is None else r["obs"][lv["level"]]
                           for lv in levels])

    # --- frontier and output ---------------------------------------------------------------
    frontier = []
    for lv in levels:
        g = lv["b5"]["by_group"]
        cl = lv["b5"]["out_of_bound_classes"]
        frontier.append({
            "level": lv["level"], "cluster_cell_voxels": lv["cluster_cell_voxels"],
            "vertices": lv["vertex_count"], "triangles": lv["triangle_count"],
            "generation_ms": lv["generation_ms"],
            "median_fps": "NOT MEASURED", "longest_stall_ms": "NOT MEASURED",
            "b5_max_error_interior": g["interior"]["max_error_slices"],
            "b5_no_hit_interior": g["interior"]["no_hit"],
            "b5_max_error_surface_tangent": g["surface_tangent"]["max_error_slices"],
            "b5_no_hit_surface_tangent": g["surface_tangent"]["no_hit"],
            "b5_verdict": lv["b5"]["verdict"],
            "out_of_bound": {k: v["count"] for k, v in cl.items()},
            "b9_navigations_where_mask_has_no_surface": lv["b9"]["navigations_where_mask_has_no_surface"],
        })
    for lv in levels:
        for k in ("_verts", "_tris", "_path"):
            lv.pop(k, None)

    cohorts = cohort_directions()
    payload = {
        "_status": ("OFFLINE, workstation. Computed by a Claude agent (A4) under the Day 22 "
                    "recovery override; Spike B owner Vu Hung Anh confirms or rejects on Day 23. "
                    "No frame rate, no device: median_fps / longest_stall_ms are NOT MEASURED."),
        "record": "spike_b_real_mesh_frontier",
        "schema_version": 2,
        "computed_at": started.isoformat(timespec="seconds"),
        "repository_commit": subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"],
                                            capture_output=True, text=True).stdout.strip(),
        "working_tree_clean_for_harness": subprocess.run(
            ["git", "-C", REPO, "diff", "--quiet", "HEAD", "--",
             "spikes/spike_b_3d/harness", "spikes/spike_b_3d/mesh/build_mesh.py"]).returncode == 0,
        "environment": _environment(),
        "workers": args.workers,
        "command": "python " + " ".join([rel(__file__)]
                                        + [a if " " not in a else f'"{a}"' for a in sys.argv[1:]]),
        "geometry_contract_version": CONTRACT_VERSION,
        "case": {
            "case_id": case_id,
            "selection_rule": ("lowest-numbered case in split training_subsets['25_percent']."
                               "effective_case_ids (a training case, never final_holdout)"),
            "split_manifest": {"path": rel(args.split_manifest),
                               "git_blob": subprocess.run(
                                   ["git", "-C", REPO, "hash-object", args.split_manifest],
                                   capture_output=True, text=True).stdout.strip(),
                               "sha256": hashlib.sha256(split_bytes).hexdigest(),
                               "bytes": len(split_bytes), **membership},
            "dataset_manifest": {"path": "data/manifests/dataset_manifest.json",
                                 "sha256": hashlib.sha256(dm_bytes).hexdigest()},
            "mask_path_relative": mask_rel,
            "mask_file_hash": ("not published (F5); kept in the gitignored sidecar "
                               "spikes/spike_b_3d/mesh/out_real/<case_id>/data_file_hashes.json"),
            "mask_read_ms": round(read_ms, 3),
            "shape_xyz": shape,
            "nrrd_axis_order": "x, y, z (pynrrd index_order F); slices along z (DR-008a)",
            "spacing_xyz": spacing, "origin_world": origin, "space": header.get("space"),
            "header_geometry_status": ("QA-002 F2: default spacing 1 / origin 0 - coordinates are "
                                       "voxel units through a default affine, NOT validated mm"),
            "foreground_voxels": int(len(fg)),
            "foreground_bbox_voxel": {"lo": lo.tolist(), "hi": hi.tolist()},
            "slices_with_foreground": int(len(np.unique(fg[:, 2]))),
        },
        "method": {
            "surface": "build_mesh.extract_surface - exact voxel faces (not marching cubes)",
            "decimation": "build_mesh.decimate - vertex clustering on a cell grid, mean representative",
            "surface_extraction_ms": round(extract_ms, 3),
            "ground_truth": ("exact_first_voxel - exact cell-by-cell walk over the VOXEL MASK, no "
                             "mesh; depth, clearance and the out-of-bound classes use the same walk"),
            "ground_truth_vs_march_mask": {**agree, "mask_rays": n_hit,
                                           "march_on_nearest_misses": {
                                               "rays": len(misses), "march_found_a_voxel": len(march_found)}},
            "observed": ("picking_error.ray_mesh_first_hit on the OBJ read back from disk, then "
                         "picking_error.slice_of_world (floor, reject out-of-range, never clamp)"),
            "bound_slices": SCQ06_BOUND,
            "bound_source": "SCQ-06, frozen before Spike B. Not widened here.",
            "within_bound_rule": ("picking_error._cohort_stats, unchanged: max error <= 1 AND "
                                  "no_hit == 0 (a mask hit with no mesh hit is the largest error)"),
            "b5_verdict_rule": ("WITHIN_BOUND iff every ray of every cohort is within_bound "
                                "(B5 bounds all real picks; B14 only asks that interior and "
                                "surface_tangent are reported separately)"),
            "out_of_bound_classes": ("no_hit / inflated (t_hit < first run) / local (on the first "
                                     "run) / cross_structure (beyond the first run) - module docstring"),
            "level_0_note": ("Level 0 passes by construction: its surface IS the mask boundary. A ray "
                             "that meets a +z voxel face from above lands on z = k+1, where floor "
                             "gives k+1 while the mask gives k - the error 1 of level 0."),
        },
        "ray_set": {
            "kind": "orthographic bundles, one per direction",
            "grid_pitch_voxels": args.grid_pitch,
            "grid_offsets_fraction_of_pitch": list(GRID_OFFSETS),
            "box": f"foreground bounding box + {BOX_MARGIN} voxels; rays start 1 voxel before it",
            "cohort_rule": ("contractual B14 labels by the angle between ray and SLICE PLANE, as "
                            "the canonical fixture defines them: interior = mostly along z; "
                            "surface_tangent = near-parallel to the slice plane; oblique = "
                            "diagnostic only, between the two"),
            "directions": {c: [{"label": lab, "direction": [round(float(x), 6) for x in d]}
                               for lab, d in dirs] for c, dirs in cohorts.items()},
            "rays_total": len(rays),
            "rays_meeting_mask": {c: sum(1 for r in hit_rays if r["cohort"] == c)
                                  for c in cohorts},
            "background_rays": len(bg_rays),
            "b6_offline_note": ("every direction is a camera orientation, so the set covers "
                                "'after rotate'; zoom does not change a world-space ray and is "
                                "covered on the device"),
        },
        "acceleration_checks": {"candidate_triangles_vs_all_triangles": accel_checks},
        "levels": levels,
        "frontier_b12": frontier,
        "not_measured_here": ["B10 median FPS", "B11 longest stall", "B6 on device",
                              "B7", "B9 on device", "B13 (needs FPS)", "B15 (owner's note)"],
        "per_ray_table": {"path": rel(table), "gitignored": True, "rows": len(rays),
                          "sha256": sha256_file(table)},
        "runtime_s": {"ground_truth": round(truth_s, 1),
                      "picking_per_level": {lv["level"]: lv["picking_s"] for lv in levels}},
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.evidence)), exist_ok=True)
    with open(args.evidence, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    with open(os.path.join(mesh_out, "mesh_levels_real.json"), "w", encoding="utf-8",
              newline="\n") as fh:
        json.dump({"case_id": case_id, "shape_xyz": shape, "spacing_xyz_mm": spacing,
                   "origin_world_mm": origin, "geometry_contract_version": CONTRACT_VERSION,
                   "levels": [{k: lv[k] for k in ("level", "cluster_cell_voxels", "vertex_count",
                                                  "triangle_count", "obj_file", "obj_sha256")}
                              for lv in levels]}, fh, indent=1)
        fh.write("\n")

    print()
    print(f"  {'lvl':>3} {'cell':>4} {'tris':>7} {'gen ms':>8}  {'max':>4} {'nohit':>5} {'local':>5} "
          f"{'cross':>5} {'infl':>4}  {'B5':<17} {'B9 nav':>6}")
    for f in frontier:
        ob = f["out_of_bound"]
        mx = max(x for x in (f["b5_max_error_interior"], f["b5_max_error_surface_tangent"]) if x is not None)
        print(f"  {f['level']:>3} {str(f['cluster_cell_voxels']):>4} {f['triangles']:>7} "
              f"{f['generation_ms']:>8.1f}  {mx:>4} {ob['no_hit']:>5} {ob['local']:>5} "
              f"{ob['cross_structure']:>5} {ob['inflated']:>4}  {f['b5_verdict']:<17} "
              f"{f['b9_navigations_where_mask_has_no_surface']:>6}")
    print(f"\n  wrote {rel(args.evidence)}")
    print(f"  meshes, per-ray table and the data-file hash sidecar in {mesh_out} (gitignored)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
