#!/usr/bin/env python3
"""
Picking-error harness — how far does decimation move the resolved slice?

THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Not production.

`SPIKE_B_3D/TASK.md` freezes the bounds before the spike runs, and this harness
measures against them rather than negotiating with them:

    | Canonical synthetic geometry fixtures | EXACT expected slice - zero tolerance |
    | Real decimated-mesh picking           | maximum error = +/-1 source slice     |

    "DO NOT loosen the tolerance merely to obtain a passing framework."

=============================================================================
REWRITTEN 2026-09-12 after an independent review. The first version was wrong
in two ways that both produced numbers looking like results.
=============================================================================

1. THE LEVEL-0 SELF-CHECK WAS A TAUTOLOGY.
   Ground truth was "cast the ray at the level-0 mesh", and level 0 was then
   compared against itself. Its error was a floating-point identity, not a
   check. The reviewer translated the level-0 mesh by 5 slices and it still
   reported 0 error - which is exactly what a tautology does.

   FIXED: ground truth is now a DDA ray-march over the VOXEL MASK. It touches
   no mesh at all, so level 0's error is a real measurement of what voxel-face
   extraction costs, and every decimation level is measured against the data
   rather than against another approximation of it.

2. THE RAY GROUPS DID NOT MEAN WHAT THEIR NAMES SAID.
   Rays were labelled interior / surface_tangent in the fixture by their
   direction relative to the SLICE PLANE. The reviewer measured the actual
   geometry: every "surface_tangent" ray struck the surface 11-17 degrees off
   the NORMAL - nearly head-on, the opposite of tangent - and was 20x LESS
   sensitive in the slice axis. With a 20x sensitivity ratio the "interior"
   group could not not lose, so the ~7x difference reported as a finding was
   arithmetic, not geometry. B14 was not being measured.

   FIXED: the incidence at the hit is computed from the angle between the ray
   and the true surface normal, and the per-ray slice-axis sensitivity is
   reported alongside so the reader can see whether a group difference is
   geometry or just leverage.

3. AMENDED 2026-09-13 - THE COHORTS ARE THE GEOMETRY OWNER'S CALL, NOT OURS.
   The 2026-09-12 rewrite went further than the fix above: it grouped results
   by steep/grazing and dropped the fixture labels. Vu Hung Anh owns the
   geometry contract (DR-013) and his canonical fixture, published at
   tests/fixtures/geometry/, states it in `b14_grouping`:

       "picking_rays.group labels are interior and surface_tangent; report
        these two cohorts separately"
       "steep/grazing may be reported from incidence angle as an additional
        diagnostic, never as a replacement for the contractual labels"

   So `by_group` is keyed by the contractual label again, and steep/grazing
   lives in its own `by_incidence_diagnostic` block. The incidence and
   slices-per-mm columns stay, because they are what tells a reader whether a
   cohort difference is geometry or leverage.

WHY THE NORMAL, NOT THE SLICE PLANE
    What moves the resolved slice is displacement of the hit ALONG THE RAY
    projected onto z. A ray arriving along the surface normal converts a
    surface displacement directly into z error. A ray grazing the surface
    slides a long way across it for a small normal displacement - dangerous for
    WHERE on the surface you land, but not for WHICH SLICE, unless the surface
    normal also has a z component. Those are different failure modes and B14
    wants them separated, so this reports both the incidence angle and the
    measured z-sensitivity.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "mesh"))

REPO = os.path.dirname(os.path.dirname(ROOT))
# The canonical fixture belongs to Vu Hung Anh (DR-013). fixtures_proposal/ is
# the superseded draft it was accepted from.
DEFAULT_FIXTURE = os.path.join(REPO, "tests", "fixtures", "geometry", "geometry_fixture_v0.json")
DEFAULT_MESH = os.path.join(ROOT, "mesh", "out", "mesh_levels.json")

EPS = 1e-9
SCQ06_BOUND = 1          # +/-1 source slice, frozen. Never widened here.
GRAZING_COS = math.cos(math.radians(60.0))   # |n.d| below this is "grazing"


# --- ground truth: DDA over the voxel mask, no mesh involved ----------------

def march_mask(origin_w, dir_w, mask, spacing, origin, step=0.25):
    """First occupied voxel along the ray, by marching in VOXEL space.

    Returns (slice_index, normal_axis, abs_cos_incidence) or None.

    `normal_axis` is the voxel axis whose face the ray crossed on entry. The
    volume is axis-aligned (DR-012), so that face's world normal is the world
    axis unit vector, which makes the incidence angle exact rather than
    estimated from a triangle.
    """
    shape = np.array(mask.shape, dtype=np.float64)
    sp = np.asarray(spacing, dtype=np.float64)
    o = np.asarray(origin, dtype=np.float64)

    d_w = np.asarray(dir_w, dtype=np.float64)
    d_w = d_w / np.linalg.norm(d_w)

    p_v = (np.asarray(origin_w, dtype=np.float64) - o) / sp    # voxel coords
    d_v = d_w / sp                                             # voxel-space direction
    n = np.linalg.norm(d_v)
    if n < EPS:
        return None
    d_v = d_v / n

    # March far enough to cross the whole volume from anywhere reasonable.
    max_steps = int(4.0 * float(np.linalg.norm(shape)) / step) + 8
    prev_idx = None
    for _ in range(max_steps):
        idx = np.floor(p_v + 1e-9).astype(np.int64)
        inside = bool(np.all(idx >= 0) and np.all(idx < shape))
        if inside and mask[idx[0], idx[1], idx[2]]:
            # Which face did we come through? The axis that changed last.
            if prev_idx is None:
                axis = int(np.argmax(np.abs(d_v)))          # started inside
            else:
                diff = np.nonzero(idx != prev_idx)[0]
                axis = int(diff[0]) if diff.size else int(np.argmax(np.abs(d_v)))
            # World normal of an axis-aligned voxel face is the world axis.
            cos_inc = abs(float(d_w[axis]))
            return int(idx[2]), axis, cos_inc
        prev_idx = idx
        p_v = p_v + d_v * step
    return None


# --- mesh intersection ------------------------------------------------------

def load_obj(path: str):
    verts, tris = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(v) for v in line.split()[1:4]])
            elif line.startswith("f "):
                tris.append([int(p.split("/")[0]) - 1 for p in line.split()[1:4]])
    v = np.asarray(verts, dtype=np.float64) if verts else np.zeros((0, 3))
    # A decimation level can legitimately collapse to zero triangles. Shape the
    # empty array so tris[:, 0] does not raise instead of returning no hits.
    t = np.asarray(tris, dtype=np.int64) if tris else np.zeros((0, 3), dtype=np.int64)
    return v, t


def ray_mesh_first_hit(origin, direction, verts, tris):
    """Moller-Trumbore, vectorised. Back faces accepted: a viewer picks what the
    user sees, and rejecting them would drop the concave cases that are exactly
    where picking goes wrong."""
    if tris.shape[0] == 0:
        return None
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
    return o + d * float(np.where(ok, t, np.inf).min())


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


# --- run --------------------------------------------------------------------

def run(fixture_path: str, mesh_path: str, out_path: str | None) -> dict:
    from build_mesh import synthetic_mask                     # same mask the mesh came from

    # utf-8-sig: a JSON saved on Windows by some editors carries a BOM.
    with open(fixture_path, encoding="utf-8-sig") as f:
        fixture = json.load(f)
    with open(mesh_path, encoding="utf-8-sig") as f:
        meshes = json.load(f)

    shape = fixture["shape_xyz"]
    spacing = fixture["spacing_xyz_mm"]
    origin = fixture["origin_world_mm"]
    rays = fixture["picking_rays"]
    mask = synthetic_mask(shape)

    # One definition of the centre, taken from the fixture. Previously this
    # recomputed it and landed half a voxel away from the ray builder's centre,
    # so the B6 rotations pivoted about a different point than the rays assumed.
    if "volume_centre_world" in fixture:
        centre = np.asarray(fixture["volume_centre_world"], dtype=np.float64)
    else:
        # Two literal newlines inside these strings once made this whole file
        # a SyntaxError; Vu Hung Anh caught it with py_compile on a clean
        # checkout (PR #15 review, 2026-09-13).
        raise SystemExit(
            "Fixture has no volume_centre_world. Use the canonical fixture:\n"
            "    tests/fixtures/geometry/geometry_fixture_v0.json\n"
            "Computing a centre here is how the harness and the fixture drifted "
            "half a voxel apart the first time.")

    levels = {}
    missing = []
    for lv in meshes["levels"]:
        p = os.path.join(ROOT, lv["obj"])
        if not os.path.exists(p):
            missing.append(lv["obj"])
            continue
        v, t = load_obj(p)
        levels[lv["level"]] = {"meta": lv, "verts": v, "tris": t}
    if missing:
        raise SystemExit(
            "Mesh files named by mesh_levels.json are not on disk:\n  "
            + "\n  ".join(missing)
            + "\n\nThe .obj files are gitignored as regenerable while the JSON summary is\n"
              "tracked, so a clean checkout has the index without the meshes. Run:\n"
              "    python spikes/spike_b_3d/mesh/build_mesh.py\n")

    orientations = [("identity", np.eye(3))]
    for axis, deg in [("y", 30), ("y", -45), ("x", 25), ("x", -35), ("z", 40)]:
        orientations.append((f"rot_{axis}{deg:+d}", rotation(axis, deg)))

    # --- ground truth per (ray, orientation), from the MASK -----------------
    truth = {}
    for name, R in orientations:
        for ray in rays:
            o = R @ (np.asarray(ray["origin_world"]) - centre) + centre
            d = R @ np.asarray(ray["direction_world"])
            g = march_mask(o, d, mask, spacing, origin)
            if g is None:
                continue
            slice_true, axis, cos_inc = g
            d_unit = d / np.linalg.norm(d)
            truth[(ray["id"], name)] = {
                "origin": o, "dir": d,
                "slice_true": slice_true,
                "normal_axis": "xyz"[axis],
                "abs_cos_incidence": round(cos_inc, 4),
                "incidence_deg": round(math.degrees(math.acos(min(1.0, cos_inc))), 1),
                # How many slices the resolved index moves per mm of displacement
                # ALONG the ray. This is the leverage that decides whether a group
                # difference is geometry or just sensitivity.
                "slices_per_mm_along_ray": round(abs(d_unit[2]) / spacing[2], 4),
                # Contractual cohort (DR-013 owner) and the diagnostic one, kept apart.
                "group": ray["group"],
                "incidence_class": "steep" if cos_inc >= GRAZING_COS else "grazing",
            }

    per_level = []
    for level, data in sorted(levels.items()):
        samples = []
        for (ray_id, orient), g in truth.items():
            hit = ray_mesh_first_hit(g["origin"], g["dir"], data["verts"], data["tris"])
            obs = slice_of_world(hit, spacing, origin, shape)
            rec = {
                "ray": ray_id, "orientation": orient,
                "group": g["group"], "incidence_class": g["incidence_class"],
                "incidence_deg": g["incidence_deg"],
                "slices_per_mm_along_ray": g["slices_per_mm_along_ray"],
                "expected_slice": g["slice_true"], "observed_slice": obs,
                "error_slices": None if obs is None else abs(obs - g["slice_true"]),
            }
            if obs is None:
                rec["note"] = "mesh produced no hit where the mask does"
            samples.append(rec)

        by_group = _cohort_stats(samples, "group")
        per_level.append({
            "level": level,
            "cluster_cell_voxels": data["meta"]["cluster_cell_voxels"],
            "triangle_count": data["meta"]["triangle_count"],
            "reduction_vs_level_0": data["meta"]["reduction_vs_level_0"],
            "no_hit_total": sum(s["no_hit"] for s in by_group.values()),
            "by_group": by_group,
            "by_incidence_diagnostic": _cohort_stats(samples, "incidence_class"),
            "samples": samples,
        })

    payload = {
        "_status": "DIAGNOSTIC - synthetic mesh, desktop run. NOT acceptance evidence.",
        "_rewritten": "2026-09-12 - previous version had a tautological ground truth and "
                      "mislabelled ray groups; see the module docstring.",
        "_amended": "2026-09-13 - cohorts follow the canonical fixture's b14_grouping "
                    "(Vu Hung Anh, DR-013); see the module docstring, item 3.",
        "fixture_id": fixture.get("fixture_id"),
        "bound_slices": SCQ06_BOUND,
        "bound_source": "SCQ-06, frozen before Spike B. Not negotiable by this harness.",
        "ground_truth": "DDA ray-march over the voxel mask. Touches no mesh.",
        "grouping": "by_group = the fixture's contractual picking_rays.group labels "
                    "(interior / surface_tangent), reported separately. "
                    f"by_incidence_diagnostic = |n.d| >= {GRAZING_COS:.3f} (60 deg) steep, "
                    "below grazing - an additional diagnostic, never a replacement.",
        "b14_grouping_from_fixture": fixture.get("b14_grouping"),
        "orientations_tested": [n for n, _ in orientations],
        "camera_zoom_note": "Zoom does not change which triangle a ray intersects, so it is "
                            "not simulated. Rotation is, because it does.",
        "ground_truth_rays": len(truth),
        "levels": per_level,
    }
    return _write(out_path, payload) if out_path else payload


def _cohort_stats(samples: list[dict], key: str) -> dict:
    cohorts: dict[str, list[dict]] = {}
    for s in samples:
        cohorts.setdefault(s[key], []).append(s)
    stats = {}
    for name, rows in cohorts.items():
        errs = [s["error_slices"] for s in rows if s["error_slices"] is not None]
        no_hit = sum(1 for s in rows if s["error_slices"] is None)
        stats[name] = {
            "samples": len(rows),
            "no_hit": no_hit,
            "max_error_slices": max(errs) if errs else None,
            "mean_error_slices": round(sum(errs) / len(errs), 4) if errs else None,
            "mean_incidence_deg": round(sum(s["incidence_deg"] for s in rows) / len(rows), 1),
            "mean_slices_per_mm": round(
                sum(s["slices_per_mm_along_ray"] for s in rows) / len(rows), 4),
            # A no-hit is the LARGEST possible picking error, not a missing
            # sample. The first version excluded them and could therefore
            # call a mesh that misses the volume "within bound".
            "within_bound": (bool(errs) and max(errs) <= SCQ06_BOUND and no_hit == 0),
            "error_histogram": {str(e): errs.count(e) for e in sorted(set(errs))},
        }
    return stats


def _write(path, payload):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return payload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", default=DEFAULT_FIXTURE)
    ap.add_argument("--mesh", default=DEFAULT_MESH)
    ap.add_argument("--out", default=os.path.join(ROOT, "mesh", "out", "picking_error.json"))
    args = ap.parse_args()

    if not os.path.exists(args.fixture):
        print(f"fixture not found: {args.fixture}\n"
              "The canonical fixture lives at tests/fixtures/geometry/ (Vu Hung Anh, DR-013). "
              "Pass --fixture to use another file.")
        return 2
    if not os.path.exists(args.mesh):
        print(f"mesh summary not found: {args.mesh}\nRun mesh/build_mesh.py first.")
        return 2

    rep = run(args.fixture, args.mesh, args.out)

    print()
    print(f"  bound        max {rep['bound_slices']} source slice (SCQ-06, frozen)")
    print(f"  ground truth {rep['ground_truth']}")
    print(f"  grouping     {rep['grouping']}")
    print(f"  orientations {', '.join(rep['orientations_tested'])}   <- criterion B6")
    print(f"  rays hitting the mask: {rep['ground_truth_rays']}")
    print()
    print("  B14 cohorts - the fixture's contractual labels (DR-013):")
    head = (f"  {'lvl':>3} {'tris':>6} {'group':<15} {'n':>4} {'nohit':>5} "
            f"{'incid':>6} {'sl/mm':>7} {'max':>4} {'mean':>7}  verdict")
    print(head)
    print("  " + "-" * (len(head) - 2))

    breaches = []
    for lv in rep["levels"]:
        for g in sorted(lv["by_group"]):
            st = lv["by_group"][g]
            ok = st["within_bound"]
            if not ok:
                breaches.append((lv["level"], g, st["max_error_slices"], st["no_hit"]))
            print(f"  {lv['level']:>3} {lv['triangle_count']:>6} {g:<15} {st['samples']:>4} "
                  f"{st['no_hit']:>5} {st['mean_incidence_deg']:>5.1f}d "
                  f"{st['mean_slices_per_mm']:>7.4f} {str(st['max_error_slices']):>4} "
                  f"{str(st['mean_error_slices']):>7}  "
                  f"{'within bound' if ok else 'NOT within bound'}")

    print()
    print("  Read the two middle columns before the two right ones: a group with 20x the")
    print("  slices-per-mm leverage will show more slice error for the same geometric")
    print("  displacement. That is sensitivity, not a property of the decimation.")
    print()
    print("  Diagnostic only - incidence at the hit (not the B14 cohorts):")
    for lv in rep["levels"]:
        for g in sorted(lv["by_incidence_diagnostic"]):
            st = lv["by_incidence_diagnostic"][g]
            print(f"  {lv['level']:>3} {lv['triangle_count']:>6} {g:<15} {st['samples']:>4} "
                  f"{st['no_hit']:>5} {st['mean_incidence_deg']:>5.1f}d "
                  f"{st['mean_slices_per_mm']:>7.4f} {str(st['max_error_slices']):>4} "
                  f"{str(st['mean_error_slices']):>7}")
    print()

    usable = [lv for lv in rep["levels"]
              if lv["by_group"]
              and lv["no_hit_total"] == 0
              and all(s["within_bound"] for s in lv["by_group"].values())]
    if usable:
        best = max(usable, key=lambda lv: lv["reduction_vs_level_0"])
        print(f"  Largest reduction still within +/-{SCQ06_BOUND} slice on THIS synthetic mesh:")
        print(f"    level {best['level']}, cell {best['cluster_cell_voxels']}, "
              f"{best['triangle_count']} triangles, "
              f"{best['reduction_vs_level_0'] * 100:.1f}% fewer than level 0")
    else:
        print("  NO level is within bound on every group with zero missed hits.")
        print("  That is a result. The bound is frozen (SCQ-06) and is not widened to pass.")
    if breaches:
        print("  Outside bound: " + "; ".join(
            f"level {l}/{g} max {e} slices, {n} missed hits" for l, g, e, n in breaches))

    print()
    print("  DIAGNOSTIC ONLY - synthetic mesh, desktop, no frame rate, no device.")
    print("  B13 needs the real mesh AND on-device FPS from Vu Hung Anh before a decimation")
    print("  budget can be recommended. A reduction that picks accurately but renders at")
    print("  12 FPS fails B10.")
    print(f"  wrote  {os.path.relpath(args.out, ROOT)}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
