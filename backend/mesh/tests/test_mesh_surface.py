"""Level-0 voxel-face surface: exact faces, winding, source slices, validation (V2-01)."""

from __future__ import annotations

import json
from collections import Counter

import numpy as np
import pytest

from backend.mesh import CONTRACT_VERSION, GeometryError, build_case_mesh

SPACING = (0.625, 0.75, 1.25)          # anisotropic, like the canonical fixture
ORIGIN = (-12.5, 7.25, -30.0)          # non-zero, like the canonical fixture
VOXEL_VOLUME = SPACING[0] * SPACING[1] * SPACING[2]


# --- independent reference and mesh readers (no product or spike code) -------

def reference_faces(mask: np.ndarray) -> set:
    """Slow reference with explicit loops: every voxel, every one of its six neighbours.

    A face is (its four lattice corners, axis, outward sign, z of the
    foreground voxel). Written from the definition, not from the product.
    """
    nx, ny, nz = mask.shape
    faces = set()
    for x in range(nx):
        for y in range(ny):
            for z in range(nz):
                if not mask[x, y, z]:
                    continue
                for axis in range(3):
                    for sign in (-1, 1):
                        n = [x, y, z]
                        n[axis] += sign
                        inside = all(0 <= n[i] < mask.shape[i] for i in range(3))
                        if inside and mask[n[0], n[1], n[2]]:
                            continue
                        plane = (x, y, z)[axis] + (1 if sign > 0 else 0)
                        a, b = [i for i in range(3) if i != axis]
                        corners = set()
                        for da in (0, 1):
                            for db in (0, 1):
                                c = [x, y, z]
                                c[axis] = plane
                                c[a] += da
                                c[b] += db
                                corners.add(tuple(c))
                        faces.add((frozenset(corners), axis, sign, z))
    return faces


def lattice(mesh) -> np.ndarray:
    """Vertices as integer lattice corners; they must be exactly that at level 0."""
    v = (mesh.vertices_world - np.asarray(mesh.origin)) / np.asarray(mesh.spacing)
    r = np.rint(v)
    assert np.allclose(v, r, rtol=0, atol=1e-9)
    return r.astype(np.int64)


def mesh_faces(mesh) -> set:
    """Group triangles into unit-square faces; each face must be exactly two halves."""
    corners = lattice(mesh)
    groups: dict = {}
    for t, tri in enumerate(mesh.triangles):
        pts = corners[tri]
        axis = int(mesh.face_axis[t])
        lo, hi = pts.min(axis=0), pts.max(axis=0)
        span = hi - lo
        assert span[axis] == 0, "triangle does not lie in its face_axis plane"
        assert all(span[i] == 1 for i in range(3) if i != axis), "triangle is not half a unit face"
        a, b = [i for i in range(3) if i != axis]
        quad = set()
        for da in (0, 1):
            for db in (0, 1):
                c = lo.copy()
                c[a] += da
                c[b] += db
                quad.add(tuple(int(v) for v in c))
        key = (frozenset(quad), axis, int(mesh.face_sign[t]), int(mesh.face_source_slice[t]))
        groups.setdefault(key, []).append(frozenset(tuple(int(v) for v in p) for p in pts))
    for key, halves in groups.items():
        assert len(halves) == 2, f"face {sorted(key[0])} has {len(halves)} triangles"
        assert halves[0] != halves[1] and (halves[0] | halves[1]) == key[0]
    return set(groups)


def assert_outward(mesh) -> None:
    """Every normal points along face_sign * face_axis, i.e. foreground -> background."""
    v, t = mesh.vertices_world, mesh.triangles
    n = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    rows = np.arange(t.shape[0])
    axis = mesh.face_axis.astype(np.int64)
    assert np.all(n[rows, axis] * mesh.face_sign > 0)
    off = n.copy()
    off[rows, axis] = 0.0
    assert np.allclose(off, 0.0)


def signed_volume(mesh) -> float:
    v, t = mesh.vertices_world, mesh.triangles
    return float(np.einsum("ij,ij->i", v[t[:, 0]], np.cross(v[t[:, 1]], v[t[:, 2]])).sum() / 6.0)


