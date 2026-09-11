#!/usr/bin/env python3
"""
PROPOSED canonical geometry fixture set — generator.

    THIS IS A PROPOSAL, NOT THE DELIVERABLE.

The canonical geometry fixture set lives at `tests/fixtures/geometry/**` and
belongs to Vu Hung Anh under DR-013. `15` section 9 makes it an
integration-sensitive area with one active owner at a time, and his member brief
records that the **internal format is his own decision to make**.

So this generator writes into `spikes/spike_b_3d/fixtures_proposal/` instead, and
every file it emits carries `_status: PROPOSAL`. The owner adopts it, amends it,
or throws it away and writes his own. Any of the three is a good outcome; what
this removes is the blank page.

Why it exists at all: Spike A and Spike F both consume the fixture set, and
`DAY01_VU_HUNG_ANH.md` calls publishing its format "the milestone that unblocks
other people soonest in the day". On 2026-09-11 nobody was available to write
it, so a proposal was drafted rather than leaving the dependency at zero
(see management/incidents/INC-001).

Determinism: no randomness anywhere. Running this twice produces byte-identical
files. A fixture that changes between runs cannot anchor a conformance test.

Geometry contract — DR-008a, frozen, not negotiable by this file:

    voxel (x, y, z):  x = COLUMN, y = ROW, z = SLICE INDEX
    shape_xyz = [Nx, Ny, Nz]        slice_index = z, valid 0..Nz-1
    slice shape = [Ny, Nx]          screen (u,v) -> (x=u, y=v, z=slice_index)
    top-left origin;  +x RIGHT,  +y DOWN
    library memory order is NOT part of the contract

DR-012 also binds: the MVP supports validated **axis-aligned** geometry only, so
the fixture volume is axis-aligned and says so explicitly rather than leaving it
to be inferred.
"""

from __future__ import annotations

import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# --- the fixture volume -----------------------------------------------------
# Small enough to read by eye, large enough that an off-by-one in any axis is
# visible. Deliberately ANISOTROPIC in all three axes and NON-ZERO origin: a
# transform bug that happens to work for spacing 1.0 at origin 0 is the most
# common way a geometry contract passes a test and still ships broken.
SHAPE_XYZ = [48, 40, 24]                      # Nx, Ny, Nz
SPACING = [0.625, 0.750, 1.250]               # mm along x, y, z
ORIGIN = [-12.5, 7.25, -30.0]                 # mm, deliberately not the centre or zero

PROPOSAL_HEADER = {
    "_status": "PROPOSAL",
    "_owner": "Vu Hung Anh (DR-013 - geometry contract)",
    "_authored_by": "Pham Tuan Anh / Project Control, 2026-09-11, during INC-001 recovery",
    "_action": "adopt, amend, or replace - the format is the owner's decision",
    "_canonical_location": "tests/fixtures/geometry/** (NOT this directory)",
    "_warning": (
        "Do not build production code against this path. This is a proposal so that "
        "Spike A and Spike F are not blocked on a blank page. When the owner's set "
        "lands at tests/fixtures/geometry/**, this directory is deleted."
    ),
}


def voxel_to_world(x: float, y: float, z: float) -> list[float]:
    """Axis-aligned forward transform. The single definition in this fixture set."""
    return [
        round(ORIGIN[0] + x * SPACING[0], 9),
        round(ORIGIN[1] + y * SPACING[1], 9),
        round(ORIGIN[2] + z * SPACING[2], 9),
    ]


def world_to_voxel(wx: float, wy: float, wz: float) -> list[float]:
    """Inverse. Written out rather than derived, so a conformance test can
    check the pair against each other instead of against one shared helper."""
    return [
        round((wx - ORIGIN[0]) / SPACING[0], 9),
        round((wy - ORIGIN[1]) / SPACING[1], 9),
        round((wz - ORIGIN[2]) / SPACING[2], 9),
    ]


def _direction_matrix() -> list[list[float]]:
    """Axis-aligned: spacing on the diagonal, exact zeros elsewhere (DR-012)."""
    return [[SPACING[0], 0.0, 0.0],
            [0.0, SPACING[1], 0.0],
            [0.0, 0.0, SPACING[2]]]


