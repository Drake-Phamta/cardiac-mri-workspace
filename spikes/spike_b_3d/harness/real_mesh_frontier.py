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
- harness/picking_error.py: march_mask (ground truth = ray-march over the VOXEL MASK,
  touching no mesh — the 2026-09-12 tautology fix), ray_mesh_first_hit (Moller-Trumbore),
  slice_of_world (floor, never clamp), load_obj, and its cohort rule: a ray that hits
  the mask but not the mesh is a NO-HIT, which is the largest possible picking error and
  makes the cohort NOT within bound.

The new machinery is (1) a real-mask loader, (2) a deterministic ray set sized for a
real anatomy instead of the 13 fixture rays, (3) an EXACT grid traversal of the mask as
ground truth (below), and (4) two speed-ups that do not change any result: a
conservative pre-filter before march_mask, and per-ray candidate triangles for
ray_mesh_first_hit. Both speed-ups are checked against the unaccelerated path on every
run (`acceleration_checks` in the output) — a speed-up that changed one answer would be a
defect, not an optimisation.

WHY THE GROUND TRUTH IS AN EXACT TRAVERSAL, NOT march_mask (found on this run)
------------------------------------------------------------------------------
The first run scored the exact level-0 surface (every triangle IS a voxel face) at up to
13 slices of error and 41 "navigations where the mask has no surface". A voxel-face surface
cannot do that. Every one of those rays met the mesh EARLIER along the ray than march_mask
reported its first voxel: march_mask samples the ray every 0.25 voxel and so skips a voxel
the ray crosses for less than that (a corner clip on thin anatomy - the synthetic blob never
had one). The truth is now `exact_first_voxel`, a cell-by-cell traversal in the style of
conformance.py's reference slice_of_ray. Still mask-only, still no mesh - the 2026-09-12
principle is unchanged - and the march_mask scores are kept next to it
(`scored_against_march_mask_step_0p25`, `ground_truth_vs_march_mask`) so the change is
visible rather than silent.

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
ray meets and is therefore not simulated offline (the device run tonight covers it).

B9 OFFLINE
----------
Rays whose mask ray-march finds nothing are background rays. For each level the harness
counts how many of them the decimated mesh would still resolve to a slice (a navigation
where the mask has no surface along the ray), bucketed by how far the ray passes from the
mask, and for those the slice distance to the nearest foreground voxel. It does not decide
which of those count as "misleading": it reports them all.
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

DEFAULT_DATA_ROOT = os.environ.get("CARDIAC_DATA_ROOT",
                                   r"D:\02_Research\cardiac-data\lasc2018\extracted")
DEFAULT_DATASET_MANIFEST = os.path.join(REPO, "data", "manifests", "dataset_manifest.json")
DEFAULT_SPLIT_MANIFEST = os.path.join(REPO, "data", "manifests", "split_manifest_path_a_seed2024.json")
DEFAULT_MESH_OUT = os.path.join(ROOT, "mesh", "out_real")          # gitignored
DEFAULT_EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW", "20261001_real_mesh",
                                "real_mesh_frontier.json")
CONTRACT_VERSION = "dr008a-dr012/v1.0.0"

# Memory guard (2026-10-01): the first default, cpu_count() - 2 = 18 workers on the shared
# workstation, each with its own copy of the 640x640x88 mask and its dilation, exhausted RAM
# during a QA run and killed a GPU training job. Four workers keep the pool near 0.5 GB and
# the run at a few minutes; --workers overrides it.
DEFAULT_WORKERS = min(4, os.cpu_count() or 1)
GRID_OFFSETS = (0.37, 0.61)       # fractions of one grid pitch; keep rays off voxel edges
BOX_MARGIN = 2                    # voxels around the foreground bounding box
EDT_MARGIN = 12                   # voxels of context for clearance / depth measurements
PREFILTER_STEP = 0.5              # voxels; see _prefilter for why this is conservative


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


