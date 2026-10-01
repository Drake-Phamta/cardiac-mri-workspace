"""DR-005 candidate 3 skeleton: prediction surface + FP/FN component markers (V2-03)."""

from __future__ import annotations

import json

import numpy as np
import pytest

from backend.mesh import (
    CONTRACT_VERSION,
    CaseMesh,
    GeometryError,
    build_error_geometry,
    error_geometry_sha256,
    error_geometry_to_dict,
)

SHAPE = (20, 20, 16)
SPACING = (0.625, 0.75, 1.25)
ORIGIN = (-12.5, 7.25, -30.0)


def world_of(voxel_float):
    return [ORIGIN[i] + voxel_float[i] * SPACING[i] for i in range(3)]


def shifted_cube_case():
    """GT cube z 4..8; prediction = the same cube one slice up (z 5..9) + a separate 2x2x2 FP blob."""
    gt = np.zeros(SHAPE, dtype=bool)
    gt[5:10, 5:10, 4:9] = True
    pred = np.zeros(SHAPE, dtype=bool)
    pred[5:10, 5:10, 5:10] = True
    pred[14:16, 14:16, 2:4] = True
    return pred, gt


def build(pred, gt, **kwargs):
    kwargs.setdefault("spacing", SPACING)
    kwargs.setdefault("origin", ORIGIN)
    return build_error_geometry(pred, gt, **kwargs)


def test_shifted_cube_and_blob_give_exact_components():
    pred, gt = shifted_cube_case()
    result = build(pred, gt)
    comps = result["components"]

    assert [(c["id"], c["class"], c["voxel_count"]) for c in comps] == [
        ("FN_0001", "FN", 25), ("FP_0001", "FP", 25), ("FP_0002", "FP", 8)]
    fn, fp_layer, fp_blob = comps
    assert fn["bbox_voxel"] == {"lo": [5, 5, 4], "hi": [9, 9, 4]}
    assert fn["source_slice_range"] == [4, 4] and fn["slices"] == [4]
    assert fp_layer["bbox_voxel"] == {"lo": [5, 5, 9], "hi": [9, 9, 9]}
    assert fp_layer["source_slice_range"] == [9, 9] and fp_layer["slices"] == [9]
    assert fp_blob["bbox_voxel"] == {"lo": [14, 14, 2], "hi": [15, 15, 3]}
    assert fp_blob["source_slice_range"] == [2, 3] and fp_blob["slices"] == [2, 3]

    # Centroid of voxel CENTRES; marker = the member voxel centre nearest it.
    assert fn["centroid_world"] == pytest.approx(world_of((7.5, 7.5, 4.5)))
    assert fn["marker_voxel"] == [7, 7, 4] and fn["marker_slice"] == 4
    assert fn["marker_world"] == pytest.approx(world_of((7.5, 7.5, 4.5)))
    assert fp_blob["centroid_world"] == pytest.approx(world_of((15.0, 15.0, 3.0)))
    # All eight blob voxels are equidistant from that centroid: first in C order wins.
    assert fp_blob["marker_voxel"] == [14, 14, 2]
    assert fp_blob["marker_world"] == pytest.approx(world_of((14.5, 14.5, 2.5)))

    assert result["summary"] == {
        "pred_voxels": 133, "gt_voxels": 125, "tp_voxels": 100, "fp_voxels": 33, "fn_voxels": 25,
        "fp_components": 2, "fn_components": 1, "component_count": 3,
        "fp_slices": [2, 3, 9], "fn_slices": [4]}
    assert result["connectivity"] == 26 and result["class_order"] == ["FN", "FP"]
    assert result["geometry_contract_version"] == CONTRACT_VERSION
    assert result["geometry"]["shape"] == list(SHAPE)

    surface = result["surface"]
    assert isinstance(surface, CaseMesh) and result["surface_reason"] is None
    assert surface.level == 0 and surface.triangle_count == 2 * 6 * 25 + 2 * 6 * 4
    assert set(surface.face_source_slice.tolist()) == {2, 3, 5, 6, 7, 8, 9}


def test_error_geometry_is_deterministic():
    pred, gt = shifted_cube_case()
    first = error_geometry_sha256(build(pred, gt))
    assert first == error_geometry_sha256(build(pred, gt))
    assert first == error_geometry_sha256(build(np.asfortranarray(pred), np.asfortranarray(gt)))
    assert first == error_geometry_sha256(build(pred.astype(np.uint8) * 255, gt.astype(np.uint8)))
    other = pred.copy()
    other[0, 0, 0] = True
    assert first != error_geometry_sha256(build(other, gt))


