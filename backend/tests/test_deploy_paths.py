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


# -- the script itself, run for real in Windows PowerShell (QA_PR100_103_D39 #101 NB-1, NB-2) ---------------------------
# ssh and scp are replaced by shims that only record their command line; tar is the real one (System32's bsdtar,
# as on the operator's PC) unless FAKE_TAR_LIST_FAIL=1, which makes `tar -tzf` fail. TEMP is redirected into the test's
# directory, so the script's fixed stage directory is never the operator's. These tests need Windows PowerShell 5.1
# and the system tar, so they are skipped on the Linux CI runner and run on the operator PC.

import pytest  # noqa: E402

POWERSHELL = shutil.which("powershell")
SYSTEM_TAR = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "tar.exe"
needs_windows_powershell = pytest.mark.skipif(
    sys.platform != "win32" or not POWERSHELL or not SYSTEM_TAR.is_file(),
    reason="runs deploy_macmini.ps1 in Windows PowerShell with the system tar (operator PC only)")


def _inside_git_tree(path: Path) -> bool:
    return any((parent / ".git").exists() for parent in [path.resolve(), *path.resolve().parents])


class Deploy:
    """One run of deploy_macmini.ps1 with fake ssh / scp and a private TEMP."""

    def __init__(self, root: Path):
        if _inside_git_tree(root):
            pytest.skip("the test directory is inside a git work tree; the script refuses data there by design")
        self.root = root
        self.shims = root / "shims"
        self.shims.mkdir()
        (self.shims / "ssh.cmd").write_text('@echo off\r\necho ssh %*>> "%FAKE_REMOTE_LOG%"\r\necho connected\r\nexit /b 0\r\n')
        (self.shims / "scp.cmd").write_text('@echo off\r\necho scp %*>> "%FAKE_REMOTE_LOG%"\r\nexit /b 0\r\n')
        (self.shims / "tar.cmd").write_text(
            '@echo off\r\nif "%~1"=="-tzf" if "%FAKE_TAR_LIST_FAIL%"=="1" (\r\n  echo tar: simulated listing failure 1>&2\r\n'
            '  exit /b 3\r\n)\r\n"%SystemRoot%\\System32\\tar.exe" %*\r\nexit /b %ERRORLEVEL%\r\n')
        self.temp = root / "temp"
        self.temp.mkdir()
        self.log = root / "remote.log"
        self.data = root / "data"            # <data-root>: data_cache, experiments, derived_meshes next to each other
        self.data.mkdir()

    def package(self, part: str, files: dict) -> None:
        for relative, payload in files.items():
            path = self.data / part / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)

    def remote_calls(self) -> list:
        return self.log.read_text().splitlines() if self.log.exists() else []

    def run(self, *args: str, list_fails: bool = False, data_root_env: bool = False):
        env = {k: v for k, v in os.environ.items() if k not in ("CARDIAC_BACKEND_DATA", "CARDIAC_DEPLOY_SSH_HOST",
                                                                  "CARDIAC_DEPLOY_BIND_HOST")}
        env.update(TEMP=str(self.temp), TMP=str(self.temp), PATH=f"{self.shims}{os.pathsep}{env['PATH']}",
                   FAKE_REMOTE_LOG=str(self.log), FAKE_TAR_LIST_FAIL="1" if list_fails else "0")
        if data_root_env:
            env["CARDIAC_BACKEND_DATA"] = str(self.data)
        done = subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT),
                               "-SshHost", "fake-host", "-BindHost", "127.0.0.1", "-NoWheels", "-BindAll", *args],
                              capture_output=True, text=True, env=env, timeout=240)
        return done.returncode, done.stdout + done.stderr


@pytest.fixture()
def deploy(tmp_path):
    return Deploy(tmp_path)


@needs_windows_powershell
def test_the_script_parses_in_windows_powershell():
    command = ("$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile("
               f"'{SCRIPT}', [ref]$null, [ref]$e); if ($e.Count) {{ $e | ForEach-Object {{ $_.Message }}; exit 1 }}")
    done = subprocess.run([POWERSHELL, "-NoProfile", "-Command", command], capture_output=True, text=True, timeout=120)
    assert done.returncode == 0, done.stdout + done.stderr


