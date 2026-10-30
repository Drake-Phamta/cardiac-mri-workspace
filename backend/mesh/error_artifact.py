"""The served error mesh artifact: ``cardiac-errormesh/2`` (DR-005, decided 2026-10-30; SCR-05 error map, H6 / H7).

WHAT IT IS
    For one prediction (RAW or PROCESSED) and the case's ground truth, the voxel-face surfaces of the two error sets

        FP = prediction AND NOT ground truth     over-segmentation: predicted, not in the ground truth
        FN = ground truth AND NOT prediction     missed: in the ground truth, not predicted

    as ONE compact binary file in which every face carries its SOURCE SLICE, its CLASS and its REGION (FR-3D-008). A
    face is a voxel face between a voxel of the class and anything else (background, the volume border, or a voxel of
    another class), and its source slice is the ``z`` of the class voxel it belongs to - the very rule of the L0
    surface artifact (``surface.py`` / ``artifact.py``: ``face_source_slice``, PR-3D-04), built by the same code. Level
    0 only (DR-008c). Agreement (TP = both) has no surface of its own: it is what the prediction surface shows where no
    error covers it (UC-09 "overlap/FP/FN or equivalent", interpreted in app/verticals/v2_3d_inspector/README.md).

    DR-005 option 1 (separate FP / FN meshes with independent visibility), kept in one content-addressed file so that
    ``error_reconstruction_get`` can name exactly one ``error_mesh_artifact_id``. The class blocks are contiguous, so a
    viewer draws and picks one class by a triangle range.

REGIONS (FR-3D-008, "selecting an error region shall provide navigation to one or more contributing slices")
    A region is a connected component of the class voxel set, labelled by ``error_geometry.label_error_class`` - that is
    ``scipy.ndimage.label`` with ``generate_binary_structure(3, rank)`` for the declared connectivity, default 26,
    recorded in the header - and ordered and named exactly as ``build_error_geometry`` does (voxel count descending, first
    slice ascending, bounding box, first voxel in C order; ids ``FP_0001`` ... per class). The file numbers the regions
    1..C: the FP regions first (in that order), then the FN regions, matching the class blocks; ``face_component[t]`` is
    the number of the region of triangle t. The header's ``components`` table has, per region: ``id``, ``class``,
    ``voxels``, ``first_slice`` and ``slice_voxels`` (its voxel count on slices ``first_slice``, ``first_slice + 1``, ...).
    A connected voxel set has no gap in z, so its contributing slices are exactly ``first_slice .. first_slice +
    len(slice_voxels) - 1`` and every one of them has voxels: the writer asserts it, the reader checks it, and the table is
    that compact (JSON, 15-20 KB for the real meshes of the Day 39 data, about 0.4 % of the file - see README).

FRAME
    Identical to ``cardiac-mesh/1``: vertices are integer lattice corners in the voxel-index frame, stored as uint16
    ``(x, y, z)`` with ``x`` = column, ``y`` = row, ``z`` = slice (API contract ``index_convention``
    ``x=column,y=row,z=slice``, DR-008a); voxel ``k`` occupies ``[k, k + 1)``. While the geometry is not validated
    (every LASC 2018 header) these are voxel indices, never millimetres.

LAYOUT (little-endian; every section starts on a 4-byte boundary; the container and the first four sections are those
of ``cardiac-mesh/1``, two more sections carry the class and the region)
    0      8 bytes   magic ``CARDMESH`` (the header's ``format`` says which artifact this is)
    8      uint32    N = header length in bytes
    12     N bytes   header: UTF-8 JSON (sorted keys, compact), space-padded so the next section is 4-aligned
    ...    V*3 x uint16   vertices  (x, y, z), then padding to 4 bytes
    ...    T*3 x uint16|uint32 triangles: vertex indices into the whole vertex array, outward winding
           (``index_bytes`` 2 when V < 65536), then padding to 4 bytes
    ...    T x uint16     face_source_slice[t]: the z of the class voxel whose face triangle t is
    ...    T x uint8      face_class[t]: 1 = FP, 2 = FN; then padding
    ...    T x uint8|uint16|uint32 face_component[t]: the number (1..C) of the region of the face; then padding.
           ``component_index_bytes`` is the SMALLEST of 1, 2, 4 whose type holds C (C <= 255 -> 1, <= 65535 -> 2).
    Class blocks: the FP vertices, then the FN vertices; the FP triangles, then the FN triangles. The header's
    ``classes`` lists, for FP then FN, the class ``code``, the ``rule``, its ``voxels``, its ``vertex_range`` /
    ``triangle_range`` (half-open, contiguous, together the whole file) and its ``component_range`` (half-open range of
    region numbers). A class with no voxel is an empty range everywhere: "no false positives" is a fact, not a missing
    layer. A triangle only indexes the vertices of its own class block and names a region of its own class.
    Triangles 2k and 2k+1 are the two halves of one voxel face.

IDENTITY
    The header names both source masks (``reference_mask_sha256`` of the ground truth, ``prediction_mask_sha256`` of the
    prediction NRRD) and the connectivity, so the bytes are a pure function of the two masks and the connectivity:
    building twice gives identical bytes, and the artifact is content-addressed (sha256 of the bytes) like every other
    served artifact. v1 of this format (no regions) was never released; its files are not read.

Needs scipy to BUILD (the labelling), numpy only to read; scipy is imported on first use.
"""