def _test_points() -> list[dict]:
    """Known voxel <-> world <-> slice points.

    Grouped, because `TECHNICAL_SPIKES_REQUIRED.md` requires interior points and
    surface-tangent points to be reported separately: a good interior result
    must not be able to mask a tangent-point failure.

    Groups
      corner         the eight volume corners - catches a flipped or transposed axis
      face_centre    centre of each bounding face
      interior       well inside the volume, the easy case
      slice_boundary z exactly at the first and last slice
      half_voxel     deliberately at x.5 - exercises the rounding rule
      out_of_range   outside the volume; a correct implementation REJECTS these
    """
    nx, ny, nz = SHAPE_XYZ
    points: list[dict] = []
    pid = 0

    def add(x, y, z, group, note, in_range=True):
        nonlocal pid
        pid += 1
        world = voxel_to_world(x, y, z)
        points.append({
            "id": f"GP_{pid:03d}",
            "group": group,
            "voxel_xyz": [x, y, z],
            "world_xyz": world,
            # The slice index IS the z component. Stated redundantly on purpose:
            # this is the value every consumer must agree on (DR-008a).
            "expected_slice_index": (int(z) if in_range and float(z).is_integer() else None),
            "in_range": in_range,
            "note": note,
        })

    # corners - a transposed axis shows up here first
    for x in (0, nx - 1):
        for y in (0, ny - 1):
            for z in (0, nz - 1):
                add(x, y, z, "corner", f"corner x={x} y={y} z={z}")

    # face centres
    cx, cy, cz = nx // 2, ny // 2, nz // 2
    add(0, cy, cz, "face_centre", "min-x face centre")
    add(nx - 1, cy, cz, "face_centre", "max-x face centre")
    add(cx, 0, cz, "face_centre", "min-y face centre")
    add(cx, ny - 1, cz, "face_centre", "max-y face centre")
    add(cx, cy, 0, "face_centre", "min-z face centre - first slice")
    add(cx, cy, nz - 1, "face_centre", "max-z face centre - last slice")

    # interior
    for x, y, z in [(7, 5, 3), (13, 21, 11), (31, 9, 17), (40, 33, 22), (24, 20, 12)]:
        add(x, y, z, "interior", "interior point")

    # slice boundaries - the values most likely to be off by one
    for z in (0, 1, nz - 2, nz - 1):
        add(cx, cy, z, "slice_boundary", f"slice index {z}")

    # half-voxel positions: the rounding rule must be stated, not discovered
    for x, y, z in [(10.5, 8.0, 6.0), (10.0, 8.5, 6.0), (10.0, 8.0, 6.5)]:
        add(x, y, z, "half_voxel",
            "half-voxel offset; consumer must apply the declared rounding rule")

    # out of range - a correct implementation must REJECT, not clamp
    for x, y, z in [(-1, 5, 3), (nx, 5, 3), (5, -1, 3), (5, ny, 3),
                    (5, 5, -1), (5, 5, nz)]:
        add(x, y, z, "out_of_range",
            "OUTSIDE the volume - a correct implementation rejects this, it does not clamp",
            in_range=False)

    return points


