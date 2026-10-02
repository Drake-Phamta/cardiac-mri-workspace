"""Performance smoke on a synthetic mask (not data): extraction is vectorised, not per voxel."""

from __future__ import annotations

import time

import numpy as np

from backend.mesh import build_case_mesh


def ellipsoid(shape, semi_axes) -> np.ndarray:
    x, y, z = (np.arange(n, dtype=np.float64) - n / 2.0 for n in shape)
    return ((x[:, None, None] / semi_axes[0]) ** 2
            + (y[None, :, None] / semi_axes[1]) ** 2
            + (z[None, None, :] / semi_axes[2]) ** 2) <= 1.0


def test_256x256x64_ellipsoid_builds_level_0_in_under_5_seconds():
    mask = ellipsoid((256, 256, 64), (100.0, 90.0, 25.0))
    start = time.perf_counter()
    mesh = build_case_mesh(mask, 0, spacing=(0.625, 0.625, 1.25), origin=(-80.0, -80.0, -40.0), shape_xyz=mask.shape)
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"level 0 took {elapsed:.2f} s"
    assert mesh.triangle_count > 50_000
    assert mesh.foreground_voxels == int(mask.sum())
    assert mesh.face_source_slice.min() >= 0 and mesh.face_source_slice.max() < 64