def assert_closed_oriented(mesh) -> None:
    """Closed and consistently wound: each directed edge a->b is matched by b->a."""
    directed = Counter()
    for a, b, c in mesh.triangles.tolist():
        directed.update([(a, b), (b, c), (c, a)])
    for (a, b), count in directed.items():
        assert directed[(b, a)] == count, f"edge {a}->{b} used {count}x, {b}->{a} {directed[(b, a)]}x"


# --- tests -------------------------------------------------------------------

def test_single_voxel_is_a_closed_outward_cube():
    mask = np.zeros((4, 5, 6), dtype=bool)
    mask[1, 2, 3] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN)

    assert mesh.vertex_count == 8
    assert mesh.triangle_count == 12
    undirected = Counter()
    for a, b, c in mesh.triangles.tolist():
        undirected.update(frozenset(e) for e in ((a, b), (b, c), (c, a)))
    # 12 cube edges + 6 face diagonals, each in exactly two triangles: closed.
    assert len(undirected) == 18 and set(undirected.values()) == {2}, "every edge in exactly 2 triangles"
    assert mesh.vertex_count - len(undirected) + mesh.triangle_count == 2, "Euler characteristic of a sphere"
    assert_closed_oriented(mesh)
    assert_outward(mesh)
    assert signed_volume(mesh) == pytest.approx(VOXEL_VOLUME, rel=1e-12)
    assert mesh.face_source_slice.tolist() == [3] * 12
    assert sorted(zip(mesh.face_axis.tolist(), mesh.face_sign.tolist())) == sorted(
        [(a, s) for a in range(3) for s in (-1, 1)] * 2)
    expected = {tuple(np.asarray(ORIGIN) + np.array(c) * np.asarray(SPACING))
                for c in [(x, y, z) for x in (1, 2) for y in (2, 3) for z in (3, 4)]}
    assert {tuple(v) for v in mesh.vertices_world.tolist()} == expected
    assert mesh_faces(mesh) == reference_faces(mask)


def test_two_stacked_voxels_drop_the_shared_face_and_keep_each_voxels_slice():
    k = 4
    mask = np.zeros((5, 5, 8), dtype=bool)
    mask[2, 2, k] = mask[2, 2, k + 1] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN)

    assert mesh.triangle_count == 20 and mesh.vertex_count == 12
    corners = lattice(mesh)
    z_axis = mesh.face_axis == 2
    plane_z = corners[mesh.triangles[:, 0], 2]
    assert not np.any(z_axis & (plane_z == k + 1)), "the internal face z = k + 1 must be removed"
    top = z_axis & (mesh.face_sign == 1)
    bottom = z_axis & (mesh.face_sign == -1)
    assert np.all(plane_z[top] == k + 2) and np.all(mesh.face_source_slice[top] == k + 1)
    assert np.all(plane_z[bottom] == k) and np.all(mesh.face_source_slice[bottom] == k)
    # Side faces: each carries the z of the voxel it bounds, i.e. its own z extent.
    side = ~z_axis
    side_low_z = corners[mesh.triangles[side]][:, :, 2].min(axis=1)
    assert np.array_equal(mesh.face_source_slice[side], side_low_z)
    assert sorted(Counter(mesh.face_source_slice[side].tolist()).items()) == [(k, 8), (k + 1, 8)]
    assert_closed_oriented(mesh)
    assert_outward(mesh)
    assert signed_volume(mesh) == pytest.approx(2 * VOXEL_VOLUME, rel=1e-12)
    assert mesh_faces(mesh) == reference_faces(mask)


@pytest.mark.parametrize("seed, shape, density", [
    (1, (5, 6, 4), 0.3), (2, (7, 3, 5), 0.5), (3, (6, 6, 6), 0.7),
    (4, (4, 9, 3), 0.4), (5, (8, 5, 7), 0.55), (6, (3, 3, 3), 0.9),
])
def test_faces_equal_an_independent_slow_reference(seed, shape, density):
    rng = np.random.default_rng(seed)
    mask = rng.random(shape) < density
    if not mask.any():
        mask[0, 0, 0] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN)

    assert mesh_faces(mesh) == reference_faces(mask)
    assert mesh.triangle_count == 2 * len(reference_faces(mask))
    assert_outward(mesh)
    assert_closed_oriented(mesh)
    assert signed_volume(mesh) == pytest.approx(int(mask.sum()) * VOXEL_VOLUME, rel=1e-9)
    corners = lattice(mesh)
    assert len({tuple(c) for c in corners.tolist()}) == mesh.vertex_count, "shared corners deduplicated"
    assert np.array_equal(np.unique(mesh.triangles), np.arange(mesh.vertex_count)), "no unused vertex"
    assert mesh.foreground_voxels == int(mask.sum())
    assert np.array_equal(mesh.source_triangle, np.arange(mesh.triangle_count))