@needs_windows_powershell
def test_ship_packages_without_a_data_root_says_so_before_it_connects_or_packs(deploy):
    """#101 NB-1: it used to connect, pack the code, and die in Split-Path with a parameter-binding error."""
    code, out = deploy.run("-SkipData", "-ShipPackages")
    assert code != 0
    assert "-ShipPackages needs the data root" in out and "-DataCache" in out and "CARDIAC_BACKEND_DATA" in out
    assert "Cannot bind argument" not in out
    assert deploy.remote_calls() == [], "nothing connected"
    assert not (deploy.temp / "cardiac-backend-deploy").exists(), "nothing was packed"
    # The data root can come from the environment instead, and then the script gets past that check (and fails on
    # the missing folders, with its own clear message).
    code, out = deploy.run("-SkipData", "-ShipPackages", data_root_env=True)
    assert code != 0 and "does not exist (expected next to the data cache)" in out and "Cannot bind argument" not in out


@needs_windows_powershell
def test_a_packages_archive_that_cannot_be_listed_is_not_uploaded(deploy):
    """#101 NB-2: a failed `tar -tzf` used to read as 'no raw image files'."""
    deploy.package("experiments", {"EXP-X/run_manifest.json": b"{}"})
    deploy.package("derived_meshes", {"mesh.json": b"{}"})
    code, out = deploy.run("-SkipData", "-ShipPackages", "-DataCache", str(deploy.data / "data_cache"), list_fails=True)
    assert code != 0
    assert "tar -tzf (experiments) failed with exit code 3" in out and "contents could not be checked" in out
    assert not [call for call in deploy.remote_calls() if call.startswith("scp")], "nothing was uploaded"


@needs_windows_powershell
def test_a_data_cache_archive_that_cannot_be_listed_is_not_uploaded(deploy):
    (deploy.data / "data_cache").mkdir()
    (deploy.data / "data_cache" / "index.json").write_text('{"cases": []}')
    code, out = deploy.run("-DataCache", str(deploy.data / "data_cache"), list_fails=True)
    assert code != 0 and "tar -tzf (the data cache) failed with exit code 3" in out
    assert not [call for call in deploy.remote_calls() if call.startswith("scp")]


@needs_windows_powershell
@pytest.mark.parametrize("name", ["scan.nii.gz", "scan.nii", "slice.dcm", "volume.mha", "volume.mhd", "volume.raw"])
def test_a_package_holding_a_raw_image_file_is_refused(deploy, name):
    """#101 NB-2: the packages scan lacked .nii / .nii.gz (the data-cache scan had them)."""
    deploy.package("experiments", {"EXP-X/run_manifest.json": b"{}", f"EXP-X/predictions/{name}": b"x"})
    deploy.package("derived_meshes", {"mesh.json": b"{}"})
    code, out = deploy.run("-SkipData", "-ShipPackages", "-DataCache", str(deploy.data / "data_cache"))
    assert code != 0 and "experiments contains raw image files; refusing to copy them" in out and name in out
    assert not [call for call in deploy.remote_calls() if call.startswith("scp")]


@needs_windows_powershell
def test_a_data_cache_holding_a_raw_image_file_is_still_refused(deploy):
    (deploy.data / "data_cache").mkdir()
    (deploy.data / "data_cache" / "index.json").write_text('{"cases": []}')
    (deploy.data / "data_cache" / "leak.nrrd").write_bytes(b"x")
    code, out = deploy.run("-DataCache", str(deploy.data / "data_cache"))
    assert code != 0 and "the data cache contains raw image files; refusing to copy them" in out and "leak.nrrd" in out
    assert not [call for call in deploy.remote_calls() if call.startswith("scp")]


@needs_windows_powershell
def test_packages_with_nrrd_masks_are_shipped(deploy):
    """The control: Contract 2 prediction masks are NRRD and must still go; both archives are uploaded and unpacked."""
    deploy.package("experiments", {"EXP-X/run_manifest.json": b"{}", "EXP-X/predictions/final_holdout/CASE_1.nrrd": b"mask"})
    deploy.package("derived_meshes", {"mesh.json": b"{}"})
    code, out = deploy.run("-SkipData", "-ShipPackages", "-DataCache", str(deploy.data / "data_cache"))
    assert code == 0, out
    calls = deploy.remote_calls()
    assert any(call.startswith("scp") and "experiments.tar.gz" in call for call in calls)
    assert any(call.startswith("scp") and "derived_meshes.tar.gz" in call for call in calls)
    assert any("tar -xzf experiments.tar.gz" in call and "tar -xzf derived_meshes.tar.gz" in call for call in calls)