from __future__ import annotations

import hashlib
import json
import re
import struct
from typing import Any, Dict, List, Tuple

import numpy as np

from .artifact import (
    FRAME, INDEX_CONVENTION, MAGIC, MeshArtifactError, _pad, lattice_arrays, mask_from_zyx, pick_triangle,
)
from .error_geometry import CONNECTIVITY_RANK, DEFAULT_CONNECTIVITY, label_error_class
from .surface import DEFAULT_LEVEL, CaseMesh, build_case_mesh

FORMAT = "cardiac-errormesh/2"
BUILDER = "dr005-L0/v2"
KIND = "error_voxel_face_surface"
MEDIA_TYPE = "application/octet-stream"
PICK_RULE = ("a pick that first hits triangle t navigates to face_source_slice[t] and names the class face_class[t] "
             "and the region face_component[t]; a miss never navigates; nothing is clamped")
LABELLING = ("scipy.ndimage.label with generate_binary_structure(3, rank) for the declared connectivity, as "
             "backend/mesh/error_geometry.py; regions ordered by voxel count descending, first slice ascending, "
             "bounding box, first voxel in C order; ids <class>_<rank>; numbered FP first, then FN")
HEX64 = re.compile(r"[0-9a-f]{64}")
COMPONENT_KEYS = {"id", "class", "voxels", "first_slice", "slice_voxels"}

CLASS_FP = 1
CLASS_FN = 2
# (name, code, rule): the order of the class blocks in the file and of ``header["classes"]``.
CLASSES: Tuple[Tuple[str, int, str], ...] = (
    ("FP", CLASS_FP, "prediction AND NOT ground truth"),
    ("FN", CLASS_FN, "ground truth AND NOT prediction"),
)
CLASS_NAME = {code: name for name, code, _rule in CLASSES}

__all__ = ["FORMAT", "BUILDER", "CLASSES", "CLASS_FP", "CLASS_FN", "CLASS_NAME", "build_error_artifact",
           "decode_error_mesh", "read_error_header", "error_sets", "face_voxels", "component_index_bytes",
           "pick_triangle"]


