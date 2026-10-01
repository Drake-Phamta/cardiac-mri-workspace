"""pytest setup for backend/mesh/tests.

Puts the repository root on sys.path so ``import backend.mesh`` works with both
``pytest backend/mesh/tests`` and ``python -m pytest backend/mesh/tests`` run
from the repository root. There is deliberately no backend/__init__.py:
``backend`` is a namespace package and backend/mesh/ is a regular package.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

CANONICAL_FIXTURE = REPO_ROOT / "tests" / "fixtures" / "geometry" / "geometry_fixture_v0.json"


def synthetic_blob_cell(cell, shape) -> bool:
    """Occupancy of the synthetic blob the canonical picking rays target.

    COPY (a data definition, not an import) of ``synthetic_blob_cell`` inside
    ``reference_impl`` in spikes/spike_b_3d/harness/conformance.py
    (origin/main f5aa763; file blob 1fa137308275392e986fafc884c8f6764ee122d8).
    Evaluated per cell with Python floats exactly as the checker does, so the
    mask is bit-for-bit the occupancy the checker's DDA traverses.
    """
    x, y, z = cell
    nx, ny, nz = shape
    if not (0 <= x < nx and 0 <= y < ny and 0 <= z < nz):
        return False
    cx, cy, cz = nx / 2.0, ny / 2.0, nz / 2.0
    main = (((x - cx) / (nx * 0.32)) ** 2
            + ((y - cy) / (ny * 0.30)) ** 2
            + ((z - cz) / (nz * 0.34)) ** 2) <= 1.0
    lobe = (((x - cx * 1.45) / (nx * 0.16)) ** 2
            + ((y - cy * 0.72) / (ny * 0.17)) ** 2
            + ((z - cz * 1.20) / (nz * 0.22)) ** 2) <= 1.0
    return main or lobe


@pytest.fixture(scope="session")
def canonical_fixture() -> dict:
    """The frozen canonical geometry fixture (read only; never edited here)."""
    with open(CANONICAL_FIXTURE, encoding="utf-8-sig") as fh:
        return json.load(fh)


@pytest.fixture(scope="session")
def blob_mask(canonical_fixture) -> np.ndarray:
    """The synthetic blob on the fixture's own shape_xyz, indexed [x, y, z]."""
    shape = tuple(canonical_fixture["shape_xyz"])
    mask = np.zeros(shape, dtype=bool)
    for x in range(shape[0]):
        for y in range(shape[1]):
            for z in range(shape[2]):
                mask[x, y, z] = synthetic_blob_cell((x, y, z), shape)
    mask.flags.writeable = False
    return mask
