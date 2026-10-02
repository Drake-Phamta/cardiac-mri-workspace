"""Canonical transform as product code: floor, reject (never clamp), exact version, DR-012."""

from __future__ import annotations

import math

import numpy as np
import pytest
import json
from pathlib import Path

from backend.mesh import (
    CONTRACT_VERSION,
    ERROR_CODES,
    GeometryError,
    VolumeGeometry,
    build_case_mesh,
    conformance_adapter,
    validate_axis_aligned,
    validate_contract_version,
    voxel_to_world,
    world_to_voxel,
)
from backend.mesh import geometry as geometry_module
from backend.mesh import surface as surface_module

SHAPE = (48, 40, 24)
SPACING = (0.625, 0.75, 1.25)
ORIGIN = (-12.5, 7.25, -30.0)


@pytest.fixture()
def geom():
    return VolumeGeometry(SHAPE, SPACING, ORIGIN)


def test_contract_version_constant_is_the_canonical_one(canonical_fixture):
    assert CONTRACT_VERSION == "dr008a-dr012/v1.0.0"
    assert canonical_fixture["geometry_contract_version"] == CONTRACT_VERSION
    api_contract = json.loads((Path(__file__).resolve().parents[3] / "contracts/api/contract.json").read_text())
    assert api_contract["geometry_contract"]["version"] == CONTRACT_VERSION


def test_transform_matches_the_fixture_points(canonical_fixture, geom):
    for point in canonical_fixture["points"]:
        assert geom.voxel_to_world(point["voxel_xyz"]) == pytest.approx(point["world_xyz"], abs=1e-12)
        assert geom.world_to_voxel(point["world_xyz"]) == pytest.approx(point["voxel_xyz"], abs=1e-12)
        assert voxel_to_world(point["voxel_xyz"], SPACING, ORIGIN) == geom.voxel_to_world(point["voxel_xyz"])
        assert world_to_voxel(point["world_xyz"], SPACING, ORIGIN) == geom.world_to_voxel(point["world_xyz"])
        resolved = geom.slice_of_world(point["world_xyz"])
        if not point["in_range"]:
            assert resolved is None, point["id"]
        elif point["expected_slice_index"] is None:
            assert resolved == math.floor(point["voxel_xyz"][2]), point["id"]
        else:
            assert resolved == point["expected_slice_index"], point["id"]


def voxel_point(geom, x, y, z):
    return geom.voxel_to_world((x, y, z))


def test_floor_rule_and_half_open_cells(geom):
    assert geom.slice_of_world(voxel_point(geom, 3, 3, 7.5)) == 7       # not round-to-nearest
    assert geom.slice_of_world(voxel_point(geom, 3, 3, 7.999999)) == 7
    assert geom.slice_of_world(voxel_point(geom, 3, 3, 8.0)) == 8       # boundary belongs above
    assert geom.slice_of_world(voxel_point(geom, 3, 3, 0.0)) == 0
    assert geom.slice_of_world(voxel_point(geom, 3, 3, 23.999)) == 23
    assert geom.voxel_of_world(voxel_point(geom, 47.5, 0.25, 23.5)) == (47, 0, 23)


@pytest.mark.parametrize("voxel", [
    (3, 3, -0.001), (3, 3, -0.5), (3, 3, 24.0), (3, 3, 24.3), (3, 3, 1000.0),
    (-0.01, 3, 5), (48.0, 3, 5), (3, -1, 5), (3, 40.0, 5),
])
def test_out_of_range_is_rejected_never_clamped(geom, voxel):
    assert geom.slice_of_world(voxel_point(geom, *voxel)) is None
    assert geom.voxel_of_world(voxel_point(geom, *voxel)) is None
    assert geometry_module.slice_of_world(voxel_point(geom, *voxel), SHAPE, SPACING, ORIGIN) is None


def test_malformed_points_raise(geom):
    for bad in [(float("nan"), 0.0, 0.0), (0.0, float("inf"), 0.0), (1.0, 2.0), "here", None]:
        with pytest.raises(GeometryError) as err:
            geom.slice_of_world(bad)
        assert err.value.code == "POINT_INVALID"


def test_surface_slice_of_world_accepts_mesh_geometry_and_mappings(canonical_fixture, geom):
    mask = np.zeros(SHAPE, dtype=bool)
    mask[10, 10, 10] = True
    mesh = build_case_mesh(mask, spacing=SPACING, origin=ORIGIN, shape_xyz=mask.shape)
    point = voxel_point(geom, 10.5, 10.5, 12.5)
    for source in (mesh, geom, mesh.to_dict(), mesh.to_dict()["geometry"], canonical_fixture):
        assert surface_module.slice_of_world(source, point) == 12
    with pytest.raises(GeometryError) as err:
        surface_module.slice_of_world({"shape": list(SHAPE), "spacing": list(SPACING),
                                       "origin": list(ORIGIN)}, point)
    assert err.value.code == "GEOMETRY_CONTRACT_VERSION_MISSING"
    with pytest.raises(TypeError):
        surface_module.slice_of_world([1, 2, 3], point)


