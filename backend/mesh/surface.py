"""Exact voxel-face surface mesh with a per-face source slice (V2-01; PR-3D-01, PR-3D-04).

STATUS
    Built on Day 22 (2026-10-01) under the Day 22 recovery override
    (management/day22/RECOVERY_OVERRIDE_DAY22.md, item A4). V2-01 owner
    Vu Hung Anh adopts or rejects it on Day 23.

WHAT IT BUILDS
    ``build_case_mesh(mask, level)`` turns a binary mask indexed mask[x, y, z]
    into a triangle mesh in world coordinates under contract
    ``dr008a-dr012/v1.0.0`` (see geometry.py). At level 0 the mesh is EXACTLY the
    set of voxel faces that separate a foreground voxel from a background voxel
    or from the volume border: every vertex is an integer lattice corner,
    shared corners are one vertex, each face is two triangles wound so the
    normal points from foreground to background. The surface is closed.

WHY VOXEL FACES AND NOT MARCHING CUBES
    DAY20 row V2-01 names Marching Cubes. This module deliberately keeps the
    spike's exact voxel faces (spikes/spike_b_3d/mesh/build_mesh.py explains
    why): every surface point lies on a cell boundary, so the source slice of
    each face is unambiguous and picking can be checked EXACTLY against the
    canonical fixture. An interpolated surface makes the "true" slice of a
    surface point itself ambiguous. Whether a smoother display layer is added
    on top is the owner's call; picking must resolve through these faces.

THE PER-FACE SOURCE SLICE RULE (PR-3D-04)
    Every triangle t carries ``face_source_slice[t]`` = the z index of the
    FOREGROUND voxel whose face produced it, plus ``face_axis[t]`` (0/1/2) and
    ``face_sign[t]`` (+1/-1). A 3-D pick that hits triangle t navigates to
    ``face_source_slice[t]``. Not floor(hit_z): the +z face of voxel k lies on
    the plane z = k + 1, where floor(hit_z) gives k + 1 -- the slice above the
    voxel that was picked. ``slice_of_world`` (floor rule) is for points such
    as an MPR plane position, not for picks. A ray that misses never
    navigates: ``pick_slice`` returns None and nothing is clamped.

    At level 0 a pick follows the contract's half-open cells exactly, like the
    canonical fixture's DDA: a ray that only touches a closed voxel boundary
    (lying in a lattice plane, grazing an edge) does not enter that voxel, and
    a ray entering through a concave lattice edge or corner is resolved too.
    During development level-0 picks matched a copy of the fixture DDA on
    47,602 rays from outside the volume (generic, lattice-plane, lattice-line
    and vertex-diagonal rays; the synthetic blob and four random masks).

LEVELS AND DR-008c
    ``LEVEL_CELLS = {0: 1, 1: 1.25, 2: 2, 3: 4, 4: 8}`` -- vertex-clustering
    cell sizes in voxels, the five levels Spike B measured today (Day 22
    offline real-mask frontier run, cells 1, 1.25, 2, 4, 8). Level numbers
    follow that run, not the older mesh_levels.json numbering (cells 1-4).

    DR-008c (the triangle budget) is NOT decided. Its rule (Day 22 override):
    DR-008c = the fastest level whose B5 <= +/-1 source slice. Today's offline
    Spike B evidence shows only level 0 keeps real-mesh picking within +/-1
    slice -- vertex clustering opens holes in thin anatomy -- so
    ``DEFAULT_LEVEL = 0``. Changing it is a DR-008c decision, not a code tweak.

    Decimated triangles KEEP the face_source_slice (and axis/sign) of the
    level-0 face they came from; ``source_triangle[t]`` is that face's level-0
    triangle index. Their vertices move to cluster means, which is exactly the
    picking error Spike B measures. As in the spike, clustering keys are
    ``np.round(v / cell)`` -- round-half-to-even, so at even cells the cluster
    widths alternate -- and vertices left unreferenced by dropped triangles are
    kept, so counts match the Spike B frontier table.

PROVENANCE -- the face table and the decimation rule are a COPY, not an import.
    source : spikes/spike_b_3d/mesh/build_mesh.py (_FACES, extract_surface,
             decimate, to_world)
    commit : origin/main f5aa763; file last changed in ee9ef60
             "SPIKE_B tooling: merge picking harness and fixture proposal"
    blob   : 32d5b14f97b5b554dac83fb5c302609c5396a4f9
             (re-checked at origin/main 44350d4, blob 7e26a3a: ba492ae changed
             only build(); the copied functions are unchanged)
    copied : 2026-10-01. _FACES character-for-character. extract_surface
             rewritten with numpy shifts per axis, keeping the spike's emission
             order (voxels in C order, faces -x +x -y +y -z +z) and its
             first-encounter vertex order. decimate's rule kept (keys =
             np.round(v / cell), cluster mean, drop triangles with a repeated
             vertex); np.unique(axis=0) became an order-preserving scalar key
             and np.add.at became bincount. Output was compared with the spike
             on its 48x40x24 synthetic blob at cells 1, 1.25, 2, 3, 4 and 8
             during development: identical vertices and triangles.
    Spike code is throwaway and stays behind spikes/**; product code never
    imports it (reuse is by copy with provenance).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import cached_property
from typing import Any, Mapping

import numpy as np

from .geometry import (
    CONTRACT_VERSION,
    GEOMETRY_MISMATCH,
    MASK_EMPTY,
    MASK_NOT_3D,
    MASK_NOT_BINARY,
    MESH_LEVEL_UNKNOWN,
    RAY_INVALID,
    GeometryError,
    VolumeGeometry,
    _vec3,
)

LEVEL_CELLS: dict[int, float] = {0: 1, 1: 1.25, 2: 2, 3: 4, 4: 8}
DEFAULT_LEVEL = 0

# The six cell faces, each as (neighbour offset, the four corner offsets in
# winding order). Corner offsets are in cell-local units, 0 or 1 per axis.
# COPIED character-for-character from build_mesh.py (see PROVENANCE).
_FACES = [
    ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),   # -x
    ((+1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),   # +x
    ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),   # -y
    ((0, +1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]),   # +y
    ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)]),   # -z
    ((0, 0, +1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),   # +z
]
_FACE_CORNERS = np.array([corners for _offset, corners in _FACES], dtype=np.int64)  # (6, 4, 3)
_FACE_AXIS = np.array([0, 0, 1, 1, 2, 2], dtype=np.int8)
_FACE_SIGN = np.array([-1, 1, -1, 1, -1, 1], dtype=np.int8)

_ARRAY_FIELDS = ("vertices_world", "triangles", "face_source_slice", "face_axis",
                 "face_sign", "source_triangle")

# Picking constants. Directions are normalised, so t is a world distance.
PICK_T_MIN = 1e-9         # a hit must lie strictly in front of the ray origin
_PARALLEL_EPS = 1e-12     # |cos(incidence)| below this: the ray is parallel to the triangle
_BARY_EPS = 1e-12         # barycentric slack: a ray through a shared edge hits both triangles
_TIE_EPS = 1e-9           # hits closer than this along the ray are the same point
_LATTICE_EPS = 1e-9       # voxel units: a hit point this close to a cell boundary lies on it
_PICK_CHUNK = 1 << 18     # triangles per vectorised block (bounds peak memory)
# Voxel-space direction of the parity ray in _cell_is_foreground: 1 : sqrt(2)-1 :
# sqrt(3)-1, irrational ratios, so from a cell centre it meets no lattice edge.
_PARITY_DIRECTION_VOXEL = np.array([1.0, 0.41421356237309515, 0.7320508075688772])


# --- input validation -------------------------------------------------------

def as_binary_mask(mask: Any, *, name: str = "mask") -> np.ndarray:
    """Return ``mask`` as a bool array (foreground = value > 0), or raise GeometryError.

    Accepted: bool, or an integer/float array whose values are {0, 1} or
    {0, 255}. A label map such as {0, 1, 2}, a probability map, negative or
    non-finite values are MASK_NOT_BINARY: binarising those is the caller's
    decision, not a side effect of meshing. An all-zero mask is returned as is.
    """
    arr = np.asarray(mask)
    if arr.ndim != 3 or 0 in arr.shape:
        raise GeometryError(MASK_NOT_3D,
                            f"{name} must be a non-empty 3-D array indexed [x, y, z]; got shape {arr.shape}")
    if arr.dtype == np.bool_:
        return arr
    is_int = np.issubdtype(arr.dtype, np.integer)
    if not (is_int or np.issubdtype(arr.dtype, np.floating)):
        raise GeometryError(MASK_NOT_BINARY, f"{name} has dtype {arr.dtype}; expected bool, integer or float")
    low, high = arr.min(), arr.max()
    if not (np.isfinite(low) and np.isfinite(high)):
        raise GeometryError(MASK_NOT_BINARY, f"{name} contains non-finite values")
    if low < 0 or high not in (0, 1, 255):
        raise GeometryError(MASK_NOT_BINARY,
                            f"{name} values span [{low}, {high}]; expected {{0, 1}} or {{0, 255}}")
    foreground = arr > 0
    if high != 0 and not (is_int and high == 1):
        # Every foreground value must be the single level `high`.
        if np.count_nonzero(foreground) != np.count_nonzero(arr == high):
            raise GeometryError(MASK_NOT_BINARY,
                                f"{name} has values other than 0 and {high}; expected {{0, 1}} or {{0, 255}}")
    return foreground


def _level_cell(level: Any) -> tuple[int, float]:
    if isinstance(level, (bool, np.bool_)) or not isinstance(level, (int, np.integer)) \
            or int(level) not in LEVEL_CELLS:
        raise GeometryError(MESH_LEVEL_UNKNOWN, f"level must be one of {sorted(LEVEL_CELLS)}; got {level!r}")
    return int(level), LEVEL_CELLS[int(level)]


def _foreground_bbox(fg: np.ndarray) -> tuple[tuple[int, int, int], tuple[int, int, int]] | None:
    """Half-open bounding box (lo, hi) of the foreground, or None when empty."""
    xs = np.flatnonzero(fg.any(axis=(1, 2)))
    if xs.size == 0:
        return None
    ys = np.flatnonzero(fg.any(axis=(0, 2)))
    zs = np.flatnonzero(fg.any(axis=(0, 1)))
    lo = (int(xs[0]), int(ys[0]), int(zs[0]))
    hi = (int(xs[-1]) + 1, int(ys[-1]) + 1, int(zs[-1]) + 1)
    return lo, hi


# --- the mesh ---------------------------------------------------------------

@dataclass(frozen=True, eq=False)
class CaseMesh:
    """A surface mesh plus everything needed to map a pick back to a source slice.

    Arrays are read-only. ``content_sha256()`` is the identity to compare.
    """

    vertices_world: np.ndarray       # float64 (N, 3)
    triangles: np.ndarray            # int32 (M, 3), outward winding
    face_source_slice: np.ndarray    # int32 (M,)  z of the foreground voxel behind the face
    face_axis: np.ndarray            # int8 (M,)   0, 1, 2
    face_sign: np.ndarray            # int8 (M,)   -1, +1 (outward normal along face_axis)
    source_triangle: np.ndarray      # int32 (M,)  level-0 triangle this one came from
    level: int
    cluster_cell: float
    shape_xyz: tuple[int, int, int]
    spacing: tuple[float, float, float]
    origin: tuple[float, float, float]
    geometry_contract_version: str
    foreground_voxels: int

    def __post_init__(self) -> None:
        # Validates shape/spacing/origin and the exact contract version.
        geometry = VolumeGeometry(self.shape_xyz, self.spacing, self.origin,
                                  self.geometry_contract_version)
        object.__setattr__(self, "shape_xyz", geometry.shape_xyz)
        object.__setattr__(self, "spacing", geometry.spacing)
        object.__setattr__(self, "origin", geometry.origin)
        specs = {"vertices_world": (np.float64, 2), "triangles": (np.int32, 2),
                 "face_source_slice": (np.int32, 1), "face_axis": (np.int8, 1),
                 "face_sign": (np.int8, 1), "source_triangle": (np.int32, 1)}
        for name, (dtype, ndim) in specs.items():
            arr = np.array(getattr(self, name), dtype=dtype, order="C", copy=True)
            if arr.ndim != ndim:
                raise ValueError(f"CaseMesh.{name} must be {ndim}-D; got shape {arr.shape}")
            arr.flags.writeable = False
            object.__setattr__(self, name, arr)
        n_tri = self.triangles.shape[0]
        if self.vertices_world.shape[1:] != (3,) or self.triangles.shape[1:] != (3,):
            raise ValueError("CaseMesh vertices_world and triangles must have 3 columns")
        for name in ("face_source_slice", "face_axis", "face_sign", "source_triangle"):
            if getattr(self, name).shape != (n_tri,):
                raise ValueError(f"CaseMesh.{name} must have one entry per triangle ({n_tri})")
        if n_tri and (self.triangles.min() < 0 or self.triangles.max() >= self.vertices_world.shape[0]):
            raise ValueError("CaseMesh.triangles index outside vertices_world")

    @property
    def vertex_count(self) -> int:
        return int(self.vertices_world.shape[0])

    @property
    def triangle_count(self) -> int:
        return int(self.triangles.shape[0])

    @cached_property
    def geometry(self) -> VolumeGeometry:
        return VolumeGeometry(self.shape_xyz, self.spacing, self.origin, self.geometry_contract_version)

    def vertices_voxel(self) -> np.ndarray:
        """Vertices back in voxel-lattice units (integers up to float rounding at level 0)."""
        return (self.vertices_world - np.asarray(self.origin)) / np.asarray(self.spacing)

    def to_dict(self) -> dict[str, Any]:
        """JSON-serialisable form (plain lists). Field names of the geometry block follow API contract 11."""
        return {
            "kind": "voxel_face_surface",
            "geometry_contract_version": self.geometry_contract_version,
            "geometry": self.geometry.to_dict(),
            "level": self.level,
            "cluster_cell_voxels": self.cluster_cell,
            "foreground_voxels": self.foreground_voxels,
            "vertex_count": self.vertex_count,
            "triangle_count": self.triangle_count,
            "vertices_world": self.vertices_world.tolist(),
            "triangles": self.triangles.tolist(),
            "face_source_slice": self.face_source_slice.tolist(),
            "face_axis": self.face_axis.tolist(),
            "face_sign": self.face_sign.tolist(),
            "source_triangle": self.source_triangle.tolist(),
            "pick_rule": "a pick that hits triangle t navigates to face_source_slice[t]; "
                         "a miss never navigates",
            "content_sha256": self.content_sha256(),
        }

    def content_sha256(self) -> str:
        """Stable SHA-256 over the geometry block, level and every array (dtype, shape, bytes)."""
        digest = hashlib.sha256()
        header = {"geometry": self.geometry.to_dict(), "level": self.level,
                  "cluster_cell_voxels": self.cluster_cell,
                  "foreground_voxels": self.foreground_voxels}
        digest.update(json.dumps(header, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        for name in _ARRAY_FIELDS:
            arr = getattr(self, name)
            little = np.ascontiguousarray(arr, dtype=arr.dtype.newbyteorder("<"))
            digest.update(f"\n{name}:{little.dtype.str}:{list(little.shape)}\n".encode("ascii"))
            digest.update(little.tobytes())
        return digest.hexdigest()

    def __repr__(self) -> str:
        return (f"CaseMesh(level={self.level}, cluster_cell={self.cluster_cell}, "
                f"vertices={self.vertex_count}, triangles={self.triangle_count}, "
                f"shape_xyz={self.shape_xyz}, version={self.geometry_contract_version!r})")


# --- extraction -------------------------------------------------------------

def _exposed_faces(region: np.ndarray, lo: tuple[int, int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Every face between a foreground voxel and background/border, in the spike's emission order.

    ``region`` is a C-contiguous bool crop holding all the foreground; ``lo`` is
    its offset in the volume. Outside the crop is background, so padding the
    crop with zeros yields the same faces as the whole volume, border included.
    Returns ``voxel`` (F, 3) volume indices of the foreground voxel and
    ``face`` (F,) index into _FACES, ordered by (x, y, z, face) -- exactly the
    order of the spike's ``for voxel in argwhere: for face in _FACES`` loop.
    """
    sx, sy, sz = region.shape
    padded = np.pad(region, 1, mode="constant", constant_values=False)
    centre = padded[1:sx + 1, 1:sy + 1, 1:sz + 1]
    keys = []
    for f, ((dx, dy, dz), _corners) in enumerate(_FACES):
        neighbour = padded[1 + dx:1 + dx + sx, 1 + dy:1 + dy + sy, 1 + dz:1 + dz + sz]
        exposed = np.greater(centre, neighbour)        # foreground here, background there
        keys.append(np.flatnonzero(exposed).astype(np.int64) * 6 + f)
    key = np.concatenate(keys)
    key.sort()                                         # keys are unique: (C-order index, face)
    linear, face = np.divmod(key, 6)
    x, y, z = np.unravel_index(linear, (sx, sy, sz))
    voxel = np.column_stack((x + lo[0], y + lo[1], z + lo[2])).astype(np.int64)
    return voxel, face