def error_sets(prediction_xyz: np.ndarray, reference_xyz: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """``(fp, fn, tp)`` boolean volumes of a prediction and a ground truth indexed [x, y, z]."""
    return prediction_xyz & ~reference_xyz, reference_xyz & ~prediction_xyz, prediction_xyz & reference_xyz


def component_index_bytes(count: int) -> int:
    """The smallest of 1, 2, 4 bytes whose unsigned type holds region numbers 1..count."""
    return 1 if count <= 0xFF else 2 if count <= 0xFFFF else 4


def face_voxels(mesh: CaseMesh) -> np.ndarray:
    """The class voxel behind every triangle of a level-0 voxel-face mesh, (T, 3) int64 in [x, y, z].

    The minimum lattice corner of the triangle along the two in-plane axes, and along the face axis the plane itself for
    a face whose outward normal points down and the plane minus one for one that points up (voxel k spans [k, k + 1)).
    """
    corners = np.rint(mesh.vertices_world[mesh.triangles]).astype(np.int64)      # (T, 3 corners, 3 axes)
    voxel = corners.min(axis=1)
    axis = mesh.face_axis.astype(np.int64)
    up = np.flatnonzero(mesh.face_sign > 0)
    voxel[up, axis[up]] -= 1
    return voxel


def _class_block(region_xyz: np.ndarray, name: str, connectivity: int, offset: int):
    """One class: ``(vertices (V, 3), triangles (T, 3) local to the block, face_source_slice (T,), component per face (T,),
    component entries, voxels)``.

    The surface comes from ``build_case_mesh`` - the same faces, winding and source slices as the prediction and
    ground-truth meshes - and the regions from ``label_error_class``. ``offset`` is the number of regions of the classes
    before this one, so the region numbers of the file are ``offset + rank``.
    """
    voxels = int(np.count_nonzero(region_xyz))
    if voxels == 0:
        return (np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.int64), np.zeros((0,), dtype=np.int64),
                np.zeros((0,), dtype=np.int64), [], 0)
    mesh = build_case_mesh(region_xyz, DEFAULT_LEVEL, spacing=(1.0, 1.0, 1.0), origin=(0.0, 0.0, 0.0))
    _shape, vertices, slices = lattice_arrays(mesh)
    labelled = label_error_class(region_xyz, name, connectivity=connectivity)
    voxel = face_voxels(mesh)
    rank = labelled.rank_at(voxel[:, 0], voxel[:, 1], voxel[:, 2])
    if rank.size and int(rank.min()) < 1:
        raise MeshArtifactError("FACE_VOXEL_NOT_IN_CLASS", f"a {name} face lies on a voxel outside the {name} set")
    if not np.array_equal(voxel[:, 2], mesh.face_source_slice.astype(np.int64)):
        raise MeshArtifactError("FACE_SLICE_MISMATCH", f"a {name} face's source slice is not the slice of its voxel")
    entries: List[Dict[str, Any]] = []
    for record in labelled.records:
        first, count = int(record["slices"][0]), len(record["slices"])
        if record["slices"] != list(range(first, first + count)):
            raise MeshArtifactError("COMPONENT_SLICES_GAP", f"{record['id']}: a connected set has no gap in z")
        per_slice = [int(v) for v in record["slice_voxels"]]
        if sum(per_slice) != int(record["voxel_count"]) or min(per_slice) < 1:
            raise MeshArtifactError("COMPONENT_COUNTS", f"{record['id']}: per-slice voxel counts do not add up")
        entries.append({"id": record["id"], "class": name, "voxels": int(record["voxel_count"]),
                        "first_slice": first, "slice_voxels": per_slice})
    return vertices, mesh.triangles.astype(np.int64), slices.astype(np.int64), (rank + offset).astype(np.int64), \
        entries, voxels


