"""The deploy ships only the paths listed in deploy_macmini.ps1 ($codePaths); the service must import from exactly those.

QA_PR98_D39 B-1: backend/app started importing backend/mesh, which the deploy did not pack, so a redeploy would have
replaced a working host with one that never answers /health. This test copies the listed paths (minus the tar
excludes) into an empty directory and imports backend.app.main there.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "backend" / "scripts" / "deploy_macmini.ps1"


def _code_paths():
    text = SCRIPT.read_text(encoding="utf-8")
    block = re.search(r"\$codePaths\s*=\s*@\((.*?)\)", text, re.S)
    assert block, "deploy_macmini.ps1 no longer defines $codePaths"
    return re.findall(r'"([^"]+)"', block.group(1))


def _excludes():
    line = next(l for l in SCRIPT.read_text(encoding="utf-8").splitlines() if "tar -czf $codeTar" in l)
    return re.findall(r'--exclude\s+"([^"]+)"', line)


def _ignore(excludes):
    def ignore(directory, names):
        rel_dir = Path(directory).resolve().relative_to(REPO).as_posix()
        out = set()
        for name in names:
            rel = f"{rel_dir}/{name}" if rel_dir != "." else name
            if name in excludes or rel in excludes:
                out.add(name)
        return out
    return ignore


def test_backend_imports_from_the_deployed_paths_only(tmp_path):
    excludes = _excludes()
    assert "backend/mesh/tests" in excludes
    for rel in _code_paths():
        src = REPO / rel
        assert src.exists(), f"deploy path missing in the repo: {rel}"
        dst = tmp_path / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst, ignore=_ignore(excludes))
        else:
            shutil.copy2(src, dst)
    assert not (tmp_path / "backend" / "mesh" / "tests").exists()
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env["PYTHONPATH"] = str(tmp_path)
    proc = subprocess.run([sys.executable, "-c", "import backend.app.main"], cwd=tmp_path, env=env,
                          capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stderr[-2000:]
