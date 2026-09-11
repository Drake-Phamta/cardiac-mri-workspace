#!/usr/bin/env python3
"""Validate the official LASC 2018 ZIP without extracting the full archive.

The downloaded package is larger when extracted than the available disk space.
This validator therefore reads each NRRD member directly from the ZIP stream,
validates the header and payload length, and records evidence in a machine-
readable manifest. Raw dataset bytes are never copied into the repository.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import BinaryIO, Iterable

import numpy as np


CORE_FILES = ("lgemri.nrrd", "laendo.nrrd")
PARTITIONS = ("Training Set", "Testing Set")

TYPE_DTYPES = {
    "signed char": np.dtype("i1"),
    "int8": np.dtype("i1"),
    "uchar": np.dtype("u1"),
    "unsigned char": np.dtype("u1"),
    "uint8": np.dtype("u1"),
    "short": np.dtype("i2"),
    "short int": np.dtype("i2"),
    "signed short": np.dtype("i2"),
    "int16": np.dtype("i2"),
    "ushort": np.dtype("u2"),
    "unsigned short": np.dtype("u2"),
    "uint16": np.dtype("u2"),
    "int": np.dtype("i4"),
    "signed int": np.dtype("i4"),
    "int32": np.dtype("i4"),
    "uint": np.dtype("u4"),
    "unsigned int": np.dtype("u4"),
    "uint32": np.dtype("u4"),
    "longlong": np.dtype("i8"),
    "long long": np.dtype("i8"),
    "int64": np.dtype("i8"),
    "ulonglong": np.dtype("u8"),
    "unsigned long long": np.dtype("u8"),
    "uint64": np.dtype("u8"),
    "float": np.dtype("f4"),
    "float32": np.dtype("f4"),
    "double": np.dtype("f8"),
    "float64": np.dtype("f8"),
}

DIRECT_IDENTIFIER_RE = re.compile(
    r"(?i)(patient[_ ]?name|patient[_ ]?id|subject[_ ]?name|subject[_ ]?id|"
    r"birth[_ ]?date|date[_ ]?of[_ ]?birth|accession|mrn|medical[_ ]?record)"
)


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def parse_header(stream: BinaryIO) -> tuple[dict[str, str], bytes]:
    """Read a NRRD header and return normalized fields plus the first payload bytes."""
    header = bytearray()
    payload = b""
    while len(header) < 1024 * 1024:
        block = stream.read(8192)
        if not block:
            break
        header.extend(block)
        pos = header.find(b"\n\n")
        sep_len = 2
        if pos < 0:
            pos = header.find(b"\r\n\r\n")
            sep_len = 4
        if pos >= 0:
            payload = bytes(header[pos + sep_len :])
            header = header[:pos]
            break
    if not payload and b"\n\n" not in header and b"\r\n\r\n" not in header:
        raise ValueError("NRRD header terminator not found")

    text = bytes(header).decode("ascii", errors="strict")
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or not lines[0].startswith("NRRD"):
        raise ValueError(f"invalid NRRD magic: {lines[:1]}")
    fields: dict[str, str] = {"_magic": lines[0].strip()}
    comments: list[str] = []
    for line in lines[1:]:
        if not line:
            continue
        if line.startswith("#"):
            comments.append(line[1:].strip())
            continue
        if ":" not in line:
            raise ValueError(f"invalid NRRD field: {line!r}")
        key, value = line.split(":", 1)
        fields[key.strip().lower()] = value.strip()
    fields["_comments"] = comments
    return fields, payload


def parse_int_list(value: str) -> list[int]:
    return [int(x) for x in value.split()]


def parse_vector(value: str) -> list[float] | None:
    value = value.strip()
    if value.lower() == "none":
        return None
    match = re.fullmatch(r"\(([^)]*)\)", value)
    if not match:
        raise ValueError(f"invalid vector: {value!r}")
    return [float(x) for x in match.group(1).split(",")]


def parse_vectors(value: str) -> list[list[float] | None]:
    return [parse_vector(x) for x in re.findall(r"none|\([^)]*\)", value, flags=re.I)]


def parse_origin(value: str) -> list[float] | None:
    return parse_vector(value)


def header_metadata(fields: dict[str, str]) -> dict[str, object]:
    sizes = parse_int_list(fields["sizes"])
    directions = parse_vectors(fields.get("space directions", ""))
    origin = parse_origin(fields["space origin"]) if "space origin" in fields else None
    spacing = []
    for vector in directions:
        spacing.append(None if vector is None else float(np.linalg.norm(vector)))

    nonzero = []
    axis_aligned = True
    for vector in directions:
        if vector is None:
            nonzero.append(None)
            axis_aligned = False
            continue
        arr = np.asarray(vector, dtype=float)
        nonzero.append(int(np.count_nonzero(np.abs(arr) > 1e-8)))
        if arr.size != 3 or np.count_nonzero(np.abs(arr) > 1e-8) != 1:
            axis_aligned = False
    if len(directions) != len(sizes):
        axis_aligned = False

    return {
        "type": fields.get("type"),
        "dimension": int(fields["dimension"]),
        "sizes": sizes,
        "encoding": fields.get("encoding", "raw").lower(),
        "endian": fields.get("endian", "little").lower(),
        "space": fields.get("space"),
        "space_directions": directions,
        "spacing": spacing,
        "space_origin": origin,
        "kinds": fields.get("kinds"),
        "axis_aligned": axis_aligned,
        "direction_nonzero_counts": nonzero,
    }


def read_payload(stream: BinaryIO, initial: bytes, encoding: str, expected_bytes: int) -> bytes:
    if encoding == "raw":
        remaining = expected_bytes - len(initial)
        if remaining < 0:
            raise ValueError("payload is larger than expected from header")
        data = initial + stream.read(remaining)
        if len(data) != expected_bytes:
            raise ValueError(f"payload length {len(data)} != expected {expected_bytes}")
        if stream.read(1):
            raise ValueError("payload contains bytes after expected raw array")
        return data

    if encoding in {"gzip", "gz"}:
        import gzip

        compressed = initial + stream.read()
        data = gzip.decompress(compressed)
        if len(data) != expected_bytes:
            raise ValueError(f"decompressed payload length {len(data)} != expected {expected_bytes}")
        return data

    raise ValueError(f"unsupported encoding: {encoding}")


def inspect_member(zf: zipfile.ZipFile, info: zipfile.ZipInfo) -> dict[str, object]:
    with zf.open(info, "r") as stream:
        fields, initial = parse_header(stream)
        metadata = header_metadata(fields)
        dtype = TYPE_DTYPES.get(str(metadata["type"]).lower())
        if dtype is None:
            raise ValueError(f"unsupported NRRD type: {metadata['type']!r}")
        if metadata["endian"] == "big" and dtype.itemsize > 1:
            dtype = dtype.newbyteorder(">")
        expected_count = math.prod(metadata["sizes"])
        payload = read_payload(stream, initial, metadata["encoding"], expected_count * dtype.itemsize)
        values = np.frombuffer(payload, dtype=dtype, count=expected_count)
        finite = bool(np.isfinite(values).all()) if np.issubdtype(values.dtype, np.floating) else True
        result: dict[str, object] = {
            "zip_member": info.filename,
            "zip_file_size": info.file_size,
            "zip_compress_size": info.compress_size,
            "zip_crc32": f"{info.CRC:08x}",
            "sha256_uncompressed": hashlib.sha256(payload).hexdigest(),
            "header": metadata,
            "value_count": int(values.size),
            "finite": finite,
        }
        if metadata["type"] in {"unsigned char", "uchar", "uint8", "signed char", "int8"}:
            unique = np.unique(values)
            result["unique_values"] = [int(x) for x in unique.tolist()]
            result["min"] = int(values.min()) if values.size else None
            result["max"] = int(values.max()) if values.size else None
        else:
            result["min"] = float(values.min()) if values.size else None
            result["max"] = float(values.max()) if values.size else None
        comments = fields.get("_comments", [])
        metadata_text = "\n".join(comments + [f"{k}: {v}" for k, v in fields.items() if not k.startswith("_")])
        result["privacy_flags"] = sorted(set(DIRECT_IDENTIFIER_RE.findall(metadata_text)))
        return result


def archive_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def collect_entries(zf: zipfile.ZipFile) -> dict[str, dict[str, dict[str, zipfile.ZipInfo]]]:
    entries: dict[str, dict[str, dict[str, zipfile.ZipInfo]]] = defaultdict(lambda: defaultdict(dict))
    for info in zf.infolist():
        parts = info.filename.replace("\\", "/").split("/")
        if len(parts) == 3 and parts[0] in PARTITIONS and parts[2]:
            entries[parts[0]][parts[1]][parts[2]] = info
    return entries


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--downloaded-at", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if not args.archive.is_file():
        parser.error(f"archive not found: {args.archive}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "schema_version": 1,
        "generated_at_utc": now_utc(),
        "validator": {
            "name": "tools/dataset_validate/validate_zip.py",
            "python": sys.version,
            "numpy": np.__version__,
            "strategy": "stream NRRD members directly from ZIP; no full extraction",
        },
        "source": {
            "official_url": args.source_url,
            "downloaded_at": args.downloaded_at,
            "archive_path_external": str(args.archive),
            "archive_name": args.archive.name,
            "archive_size_bytes": args.archive.stat().st_size,
            "archive_sha256": archive_sha256(args.archive),
        },
        "package_inventory": {
            "entry_count": 0,
            "partitions": {},
            "extra_top_level_files": [],
        },
        "cases": [],
        "summary": {},
        "evidence_notes": {
            "test_label_provenance": "File-level package evidence only; do not infer the final Path A/Path B decision.",
            "laendo_semantics": "The validator records values and headers; target semantics require the owner/source evidence review.",
            "lawall": "Recorded as an extra package artifact; not used as the core LA cavity target.",
        },
    }

    with zipfile.ZipFile(args.archive, "r") as zf:
        manifest["package_inventory"]["entry_count"] = len(zf.infolist())  # type: ignore[index]
        entries = collect_entries(zf)
        top_level = {name.split("/")[0] for name in zf.namelist() if name}
        manifest["package_inventory"]["extra_top_level_files"] = sorted(
            x for x in top_level if x not in PARTITIONS
        )  # type: ignore[index]

        counts = Counter()
        shape_counts = Counter()
        spacing_counts = Counter()
        direction_counts = Counter()
        all_cases: list[dict[str, object]] = []
        for partition in PARTITIONS:
            case_map = entries.get(partition, {})
            partition_summary: dict[str, object] = {
                "case_count": len(case_map),
                "core_file_presence": {name: 0 for name in CORE_FILES},
                "extra_files": Counter(),
            }
            for source_case_id in sorted(case_map):
                files = case_map[source_case_id]
                case: dict[str, object] = {
                    "partition": partition,
                    "source_case_id": source_case_id,
                    "case_id": f"CASE_{len(all_cases) + 1:04d}",
                    "files_present": sorted(files),
                    "core_file_presence": {name: name in files for name in CORE_FILES},
                    "validation": {},
                }
                for name in CORE_FILES:
                    if name in files:
                        partition_summary["core_file_presence"][name] += 1  # type: ignore[index]
                for name in files:
                    if name not in CORE_FILES:
                        partition_summary["extra_files"][name] += 1  # type: ignore[index]

                for name in CORE_FILES:
                    if name not in files:
                        continue
                    try:
                        inspected = inspect_member(zf, files[name])
                        case["validation"][name] = inspected  # type: ignore[index]
                        header = inspected["header"]
                        shape_counts[tuple(header["sizes"])] += 1  # type: ignore[index]
                        spacing = tuple(
                            None if x is None else round(float(x), 8) for x in header["spacing"]
                        )
                        spacing_counts[spacing] += 1
                        direction_counts[bool(header["axis_aligned"])] += 1
                    except Exception as exc:  # evidence must retain failures per file
                        case["validation"][name] = {"error": f"{type(exc).__name__}: {exc}"}  # type: ignore[index]

                image = case["validation"].get("lgemri.nrrd", {})  # type: ignore[union-attr]
                mask = case["validation"].get("laendo.nrrd", {})  # type: ignore[union-attr]
                if "header" in image and "header" in mask:
                    ih = image["header"]
                    mh = mask["header"]
                    case["compatibility"] = {
                        "same_sizes": ih["sizes"] == mh["sizes"],
                        "same_spacing": ih["spacing"] == mh["spacing"],
                        "same_directions": ih["space_directions"] == mh["space_directions"],
                        "same_origin": ih["space_origin"] == mh["space_origin"],
                    }
                all_cases.append(case)

            partition_summary["extra_files"] = dict(partition_summary["extra_files"])
            manifest["package_inventory"]["partitions"][partition] = partition_summary  # type: ignore[index]

        failures = []
        for case in all_cases:
            for name, result in case["validation"].items():  # type: ignore[union-attr]
                if "error" in result:
                    failures.append({"case_id": case["case_id"], "file": name, "error": result["error"]})
        mask_values = Counter()
        for case in all_cases:
            result = case["validation"].get("laendo.nrrd", {})  # type: ignore[union-attr]
            for value in result.get("unique_values", []):
                mask_values[str(value)] += 1
        compatibility = Counter()
        privacy_flags = Counter()
        for case in all_cases:
            compatibility[str(case.get("compatibility", {}))] += 1
            for result in case["validation"].values():  # type: ignore[union-attr]
                for flag in result.get("privacy_flags", []):
                    privacy_flags[flag] += 1

        manifest["cases"] = all_cases
        manifest["summary"] = {
            "case_count_total": len(all_cases),
            "case_count_by_partition": {p: sum(1 for c in all_cases if c["partition"] == p) for p in PARTITIONS},
            "validation_file_failures": failures,
            "shape_distribution": {"x".join(map(str, shape)): count for shape, count in shape_counts.items()},
            "spacing_distribution": {"|".join(map(str, spacing)): count for spacing, count in spacing_counts.items()},
            "axis_aligned_file_count": {
                "true": direction_counts[True],
                "false": direction_counts[False],
            },
            "mask_unique_value_case_counts": dict(mask_values),
            "compatibility_case_counts": dict(compatibility),
            "privacy_flags": dict(privacy_flags),
            "all_required_core_files_present": all(
                all(c["core_file_presence"].values()) for c in all_cases
            ),
            "all_core_files_validated": not failures,
        }

    args.output.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest["summary"], indent=2, ensure_ascii=False))
    return 0 if not manifest["summary"]["validation_file_failures"] else 2  # type: ignore[index]


if __name__ == "__main__":
    raise SystemExit(main())
