#!/usr/bin/env python3
"""Validator for Contract 1 DRAFT v0.

This is a review/acceptance tool for the contract draft, not a production
ingestion module. It deliberately uses only the standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path


ALLOWED_METADATA = {
    "modality",
    "space",
    "encoding",
    "series_description",
    "scanner_model",
    "acquisition_tag",
    "source_partition",
}
EPSILON = 1e-6


class ContractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _fail(code: str, message: str) -> None:
    raise ContractError(code, message)


def _equal(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=EPSILON, abs_tol=EPSILON)
    return a == b


def _equal_vector(a, b) -> bool:
    return len(a) == len(b) and all(_equal(x, y) for x, y in zip(a, b))


def _equal_matrix(a, b) -> bool:
    return len(a) == len(b) and all(_equal_vector(x, y) for x, y in zip(a, b))


def _parse_vector(text: str) -> list[float]:
    values = [v.strip() for v in text.strip()[1:-1].split(",")]
    if len(values) != 3:
        _fail("NRRD_INVALID", f"direction vector is not length 3: {text!r}")
    return [float(v) for v in values]


def _parse_nrrd(path: Path) -> dict:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        _fail("NRRD_UNREADABLE", f"{path}: {exc}")
    if not raw.startswith(b"NRRD"):
        _fail("NRRD_INVALID", f"{path}: missing NRRD magic")
    separator = b"\n\n"
    header_end = raw.find(separator)
    if header_end < 0:
        separator = b"\r\n\r\n"
        header_end = raw.find(separator)
    if header_end < 0:
        _fail("NRRD_INVALID", f"{path}: header has no blank-line terminator")

    fields: dict[str, str] = {}
    for line in raw[:header_end].decode("ascii").splitlines()[1:]:
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip().lower()] = value.strip()
    try:
        dimension = int(fields["dimension"])
        shape = [int(v) for v in fields["sizes"].split()]
        encoding = fields["encoding"].lower()
    except (KeyError, ValueError) as exc:
        _fail("NRRD_INVALID", f"{path}: missing/invalid dimension, sizes, or encoding ({exc})")
    if dimension != 3 or len(shape) != 3 or any(v < 1 for v in shape):
        _fail("NRRD_NOT_3D", f"{path}: expected a positive 3D NRRD, got dimension={dimension}, sizes={shape}")
    if encoding != "ascii":
        _fail("NRRD_UNSUPPORTED_ENCODING", f"{path}: synthetic validator supports encoding: ascii only")

    directions_text = fields.get("space directions")
    if not directions_text:
        _fail("GEOMETRY_NOT_VALIDATED", f"{path}: space directions missing")
    direction_vectors = re.findall(r"\([^)]*\)", directions_text)
    if len(direction_vectors) != 3:
        _fail("GEOMETRY_NOT_VALIDATED", f"{path}: expected three space direction vectors")
    vectors = [_parse_vector(v) for v in direction_vectors]
    spacing = [math.sqrt(sum(component * component for component in vector)) for vector in vectors]
    orientation = [
        [component / spacing[row] for component in vector]
        for row, vector in enumerate(vectors)
    ]
    origin_text = fields.get("space origin")
    if not origin_text or not origin_text.startswith("("):
        _fail("GEOMETRY_NOT_VALIDATED", f"{path}: space origin missing")
    origin = _parse_vector(origin_text)
    values = []
    if encoding == "ascii":
        payload = raw[header_end + len(separator):].decode("ascii")
        values = [float(token) for token in re.split(r"[\s,]+", payload.strip()) if token]
        expected = shape[0] * shape[1] * shape[2]
        if len(values) != expected:
            _fail("NRRD_INVALID", f"{path}: expected {expected} ASCII values, got {len(values)}")
    return {
        "shape_xyz": shape,
        "spacing_xyz": spacing,
        "origin_xyz": origin,
        "direction_or_orientation": orientation,
        "dtype": fields.get("type", ""),
        "values": values,
    }


def _axis_aligned(matrix: list[list[float]]) -> bool:
    return all(
        (abs(matrix[row][column]) <= EPSILON if row != column
         else abs(matrix[row][column]) > EPSILON)
        for row in range(3)
        for column in range(3)
    )


def _is_default_physical_header(parsed: dict) -> bool:
    """A unit spacing/origin header is not proof of physical geometry."""
    return (
        _equal_vector(parsed["spacing_xyz"], [1.0, 1.0, 1.0])
        and _equal_vector(parsed["origin_xyz"], [0.0, 0.0, 0.0])
        and _equal_matrix(parsed["direction_or_orientation"], [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ])
    )


def _checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _validate_artifact(
    artifact: dict,
    *,
    root: Path,
    kind: str,
    existing: dict[str, str],
    seen_uris: set[str],
) -> tuple[dict, str]:
    required = {
        "artifact_uri",
        "source_path",
        "format",
        "shape_xyz",
        "spacing_xyz",
        "origin_xyz",
        "direction_or_orientation",
        "dtype",
        "checksum",
        "geometry_validation_status",
    }
    missing = sorted(required - artifact.keys())
    if missing:
        _fail("SCHEMA_INVALID", f"{kind}: missing fields {missing}")
    allowed = required
    if kind.endswith("ground_truth_mask"):
        allowed = required | {
            "label_semantics",
            "source",
            "label_values",
            "foreground_value",
            "background_value",
        }
    unexpected = sorted(set(artifact) - allowed)
    if unexpected:
        _fail("SCHEMA_INVALID", f"{kind}: unexpected fields {unexpected}")
    uri = artifact["artifact_uri"]
    if not isinstance(uri, str) or not re.fullmatch(r"artifact://[A-Za-z0-9][A-Za-z0-9._/-]*", uri):
        _fail("SCHEMA_INVALID", f"{kind}: invalid artifact_uri")
    if uri in seen_uris:
        _fail("DUPLICATE_ARTIFACT", f"{kind}: artifact_uri is repeated: {uri}")
    seen_uris.add(uri)
    source_path = artifact["source_path"]
    if not isinstance(source_path, str):
        _fail("SCHEMA_INVALID", f"{kind}: source_path must be a relative forward-slash path")
    path_obj = Path(source_path)
    if (
        not isinstance(source_path, str)
        or path_obj.is_absolute()
        or ":" in source_path.split("/")[0]
        or ".." in path_obj.parts
        or "\\" in source_path
    ):
        _fail("SCHEMA_INVALID", f"{kind}: source_path must be a relative forward-slash path")
    file_path = (root / Path(*source_path.split("/"))).resolve()
    try:
        file_path.relative_to(root.resolve())
    except ValueError:
        _fail("SCHEMA_INVALID", f"{kind}: source_path escapes the package root")
    checksum = artifact.get("checksum")
    if not isinstance(checksum, dict) or set(checksum) != {"algorithm", "value"} or checksum.get("algorithm") != "sha256":
        _fail("SCHEMA_INVALID", f"{kind}: checksum must be a sha256 object")
    if not re.fullmatch(r"[0-9a-f]{64}", checksum["value"]):
        _fail("SCHEMA_INVALID", f"{kind}: checksum value is not lowercase SHA-256")
    if artifact["format"] != "NRRD":
        _fail("SCHEMA_INVALID", f"{kind}: format must be NRRD")
    if artifact["geometry_validation_status"] not in {
        "VALIDATED_AXIS_ALIGNED",
        "GEOMETRY_NOT_VALIDATED",
    }:
        _fail("SCHEMA_INVALID", f"{kind}: unknown geometry validation status")
    if not file_path.exists():
        _fail("NRRD_UNREADABLE", f"{kind}: file does not exist: {source_path}")
    measured_checksum = _checksum(file_path)
    if measured_checksum != checksum["value"]:
        _fail("CHECKSUM_MISMATCH", f"{kind}: {source_path} checksum differs from manifest")

    parsed = _parse_nrrd(file_path)
    if parsed["dtype"] not in {"unsigned char", "uint8", "uchar"} and artifact["dtype"] == "uint8":
        _fail("NRRD_INVALID", f"{kind}: NRRD type {parsed['dtype']!r} does not match uint8")
    if not _axis_aligned(parsed["direction_or_orientation"]):
        _fail("GEOMETRY_NOT_VALIDATED", f"{kind}: direction matrix is not axis-aligned")
    if artifact["geometry_validation_status"] != "VALIDATED_AXIS_ALIGNED":
        _fail("GEOMETRY_NOT_VALIDATED", f"{kind}: geometry status is not VALIDATED_AXIS_ALIGNED")
    if _is_default_physical_header(parsed):
        _fail(
            "GEOMETRY_NOT_VALIDATED",
            f"{kind}: spacing=1/origin=0/unit direction is only a default header, not physical geometry",
        )
    if not _axis_aligned(artifact["direction_or_orientation"]):
        _fail("GEOMETRY_NOT_VALIDATED", f"{kind}: direction matrix is not axis-aligned")
    for field in ("shape_xyz", "spacing_xyz", "origin_xyz", "direction_or_orientation"):
        if not _equal(parsed[field], artifact[field]):
            _fail("GEOMETRY_MISMATCH", f"{kind}: parsed {field} differs from manifest")
    if uri in existing:
        if existing[uri] != checksum["value"]:
            _fail("CHECKSUM_CONFLICT", f"{kind}: changed checksum for immutable artifact {uri}")
        action = "NO_OP"
    else:
        action = "NEW"
    return parsed, action


def validate_manifest(manifest: dict, root: Path, existing: dict[str, str] | None = None) -> dict:
    existing = existing or {}
    if manifest.get("contract") != "contract1_raw_dataset" or manifest.get("contract_version") != "DRAFT v0":
        _fail("SCHEMA_INVALID", "contract must be contract1_raw_dataset DRAFT v0")
    if not re.fullmatch(r"raw-[a-z0-9][a-z0-9._-]*", manifest.get("manifest_id", "")):
        _fail("SCHEMA_INVALID", "manifest_id is invalid")
    if manifest.get("gate", {}).get("gate_data_01") != "ACCEPTED":
        _fail("GATE_DATA_01_NOT_ACCEPTED", "GATE-DATA-01 is not ACCEPTED")
    dataset_id = manifest.get("dataset", {}).get("dataset_id")
    if not dataset_id:
        _fail("SCHEMA_INVALID", "dataset.dataset_id is required")
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        _fail("SCHEMA_INVALID", "cases must be a non-empty array")

    seen_cases: set[str] = set()
    seen_uris: set[str] = set()
    seen_hashes: dict[tuple[str, str], str] = {}
    actions = []
    for case in cases:
        case_id = case.get("case_id")
        if not isinstance(case_id, str) or not re.fullmatch(r"CASE_[0-9]{4,}", case_id):
            _fail("SCHEMA_INVALID", f"invalid case_id: {case_id!r}")
        if case_id in seen_cases:
            _fail("DUPLICATE_CASE", f"case_id is repeated: {case_id}")
        seen_cases.add(case_id)
        if case.get("dataset_id") != dataset_id:
            _fail("SCHEMA_INVALID", f"{case_id}: dataset_id does not match the envelope")
        metadata = case.get("metadata", {})
        unexpected = sorted(set(metadata) - ALLOWED_METADATA)
        if unexpected:
            _fail("METADATA_NOT_ALLOWED", f"{case_id}: metadata keys are not allowlisted: {unexpected}")
        mri = case.get("mri_volume")
        mask = case.get("ground_truth_mask")
        if not isinstance(mri, dict):
            _fail("SCHEMA_INVALID", f"{case_id}: mri_volume is required as an object")
        mri_info, mri_action = _validate_artifact(
            mri, root=root, kind=f"{case_id}.mri_volume", existing=existing,
            seen_uris=seen_uris,
        )
        mri_hash_key = ("mri_volume", mri["checksum"]["value"])
        prior_case = seen_hashes.get(mri_hash_key)
        if prior_case and prior_case != case_id:
            _fail("DUPLICATE_CASE_HASH", f"{case_id}: MRI checksum duplicates {prior_case}")
        seen_hashes[mri_hash_key] = case_id
        actions.append({"artifact_uri": mri["artifact_uri"], "action": mri_action})
        if mask is None:
            if case.get("mode_capability") != "INFERENCE_REVIEW" or case.get("compatibility") is not None:
                _fail("SCHEMA_INVALID", f"{case_id}: a missing mask requires INFERENCE_REVIEW mode and compatibility=null")
            continue
        if not isinstance(mask, dict):
            _fail("SCHEMA_INVALID", f"{case_id}: ground_truth_mask must be an object or null")
        mask_info, mask_action = _validate_artifact(
            mask, root=root, kind=f"{case_id}.ground_truth_mask", existing=existing,
            seen_uris=seen_uris,
        )
        mask_hash_key = ("ground_truth_mask", mask["checksum"]["value"])
        prior_case = seen_hashes.get(mask_hash_key)
        if prior_case and prior_case != case_id:
            _fail("DUPLICATE_CASE_HASH", f"{case_id}: mask checksum duplicates {prior_case}")
        seen_hashes[mask_hash_key] = case_id
        if mask.get("label_semantics") != "LA cavity" or mask.get("source") != "dataset annotation":
            _fail("LABEL_SEMANTICS_INVALID", f"{case_id}: mask semantics/source are not declared")
        if mask.get("label_values") != [0, 255] or mask.get("foreground_value") != 255 or mask.get("background_value") != 0:
            _fail("LABEL_VALUES_INVALID", f"{case_id}: mask labels must be exactly {{0, 255}}")
        actual_values = set(mask_info["values"])
        if actual_values != {0.0, 255.0}:
            _fail("LABEL_VALUES_INVALID", f"{case_id}: NRRD must contain both background 0 and foreground 255 only")
        compatibility = case.get("compatibility", {})
        if compatibility != {
            "shape_equal": True,
            "spacing_equal": True,
            "origin_equal": True,
            "directions_equal": True,
            "resampling_required": False,
        }:
            _fail("GEOMETRY_MISMATCH", f"{case_id}: compatibility flags do not prove exact alignment")
        for field in ("shape_xyz", "spacing_xyz", "origin_xyz", "direction_or_orientation"):
            if not _equal(mri.get(field), mask.get(field)):
                _fail("GEOMETRY_MISMATCH", f"{case_id}: MRI/mask {field} differs")
        actions.append({"artifact_uri": mask["artifact_uri"], "action": mask_action})
    return {
        "status": "PASS",
        "manifest_id": manifest["manifest_id"],
        "cases": len(cases),
        "artifacts": actions,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Contract 1 DRAFT v0")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path, help="package root for source_path files")
    parser.add_argument("--existing-index", type=Path, help="JSON map of artifact_uri to sha256")
    args = parser.parse_args(argv)
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        existing = (
            json.loads(args.existing_index.read_text(encoding="utf-8"))
            if args.existing_index else {}
        )
        result = validate_manifest(manifest, args.root, existing)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL [INPUT_INVALID] {exc}")
        return 2
    except ContractError as exc:
        print(f"FAIL [{exc.code}] {exc}")
        return 2
    print(
        f"PASS: Contract 1 DRAFT v0 {result['manifest_id']} — "
        f"{result['cases']} case(s), {len(result['artifacts'])} artifact(s); "
        f"actions={','.join(item['action'] for item in result['artifacts'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
