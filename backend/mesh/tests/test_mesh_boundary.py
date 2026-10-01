"""Product code under backend/mesh/ never imports spike code (reuse is by copy with provenance)."""

from __future__ import annotations

import ast
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]
PRODUCT_MODULES = sorted(PACKAGE.glob("*.py"))


def test_product_modules_exist():
    names = {p.name for p in PRODUCT_MODULES}
    assert {"__init__.py", "geometry.py", "surface.py", "error_geometry.py"} <= names


def test_product_modules_do_not_import_spikes_or_touch_sys_path():
    for path in PRODUCT_MODULES:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                names = []
            for name in names:
                assert "spike" not in name.lower(), f"{path.name} imports {name}"
                assert name.split(".")[0] not in {"conformance", "build_mesh", "picking_error"}, \
                    f"{path.name} imports spike module {name}"
            if isinstance(node, ast.Attribute) and node.attr == "path":
                assert not (isinstance(node.value, ast.Name) and node.value.id == "sys"), \
                    f"{path.name} manipulates sys.path"
