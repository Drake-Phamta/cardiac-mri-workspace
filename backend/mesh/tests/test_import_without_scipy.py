"""The 3.9 backend can import and use mesh picking without optional SciPy."""

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_mesh_import_and_error_dependency_are_explicit_without_scipy():
    script = r'''
import importlib.abc
import sys

class BlockSciPy(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "scipy" or fullname.startswith("scipy."):
            raise ModuleNotFoundError("SciPy blocked by compatibility test")

sys.meta_path.insert(0, BlockSciPy())
import numpy as np
from backend.mesh import build_case_mesh, build_error_geometry

mask = np.zeros((3, 3, 3), dtype=bool)
mask[1, 1, 1] = True
mesh = build_case_mesh(mask, shape_xyz=mask.shape)
assert mesh.triangle_count == 12
try:
    build_error_geometry(mask, mask, spacing=(1, 1, 1), origin=(0, 0, 0), shape_xyz=mask.shape)
except RuntimeError as exc:
    assert "optional SciPy dependency" in str(exc)
else:
    raise AssertionError("error geometry should explain its optional SciPy dependency")
'''
    env = dict(os.environ)
    env["PYTHONPATH"] = str(REPO_ROOT)
    result = subprocess.run([sys.executable, "-c", script], cwd=REPO_ROOT, env=env,
                            check=False, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
