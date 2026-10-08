#!/usr/bin/env python3
"""Export a compact, local-only MPR payload for the cardiac MRI feasibility POC.

The source scan, labels, OBJ, and generated payload are deliberately outside
Git. This command only creates a local demo directory from files the operator
is already authorised to use.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import shutil
import nibabel as nib
import numpy as np

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
sys.path.insert(0, str(REPO_ROOT))

from backend.mesh.surface import build_case_mesh


def _affine_mm(image, name: str):
    """Normalize NIfTI spatial units; unknown units cannot justify mm/mL."""
    get_units = getattr(image.header, "get_xyzt_units", None)
    unit = get_units()[0] if get_units else "unknown"
    scale = {"mm": 1.0, "meter": 1000.0, "micron": 0.001}.get(unit)
    if scale is None:
        raise ValueError(f"{name} must declare spatial units (mm, meter or micron); refusing assumed millimetres")
    affine = np.asarray(image.affine, dtype=np.float64).copy()
    affine[:3, :] *= scale
    if not np.isfinite(affine).all():
        raise ValueError(f"{name} affine contains non-finite coordinates")
    return affine, scale


def _load_aligned_volumes(mri_path: Path, label_path: Path, label_value: int):
    """Load the MRI and label on one verified, axis-aligned RAS grid.

    The POC deliberately refuses oblique/sheared geometry instead of labeling
    voxel axes as anatomical axial/coronal/sagittal views. Reorienting to the
    closest canonical orientation handles axis permutations and flips without
    resampling the label map.
    """
    mri_source = nib.load(str(mri_path))
    label_source = nib.load(str(label_path))
    if len(mri_source.shape) != 3 or len(label_source.shape) != 3:
        raise ValueError("MRI and label must both be 3D volumes")
    if mri_source.shape != label_source.shape:
        raise ValueError("MRI and label shapes differ")
    mri_affine_mm, mri_scale = _affine_mm(mri_source, "MRI")
    label_affine_mm, _label_scale = _affine_mm(label_source, "labelmap")
    if not np.allclose(mri_affine_mm, label_affine_mm, rtol=0.0, atol=1e-5):
        raise ValueError("MRI and label affine transforms differ; refusing misregistered inputs")

    mri = nib.as_closest_canonical(mri_source)
    label = nib.as_closest_canonical(label_source)
    affine = np.asarray(mri.affine, dtype=np.float64).copy()
    affine[:3, :] *= mri_scale
    directions = affine[:3, :3]
    spacing = np.linalg.norm(directions, axis=0)
    if not np.isfinite(spacing).all() or np.any(spacing <= 0):
        raise ValueError("MRI affine has invalid voxel spacing")
    diagonal = np.diag(spacing)
    if not np.allclose(directions, diagonal, rtol=0.0, atol=1e-5):
        raise ValueError("MRI axes are oblique or sheared; resample to an axis-aligned RAS grid first")

    image = np.asarray(mri.get_fdata(dtype=np.float32), dtype=np.float32)
    labels = np.asarray(label.get_fdata(dtype=np.float32), dtype=np.float32)
    if not np.isfinite(image).all() or not np.isfinite(labels).all():
        raise ValueError("MRI and label must contain only finite values")
    if not np.equal(labels, np.rint(labels)).all():
        raise ValueError("segmentation labelmap must contain integer class IDs")
    mask = labels == label_value
    if not mask.any():
        raise ValueError(f"label value {label_value} is absent from the segmentation")
    origin_ras = affine[:3, 3]
    return image, mask.astype(np.uint8), spacing, origin_ras, mri


def _write_obj(path: Path, mesh) -> str:
    """Write the exact product mesh; this display source stays in RAS mm."""
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write("# Derived from the selected source labelmap; exact voxel-face geometry\n")
        stream.write(f"# geometry_contract_version: {mesh.geometry_contract_version}\n")
        for x, y, z in mesh.vertices_world:
            stream.write(f"v {x:.7f} {y:.7f} {z:.7f}\n")
        for a, b, c in mesh.triangles:
            stream.write(f"f {int(a) + 1} {int(b) + 1} {int(c) + 1}\n")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--mri', type=Path, required=True, help='authorised MRI volume readable by nibabel')
    ap.add_argument('--label', type=Path, required=True, help='matching binary/label segmentation')
    ap.add_argument('--out', type=Path, required=True, help='new or existing local demo directory')
    ap.add_argument('--segment-name', default='left atrium')
    ap.add_argument('--label-value', type=int, default=1,
                    help='integer class ID in the labelmap (default: 1)')
    ap.add_argument('--downsample', type=int, default=1,
                    help='in-plane preview stride; all source slices remain navigable')
    args = ap.parse_args()
    if args.downsample < 1:
        ap.error('--downsample must be a positive integer')
    if _is_within(args.out, REPO_ROOT):
        ap.error('--out must be outside the repository; local MRI and label bytes must not be written into Git')
    if not args.mri.is_file() or not args.label.is_file():
        ap.error('--mri and --label must be readable files')

    try:
        image, mask, spacing, origin_ras, _source_img = _load_aligned_volumes(
            args.mri, args.label, args.label_value)
    except ValueError as error:
        ap.error(str(error))
    step = np.array([args.downsample, args.downsample, 1], dtype=np.int64)
    preview = image[::args.downsample, ::args.downsample, :]
    preview_mask = mask[::args.downsample, ::args.downsample, :]
    low, high = np.percentile(preview, [1, 99])
    if high <= low:
        pixels = np.zeros(preview.shape, dtype=np.uint8)
    else:
        pixels = np.clip((preview - low) * 255 / (high - low), 0, 255).astype(np.uint8)

    out = args.out.resolve()
    data = out / 'poc-data'
    data.mkdir(parents=True, exist_ok=True)
    # Canonical arrays are x,y,z; store z,y,x for row-major browser access.
    pixels.transpose(2, 1, 0).tofile(data / 'mri_u8_zyx.bin')
    preview_mask.transpose(2, 1, 0).tofile(data / 'mask_u8_zyx.bin')
    spacing = [float(v) for v in spacing]
    origin_ras = [float(v) for v in origin_ras]
    centroid_source = np.argwhere(mask != 0).mean(axis=0)
    centroid_preview = [float(centroid_source[i] / step[i]) for i in range(3)]
    # NIfTI affine maps integer indices to voxel centres. The backend's
    # half-open cell contract maps integer indices to LOW corners instead.
    # Convert only the mesh origin; MPR continues to use NIfTI centre positions.
    mesh_origin_ras = [origin_ras[i] - spacing[i] / 2 for i in range(3)]
    mesh = build_case_mesh(mask.astype(bool), level=0, spacing=spacing,
                           origin=mesh_origin_ras, shape_xyz=image.shape)
    meta = {
      'shape_xyz': [int(v) for v in preview.shape],
      'source_shape_xyz': [int(v) for v in image.shape],
      'downsample_xyz': [int(v) for v in step],
      'source_spacing_xyz_mm': spacing,
      'source_origin_ras_mm': origin_ras,
      'source_origin_reference': 'voxel_center',
      'spatial_unit': 'mm',
      'preview_spacing_xyz_mm': [float(spacing[i] * step[i]) for i in range(3)],
      'centroid_preview_xyz': centroid_preview,
      'segment': args.segment_name,
      'label_value': args.label_value,
      'source': 'operator-provided local volume and labelmap',
      'coordinate_system': 'RAS',
      'slice_views': {'axial': 'RAS XY', 'coronal': 'RAS XZ', 'sagittal': 'RAS YZ'},
      'segment_voxels': int(mask.sum()),
      'segment_volume_ml': float(mask.sum() * np.prod(spacing) / 1000.0),
      'mesh': {'representation': 'exact voxel-face source-label geometry',
               'origin_cell_corner_ras_mm': mesh_origin_ras,
               'vertex_count': mesh.vertex_count, 'triangle_count': mesh.triangle_count,
               'content_sha256': mesh.content_sha256()},
      'landmarks_available': [f'{args.segment_name} label only'],
      'landmarks_unavailable': ['pulmonary-vein ostia', 'left-atrial appendage label', 'mitral annulus label'],
    }
    (data / 'meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    shutil.copy2(HERE / 'poc.html', out / 'poc.html')
    shutil.copy2(HERE / 'poc.js', out / 'poc.js')
    shutil.copytree(HERE.parent / 'app', out / 'clinical-app', dirs_exist_ok=True)
    shutil.copy2(HERE / 'clinical_index.html', out / 'clinical-app' / 'index.html')
    viewer = out / 'clinical-app' / 'viewer.js'
    viewer.write_text(viewer.read_text().replace(
        "status.textContent = 'level_0_cell1.obj · loaded';",
        "status.textContent = 'segmentation surface · loaded';"))
    mesh_out = out / 'mesh' / 'out'
    mesh_out.mkdir(parents=True, exist_ok=True)
    obj_path = mesh_out / 'level_0_cell1.obj'
    obj_sha256 = _write_obj(obj_path, mesh)
    pick_map_path = mesh_out / 'level_0_cell1.pickmap.json'
    pick_map_path.write_text(json.dumps({
      'kind': 'cmw-triangle-to-source-slice/1',
      'mesh_sha256': obj_sha256,
      'geometry_contract_version': mesh.geometry_contract_version,
      'triangle_count': mesh.triangle_count,
      'source_slice_by_triangle': mesh.face_source_slice.tolist(),
      'pick_rule': 'hit triangle maps to the foreground voxel face source slice',
    }, separators=(',', ':')) + '\n')
    mesh_summary = {
      '_status': 'LOCAL REVIEW POC - not clinical acceptance evidence',
      'fixture': 'operator-provided local MRI + labelmap',
      'shape_xyz': [int(v) for v in image.shape],
      'spacing_xyz_mm': spacing,
      'origin_world_mm': mesh_origin_ras,
      'origin_reference': 'voxel_low_corner',
      'source_voxel_center_origin_ras_mm': origin_ras,
      'coordinate_system': 'RAS',
      'spatial_unit': 'mm',
      'geometry_contract_version': mesh.geometry_contract_version,
      'segment': args.segment_name,
      'mask_source': 'selected integer label value from aligned labelmap',
      'levels': [{
        'level': 0, 'cluster_cell_voxels': 1,
        'vertex_count': mesh.vertex_count, 'triangle_count': mesh.triangle_count,
        'sha256': obj_sha256,
        'obj': 'mesh/out/level_0_cell1.obj',
      }],
    }
    (mesh_out / 'mesh_levels.json').write_text(json.dumps(mesh_summary, indent=2) + '\n')
    print(f'wrote {out} ({meta["shape_xyz"]}, {mesh.triangle_count} exact surface triangles)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
