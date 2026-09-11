#!/usr/bin/env python3
"""
Picking-error harness — how far does decimation move the resolved slice?

THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Not production.

`SPIKE_B_3D/TASK.md` freezes the bounds before the spike runs, and this harness
measures against them rather than negotiating with them:

    | Canonical synthetic geometry fixtures | EXACT expected slice - zero tolerance |
    | Real decimated-mesh picking           | maximum error = +/-1 source slice     |

    "This threshold is fixed before Spike B. Spike B validates conformance; it
     does not derive or negotiate the value."
    "DO NOT loosen the tolerance merely to obtain a passing framework."

HOW GROUND TRUTH IS ESTABLISHED
-------------------------------
Level 0 is the undecimated voxel-face surface. Every point on it lies exactly
on a cell boundary, so the slice it resolves to is unambiguous. For a given
ray, the level-0 hit is the truth; the same ray against a decimated mesh gives
the observed value; the difference is the decimation-induced picking error.

This is the only honest way to attribute the error. Comparing a decimated hit
against an analytic sphere would fold the extraction method's own error into
the number and blame decimation for it.

INTERIOR VS SURFACE-TANGENT
---------------------------
Reported as separate groups because B14 requires it, and because the reason is
real: a ray nearly parallel to the slice plane converts a small positional
error into a large error along z. `TECHNICAL_SPIKES_REQUIRED.md` puts it
plainly - a good interior-point result must not be able to mask a tangent-point
failure.

CAMERA ROTATION - criterion B6
------------------------------
B6 asks whether B4 and B5 still hold after the camera rotates and zooms.
Rotating the camera about the volume is equivalent to rotating the ray set, so
the harness re-runs every ray at several orientations and reports the worst
case. Zoom does not change which triangle a ray hits, so it is not simulated -
and that reasoning is stated rather than silently omitted.
"""

from __future__ import annotations

import argparse
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_FIXTURE = os.path.join(ROOT, "fixtures_proposal", "geometry_fixture_v0.json")
DEFAULT_MESH = os.path.join(ROOT, "mesh", "out", "mesh_levels.json")

EPS = 1e-9
SCQ06_BOUND = 1          # +/-1 source slice, frozen. Never widened here.


def load_obj(path: str):
    verts, tris = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(v) for v in line.split()[1:4]])
            elif line.startswith("f "):
                tris.append([int(p.split("/")[0]) - 1 for p in line.split()[1:4]])
    return np.asarray(verts, dtype=np.float64), np.asarray(tris, dtype=np.int64)


def ray_mesh_first_hit(origin, direction, verts, tris):
    """Moller-Trumbore, vectorised over every triangle. Returns the nearest hit point.

    Back faces are accepted. A viewer picks what the user sees, and rejecting
    back faces here would silently drop the concave cases that are exactly where
    picking goes wrong.
    """
    o = np.asarray(origin, dtype=np.float64)
    d = np.asarray(direction, dtype=np.float64)
    d = d / np.linalg.norm(d)

    v0 = verts[tris[:, 0]]
    e1 = verts[tris[:, 1]] - v0
    e2 = verts[tris[:, 2]] - v0

    pvec = np.cross(d, e2)
    det = np.einsum("ij,ij->i", e1, pvec)
    parallel = np.abs(det) < EPS
    inv_det = np.where(parallel, 0.0, 1.0 / np.where(parallel, 1.0, det))

    tvec = o - v0
    u = np.einsum("ij,ij->i", tvec, pvec) * inv_det
    qvec = np.cross(tvec, e1)
    v = np.einsum("j,ij->i", d, qvec) * inv_det
    t = np.einsum("ij,ij->i", e2, qvec) * inv_det

    ok = (~parallel) & (u >= -EPS) & (v >= -EPS) & (u + v <= 1.0 + EPS) & (t > EPS)
    if not ok.any():
        return None
    t_hit = np.where(ok, t, np.inf)
    return o + d * float(t_hit.min())


