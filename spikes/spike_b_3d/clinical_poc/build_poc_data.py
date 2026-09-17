#!/usr/bin/env python3
"""Export a compact, local-only MPR payload for the cardiac MRI feasibility POC.

The source scan, labels, OBJ, and generated payload are deliberately outside
Git. This command only creates a local demo directory from files the operator
is already authorised to use.
"""
import argparse
import json
from pathlib import Path
import shutil
import nibabel as nib
import numpy as np

HERE = Path(__file__).resolve().parent


def parse_origin(value: str) -> list[float]:
    parts = [float(v) for v in value.split(',')]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError('mesh origin must be X,Y,Z in mm')
    return parts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--mri', type=Path, required=True, help='authorised MRI volume readable by nibabel')
    ap.add_argument('--label', type=Path, required=True, help='matching binary/label segmentation')
    ap.add_argument('--mesh', type=Path, required=True, help='OBJ generated from the same label')
    ap.add_argument('--out', type=Path, required=True, help='new or existing local demo directory')
    ap.add_argument('--segment-name', default='left atrium')
    ap.add_argument('--downsample', type=int, default=2, help='integer isotropic preview reduction')
    ap.add_argument('--mesh-origin-mm', type=parse_origin, default=[0.0, 0.0, 0.0],
                    help='origin used by the OBJ exporter, defaults to 0,0,0')
    args = ap.parse_args()
    if args.downsample < 1:
        ap.error('--downsample must be positive')
    if not args.mri.is_file() or not args.label.is_file() or not args.mesh.is_file():
        ap.error('--mri, --label, and --mesh must be readable files')

    source_img = nib.load(args.mri)
    image = source_img.get_fdata().astype(np.float32)
    mask = (nib.load(args.label).get_fdata() > 0).astype(np.uint8)
    if image.shape != mask.shape or image.ndim != 3:
        ap.error('MRI and label must be matching 3D volumes')
    step = np.array([args.downsample] * 3)
    preview = image[::args.downsample, ::args.downsample, ::args.downsample]
    preview_mask = mask[::args.downsample, ::args.downsample, ::args.downsample]
    low, high = np.percentile(preview, [1, 99])
    pixels = np.clip((preview - low) * 255 / max(1e-6, high - low), 0, 255).astype(np.uint8)

    out = args.out.resolve()
    data = out / 'poc-data'
    data.mkdir(parents=True, exist_ok=True)
    # Store z,y,x so the browser's row-major slice index is unambiguous.
    pixels.transpose(2, 1, 0).tofile(data / 'mri_u8_zyx.bin')
    preview_mask.transpose(2, 1, 0).tofile(data / 'mask_u8_zyx.bin')
    spacing = [float(v) for v in source_img.header.get_zooms()[:3]]
    meta = {
      'shape_xyz': [int(v) for v in preview.shape],
      'source_shape_xyz': [int(v) for v in image.shape],
      'downsample_xyz': [int(v) for v in step],
      'source_spacing_xyz_mm': spacing,
      'mesh_origin_world_mm': args.mesh_origin_mm,
      'segment': args.segment_name,
      'source': 'operator-provided local volume',
      'landmarks_available': [f'{args.segment_name} surface only'],
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
    shutil.copy2(args.mesh, mesh_out / 'level_0_cell1.obj')
    # The reused 3D controller resolves a picked world point using this source
    # volume geometry.  Keep it separate from preview meta: the browser MPR is
    # downsampled, while the mesh is expressed in source-image coordinates.
    mesh_summary = {
      '_status': 'LOCAL POC input - not acceptance evidence',
      'fixture': 'operator-provided local volume',
      'shape_xyz': [int(v) for v in image.shape],
      'spacing_xyz_mm': spacing,
      'origin_world_mm': args.mesh_origin_mm,
      'segment': args.segment_name,
    }
    (mesh_out / 'mesh_levels.json').write_text(json.dumps(mesh_summary, indent=2) + '\n')
    print(f'wrote {out} ({meta["shape_xyz"]}, {(data / "mri_u8_zyx.bin").stat().st_size} MRI bytes)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
