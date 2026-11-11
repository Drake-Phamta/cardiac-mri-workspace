"""QA-074 N-4: ``backend.mesh`` imports, meshes and picks with numpy alone (the backend runtime has no scipy).

The check runs in a fresh interpreter with scipy masked, so it holds whether or not scipy is installed here.
"""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

PROGRAM = textwrap.dedent("""
    import importlib.abc, sys

    class NoScipy(importlib.abc.MetaPathFinder):
        def find_spec(self, name, path=None, target=None):
            if name == "scipy" or name.startswith("scipy."):
                raise ImportError("scipy is masked for this check")
            return None

    sys.meta_path.insert(0, NoScipy())
    sys.path.insert(0, sys.argv[1])

    import numpy as np
    import backend.mesh as bm

    assert "scipy" not in sys.modules
    mask = np.zeros((6, 6, 4), dtype=bool)
    mask[1:5, 1:5, 1:3] = True
    mesh = bm.build_case_mesh(mask)
    hit = bm.pick_slice(mesh, (3.5, 3.5, 10.0), (0.0, 0.0, -1.0))
    assert hit is not None and hit["slice_index"] == 2, hit
    assert "scipy" not in sys.modules

    try:
        bm.build_error_geometry(mask, mask, spacing=(1.0, 1.0, 1.0), origin=(0.0, 0.0, 0.0))
    except ImportError as exc:
        assert "scipy" in str(exc)
        print("OK-LAZY")
    else:
        raise SystemExit("build_error_geometry ran without scipy")
""")


def test_backend_mesh_needs_scipy_only_for_error_components(tmp_path):
    # cwd is an empty directory so nothing but the explicit sys.path entry can shadow a module.
    done = subprocess.run([sys.executable, "-c", PROGRAM, str(REPO_ROOT)],
                          capture_output=True, text=True, timeout=120, cwd=str(tmp_path))
    assert done.returncode == 0 and "OK-LAZY" in done.stdout, (done.stdout, done.stderr)
