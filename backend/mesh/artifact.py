"""The served L0 mesh artifact: ``cardiac-mesh/1`` (V2-01, DR-008c = L0; SCR-05, H6 / H7).

WHAT IT IS
    The undecimated voxel-face surface of one binary mask (``surface.build_case_mesh`` level 0) plus the
    source slice of every triangle, as ONE compact binary file. Level 0 is the only level that keeps picking
    within +/-1 slice (DR-008c, Spike B S-1), so there is no other level to serve.

FRAME (the whole point of the format; tested against ``index_convention`` in test_mesh_artifact.py)
    Vertices are integer lattice corners in the SOURCE MASK'S VOXEL-INDEX FRAME, stored as uint16
    ``(x, y, z)`` with ``x`` = column, ``y`` = row, ``z`` = slice (API contract ``index_convention``
    ``x=column,y=row,z=slice``, DR-008a). Voxel ``k`` occupies the half-open interval ``[k, k + 1)`` on each axis,
    so a face of the voxel ``(x, y, z)`` has vertices with coordinates in ``{x, x+1} x {y, y+1} x {z, z+1}``.
    While ``geometry_validation_status`` is GEOMETRY_NOT_VALIDATED (every LASC 2018 header) these are voxel
    indices, never millimetres: the API answers ``mesh_to_world_transform`` = identity and no length is served.

LAYOUT (little-endian; every section starts on a 4-byte boundary)
    0      8 bytes   magic ``CARDMESH``
    8      uint32    N = header length in bytes
    12     N bytes   header: UTF-8 JSON (sorted keys, compact), space-padded so the next section is 4-aligned
    ...    V*3 x uint16   vertices  (x, y, z), then padding to 4 bytes
    ...    T*3 x uint16|uint32 triangles, vertex indices, outward winding (``index_bytes`` 2 when V < 65536)
           then padding to 4 bytes
    ...    T x uint16     face_source_slice[t]: the z of the FOREGROUND voxel whose face triangle t is
    ...    padding to 4 bytes
    The header carries ``format``, ``level``, ``vertex_count``, ``triangle_count``, ``index_bytes``, ``shape``
    ``[Nx, Ny, Nz]``, ``index_convention``, ``frame`` and ``pick_rule``. Triangles 2k and 2k+1 are the two halves
    of voxel face k.

PICK RULE (PR-3D-04): a ray that first hits triangle t navigates to ``face_source_slice[t]``. Not the floor of
    the hit point: the +z face of voxel k lies on the plane z = k + 1, where the floor rule gives k + 1. A miss
    never navigates.

The bytes are a pure function of (mask, shape): building twice gives identical bytes, so the artifact is
immutable and content-addressed (sha256 of the bytes), like every other served artifact. Numpy only.
"""

from __future__ import annotations

import hashlib
import json
import struct
from typing import Any, Dict, Optional, Tuple

import numpy as np

from .surface import DEFAULT_LEVEL, CaseMesh, build_case_mesh

MAGIC = b"CARDMESH"
FORMAT = "cardiac-mesh/1"
BUILDER = "dr008c-L0/v1"
MEDIA_TYPE = "application/octet-stream"
INDEX_CONVENTION = "x=column,y=row,z=slice"
FRAME = "voxel-index"
PICK_RULE = ("a pick that first hits triangle t navigates to face_source_slice[t]; "
             "a miss never navigates; nothing is clamped")
MAX_AXIS = 65535        # vertices and slice indices are uint16


