"""
Scan an extracted LASC 2018 package and record what is actually there.

This module READS. It does not judge, and it does not guess. Every value it
emits was read from a file on disk; anything it could not read is recorded as
``NOT MEASURED - <reason>`` rather than omitted or inferred. That rule comes
from SPIKE_D_DATASET/TASK.md and is the difference between an audit and a
plausible-looking document.

The output is the machine-readable manifest required by `06` section 9.1 and
Spike D criterion A20. `06` section 3 lists the fields; each one is produced
here from the package itself.

Nothing in this file decides whether the dataset is acceptable. checks.py does
that, from this output, so the reading and the judging stay separable and both
stay reviewable.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any

NOT_MEASURED = "NOT MEASURED"

MRI_FILENAME = "lgemri.nrrd"
MASK_FILENAME = "laendo.nrrd"

# `12` section 2 / NFR-SEC-005: header keys that would carry a direct identifier.
# Criterion A17 asks for anything unexpected to be reported and kept out of the
# app metadata path. Matching is case-insensitive and substring-based on purpose:
# a false positive costs a human five seconds, a false negative ships an
# identifier.
IDENTIFIER_KEY_PATTERNS = [
    "patient", "name", "birth", "dob", "age", "sex", "gender",
    "institution", "hospital", "physician", "operator", "referring",
    "accession", "studyid", "study_id", "studydate", "study_date",
    "seriesdate", "series_date", "acquisitiondate", "acquisition_date",
    "address", "telephone", "phone", "mrn", "medicalrecord",
]

# Header keys that legitimately describe geometry or encoding. Recorded, never
# flagged.
EXPECTED_HEADER_KEYS = {
    "type", "dimension", "space", "sizes", "space directions", "kinds",
    "endian", "encoding", "space origin", "spacings", "thicknesses",
    "axis mins", "axis maxs", "centerings", "labels", "units",
    "space units", "measurement frame", "byte skip", "line skip",
    "data file", "datafile", "content", "min", "max", "old min", "old max",
}


def _sha256(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def _load_nrrd():
    """Import the NRRD reader and report its exact version.

    The exact library and version is a required environment field
    (SPIKE_D_DATASET/TASK.md, 'Exact environment'), so it is captured here
    rather than described in prose somewhere else.
    """
    try:
        import nrrd  # type: ignore
    except ImportError as exc:                      # pragma: no cover
        raise SystemExit(
            "The NRRD reader is not installed.\n"
            "    pip install -r tools/dataset_validate/requirements.txt\n"
            f"({exc})"
        )
    version = getattr(nrrd, "__version__", None)
    if version is None:
        try:
            from importlib.metadata import version as _v
            version = _v("pynrrd")
        except Exception:
            version = NOT_MEASURED + " - library exposes no version string"
    return nrrd, f"pynrrd {version}"


def _is_axis_aligned(space_directions, tol: float = 1e-6) -> tuple[Any, str]:
    """Criterion A14 / DR-012: the MVP supports validated axis-aligned geometry only.

    Returns (verdict, explanation). The verdict is True, False, or the
    NOT_MEASURED string - never a guess. A volume is axis-aligned when every
    off-diagonal term of the direction matrix is zero, i.e. each voxel axis maps
    onto exactly one world axis.
    """
    if space_directions is None:
        return NOT_MEASURED, "header carries no 'space directions' field"
    try:
        rows = [r for r in space_directions if r is not None]
        if len(rows) != 3:
            return NOT_MEASURED, f"expected 3 spatial axes, header gives {len(rows)}"
        for i, row in enumerate(rows):
            for j, value in enumerate(row):
                if i != j and abs(float(value)) > tol:
                    return False, f"off-diagonal term [{i}][{j}] = {value}"
        return True, f"all off-diagonal terms within {tol}"
    except (TypeError, ValueError) as exc:
        return NOT_MEASURED, f"could not interpret 'space directions': {exc}"


def _diagonal_spacing(space_directions):
    """Voxel spacing along each axis, from the direction matrix."""
    if space_directions is None:
        return None
    try:
        rows = [r for r in space_directions if r is not None]
        return [round(float(rows[i][i]), 6) for i in range(len(rows))]
    except (TypeError, ValueError, IndexError):
        return None


def _scan_header_for_identifiers(header: dict) -> list[dict]:
    """Criterion A17 - metadata audit against the privacy allowlist."""
    findings = []
    for key, value in header.items():
        low = str(key).lower().replace(" ", "")
        if low in {k.replace(" ", "") for k in EXPECTED_HEADER_KEYS}:
            continue
        for pattern in IDENTIFIER_KEY_PATTERNS:
            if pattern in low:
                findings.append({
                    "key": str(key),
                    "matched_pattern": pattern,
                    # The value is deliberately NOT copied into the manifest.
                    # Recording a suspected identifier into a tracked file would
                    # be the very leak this check exists to prevent.
                    "value_recorded": False,
                    "value_length": len(str(value)),
                })
                break
    return findings


def _inspect_volume(path: str, nrrd, want_checksums: bool) -> dict:
    """Read one NRRD file and record everything `06` section 3 asks for."""
    record: dict[str, Any] = {
        "path_relative": None,       # filled by the caller
        "size_bytes": os.path.getsize(path),
        "sha256": _sha256(path) if want_checksums else NOT_MEASURED + " - checksums disabled for this run",
    }
    try:
        data, header = nrrd.read(path)
    except Exception as exc:
        record["read_ok"] = False
        record["read_error"] = f"{type(exc).__name__}: {exc}"
        for field in ("dtype", "shape", "dimension", "space", "space_origin",
                      "spacing", "encoding", "axis_aligned"):
            record[field] = NOT_MEASURED + " - file did not load"
        record["header_identifier_findings"] = NOT_MEASURED + " - file did not load"
        return record

    record["read_ok"] = True
    record["dtype"] = str(data.dtype)
    record["shape"] = list(data.shape)
    record["dimension"] = int(header.get("dimension", len(data.shape)))
    record["is_3d"] = data.ndim == 3
    record["space"] = header.get("space", NOT_MEASURED + " - absent from header")
    record["encoding"] = header.get("encoding", NOT_MEASURED + " - absent from header")

    origin = header.get("space origin")
    record["space_origin"] = [float(v) for v in origin] if origin is not None else \
        NOT_MEASURED + " - absent from header"

    directions = header.get("space directions")
    record["space_directions"] = (
        [[None if v is None else float(v) for v in row] if row is not None else None
         for row in directions]
        if directions is not None else NOT_MEASURED + " - absent from header"
    )
    spacing = _diagonal_spacing(directions)
    record["spacing"] = spacing if spacing is not None else \
        NOT_MEASURED + " - not derivable from header"

    aligned, why = _is_axis_aligned(directions)
    record["axis_aligned"] = aligned
    record["axis_aligned_basis"] = why

    # NaN / non-finite check (`06` section 9).
    try:
        import numpy as np
        if np.issubdtype(data.dtype, np.floating):
            record["has_non_finite"] = bool((~np.isfinite(data)).any())
        else:
            record["has_non_finite"] = False
        record["value_min"] = float(data.min())
        record["value_max"] = float(data.max())
    except Exception as exc:
        record["has_non_finite"] = NOT_MEASURED + f" - {exc}"

    record["header_identifier_findings"] = _scan_header_for_identifiers(header)
    record["_data"] = data          # stripped before serialisation
    return record


def _mask_unique_values(data) -> Any:
    """Criterion A10 - record the mask's actual value set. Never assume 0/1."""
    try:
        import numpy as np
        uniq = np.unique(data)
        if uniq.size > 64:
            return {
                "count": int(uniq.size),
                "note": "more than 64 distinct values - this is not a binary mask; "
                        "listing the first 64",
                "values": [float(v) for v in uniq[:64]],
            }
        return {"count": int(uniq.size), "values": [float(v) for v in uniq]}
    except Exception as exc:
        return NOT_MEASURED + f" - {exc}"


