#!/usr/bin/env python3
"""Build a local MPR + volume-ray-casting + Marching Cubes comparison POC.

The input MRI and labelmap stay outside Git. This is a visualization harness,
not a clinical viewer or a segmentation/diagnosis tool.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil

import nibabel as nib
import numpy as np
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def load_mri(path: Path):
    if path.is_dir():
        try:
            import SimpleITK as sitk
        except ImportError as exc:
            raise SystemExit("DICOM input needs SimpleITK; install volume_surface_poc/requirements.txt") from exc
        series_ids = sitk.ImageSeriesReader.GetGDCMSeriesIDs(str(path)) or []
        if len(series_ids) != 1:
            raise SystemExit(f"Expected exactly one DICOM series in {path}; found {len(series_ids)}")
        names = sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(path), series_ids[0])
        reader = sitk.ImageSeriesReader()
        reader.SetFileNames(names)
        image = reader.Execute()
        # SimpleITK returns Z,Y,X; the app contract is X,Y,Z.
        volume = sitk.GetArrayFromImage(image).transpose(2, 1, 0)
        direction_lps = np.asarray(image.GetDirection(), dtype=np.float64).reshape(3, 3)
        lps_to_ras = np.diag([-1.0, -1.0, 1.0])
        direction_ras = lps_to_ras @ direction_lps
        spacing = np.asarray(image.GetSpacing(), dtype=np.float64)
        origin_ras = lps_to_ras @ np.asarray(image.GetOrigin(), dtype=np.float64)
        affine = np.eye(4, dtype=np.float64)
        affine[:3, :3] = direction_ras @ np.diag(spacing)
        affine[:3, 3] = origin_ras
        return volume, affine, "DICOM series"

    image = nib.load(str(path))
    return np.asanyarray(image.dataobj, dtype=np.float32), image.affine.astype(np.float64), "NIfTI volume"


def require_axis_aligned(affine: np.ndarray) -> np.ndarray:
    linear = affine[:3, :3]
    diagonal = np.diag(linear)
    off_axis = linear - np.diag(diagonal)
    if np.max(np.abs(off_axis)) > 1e-4 or np.any(np.abs(diagonal) < 1e-6):
        raise SystemExit("This Spike B POC only accepts validated axis-aligned geometry (DR-012).")
    return diagonal


def write_obj(path: Path, vertices_mm: np.ndarray, faces: np.ndarray, label: int, smoothing: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(f"# derived display mesh; source labelmap label={label}; smoothing={smoothing}\n")
        for vertex in vertices_mm:
            stream.write(f"v {vertex[0]:.6f} {vertex[1]:.6f} {vertex[2]:.6f}\n")
        for face in faces:
            stream.write(f"f {face[0] + 1} {face[1] + 1} {face[2] + 1}\n")


def mesh_for_label(mask: np.ndarray, signed_spacing: np.ndarray, label: int, sigma_mm: float):
    padded = np.pad(mask.astype(np.float32), 1)
    if sigma_mm > 0:
        sigma_vox = sigma_mm / np.abs(signed_spacing)
        field = gaussian_filter(padded, sigma=sigma_vox, mode="constant", cval=0.0)
    else:
        field = padded
    vertices_xyz, faces, _normals, _values = marching_cubes(field, level=0.5, allow_degenerate=False)
    # Marching Cubes vertices address voxel centres; remove the one-voxel pad,
    # then store centered physical-mm positions so display and picking share a frame.
    vertices_crop = vertices_xyz - 1.0
    centre = (np.asarray(mask.shape, dtype=np.float64) - 1.0) / 2.0
    vertices_mm = (vertices_crop - centre) * signed_spacing
    return vertices_mm, faces


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mri", type=Path, required=True, help="axis-aligned NIfTI or a directory containing one DICOM series")
    parser.add_argument("--label", type=Path, required=True, help="matching integer labelmap NIfTI")
    parser.add_argument("--out", type=Path, required=True, help="local output directory outside the repository")
    parser.add_argument("--margin", type=int, default=16, help="3D ray-casting crop margin around all labels, in voxels")
    parser.add_argument("--smooth-mm", type=float, default=0.65, help="optional derived-surface Gaussian sigma; 0 disables")
    args = parser.parse_args()
    if args.margin < 0 or args.smooth_mm < 0:
        parser.error("--margin and --smooth-mm must be non-negative")
    if not args.mri.exists() or not args.label.is_file():
        parser.error("MRI input and labelmap must exist")
    out = args.out.resolve()
    if out == REPO or REPO in out.parents:
        parser.error("--out must be outside the repository; generated MRI and meshes stay out of Git")

    image, affine, source_format = load_mri(args.mri)
    label_img = nib.load(str(args.label))
    label = np.asanyarray(label_img.dataobj)
    if image.ndim != 3 or label.ndim != 3 or image.shape != label.shape:
        raise SystemExit(f"MRI/label shape mismatch: {image.shape} vs {label.shape}")
    if not np.allclose(affine, label_img.affine, rtol=0.0, atol=1e-4):
        raise SystemExit("MRI and labelmap affine differ; refusing to silently resample or misregister them")
    if not np.allclose(label, np.rint(label), rtol=0.0, atol=1e-4):
        raise SystemExit("Labelmap contains fractional values; expected integer label IDs")

    signed_spacing = require_axis_aligned(affine)
    label = np.rint(label).astype(np.uint16, copy=False)
    labels = [int(value) for value in np.unique(label) if value != 0]
    if not labels:
        raise SystemExit("Labelmap is empty")
    if max(labels) > 255:
        raise SystemExit("This POC currently supports label IDs 1..255")

    finite = np.isfinite(image)
    nonzero = image[finite & (image != 0)]
    if nonzero.size == 0:
        raise SystemExit("MRI contains no non-zero finite samples")
    low, high = np.percentile(nonzero, [1.0, 99.5])
    if high <= low:
        raise SystemExit("MRI intensity range is empty")
    windowed = np.clip((np.nan_to_num(image, nan=low) - low) / (high - low), 0.0, 1.0)
    image_u8 = np.rint(windowed * 255.0).astype(np.uint8)
    image_u16 = np.rint(windowed * 65535.0).astype(np.uint16)

    occupied = np.argwhere(label > 0)
    source_shape = np.asarray(image.shape, dtype=np.int64)
    crop_min = np.maximum(occupied.min(axis=0) - args.margin, 0)
    crop_max = np.minimum(occupied.max(axis=0) + args.margin + 1, source_shape)
    crop_slices = tuple(slice(int(lo), int(hi)) for lo, hi in zip(crop_min, crop_max))
    volume_crop = image_u8[crop_slices]
    crop_label = label[crop_slices]
    crop_shape = np.asarray(crop_label.shape, dtype=np.int64)

    data_dir = out / "data"
    mesh_dir = data_dir / "meshes"
    data_dir.mkdir(parents=True, exist_ok=True)
    mesh_dir.mkdir(parents=True, exist_ok=True)
    # Raw NIfTI arrays are X,Y,Z; browser payloads are row-major Z,Y,X.
    image_u8.transpose(2, 1, 0).tofile(data_dir / "mpr_mri_u8_zyx.bin")
    label.astype(np.uint8).transpose(2, 1, 0).tofile(data_dir / "mpr_labels_u8_zyx.bin")
    image_u16[crop_slices].transpose(2, 1, 0).tofile(data_dir / "volume_crop_u16_zyx.bin")

    segment_meta = []
    for segment_id in labels:
        segment_mask = crop_label == segment_id
        count = int(segment_mask.sum())
        if count == 0:
            continue
        raw_vertices, raw_faces = mesh_for_label(segment_mask, signed_spacing, segment_id, 0.0)
        raw_name = f"label_{segment_id}_marching_cubes_raw.obj"
        write_obj(mesh_dir / raw_name, raw_vertices, raw_faces, segment_id, "none")
        smooth_info = None
        if args.smooth_mm > 0:
            smooth_vertices, smooth_faces = mesh_for_label(segment_mask, signed_spacing, segment_id, args.smooth_mm)
            smooth_name = f"label_{segment_id}_marching_cubes_smooth.obj"
            write_obj(mesh_dir / smooth_name, smooth_vertices, smooth_faces, segment_id, f"gaussian sigma={args.smooth_mm} mm")
            smooth_info = {
                "file": f"meshes/{smooth_name}",
                "vertex_count": int(smooth_vertices.shape[0]),
                "triangle_count": int(smooth_faces.shape[0]),
                "smoothing_sigma_mm": args.smooth_mm,
            }
        segment_meta.append({
            "label_id": segment_id,
            "name": "left atrium" if len(labels) == 1 else f"label {segment_id}",
            "color_rgb": [0.95, 0.47, 0.18],
            "voxel_count": count,
            "marching_cubes": {
                "file": f"meshes/{raw_name}",
                "vertex_count": int(raw_vertices.shape[0]),
                "triangle_count": int(raw_faces.shape[0]),
                "level": 0.5,
                "smoothing_sigma_mm": 0.0,
            },
            "smoothed_marching_cubes": smooth_info,
        })

    meta = {
        "status": "LOCAL DIAGNOSTIC POC; not a clinical viewer and not acceptance evidence",
        "source_format": source_format,
        "source_name": args.mri.name,
        "shape_xyz": [int(v) for v in source_shape],
        "crop_min_xyz": [int(v) for v in crop_min],
        "crop_shape_xyz": [int(v) for v in crop_shape],
        "spacing_signed_xyz_mm": [float(v) for v in signed_spacing],
        "origin_world_ras_mm": [float(v) for v in affine[:3, 3]],
        "affine_ras": affine.tolist(),
        "intensity_window_nonzero_percentile_1_99_5": [float(low), float(high)],
        "source_of_truth": "original MRI volume + original integer labelmap; meshes are derived display representations",
        "mpr_mri_file": "data/mpr_mri_u8_zyx.bin",
        "mpr_labels_file": "data/mpr_labels_u8_zyx.bin",
        "volume_crop_file": "data/volume_crop_u16_zyx.bin",
        "volume_crop_transform": "direct index subarray of the source MRI; crop_min_xyz maps back to source voxels",
        "volume_texture_encoding": "windowed normalized uint16 from finite nonzero MRI values; 1st and 99.5th percentiles map to 0 and 1",
        "segments": segment_meta,
        "warning": "Public research sample; only the left-atrium label is provided. Not clinical use.",
    }
    (data_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(HERE / "index.html", out / "index.html")
    shutil.copy2(HERE / "viewer.js", out / "viewer.js")
    shutil.copy2(HERE / "viewer_math.js", out / "viewer_math.js")
    shutil.copy2(HERE.parent / "app" / "obj.js", out / "obj.js")
    shutil.copy2(HERE.parent / "app" / "picking.js", out / "picking.js")
    print(f"wrote {out}")
    print(f"  source={source_format} shape_xyz={tuple(source_shape)} spacing_mm={np.abs(signed_spacing).tolist()}")
    print(f"  crop_min_xyz={crop_min.tolist()} crop_shape_xyz={crop_shape.tolist()} labels={labels}")
    for segment in segment_meta:
        raw = segment["marching_cubes"]
        print(f"  label {segment['label_id']}: {segment['voxel_count']} voxels, {raw['triangle_count']} raw MC triangles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
