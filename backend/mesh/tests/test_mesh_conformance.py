"""TC-MAINT-002 / INT-13: the canonical geometry fixture run THROUGH the product mesh.

The checker is the shared canonical one, spikes/spike_b_3d/harness/conformance.py
-- its documented purpose is that backend and mobile adapters run the same
checker on the same fixture. Only this test imports it (product code never
imports spikes/). The blob mask comes from the conftest copy of the checker's
occupancy formula; the checker does not share code with the product.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import numpy as np
import pytest

from backend.mesh import CONTRACT_VERSION, GeometryError, build_case_mesh, conformance_adapter, pick_slice
from backend.mesh import validate_contract_version

CONFORMANCE_HARNESS = Path(__file__).resolve().parents[3] / "spikes" / "spike_b_3d" / "harness"
EXPECTED_VERSION = "dr008a-dr012/v1.0.0"


@pytest.fixture(scope="module")
def checker():
    if str(CONFORMANCE_HARNESS) not in sys.path:
        sys.path.insert(0, str(CONFORMANCE_HARNESS))
    return importlib.import_module("conformance")


@pytest.fixture(scope="module")
def adapter(canonical_fixture, blob_mask):
    return conformance_adapter(blob_mask, canonical_fixture["spacing_xyz_mm"],
                               canonical_fixture["origin_world_mm"], level=0,
                               space_directions=canonical_fixture["space_directions"])


def test_canonical_fixture_passes_exactly_through_product_code(checker, canonical_fixture, adapter):
    assert len(canonical_fixture["points"]) == 33
    assert len(canonical_fixture["picking_rays"]) == 13
    findings = checker.check_fixture(canonical_fixture, adapter,
                                     expected_contract_version=EXPECTED_VERSION)
    assert [str(f) for f in findings] == []


def test_every_canonical_ray_resolves_exactly_through_the_mesh(canonical_fixture, adapter):
    mesh = adapter["mesh"]
    assert mesh.level == 0 and mesh.geometry_contract_version == canonical_fixture["geometry_contract_version"]
    for ray in canonical_fixture["picking_rays"]:
        hit = pick_slice(mesh, ray["origin_world"], ray["direction_world"])
        assert hit is not None, ray["id"]
        assert hit["slice_index"] == ray["expected_slice_index"], (ray["id"], ray["group"], hit)
        assert adapter["slice_of_ray"](ray["origin_world"], ray["direction_world"]) == ray["expected_slice_index"]


def test_version_mismatch_is_a_finding_and_a_product_rejection(checker, canonical_fixture, adapter):
    findings = checker.check_fixture(canonical_fixture, adapter,
                                     expected_contract_version="dr008a-dr012/v1.0.1")
    assert [f.kind for f in findings] == ["contract_version_mismatch"]
    changed = dict(canonical_fixture, geometry_contract_version="dr008a-dr012/v1.0.1")
    findings = checker.check_fixture(changed, adapter, expected_contract_version=EXPECTED_VERSION)
    assert "contract_version_mismatch" in [f.kind for f in findings]
    with pytest.raises(GeometryError) as err:
        validate_contract_version(changed["geometry_contract_version"], CONTRACT_VERSION)
    assert err.value.code == "GEOMETRY_CONTRACT_VERSION_MISMATCH"


def test_generic_rays_agree_with_the_checkers_reference_dda(checker, canonical_fixture, adapter):
    """Product mesh pick vs the checker's own DDA over the same blob (independent code)."""
    reference = checker.reference_impl(canonical_fixture)["slice_of_ray"]
    mesh = adapter["mesh"]
    shape = np.asarray(canonical_fixture["shape_xyz"], dtype=float)
    spacing = np.asarray(canonical_fixture["spacing_xyz_mm"])
    origin = np.asarray(canonical_fixture["origin_world_mm"])
    rng = np.random.default_rng(20261001)
    hits = 0
    for _ in range(300):
        towards = rng.normal(size=3)
        towards /= np.linalg.norm(towards)
        start_voxel = shape / 2 - towards * shape.max() * 2 + rng.uniform(-2, 2, size=3)
        target_voxel = rng.uniform(0, shape)
        o = origin + start_voxel * spacing
        d = (target_voxel - start_voxel) * spacing
        expected = reference(o.tolist(), d.tolist())
        got = pick_slice(mesh, o, d)
        assert (None if got is None else got["slice_index"]) == expected, (o.tolist(), d.tolist())
        hits += expected is not None
    assert hits > 50


def test_lattice_aligned_rays_follow_the_half_open_rule_like_the_reference(checker, canonical_fixture, adapter):
    """Rays lying exactly in lattice planes / on lattice lines -- the canonical
    interior rays are of this kind -- resolve exactly as the checker's DDA does."""
    reference = checker.reference_impl(canonical_fixture)["slice_of_ray"]
    mesh = adapter["mesh"]
    shape = canonical_fixture["shape_xyz"]
    spacing = np.asarray(canonical_fixture["spacing_xyz_mm"])
    origin = np.asarray(canonical_fixture["origin_world_mm"])
    checked = 0
    for axis in range(3):
        a, b = (axis + 1) % 3, (axis + 2) % 3
        for sign in (-1, 1):
            for ca in range(0, shape[a] + 1, 3):
                for cb in range(0, shape[b] + 1, 2):
                    start = np.zeros(3)
                    start[axis] = -2.0 if sign > 0 else shape[axis] + 2.0
                    start[a], start[b] = ca, cb
                    d = np.zeros(3)
                    d[axis] = sign * spacing[axis]
                    o = origin + start * spacing
                    expected = reference(o.tolist(), d.tolist())
                    got = pick_slice(mesh, o, d)
                    assert (None if got is None else got["slice_index"]) == expected, (axis, sign, ca, cb)
                    checked += 1
    assert checked > 500


def test_adapter_slice_of_ray_never_navigates_on_a_miss(adapter, canonical_fixture):
    origin = canonical_fixture["origin_world_mm"]
    assert adapter["slice_of_ray"]([origin[0] - 50.0, origin[1], origin[2]], [-1.0, 0.0, 0.0]) is None


def test_adapter_works_at_every_level_but_only_level_0_is_exact_by_contract(canonical_fixture, blob_mask):
    # Decimated levels move vertices (B5 bound +/-1 slice, DR-008c undecided);
    # the adapter still builds and resolves, and level 0 is the one that is exact.
    for level in (1, 2, 3, 4):
        adapter = conformance_adapter(blob_mask, canonical_fixture["spacing_xyz_mm"],
                                      canonical_fixture["origin_world_mm"], level=level)
        assert adapter["mesh"].level == level
        for ray in canonical_fixture["picking_rays"]:
            got = adapter["slice_of_ray"](ray["origin_world"], ray["direction_world"])
            assert got is not None and 0 <= got < blob_mask.shape[2]
    assert build_case_mesh(blob_mask, shape_xyz=blob_mask.shape).level == 0
