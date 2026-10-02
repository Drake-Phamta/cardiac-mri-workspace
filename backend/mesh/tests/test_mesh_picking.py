"""3-D pick -> 2-D source slice (PR-3D-04): face_source_slice, misses, half-open cells."""

from __future__ import annotations

import numpy as np
import pytest

from backend.mesh import GeometryError, build_case_mesh, pick_slice
from backend.mesh.surface import slice_of_world

SPACING = (0.625, 0.75, 1.25)
ORIGIN = (-12.5, 7.25, -30.0)


def world(voxel_xyz):
    """Voxel coordinates -> world, written out in the test (DR-008a)."""
    return [ORIGIN[i] + voxel_xyz[i] * SPACING[i] for i in range(3)]


def direction(voxel_dir):
    """A voxel-space direction expressed in world units."""
    return [voxel_dir[i] * SPACING[i] for i in range(3)]


@pytest.fixture()
def single_voxel():
    mask = np.zeros((6, 6, 9), dtype=bool)
    mask[2, 3, 4] = True
    return build_case_mesh(mask, spacing=SPACING, origin=ORIGIN, shape_xyz=mask.shape)


def test_pick_on_a_plus_z_face_returns_the_voxel_slice_not_floor_of_the_hit(single_voxel):
    k = 4
    hit = pick_slice(single_voxel, world((2.5, 3.5, 8.0)), (0.0, 0.0, -1.0))
    assert hit["slice_index"] == k
    assert hit["front_facing"] is True
    assert hit["point_world"][2] == pytest.approx(world((0, 0, k + 1))[2])
    # The hit lies on the plane z = k + 1; the floor rule would navigate to k + 1.
    assert slice_of_world(single_voxel, hit["point_world"]) == k + 1
    assert single_voxel.face_axis[hit["triangle"]] == 2 and single_voxel.face_sign[hit["triangle"]] == 1
    assert hit["slice_index"] == single_voxel.face_source_slice[hit["triangle"]]


def test_pick_from_below_and_from_the_side(single_voxel):
    assert pick_slice(single_voxel, world((2.5, 3.5, -2.0)), (0, 0, 1))["slice_index"] == 4
    assert pick_slice(single_voxel, world((-3.0, 3.5, 4.5)), (1, 0, 0))["slice_index"] == 4
    oblique = pick_slice(single_voxel, world((0.0, 0.0, 0.0)), direction((2.5, 3.5, 4.5)))
    assert oblique["slice_index"] == 4


def test_a_miss_returns_none_and_never_clamps(single_voxel):
    assert pick_slice(single_voxel, world((4.5, 3.5, 8.0)), (0, 0, -1)) is None      # beside it
    assert pick_slice(single_voxel, world((2.5, 3.5, 8.0)), (0, 0, 1)) is None       # pointing away
    assert pick_slice(single_voxel, world((2.5, 3.5, 50.0)), (0, 0, 1)) is None      # far outside
    assert pick_slice(single_voxel, world((2.5, 3.5, -40.0)), (1, 0, 0)) is None     # outside volume


def test_rays_that_start_inside_or_on_the_surface(single_voxel):
    inside = pick_slice(single_voxel, world((2.5, 3.5, 4.5)), (1, 0, 0))
    assert inside["slice_index"] == 4 and inside["front_facing"] is False
    assert single_voxel.face_axis[inside["triangle"]] == 0 and single_voxel.face_sign[inside["triangle"]] == 1
    # Starting ON the top face: that face is at t = 0, which does not count (t > eps).
    down = pick_slice(single_voxel, world((2.5, 3.5, 5.0)), (0, 0, -1))
    assert down["slice_index"] == 4 and down["front_facing"] is False
    assert down["distance_world"] == pytest.approx(SPACING[2])
    assert pick_slice(single_voxel, world((2.5, 3.5, 5.0)), (0, 0, 1)) is None


def test_stacked_voxels_resolve_to_the_voxel_actually_hit():
    k = 4
    mask = np.zeros((5, 5, 9), dtype=bool)
    mask[2, 2, k] = mask[2, 2, k + 1] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN, shape_xyz=mask.shape)
    assert pick_slice(mesh, world((2.5, 2.5, 8.5)), (0, 0, -1))["slice_index"] == k + 1
    assert pick_slice(mesh, world((2.5, 2.5, 0.5)), (0, 0, 1))["slice_index"] == k
    assert pick_slice(mesh, world((-1.0, 2.5, k + 0.5)), (1, 0, 0))["slice_index"] == k
    assert pick_slice(mesh, world((-1.0, 2.5, k + 1.5)), (1, 0, 0))["slice_index"] == k + 1