@pytest.mark.parametrize("second_voxel, expected", [
    ((3, 3, 3), {6: 2, 18: 2, 26: 1}),   # touches (2, 2, 2) at a corner only
    ((3, 3, 2), {6: 2, 18: 1, 26: 1}),   # touches along an edge
    ((3, 2, 2), {6: 1, 18: 1, 26: 1}),   # shares a face
])
def test_connectivity_controls_how_diagonal_neighbours_group(second_voxel, expected):
    pred = np.zeros((6, 6, 6), dtype=bool)
    pred[2, 2, 2] = True
    pred[second_voxel] = True
    gt = np.zeros_like(pred)
    for connectivity, count in expected.items():
        result = build(pred, gt, connectivity=connectivity)
        assert result["connectivity"] == connectivity
        assert result["summary"]["fp_components"] == count
        assert sum(c["voxel_count"] for c in result["components"]) == 2


def test_default_connectivity_is_26():
    pred = np.zeros((6, 6, 6), dtype=bool)
    pred[2, 2, 2] = pred[3, 3, 3] = True
    assert build(pred, np.zeros_like(pred))["connectivity"] == 26


def test_marker_is_inside_a_non_convex_component():
    gt = np.zeros(SHAPE, dtype=bool)
    gt[2:9, 2:9, 6] = True
    gt[4:7, 4:7, 6] = False                 # a square ring: its centroid is in the hole
    result = build(np.zeros_like(gt), gt)
    (ring,) = result["components"]
    assert ring["class"] == "FN" and ring["voxel_count"] == 49 - 9
    assert ring["centroid_world"] == pytest.approx(world_of((5.5, 5.5, 6.5)))
    x, y, z = ring["marker_voxel"]
    assert gt[x, y, z], "the marker must be a voxel of the component"
    assert ring["marker_world"] == pytest.approx(world_of((x + 0.5, y + 0.5, z + 0.5)))
    # Nearest by WORLD distance: with y spacing 0.75 > x spacing 0.625 the
    # nearest ring voxels to (5.5, 5.5) are the ones offset along x.
    assert ring["marker_voxel"] == [3, 5, 6]


def test_empty_prediction_has_no_surface_but_still_has_components():
    _, gt = shifted_cube_case()
    result = build(np.zeros(SHAPE, dtype=bool), gt)
    assert result["surface"] is None and result["surface_reason"].startswith("MASK_EMPTY")
    (fn,) = result["components"]
    assert fn["class"] == "FN" and fn["voxel_count"] == 125
    assert fn["source_slice_range"] == [4, 8] and fn["slices"] == [4, 5, 6, 7, 8]

    empty = build(np.zeros(SHAPE, dtype=bool), np.zeros(SHAPE, dtype=bool))
    assert empty["surface"] is None and empty["components"] == []
    assert empty["summary"]["component_count"] == 0

    pred, _ = shifted_cube_case()
    only_fp = build(pred, np.zeros(SHAPE, dtype=bool))
    assert isinstance(only_fp["surface"], CaseMesh)
    assert [c["class"] for c in only_fp["components"]] == ["FP", "FP"]


def test_shape_and_geometry_mismatches_are_rejected():
    pred, gt = shifted_cube_case()
    with pytest.raises(GeometryError) as err:
        build(pred, gt[:, :, :-1])
    assert err.value.code == "GEOMETRY_MISMATCH"
    with pytest.raises(GeometryError) as err:
        build(pred, gt, gt_spacing=(0.625, 0.75, 1.5))
    assert err.value.code == "GEOMETRY_MISMATCH"
    with pytest.raises(GeometryError) as err:
        build(pred, gt, gt_origin=(0.0, 0.0, 0.0))
    assert err.value.code == "GEOMETRY_MISMATCH"
    same = build(pred, gt, gt_spacing=(0.625 + 1e-9, 0.75, 1.25), gt_origin=ORIGIN)
    assert same["summary"]["component_count"] == 3


@pytest.mark.parametrize("kwargs, code", [
    ({"connectivity": 8}, "CONNECTIVITY_UNSUPPORTED"),
    ({"connectivity": True}, "CONNECTIVITY_UNSUPPORTED"),
    ({"connectivity": 26.0}, "CONNECTIVITY_UNSUPPORTED"),
    ({"connectivity": "26"}, "CONNECTIVITY_UNSUPPORTED"),
    ({"level": 7}, "MESH_LEVEL_UNKNOWN"),
    ({"spacing": (0.0, 1.0, 1.0)}, "GEOMETRY_NOT_VALIDATED"),
    ({"contract_version": "dr008a-dr012/v2.0.0"}, "GEOMETRY_CONTRACT_VERSION_MISMATCH"),
])
def test_invalid_options_are_rejected(kwargs, code):
    pred, gt = shifted_cube_case()
    with pytest.raises(GeometryError) as err:
        build(pred, gt, **kwargs)
    assert err.value.code == code