def build_error_artifact(prediction_zyx: np.ndarray, reference_zyx: np.ndarray, *, prediction_sha256: str,
                         reference_sha256: str, connectivity: int = DEFAULT_CONNECTIVITY) -> Tuple[bytes, Dict[str, Any]]:
    """Build the error artifact of a (z, y, x) prediction and ground-truth pair: ``(bytes, info)``.

    ``info`` is what the sidecar records: counts, shape, both source digests, the connectivity and the sha256 of the
    bytes. Raises ``MeshArtifactError``: SHAPE_MISMATCH (the two volumes are not one grid), MASK_DIGEST (a digest is not
    64 lower-case hex); ``backend.mesh.GeometryError`` for an unsupported connectivity. Two volumes that agree everywhere
    give a valid artifact with no triangle: zero error is a fact.
    """
    for label, digest in (("prediction_sha256", prediction_sha256), ("reference_sha256", reference_sha256)):
        if not isinstance(digest, str) or not HEX64.fullmatch(digest):
            raise MeshArtifactError("MASK_DIGEST", f"{label} must be 64 lower-case hex characters")
    prediction = mask_from_zyx(prediction_zyx)
    reference = mask_from_zyx(reference_zyx)
    if prediction.shape != reference.shape:
        raise MeshArtifactError("SHAPE_MISMATCH", f"prediction {list(prediction.shape)} and ground truth "
                                                  f"{list(reference.shape)} are not one grid")
    shape = [int(v) for v in prediction.shape]
    fp, fn, tp = error_sets(prediction, reference)
    tp_voxels = int(np.count_nonzero(tp))
    regions = {"FP": fp, "FN": fn}

    vertices: List[np.ndarray] = []
    triangles: List[np.ndarray] = []
    slices: List[np.ndarray] = []
    classes_out: List[np.ndarray] = []
    components_out: List[np.ndarray] = []
    entries: List[Dict[str, Any]] = []
    components: List[Dict[str, Any]] = []
    vertex_start = triangle_start = 0
    for name, code, rule in CLASSES:
        block = _class_block(regions[name], name, connectivity, len(components))
        block_vertices, block_triangles, block_slices, block_components, block_entries, voxels = block
        vertices.append(block_vertices)
        triangles.append(block_triangles + vertex_start)
        slices.append(block_slices)
        classes_out.append(np.full(block_triangles.shape[0], code, dtype=np.uint8))
        components_out.append(block_components)
        entries.append({
            "name": name, "code": code, "rule": rule, "voxels": voxels,
            "vertex_range": [vertex_start, vertex_start + block_vertices.shape[0]],
            "triangle_range": [triangle_start, triangle_start + block_triangles.shape[0]],
            "component_range": [len(components) + 1, len(components) + 1 + len(block_entries)],
        })
        components.extend(block_entries)
        vertex_start += block_vertices.shape[0]
        triangle_start += block_triangles.shape[0]
    del regions, fp, fn

    all_vertices = np.concatenate(vertices).astype(np.uint16)
    all_triangles = np.concatenate(triangles)
    all_slices = np.concatenate(slices).astype(np.uint16)
    all_classes = np.concatenate(classes_out)
    all_components = np.concatenate(components_out)
    index_bytes = 2 if vertex_start < 65536 else 4
    comp_bytes = component_index_bytes(len(components))
    header = {
        "format": FORMAT, "kind": KIND, "builder": BUILDER, "level": 0,
        "vertex_count": int(vertex_start), "triangle_count": int(triangle_start), "index_bytes": index_bytes,
        "shape": shape, "index_convention": INDEX_CONVENTION, "frame": FRAME,
        "vertex_layout": "uint16 x,y,z lattice corner: x=column, y=row, z=slice; voxel k spans [k, k+1)",
        "classes": entries, "agreement_voxels": tp_voxels,
        "connectivity": int(connectivity), "labelling": LABELLING,
        "component_count": len(components), "component_index_bytes": comp_bytes, "components": components,
        "reference_mask_sha256": reference_sha256, "prediction_mask_sha256": prediction_sha256,
        "pick_rule": PICK_RULE,
    }
    raw = json.dumps(header, sort_keys=True, separators=(",", ":")).encode("utf-8")
    raw += b" " * _pad(12 + len(raw))
    parts = [MAGIC, struct.pack("<I", len(raw)), raw]

    def section(array: np.ndarray, dtype: str) -> None:
        data = np.ascontiguousarray(array, dtype=np.dtype(dtype).newbyteorder("<")).tobytes()
        parts.append(data)
        parts.append(b"\x00" * _pad(len(data)))

    section(all_vertices, "<u2")
    section(all_triangles, "<u2" if index_bytes == 2 else "<u4")
    section(all_slices, "<u2")
    section(all_classes, "u1")
    section(all_components, {1: "u1", 2: "<u2", 4: "<u4"}[comp_bytes])
    payload = b"".join(parts)
    fp_entry, fn_entry = entries
    return payload, {
        "format": FORMAT, "builder": BUILDER, "level": 0, "shape": shape, "connectivity": int(connectivity),
        "reference_mask_sha256": reference_sha256, "prediction_mask_sha256": prediction_sha256,
        "vertex_count": int(vertex_start), "triangle_count": int(triangle_start),
        "fp_voxels": fp_entry["voxels"], "fn_voxels": fn_entry["voxels"], "tp_voxels": tp_voxels,
        "fp_triangles": fp_entry["triangle_range"][1] - fp_entry["triangle_range"][0],
        "fn_triangles": fn_entry["triangle_range"][1] - fn_entry["triangle_range"][0],
        "component_count": len(components),
        "fp_components": fp_entry["component_range"][1] - fp_entry["component_range"][0],
        "fn_components": fn_entry["component_range"][1] - fn_entry["component_range"][0],
        "component_index_bytes": comp_bytes, "header_bytes": len(raw),
        "bytes": len(payload), "mesh_sha256": hashlib.sha256(payload).hexdigest(),
    }


