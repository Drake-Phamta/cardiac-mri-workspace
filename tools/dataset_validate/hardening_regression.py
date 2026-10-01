#!/usr/bin/env python3
"""Regression cases for QA-002 F6-F11, F14 and F15.

All volumes and archives are synthetic and live in a temporary directory.
The scenarios are reduced from management/day06/qa002/break_validator.py so
they run without the original reviewer's machine-specific scratch path.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import nrrd
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import checks  # noqa: E402
import dataset_scan  # noqa: E402


def acquisition(name: str = "synthetic.zip", size: int = 0,
                sha256: str = "0" * 64) -> dict:
    return {
        "source_url": "SYNTHETIC",
        "download_started": "SYNTHETIC",
        "download_finished": "SYNTHETIC",
        "acquired_by": "QA regression",
        "package_files": [{"name": name, "size_bytes": size, "sha256": sha256}],
        "owner_verdicts": {
            "a10_mapping": {"background": 0, "foreground": 255},
            "a17_excluded_files": [],
        },
    }


def write_case(root: Path, rel: str, *, mask_values=(0, 255),
               mask_shape=(8, 8, 4), mask_directions=None) -> Path:
    case = root / rel
    case.mkdir(parents=True, exist_ok=True)
    shape = (8, 8, 4)
    mri = (np.arange(np.prod(shape), dtype=np.uint16) % 200).reshape(shape)
    mask = np.zeros(mask_shape, dtype=np.uint8)
    if len(mask_values) > 1:
        mask[1:3, 1:3, 1:2] = mask_values[-1]
    if len(mask_values) > 2:
        mask[0, 0, 0] = mask_values[1]
    header = {
        "space": "left-posterior-superior",
        "space directions": np.eye(3).tolist(),
        "space origin": [0.0, 0.0, 0.0],
    }
    nrrd.write(str(case / "lgemri.nrrd"), mri, header)
    mask_header = dict(header)
    if mask_directions is not None:
        mask_header["space directions"] = mask_directions
    nrrd.write(str(case / "laendo.nrrd"), mask, mask_header)
    return case


def status(manifest: dict, criterion: str) -> str:
    return next(result.status for result in checks.run_checks(manifest)
                if result.cid == criterion)


def zip_tree(root: Path, target: Path, extras=()) -> None:
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(root).as_posix())
        for name, payload in extras:
            archive.writestr(name, payload)


def run() -> int:
    results: list[tuple[str, bool, str]] = []
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)

        # F6: origin equality alone must not pass a shape mismatch.
        root = base / "f6"
        write_case(root, "Training Set/case", mask_shape=(8, 8, 5))
        manifest = dataset_scan.scan_package(str(root), acquisition=acquisition())
        results.append(("F6 complete-grid A9", status(manifest, "A9") == checks.FAIL,
                        status(manifest, "A9")))

        # F7: an unknown DICOM key, free-text content and a non-standard comment
        # are all outside the metadata allowlist; values never enter the manifest.
        root = base / "f7"
        case = write_case(root, "Training Set/case")
        mri_path = case / "lgemri.nrrd"
        raw = mri_path.read_bytes()
        raw = raw.replace(
            b"\n\n",
            b"\nDICOM_0010_0010:=DOE^JOHN\ncontent: DOE^JOHN\n"
            b"# Patient: DOE^JOHN\n\n",
            1,
        )
        mri_path.write_bytes(raw)
        manifest = dataset_scan.scan_package(str(root), acquisition=acquisition())
        findings = manifest["cases"][0]["mri"]["header_identifier_findings"]
        results.append(("F7 header allowlist", status(manifest, "A17") == checks.FAIL
                        and len(findings) >= 3
                        and all("DOE" not in json.dumps(item) for item in findings),
                        f"A17={status(manifest, 'A17')} findings={len(findings)}"))

        # F8: masks must contain exactly the owner-recorded background/foreground.
        root = base / "f8"
        write_case(root, "Training Set/case", mask_values=(0, 254, 255))
        manifest = dataset_scan.scan_package(str(root), acquisition=acquisition())
        extra_status = status(manifest, "A10")
        root_empty = base / "f8_empty"
        write_case(root_empty, "Training Set/case", mask_values=(0,))
        empty_manifest = dataset_scan.scan_package(str(root_empty), acquisition=acquisition())
        results.append(("F8 exact mask mapping",
                        extra_status == checks.FAIL
                        and status(empty_manifest, "A10") == checks.FAIL,
                        f"extra={extra_status} empty={status(empty_manifest, 'A10')}"))

        # F9: archive SHA/size are independently recomputed, not trusted from JSON.
        root = base / "f9_pkg"
        write_case(root, "Training Set/case")
        archive_path = base / "f9.zip"
        zip_tree(root, archive_path)
        manifest = dataset_scan.scan_archive(
            str(archive_path), acquisition=acquisition(archive_path.name, 1, "0" * 64))
        results.append(("F9 archive hash verification", status(manifest, "A1") == checks.FAIL,
                        status(manifest, "A1")))

        # F10: orphan/outside/nested files are inventoried; unsafe ZIP paths are refused.
        root = base / "f10"
        case = write_case(root, "Training Set/case")
        (root / "Training Set/orphan").mkdir(parents=True)
        nrrd.write(str(root / "Training Set/orphan/laendo.nrrd"),
                   np.zeros((8, 8, 4), dtype=np.uint8))
        (root / "notes.txt").write_text("synthetic", encoding="utf-8")
        (case / "extra").mkdir()
        (case / "extra/patient.txt").write_text("synthetic", encoding="utf-8")
        manifest = dataset_scan.scan_package(str(root), acquisition=acquisition())
        kinds = {item["kind"] for item in manifest["package_findings"]}
        traversal = base / "f10_traversal.zip"
        zip_tree(root, traversal, [("../evil/lgemri.nrrd", b"synthetic")])
        refused = False
        try:
            dataset_scan.scan_archive(str(traversal), acquisition=acquisition())
        except ValueError:
            refused = True
        results.append(("F10 package layout and ZIP paths",
                        {"ORPHAN_REQUIRED_FILE", "FILE_OUTSIDE_CASE_DIRECTORY",
                         "NESTED_FILE_IN_CASE_DIRECTORY"} <= kinds and refused,
                        f"kinds={sorted(kinds)} traversal_refused={refused}"))

        # F11: non-finite and degenerate direction matrices never pass geometry.
        nan_verdict, _ = dataset_scan._is_axis_aligned(
            [[1, 0, 0], [0, 1, 0], [float("nan"), float("nan"), float("nan")]])
        zero_verdict, _ = dataset_scan._is_axis_aligned(
            [[0, 0, 0], [0, 1, 0], [0, 0, 1]])
        results.append(("F11 invalid directions",
                        isinstance(nan_verdict, str) and zero_verdict is False
                        and dataset_scan._diagonal_spacing([[0, 0, 0], [0, 1, 0], [0, 0, 1]]) is None,
                        f"nan={nan_verdict!r} zero={zero_verdict!r}"))

        # F14: corrupt ZIP input is a controlled refusal (exit 2), not traceback/exit 1.
        corrupt_root = base / "f14_pkg"
        write_case(corrupt_root, "Training Set/case")
        corrupt = base / "corrupt.zip"
        zip_tree(corrupt_root, corrupt)
        with zipfile.ZipFile(corrupt) as archive:
            info = archive.getinfo("Training Set/case/laendo.nrrd")
        with corrupt.open("r+b") as handle:
            handle.seek(info.header_offset + 26)
            name_len = int.from_bytes(handle.read(2), "little")
            extra_len = int.from_bytes(handle.read(2), "little")
            position = info.header_offset + 30 + name_len + extra_len + info.file_size - 1
            handle.seek(position)
            byte = handle.read(1)
            handle.seek(position)
            handle.write(bytes([byte[0] ^ 0xFF]))
        proc = subprocess.run(
            [sys.executable, str(HERE / "validate.py"), "--archive", str(corrupt)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        results.append(("F14 corrupt ZIP exit contract",
                        proc.returncode == 2 and "Traceback" not in proc.stderr,
                        f"rc={proc.returncode} stderr={proc.stderr.strip()[:100]}"))

        # F15: A16 and A20 must fail contradictory machine manifests.
        good = dataset_scan.scan_package(str(base / "f9_pkg"), acquisition=acquisition())
        malformed_ids = copy.deepcopy(good)
        malformed_ids["cases"][0]["case_id"] = "NOT_A_CASE_ID"
        bad_count = copy.deepcopy(good)
        bad_count["case_count_total"] += 1
        results.append(("F15 fallible A16/A20",
                        status(malformed_ids, "A16") == checks.FAIL
                        and status(bad_count, "A20") == checks.FAIL,
                        f"A16={status(malformed_ids, 'A16')} A20={status(bad_count, 'A20')}"))

    for name, passed, detail in results:
        print(f"{'ok  ' if passed else 'FAIL'} {name}: {detail}")
    print(f"\nhardening regression: {sum(passed for _, passed, _ in results)}/{len(results)} passed")
    return 0 if all(passed for _, passed, _ in results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
