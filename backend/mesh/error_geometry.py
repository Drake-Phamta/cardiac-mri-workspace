"""DR-005 candidate 3 error geometry: prediction surface + FP/FN component markers (V2-03).

STATUS -- WORKING SKELETON, NOT A DECISION
    DR-005 (how 3-D error is represented; PR-ERR-03, PR-3D-05) is not decided.
    It is decided on Day 24: V2-03 owner Vu Hung Anh brings the recommendation
    from MOB-09 (compressed Spike F: F5/F6 determinism and the +/-1 bound
    offline, F7/F8 on device) and the leader records the decision (DAY20
    plan, D24 18:30). This module implements candidate 3 -- "surface + FP/FN
    connected-component markers with precomputed slice ranges" -- so V2-03 has
    something real to adopt or discard. Built on Day 22 (2026-10-01) under the
    Day 22 recovery override; Vu Hung Anh adopts or rejects it on Day 23.
    Candidate 1 (TP/FP/FN meshes, the desktop control) can be assembled from
    the same pieces: ``include_component_meshes=True`` gives every FP/FN
    component its own voxel-face mesh, and a TP mesh is
    ``build_case_mesh(pred & gt)``.

DEFINITIONS
    FP = pred & ~gt and FN = gt & ~pred, each labelled with
    scipy.ndimage.label using generate_binary_structure(3, r): connectivity
    6 -> r=1 (faces), 18 -> r=2 (+ edges), 26 -> r=3 (+ corners). The default
    is 26, so one error region that steps diagonally between slices is one
    marker, not several; scipy's own default is 6, which is why the structure
    is always passed explicitly. The connectivity used is recorded.

    Per component: ``voxel_count``; ``bbox_voxel`` {lo, hi} INCLUSIVE voxel
    indices; ``source_slice_range`` [zmin, zmax] inclusive and ``slices`` (the
    sorted distinct z), both exact from the voxels, so region -> slice set is
    deterministic with zero slice error; ``centroid_world`` = mean of the voxel
    CENTRES (index + 0.5) in world coordinates; ``marker_world`` = the centre of
    the component's own voxel nearest the centroid (world distance, so
    anisotropic spacing counts; ties -> first voxel in C order), so the marker
    is always inside the region even when the centroid is not (a ring, a U);
    ``marker_voxel`` / ``marker_slice`` say which voxel that is.

ORDER (deterministic; the order is total because components are disjoint)
    1. class: FN before FP (alphabetical)
    2. voxel_count descending
    3. zmin ascending
    4. bbox lo, then bbox hi, lexicographic ascending
    5. first voxel in C order (x, y, z)
    ids are "<class>_<rank>" with rank counted from 1 within the class.

SURFACE
    ``surface`` is ``build_case_mesh(pred, level)`` -- the prediction's
    voxel-face surface at the requested level (DEFAULT 0; DR-008c is
    undecided, see surface.py). An empty prediction has no surface: ``surface``
    is None and ``surface_reason`` says why; the components are still computed.
    Component meshes (optional) are always level 0: components are small and
    clustering can delete a small component entirely.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import numpy as np
from scipy import ndimage

from .geometry import (
    CONNECTIVITY_UNSUPPORTED,
    CONTRACT_VERSION,
    GEOMETRY_MISMATCH,
    GeometryError,
    VolumeGeometry,
    _close,
)
from .surface import CaseMesh, _level_cell, _mesh_from_region, as_binary_mask, build_case_mesh

CONNECTIVITY_RANK = {6: 1, 18: 2, 26: 3}
DEFAULT_CONNECTIVITY = 26
CLASS_ORDER = ("FN", "FP")


def _component_records(region: np.ndarray, cls: str, structure: np.ndarray,
                       geometry: VolumeGeometry, include_meshes: bool) -> list[dict[str, Any]]:
    """Connected components of one error class, sorted, without ids yet."""
    labels, n = ndimage.label(region, structure=structure)
    if n == 0:
        return []
    xs, ys, zs = np.nonzero(labels)                      # C order
    lab = labels[xs, ys, zs].astype(np.int64) - 1
    order = np.argsort(lab, kind="stable")               # group by label, C order inside
    xs, ys, zs, lab = xs[order], ys[order], zs[order], lab[order]
    idx = np.column_stack((xs, ys, zs)).astype(np.int64)
    counts = np.bincount(lab, minlength=n)
    starts = np.concatenate(([0], np.cumsum(counts)[:-1]))
    lo = np.minimum.reduceat(idx, starts, axis=0)
    hi = np.maximum.reduceat(idx, starts, axis=0)
    mean_idx = np.add.reduceat(idx.astype(np.float64), starts, axis=0) / counts[:, None]
    spacing = np.asarray(geometry.spacing, dtype=np.float64)
    origin = np.asarray(geometry.origin, dtype=np.float64)
    centroid_world = origin + (mean_idx + 0.5) * spacing

    # Marker: the member voxel whose centre is nearest the centroid. Both carry
    # the same +0.5, so the offset is (index - mean) * spacing.
    offset = (idx - np.repeat(mean_idx, counts, axis=0)) * spacing
    d2 = np.einsum("ij,ij->i", offset, offset)
    nearest = d2 == np.repeat(np.minimum.reduceat(d2, starts), counts)
    pos = np.flatnonzero(nearest)
    first_of_label = np.concatenate(([True], lab[pos][1:] != lab[pos][:-1]))
    marker_pos = pos[first_of_label]                     # first nearest voxel per label, C order
    marker_idx = idx[marker_pos]
    marker_world = origin + (marker_idx + 0.5) * spacing

    nz = geometry.shape_xyz[2]
    label_z = np.unique(lab * nz + zs)                   # sorted by label, then z
    z_label, z_value = np.divmod(label_z, nz)
    slices = np.split(z_value, np.searchsorted(z_label, np.arange(1, n)))

    records = []
    for k in range(n):
        record: dict[str, Any] = {
            "id": None,
            "class": cls,
            "voxel_count": int(counts[k]),
            "bbox_voxel": {"lo": lo[k].tolist(), "hi": hi[k].tolist()},
            "source_slice_range": [int(lo[k, 2]), int(hi[k, 2])],
            "slices": slices[k].tolist(),
            "centroid_world": centroid_world[k].tolist(),
            "marker_world": marker_world[k].tolist(),
            "marker_voxel": marker_idx[k].tolist(),
            "marker_slice": int(marker_idx[k, 2]),
            "mesh": None,
        }
        if include_meshes:
            crop = labels[lo[k, 0]:hi[k, 0] + 1, lo[k, 1]:hi[k, 1] + 1, lo[k, 2]:hi[k, 2] + 1] == k + 1
            record["mesh"] = _mesh_from_region(np.ascontiguousarray(crop),
                                               tuple(int(v) for v in lo[k]), geometry, 0)
        first = idx[starts[k]]
        record["_sort"] = (-int(counts[k]), int(lo[k, 2]), tuple(lo[k].tolist()),
                           tuple(hi[k].tolist()), tuple(first.tolist()))
        records.append(record)
    records.sort(key=lambda r: r["_sort"])
    for rank, record in enumerate(records, start=1):
        record["id"] = f"{cls}_{rank:04d}"
        del record["_sort"]
    return records


def build_error_geometry(pred_mask: Any, gt_mask: Any, *, spacing: Any, origin: Any,
                         connectivity: int = DEFAULT_CONNECTIVITY, level: int = 0,
                         include_component_meshes: bool = False,
                         gt_spacing: Any = None, gt_origin: Any = None,
                         contract_version: str = CONTRACT_VERSION) -> dict[str, Any]:
    """Candidate 3 error geometry for one prediction / ground-truth pair.

    ``spacing``/``origin`` describe the prediction; ``gt_spacing``/``gt_origin``
    default to them and, when the caller has a separate ground-truth header,
    must agree within Contract 1's tolerance (else GEOMETRY_MISMATCH). Shapes
    must be identical (else GEOMETRY_MISMATCH). Masks follow
    ``as_binary_mask``; an empty mask is allowed here.

    The result is a dict whose ``surface`` and component ``mesh`` values are
    CaseMesh objects; ``error_geometry_to_dict`` makes it JSON-serialisable and
    ``error_geometry_sha256`` gives a stable identity.
    """
    level, cell = _level_cell(level)
    if isinstance(connectivity, (bool, np.bool_)) or not isinstance(connectivity, (int, np.integer)) \
            or int(connectivity) not in CONNECTIVITY_RANK:
        raise GeometryError(CONNECTIVITY_UNSUPPORTED,
                            f"connectivity must be 6, 18 or 26; got {connectivity!r}")
    connectivity = int(connectivity)
    pred = as_binary_mask(pred_mask, name="pred_mask")
    gt = as_binary_mask(gt_mask, name="gt_mask")
    if pred.shape != gt.shape:
        raise GeometryError(GEOMETRY_MISMATCH,
                            f"pred_mask shape {pred.shape} != gt_mask shape {gt.shape}")
    geometry = VolumeGeometry(pred.shape, spacing, origin, contract_version)
    gt_geometry = VolumeGeometry(gt.shape,
                                 spacing if gt_spacing is None else gt_spacing,
                                 origin if gt_origin is None else gt_origin,
                                 contract_version)
    for field in ("spacing", "origin"):
        a, b = getattr(geometry, field), getattr(gt_geometry, field)
        if not all(_close(x, y) for x, y in zip(a, b)):
            raise GeometryError(GEOMETRY_MISMATCH, f"prediction {field} {list(a)} != ground-truth {field} {list(b)}")

    structure = ndimage.generate_binary_structure(3, CONNECTIVITY_RANK[connectivity])
    fn = gt & ~pred
    fp = pred & ~gt
    components = (_component_records(fn, "FN", structure, geometry, include_component_meshes)
                  + _component_records(fp, "FP", structure, geometry, include_component_meshes))

    pred_voxels = int(np.count_nonzero(pred))
    if pred_voxels:
        surface: CaseMesh | None = build_case_mesh(pred, level, spacing=geometry.spacing,
                                                   origin=geometry.origin,
                                                   contract_version=contract_version)
        surface_reason = None
    else:
        surface = None
        surface_reason = "MASK_EMPTY: the prediction has no foreground voxel, so there is no surface"

    def _slices(region: np.ndarray) -> list[int]:
        return np.flatnonzero(region.any(axis=(0, 1))).tolist()

    summary = {
        "pred_voxels": pred_voxels,
        "gt_voxels": int(np.count_nonzero(gt)),
        "tp_voxels": int(np.count_nonzero(pred & gt)),
        "fp_voxels": int(np.count_nonzero(fp)),
        "fn_voxels": int(np.count_nonzero(fn)),
        "fp_components": sum(1 for c in components if c["class"] == "FP"),
        "fn_components": sum(1 for c in components if c["class"] == "FN"),
        "component_count": len(components),
        "fp_slices": _slices(fp),
        "fn_slices": _slices(fn),
    }
    return {
        "kind": "error_geometry",
        "candidate": "DR-005 candidate 3: surface + FP/FN component markers (skeleton; DR-005 undecided)",
        "geometry_contract_version": geometry.geometry_contract_version,
        "geometry": geometry.to_dict(),
        "connectivity": connectivity,
        "level": level,
        "cluster_cell_voxels": cell,
        "class_order": list(CLASS_ORDER),
        "surface_source": "prediction",
        "surface": surface,
        "surface_reason": surface_reason,
        "components": components,
        "summary": summary,
    }


def error_geometry_to_dict(result: dict[str, Any], *, include_mesh_arrays: bool = True) -> dict[str, Any]:
    """JSON-serialisable copy of a ``build_error_geometry`` result.

    With ``include_mesh_arrays=False`` each mesh is replaced by its counts and
    ``content_sha256`` (what ``error_geometry_sha256`` hashes).
    """
    def mesh_out(mesh: CaseMesh | None) -> Any:
        if mesh is None:
            return None
        if include_mesh_arrays:
            return mesh.to_dict()
        return {"content_sha256": mesh.content_sha256(), "level": mesh.level,
                "vertex_count": mesh.vertex_count, "triangle_count": mesh.triangle_count}

    out = {key: value for key, value in result.items() if key not in ("surface", "components")}
    out["surface"] = mesh_out(result["surface"])
    out["components"] = [dict(component, mesh=mesh_out(component["mesh"]))
                         for component in result["components"]]
    return out


def error_geometry_sha256(result: dict[str, Any]) -> str:
    """Stable SHA-256 of a ``build_error_geometry`` result (meshes by their content hash)."""
    canonical = json.dumps(error_geometry_to_dict(result, include_mesh_arrays=False),
                           sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


__all__ = ["CONNECTIVITY_RANK", "DEFAULT_CONNECTIVITY", "CLASS_ORDER", "build_error_geometry",
           "error_geometry_to_dict", "error_geometry_sha256"]
