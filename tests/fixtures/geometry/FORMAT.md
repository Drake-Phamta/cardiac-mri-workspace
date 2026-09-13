# Canonical geometry fixture format

**Owner:** Vũ Hùng Anh · **Contract:** DR-008a · **Geometry boundary:** DR-012

This directory is the shared geometry contract for Spike A, Spike B, Spike F and
the later TC-MAINT-002 test. Consumers must use the fixture fields and must
not replace them with a library-specific memory order.

## File

- geometry_fixture_v0.json — deterministic canonical fixture.
- shape_xyz is [Nx, Ny, Nz].
- A logical source slice has shape [Ny, Nx].
- x is the source-image column, y is the source-image row, and z is the source slice index.
- The origin is top-left; +x points right and +y points down.
- Only validated axis-aligned geometry is supported.

## Transform contract

~~~text
voxel_to_world: world[i] = origin[i] + voxel[i] * spacing[i]
world_to_voxel: voxel[i] = (world[i] - origin[i]) / spacing[i]
slice_index:    z, valid for 0 <= z < Nz
rounding:       floor
out_of_range:   REJECT (never clamp)
~~~

A voxel coordinate z = 7.5 resolves to slice 7 because the voxel cells
are half-open intervals: [7, 8). The half_voxel cases make a
round-to-nearest implementation fail visibly. The out_of_range cases ensure
that a consumer cannot silently navigate to the nearest valid slice.

The fixture deliberately uses anisotropic spacing
[0.625, 0.75, 1.25] and a non-zero origin
[-12.5, 7.25, -30.0] so axis, spacing and origin mistakes cannot hide behind
the common spacing = 1, origin = 0 case.

## Conformance points

There are **33 points**, not 32:

| Group | Count | Purpose |
|---|---:|---|
| corner | 8 | detect flipped or transposed axes |
| face_centre | 6 | detect boundary and half-voxel errors |
| interior | 5 | basic in-volume mapping |
| slice_boundary | 4 | first/last-slice off-by-one |
| half_voxel | 4 | floor versus round-to-nearest |
| out_of_range | 6 | reject instead of clamp |

The checker must derive expected values from the transform in the fixture; it
must not share generator logic with the implementation under test.

## Picking rays and B14

The fixture contains 13 deterministic picking rays. Their
picking_rays[].group labels are the contractual B14 cohorts:
interior and surface_tangent. Evidence must report those cohorts
separately.

The harness may additionally report steep and grazing, computed from the
ray/surface-normal incidence angle, as diagnostic information. Those diagnostic
groups must not replace the contractual B14 labels or be silently mixed with
them.

## Acceptance boundary

The conformance run is a reusable fixture check, not device evidence. A passing
run proves only that an implementation follows this coordinate contract. Real
mesh picking, FPS, stall time and memory still require the physical Galaxy A17
measurement procedure in management/spikes/SPIKE_B_3D/TASK.md.


