#!/usr/bin/env python3
"""Build the frozen Path-A split manifest from the validated dataset manifest.

The split is deterministic, case-disjoint, and group-preserving.  When the
package does not expose patient linkage, each source case directory is used as
an explicit *proxy* group and the output records that patient-level separation
cannot be proven.  Supplying --patient-map replaces that proxy with a verified
case-to-patient grouping without storing source patient identifiers in output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SEED = 2024
TRAIN_COUNT = 80
VALIDATION_COUNT = 20
HOLDOUT_COUNT = 54
SUBSET_25_COUNT = 20
SUBSET_50_COUNT = 40
KNOWN_DUPLICATE = ("CASE_0056", "CASE_0097")

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = REPO_ROOT / "data" / "manifests" / "dataset_manifest.json"
DEFAULT_OUT = REPO_ROOT / "data" / "manifests" / "split_manifest_path_a_seed2024.json"


class SplitError(ValueError):
    """Input evidence cannot support the requested split."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def seeded_rank(group_key: str, salt: str) -> str:
    payload = f"path-a|seed={SEED}|{salt}|{group_key}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def choose_exact(groups: dict[str, list[str]], target_cases: int, salt: str) -> set[str]:
    """Choose whole groups totalling target_cases via deterministic subset-sum."""
    ordered = sorted(groups, key=lambda key: (seeded_rank(key, salt), key))
    reachable: dict[int, tuple[str, ...]] = {0: ()}
    for key in ordered:
        size = len(groups[key])
        for total, selected in sorted(list(reachable.items()), reverse=True):
            new_total = total + size
            if new_total <= target_cases and new_total not in reachable:
                reachable[new_total] = selected + (key,)
    if target_cases not in reachable:
        sizes = sorted(len(v) for v in groups.values())
        raise SplitError(
            f"cannot select exactly {target_cases} cases without splitting a patient group; "
            f"group sizes are {sizes}"
        )
    return set(reachable[target_cases])


