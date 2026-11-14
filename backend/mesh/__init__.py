"""backend.mesh -- product surface mesh, pick -> slice and error geometry (V2-01, V2-03, INT-13).

Contract ``dr008a-dr012/v1.0.0`` (tests/fixtures/geometry/FORMAT.md). See
README.md in this directory. Built on Day 22 under the recovery override; owner
Vu Hung Anh adopts or rejects it on Day 23.

``slice_of_world`` is deliberately not re-exported here: ``geometry.slice_of_world``
takes (world, shape_xyz, spacing, origin) and ``surface.slice_of_world`` takes
(mesh_or_geometry, point). Import the one you mean from its module.
"""

from .error_geometry import (
    DEFAULT_CONNECTIVITY,
    build_error_geometry,
    error_geometry_sha256,
    error_geometry_to_dict,
)
from .geometry import (
    CONTRACT_VERSION,
    ERROR_CODES,
    GeometryError,
    VolumeGeometry,
    conformance_adapter,
    validate_axis_aligned,
    validate_contract_version,
    voxel_to_world,
    world_to_voxel,
)
from .surface import (
    DEFAULT_LEVEL,
    LEVEL_CELLS,
    CaseMesh,
    as_binary_mask,
    build_case_mesh,
    pick_slice,
)

__all__ = [
    "CONTRACT_VERSION", "ERROR_CODES", "GeometryError", "VolumeGeometry",
    "conformance_adapter", "validate_axis_aligned", "validate_contract_version",
    "voxel_to_world", "world_to_voxel",
    "DEFAULT_LEVEL", "LEVEL_CELLS", "CaseMesh", "as_binary_mask", "build_case_mesh", "pick_slice",
    "DEFAULT_CONNECTIVITY", "build_error_geometry", "error_geometry_sha256", "error_geometry_to_dict",
]