def discover_cases(root: str) -> list[dict]:
    """Find every directory that holds an MRI volume.

    The package layout is discovered rather than hardcoded: any directory
    containing lgemri.nrrd is a case, and its parent directory name is recorded
    as the released partition. If the real package is laid out differently, the
    manifest will say so instead of this script silently finding nothing.
    """
    found = []
    for dirpath, _dirnames, filenames in os.walk(root):
        lower = {f.lower(): f for f in filenames}
        if MRI_FILENAME in lower:
            rel = os.path.relpath(dirpath, root)
            parts = rel.split(os.sep)
            found.append({
                "source_dir_relative": rel.replace(os.sep, "/"),
                "source_dir_name": os.path.basename(dirpath),
                "partition_as_released": parts[-2] if len(parts) >= 2 else "(package root)",
                "abs_dir": dirpath,
                "mri_file": lower.get(MRI_FILENAME),
                "mask_file": lower.get(MASK_FILENAME),
            })
    found.sort(key=lambda c: c["source_dir_relative"])
    return found


def scan_package(root: str, want_checksums: bool = True,
                 acquisition: dict | None = None) -> dict:
    """Produce the full manifest for an extracted package."""
    nrrd, nrrd_version = _load_nrrd()
    started = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

    cases_found = discover_cases(root)
    cases: list[dict] = []

    # A16: de-identified internal IDs, assigned deterministically by sorted
    # source path so two runs agree.
    for index, found in enumerate(cases_found, start=1):
        case_id = f"CASE_{index:04d}"
        entry: dict[str, Any] = {
            "case_id": case_id,
            "source_dir_relative": found["source_dir_relative"],
            "source_dir_name": found["source_dir_name"],
            "partition_as_released": found["partition_as_released"],
            "files_present": {
                MRI_FILENAME: found["mri_file"] is not None,
                MASK_FILENAME: found["mask_file"] is not None,
            },
        }

        mri_path = os.path.join(found["abs_dir"], found["mri_file"])
        mri = _inspect_volume(mri_path, nrrd, want_checksums)
        mri_data = mri.pop("_data", None)
        mri["path_relative"] = f"{found['source_dir_relative']}/{found['mri_file']}"
        entry["mri"] = mri

        if found["mask_file"] is not None:
            mask_path = os.path.join(found["abs_dir"], found["mask_file"])
            mask = _inspect_volume(mask_path, nrrd, want_checksums)
            mask_data = mask.pop("_data", None)
            mask["path_relative"] = f"{found['source_dir_relative']}/{found['mask_file']}"
            if mask_data is not None:
                mask["unique_values"] = _mask_unique_values(mask_data)
            else:
                mask["unique_values"] = NOT_MEASURED + " - file did not load"
            entry["mask"] = mask

            # A8 / A9 - compatibility between the two volumes.
            entry["mri_mask_compatibility"] = _compare(mri, mask)
        else:
            entry["mask"] = None
            entry["mri_mask_compatibility"] = {
                "shape_equal": NOT_MEASURED + f" - no {MASK_FILENAME} in this case",
                "spacing_equal": NOT_MEASURED + f" - no {MASK_FILENAME} in this case",
                "origin_equal": NOT_MEASURED + f" - no {MASK_FILENAME} in this case",
                "resampling_required": NOT_MEASURED + f" - no {MASK_FILENAME} in this case",
            }

        cases.append(entry)

    manifest = {
        "manifest_version": "1.0",
        "generated_at": started,
        "generated_by": "tools/dataset_validate - generated, not hand-typed (A20)",
        "package_root": os.path.abspath(root),
        "nrrd_library": nrrd_version,
        "acquisition": acquisition or {
            "note": NOT_MEASURED + " - pass --acquisition <json> to embed the acquisition record"
        },
        "case_count_total": len(cases),
        "partitions": _partition_summary(cases),
        "shape_distribution": _shape_distribution(cases),
        "cases": cases,
    }
    return manifest


