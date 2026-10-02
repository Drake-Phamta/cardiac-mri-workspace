"""Canonical DR-008a / DR-012 geometry as product code (V2-01, INT-13).

Contract ``dr008a-dr012/v1.0.0`` -- tests/fixtures/geometry/FORMAT.md, owner
Vu Hung Anh (DR-013). This module is the backend's single implementation of
that contract; ``surface.py`` and ``error_geometry.py`` go through it instead
of re-deriving the transform.

    voxel (x, y, z)  x = source column, y = source row, z = source slice index
    arrays           indexed mask[x, y, z]; shape_xyz = [Nx, Ny, Nz]
    voxel_to_world   world[i] = origin[i] + voxel[i] * spacing[i]
    world_to_voxel   voxel[i] = (world[i] - origin[i]) / spacing[i]
    cells            voxel k occupies the half-open interval [k, k + 1)
    world -> slice   floor; a point outside the volume is REJECTED (None),
                     never clamped to the nearest slice
    profile          validated axis-aligned geometry only (DR-012); anything
                     else is GEOMETRY_NOT_VALIDATED

Every geometry-bearing output carries ``geometry_contract_version``. A consumer
compares it with the version it was built for by exact string equality
(``validate_contract_version``); a missing or different value is rejected, never
coerced to a "compatible" one (TC-REL-003).

The floor rule uses the same ``FLOOR_EPS = 1e-9`` voxel guard as the reference
adapter in spikes/spike_b_3d/harness/conformance.py: it absorbs the
representation error of ``(world - origin) / spacing`` for a point that lies on
a cell boundary (``origin + k * spacing`` can divide back to ``k - 4e-16``).
It is a numerical guard, not a tolerance on slices.

QA-002 caveat (FORMAT.md): the LASC headers carry default spacing 1 / origin 0,
so for that source "world" means voxel index through a default affine, not
validated millimetres. This module computes in whatever frame it is given; it
does not decide ``geometry_validation_status`` -- the API layer does.

Built on Day 22 (2026-10-01) under the Day 22 recovery override; V2-01 owner
Vu Hung Anh adopts or rejects it on Day 23.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.geometry_contract import GEOMETRY_CONTRACT_VERSION

CONTRACT_VERSION = GEOMETRY_CONTRACT_VERSION
# Spelling used by API contract 11 (contracts/api/generate_fixture.py).
INDEX_CONVENTION = "x=column,y=row,z=slice"

FLOOR_EPS = 1e-9
# Same tolerance as Contract 1's EPSILON (contracts/ingestion/contract1_raw_dataset/
# validate_contract1.py): direction cosines and geometry equality are compared
# with it, so a header Contract 1 accepted is not rejected here, and vice versa.
GEOMETRY_EPS = 1e-6

# --- error codes ------------------------------------------------------------
GEOMETRY_NOT_VALIDATED = "GEOMETRY_NOT_VALIDATED"
GEOMETRY_MISMATCH = "GEOMETRY_MISMATCH"
GEOMETRY_CONTRACT_VERSION_MISSING = "GEOMETRY_CONTRACT_VERSION_MISSING"
GEOMETRY_CONTRACT_VERSION_MISMATCH = "GEOMETRY_CONTRACT_VERSION_MISMATCH"
MASK_NOT_3D = "MASK_NOT_3D"
MASK_NOT_BINARY = "MASK_NOT_BINARY"
MASK_EMPTY = "MASK_EMPTY"
MESH_LEVEL_UNKNOWN = "MESH_LEVEL_UNKNOWN"
CONNECTIVITY_UNSUPPORTED = "CONNECTIVITY_UNSUPPORTED"
POINT_INVALID = "POINT_INVALID"
RAY_INVALID = "RAY_INVALID"

ERROR_CODES: dict[str, str] = {
    GEOMETRY_NOT_VALIDATED: "spacing, origin or direction outside the validated "
                            "axis-aligned profile (DR-012)",
    GEOMETRY_MISMATCH: "two geometries that must agree do not (pred vs gt, mask "
                       "shape vs declared shape, direction diagonal vs spacing)",
    GEOMETRY_CONTRACT_VERSION_MISSING: "geometry_contract_version absent or not a "
                                       "non-empty string",
    GEOMETRY_CONTRACT_VERSION_MISMATCH: "geometry_contract_version differs from the "
                                        "expected version (exact string equality)",
    MASK_NOT_3D: "mask is not a non-empty 3-D array",
    MASK_NOT_BINARY: "mask values are not {0, 1} or {0, 255} (or bool)",
    MASK_EMPTY: "mask has no foreground voxel, so there is no surface",
    MESH_LEVEL_UNKNOWN: "level is not a key of LEVEL_CELLS",
    CONNECTIVITY_UNSUPPORTED: "connectivity is not 6, 18 or 26",
    POINT_INVALID: "a coordinate triple is malformed or non-finite",
    RAY_INVALID: "a ray origin/direction is malformed, non-finite or zero",
}


class GeometryError(ValueError):
    """Rejected input. ``code`` is one of ``ERROR_CODES`` (stable, machine-readable)."""

    def __init__(self, code: str, message: str) -> None:
        if code not in ERROR_CODES:
            raise ValueError(f"unknown GeometryError code {code!r}")
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


# --- small validators shared by the package ---------------------------------

def _vec3(value: Any, name: str, *, code: str = GEOMETRY_NOT_VALIDATED,
          positive: bool = False) -> tuple[float, float, float]:
    """Three finite floats (strictly positive when ``positive``), or GeometryError(code)."""
    try:
        arr = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError):
        raise GeometryError(code, f"{name} must be three numbers; got {value!r}") from None
    if arr.shape != (3,):
        raise GeometryError(code, f"{name} must be three numbers; got shape {arr.shape}")
    if not np.all(np.isfinite(arr)):
        raise GeometryError(code, f"{name} must be finite; got {arr.tolist()}")
    if positive and not np.all(arr > 0):
        raise GeometryError(code, f"{name} must be strictly positive; got {arr.tolist()}")
    return (float(arr[0]), float(arr[1]), float(arr[2]))


def _shape3(value: Any) -> tuple[int, int, int]:
    try:
        if isinstance(value, (str, bytes)):
            raise TypeError("a string is not a shape")
        items = [int(v) for v in value]
        exact = all(float(v) == float(i) for v, i in zip(value, items))
    except (TypeError, ValueError):
        raise GeometryError(GEOMETRY_NOT_VALIDATED,
                            f"shape_xyz must be three positive integers; got {value!r}") from None
    if len(items) != 3 or not exact or any(n < 1 for n in items):
        raise GeometryError(GEOMETRY_NOT_VALIDATED,
                            f"shape_xyz must be three positive integers; got {value!r}")
    return (items[0], items[1], items[2])


def _close(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=GEOMETRY_EPS, abs_tol=GEOMETRY_EPS)


# --- contract identity ------------------------------------------------------

def validate_contract_version(found: Any, expected: str = CONTRACT_VERSION) -> str:
    """Return ``found`` if it is exactly ``expected``; raise otherwise.

    No normalisation (no strip, no case folding, no semantic-version range):
    FORMAT.md requires whole-string equality, and even a compatible MINOR bump
    is a mismatch until the consumer is deliberately updated.
    """
    if not isinstance(expected, str) or not expected:
        raise GeometryError(GEOMETRY_CONTRACT_VERSION_MISSING,
                            "the consumer's expected contract version must be a non-empty string")
    if not isinstance(found, str) or not found:
        raise GeometryError(
            GEOMETRY_CONTRACT_VERSION_MISSING,
            f"geometry_contract_version is missing or not a non-empty string (got {found!r}); "
            "reject before using coordinates (TC-REL-003)")
    if found != expected:
        raise GeometryError(
            GEOMETRY_CONTRACT_VERSION_MISMATCH,
            f"geometry_contract_version is {found!r}; this consumer expects {expected!r}. "
            "Exact string equality; no compatible-version coercion (TC-REL-003)")
    return found


def validate_axis_aligned(space_directions: Any) -> tuple[float, float, float]:
    """Check an NRRD-style direction matrix (row i = index axis i); return its spacing.

    Accepted: off-diagonal direction cosines within GEOMETRY_EPS of zero and a
    strictly positive diagonal. Rejected with GEOMETRY_NOT_VALIDATED: oblique or
    rotated matrices (DR-012), degenerate rows, and flipped axes -- the v1.0.0
    transform ``world = origin + voxel * spacing`` has no direction term, so a
    negative diagonal cannot be represented without a MAJOR contract change.
    """
    try:
        m = np.asarray(space_directions, dtype=np.float64)
    except (TypeError, ValueError):
        raise GeometryError(GEOMETRY_NOT_VALIDATED,
                            f"space_directions must be a 3x3 numeric matrix; got {space_directions!r}") from None
    if m.shape != (3, 3) or not np.all(np.isfinite(m)):
        raise GeometryError(GEOMETRY_NOT_VALIDATED,
                            f"space_directions must be a finite 3x3 matrix; got {m.tolist()}")
    norms = np.sqrt(np.sum(m * m, axis=1))
    if np.any(norms <= 0.0):
        raise GeometryError(GEOMETRY_NOT_VALIDATED, "space_directions has a zero-length axis")
    cosines = m / norms[:, None]
    off_diagonal = np.abs(cosines[~np.eye(3, dtype=bool)])
    if np.any(off_diagonal > GEOMETRY_EPS):
        raise GeometryError(
            GEOMETRY_NOT_VALIDATED,
            f"direction matrix is not axis-aligned (largest off-diagonal cosine "
            f"{float(off_diagonal.max()):.3g}); DR-012 supports validated axis-aligned "
            "geometry only")
    diagonal = np.diag(m)
    if np.any(diagonal <= 0.0):
        raise GeometryError(
            GEOMETRY_NOT_VALIDATED,
            f"direction matrix flips an axis (diagonal {diagonal.tolist()}); contract "
            f"{CONTRACT_VERSION} has no direction term, so a flipped axis is not supported")
    return (float(diagonal[0]), float(diagonal[1]), float(diagonal[2]))


def validate_spacing_directions(spacing: Any, space_directions: Any = None) -> tuple[float, float, float]:
    """Validate spacing against the source direction matrix when provided.

    Omitting directions means the caller uses the contract's canonical
    positive diagonal frame. Header-backed API paths must pass the matrix.
    """
    declared = _vec3(spacing, "spacing", positive=True)
    directions = np.diag(declared) if space_directions is None else space_directions
    derived = validate_axis_aligned(directions)
    if any(not _close(got, want) for got, want in zip(derived, declared)):
        raise GeometryError(
            GEOMETRY_MISMATCH,
            f"space_directions imply spacing {list(derived)} but spacing is {list(declared)}")
    return declared


# --- the transform ----------------------------------------------------------

@dataclass(frozen=True)
class VolumeGeometry:
    """Validated volume geometry under one exact contract version."""

    shape_xyz: tuple[int, int, int]
    spacing: tuple[float, float, float]
    origin: tuple[float, float, float]
    geometry_contract_version: str = CONTRACT_VERSION

    def __post_init__(self) -> None:
        object.__setattr__(self, "shape_xyz", _shape3(self.shape_xyz))
        object.__setattr__(self, "spacing", _vec3(self.spacing, "spacing", positive=True))
        object.__setattr__(self, "origin", _vec3(self.origin, "origin"))
        # This code implements exactly one contract; labelling its output with
        # any other version would be a false claim.
        validate_contract_version(self.geometry_contract_version, CONTRACT_VERSION)

    def voxel_to_world(self, voxel: Any) -> list[float]:
        v = _vec3(voxel, "voxel", code=POINT_INVALID)
        return [self.origin[i] + v[i] * self.spacing[i] for i in range(3)]

    def world_to_voxel(self, world: Any) -> list[float]:
        w = _vec3(world, "world", code=POINT_INVALID)
        return [(w[i] - self.origin[i]) / self.spacing[i] for i in range(3)]

    def voxel_of_world(self, world: Any) -> tuple[int, int, int] | None:
        """Containing voxel by the floor rule, or None outside the volume (never clamped)."""
        v = self.world_to_voxel(world)
        idx = [math.floor(v[i] + FLOOR_EPS) for i in range(3)]
        for i in range(3):
            if idx[i] < 0 or idx[i] >= self.shape_xyz[i]:
                return None
        return (idx[0], idx[1], idx[2])

    def slice_of_world(self, world: Any) -> int | None:
        """Source slice of a world POINT (floor rule), or None outside the volume.

        For a 3-D PICK use the picked triangle's ``face_source_slice`` instead:
        the +z face of voxel k lies on z = k + 1, where this rule gives k + 1.
        """
        cell = self.voxel_of_world(world)
        return None if cell is None else cell[2]

    def to_dict(self) -> dict[str, Any]:
        """Geometry block with API contract 11 field names (plus the exact version)."""
        return {
            "geometry_contract_version": self.geometry_contract_version,
            "shape": list(self.shape_xyz),
            "index_convention": INDEX_CONVENTION,
            "spacing": list(self.spacing),
            "origin": list(self.origin),
            "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1],
        }


def voxel_to_world(voxel: Any, spacing: Any, origin: Any) -> list[float]:
    s = _vec3(spacing, "spacing", positive=True)
    o = _vec3(origin, "origin")
    v = _vec3(voxel, "voxel", code=POINT_INVALID)
    return [o[i] + v[i] * s[i] for i in range(3)]


def world_to_voxel(world: Any, spacing: Any, origin: Any) -> list[float]:
    s = _vec3(spacing, "spacing", positive=True)
    o = _vec3(origin, "origin")
    w = _vec3(world, "world", code=POINT_INVALID)
    return [(w[i] - o[i]) / s[i] for i in range(3)]


def slice_of_world(world: Any, shape_xyz: Any, spacing: Any, origin: Any) -> int | None:
    """Floor rule; None for a point outside the volume on ANY axis (never clamped)."""
    return VolumeGeometry(shape_xyz, spacing, origin).slice_of_world(world)


# --- TC-MAINT-002 adapter ---------------------------------------------------

def conformance_adapter(mask: Any, spacing: Any, origin: Any, level: int = 0, *,
                        space_directions: Any = None,
                        contract_version: str = CONTRACT_VERSION) -> dict[str, Any]:
    """The implementation mapping ``conformance.check_fixture`` expects, built from product code.

    ``slice_of_ray`` goes THROUGH the product mesh: ``build_case_mesh(mask, level)``
    once, then ``pick_slice(...)['slice_index']`` per ray (None on a miss). The
    other three members are this module's transform for ``mask.shape``.

    When ``space_directions`` is given it must be axis-aligned (else
    GEOMETRY_NOT_VALIDATED) and its diagonal must equal ``spacing`` (else
    GEOMETRY_MISMATCH). The built mesh is returned under ``"mesh"`` for
    diagnostics; the checker ignores extra keys.
    """
    spacing_t = _vec3(spacing, "spacing", positive=True)
    if space_directions is not None:
        diagonal = validate_axis_aligned(space_directions)
        if not all(_close(a, b) for a, b in zip(diagonal, spacing_t)):
            raise GeometryError(GEOMETRY_MISMATCH,
                                f"space_directions diagonal {list(diagonal)} != spacing {list(spacing_t)}")
    # Imported here: surface.py imports this module.
    from .surface import build_case_mesh, pick_slice

    mesh = build_case_mesh(mask, level, spacing=spacing_t, origin=origin,
                           contract_version=contract_version, shape_xyz=mask.shape,
                           space_directions=space_directions)
    geometry = mesh.geometry

    def slice_of_ray(origin_world: Any, direction_world: Any) -> int | None:
        hit = pick_slice(mesh, origin_world, direction_world)
        return None if hit is None else hit["slice_index"]

    adapter: dict[str, Any] = {
        "voxel_to_world": geometry.voxel_to_world,
        "world_to_voxel": geometry.world_to_voxel,
        "slice_of_world": geometry.slice_of_world,
        "slice_of_ray": slice_of_ray,
        "mesh": mesh,
    }
    return adapter


__all__ = [
    "CONTRACT_VERSION", "INDEX_CONVENTION", "FLOOR_EPS", "GEOMETRY_EPS", "ERROR_CODES",
    "GeometryError", "VolumeGeometry", "validate_contract_version", "validate_axis_aligned",
    "voxel_to_world", "world_to_voxel", "slice_of_world", "conformance_adapter",
    "GEOMETRY_NOT_VALIDATED", "GEOMETRY_MISMATCH", "GEOMETRY_CONTRACT_VERSION_MISSING",
    "GEOMETRY_CONTRACT_VERSION_MISMATCH", "MASK_NOT_3D", "MASK_NOT_BINARY", "MASK_EMPTY",
    "MESH_LEVEL_UNKNOWN", "CONNECTIVITY_UNSUPPORTED", "POINT_INVALID", "RAY_INVALID",
]
