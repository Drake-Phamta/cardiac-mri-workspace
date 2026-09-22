#!/usr/bin/env python3
"""Generate an ignored Marching Cubes OBJ for a visual comparison.

This script uses the same deterministic synthetic mask and source geometry as
``build_mesh.py``.  It is deliberately a *preview* beside the voxel-face mesh:
Marching Cubes interpolates the surface between voxel centres, so its output
must not replace the exact-boundary mesh used by the current picking harness.

Install only for this local preview::

    python -m pip install numpy scikit-image
    python spikes/spike_b_3d/mesh/build_marching_cubes_preview.py

The OBJ is ignored by Git, like the existing generated voxel meshes.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

try:
    import numpy as np
    from skimage.measure import marching_cubes
except ImportError as exc:  # Keep the missing optional preview dependency clear.
    raise SystemExit(
        "Marching Cubes preview needs numpy and scikit-image. Run: "
        "python -m pip install numpy scikit-image"
    ) from exc

from build_mesh import DEFAULT_FIXTURE, DEFAULT_OUT, synthetic_mask


def write_obj(path: Path, vertices: np.ndarray, faces: np.ndarray, header: str) -> None:
    """Write the OBJ subset consumed by ``app/obj.js``."""
    with path.open("w", encoding="utf-8", newline="\n") as out:
        for line in header.splitlines():
            out.write(f"# {line}\n")
        for x, y, z in vertices:
            out.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
        for a, b, c in faces:
            out.write(f"f {a + 1} {b + 1} {c + 1}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", default=DEFAULT_FIXTURE)
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    with open(args.fixture, encoding="utf-8-sig") as source:
        fixture = json.load(source)

    mask = synthetic_mask(fixture["shape_xyz"]).astype(np.float32)
    # The array uses the project convention (x, y, z), so the spacing order is
    # also (Sx, Sy, Sz). At level 0.5 each vertex lies between a 0 and 1 voxel.
    vertices, faces, _normals, _values = marching_cubes(
        mask,
        level=0.5,
        spacing=tuple(fixture["spacing_xyz_mm"]),
        allow_degenerate=False,
    )
    vertices += np.asarray(fixture["origin_world_mm"], dtype=np.float32)

    if not (np.isfinite(vertices).all() and len(vertices) > 0 and len(faces) > 0):
        raise SystemExit("Marching Cubes produced an invalid or empty mesh")

    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "marching_cubes_preview.obj"
    write_obj(
        output,
        vertices,
        faces,
        header=(
            "SPIKE_B visual comparison only — Marching Cubes\n"
            f"source: deterministic synthetic mask, shape_xyz={fixture['shape_xyz']}\n"
            "iso-level: 0.5; vertices are interpolated between voxel centres\n"
            "NOT a picking-accuracy artifact or acceptance evidence"
        ),
    )
    print(f"wrote {output}")
    print(f"Marching Cubes preview: {len(vertices):,} vertices, {len(faces):,} triangles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