def _lattice_vertices(voxel: np.ndarray, face: np.ndarray,
                      shape_xyz: tuple[int, int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Deduplicate quad corners into lattice vertices, numbered in first-encounter order.

    Returns ``lattice`` (N, 3) int64 corner coordinates and ``quads`` (F, 4)
    vertex ids. Numbering by first encounter reproduces the spike's
    dict-insertion order, so the level-0 arrays are identical to the spike's.
    """
    ly, lz = shape_xyz[1] + 1, shape_xyz[2] + 1
    # The code is linear in the corner, so code(voxel + c) = code(voxel) + code(c).
    voxel_code = (voxel[:, 0] * ly + voxel[:, 1]) * lz + voxel[:, 2]
    corner_code = (_FACE_CORNERS[..., 0] * ly + _FACE_CORNERS[..., 1]) * lz + _FACE_CORNERS[..., 2]
    codes = (voxel_code[:, None] + corner_code[face]).reshape(-1)
    unique, first, inverse = np.unique(codes, return_index=True, return_inverse=True)
    order = np.argsort(first)
    rank = np.empty(order.size, dtype=np.int64)
    rank[order] = np.arange(order.size, dtype=np.int64)
    quads = rank[inverse.reshape(-1)].reshape(-1, 4)
    x, rest = np.divmod(unique[order], ly * lz)
    y, z = np.divmod(rest, lz)
    return np.column_stack((x, y, z)), quads


def _cluster(verts: np.ndarray, tris: np.ndarray, cell: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Spike ``decimate`` rule (vertex clustering). Returns (verts, tris, kept level-0 triangle ids)."""
    keys = np.round(verts / cell).astype(np.int64)
    # Lattice vertices are >= 0, so keys are >= 0 and this scalar key sorts
    # exactly like np.unique(keys, axis=0): same clusters, same cluster order.
    k1 = int(keys[:, 1].max()) + 1
    k2 = int(keys[:, 2].max()) + 1
    scalar = (keys[:, 0] * k1 + keys[:, 1]) * k2 + keys[:, 2]
    _unique, inverse, counts = np.unique(scalar, return_inverse=True, return_counts=True)
    inverse = inverse.reshape(-1)
    n_clusters = counts.shape[0]
    # Sums of integer lattice coordinates are exact in float64, so the mean is
    # bit-identical to the spike's np.add.at accumulation.
    acc = np.column_stack([np.bincount(inverse, weights=verts[:, i], minlength=n_clusters)
                           for i in range(3)])
    new_verts = acc / counts[:, None]
    new_tris = inverse[tris]
    degenerate = ((new_tris[:, 0] == new_tris[:, 1])
                  | (new_tris[:, 1] == new_tris[:, 2])
                  | (new_tris[:, 0] == new_tris[:, 2]))
    keep = np.flatnonzero(~degenerate)
    return new_verts, new_tris[keep], keep


def _mesh_from_region(region: np.ndarray, lo: tuple[int, int, int],
                      geometry: VolumeGeometry, level: int) -> CaseMesh:
    """Mesh of the foreground in ``region`` (a crop at offset ``lo``), in the full volume's frame."""
    cell = LEVEL_CELLS[level]
    voxel, face = _exposed_faces(region, lo)
    lattice, quads = _lattice_vertices(voxel, face, geometry.shape_xyz)
    n_faces = face.shape[0]
    triangles = np.empty((2 * n_faces, 3), dtype=np.int64)
    triangles[0::2] = quads[:, [0, 1, 2]]
    triangles[1::2] = quads[:, [0, 2, 3]]
    face_source_slice = np.repeat(voxel[:, 2], 2)
    face_axis = np.repeat(_FACE_AXIS[face], 2)
    face_sign = np.repeat(_FACE_SIGN[face], 2)
    source_triangle = np.arange(2 * n_faces, dtype=np.int64)
    verts_voxel = lattice.astype(np.float64)
    if cell > 1.0:      # the spike returns level-0 copies for cell <= 1
        verts_voxel, triangles, keep = _cluster(verts_voxel, triangles, cell)
        face_source_slice = face_source_slice[keep]
        face_axis = face_axis[keep]
        face_sign = face_sign[keep]
        source_triangle = keep
    vertices_world = np.asarray(geometry.origin, dtype=np.float64) \
        + verts_voxel * np.asarray(geometry.spacing, dtype=np.float64)
    return CaseMesh(
        vertices_world=vertices_world,
        triangles=triangles,
        face_source_slice=face_source_slice,
        face_axis=face_axis,
        face_sign=face_sign,
        source_triangle=source_triangle,
        level=level,
        cluster_cell=cell,
        shape_xyz=geometry.shape_xyz,
        spacing=geometry.spacing,
        origin=geometry.origin,
        geometry_contract_version=geometry.geometry_contract_version,
        foreground_voxels=int(np.count_nonzero(region)),
    )


def build_case_mesh(mask: Any, level: int = DEFAULT_LEVEL, *,
                    spacing: Any = (1.0, 1.0, 1.0), origin: Any = (0.0, 0.0, 0.0),
                    contract_version: str = CONTRACT_VERSION,
                    shape_xyz: Any = None) -> CaseMesh:
    """Build the voxel-face surface of ``mask`` (indexed [x, y, z]) at ``level``.

    Raises GeometryError: MESH_LEVEL_UNKNOWN, MASK_NOT_3D, MASK_NOT_BINARY,
    GEOMETRY_NOT_VALIDATED (spacing not positive-finite, origin not finite),
    GEOMETRY_CONTRACT_VERSION_MISSING/_MISMATCH (this code implements exactly
    CONTRACT_VERSION), GEOMETRY_MISMATCH (``shape_xyz`` given and different from
    ``mask.shape`` -- e.g. a (z, y, x) array from a C-order reader), MASK_EMPTY.
    """
    level, _cell = _level_cell(level)
    fg = as_binary_mask(mask)
    geometry = VolumeGeometry(fg.shape, spacing, origin, contract_version)
    if shape_xyz is not None:
        declared = VolumeGeometry(shape_xyz, spacing, origin, contract_version).shape_xyz
        if declared != geometry.shape_xyz:
            raise GeometryError(GEOMETRY_MISMATCH,
                                f"mask.shape {geometry.shape_xyz} != declared shape_xyz {declared}; "
                                "arrays are indexed [x, y, z]")
    box = _foreground_bbox(fg)
    if box is None:
        raise GeometryError(MASK_EMPTY, "mask has no foreground voxel; there is no surface to build")
    lo, hi = box
    region = np.ascontiguousarray(fg[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]])
    return _mesh_from_region(region, lo, geometry, level)


# --- picking ----------------------------------------------------------------

def pick_slice(mesh: CaseMesh, origin_world: Any, direction_world: Any, *,
               t_min: float = PICK_T_MIN) -> dict[str, Any] | None:
    """First surface hit along a world-space ray -> its source slice, or None on a miss.

    Moller-Trumbore over every triangle, vectorised in blocks. Only hits with
    t > ``t_min`` along the normalised direction count, so a ray that starts
    on a face does not hit that face. Back faces count: a ray that starts
    inside the surface reports the face it leaves through.

    Level 0 (exact lattice faces) resolves hits by the contract's half-open
    cells, exactly as the canonical fixture's DDA does (``_resolve_half_open``):
    a ray that only touches a closed voxel boundary -- lying in a lattice
    plane, grazing an edge -- does not enter that voxel. Decimated levels take
    the nearest hit. At one point a front face wins, then the lowest triangle
    index, so the result is deterministic. A miss returns None and must never
    navigate; nothing is clamped.

    Returns {"slice_index", "triangle", "point_world", "distance_world",
    "front_facing"}; ``slice_index == face_source_slice[triangle]`` always.
    """
    o = np.asarray(_vec3(origin_world, "origin_world", code=RAY_INVALID))
    d = np.asarray(_vec3(direction_world, "direction_world", code=RAY_INVALID))
    norm = float(np.sqrt(d @ d))
    if norm == 0.0:
        raise GeometryError(RAY_INVALID, "direction_world must not be the zero vector")
    d = d / norm
    tri, t, front = _ray_hits(mesh, o, d, t_min)
    if tri.size == 0:
        return None
    if mesh.cluster_cell <= 1.0:
        best = _resolve_half_open(mesh, o, d, tri, t, front)
    else:
        best = _resolve_first_hit(tri, t, front)
    if best is None:
        return None
    t_best = float(t[best])
    triangle = int(tri[best])
    return {
        "slice_index": int(mesh.face_source_slice[triangle]),
        "triangle": triangle,
        "point_world": (o + t_best * d).tolist(),
        "distance_world": t_best,
        "front_facing": bool(front[best]),
    }


def _ray_hits(mesh: CaseMesh, o: np.ndarray, d: np.ndarray,
              t_min: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every triangle hit with t > t_min (d normalised), sorted by (t, triangle index).

    Returns (triangle, t, front); front means the ray meets the outward
    normal head-on (d . n < 0, i.e. Moller-Trumbore det > 0).
    """
    verts, tris = mesh.vertices_world, mesh.triangles
    found_tri, found_t, found_front = [], [], []
    for start in range(0, tris.shape[0], _PICK_CHUNK):
        block = tris[start:start + _PICK_CHUNK]
        v0 = verts[block[:, 0]]
        e1 = verts[block[:, 1]] - v0
        e2 = verts[block[:, 2]] - v0
        p = np.cross(d, e2)
        det = np.einsum("ij,ij->i", e1, p)
        scale = np.sqrt(np.einsum("ij,ij->i", e1, e1) * np.einsum("ij,ij->i", e2, e2))
        cand = np.flatnonzero(np.abs(det) > _PARALLEL_EPS * scale)
        if cand.size == 0:
            continue
        inv = 1.0 / det[cand]
        s = o - v0[cand]
        u = np.einsum("ij,ij->i", s, p[cand]) * inv
        keep = (u >= -_BARY_EPS) & (u <= 1.0 + _BARY_EPS)
        cand, inv, s, u = cand[keep], inv[keep], s[keep], u[keep]
        if cand.size == 0:
            continue
        q = np.cross(s, e1[cand])
        v = (q @ d) * inv
        t = np.einsum("ij,ij->i", e2[cand], q) * inv
        keep = (v >= -_BARY_EPS) & (u + v <= 1.0 + _BARY_EPS) & (t > t_min)
        if keep.any():
            found_tri.append(cand[keep] + start)
            found_t.append(t[keep])
            found_front.append(det[cand[keep]] > 0.0)
    if not found_tri:
        empty = np.empty(0)
        return empty.astype(np.int64), empty, empty.astype(bool)
    tri = np.concatenate(found_tri)
    t = np.concatenate(found_t)
    front = np.concatenate(found_front)
    order = np.lexsort((tri, t))
    return tri[order], t[order], front[order]


def _events(t: np.ndarray) -> list[tuple[int, int]]:
    """Group sorted hit distances into points: [start, end) runs within _TIE_EPS of their first hit."""
    events, start = [], 0
    for k in range(1, t.shape[0] + 1):
        if k == t.shape[0] or t[k] > t[start] + _TIE_EPS:
            events.append((start, k))
            start = k
    return events


def _by_triangle(tri: np.ndarray, start: int, end: int) -> list[int]:
    """Hits of one point, lowest triangle index first."""
    return sorted(range(start, end), key=lambda k: int(tri[k]))


def _resolve_first_hit(tri: np.ndarray, t: np.ndarray, front: np.ndarray) -> int:
    """Decimated meshes: nearest hit; at one point a front face first, then the lowest triangle index."""
    members = _by_triangle(tri, *_events(t)[0])
    return next((k for k in members if front[k]), members[0])


def _cell_beside(p: np.ndarray, w: np.ndarray, sign: float) -> tuple[int, int, int]:
    """Half-open cell holding p + sign * delta * w as delta -> 0+ (the floor rule at a boundary)."""
    cell = []
    for i in range(3):
        n = round(float(p[i]))
        if abs(p[i] - n) <= _LATTICE_EPS:           # p lies on a cell boundary along axis i
            cell.append(n - 1 if sign * w[i] < 0 else n)
        else:
            cell.append(int(np.floor(p[i])))
    return (cell[0], cell[1], cell[2])


def _cell_is_foreground(mesh: CaseMesh, cell: tuple[int, int, int]) -> bool:
    """Level 0: is ``cell`` foreground? Parity of surface crossings from its centre.

    The level-0 surface is closed, so a point is inside it iff a ray from the
    point crosses it an odd number of times. The ray starts at the cell centre
    (half-integer voxel coordinates) along a fixed direction with irrational
    component ratios, so it meets no lattice edge or vertex; crossings are
    counted per FACE (level-0 triangles 2i and 2i + 1 are face i), so a ray
    through a quad's diagonal still counts once.
    """
    if not all(0 <= cell[i] < mesh.shape_xyz[i] for i in range(3)):
        return False
    spacing = np.asarray(mesh.spacing)
    centre = np.asarray(mesh.origin) + (np.asarray(cell, dtype=np.float64) + 0.5) * spacing
    direction = _PARITY_DIRECTION_VOXEL * spacing
    direction = direction / np.sqrt(direction @ direction)
    tri, _t, _front = _ray_hits(mesh, centre, direction, 0.0)
    return np.unique(mesh.source_triangle[tri] // 2).size % 2 == 1


def _resolve_half_open(mesh: CaseMesh, o: np.ndarray, d: np.ndarray, tri: np.ndarray,
                       t: np.ndarray, front: np.ndarray) -> int | None:
    """Level 0: resolve hits by the contract's half-open cells, as the fixture's DDA does.

    Hits are grouped into points along the ray. At each point:
      * a front-face hit is an ENTRY if the ray then enters that face's voxel
        (the half-open cell just past the point is the voxel) -> answer;
      * a back-face hit is an EXIT if the ray was inside that voxel just before
        -> answer (the ray started inside the foreground);
      * otherwise the ray only TOUCHES closed cell boundaries here. Under
        [k, k + 1) it does not enter the touched voxels -- except when the
        cell just past the point is itself foreground: the ray entered through
        a concave lattice edge or corner, where no face exists. That cell is
        tested by parity (``_cell_is_foreground``) and a touched face in its
        slice is reported.
    A ray that only touches is a miss (None).
    """
    spacing = np.asarray(mesh.spacing)
    origin = np.asarray(mesh.origin)
    w = d / spacing
    w = np.where(np.abs(w) <= _PARALLEL_EPS, 0.0, w)
    corners = np.rint((mesh.vertices_world[mesh.triangles[tri]] - origin) / spacing).astype(np.int64)
    voxel = corners.min(axis=1)                      # in-plane: the face's low corner
    axis = mesh.face_axis[tri].astype(np.int64)
    plus = mesh.face_sign[tri] > 0
    voxel[np.flatnonzero(plus), axis[plus]] -= 1     # a +axis face lies on plane voxel + 1
    voxels = [tuple(int(c) for c in row) for row in voxel]

    for start, end in _events(t):
        members = _by_triangle(tri, start, end)
        p = (o + t[start] * d - origin) / spacing
        after = _cell_beside(p, w, +1.0)
        before = _cell_beside(p, w, -1.0)
        for k in members:
            if front[k] and voxels[k] == after:
                return k
        for k in members:
            if not front[k] and voxels[k] == before:
                return k
        if _cell_is_foreground(mesh, after):
            same = [k for k in members if mesh.face_source_slice[tri[k]] == after[2]]
            return same[0] if same else members[0]
    return None


def _as_geometry(mesh_or_geometry: Any) -> VolumeGeometry:
    if isinstance(mesh_or_geometry, CaseMesh):
        return mesh_or_geometry.geometry
    if isinstance(mesh_or_geometry, VolumeGeometry):
        return mesh_or_geometry
    if isinstance(mesh_or_geometry, Mapping):
        block = mesh_or_geometry
        if isinstance(block.get("geometry"), Mapping):
            block = block["geometry"]
        # API contract 11 names first, then the canonical fixture's names. The
        # version is required: a block without it is rejected, not assumed.
        shape = block.get("shape", block.get("shape_xyz"))
        spacing = block.get("spacing", block.get("spacing_xyz_mm"))
        origin = block.get("origin", block.get("origin_world_mm"))
        version = block.get("geometry_contract_version",
                            mesh_or_geometry.get("geometry_contract_version"))
        return VolumeGeometry(shape, spacing, origin, version)
    raise TypeError(f"expected CaseMesh, VolumeGeometry or a geometry mapping; got {type(mesh_or_geometry).__name__}")


def slice_of_world(mesh_or_geometry: Any, point_world: Any) -> int | None:
    """Floor rule for a world POINT; None outside the volume (never clamped).

    For a pick use ``pick_slice`` (face_source_slice), not this: see the module
    docstring for why the two differ on +z faces.
    """
    return _as_geometry(mesh_or_geometry).slice_of_world(point_world)


__all__ = ["LEVEL_CELLS", "DEFAULT_LEVEL", "PICK_T_MIN", "CaseMesh", "as_binary_mask",
           "build_case_mesh", "pick_slice", "slice_of_world"]