# --- ground truth (picking_error.march_mask), with a conservative pre-filter -----------

_W: dict = {}


def _init_worker(mask, dilated, spacing, origin):
    _W["mask"], _W["dilated"] = mask, dilated
    _W["spacing"], _W["origin"] = spacing, origin


def _prefilter(o, d, length):
    """True if the ray MIGHT meet the mask; False only when march_mask cannot.

    A march_mask sample q (step 0.25) lies within 0.25 voxel of a sample p of this
    0.5-step walk, so floor(q + 1e-9) is within one voxel of floor(p) on every axis. If
    no p lands in the mask dilated by one voxel (3x3x3), no q can land in the mask.
    """
    mask_d, sp, org = _W["dilated"], np.asarray(_W["spacing"]), np.asarray(_W["origin"])
    ts = np.arange(0.0, length + PREFILTER_STEP, PREFILTER_STEP)
    pts = (o[None, :] + ts[:, None] * d[None, :] - org) / sp
    idx = np.floor(pts).astype(np.int64)
    shape = np.array(mask_d.shape)
    ok = np.all((idx >= 0) & (idx < shape), axis=1)
    idx = idx[ok]
    return bool(idx.size and mask_d[idx[:, 0], idx[:, 1], idx[:, 2]].any())


def exact_first_voxel(o_w, d_w, mask, spacing, origin, box_lo, box_hi):
    """First occupied voxel the ray ENTERS, by exact grid traversal (Amanatides-Woo).

    Same contract as march_mask - (slice_index, entry_axis, abs_cos_incidence) or None -
    but it visits every voxel the ray passes through instead of sampling every 0.25 voxel.
    The sampling skips a voxel the ray crosses for less than 0.25 voxel (a corner clip);
    on the exact level-0 surface that showed up as level-0 "errors" of up to 13 slices,
    which a voxel-face surface cannot produce. conformance.py's reference slice_of_ray
    walks the grid the same way: start an infinitesimal step inside, step tied
    boundaries together so a ray through an edge never inspects cells it never enters.

    box_lo / box_hi (voxel indices, inclusive / exclusive) bound the search; nothing
    outside the foreground bounding box can be occupied, so clipping to it is exact.
    """
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
    entry_axis = in_axis
    while all(box_lo[a] <= cell[a] < box_hi[a] for a in range(3)) and t <= t_out + 1e-9:
        if mask[cell[0], cell[1], cell[2]]:
            return cell[2], entry_axis, abs(float(d_w[entry_axis]))
        nxt = min(t_max)
        for a in range(3):
            if abs(t_max[a] - nxt) <= 1e-12:
                cell[a] += step[a]
                t_max[a] += t_delta[a]
                entry_axis = a
        t = nxt
    return None


def _truth_job(args):
    ray_index, o, d, length, box_lo, box_hi = args
    exact = exact_first_voxel(o, d, _W["mask"], _W["spacing"], _W["origin"], box_lo, box_hi)
    if not _prefilter(o, d, length):
        return ray_index, exact, None, False
    g = march_mask(o, d, _W["mask"], _W["spacing"], _W["origin"])
    return ray_index, exact, g, True


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
        "mean_slices_per_mm": round(sum(r["slices_per_mm"] for r in rows) / len(rows), 4) if rows else None,
        # picking_error._cohort_stats rule, unchanged: no-hit is the largest error.
        "within_bound": bool(errs) and max(errs) <= SCQ06_BOUND and no_hit == 0,
        "within_bound_ignoring_no_hit": bool(errs) and max(errs) <= SCQ06_BOUND,
    }


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