def test_contract_version_is_compared_by_exact_string_equality():
    assert validate_contract_version("dr008a-dr012/v1.0.0") == "dr008a-dr012/v1.0.0"
    for found in ["dr008a-dr012/v1.0.1", "dr008a-dr012/v1.1.0", " dr008a-dr012/v1.0.0",
                  "dr008a-dr012/v1.0.0 ", "DR008A-DR012/V1.0.0", "dr008a-dr012/v1"]:
        with pytest.raises(GeometryError) as err:
            validate_contract_version(found, "dr008a-dr012/v1.0.0")
        assert err.value.code == "GEOMETRY_CONTRACT_VERSION_MISMATCH"
    for found in [None, "", 1.0, b"dr008a-dr012/v1.0.0"]:
        with pytest.raises(GeometryError) as err:
            validate_contract_version(found, "dr008a-dr012/v1.0.0")
        assert err.value.code == "GEOMETRY_CONTRACT_VERSION_MISSING"
    with pytest.raises(GeometryError) as err:
        VolumeGeometry(SHAPE, SPACING, ORIGIN, "dr008a-dr012/v1.0.1")
    assert err.value.code == "GEOMETRY_CONTRACT_VERSION_MISMATCH"


def test_axis_aligned_directions_are_accepted(canonical_fixture):
    assert validate_axis_aligned(canonical_fixture["space_directions"]) == SPACING
    nearly = [[0.625, 1e-9, 0.0], [0.0, 0.75, 0.0], [0.0, 0.0, 1.25]]       # within Contract 1's 1e-6
    assert validate_axis_aligned(nearly) == SPACING


@pytest.mark.parametrize("directions", [
    [[0.5, 0.5, 0.0], [-0.5, 0.5, 0.0], [0.0, 0.0, 1.25]],      # rotated 45 degrees about z
    [[0.625, 0.01, 0.0], [0.0, 0.75, 0.0], [0.0, 0.0, 1.25]],   # slightly oblique
    [[-0.625, 0.0, 0.0], [0.0, 0.75, 0.0], [0.0, 0.0, 1.25]],   # flipped x
    [[0.625, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 1.25]],     # degenerate axis
    [[0.625, 0.0], [0.0, 0.75]],                                 # not 3x3
    [[0.625, 0.0, 0.0], [0.0, float("nan"), 0.0], [0.0, 0.0, 1.25]],
    "identity",
])
def test_non_axis_aligned_geometry_is_not_validated(directions):
    with pytest.raises(GeometryError) as err:
        validate_axis_aligned(directions)
    assert err.value.code == "GEOMETRY_NOT_VALIDATED"


def test_conformance_adapter_rejects_oblique_or_inconsistent_directions():
    mask = np.zeros((4, 4, 4), dtype=bool)
    mask[1, 1, 1] = True
    oblique = [[0.5, 0.5, 0.0], [-0.5, 0.5, 0.0], [0.0, 0.0, 1.25]]
    with pytest.raises(GeometryError) as err:
        conformance_adapter(mask, SPACING, ORIGIN, space_directions=oblique)
    assert err.value.code == "GEOMETRY_NOT_VALIDATED"
    other_spacing = [[1.0, 0.0, 0.0], [0.0, 0.75, 0.0], [0.0, 0.0, 1.25]]
    with pytest.raises(GeometryError) as err:
        conformance_adapter(mask, SPACING, ORIGIN, space_directions=other_spacing)
    assert err.value.code == "GEOMETRY_MISMATCH"


@pytest.mark.parametrize("spacing, origin", [
    ((0.0, 1.0, 1.0), ORIGIN), ((1.0, -2.0, 1.0), ORIGIN), ((1.0, 1.0, float("inf")), ORIGIN),
    (SPACING, (0.0, float("nan"), 0.0)), ((1.0, 1.0), ORIGIN), (SPACING, None),
])
def test_volume_geometry_rejects_invalid_spacing_and_origin(spacing, origin):
    with pytest.raises(GeometryError) as err:
        VolumeGeometry(SHAPE, spacing, origin)
    assert err.value.code == "GEOMETRY_NOT_VALIDATED"


@pytest.mark.parametrize("shape", [(0, 4, 4), (4, 4), (4, 4, 4.5), (4, -1, 4), "abc"])
def test_volume_geometry_rejects_invalid_shapes(shape):
    with pytest.raises(GeometryError) as err:
        VolumeGeometry(shape, SPACING, ORIGIN)
    assert err.value.code == "GEOMETRY_NOT_VALIDATED"


def test_geometry_error_is_a_value_error_with_a_known_code():
    err = GeometryError("MASK_EMPTY", "nothing there")
    assert isinstance(err, ValueError) and err.code == "MASK_EMPTY" and "MASK_EMPTY" in str(err)
    assert set(ERROR_CODES) >= {"GEOMETRY_NOT_VALIDATED", "GEOMETRY_MISMATCH", "MASK_EMPTY", "MASK_NOT_3D"}
    with pytest.raises(ValueError):
        GeometryError("NOT_A_CODE", "unknown codes are a programming error")


def test_geometry_to_dict_uses_api_contract_field_names(geom):
    assert geom.to_dict() == {
        "geometry_contract_version": CONTRACT_VERSION, "shape": list(SHAPE),
        "index_convention": "x=column,y=row,z=slice", "spacing": list(SPACING),
        "origin": list(ORIGIN), "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1]}