def read_error_header(payload: bytes) -> Dict[str, Any]:
    """The header of an error artifact, after checking the magic, the class table, the component table and that the
    sections fit the file exactly."""
    if len(payload) < 12 or payload[:8] != MAGIC:
        raise MeshArtifactError("MESH_MAGIC", "not a cardiac-mesh container")
    (length,) = struct.unpack_from("<I", payload, 8)
    if length % 4 or 12 + length > len(payload):
        raise MeshArtifactError("MESH_HEADER", "header length is not aligned or runs past the end")
    try:
        header = json.loads(payload[12:12 + length].decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise MeshArtifactError("MESH_HEADER", f"header is not JSON: {exc}")
    if not isinstance(header, dict) or header.get("format") != FORMAT:
        raise MeshArtifactError("MESH_FORMAT", f"format is not {FORMAT}")
    for key in ("vertex_count", "triangle_count", "index_bytes", "shape", "index_convention", "frame", "classes",
                "reference_mask_sha256", "prediction_mask_sha256", "connectivity", "components", "component_count",
                "component_index_bytes"):
        if key not in header:
            raise MeshArtifactError("MESH_HEADER", f"header lacks {key}")
    if header["index_bytes"] not in (2, 4) or header["index_convention"] != INDEX_CONVENTION \
            or header["frame"] != FRAME or header.get("level") != 0:
        raise MeshArtifactError("MESH_HEADER", "unsupported index_bytes / convention / frame / level")
    for key in ("reference_mask_sha256", "prediction_mask_sha256"):
        if not isinstance(header[key], str) or not HEX64.fullmatch(header[key]):
            raise MeshArtifactError("MESH_HEADER", f"{key} is not a sha256")
    v, t = int(header["vertex_count"]), int(header["triangle_count"])
    _check_class_table(header["classes"], v, t)
    _check_component_table(header)
    expected = 12 + length
    for size in (v * 3 * 2, t * 3 * int(header["index_bytes"]), t * 2, t, t * int(header["component_index_bytes"])):
        expected += size + _pad(size)
    if expected != len(payload):
        raise MeshArtifactError("MESH_LENGTH", f"sections need {expected} bytes, the file has {len(payload)}")
    return header


def _check_class_table(classes: Any, vertex_count: int, triangle_count: int) -> None:
    """FP then FN, codes 1 and 2, contiguous ranges that together cover the vertices and the triangles exactly."""
    if not isinstance(classes, list) or [entry.get("name") if isinstance(entry, dict) else None for entry in classes] \
            != [name for name, _code, _rule in CLASSES]:
        raise MeshArtifactError("MESH_CLASSES", "the class table must list FP then FN")
    vertex_at = triangle_at = 0
    for entry, (name, code, _rule) in zip(classes, CLASSES):
        if entry.get("code") != code:
            raise MeshArtifactError("MESH_CLASSES", f"class {name} must have code {code}")
        voxels = entry.get("voxels")
        v_range, t_range = entry.get("vertex_range"), entry.get("triangle_range")
        if not (isinstance(voxels, int) and not isinstance(voxels, bool) and voxels >= 0):
            raise MeshArtifactError("MESH_CLASSES", f"class {name} has no voxel count")
        if not (isinstance(v_range, list) and len(v_range) == 2 and v_range[0] == vertex_at and v_range[1] >= v_range[0]
                and isinstance(t_range, list) and len(t_range) == 2 and t_range[0] == triangle_at
                and t_range[1] >= t_range[0]):
            raise MeshArtifactError("MESH_CLASSES", f"class {name} ranges are not contiguous")
        if (voxels == 0) != (t_range[1] == t_range[0]) or (voxels == 0) != (v_range[1] == v_range[0]):
            raise MeshArtifactError("MESH_CLASSES", f"class {name}: voxels and triangles disagree about being empty")
        if t_range[1] - t_range[0] > 12 * voxels or v_range[1] - v_range[0] > 8 * voxels:
            raise MeshArtifactError("MESH_CLASSES", f"class {name}: more faces than {voxels} voxels can have")
        vertex_at, triangle_at = v_range[1], t_range[1]
    if vertex_at != vertex_count or triangle_at != triangle_count:
        raise MeshArtifactError("MESH_CLASSES", "the class ranges do not cover the file")


def _is_count(value: Any, minimum: int = 0) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum


def _check_component_table(header: Dict[str, Any]) -> None:
    """The regions: a declared connectivity, a table of exactly ``component_count`` entries named like error_geometry
    names them, contiguous per-class ranges that cover 1..C, and per region a contiguous run of slices whose voxel counts
    are positive and add up."""
    classes, components, count = header["classes"], header["components"], header["component_count"]
    shape_z = int(header["shape"][2])
    connectivity = header["connectivity"]
    if not (isinstance(connectivity, int) and not isinstance(connectivity, bool) and connectivity in CONNECTIVITY_RANK):
        raise MeshArtifactError("MESH_COMPONENTS", f"connectivity must be one of {sorted(CONNECTIVITY_RANK)}")
    if not isinstance(components, list) or not _is_count(count) or count != len(components):
        raise MeshArtifactError("MESH_COMPONENTS", "component_count is not the length of the component table")
    if header["component_index_bytes"] != component_index_bytes(count):
        raise MeshArtifactError("MESH_COMPONENTS", f"component_index_bytes must be {component_index_bytes(count)} "
                                                   f"(the smallest type that holds {count})")
    at = 1
    for entry in classes:
        name = entry["name"]
        span = entry.get("component_range")
        if not (isinstance(span, list) and len(span) == 2 and span[0] == at and _is_count(span[1]) and span[1] >= span[0]):
            raise MeshArtifactError("MESH_COMPONENTS", f"class {name}: component_range is not contiguous")
        members = components[span[0] - 1:span[1] - 1]
        if (entry["voxels"] == 0) != (not members):
            raise MeshArtifactError("MESH_COMPONENTS", f"class {name}: voxels and regions disagree about being empty")
        total = 0
        for rank, component in enumerate(members, start=1):
            if not isinstance(component, dict) or set(component) != COMPONENT_KEYS:
                raise MeshArtifactError("MESH_COMPONENTS", f"{name} region {rank}: keys must be {sorted(COMPONENT_KEYS)}")
            per_slice, first = component["slice_voxels"], component["first_slice"]
            if component["class"] != name or component["id"] != f"{name}_{rank:04d}":
                raise MeshArtifactError("MESH_COMPONENTS", f"{name} region {rank}: id / class do not match its place")
            if not (isinstance(per_slice, list) and per_slice and all(_is_count(n, 1) for n in per_slice)
                    and _is_count(first) and first + len(per_slice) <= shape_z):
                raise MeshArtifactError("MESH_COMPONENTS", f"{component['id']}: slices are not a contiguous run in the volume")
            if not _is_count(component["voxels"], 1) or component["voxels"] != sum(per_slice):
                raise MeshArtifactError("MESH_COMPONENTS", f"{component['id']}: voxels is not the sum of slice_voxels")
            total += component["voxels"]
        if total != entry["voxels"]:
            raise MeshArtifactError("MESH_COMPONENTS", f"class {name}: its regions hold {total} voxels, the class {entry['voxels']}")
        at = span[1]
    if at != count + 1:
        raise MeshArtifactError("MESH_COMPONENTS", "the class component ranges do not cover the component table")


def decode_error_mesh(payload: bytes) -> Dict[str, Any]:
    """Header plus numpy arrays: ``vertices`` (V, 3) uint16, ``triangles`` (T, 3), ``face_source_slice`` (T,),
    ``face_class`` (T,) uint8 and ``face_component`` (T,). Every class block is checked: its triangles carry its code,
    index only its own vertices and name only regions of its class, every region owns at least one face, and a face's
    slice is one of its region's slices."""
    header = read_error_header(payload)
    v, t, ib = int(header["vertex_count"]), int(header["triangle_count"]), int(header["index_bytes"])
    cb = int(header["component_index_bytes"])
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
    face_class = take(t, "u1")
    face_component = take(t, {1: "u1", 2: "<u2", 4: "<u4"}[cb])
    shape = header["shape"]
    if v and any(int(vertices[:, axis].max()) > int(shape[axis]) for axis in range(3)):
        raise MeshArtifactError("MESH_VERTEX", "a vertex lies outside [0, shape]")
    if t and int(slices.max()) >= int(shape[2]):
        raise MeshArtifactError("MESH_SLICE", "a source slice is outside the volume")
    components = header["components"]
    for entry in header["classes"]:
        v0, v1 = entry["vertex_range"]
        t0, t1 = entry["triangle_range"]
        c0, c1 = entry["component_range"]
        if t1 > t0:
            block = triangles[t0:t1]
            if int(block.min()) < v0 or int(block.max()) >= v1:
                raise MeshArtifactError("MESH_INDEX", f"a {entry['name']} triangle indexes outside its own vertices")
            if np.any(face_class[t0:t1] != entry["code"]):
                raise MeshArtifactError("MESH_CLASS", f"a face in the {entry['name']} block carries another class")
            named = face_component[t0:t1].astype(np.int64)
            if int(named.min()) < c0 or int(named.max()) >= c1:
                raise MeshArtifactError("MESH_COMPONENT", f"a face in the {entry['name']} block names a region of another class")
            if np.any(np.bincount(named - c0, minlength=c1 - c0) == 0):
                raise MeshArtifactError("MESH_COMPONENT", f"a {entry['name']} region owns no face")
            first = np.array([components[c - 1]["first_slice"] for c in range(c0, c1)], dtype=np.int64)
            span = np.array([len(components[c - 1]["slice_voxels"]) for c in range(c0, c1)], dtype=np.int64)
            offset_in_region = slices[t0:t1].astype(np.int64) - first[named - c0]
            if int(offset_in_region.min()) < 0 or np.any(offset_in_region >= span[named - c0]):
                raise MeshArtifactError("MESH_COMPONENT", f"a {entry['name']} face lies on a slice its region does not contribute to")
    return {"header": header, "vertices": vertices, "triangles": triangles, "face_source_slice": slices,
            "face_class": face_class, "face_component": face_component}