def bucket(v, edges):
    for lo, hi in zip(edges[:-1], edges[1:]):
        if lo < v <= hi:
            return f"({lo},{hi}]"
    return f">{edges[-1]}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--case-id", help="default: lowest-numbered effective 25%% training case")
    ap.add_argument("--split-manifest", default=DEFAULT_SPLIT_MANIFEST,
                    help="Path A split manifest (PR #35, on main since f5aa763)")
    ap.add_argument("--dataset-manifest", default=DEFAULT_DATASET_MANIFEST)
    ap.add_argument("--data-root", default=DEFAULT_DATA_ROOT)
    ap.add_argument("--cells", default="1,1.25,2,4,8",
                    help="lossless, near-lossless (max vertex move < 1 voxel), then aggressive")
    ap.add_argument("--grid-pitch", type=float, default=3.0)
    ap.add_argument("--mesh-out", help="default: mesh/out_real/<case_id> (gitignored)")
    ap.add_argument("--evidence", default=DEFAULT_EVIDENCE)
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                    help=f"ground-truth worker processes (default min(4, cpu_count) = {DEFAULT_WORKERS}). "
                         "Each worker holds its own copy of the full mask and its dilation "
                         "(~130 MB with the interpreter), so the pool costs ~0.13 GB per worker. "
                         "Raise it only on an idle machine; the shared PC trains models.")
    ap.add_argument("--check-rays", type=int, default=300,
                    help="rays per level re-run without acceleration as an equivalence check")
    args = ap.parse_args()

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
        for di, (label, d) in enumerate(dirs):
            bundle, frame = ray_bundle(d, box_lo_w, box_hi_w, args.grid_pitch)
            b_index = len(bundles)
            bundles.append({"cohort": cohort, "label": label, "d": d, "frame": frame,
                            "ray_indices": []})
            for k, j, o in bundle:
                bundles[b_index]["ray_indices"].append(len(rays))
                rays.append({"id": f"{cohort}/{label}/{k}/{j}", "cohort": cohort,
                             "bundle": b_index, "k": k, "j": j, "o": o, "d": d})
    print(f"ray set: {len(rays)} rays in {len(bundles)} bundles")

    # --- ground truth -----------------------------------------------------------------
    from scipy import ndimage

    dilated = ndimage.binary_dilation(mask > 0, structure=np.ones((3, 3, 3), bool)).astype(np.uint8)
    t = time.perf_counter()
    search_lo = [int(x) for x in (lo - 1)]
    search_hi = [int(x) for x in (hi + 2)]
    jobs = [(i, r["o"], r["d"], bundles[r["bundle"]]["frame"]["length"], search_lo, search_hi)
            for i, r in enumerate(rays)]
    prefilter_positive = 0
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker,
                             initargs=(mask, dilated, spacing, origin)) as pool:
        for i, exact, g, marched in pool.map(_truth_job, jobs, chunksize=64):
            rays[i]["truth"] = exact
            rays[i]["march"] = g
            rays[i]["marched"] = marched
            prefilter_positive += int(marched)
    truth_s = time.perf_counter() - t
    n_hit = sum(1 for r in rays if r["truth"] is not None)
    print(f"ground truth: {n_hit} rays meet the mask, {len(rays) - n_hit} background "
          f"({prefilter_positive} also marched) in {truth_s:.1f} s")

    # How the exact traversal and picking_error.march_mask disagree, ray by ray.
    agree = {"same_slice": 0, "different_slice": 0, "exact_hit_march_none": 0,
             "march_hit_exact_none": 0, "both_none": 0}
    march_deeper = 0
    for r in rays:
        e, g = r["truth"], r["march"]
        if e is None and g is None:
            agree["both_none"] += 1
        elif e is None:
            agree["march_hit_exact_none"] += 1
        elif g is None:
            agree["exact_hit_march_none"] += 1
        elif e[0] == g[0]:
            agree["same_slice"] += 1
        else:
            agree["different_slice"] += 1
            march_deeper += 1
    print(f"exact vs march_mask: {agree}")

    # Pre-filter equivalence check: march a sample of pre-filtered-out rays anyway.
    rng = np.random.default_rng(20261001)
    skipped = [i for i, r in enumerate(rays) if not r["marched"]]
    sample = sorted(rng.choice(len(skipped), size=min(args.check_rays, len(skipped)),
                               replace=False).tolist()) if skipped else []
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker,
                             initargs=(mask, dilated, spacing, origin)) as pool:
        pre_check = list(pool.map(_march_only_job,
                                  [(skipped[s], rays[skipped[s]]["o"], rays[skipped[s]]["d"])
                                   for s in sample], chunksize=8))
    prefilter_disagreements = [rays[i]["id"] for i, g in pre_check if g is not None]

    # Distance fields for B9 clearance and no-hit depth (diagnostic context only).
    clo = np.maximum(lo - EDT_MARGIN, 0)
    chi = np.minimum(hi + 1 + EDT_MARGIN, np.array(shape))
    sub = mask[clo[0]:chi[0], clo[1]:chi[1], clo[2]:chi[2]] > 0
    outside_dist, nearest = ndimage.distance_transform_edt(~sub, return_indices=True)
    inside_dist = ndimage.distance_transform_edt(sub)

    def field_along(r, field, default):
        ts = np.arange(0.0, bundles[r["bundle"]]["frame"]["length"] + 0.25, 0.25)
        pts = (r["o"][None, :] + ts[:, None] * r["d"][None, :] - org) / sp
        idx = np.floor(pts).astype(np.int64) - clo
        ok = np.all((idx >= 0) & (idx < (chi - clo)), axis=1)
        idx = idx[ok]
        return idx, (field[idx[:, 0], idx[:, 1], idx[:, 2]] if idx.size else np.array([default]))

    for r in rays:
        if r["truth"] is None:
            _idx, vals = field_along(r, outside_dist, EDT_MARGIN)
            r["clearance"] = float(vals.min()) if vals.size else float(EDT_MARGIN)
        else:
            sl, axis, cos_inc = r["truth"]
            r["slice_true"] = sl
            r["incidence_deg"] = round(math.degrees(math.acos(min(1.0, cos_inc))), 1)
            r["incidence_class"] = "steep" if cos_inc >= GRAZING_COS else "grazing"
            r["slices_per_mm"] = round(abs(r["d"][2]) / spacing[2], 4)
            _idx, vals = field_along(r, inside_dist, 0.0)
            r["depth"] = float(vals.max()) if vals.size else 0.0
        r["err"], r["obs"], r["nav"], r["hit"] = {}, {}, {}, {}

    # --- per level: mesh hits ------------------------------------------------------------
    accel_checks = []
    for lv in levels:
        t = time.perf_counter()
        V, T = lv["_verts"], lv["_tris"]
        for b in bundles:
            cands = candidate_lists(V, T, b["frame"])
            for ri in b["ray_indices"]:
                r = rays[ri]
                c = cands.get((r["k"], r["j"]))
                hit = ray_mesh_first_hit(r["o"], r["d"], V, T[c]) if c else None
                obs = slice_of_world(hit, spacing, origin, shape)
                L = lv["level"]
                r["obs"][L] = obs
                r["hit"][L] = None if hit is None else hit
                if r["truth"] is not None:
                    r["err"][L] = None if obs is None else abs(obs - r["slice_true"])
                else:
                    r["nav"][L] = obs is not None
        lv["picking_s"] = round(time.perf_counter() - t, 2)
        # Equivalence: brute-force ray_mesh_first_hit over ALL triangles for a sample.
        picks = rng.choice(len(rays), size=min(args.check_rays, len(rays)), replace=False)
        mismatches = 0
        for ri in picks:
            r = rays[int(ri)]
            full = slice_of_world(ray_mesh_first_hit(r["o"], r["d"], V, T), spacing, origin, shape)
            if full != r["obs"][lv["level"]]:
                mismatches += 1
        accel_checks.append({"level": lv["level"], "rays_checked": int(len(picks)),
                             "mismatches_vs_all_triangles": mismatches})
        print(f"  level {lv['level']}: picking {lv['picking_s']} s, accel mismatches {mismatches}")

    # --- statistics ------------------------------------------------------------------------
    hit_rays = [r for r in rays if r["truth"] is not None]
    bg_rays = [r for r in rays if r["truth"] is None]
    clearance_edges = [0, 1, 2, 4, 8]
    worst_cap = 15
    for lv in levels:
        L = lv["level"]
        by_group = {}
        for cohort in ("interior", "surface_tangent", "oblique"):
            by_group[cohort] = cohort_stats([r for r in hit_rays if r["cohort"] == cohort], L)
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
        # Continuity: the same observations scored against picking_error.march_mask.
        march_rows = [r for r in rays if r["march"] is not None]
        m_errs = [abs(r["obs"][L] - r["march"][0]) for r in march_rows if r["obs"][L] is not None]
        m_nohit = sum(1 for r in march_rows if r["obs"][L] is None)
        lv["b5"]["scored_against_march_mask_step_0p25"] = {
            "samples": len(march_rows), "no_hit": m_nohit,
            "max_error_slices": max(m_errs) if m_errs else None,
            "within_bound": bool(m_errs) and max(m_errs) <= SCQ06_BOUND and m_nohit == 0,
            "error_histogram": {str(e): m_errs.count(e) for e in sorted(set(m_errs))},
            "note": "reference only - march_mask skips voxels crossed for < 0.25 voxel",
        }
        nohits = [r for r in hit_rays if r["err"][L] is None]
        depth_hist: dict[str, int] = {}
        for r in nohits:
            key = bucket(r["depth"], [0, 1, 2, 4])
            depth_hist[key] = depth_hist.get(key, 0) + 1
        lv["b5"]["no_hit_max_inside_depth_voxels"] = dict(sorted(depth_hist.items()))

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
            hp = r["hit"][L]
            vox = np.floor((np.asarray(hp) - org) / sp + 1e-9).astype(np.int64) - clo
            vox = np.clip(vox, 0, np.array(sub.shape) - 1)
            nz = int(nearest[2][vox[0], vox[1], vox[2]]) + int(clo[2])
            deviations.append(abs(r["obs"][L] - nz))
        lv["b9"] = {
            "background_rays": len(bg_rays),
            "background_rays_by_clearance_voxels": dict(sorted(all_by_clearance.items())),
            "navigations_where_mask_has_no_surface": len(navs),
            "navigations_by_clearance_voxels": dict(sorted(nav_by_clearance.items())),
            "nav_slice_distance_to_nearest_mask_voxel_max": max(deviations) if deviations else None,
            "nav_slice_distance_histogram": {str(k): deviations.count(k)
                                             for k in sorted(set(deviations))},
        }
        worst = sorted([r for r in hit_rays if r["err"][L] is None or r["err"][L] > SCQ06_BOUND],
                       key=lambda r: (-(99 if r["err"][L] is None else r["err"][L]), r["id"]))
        lv["examples_outside_bound"] = [{
            "ray": r["id"], "origin_world": [round(float(x), 4) for x in r["o"]],
            "direction_world": [round(float(x), 6) for x in r["d"]],
            "expected_slice": r["slice_true"], "observed_slice": r["obs"][L],
            "error_slices": r["err"][L], "inside_depth_voxels": round(r["depth"], 3),
            "incidence_deg": r["incidence_deg"]} for r in worst[:worst_cap]]
        lv["examples_outside_bound_total"] = len(worst)

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
        "schema_version": 1,
        "computed_at": started.isoformat(timespec="seconds"),
        "repository_commit": subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"],
                                            capture_output=True, text=True).stdout.strip(),
        "working_tree_clean_for_harness": subprocess.run(
            ["git", "-C", REPO, "diff", "--quiet", "HEAD", "--",
             "spikes/spike_b_3d/harness", "spikes/spike_b_3d/mesh/build_mesh.py"]).returncode == 0,
        "environment": _environment(),
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
            "mask_file_sha256": sha256_file(mask_path),
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
            "ground_truth": ("exact_first_voxel - exact grid traversal over the VOXEL MASK, no mesh "
                             "(the picking_error.py principle; march_mask's 0.25-voxel sampling "
                             "is kept as a reference column because it skips corner clips)"),
            "ground_truth_vs_march_mask": {**agree, "rays": len(rays)},
            "observed": ("picking_error.ray_mesh_first_hit on the OBJ read back from disk, then "
                         "picking_error.slice_of_world (floor, reject out-of-range, never clamp)"),
            "bound_slices": SCQ06_BOUND,
            "bound_source": "SCQ-06, frozen before Spike B. Not widened here.",
            "within_bound_rule": ("picking_error._cohort_stats, unchanged: max error <= 1 AND "
                                  "no_hit == 0 (a mask hit with no mesh hit is the largest error)"),
            "b5_verdict_rule": ("WITHIN_BOUND iff every ray of every cohort is within_bound "
                                "(B5 bounds all real picks; B14 only asks that interior and "
                                "surface_tangent are reported separately)"),
            "level_0_note": ("A ray that meets a +z voxel face from above lands exactly on z = k+1; "
                             "floor gives k+1 while the mask gives k. Level 0 can therefore show "
                             "error 1 - the cost of the voxel-face surface, measured, not a defect "
                             "of the harness (spikes/spike_b_3d/README.md)."),
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
                                "covered on the device tonight"),
        },
        "acceleration_checks": {
            "prefilter_rays_marched_anyway": len(sample),
            "prefilter_disagreements": prefilter_disagreements,
            "candidate_triangles_vs_all_triangles": accel_checks,
        },
        "levels": levels,
        "frontier_b12": frontier,
        "not_measured_here": ["B10 median FPS", "B11 longest stall", "B6 on device",
                              "B7", "B9 on device", "B13 (needs FPS)", "B15 (owner's note)"],
        "per_ray_table": {"path": rel(table),
                          "gitignored": True, "rows": len(rays), "sha256": sha256_file(table)},
        "runtime_s": {"ground_truth": round(truth_s, 1),
                      "picking_per_level": {lv["level"]: lv["picking_s"] for lv in levels}},
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.evidence)), exist_ok=True)
    with open(args.evidence, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    # mesh index for the device build (gitignored, next to the meshes)
    with open(os.path.join(mesh_out, "mesh_levels_real.json"), "w", encoding="utf-8",
              newline="\n") as fh:
        json.dump({"case_id": case_id, "shape_xyz": shape, "spacing_xyz_mm": spacing,
                   "origin_world_mm": origin, "geometry_contract_version": CONTRACT_VERSION,
                   "levels": [{k: lv[k] for k in ("level", "cluster_cell_voxels", "vertex_count",
                                                  "triangle_count", "obj_file", "obj_sha256")}
                              for lv in levels]}, fh, indent=1)
        fh.write("\n")

    print()
    print(f"  {'lvl':>3} {'cell':>4} {'tris':>7} {'gen ms':>8}  "
          f"{'int max':>7} {'int nohit':>9} {'tan max':>7} {'tan nohit':>9}  {'B5':<17} {'B9 nav':>6}")
    for f in frontier:
        print(f"  {f['level']:>3} {str(f['cluster_cell_voxels']):>4} {f['triangles']:>7} "
              f"{f['generation_ms']:>8.1f}  {str(f['b5_max_error_interior']):>7} "
              f"{f['b5_no_hit_interior']:>9} {str(f['b5_max_error_surface_tangent']):>7} "
              f"{f['b5_no_hit_surface_tangent']:>9}  {f['b5_verdict']:<17} "
              f"{f['b9_navigations_where_mask_has_no_surface']:>6}")
    print(f"\n  wrote {rel(args.evidence)}")
    print(f"  meshes + per-ray table in {mesh_out} (gitignored)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