def slice_of_world(point, spacing, origin, shape):
    """World point -> slice index, or None outside the volume. floor, never clamp."""
    if point is None:
        return None
    idx = [math.floor((point[i] - origin[i]) / spacing[i] + 1e-9) for i in range(3)]
    for i in range(3):
        if idx[i] < 0 or idx[i] > shape[i] - 1:
            return None
    return idx[2]


def rotation(axis: str, deg: float) -> np.ndarray:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)
    if axis == "y":
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float64)


def run(fixture_path: str, mesh_path: str, out_path: str | None) -> dict:
    with open(fixture_path, encoding="utf-8") as f:
        fixture = json.load(f)
    with open(mesh_path, encoding="utf-8") as f:
        meshes = json.load(f)

    shape = fixture["shape_xyz"]
    spacing = fixture["spacing_xyz_mm"]
    origin = fixture["origin_world_mm"]
    rays = fixture["picking_rays"]

    centre = np.array([origin[i] + shape[i] * spacing[i] / 2.0 for i in range(3)])

    levels = {}
    for lv in meshes["levels"]:
        v, t = load_obj(os.path.join(ROOT, lv["obj"]))
        levels[lv["level"]] = {"meta": lv, "verts": v, "tris": t}

    base = levels[0]
    # Camera orientations for B6. Identity first so the unrotated case is
    # reported on its own before the worst case across orientations.
    orientations = [("identity", np.eye(3))]
    for axis, deg in [("y", 30), ("y", -45), ("x", 25), ("x", -35), ("z", 40)]:
        orientations.append((f"rot_{axis}{deg:+d}", rotation(axis, deg)))

    per_level = []
    for level, data in sorted(levels.items()):
        groups: dict[str, list[dict]] = {}
        misses = 0
        for name, R in orientations:
            for ray in rays:
                o = R @ (np.asarray(ray["origin_world"]) - centre) + centre
                d = R @ np.asarray(ray["direction_world"])

                truth_pt = ray_mesh_first_hit(o, d, base["verts"], base["tris"])
                truth = slice_of_world(truth_pt, spacing, origin, shape)
                if truth is None:
                    continue          # this ray misses the volume; not a picking failure

                hit_pt = ray_mesh_first_hit(o, d, data["verts"], data["tris"])
                obs = slice_of_world(hit_pt, spacing, origin, shape)
                if obs is None:
                    misses += 1
                    groups.setdefault(ray["group"], []).append({
                        "ray": ray["id"], "orientation": name,
                        "expected_slice": truth, "observed_slice": None,
                        "error_slices": None,
                        "note": "decimated mesh produced no hit where level 0 did",
                    })
                    continue

                groups.setdefault(ray["group"], []).append({
                    "ray": ray["id"], "orientation": name,
                    "expected_slice": truth, "observed_slice": obs,
                    "error_slices": abs(obs - truth),
                })

        group_stats = {}
        for g, samples in groups.items():
            errs = [s["error_slices"] for s in samples if s["error_slices"] is not None]
            group_stats[g] = {
                "samples": len(samples),
                "no_hit": sum(1 for s in samples if s["error_slices"] is None),
                "max_error_slices": max(errs) if errs else None,
                "mean_error_slices": round(sum(errs) / len(errs), 4) if errs else None,
                "within_bound": (max(errs) <= SCQ06_BOUND) if errs else None,
                "error_histogram": {str(e): errs.count(e) for e in sorted(set(errs))},
            }

        per_level.append({
            "level": level,
            "cluster_cell_voxels": data["meta"]["cluster_cell_voxels"],
            "triangle_count": data["meta"]["triangle_count"],
            "reduction_vs_level_0": data["meta"]["reduction_vs_level_0"],
            "no_hit_total": misses,
            "by_group": group_stats,
            "samples": [s for g in groups.values() for s in g],
        })

    report = {
        "_status": "DIAGNOSTIC - synthetic mesh, desktop run. NOT acceptance evidence.",
        "_why": ("Criteria B5, B10 and B11 require the physical Galaxy A17 5G and are "
                 "executed by Vu Hung Anh (SPIKE_B_3D/TASK.md). This harness measures the "
                 "decimation-induced picking error on a synthetic mesh so the frontier has "
                 "a shape before the device run."),
        "bound_slices": SCQ06_BOUND,
        "bound_source": "SCQ-06, frozen before Spike B. Not negotiable by this harness.",
        "ground_truth": "level 0 undecimated voxel-face surface; every point on a cell boundary",
        "orientations_tested": [n for n, _ in orientations],
        "camera_zoom_note": ("Zoom does not change which triangle a ray intersects, so it is "
                             "not simulated. Rotation is, because it does."),
        "levels": per_level,
    }
    if out_path:
        with open(out_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(report, f, indent=1, ensure_ascii=False)
            f.write("\n")
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", default=DEFAULT_FIXTURE)
    ap.add_argument("--mesh", default=DEFAULT_MESH)
    ap.add_argument("--out", default=os.path.join(ROOT, "mesh", "out", "picking_error.json"))
    args = ap.parse_args()

    if not os.path.exists(args.mesh):
        print(f"mesh summary not found: {args.mesh}\nRun mesh/build_mesh.py first.")
        return 2

    rep = run(args.fixture, args.mesh, args.out)

    print()
    print(f"  bound: max {rep['bound_slices']} source slice (SCQ-06, frozen)")
    print(f"  orientations: {', '.join(rep['orientations_tested'])}   <- criterion B6")
    print()
    header = f"  {'level':>5} {'cell':>5} {'tris':>7} {'group':<16} {'n':>4} {'max err':>8} {'mean':>7}  verdict"
    print(header)
    print("  " + "-" * (len(header) - 2))

    breaches = []
    for lv in rep["levels"]:
        for g in sorted(lv["by_group"]):
            st = lv["by_group"][g]
            ok = st["within_bound"]
            verdict = "within bound" if ok else "EXCEEDS BOUND"
            if ok is False:
                breaches.append((lv["level"], g, st["max_error_slices"]))
            print(f"  {lv['level']:>5} {str(lv['cluster_cell_voxels']):>5} "
                  f"{lv['triangle_count']:>7} {g:<16} {st['samples']:>4} "
                  f"{str(st['max_error_slices']):>8} {str(st['mean_error_slices']):>7}  {verdict}")
        if lv["no_hit_total"]:
            print(f"  {'':>5} {'':>5} {'':>7} {'(no hit)':<16} {lv['no_hit_total']:>4}"
                  f"   decimated mesh lost a surface the level-0 mesh had")

    print()
    # B13: the largest reduction that still respects the bound, on this synthetic mesh.
    usable = [lv for lv in rep["levels"]
              if all(s["within_bound"] for s in lv["by_group"].values()
                     if s["within_bound"] is not None)]
    if usable:
        best = max(usable, key=lambda lv: lv["reduction_vs_level_0"])
        print(f"  Largest reduction still within +/-{SCQ06_BOUND} slice on THIS synthetic mesh:")
        print(f"    level {best['level']}, cell {best['cluster_cell_voxels']}, "
              f"{best['triangle_count']} triangles, "
              f"{best['reduction_vs_level_0'] * 100:.1f}% fewer than level 0")
    if breaches:
        print(f"  Bound exceeded at: " +
              "; ".join(f"level {l} / {g} / max {e} slices" for l, g, e in breaches))
        print("  That is a result. The bound is frozen (SCQ-06) and is not widened to pass.")

    print()
    print("  DIAGNOSTIC ONLY - synthetic mesh, desktop, no frame rate, no device.")
    print("  B13 needs the real mesh AND the on-device FPS from Vu Hung Anh before a")
    print("  decimation budget can be recommended. A reduction that picks accurately but")
    print("  renders at 12 FPS fails B10.")
    print(f"  wrote  {os.path.relpath(args.out, ROOT)}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