def test_foreground_on_the_volume_border_emits_the_border_faces():
    full = np.ones((3, 4, 2), dtype=bool)
    mesh = build_case_mesh(full, spacing=SPACING, origin=ORIGIN)
    assert mesh.triangle_count == 2 * 2 * (3 * 4 + 4 * 2 + 3 * 2)
    corners = lattice(mesh)
    for axis, limit in enumerate(full.shape):
        on_axis = mesh.face_axis == axis
        plane = corners[mesh.triangles[on_axis][:, 0], axis]
        assert set(plane.tolist()) == {0, limit}
        assert np.all((plane == 0) == (mesh.face_sign[on_axis] == -1))
    assert mesh_faces(mesh) == reference_faces(full)

    corner = np.zeros((4, 4, 4), dtype=bool)
    corner[0, 0, 0] = True
    corner[3, 3, 3] = True
    mesh = build_case_mesh(corner)
    assert mesh.triangle_count == 24
    assert mesh_faces(mesh) == reference_faces(corner)


def test_vertices_are_origin_plus_lattice_corner_times_spacing():
    rng = np.random.default_rng(11)
    mask = rng.random((6, 7, 5)) < 0.4
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN)
    corners = lattice(mesh)
    expected = np.asarray(ORIGIN) + corners.astype(np.float64) * np.asarray(SPACING)
    assert np.array_equal(mesh.vertices_world, expected)
    xs, ys, zs = np.nonzero(mask)
    lo = np.array([xs.min(), ys.min(), zs.min()])
    hi = np.array([xs.max(), ys.max(), zs.max()]) + 1
    assert np.allclose(mesh.vertices_world.min(axis=0), np.asarray(ORIGIN) + lo * np.asarray(SPACING))
    assert np.allclose(mesh.vertices_world.max(axis=0), np.asarray(ORIGIN) + hi * np.asarray(SPACING))
    assert mesh.shape_xyz == mask.shape
    assert mesh.spacing == SPACING and mesh.origin == ORIGIN
    assert mesh.geometry_contract_version == CONTRACT_VERSION


def test_accepted_mask_encodings_give_the_same_mesh():
    rng = np.random.default_rng(5)
    base = rng.random((5, 6, 4)) < 0.5
    hashes = {build_case_mesh(m, spacing=SPACING, origin=ORIGIN).content_sha256() for m in (
        base, base.astype(np.uint8), base.astype(np.uint8) * 255, base.astype(np.int64),
        base.astype(np.float32), base.astype(np.float64) * 255.0)}
    assert len(hashes) == 1


def test_memory_layout_does_not_change_the_mesh():
    rng = np.random.default_rng(9)
    mask = rng.random((7, 5, 6)) < 0.45
    c_order = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN)
    f_order = build_case_mesh(np.asfortranarray(mask), spacing=SPACING, origin=ORIGIN)
    strided = np.zeros((14, 5, 12), dtype=bool)
    strided[::2, :, ::2] = mask
    view = build_case_mesh(strided[::2, :, ::2], spacing=SPACING, origin=ORIGIN)
    assert c_order.content_sha256() == f_order.content_sha256() == view.content_sha256()


@pytest.mark.parametrize("mask, code", [
    (np.zeros((4, 4, 4), dtype=bool), "MASK_EMPTY"),
    (np.ones((4, 4), dtype=bool), "MASK_NOT_3D"),
    (np.ones((4, 4, 4, 1), dtype=bool), "MASK_NOT_3D"),
    (np.ones((0, 4, 4), dtype=bool), "MASK_NOT_3D"),
    (np.array([0, 1, 2] * 9, dtype=np.uint8).reshape(3, 3, 3), "MASK_NOT_BINARY"),
    (np.array([0, 1, 255] * 9, dtype=np.uint8).reshape(3, 3, 3), "MASK_NOT_BINARY"),
    (np.full((3, 3, 3), -1, dtype=np.int16), "MASK_NOT_BINARY"),
    (np.full((3, 3, 3), 0.5), "MASK_NOT_BINARY"),
    (np.full((3, 3, 3), np.nan), "MASK_NOT_BINARY"),
    (np.full((3, 3, 3), "a"), "MASK_NOT_BINARY"),
])
def test_invalid_masks_are_rejected_with_a_code(mask, code):
    with pytest.raises(GeometryError) as err:
        build_case_mesh(mask)
    assert err.value.code == code
    assert isinstance(err.value, ValueError)


