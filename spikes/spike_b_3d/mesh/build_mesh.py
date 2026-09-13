#!/usr/bin/env python3
"""
Surface extraction and decimation for the Spike B picking harness.

THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Not production.

Produces the >=3 decimation levels criterion B12 asks for, each with its
triangle count and generation time, so the decimation frontier table has real
inputs.

WHY VOXEL-FACE EXTRACTION AND NOT MARCHING CUBES
------------------------------------------------
Marching cubes interpolates the surface between voxel centres. For a viewer
that would look better; for THIS spike it would destroy the measurement.
Criteria B4 and B5 measure how accurately a picked surface point resolves back
to a source slice, with bounds of exactly 0 and +/-1 slice. If the surface is
already interpolated away from voxel boundaries, the "true" source slice of a
surface point is itself ambiguous, and the harness would be measuring its own
interpolation error rather than the picking error.

Voxel-face extraction puts every surface point exactly on a cell boundary, so
ground truth is unambiguous. It also adds no dependency: scikit-image is not
installed here, and choosing a mesh library for Spike B is the owner's call,
not something to decide for him at midnight.

CELL CONVENTION - consistent with DR-008a and the fixture
---------------------------------------------------------
Voxel index k occupies [k, k+1) along its axis, so voxel_to_world(k) is the
low corner of the cell, not its centre. That is the same convention the
geometry fixture's floor rounding rule implies, and the same one Spike A's
brush fixture uses for pixels. Keeping all three identical is the point.
"""

from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# The canonical fixture belongs to Vu Hung Anh (DR-013); fixtures_proposal/ is
# the superseded draft it was accepted from.
DEFAULT_FIXTURE = os.path.join(os.path.dirname(os.path.dirname(ROOT)),
                               "tests", "fixtures", "geometry", "geometry_fixture_v0.json")
DEFAULT_OUT = os.path.join(ROOT, "mesh", "out")

# The six cell faces, each as (neighbour offset, the four corner offsets in
# winding order). Corner offsets are in cell-local units, 0 or 1 per axis.
_FACES = [
    ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),   # -x
    ((+1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),   # +x
    ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),   # -y
    ((0, +1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]),   # +y
    ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)]),   # -z
    ((0, 0, +1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),   # +z
]


def synthetic_mask(shape_xyz) -> np.ndarray:
    """A deterministic blob with curvature in all three axes.

    Not anatomy, and not pretending to be. It exists so the picking harness has
    a surface with varied incidence angles before a real mask from Spike D is
    available. An ellipsoid plus a smaller lobe gives concave regions, which is
    where naive picking tends to fail.
    """
    nx, ny, nz = shape_xyz
    x = np.arange(nx)[:, None, None]
    y = np.arange(ny)[None, :, None]
    z = np.arange(nz)[None, None, :]

    cx, cy, cz = nx / 2.0, ny / 2.0, nz / 2.0
    main = (((x - cx) / (nx * 0.32)) ** 2
            + ((y - cy) / (ny * 0.30)) ** 2
            + ((z - cz) / (nz * 0.34)) ** 2) <= 1.0
    lobe = (((x - cx * 1.45) / (nx * 0.16)) ** 2
            + ((y - cy * 0.72) / (ny * 0.17)) ** 2
            + ((z - cz * 1.20) / (nz * 0.22)) ** 2) <= 1.0
    return (main | lobe).astype(np.uint8)


def extract_surface(mask: np.ndarray):
    """Emit every cell face that separates foreground from background.

    Returns (vertices_voxel, triangles) with vertices in VOXEL coordinates;
    the caller applies the world transform. Keeping the mesh in voxel space
    until the last moment means the transform is applied in exactly one place.
    """
    nx, ny, nz = mask.shape
    verts: dict[tuple, int] = {}
    tris: list[tuple[int, int, int]] = []

    def vid(p):
        i = verts.get(p)
        if i is None:
            i = len(verts)
            verts[p] = i
        return i

    occupied = np.argwhere(mask > 0)
    for x, y, z in occupied:
        for (dx, dy, dz), corners in _FACES:
            ax, ay, az = x + dx, y + dy, z + dz
            outside = not (0 <= ax < nx and 0 <= ay < ny and 0 <= az < nz)
            if outside or mask[ax, ay, az] == 0:
                q = [vid((int(x) + c[0], int(y) + c[1], int(z) + c[2])) for c in corners]
                tris.append((q[0], q[1], q[2]))
                tris.append((q[0], q[2], q[3]))

    ordered = np.zeros((len(verts), 3), dtype=np.float64)
    for p, i in verts.items():
        ordered[i] = p
    return ordered, np.asarray(tris, dtype=np.int64)


