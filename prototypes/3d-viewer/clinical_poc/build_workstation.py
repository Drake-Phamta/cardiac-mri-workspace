#!/usr/bin/env python3
"""Build the source-linked VTK workstation preview outside Git."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_poc_data import _is_within, load_canonical_pair, parse_array_axes, REPO_ROOT
from surface_preview import VARIANTS, arrays, comparison, surface


def write_array(root, name, values):
    values = np.ascontiguousarray(values)
    path = root / name
    values.tofile(path)
    return {"url": "data/" + name, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def build(mri_path, label_path, out, segments=None, provenance=None, volume_stride=1, array_axes=None):
    out = Path(out).resolve()
    if _is_within(out, REPO_ROOT):
        raise ValueError("Preview image, label and mesh bytes must stay outside the repository")
    if volume_stride < 1:
        raise ValueError("Volume stride must be a positive integer")
    pair = load_canonical_pair(Path(mri_path), Path(label_path), parse_array_axes(array_axes) if array_axes else None)
    image, labels = pair["image"], pair["labels"]
    spacing, origin, affine = pair["spacing"], pair["origin"], pair["affine"]
    values = np.unique(labels)
    if values.min() < 0 or values.max() > 65535:
        raise ValueError("Labelmap must contain finite integer IDs in 0..65535")
    ids = [int(value) for value in values if value != 0]
    if not ids:
        raise ValueError("Labelmap contains no structures")
    labels = labels.astype("<u2")
    assets = HERE / "workstation"
    if not (assets / "dist/main.js").is_file():
        raise ValueError("Run npm ci && npm run build in clinical_poc/workstation first")
    data = out / "data"
    data.mkdir(parents=True, exist_ok=True)
    segments = segments or {}
    provenance = provenance or {"source_kind": "local-mri", "scope": "operator-provided MRI and matching labels"}
    percentiles = np.percentile(image[np.isfinite(image)], [0.5, 50, 90, 97, 99.7])
    intensity_high = max(float(percentiles[-1]), float(percentiles[0]) + 1)
    foreground = np.argwhere(labels > 0)
    # Keep native MPR data complete. The 3D intensity view uses a labelled ROI
    # plus 45 mm context, explicitly recorded as a display crop.
    margin = np.ceil(45 / spacing).astype(int)
    crop_min = np.maximum(0, foreground.min(axis=0) - margin)
    crop_max = np.minimum(image.shape, foreground.max(axis=0) + margin + 1)
    slices = tuple(slice(int(lo), int(hi), volume_stride) for lo, hi in zip(crop_min, crop_max))
    volume = image[slices]
    meta = {
        "format": "cmw-workstation-preview/2", "coordinate_system": "RAS", "spatial_unit": "mm",
        "source_origin_reference": "voxel_center", "shape_xyz": list(image.shape),
        "spacing_xyz_mm": spacing.tolist(), "origin_ras_mm": origin.tolist(),
        "affine_ras_mm": affine.tolist(),
        # "unverified" means the numbers are physical mm on the stored grid, but
        # the header does not say which way is right/anterior/superior.
        "orientation": pair["orientation"],
        "canonical_to_native_voxel": (np.linalg.inv(pair["stored_affine"]) @ affine).tolist(),
        "centroid_xyz": foreground.mean(axis=0).tolist(),
        "mri": write_array(data, "mri_f32.bin", image.transpose(2, 1, 0).astype("<f4")),
        "labels": write_array(data, "labels_u16.bin", labels.transpose(2, 1, 0)),
        "intensity_percentiles": percentiles.tolist(),
        "initial_window": [float(percentiles[0]), intensity_high],
        "volume": {
            "shape_xyz": list(volume.shape), "spacing_xyz_mm": (spacing * volume_stride).tolist(),
            "origin_ras_mm": (origin + crop_min * spacing).tolist(),
            "crop_source_min_xyz": crop_min.tolist(), "crop_source_max_exclusive_xyz": crop_max.tolist(),
            "stride": volume_stride,
            # Ray maxima of bright-blood MRI sit far above the slice window;
            # a MIP ramp over the ROI's own upper range keeps vessels separable.
            "mip_window": np.percentile(volume, [90, 99.9]).tolist(),
            "scalars": write_array(data, "volume_f32.bin", volume.transpose(2, 1, 0).astype("<f4")),
        },
        "provenance": provenance, "segments": [], "variants": VARIANTS,
        "pick_rule": "display hit resolves to a nearby selected source-label voxel; distance is shown; no inherited exact-face map",
        "surface_scope": "independent per-label surfaces; multi-label joint smoothing not implemented",
    }
    palette = ["#edaa83", "#81cbd1", "#b6a4e0", "#e5bc68", "#e38e9a", "#80bd9f", "#aab8c5"]
    for at, value in enumerate(ids):
        spec = segments.get(str(value), {})
        mask = labels == value
        label_volume_ml = float(mask.sum() * np.prod(spacing) / 1000)
        entry = {"id": value, "name": spec.get("name", provenance.get("labels", {}).get(str(value), f"Label {value}")),
                 "color": spec.get("color", palette[at % len(palette)]),
                 "label_volume_ml": label_volume_ml, "voxel_count": int(mask.sum()), "surfaces": {}}
        reference = surface(mask, affine, "voxel")
        for key in VARIANTS:
            print(f"Label {value} · {key}", flush=True)
            poly = reference if key == "voxel" else surface(mask, affine, key)
            report = comparison(poly, reference, label_volume_ml)
            entry["surfaces"][key] = {
                **{name: write_array(data, f"label_{value}_{key}_{name}.bin", array)
                   for name, array in arrays(poly).items()},
                "report": report,
            }
        meta["segments"].append(entry)
    (data / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    shutil.copy2(assets / "index.html", out / "index.html")
    shutil.copy2(assets / "style.css", out / "style.css")
    shutil.copy2(assets / "dist/main.js", out / "main.js")
    (out / "ATTRIBUTION.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"Built {out}: {len(ids)} label(s), native MRI {image.shape}, 3D ROI {volume.shape}", flush=True)
    if pair["orientation"]["status"] == "unverified":
        print("WARNING: placeholder header - anatomical plane names and R/L are hidden in the viewer. "
              "Declare --array-axes only after checking the images.", flush=True)
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mri", type=Path, required=True)
    parser.add_argument("--label", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--segments", type=Path, help='JSON mapping IDs to {"name": ..., "color": ...}')
    parser.add_argument("--provenance", type=Path, help="Attribution/source JSON, retained in the preview")
    parser.add_argument("--volume-stride", type=int, default=1, help="Display-only volume sampling stride; MPR stays native")
    parser.add_argument("--array-axes", help="Only for placeholder headers: anatomical direction of stored axes 0,1,2 "
                                             "(e.g. ASL), declared after reviewing the images")
    args = parser.parse_args()
    try:
        build(args.mri, args.label, args.out,
              json.loads(args.segments.read_text()) if args.segments else None,
              json.loads(args.provenance.read_text()) if args.provenance else None,
              args.volume_stride, args.array_axes)
    except ValueError as error:
        parser.error(str(error))
