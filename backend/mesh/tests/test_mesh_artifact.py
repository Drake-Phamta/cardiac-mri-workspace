"""The served L0 artifact ``cardiac-mesh/1`` (V2-01; SCR-05 H6 / H7): format, frame, picking and a golden.

Axis order is the contract's ``index_convention`` ``x=column,y=row,z=slice``: a voxel at column 3, row 7, slice 2
of a (z, y, x) volume has vertices with x in {3, 4}, y in {7, 8} and z in {2, 3}, and its faces' source slice is 2.
All data here is synthetic.
"""

from __future__ import annotations

import base64
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
import pytest

from backend.mesh import GeometryError, artifact, build_case_mesh, pick_slice

GOLDEN = Path(__file__).resolve().parent / "golden" / "l_shape_cmesh.json"


def volume_with(voxels, shape_xyz):
    """A (z, y, x) uint8 volume with the given (x=column, y=row, z=slice) voxels set."""
    nx, ny, nz = shape_xyz
    volume = np.zeros((nz, ny, nx), dtype=np.uint8)
    for x, y, z in voxels:
        volume[z, y, x] = 255
    return volume


def test_a_single_voxel_pins_the_axis_order_to_the_index_convention():
    payload, info = artifact.build_mesh_artifact(volume_with([(3, 7, 2)], (12, 10, 6)))
    decoded = artifact.decode_mesh(payload)
    header = decoded["header"]
    assert header["shape"] == [12, 10, 6] and header["index_convention"] == "x=column,y=row,z=slice"
    assert header["frame"] == "voxel-index" and header["level"] == 0
    vertices = {tuple(int(c) for c in v) for v in decoded["vertices"]}
    assert vertices == {(x, y, z) for x in (3, 4) for y in (7, 8) for z in (2, 3)}
    assert decoded["triangles"].shape == (12, 3) and set(decoded["face_source_slice"].tolist()) == {2}
    assert info["vertex_count"] == 8 and info["triangle_count"] == 12 and info["shape"] == [12, 10, 6]


def test_every_vertex_is_inside_the_volume_and_slices_in_range():
    payload, _info = artifact.build_mesh_artifact(
        volume_with([(0, 0, 0), (11, 9, 5), (5, 5, 3), (5, 5, 4)], (12, 10, 6)))
    decoded = artifact.decode_mesh(payload)
    shape = decoded["header"]["shape"]
    assert all(int(decoded["vertices"][:, axis].max()) <= shape[axis] for axis in range(3))
    assert int(decoded["face_source_slice"].max()) < shape[2] and int(decoded["vertices"].min()) >= 0
    assert set(decoded["face_source_slice"].tolist()) == {0, 3, 4, 5}


def test_the_bytes_are_deterministic_and_content_addressed():
    volume = volume_with([(2, 2, 1), (3, 2, 1), (3, 3, 2)], (8, 8, 4))
    first, info = artifact.build_mesh_artifact(volume)
    second, again = artifact.build_mesh_artifact(volume.copy())
    assert first == second and info == again and info["mesh_sha256"] == hashlib.sha256(first).hexdigest()
    assert len(first) % 4 == 0 and info["bytes"] == len(first)
    assert artifact.reconstruction_version("a" * 64) == f"dr008c-L0/v1 sha256:{'a' * 64}"


def test_it_matches_the_product_mesh_and_its_pick_rule(blob_mask):
    """The artifact is the CaseMesh of the same mask; the reference ray cast gives the product's slice."""
    volume = np.transpose(blob_mask, (2, 1, 0)).astype(np.uint8) * 255
    payload, info = artifact.build_mesh_artifact(volume)
    decoded = artifact.decode_mesh(payload)
    mesh = build_case_mesh(blob_mask, 0)
    assert info["triangle_count"] == mesh.triangle_count and info["vertex_count"] == mesh.vertex_count
    assert np.array_equal(decoded["vertices"].astype(np.float64), mesh.vertices_world)
    assert np.array_equal(decoded["triangles"].astype(np.int64), mesh.triangles)
    assert np.array_equal(decoded["face_source_slice"].astype(np.int64), mesh.face_source_slice)
    nx, ny, nz = blob_mask.shape
    rng = np.random.default_rng(7)
    agreed = 0
    for _ in range(300):
        origin = np.array([rng.uniform(0, nx), rng.uniform(0, ny), nz + 5.0])
        direction = np.array([rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), -1.0])
        triangle = artifact.pick_triangle(decoded, origin, direction)
        reference = pick_slice(mesh, origin, direction)
        assert (triangle is None) == (reference is None)
        if reference is not None:
            assert int(decoded["face_source_slice"][triangle]) == reference["slice_index"]
            agreed += 1
    assert agreed > 50