def decimate(verts: np.ndarray, tris: np.ndarray, cell: float):
    """Vertex clustering: snap to a grid of `cell` voxels, merge, drop degenerates.

    Chosen over quadric-error decimation because it is simple enough to read in
    one sitting and its error is bounded by the cluster size - so the picking
    error it produces is attributable to a number in the table rather than to a
    library's internal heuristics. That matters for B13, where a decimation
    budget has to be justified.
    """
    if cell <= 1.0:
        return verts.copy(), tris.copy()

    keys = np.round(verts / cell).astype(np.int64)
    _uniq, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)

    # Representative position = mean of the cluster's members, which keeps the
    # surface centred rather than pulling it onto the grid.
    n_clusters = counts.shape[0]
    acc = np.zeros((n_clusters, 3), dtype=np.float64)
    np.add.at(acc, inverse, verts)
    new_verts = acc / counts[:, None]

    new_tris = inverse[tris]
    degenerate = ((new_tris[:, 0] == new_tris[:, 1])
                  | (new_tris[:, 1] == new_tris[:, 2])
                  | (new_tris[:, 0] == new_tris[:, 2]))
    return new_verts, new_tris[~degenerate]


def to_world(verts_voxel: np.ndarray, spacing, origin) -> np.ndarray:
    return np.asarray(origin, dtype=np.float64) + verts_voxel * np.asarray(spacing, dtype=np.float64)


def write_obj(path: str, verts_world: np.ndarray, tris: np.ndarray, header: str) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for line in header.splitlines():
            f.write(f"# {line}\n")
        for v in verts_world:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        for t in tris:
            f.write(f"f {t[0] + 1} {t[1] + 1} {t[2] + 1}\n")


def build(fixture_path: str, out_dir: str, cells) -> dict:
    with open(fixture_path, encoding="utf-8-sig") as f:
        fixture = json.load(f)
    shape = fixture["shape_xyz"]
    spacing = fixture["spacing_xyz_mm"]
    origin = fixture["origin_world_mm"]

    os.makedirs(out_dir, exist_ok=True)
    mask = synthetic_mask(shape)

    t0 = time.perf_counter()
    verts0, tris0 = extract_surface(mask)
    extract_ms = (time.perf_counter() - t0) * 1000.0

    levels = []
    for i, cell in enumerate(cells):
        t = time.perf_counter()
        v, tr = decimate(verts0, tris0, cell)
        ms = (time.perf_counter() - t) * 1000.0
        name = f"level_{i}_cell{str(cell).replace('.', 'p')}"
        vw = to_world(v, spacing, origin)
        obj = os.path.join(out_dir, name + ".obj")
        write_obj(obj, vw, tr, header=(
            f"SPIKE_B throwaway mesh - {name}\n"
            f"source: deterministic synthetic mask, shape_xyz={shape}\n"
            f"cluster cell: {cell} voxel(s)\n"
            f"DIAGNOSTIC - synthetic mesh, not acceptance evidence"))
        levels.append({
            "level": i,
            "cluster_cell_voxels": cell,
            "vertex_count": int(v.shape[0]),
            "triangle_count": int(tr.shape[0]),
            "decimation_ms": round(ms, 3),
            "reduction_vs_level_0": round(1.0 - tr.shape[0] / max(1, tris0.shape[0]), 4),
            "obj": os.path.relpath(obj, ROOT).replace(os.sep, "/"),
        })

    summary = {
        "_status": "DIAGNOSTIC - synthetic mesh, desktop, NOT acceptance evidence",
        "_note": ("Real-mesh numbers require a mask from Spike D and on-device runs by "
                  "Vu Hung Anh. Criteria B10, B11 and the real-mesh picking error are his."),
        "fixture": os.path.relpath(fixture_path, ROOT).replace(os.sep, "/"),
        "shape_xyz": shape,
        "spacing_xyz_mm": spacing,
        "origin_world_mm": origin,
        "mask_source": "deterministic synthetic blob (ellipsoid + lobe)",
        "foreground_voxels": int(mask.sum()),
        "surface_extraction_ms": round(extract_ms, 3),
        "extraction_method": "exact voxel-face - every surface point lies on a cell boundary",
        "levels": levels,
    }
    with open(os.path.join(out_dir, "mesh_levels.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(summary, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", default=DEFAULT_FIXTURE)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--cells", default="1,2,3,4",
                    help="vertex-clustering cell sizes in voxels; B12 needs at least 3 levels")
    args = ap.parse_args()

    cells = [float(c) if "." in c else int(c) for c in args.cells.split(",")]
    if len(cells) < 3:
        print("B12 requires at least 3 decimation levels. Give at least three --cells.")
        return 2

    s = build(args.fixture, args.out, cells)
    print()
    print(f"  mask            {s['shape_xyz']}  {s['foreground_voxels']} foreground voxels")
    print(f"  extraction      {s['surface_extraction_ms']} ms  ({s['extraction_method']})")
    print()
    print("  level  cell   vertices   triangles   reduction   decimate ms")
    for lv in s["levels"]:
        print(f"  {lv['level']:>5}  {str(lv['cluster_cell_voxels']):>4}   "
              f"{lv['vertex_count']:>8}   {lv['triangle_count']:>9}   "
              f"{lv['reduction_vs_level_0'] * 100:>8.1f}%   {lv['decimation_ms']:>10.2f}")
    print()
    print(f"  wrote  {os.path.relpath(args.out, ROOT)}/  (.obj per level + mesh_levels.json)")
    print("  DIAGNOSTIC - synthetic mesh, desktop. Not acceptance evidence.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
