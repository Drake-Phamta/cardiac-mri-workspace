#!/usr/bin/env python3
"""
Geometry fixture conformance test.

`SPIKE_B_3D/TASK.md` asks for this explicitly, and says what it is for:

    "Fixture conformance test: known voxel<->world<->slice points,
     machine-comparable, re-runnable. This is the same test TC-MAINT-002 will
     later use across backend and mobile - build it to be reusable."

So it is written as a library plus a thin CLI. `check_fixture()` takes a fixture
and a caller-supplied implementation; the backend and the mobile client both get
checked by the same function against the same fixture, which is what
`TC-MAINT-002` asserts.

    Backend/mobile geometry implementations pass the same canonical fixture set;
    no untested duplicate semantics.                        -- 13 section 351

IT DOES NOT SHARE CODE WITH THE FIXTURE GENERATOR. The generator writes the
expected values; this file re-derives them from the transform stated inside the
fixture and compares. An implementation checked against itself proves nothing -
the same reason Spike A's F2 check exists.

Bound for fixture points is EXACT. `SPIKE_B_3D/TASK.md` freezes it:

    | Canonical synthetic geometry fixtures | EXACT expected slice - zero tolerance |
    | Real decimated-mesh picking           | maximum error = +/-1 source slice     |

    "DO NOT loosen the tolerance merely to obtain a passing framework."

Usage:
    python conformance.py                       # check the proposal fixture
    python conformance.py --fixture <path.json>
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Callable

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
# The canonical fixture belongs to Vu Hung Anh (DR-013); fixtures_proposal/ is
# the superseded draft it was accepted from.
DEFAULT_FIXTURE = os.path.join(REPO, "tests", "fixtures", "geometry",
                               "geometry_fixture_v0.json")

PASS, FAIL = "PASS", "FAIL"


class Finding:
    __slots__ = ("point_id", "group", "kind", "detail")

    def __init__(self, point_id: str, group: str, kind: str, detail: str):
        self.point_id, self.group, self.kind, self.detail = point_id, group, kind, detail

    def __str__(self) -> str:
        return f"{self.point_id} [{self.group}] {self.kind}: {self.detail}"


# --- the reference implementation under test --------------------------------
# This is what a consumer must implement. The backend and the mobile client each
# supply their own; this one exists so the harness has something to check today
# and so the expected behaviour is written down as code, not only as prose.

def reference_impl(fixture: dict) -> dict[str, Callable]:
    """Build a reference implementation FROM THE FIXTURE'S OWN declarations.

    Reading spacing/origin out of the fixture rather than hardcoding them is
    what makes this reusable: point it at the owner's canonical set and it
    checks that set's numbers, not this proposal's.
    """
    spacing = fixture["spacing_xyz_mm"]
    origin = fixture["origin_world_mm"]
    shape = fixture["shape_xyz"]
    rounding = fixture["transform"]["rounding"]

    if rounding != "floor":
        raise SystemExit(
            f"This harness implements 'floor' rounding; the fixture declares '{rounding}'.\n"
            "That disagreement is a real finding, not something to paper over - the\n"
            "rounding rule is part of the geometry contract."
        )

    def v2w(v):
        return [origin[i] + v[i] * spacing[i] for i in range(3)]

    def w2v(w):
        return [(w[i] - origin[i]) / spacing[i] for i in range(3)]

    def slice_of(w):
        """World point -> slice index, or None when outside the volume.

        Out of range must be rejected. Clamping an out-of-range pick into the
        volume is how a 3D viewer silently navigates to the wrong slice, which
        is exactly criterion B9.
        """
        v = w2v(w)
        idx = [math.floor(v[i] + 1e-9) for i in range(3)]
        for i in range(3):
            if idx[i] < 0 or idx[i] > shape[i] - 1:
                return None
        return idx[2]

    return {"voxel_to_world": v2w, "world_to_voxel": w2v, "slice_of_world": slice_of}


# --- the reusable check -----------------------------------------------------

def check_fixture(fixture: dict, impl: dict[str, Callable],
                  tol_mm: float = 1e-6, tol_voxel: float = 1e-6) -> list[Finding]:
    """Run every fixture point against one implementation.

    `impl` is a mapping with `voxel_to_world`, `world_to_voxel` and
    `slice_of_world`. Any language's implementation can be wrapped to this shape,
    which is the point: one fixture, one check, many implementations.
    """
    findings: list[Finding] = []
    shape = fixture["shape_xyz"]

    for p in fixture["points"]:
        pid, group = p["id"], p["group"]
        voxel, world = p["voxel_xyz"], p["world_xyz"]

        # 1 - forward transform reproduces the stored world coordinate
        got = impl["voxel_to_world"](voxel)
        for i, (a, b) in enumerate(zip(got, world)):
            if abs(a - b) > tol_mm:
                findings.append(Finding(pid, group, "voxel_to_world",
                                        f"axis {i}: got {a!r}, fixture says {b!r}"))

        # 2 - inverse transform round-trips back to the voxel coordinate
        back = impl["world_to_voxel"](world)
        for i, (a, b) in enumerate(zip(back, voxel)):
            if abs(a - b) > tol_voxel:
                findings.append(Finding(pid, group, "world_to_voxel",
                                        f"axis {i}: got {a!r}, fixture says {b!r}"))

        # 3 - slice resolution, EXACT, and out-of-range must be rejected
        resolved = impl["slice_of_world"](world)
        expected = p["expected_slice_index"]
        if not p["in_range"]:
            if resolved is not None:
                findings.append(Finding(
                    pid, group, "out_of_range",
                    f"point outside the volume resolved to slice {resolved}; it must be "
                    f"REJECTED. Clamping here is how a viewer navigates to the wrong slice."))
        elif expected is None:
            # half-voxel positions: floor of the z component is the contract
            want = math.floor(voxel[2] + 1e-9)
            if resolved != want:
                findings.append(Finding(pid, group, "slice_rounding",
                                        f"got {resolved}, floor rule gives {want}"))
        elif resolved != expected:
            findings.append(Finding(
                pid, group, "slice_exact",
                f"got {resolved}, fixture says {expected}. Bound is EXACT - "
                f"zero tolerance on canonical fixtures."))

    # 4 - the fixture's own declarations must be self-consistent
    if fixture.get("slice_shape_yx") != [shape[1], shape[0]]:
        findings.append(Finding("-", "fixture", "self_consistency",
                                f"slice_shape_yx {fixture.get('slice_shape_yx')} is not "
                                f"[Ny, Nx] = {[shape[1], shape[0]]} - DR-008a"))
    # DR-012 / A14. The old version only ran when axis_aligned was already true,
    # so a fixture declaring `false` with an oblique matrix, or one with no
    # direction matrix at all, sailed through with "0 findings".
    directions = fixture.get("space_directions")
    declared = fixture.get("axis_aligned")
    if directions is None:
        findings.append(Finding("-", "fixture", "self_consistency",
                                "no space_directions - axis alignment cannot be checked, and "
                                "DR-012 restricts the MVP to VALIDATED axis-aligned geometry"))
    else:
        off_diagonal = [(i, j, v) for i, row in enumerate(directions)
                        for j, v in enumerate(row) if i != j and v != 0.0]
        actually_aligned = not off_diagonal
        if declared is not True:
            findings.append(Finding(
                "-", "fixture", "geometry_profile",
                f"axis_aligned is {declared!r}. DR-012 supports validated axis-aligned "
                f"geometry only; an oblique fixture must be rejected with "
                f"GEOMETRY_NOT_VALIDATED, not consumed"))
        if declared is True and not actually_aligned:
            i, j, v = off_diagonal[0]
            findings.append(Finding("-", "fixture", "self_consistency",
                                    f"axis_aligned is true but direction[{i}][{j}] = {v} "
                                    f"- DR-012"))
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", default=DEFAULT_FIXTURE)
    args = ap.parse_args()

    if not os.path.exists(args.fixture):
        print(f"fixture not found: {args.fixture}")
        return 2
    with open(args.fixture, encoding="utf-8-sig") as f:
        fixture = json.load(f)

    status = fixture.get("_status")
    print()
    print(f"  fixture   {os.path.relpath(args.fixture, os.getcwd())}")
    print(f"  id        {fixture.get('fixture_id')}  contract {fixture.get('contract')}")
    if status == "PROPOSAL":
        print(f"  STATUS    PROPOSAL - owner {fixture.get('_owner')}")
        print("            The canonical set is tests/fixtures/geometry/**, not this file.")
    elif fixture.get("status"):
        print(f"  STATUS    {fixture['status']} - owner {fixture.get('owner')}")

    findings = check_fixture(fixture, reference_impl(fixture))

    by_group: dict[str, list[Finding]] = {}
    for f in findings:
        by_group.setdefault(f.group, []).append(f)

    groups = sorted({p["group"] for p in fixture["points"]})
    print()
    if not groups:
        print("  This fixture declares no test points. Nothing was checked.")
        print("  That is not a pass - a conformance run over zero points proves nothing.")
        print()
        return 2
    width = max(len(g) for g in groups)
    for g in groups:
        total = sum(1 for p in fixture["points"] if p["group"] == g)
        # Count DISTINCT FAILING POINTS, not findings. One bad point can raise up
        # to seven findings (three axes forward, three back, one slice), and the
        # old arithmetic printed things like "-46/8 points conform".
        bad_points = len({f.point_id for f in by_group.get(g, [])})
        mark = "FAIL" if bad_points else "ok  "
        print(f"  {mark} {g:{width}s}  {total - bad_points}/{total} points conform"
              + (f"   ({len(by_group[g])} findings)" if bad_points else ""))

    if findings:
        print()
        print(f"  {len(findings)} finding(s):")
        for f in findings[:20]:
            print(f"    {f}")
        if len(findings) > 20:
            print(f"    ... and {len(findings) - 20} more")
        print()
        print("  Bound on canonical fixtures is EXACT. A finding here is a defect in the")
        print("  implementation or in the fixture - never a tolerance to widen.")
        print()
        return 1

    print()
    print(f"  {len(fixture['points'])} points conform exactly. 0 findings.")
    print("  This checks the REFERENCE implementation. TC-MAINT-002 is satisfied only when")
    print("  the backend and the mobile implementations pass this same function.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