def _camera_rays() -> list[dict]:
    """Rays for the picking-error harness, split interior vs surface-tangent.

    A ray nearly parallel to the slice plane (its direction almost perpendicular
    to the z axis) is the hard case: a small geometric error moves the hit point
    a long way along z. Those rays are tagged so their error is reported as its
    own group.
    """
    nx, ny, nz = SHAPE_XYZ
    centre = voxel_to_world((nx - 1) / 2, (ny - 1) / 2, (nz - 1) / 2)
    rays: list[dict] = []
    rid = 0

    def add(origin, direction, group, note):
        nonlocal rid
        rid += 1
        rays.append({
            "id": f"RAY_{rid:03d}",
            "group": group,
            "origin_world": [round(v, 9) for v in origin],
            "direction_world": [round(v, 9) for v in direction],
            "note": note,
        })

    span = max(SHAPE_XYZ[i] * SPACING[i] for i in range(3)) * 2.0

    # Steep rays: mostly along z. The forgiving case.
    for dx, dy in [(0.0, 0.0), (0.15, 0.0), (0.0, 0.15), (-0.2, 0.1), (0.1, -0.25)]:
        add([centre[0] - dx * span, centre[1] - dy * span, centre[2] - span],
            [dx, dy, 1.0], "interior",
            "ray mostly along +z; hit point is well conditioned in the slice axis")

    # Tangent rays: mostly in the xy plane, small z component. The hard case.
    for dz in (0.08, -0.08, 0.04, -0.04, 0.02):
        add([centre[0] - span, centre[1] - 0.3 * span, centre[2] - dz * span],
            [1.0, 0.3, dz], "surface_tangent",
            "ray near-parallel to the slice plane; small geometric error moves z a long way")
    for dz in (0.06, -0.06, 0.03):
        add([centre[0] - 0.2 * span, centre[1] - span, centre[2] - dz * span],
            [0.2, 1.0, dz], "surface_tangent",
            "ray near-parallel to the slice plane, second incidence direction")

    return rays


def build() -> dict:
    points = _test_points()
    return {
        **PROPOSAL_HEADER,
        "fixture_id": "GEOM_PROPOSAL_V0",
        "contract": "DR-008a",
        "geometry_profile": "axis-aligned only (DR-012)",
        "indexing": {
            "x": "COLUMN of the source image",
            "y": "ROW of the source image",
            "z": "SLICE INDEX",
            "origin": "top-left",
            "x_direction": "+x RIGHT",
            "y_direction": "+y DOWN",
            "memory_order": "NOT part of the contract - consumers go through shape_xyz",
        },
        "shape_xyz": SHAPE_XYZ,
        "slice_shape_yx": [SHAPE_XYZ[1], SHAPE_XYZ[0]],
        "spacing_xyz_mm": SPACING,
        "origin_world_mm": ORIGIN,
        "space_directions": _direction_matrix(),
        "axis_aligned": True,
        "transform": {
            "voxel_to_world": "world[i] = origin[i] + voxel[i] * spacing[i]",
            "world_to_voxel": "voxel[i] = (world[i] - origin[i]) / spacing[i]",
            "slice_index": "slice_index = z, valid 0..Nz-1",
            "rounding": "floor",
            "rounding_rationale": (
                "voxel (x,y,z) covers [x, x+1) x [y, y+1) x [z, z+1) under a top-left "
                "origin, so floor is the consistent choice. A consumer that rounds to "
                "nearest will disagree with this fixture at every half-voxel point, "
                "which is why the half_voxel group exists."
            ),
            "out_of_range": "REJECT. Do not clamp into range.",
        },
        "groups": {
            "corner": "volume corners - catches a flipped or transposed axis",
            "face_centre": "centre of each bounding face",
            "interior": "well inside the volume",
            "slice_boundary": "z at the first and last slices",
            "half_voxel": "fractional positions that exercise the rounding rule",
            "out_of_range": "outside the volume - must be rejected, never clamped",
        },
        "point_count": len(points),
        "points": points,
        "picking_rays": _camera_rays(),
    }


def main() -> None:
    fixture = build()
    path = os.path.join(HERE, "geometry_fixture_v0.json")
    text = json.dumps(fixture, indent=1, ensure_ascii=False) + "\n"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    n_rays = len(fixture["picking_rays"])
    tangent = sum(1 for r in fixture["picking_rays"] if r["group"] == "surface_tangent")
    print(f"  wrote   {os.path.relpath(path, HERE)}")
    print(f"  sha256  {digest}")
    print(f"  volume  {fixture['shape_xyz']}  spacing {fixture['spacing_xyz_mm']}  "
          f"origin {fixture['origin_world_mm']}")
    print(f"  points  {fixture['point_count']}  ({sum(1 for p in fixture['points'] if not p['in_range'])} out of range)")
    print(f"  rays    {n_rays}  ({tangent} surface-tangent)")
    print()
    print("  STATUS: PROPOSAL. The canonical set is Vu Hung Anh's deliverable at")
    print("          tests/fixtures/geometry/**. This directory is deleted when it lands.")


if __name__ == "__main__":
    main()
