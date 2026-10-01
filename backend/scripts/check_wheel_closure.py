#!/usr/bin/env python3
"""Prove an offline wheel set installs on the backend host (CPython 3.9.6, macOS, arm64).

`pip download --platform ... --python-version 3.9` evaluates environment
markers on the HOST interpreter, so a dependency guarded by
`python_version < "3.11"` is silently dropped when the operator PC runs 3.12.
This walks the dependency closure of the requirements file with markers
evaluated for the TARGET environment, using only the downloaded wheels'
metadata, and fails when a required distribution has no compatible wheel.

    python backend/scripts/check_wheel_closure.py --wheels <dir> --requirements backend/requirements.txt
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from packaging.markers import Marker
from packaging.requirements import Requirement
from packaging.tags import Tag, cpython_tags, compatible_tags
from packaging.utils import canonicalize_name, parse_wheel_filename

TARGET_ENV = {
    "implementation_name": "cpython", "implementation_version": "3.9.6", "os_name": "posix",
    "platform_machine": "arm64", "platform_python_implementation": "CPython", "platform_release": "24.6.0",
    "platform_system": "Darwin", "platform_version": "", "python_full_version": "3.9.6",
    "python_version": "3.9", "sys_platform": "darwin",
}
PLATFORMS = ["macosx_11_0_arm64", "macosx_11_0_universal2", "macosx_10_9_universal2"]


def target_tags() -> Set[Tag]:
    tags = set(cpython_tags((3, 9), platforms=PLATFORMS))
    tags.update(compatible_tags((3, 9), interpreter="cp39", platforms=PLATFORMS))
    return tags


def read_requirements(path: Path) -> List[Requirement]:
    requirements = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line and not line.startswith("-"):
            requirements.append(Requirement(line))
    return requirements


def wheel_metadata(path: Path) -> List[str]:
    with zipfile.ZipFile(path) as archive:
        name = next(item for item in archive.namelist() if re.search(r"\.dist-info/METADATA$", item))
        text = archive.read(name).decode("utf-8")
    return [line.split(":", 1)[1].strip() for line in text.splitlines() if line.startswith("Requires-Dist:")]


def applies(requirement: Requirement, extras: Set[str]) -> bool:
    if requirement.marker is None:
        return True
    for extra in extras or {""}:
        if requirement.marker.evaluate(dict(TARGET_ENV, extra=extra)):
            return True
    return False


def check(wheels: Path, requirements: Path) -> Tuple[List[str], Dict[str, str]]:
    tags = target_tags()
    available: Dict[str, Path] = {}
    for wheel in sorted(wheels.glob("*.whl")):
        name, _version, _build, wheel_tags = parse_wheel_filename(wheel.name)
        if wheel_tags & tags:
            available[canonicalize_name(name)] = wheel
    problems: List[str] = []
    resolved: Dict[str, str] = {}
    queue: List[Tuple[Requirement, str]] = [(requirement, "requirements file") for requirement in read_requirements(requirements)]
    while queue:
        requirement, parent = queue.pop()
        if not applies(requirement, set()):
            continue
        key = canonicalize_name(requirement.name)
        wheel = available.get(key)
        if wheel is None:
            problems.append(f"{requirement} (needed by {parent}) has no cp39 macOS-arm64 wheel in {wheels}")
            continue
        version = parse_wheel_filename(wheel.name)[1]
        if not requirement.specifier.contains(str(version), prereleases=True):
            problems.append(f"{requirement} (needed by {parent}) is not satisfied by {wheel.name}")
        if key in resolved:
            continue
        resolved[key] = str(version)
        for line in wheel_metadata(wheel):
            dependency = Requirement(line)
            if applies(dependency, set(requirement.extras)):
                queue.append((dependency, f"{key} {version}"))
    return problems, resolved


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--wheels", type=Path, required=True)
    parser.add_argument("--requirements", type=Path, required=True)
    args = parser.parse_args(argv)
    problems, resolved = check(args.wheels, args.requirements)
    for problem in problems:
        print(f"MISSING {problem}")
    if problems:
        print(f"FAIL: the wheel set does not install on CPython {TARGET_ENV['python_full_version']} darwin arm64")
        return 1
    print(f"PASS: {len(resolved)} distributions close over CPython {TARGET_ENV['python_full_version']} darwin arm64: "
          + ", ".join(f"{name}=={version}" for name, version in sorted(resolved.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