def test_a_top_down_pick_resolves_the_foreground_voxel_not_the_floor_of_the_hit():
    # The +z face of voxel (4, 3, 2) lies on the plane z = 3: the floor rule says slice 3, the pick rule slice 2.
    payload, _ = artifact.build_mesh_artifact(volume_with([(4, 3, 2)], (8, 8, 6)))
    decoded = artifact.decode_mesh(payload)
    triangle = artifact.pick_triangle(decoded, (4.5, 3.5, 10.0), (0.0, 0.0, -1.0))
    assert triangle is not None and int(decoded["face_source_slice"][triangle]) == 2
    assert artifact.pick_triangle(decoded, (0.5, 0.5, 10.0), (0.0, 0.0, -1.0)) is None  # background: no navigation


def test_a_mask_with_no_foreground_has_no_surface():
    with pytest.raises(GeometryError) as raised:
        artifact.build_mesh_artifact(np.zeros((3, 4, 5), dtype=np.uint8))
    assert raised.value.code == "MASK_EMPTY"


def test_a_decimated_or_world_frame_mesh_is_not_served():
    mask = np.zeros((6, 6, 6), dtype=bool)
    mask[1:4, 1:4, 1:4] = True
    with pytest.raises(artifact.MeshArtifactError) as raised:
        artifact.encode_mesh(build_case_mesh(mask, level=2))
    assert raised.value.code == "LEVEL_NOT_SERVED"
    with pytest.raises(artifact.MeshArtifactError) as raised:
        artifact.encode_mesh(build_case_mesh(mask, 0, spacing=(0.5, 0.5, 2.0)))
    assert raised.value.code == "FRAME_NOT_VOXEL_INDEX"


def test_a_damaged_artifact_is_refused():
    payload, _ = artifact.build_mesh_artifact(volume_with([(1, 1, 1), (2, 1, 1)], (5, 5, 5)))
    artifact.read_header(payload)
    for broken, code in ((b"NOTMESH!" + payload[8:], "MESH_MAGIC"), (payload[:-4], "MESH_LENGTH"),
                         (payload + b"\x00\x00\x00\x00", "MESH_LENGTH"), (payload[:10], "MESH_MAGIC"),
                         (payload[:8] + struct.pack("<I", 4 * 10 ** 6) + payload[12:], "MESH_HEADER")):
        with pytest.raises(artifact.MeshArtifactError) as raised:
            artifact.read_header(broken)
        assert raised.value.code == code
    # a triangle that indexes past the vertices
    decoded = artifact.decode_mesh(payload)
    (length,) = struct.unpack_from("<I", payload, 8)
    offset = 12 + length + decoded["vertices"].nbytes
    offset += (-decoded["vertices"].nbytes) % 4
    tampered = bytearray(payload)
    struct.pack_into("<H", tampered, offset, 60000)
    with pytest.raises(artifact.MeshArtifactError) as raised:
        artifact.decode_mesh(bytes(tampered))
    assert raised.value.code == "MESH_INDEX"


def test_the_golden_artifact_is_byte_stable_and_carries_the_pick_cases_the_viewer_must_agree_with():
    """GOLDEN is read by mobile/test/v2_*.test.mjs too: the Python encoder and the JavaScript decoder agree on it."""
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    volume = volume_with([tuple(v) for v in golden["voxels_xyz"]], tuple(golden["shape_xyz"]))
    payload, info = artifact.build_mesh_artifact(volume)
    assert hashlib.sha256(payload).hexdigest() == golden["sha256"], "encoder output changed: regenerate the golden"
    assert base64.b64decode(golden["bytes_b64"]) == payload
    decoded = artifact.decode_mesh(payload)
    assert [info["vertex_count"], info["triangle_count"]] == [golden["vertex_count"], golden["triangle_count"]]
    for case in golden["picks"]:
        triangle = artifact.pick_triangle(decoded, case["origin"], case["direction"])
        assert (None if triangle is None else int(decoded["face_source_slice"][triangle])) == case["slice"], case
