# Canonical geometry contract — `dr008a-dr012/v1.0.0`

**Owner:** Vũ Hùng Anh · **Indexing:** DR-008a · **Support boundary:** DR-012

This directory is the one shared geometry contract for Spike A, Spike B, Spike
F, backend, and mobile. It is the fixture set required by `TC-MAINT-002`.
Consumers use these fields; a library memory layout must never replace them.

## Contract identity and version check

The current exact, opaque version string is:

```text
dr008a-dr012/v1.0.0
```

Every geometry-bearing artifact or API response must carry it in
`geometry_contract_version`. A consumer compares the whole string for equality
with the version it was built/configured to accept. A missing, unknown, or
different value is rejected before coordinates are used; it is not coerced to a
nearest compatible version. This is the version-mismatch behaviour required by
`TC-REL-003`.

The fixture declares the version itself. The reusable checker takes the
consumer's expected version explicitly:

```bash
python spikes/spike_b_3d/harness/conformance.py \
  --fixture tests/fixtures/geometry/geometry_fixture_v0.json \
  --expect-contract-version dr008a-dr012/v1.0.0
```

`check_fixture(fixture, implementation, expected_contract_version=...)` is the
library entry point. Backend and mobile adapters each supply their own
`voxel_to_world`, `world_to_voxel`, and `slice_of_world` functions to that same
checker and run this same fixture. The CI job checks the canonical fixture and
reference adapter on every PR; it is not evidence that a future backend or
mobile implementation has passed until that implementation's adapter is added
to its own build.

## Version changes

Versions use the `vMAJOR.MINOR.PATCH` suffix. Do not alter an already-published
fixture in place when a change changes its contract meaning.

| Change | Version action | Required work |
|---|---|---|
| Documentation, comments, or a diagnostic-only field with no consumer meaning | PATCH | Keep all contract values and expected results unchanged; rerun conformance. |
| Add an optional field or additional deterministic case while preserving every existing transform, expected result, and reject rule | MINOR | Keep the prior fixture runnable; add regression coverage and update paired consumers atomically. |
| Change axes/order, units, origin/spacing/direction semantics, slice mapping, rounding, out-of-range behaviour, supported geometry profile, any existing expected coordinate/slice, or remove/rename a required field | MAJOR | Publish a new fixture/version, run a compatibility impact review, update backend/mobile together, and retain the old fixture for regression. |

Even a compatible MINOR change is an exact-version mismatch until a consumer is
deliberately updated. Do not rely on a semantic-version range for clinical
geometry. A release changes the response version and both consumer expectations
in the same reviewed change; CI must run the old fixture where it remains
supported and the new fixture for the new implementation.

## Canonical fields and transform

- `geometry_fixture_v0.json` is the deterministic canonical fixture for the
  current version.
- `shape_xyz` is `[Nx, Ny, Nz]`; a logical source slice is `[Ny, Nx]`.
- `x` is source-image column, `y` source-image row, `z` source slice index.
- Image origin is top-left; `+x` points right and `+y` points down.
- Only validated axis-aligned geometry is supported.

~~~text
voxel_to_world: world[i] = origin[i] + voxel[i] * spacing[i]
world_to_voxel: voxel[i] = (world[i] - origin[i]) / spacing[i]
slice_index:    z, valid for 0 <= z < Nz
rounding:       floor
out_of_range:   REJECT (never clamp)
~~~

A voxel coordinate `z = 7.5` resolves to slice 7 because voxel cells are
half-open intervals `[7, 8)`. The half-voxel cases expose round-to-nearest.
Out-of-range cases prohibit silent navigation to a nearest valid slice.

The fixture intentionally uses anisotropic spacing `[0.625, 0.75, 1.25]` and
non-zero origin `[-12.5, 7.25, -30.0]`; axis, spacing, and origin mistakes
therefore cannot hide behind the common all-ones/all-zeros case.

## Conformance data

There are 33 coordinate points: 8 corner, 6 face-centre, 5 interior, 4
slice-boundary, 4 half-voxel, and 6 out-of-range. Expected values come from the
fixture; implementations must not share generator logic with the checker.

There are also 13 deterministic `picking_rays`. Their contractual B14 cohorts
are `interior` and `surface_tangent`; report them separately. Incidence-based
`steep`/`grazing` labels may supplement them but may not replace or mix them.

The canonical fixture bound is **EXACT**. Conformance proves coordinate
semantics only. Real mesh picking, FPS, stalls, memory, and device interaction
still require the physical Galaxy A17 procedure in `SPIKE_B_3D/TASK.md`.

## QA-002 physical-coordinate caveat

QA-002 F2 found that all **462/462** LASC headers inspected carried default
spacing `1` and origin `0`. For that source, header-derived “world” coordinates
are voxel indices expressed through a default affine, **not validated physical
millimetres**. They must not support a distance, area, volume, or mL claim.
The canonical fixture uses synthetic physical geometry only to test the
DR-008a transform; it does not validate physical geometry for that dataset.
Until source geometry is independently validated, expose no mm/mL measurement
from those headers and keep `geometry_status` out of `VALIDATED`.
