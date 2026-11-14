"""Decimation levels: vertex clustering that keeps each face's source slice (V2-01, DR-008c)."""

from __future__ import annotations

import numpy as np
import pytest

from backend.mesh import DEFAULT_LEVEL, LEVEL_CELLS, build_case_mesh


def test_level_table_and_default():
    # The five levels Spike B measured on Day 22; DR-008c is undecided and
    # only level 0 kept real-mesh picking within +/-1 slice, hence the default.
    assert LEVEL_CELLS == {0: 1, 1: 1.25, 2: 2, 3: 4, 4: 8}
    assert DEFAULT_LEVEL == 0


def test_triangle_counts_reproduce_the_spike_b_table(canonical_fixture, blob_mask):
    """Same 48x40x24 blob as spikes/spike_b_3d/mesh/out/mesh_levels.json (origin/main f5aa763):
    6855 foreground voxels; triangles 5648 / 1448 / 356 at cells 1 / 2 / 4."""
    spacing, origin = canonical_fixture["spacing_xyz_mm"], canonical_fixture["origin_world_mm"]
    assert int(blob_mask.sum()) == 6855
    counts = {level: build_case_mesh(blob_mask, level, spacing=spacing, origin=origin).triangle_count
              for level in LEVEL_CELLS}
    assert counts[0] == 5648 and counts[2] == 1448 and counts[3] == 356
    assert counts[0] > counts[1] > counts[2] > counts[3] > counts[4] > 0


@pytest.mark.parametrize("level", [1, 2, 3, 4])
def test_surviving_triangles_keep_the_source_slice_of_their_original_face(canonical_fixture, blob_mask, level):
    spacing = np.asarray(canonical_fixture["spacing_xyz_mm"])
    origin = np.asarray(canonical_fixture["origin_world_mm"])
    m0 = build_case_mesh(blob_mask, 0, spacing=spacing, origin=origin)
    md = build_case_mesh(blob_mask, level, spacing=spacing, origin=origin)
    cell = LEVEL_CELLS[level]
    assert md.level == level and md.cluster_cell == cell
    assert md.triangle_count < m0.triangle_count

    # Independent clustering, written with a dict: key = round(lattice / cell).
    lattice0 = np.rint((m0.vertices_world - origin) / spacing)
    keys = [tuple(k) for k in np.round(lattice0 / cell).astype(np.int64).tolist()]
    members: dict = {}
    for vid, key in enumerate(keys):
        members.setdefault(key, []).append(vid)
    mean_world = {key: origin + lattice0[ids].mean(axis=0) * spacing for key, ids in members.items()}
    surviving = [t for t, tri in enumerate(m0.triangles.tolist())
                 if len({keys[v] for v in tri}) == 3]

    assert md.source_triangle.tolist() == surviving, "exactly the non-degenerate faces survive, in order"
    src = md.source_triangle
    assert np.array_equal(md.face_source_slice, m0.face_source_slice[src])
    assert np.array_equal(md.face_axis, m0.face_axis[src])
    assert np.array_equal(md.face_sign, m0.face_sign[src])
    for j, s in enumerate(src.tolist()):
        expected = np.array([mean_world[keys[v]] for v in m0.triangles[s].tolist()])
        assert np.allclose(md.vertices_world[md.triangles[j]], expected, rtol=0, atol=1e-9)


def test_every_level_is_deterministic(canonical_fixture, blob_mask):
    spacing, origin = canonical_fixture["spacing_xyz_mm"], canonical_fixture["origin_world_mm"]
    for level in LEVEL_CELLS:
        first = build_case_mesh(blob_mask, level, spacing=spacing, origin=origin)
        second = build_case_mesh(np.array(blob_mask, order="F"), level, spacing=spacing, origin=origin)
        assert first.content_sha256() == second.content_sha256()
        assert np.array_equal(first.triangles, second.triangles)
    hashes = {build_case_mesh(blob_mask, level, spacing=spacing, origin=origin).content_sha256()
              for level in LEVEL_CELLS}
    assert len(hashes) == len(LEVEL_CELLS), "levels are distinguishable by their hash"


def test_content_hash_covers_geometry_and_arrays(blob_mask):
    base = build_case_mesh(blob_mask, 0)
    assert base.content_sha256() != build_case_mesh(blob_mask, 0, spacing=(1.0, 1.0, 1.25)).content_sha256()
    assert base.content_sha256() != build_case_mesh(blob_mask, 0, origin=(0.0, 0.0, 1.0)).content_sha256()
    shifted = np.zeros_like(blob_mask)
    shifted[:, :, 1:] = blob_mask[:, :, :-1]
    assert base.content_sha256() != build_case_mesh(shifted, 0).content_sha256()
    assert len(base.content_sha256()) == 64