def test_half_open_cells_a_ray_on_a_voxels_upper_boundary_does_not_enter_it(single_voxel):
    # Voxel (2, 3, 4) occupies y in [3, 4). A ray in the plane y = 4 only touches
    # its closed boundary, so it is a miss; in the plane y = 3 it enters the voxel.
    assert pick_slice(single_voxel, world((-1.0, 4.0, 4.5)), (1, 0, 0)) is None
    assert pick_slice(single_voxel, world((-1.0, 3.0, 4.5)), (1, 0, 0))["slice_index"] == 4
    # Same along z: the plane z = 5 is above the voxel, z = 4 is its lower boundary.
    assert pick_slice(single_voxel, world((-1.0, 3.5, 5.0)), (1, 0, 0)) is None
    assert pick_slice(single_voxel, world((-1.0, 3.5, 4.0)), (1, 0, 0))["slice_index"] == 4


def test_lattice_plane_ray_skips_the_layer_it_only_grazes():
    # A wide lower layer (z = 2) and a narrower upper layer (z = 3). A ray in the
    # plane z = 3 grazes the top edge of the z = 2 layer first, but under the
    # half-open rule it travels in layer 3 and first ENTERS a z = 3 voxel.
    mask = np.zeros((10, 3, 6), dtype=bool)
    mask[1:9, 1, 2] = True
    mask[3:6, 1, 3] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN, shape_xyz=mask.shape)
    hit = pick_slice(mesh, world((-2.0, 1.5, 3.0)), (1, 0, 0))
    assert hit["slice_index"] == 3
    assert hit["point_world"][0] == pytest.approx(world((3, 0, 0))[0])


def test_concave_edge_entry_resolves_to_the_entered_voxel():
    # In the x-z plane: A = (1, ., 1), E = (2, ., 1), B = (2, ., 2); the cell
    # (1, ., 2) above A is empty. A ray heading down-right through the concave
    # edge (x = 2, z = 2) enters E without crossing any face; E's slice is 1.
    mask = np.zeros((4, 3, 4), dtype=bool)
    mask[1, 1, 1] = mask[2, 1, 1] = mask[2, 1, 2] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN, shape_xyz=mask.shape)
    hit = pick_slice(mesh, world((0.0, 1.5, 4.0)), direction((1, 0, -1)))
    assert hit["slice_index"] == 1
    assert hit["slice_index"] == mesh.face_source_slice[hit["triangle"]]


def test_pick_on_a_decimated_mesh_returns_a_surviving_triangles_slice(canonical_fixture, blob_mask):
    spacing, origin = canonical_fixture["spacing_xyz_mm"], canonical_fixture["origin_world_mm"]
    mesh = build_case_mesh(blob_mask, 2, spacing=spacing, origin=origin, shape_xyz=blob_mask.shape)
    for ray in canonical_fixture["picking_rays"]:
        hit = pick_slice(mesh, ray["origin_world"], ray["direction_world"])
        assert hit is not None
        assert hit["slice_index"] == mesh.face_source_slice[hit["triangle"]]
        assert 0 <= hit["slice_index"] < blob_mask.shape[2]


@pytest.mark.parametrize("origin_world, direction_world", [
    ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ((float("nan"), 0.0, 0.0), (0.0, 0.0, 1.0)),
    ((0.0, 0.0, 0.0), (0.0, float("inf"), 1.0)),
    ((0.0, 0.0), (0.0, 0.0, 1.0)),
    ("origin", (0.0, 0.0, 1.0)),
])
def test_invalid_rays_raise(single_voxel, origin_world, direction_world):
    with pytest.raises(GeometryError) as err:
        pick_slice(single_voxel, origin_world, direction_world)
    assert err.value.code == "RAY_INVALID"


def test_direction_length_does_not_matter(single_voxel):
    a = pick_slice(single_voxel, world((2.5, 3.5, 8.0)), (0, 0, -1))
    b = pick_slice(single_voxel, world((2.5, 3.5, 8.0)), (0, 0, -1000))
    assert a == b