def read_patient_map(path: Path | None, case_ids: set[str]) -> tuple[dict[str, str], dict[str, Any]]:
    if path is None:
        proxy = {case_id: case_id for case_id in case_ids}
        # DR-002a: byte-identical cavity labels and independently screened MRI
        # establish one duplicated acquisition, even without patient IDs.
        proxy[KNOWN_DUPLICATE[1]] = KNOWN_DUPLICATE[0]
        return (proxy, {
            "mode": "source_case_directory_proxy_with_known_duplicate_group",
            "patient_linkage_status": "NOT_DETERMINABLE_FROM_PACKAGE",
            "statement": (
                "CASE_0056 and CASE_0097 are one duplicated acquisition under DR-002a "
                "and are grouped in training. Other case directories are only proxies: "
                "the challenge benchmark reports 154 scans from 60 de-identified "
                "patients, so additional repeat scans are expected but cannot be "
                "linked from this package. "
                "GATE-SPLIT-01 must review this limitation."
            ),
        })

    with path.open(encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    mapping = payload.get("case_to_patient") if isinstance(payload, dict) else None
    if not isinstance(mapping, dict):
        raise SplitError("patient map must be an object with a case_to_patient object")
    missing = sorted(case_ids - set(mapping))
    extra = sorted(set(mapping) - case_ids)
    if missing or extra:
        raise SplitError(
            f"patient map coverage mismatch: {len(missing)} missing, {len(extra)} unknown; "
            f"examples missing={missing[:3]}, unknown={extra[:3]}"
        )
    normalized = {}
    for case_id, patient_id in mapping.items():
        if not isinstance(patient_id, str) or not patient_id.strip():
            raise SplitError(f"patient identifier for {case_id} is empty or not a string")
        normalized[case_id] = patient_id.strip()
    return normalized, {
        "mode": "explicit_case_to_patient_map",
        "patient_linkage_status": "PROVIDED_BY_EXTERNAL_MAPPING",
        "mapping_file_sha256": sha256_file(path),
        "statement": (
            "Cases were grouped by the supplied mapping. Source patient identifiers are not "
            "written to this manifest; only de-identified sequential group IDs are retained."
        ),
    }


def build_split(dataset: dict[str, Any], dataset_path: Path,
                patient_map_path: Path | None, operator: str,
                generated_at: str | None = None) -> dict[str, Any]:
    summary = dataset.get("summary") or {}
    if summary.get("fail") != 0 or summary.get("owner_verdicts_outstanding") != 0:
        raise SplitError(
            "source dataset audit is not evidence-ready: expected summary.fail=0 and "
            "summary.owner_verdicts_outstanding=0; found "
            f"fail={summary.get('fail')!r}, "
            f"owner_verdicts_outstanding={summary.get('owner_verdicts_outstanding')!r}"
        )
    cases = dataset.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SplitError("dataset manifest has no cases")

    by_id: dict[str, dict[str, Any]] = {}
    for case in cases:
        case_id = case.get("case_id")
        if not isinstance(case_id, str) or not case_id:
            raise SplitError("every case needs a non-empty case_id")
        if case_id in by_id:
            raise SplitError(f"duplicate case_id: {case_id}")
        by_id[case_id] = case

    released_train = sorted(
        case_id for case_id, case in by_id.items()
        if case.get("partition_as_released") == "Training Set"
    )
    released_test = sorted(
        case_id for case_id, case in by_id.items()
        if case.get("partition_as_released") == "Testing Set"
    )
    unexpected = sorted(
        case_id for case_id, case in by_id.items()
        if case.get("partition_as_released") not in {"Training Set", "Testing Set"}
    )
    if len(released_train) != 100 or len(released_test) != HOLDOUT_COUNT or unexpected:
        raise SplitError(
            "Path A requires exactly 100 released-training and 54 released-testing cases; "
            f"found train={len(released_train)}, test={len(released_test)}, other={unexpected[:3]}"
        )
    missing_labels = sorted(
        case_id for case_id in by_id
        if not (by_id[case_id].get("files_present") or {}).get("laendo.nrrd")
    )
    if missing_labels:
        raise SplitError(f"Path A requires labels in all 154 obtained cases; missing: {missing_labels[:5]}")

    left, right = (by_id[cid] for cid in KNOWN_DUPLICATE)
    left_sha = (left.get("mask") or {}).get("sha256")
    right_sha = (right.get("mask") or {}).get("sha256")
    if not isinstance(left_sha, str) or len(left_sha) != 64 or left_sha != right_sha:
        raise SplitError("DR-002a duplicate pair needs equal verified laendo SHA-256 values")
    if not set(KNOWN_DUPLICATE) <= set(released_train):
        raise SplitError("DR-002a duplicate pair must both be in released Training Set")

    case_to_patient, linkage = read_patient_map(patient_map_path, set(by_id))
    if case_to_patient[KNOWN_DUPLICATE[0]] != case_to_patient[KNOWN_DUPLICATE[1]]:
        raise SplitError("patient map separates the known DR-002a duplicate acquisition")
    raw_groups: dict[str, list[str]] = {}
    for case_id, patient_key in case_to_patient.items():
        raw_groups.setdefault(patient_key, []).append(case_id)
    for members in raw_groups.values():
        members.sort()

    train_set, test_set = set(released_train), set(released_test)
    crossing = [members for members in raw_groups.values()
                if set(members) & train_set and set(members) & test_set]
    if crossing:
        raise SplitError(
            "patient map places a patient across the released Training/Testing boundary: "
            f"{crossing[:2]}"
        )

    development_groups = {
        key: members for key, members in raw_groups.items() if set(members) <= train_set
    }
    holdout_groups = {
        key: members for key, members in raw_groups.items() if set(members) <= test_set
    }
    duplicate_key = case_to_patient[KNOWN_DUPLICATE[0]]
    eligible_validation = {key: members for key, members in development_groups.items()
                           if key != duplicate_key}
    validation_keys = choose_exact(eligible_validation, VALIDATION_COUNT, "validation")
    train_keys = set(development_groups) - validation_keys
    train_groups = {key: development_groups[key] for key in train_keys}
    subset_50_keys = choose_exact(train_groups, SUBSET_50_COUNT, "subset-50")
    subset_50_groups = {key: train_groups[key] for key in subset_50_keys}
    subset_25_keys = choose_exact(subset_50_groups, SUBSET_25_COUNT, "subset-25")

    all_group_keys = sorted(raw_groups)
    public_group = {key: f"PATIENT_GROUP_{index:04d}"
                    for index, key in enumerate(all_group_keys, start=1)}

    def case_ids(keys: set[str] | list[str]) -> list[str]:
        return sorted(case_id for key in keys for case_id in raw_groups[key])

    def group_ids(keys: set[str] | list[str]) -> list[str]:
        return sorted(public_group[key] for key in keys)

    train_ids = case_ids(train_keys)
    validation_ids = case_ids(validation_keys)
    holdout_keys = set(holdout_groups)
    holdout_ids = case_ids(holdout_keys)
    subset_50_ids = case_ids(subset_50_keys)
    subset_25_ids = case_ids(subset_25_keys)

    if len(train_ids) != TRAIN_COUNT or len(validation_ids) != VALIDATION_COUNT \
            or len(holdout_ids) != HOLDOUT_COUNT:
        raise SplitError("internal count error after group-preserving allocation")
    if set(train_ids) & set(validation_ids) or set(train_ids) & set(holdout_ids) \
            or set(validation_ids) & set(holdout_ids):
        raise SplitError("internal overlap error")
    if not set(subset_25_ids) < set(subset_50_ids) < set(train_ids):
        raise SplitError("nested subset invariant failed")
    for ids in (train_ids, validation_ids, holdout_ids, subset_25_ids, subset_50_ids):
        if len(set(ids) & set(KNOWN_DUPLICATE)) not in (0, 2):
            raise SplitError("DR-002a duplicate acquisition was split")

    stamp = generated_at or datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    linkage_verified = linkage["patient_linkage_status"] == "PROVIDED_BY_EXTERNAL_MAPPING"
    return {
        "manifest_version": "1.0",
        "split_id": "path_a_seed2024_v1",
        "generated_at": stamp,
        "generated_by": "tools/dataset_split/split.py",
        "operator": operator,
        "source_dataset_manifest": {
            "path": display_path(dataset_path),
            "sha256": sha256_file(dataset_path),
            "manifest_version": dataset.get("manifest_version"),
            "dataset_generated_at": dataset.get("generated_at"),
            "case_count": dataset.get("case_count_total"),
        },
        "decision": {
            "selected_path": "Path A",
            "decision_id": "DR-002",
            "duplicate_acquisition_decision_id": "DR-002a",
            "known_duplicate_case_ids": list(KNOWN_DUPLICATE),
            "decided_at": "2026-09-14",
            "policy": "80 development-train / 20 validation / 54 locked official holdout",
        },
        "randomization": {
            "seed": SEED,
            "algorithm": (
                "whole-group subset-sum; candidate groups ordered by SHA-256 of "
                "'path-a|seed=2024|<stage>|<group-key>'"
            ),
            "stages": ["validation", "subset-50", "subset-25"],
        },
        "patient_grouping": {
            **linkage,
            "group_count": len(raw_groups),
            "multiple_scan_group_count": sum(len(v) > 1 for v in raw_groups.values()),
            "train_known_distinct_acquisitions": TRAIN_COUNT - 1,
            "source_patient_identifiers_persisted": False,
        },
        "partitions": {
            "train": {
                "case_count": len(train_ids), "patient_group_count": len(train_keys),
                "case_ids": train_ids, "patient_group_ids": group_ids(train_keys),
                "known_distinct_acquisition_count": TRAIN_COUNT - 1,
                "usage": "training and training-only data-fraction subsets",
            },
            "validation": {
                "case_count": len(validation_ids), "patient_group_count": len(validation_keys),
                "case_ids": validation_ids, "patient_group_ids": group_ids(validation_keys),
                "usage": "model selection, threshold selection, and early stopping",
            },
            "final_holdout": {
                "case_count": len(holdout_ids), "patient_group_count": len(holdout_keys),
                "case_ids": holdout_ids, "patient_group_ids": group_ids(holdout_keys),
                "source_partition": "Testing Set",
                "usage": (
                    "locked final evaluation only; never preprocessing, post-processing, "
                    "threshold, checkpoint, model, or hyperparameter selection"
                ),
            },
        },
        "training_subsets": {
            "25_percent": {
                "case_count": len(subset_25_ids), "case_ids": subset_25_ids,
                "patient_group_ids": group_ids(subset_25_keys),
            },
            "50_percent": {
                "case_count": len(subset_50_ids), "case_ids": subset_50_ids,
                "patient_group_ids": group_ids(subset_50_keys),
            },
            "100_percent": {
                "case_count": len(train_ids), "case_ids": train_ids,
                "patient_group_ids": group_ids(train_keys),
            },
        },
        "invariants": {
            "all_154_cases_assigned_exactly_once": True,
            "no_case_overlap_between_partitions": True,
            "no_group_overlap_between_partitions": True,
            "patient_level_no_overlap": True if linkage_verified else "NOT VERIFIABLE",
            "no_slice_level_randomization": True,
            "subsets_nested_25_in_50_in_100": True,
            "known_duplicate_both_pinned_to_train": set(KNOWN_DUPLICATE) <= set(train_ids),
            "known_duplicate_never_split_in_subsets": True,
            "holdout_membership_equals_released_testing_set": holdout_ids == released_test,
        },
        "gate_split_01": {
            "status": ("EVIDENCE_READY_FOR_REVIEW" if linkage_verified
                       else "BLOCKED_PATIENT_LINKAGE"),
            "closed_by_this_script": False,
            "blocking_question": (None if linkage_verified else
                "Apart from the DR-002a known duplicate, do different opaque source "
                "directories represent unique biological patients? The package "
                "does not expose enough metadata to prove this."),
        },
    }


def selftest() -> int:
    def case(index: int, partition: str) -> dict[str, Any]:
        return {
            "case_id": f"CASE_{index:04d}",
            "partition_as_released": partition,
            "files_present": {"lgemri.nrrd": True, "laendo.nrrd": True},
            "mask": {"sha256": f"{56 if index == 97 else index:064x}"},
        }

    dataset = {
        "manifest_version": "SELFTEST",
        "generated_at": "SELFTEST",
        "case_count_total": 154,
        "summary": {"fail": 0, "owner_verdicts_outstanding": 0},
        "cases": ([case(i, "Training Set") for i in range(1, 101)]
                  + [case(i, "Testing Set") for i in range(101, 155)]),
    }
    with tempfile.TemporaryDirectory() as tmp:
        dataset_path = Path(tmp) / "dataset.json"
        dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
        first = build_split(dataset, dataset_path, None, "SELFTEST", "SELFTEST")
        second = build_split(dataset, dataset_path, None, "SELFTEST", "SELFTEST")
        checks = {
            "deterministic output": first == second,
            "80/20/54 counts": [first["partitions"][k]["case_count"]
                                 for k in ("train", "validation", "final_holdout")] == [80, 20, 54],
            "holdout is released Testing Set": first["invariants"][
                "holdout_membership_equals_released_testing_set"],
            "20 subset is nested in 40 in 80": (
                set(first["training_subsets"]["25_percent"]["case_ids"])
                < set(first["training_subsets"]["50_percent"]["case_ids"])
                < set(first["training_subsets"]["100_percent"]["case_ids"])
            ),
            "unknown patient linkage is not promoted to true":
                first["invariants"]["patient_level_no_overlap"] == "NOT VERIFIABLE",
            "DR-002a pair pinned to training":
                set(KNOWN_DUPLICATE) <= set(first["partitions"]["train"]["case_ids"])
                and first["partitions"]["train"]["known_distinct_acquisition_count"] == 79,
            "DR-002a pair never split in nested subsets": all(
                len(set(KNOWN_DUPLICATE) & set(block["case_ids"])) in (0, 2)
                for block in first["training_subsets"].values()),
        }
        # Explicit pairs prove that whole multi-scan groups never split.
        mapping = {f"CASE_{i:04d}": f"P_{(i + 1) // 2:03d}" for i in range(1, 155)}
        mapping[KNOWN_DUPLICATE[1]] = mapping[KNOWN_DUPLICATE[0]]
        map_path = Path(tmp) / "patient-map.json"
        map_path.write_text(json.dumps({"case_to_patient": mapping}), encoding="utf-8")
        grouped = build_split(dataset, dataset_path, map_path, "SELFTEST", "SELFTEST")
        partition_by_case = {
            case_id: name for name, block in grouped["partitions"].items()
            for case_id in block["case_ids"]
        }
        checks["paired scans stay together"] = all(
            partition_by_case[f"CASE_{i:04d}"] == partition_by_case[f"CASE_{i + 1:04d}"]
            for i in range(1, 155, 2)
        ) and partition_by_case[KNOWN_DUPLICATE[0]] == partition_by_case[KNOWN_DUPLICATE[1]]
        checks["explicit map makes patient overlap verifiable"] = \
            grouped["invariants"]["patient_level_no_overlap"] is True

        crossing_map = {f"CASE_{i:04d}": f"P_{i:04d}" for i in range(1, 155)}
        crossing_map["CASE_0100"] = crossing_map["CASE_0101"] = "P_CROSS_BOUNDARY"
        map_path.write_text(json.dumps({"case_to_patient": crossing_map}), encoding="utf-8")
        try:
            build_split(dataset, dataset_path, map_path, "SELFTEST", "SELFTEST")
            checks["patient crossing released boundary is refused"] = False
        except SplitError:
            checks["patient crossing released boundary is refused"] = True

        dirty_dataset = dict(dataset, summary={"fail": 1, "owner_verdicts_outstanding": 0})
        try:
            build_split(dirty_dataset, dataset_path, None, "SELFTEST", "SELFTEST")
            checks["source audit with a machine failure is refused"] = False
        except SplitError:
            checks["source audit with a machine failure is refused"] = True

    bad = [name for name, passed in checks.items() if not passed]
    for name, passed in checks.items():
        print(f"  {'ok  ' if passed else 'FAIL'} {name}")
    print(f"\n  split selftest: {len(checks) - len(bad)}/{len(checks)} passed\n")
    return 1 if bad else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-manifest", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--patient-map", type=Path,
                        help="JSON object containing case_to_patient for every case")
    parser.add_argument("--operator", help="human owner recorded in the generated artifact")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.operator:
        parser.error("--operator is required for a real split artifact")
    try:
        with args.dataset_manifest.open(encoding="utf-8-sig") as handle:
            dataset = json.load(handle)
        manifest = build_split(dataset, args.dataset_manifest.resolve(),
                               args.patient_map.resolve() if args.patient_map else None,
                               args.operator)
    except (OSError, json.JSONDecodeError, SplitError) as exc:
        print(f"split refused: {exc}", file=sys.stderr)
        return 2
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = manifest["partitions"]
    print(f"wrote {args.out}")
    print(f"Path A seed {SEED}: train {counts['train']['case_count']} · "
          f"validation {counts['validation']['case_count']} · "
          f"locked holdout {counts['final_holdout']['case_count']}")
    print(f"patient linkage: {manifest['patient_grouping']['patient_linkage_status']}")
    print(f"GATE-SPLIT-01: {manifest['gate_split_01']['status']} — this script closes no gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