@pytest.mark.parametrize("kwargs, code", [
    ({"spacing": (0.0, 1.0, 1.0)}, "GEOMETRY_NOT_VALIDATED"),
    ({"spacing": (1.0, -1.0, 1.0)}, "GEOMETRY_NOT_VALIDATED"),
    ({"spacing": (1.0, float("nan"), 1.0)}, "GEOMETRY_NOT_VALIDATED"),
    ({"spacing": (1.0, 1.0)}, "GEOMETRY_NOT_VALIDATED"),
    ({"origin": (0.0, float("inf"), 0.0)}, "GEOMETRY_NOT_VALIDATED"),
    ({"origin": "nowhere"}, "GEOMETRY_NOT_VALIDATED"),
    ({"contract_version": "dr008a-dr012/v1.0.1"}, "GEOMETRY_CONTRACT_VERSION_MISMATCH"),
    ({"contract_version": ""}, "GEOMETRY_CONTRACT_VERSION_MISSING"),
    ({"contract_version": None}, "GEOMETRY_CONTRACT_VERSION_MISSING"),
    ({"shape_xyz": (6, 5, 4)}, "GEOMETRY_MISMATCH"),
    ({"level": 5}, "MESH_LEVEL_UNKNOWN"),
    ({"level": -1}, "MESH_LEVEL_UNKNOWN"),
    ({"level": 1.0}, "MESH_LEVEL_UNKNOWN"),
    ({"level": True}, "MESH_LEVEL_UNKNOWN"),
])
def test_invalid_geometry_and_options_are_rejected_with_a_code(kwargs, code):
    mask = np.zeros((4, 5, 6), dtype=bool)
    mask[1, 1, 1] = True
    with pytest.raises(GeometryError) as err:
        build_case_mesh(mask, **kwargs)
    assert err.value.code == code


def test_declared_shape_matching_the_mask_is_accepted():
    mask = np.zeros((4, 5, 6), dtype=bool)
    mask[1, 1, 1] = True
    assert build_case_mesh(mask, shape_xyz=[4, 5, 6]).shape_xyz == (4, 5, 6)


def test_to_dict_is_json_and_carries_the_exact_contract_version():
    rng = np.random.default_rng(3)
    mask = rng.random((5, 5, 5)) < 0.5
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN)
    payload = json.loads(json.dumps(mesh.to_dict()))
    assert payload["geometry_contract_version"] == CONTRACT_VERSION
    assert payload["geometry"] == {
        "geometry_contract_version": CONTRACT_VERSION, "shape": [5, 5, 5],
        "index_convention": "x=column,y=row,z=slice", "spacing": list(SPACING),
        "origin": list(ORIGIN), "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1]}
    assert payload["triangle_count"] == len(payload["triangles"]) == len(payload["face_source_slice"])
    assert payload["vertex_count"] == len(payload["vertices_world"])
    assert np.array_equal(np.asarray(payload["vertices_world"]), mesh.vertices_world)
    assert np.array_equal(np.asarray(payload["triangles"]), mesh.triangles)
    assert payload["level"] == 0 and payload["cluster_cell_voxels"] == 1
    assert payload["content_sha256"] == mesh.content_sha256()


def test_mesh_arrays_are_read_only_and_typed():
    mask = np.zeros((3, 3, 3), dtype=bool)
    mask[1, 1, 1] = True
    mesh = build_case_mesh(mask)
    assert mesh.vertices_world.dtype == np.float64 and mesh.triangles.dtype == np.int32
    assert mesh.face_source_slice.dtype == np.int32
    assert mesh.face_axis.dtype == np.int8 and mesh.face_sign.dtype == np.int8
    with pytest.raises(ValueError):
        mesh.face_source_slice[0] = 2
    with pytest.raises(ValueError):
        mesh.vertices_world[0, 0] = 1.0