def test_invalid_masks_are_rejected():
    pred, gt = shifted_cube_case()
    with pytest.raises(GeometryError) as err:
        build(pred.astype(np.uint8) * 2, gt)
    assert err.value.code == "MASK_NOT_BINARY"
    with pytest.raises(GeometryError) as err:
        build(pred[:, :, 0], gt[:, :, 0])
    assert err.value.code == "MASK_NOT_3D"


def test_component_meshes_are_level_0_in_the_case_frame():
    pred, gt = shifted_cube_case()
    result = build(pred, gt, include_component_meshes=True, level=2)
    assert result["surface"].level == 2 and result["level"] == 2
    fn, fp_layer, fp_blob = result["components"]
    for comp in result["components"]:
        mesh = comp["mesh"]
        assert isinstance(mesh, CaseMesh) and mesh.level == 0
        assert mesh.shape_xyz == SHAPE and mesh.spacing == SPACING and mesh.origin == ORIGIN
        assert set(mesh.face_source_slice.tolist()) == set(comp["slices"])
        assert mesh.foreground_voxels == comp["voxel_count"]
    assert fp_blob["mesh"].triangle_count == 2 * 6 * 4
    assert fn["mesh"].triangle_count == 2 * (2 * 25 + 4 * 5)
    lo = np.rint((fp_blob["mesh"].vertices_world - np.asarray(ORIGIN)) / np.asarray(SPACING))
    assert lo.min(axis=0).tolist() == [14, 14, 2] and lo.max(axis=0).tolist() == [16, 16, 4]
    assert build(pred, gt)["components"][0]["mesh"] is None


def test_to_dict_is_json_serialisable_with_and_without_mesh_arrays():
    pred, gt = shifted_cube_case()
    result = build(pred, gt, include_component_meshes=True)
    full = json.loads(json.dumps(error_geometry_to_dict(result)))
    assert full["surface"]["content_sha256"] == result["surface"].content_sha256()
    assert len(full["surface"]["triangles"]) == result["surface"].triangle_count
    assert full["components"][2]["mesh"]["triangle_count"] == 48
    light = json.loads(json.dumps(error_geometry_to_dict(result, include_mesh_arrays=False)))
    assert "triangles" not in light["surface"]
    assert light["surface"]["content_sha256"] == result["surface"].content_sha256()
    assert isinstance(result["surface"], CaseMesh), "the input result is not modified"


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_random_pairs_satisfy_the_component_invariants(seed):
    rng = np.random.default_rng(seed)
    gt = rng.random((12, 10, 8)) < 0.35
    pred = gt.copy()
    flip = rng.random(gt.shape) < 0.15
    pred[flip] = ~pred[flip]
    result = build(pred, gt, connectivity=6)
    comps = result["components"]
    summary = result["summary"]
    assert sum(c["voxel_count"] for c in comps if c["class"] == "FP") == summary["fp_voxels"] == int((pred & ~gt).sum())
    assert sum(c["voxel_count"] for c in comps if c["class"] == "FN") == summary["fn_voxels"] == int((gt & ~pred).sum())
    classes = [c["class"] for c in comps]
    assert classes == sorted(classes), "FN before FP"
    for cls in ("FN", "FP"):
        keys = [(-c["voxel_count"], c["source_slice_range"][0], c["bbox_voxel"]["lo"], c["bbox_voxel"]["hi"])
                for c in comps if c["class"] == cls]
        assert keys == sorted(keys)
        ids = [c["id"] for c in comps if c["class"] == cls]
        assert ids == [f"{cls}_{i:04d}" for i in range(1, len(ids) + 1)]
    region = {"FP": pred & ~gt, "FN": gt & ~pred}
    for c in comps:
        zmin, zmax = c["source_slice_range"]
        assert c["slices"] == sorted(set(c["slices"])) and c["slices"][0] == zmin and c["slices"][-1] == zmax
        assert zmin <= c["marker_slice"] <= zmax and c["marker_slice"] == c["marker_voxel"][2]
        assert region[c["class"]][tuple(c["marker_voxel"])]
        lo, hi = c["bbox_voxel"]["lo"], c["bbox_voxel"]["hi"]
        assert all(lo[i] <= c["marker_voxel"][i] <= hi[i] for i in range(3))