class MeshArtifactError(ValueError):
    """The artifact cannot be built or read; ``code`` is stable."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


def reconstruction_version(mask_sha256: str) -> str:
    """The ``reconstruction_version`` the API states for a mesh built from the mask with this digest."""
    return f"{BUILDER} sha256:{mask_sha256}"


def _pad(size: int) -> int:
    return (-size) % 4


def mask_from_zyx(volume_zyx: np.ndarray) -> np.ndarray:
    """A (z, y, x) volume as the [x, y, z] boolean mask ``build_case_mesh`` takes (no copy of the data order)."""
    if volume_zyx.ndim != 3:
        raise MeshArtifactError("MASK_NOT_3D", f"expected a (z, y, x) volume, got {volume_zyx.ndim}-D")
    return np.transpose(np.asarray(volume_zyx) != 0, (2, 1, 0))


def build_mesh_artifact(volume_zyx: np.ndarray) -> Tuple[bytes, Dict[str, Any]]:
    """Build the L0 artifact of a (z, y, x) mask volume: ``(bytes, info)``.

    ``info`` is what the sidecar records: counts, shape and the sha256 of the bytes. Raises
    ``backend.mesh.GeometryError`` (MASK_EMPTY for a mask with no foreground) or ``MeshArtifactError``.
    """
    mask = mask_from_zyx(volume_zyx)
    mesh = build_case_mesh(mask, DEFAULT_LEVEL, spacing=(1.0, 1.0, 1.0), origin=(0.0, 0.0, 0.0))
    payload = encode_mesh(mesh)
    return payload, {
        "format": FORMAT, "builder": BUILDER, "level": 0, "shape": [int(v) for v in mask.shape],
        "vertex_count": mesh.vertex_count, "triangle_count": mesh.triangle_count,
        "foreground_voxels": mesh.foreground_voxels, "bytes": len(payload),
        "mesh_sha256": hashlib.sha256(payload).hexdigest(),
    }


def encode_mesh(mesh: CaseMesh) -> bytes:
    """Encode a level-0 mesh built in the voxel-index frame (spacing 1, origin 0)."""
    if mesh.level != 0 or mesh.cluster_cell != 1:
        raise MeshArtifactError("LEVEL_NOT_SERVED", "only the undecimated level 0 is served (DR-008c)")
    if tuple(mesh.spacing) != (1.0, 1.0, 1.0) or tuple(mesh.origin) != (0.0, 0.0, 0.0):
        raise MeshArtifactError("FRAME_NOT_VOXEL_INDEX", "the served mesh is in the voxel-index frame: build it with "
                                "spacing (1, 1, 1) and origin (0, 0, 0)")
    shape = [int(v) for v in mesh.shape_xyz]
    if max(shape) > MAX_AXIS:
        raise MeshArtifactError("SHAPE_TOO_LARGE", f"shape {shape} exceeds the uint16 vertex range")
    vertices = np.rint(mesh.vertices_world)
    if not np.array_equal(vertices, mesh.vertices_world):
        raise MeshArtifactError("VERTEX_NOT_LATTICE", "level-0 vertices must be integer lattice corners")
    if vertices.size and (vertices.min() < 0 or any(vertices[:, axis].max() > shape[axis] for axis in range(3))):
        raise MeshArtifactError("VERTEX_OUTSIDE_VOLUME", "a vertex lies outside [0, shape]")
    slices = mesh.face_source_slice
    if slices.size and (slices.min() < 0 or slices.max() >= shape[2]):
        raise MeshArtifactError("SLICE_OUT_OF_RANGE", "a face's source slice is outside the volume")
    index_bytes = 2 if mesh.vertex_count < 65536 else 4
    header = {
        "format": FORMAT, "kind": "voxel_face_surface", "builder": BUILDER, "level": 0,
        "vertex_count": mesh.vertex_count, "triangle_count": mesh.triangle_count, "index_bytes": index_bytes,
        "shape": shape, "index_convention": INDEX_CONVENTION, "frame": FRAME,
        "vertex_layout": "uint16 x,y,z lattice corner: x=column, y=row, z=slice; voxel k spans [k, k+1)",
        "foreground_voxels": int(mesh.foreground_voxels), "pick_rule": PICK_RULE,
    }
    raw = json.dumps(header, sort_keys=True, separators=(",", ":")).encode("utf-8")
    raw += b" " * _pad(12 + len(raw))
    parts = [MAGIC, struct.pack("<I", len(raw)), raw]

    def section(array: np.ndarray, dtype: str) -> None:
        data = np.ascontiguousarray(array, dtype=np.dtype(dtype).newbyteorder("<")).tobytes()
        parts.append(data)
        parts.append(b"\x00" * _pad(len(data)))

    section(vertices.astype(np.uint16), "<u2")
    section(mesh.triangles, "<u2" if index_bytes == 2 else "<u4")
    section(slices.astype(np.uint16), "<u2")
    return b"".join(parts)


def read_header(payload: bytes) -> Dict[str, Any]:
    """The header of an artifact, after checking the magic and that the sections fit the file exactly."""
    if len(payload) < 12 or payload[:8] != MAGIC:
        raise MeshArtifactError("MESH_MAGIC", "not a cardiac-mesh artifact")
    (length,) = struct.unpack_from("<I", payload, 8)
    if length % 4 or 12 + length > len(payload):
        raise MeshArtifactError("MESH_HEADER", "header length is not aligned or runs past the end")
    try:
        header = json.loads(payload[12:12 + length].decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise MeshArtifactError("MESH_HEADER", f"header is not JSON: {exc}")
    if not isinstance(header, dict) or header.get("format") != FORMAT:
        raise MeshArtifactError("MESH_FORMAT", f"format is not {FORMAT}")
    for key in ("vertex_count", "triangle_count", "index_bytes", "shape", "index_convention", "frame"):
        if key not in header:
            raise MeshArtifactError("MESH_HEADER", f"header lacks {key}")
    if header["index_bytes"] not in (2, 4) or header["index_convention"] != INDEX_CONVENTION \
            or header["frame"] != FRAME or header.get("level") != 0:
        raise MeshArtifactError("MESH_HEADER", "unsupported index_bytes / convention / frame / level")
    v, t = int(header["vertex_count"]), int(header["triangle_count"])
    expected = 12 + length
    for size in (v * 3 * 2, t * 3 * int(header["index_bytes"]), t * 2):
        expected += size + _pad(size)
    if expected != len(payload):
        raise MeshArtifactError("MESH_LENGTH", f"sections need {expected} bytes, the file has {len(payload)}")
    return header


def decode_mesh(payload: bytes) -> Dict[str, Any]:
    """Header plus numpy arrays: ``vertices`` (V, 3) uint16, ``triangles`` (T, 3), ``face_source_slice`` (T,)."""
    header = read_header(payload)
    v, t, ib = int(header["vertex_count"]), int(header["triangle_count"]), int(header["index_bytes"])
    (length,) = struct.unpack_from("<I", payload, 8)
    offset = 12 + length

    def take(count: int, dtype: str) -> np.ndarray:
        nonlocal offset
        itemsize = np.dtype(dtype).itemsize
        array = np.frombuffer(payload, dtype=dtype, count=count, offset=offset)
        offset += count * itemsize + _pad(count * itemsize)
        return array

    vertices = take(v * 3, "<u2").reshape(v, 3)
    triangles = take(t * 3, "<u2" if ib == 2 else "<u4").reshape(t, 3)
    slices = take(t, "<u2")
    if t and (int(triangles.max()) >= v):
        raise MeshArtifactError("MESH_INDEX", "a triangle indexes past the vertices")
    shape = header["shape"]
    if v and any(int(vertices[:, axis].max()) > int(shape[axis]) for axis in range(3)):
        raise MeshArtifactError("MESH_VERTEX", "a vertex lies outside [0, shape]")
    if t and int(slices.max()) >= int(shape[2]):
        raise MeshArtifactError("MESH_SLICE", "a source slice is outside the volume")
    return {"header": header, "vertices": vertices, "triangles": triangles, "face_source_slice": slices}


def pick_triangle(artifact: Dict[str, Any], origin: Any, direction: Any) -> Optional[int]:
    """The first triangle a ray hits (voxel-index frame), or None. Reference implementation for tests and the
    E2E check; the viewer does the same in JavaScript. Möller-Trumbore, back faces accepted."""
    v = artifact["vertices"].astype(np.float64)
    tri = artifact["triangles"].astype(np.int64)
    o = np.asarray(origin, dtype=np.float64)
    d = np.asarray(direction, dtype=np.float64)
    d = d / np.sqrt(d @ d)
    p0, p1, p2 = v[tri[:, 0]], v[tri[:, 1]], v[tri[:, 2]]
    e1, e2 = p1 - p0, p2 - p0
    pvec = np.cross(d, e2)
    det = np.einsum("ij,ij->i", e1, pvec)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    tvec = o - p0
    u = np.einsum("ij,ij->i", tvec, pvec) * inv
    qvec = np.cross(tvec, e1)
    w = (qvec @ d) * inv
    t = np.einsum("ij,ij->i", e2, qvec) * inv
    hit = ok & (u >= -1e-9) & (w >= -1e-9) & (u + w <= 1 + 1e-9) & (t > 1e-9)
    if not hit.any():
        return None
    return int(np.flatnonzero(hit)[np.argmin(t[hit])])