def _compare(mri: dict, mask: dict) -> dict:
    """A8 / A9 - shape, spacing and origin compatibility, and the resampling verdict."""
    out: dict[str, Any] = {}

    def eq(a, b, key):
        if isinstance(a, str) or isinstance(b, str) or a is None or b is None:
            return NOT_MEASURED + f" - {key} unavailable on one or both volumes"
        return a == b

    out["shape_equal"] = eq(mri.get("shape"), mask.get("shape"), "shape")
    out["spacing_equal"] = eq(mri.get("spacing"), mask.get("spacing"), "spacing")
    out["origin_equal"] = eq(mri.get("space_origin"), mask.get("space_origin"), "origin")

    if out["shape_equal"] is True and out["spacing_equal"] is True:
        out["resampling_required"] = False
        out["basis"] = "shape and spacing identical"
    elif out["shape_equal"] is False or out["spacing_equal"] is False:
        out["resampling_required"] = True
        out["basis"] = "shape or spacing differ - a transform is required before use"
    else:
        out["resampling_required"] = NOT_MEASURED + " - inputs incomplete"
        out["basis"] = "could not determine"
    return out


def _partition_summary(cases: list[dict]) -> dict:
    """A2 / A12 - case counts per released partition, and whether labels are present."""
    summary: dict[str, Any] = {}
    for case in cases:
        part = case["partition_as_released"]
        bucket = summary.setdefault(part, {
            "case_count": 0,
            "cases_with_mri": 0,
            "cases_with_mask": 0,
            "cases_missing_mask": [],
        })
        bucket["case_count"] += 1
        if case["files_present"][MRI_FILENAME]:
            bucket["cases_with_mri"] += 1
        if case["files_present"][MASK_FILENAME]:
            bucket["cases_with_mask"] += 1
        else:
            bucket["cases_missing_mask"].append(case["case_id"])
    for bucket in summary.values():
        bucket["all_cases_have_mask"] = bucket["cases_with_mask"] == bucket["case_count"]
    return summary


def _shape_distribution(cases: list[dict]) -> dict:
    """Criterion A6 - cohort shape distribution, and whether in-plane dims vary.

    A6 is the criterion Spike A depends on: the A9 slice-switch measurement was
    taken on a 64x64 fixture and must be re-measured at the real slice size.
    """
    counts: dict[str, int] = {}
    in_plane: set[tuple] = set()
    unreadable = 0
    for case in cases:
        shape = case["mri"].get("shape")
        if not isinstance(shape, list):
            unreadable += 1
            continue
        counts[str(shape)] = counts.get(str(shape), 0) + 1
        if len(shape) == 3:
            in_plane.add(tuple(shape[:2]))
    return {
        "distinct_shapes": len(counts),
        "counts_by_shape": dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        "in_plane_dimensions_vary": (len(in_plane) > 1) if in_plane else
            NOT_MEASURED + " - no readable volume",
        "distinct_in_plane_dimensions": sorted(list(map(list, in_plane))),
        "volumes_unreadable": unreadable,
    }
