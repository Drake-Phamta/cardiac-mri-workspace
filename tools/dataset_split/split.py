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
import math
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
SIMILARITY_THRESHOLD = 0.75
SIMILARITY_DECISION_DATE = "2026-09-17"
LIMITATION = (
    "Patient-level separation is NOT VERIFIABLE for this release; the implemented "
    "safeguard is case-level disjointness plus correlation-screen grouping and exclusion."
)

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


def inside_repo(path: Path) -> bool:
    try:
        path.resolve().relative_to(REPO_ROOT)
        return True
    except ValueError:
        return False


def package_sha256(dataset: dict[str, Any]) -> str:
    files = ((dataset.get("acquisition") or {}).get("package_files") or [])
    hashes = [item.get("sha256") for item in files
              if isinstance(item, dict) and isinstance(item.get("sha256"), str)]
    if len(hashes) != 1 or len(hashes[0]) != 64:
        raise SplitError("dataset manifest must identify exactly one source package SHA-256")
    return hashes[0].lower()


def read_similarity_screen(path: Path | None, dataset: dict[str, Any],
                           case_ids: set[str]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read private pair scores and return only policy-safe derived evidence."""
    if path is None:
        raise SplitError("DR-002b requires --linkage-screen before generating the split")
    if inside_repo(path):
        raise SplitError("F5 requires the pairwise linkage screen to remain outside the repository")
    with path.open(encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    expected_pairs = len(case_ids) * (len(case_ids) - 1) // 2
    if payload.get("case_count") != len(case_ids) or payload.get("pair_count") != expected_pairs:
        raise SplitError("linkage screen case/pair counts do not match the dataset manifest")
    if str(payload.get("source_dataset_sha256", "")).lower() != package_sha256(dataset):
        raise SplitError("linkage screen source package SHA-256 does not match the dataset manifest")
    top = payload.get("top_all")
    if not isinstance(top, list) or not top:
        raise SplitError("linkage screen has no ranked top_all evidence")
    parsed = []
    previous = math.inf
    seen: set[tuple[str, str]] = set()
    for item in top:
        ids = item.get("case_ids") if isinstance(item, dict) else None
        score = item.get("pearson_r") if isinstance(item, dict) else None
        if not isinstance(ids, list) or len(ids) != 2 or set(ids) - case_ids:
            raise SplitError("linkage screen contains an invalid or unknown case pair")
        if ids[0] == ids[1] or not isinstance(score, (int, float)) or not math.isfinite(score):
            raise SplitError("linkage screen contains an invalid Pearson score")
        pair = tuple(sorted(ids))
        if pair in seen or score > previous:
            raise SplitError("linkage screen top_all must be unique and sorted descending")
        seen.add(pair)
        previous = score
        if score >= SIMILARITY_THRESHOLD:
            parsed.append({"case_ids": list(pair), "pearson_r": float(score)})
    if top[-1].get("pearson_r") >= SIMILARITY_THRESHOLD and len(top) < expected_pairs:
        raise SplitError(
            "linkage screen truncates while still above the declared threshold; "
            "the complete above-threshold set cannot be proven"
        )
    if not any(set(item["case_ids"]) == set(KNOWN_DUPLICATE) for item in parsed):
        raise SplitError("declared threshold does not recover the DR-002a known duplicate")
    return parsed, {
        "restricted_screen_sha256": sha256_file(path),
        "source_package_sha256": package_sha256(dataset),
        "pair_count_screened": expected_pairs,
    }


def similarity_proxy_map(case_ids: set[str], pairs: list[dict[str, Any]],
                         released_train: set[str], released_test: set[str]) \
        -> tuple[dict[str, str], list[dict[str, str]]]:
    """Group same-side candidates and inventory development-to-holdout links."""
    parent = {case_id: case_id for case_id in case_ids}

    def find(case_id: str) -> str:
        while parent[case_id] != case_id:
            parent[case_id] = parent[parent[case_id]]
            case_id = parent[case_id]
        return case_id

    def union(left: str, right: str) -> None:
        a, b = find(left), find(right)
        parent[max(a, b)] = min(a, b)

    cross_links = []
    for item in pairs:
        left, right = item["case_ids"]
        if {left, right} <= released_train or {left, right} <= released_test:
            union(left, right)
        else:
            development = left if left in released_train else right
            holdout = right if right in released_test else left
            cross_links.append({
                "development_case_id": development,
                "holdout_case_id": holdout,
                "score_relation": f"pearson_r >= {SIMILARITY_THRESHOLD}",
                "exact_score": "RESTRICTED_BY_F5",
            })
    return ({case_id: find(case_id) for case_id in case_ids},
            sorted(cross_links, key=lambda item: (
                item["development_case_id"], item["holdout_case_id"])))


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
        raise SplitError("internal error: proxy grouping requires a DR-002b linkage screen")

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
                patient_map_path: Path | None, linkage_screen_path: Path | None,
                operator: str,
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

    duplicate_evidence = dataset.get("duplicate_evidence") or []
    duplicate_recorded = any(
        item.get("file") == "laendo.nrrd"
        and set(item.get("case_ids") or []) == set(KNOWN_DUPLICATE)
        for item in duplicate_evidence if isinstance(item, dict)
    )
    # Compatibility for the pre-F5 public manifest already on main: it carries
    # equal per-file hashes.  Once #34 lands, those hashes disappear and the
    # public duplicate_evidence inventory is the required proof instead.
    left, right = (by_id[cid] for cid in KNOWN_DUPLICATE)
    left_sha = (left.get("mask") or {}).get("sha256")
    right_sha = (right.get("mask") or {}).get("sha256")
    legacy_hash_proof = (isinstance(left_sha, str) and len(left_sha) == 64
                         and left_sha == right_sha)
    if not (duplicate_recorded or legacy_hash_proof):
        raise SplitError(
            "DR-002a duplicate pair must be recorded in public duplicate evidence "
            "(or the pre-F5 manifest's equal verified laendo SHA-256 values)"
        )
    if not set(KNOWN_DUPLICATE) <= set(released_train):
        raise SplitError("DR-002a duplicate pair must both be in released Training Set")

    screen_pairs: list[dict[str, Any]] = []
    screen_meta: dict[str, Any] | None = None
    cross_links: list[dict[str, str]] = []
    if patient_map_path is None:
        screen_pairs, screen_meta = read_similarity_screen(
            linkage_screen_path, dataset, set(by_id))
        case_to_patient, cross_links = similarity_proxy_map(
            set(by_id), screen_pairs, set(released_train), set(released_test))
        linkage = {
            "mode": "correlation_screen_proxy_groups",
            "patient_linkage_status": "NOT_VERIFIABLE_DOCUMENTED_EXCEPTION",
            "statement": LIMITATION,
        }
    else:
        if linkage_screen_path is not None:
            raise SplitError("--patient-map replaces DR-002b screening; do not supply both inputs")
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

    directly_linked_development = {
        item["development_case_id"] for item in cross_links
    }
    exclusion_group_keys = {
        case_to_patient[case_id] for case_id in directly_linked_development
        if case_to_patient[case_id] in train_keys
    }
    excluded_from_training = case_ids(exclusion_group_keys)
    direct_exclusions = sorted(directly_linked_development & set(excluded_from_training))
    propagated_exclusions = sorted(set(excluded_from_training) - set(direct_exclusions))

    def effective_training_block(ids: list[str]) -> dict[str, Any]:
        excluded = sorted(set(ids) & set(excluded_from_training))
        effective = sorted(set(ids) - set(excluded))
        return {
            "case_count": len(ids),
            "nominal_case_count": len(ids),
            "case_ids": ids,
            "excluded_case_ids": excluded,
            "effective_case_count": len(effective),
            "effective_case_ids": effective,
        }

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
    for members in raw_groups.values():
        group = set(members)
        for ids in (train_ids, validation_ids, holdout_ids,
                    subset_25_ids, subset_50_ids):
            if len(group & set(ids)) not in (0, len(group)):
                raise SplitError("a DR-002b similarity/patient group was split")

    if patient_map_path is None and not excluded_from_training:
        raise SplitError(
            "DR-002b expected at least one holdout-linked development exclusion at the "
            "declared threshold; review the private screen and deterministic allocation"
        )

    stamp = generated_at or datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    linkage_verified = linkage["patient_linkage_status"] == "PROVIDED_BY_EXTERNAL_MAPPING"
    similarity_groups = [
        {"group_id": public_group[key], "case_ids": members}
        for key, members in sorted(raw_groups.items())
        if len(members) > 1
    ]
    similarity_screening = ({
        "status": "APPLIED_UNDER_DOCUMENTED_EXCEPTION",
        "decision_id": "DR-002b",
        "decision_option": "(c) + (d)",
        "threshold_metric": "Pearson correlation of sampled MRI features",
        "screen_method": (
            "MRI-only; per-volume z-score; fixed normalized-grid (24,24,22) sample; "
            "sampled-vector re-centering and L2 normalization; all unordered case pairs"
        ),
        "group_semantics": (
            "transitive connected components of same-released-partition pairs at or "
            "above threshold; cross-partition pairs are holdout links, not extra "
            "same-partition groups"
        ),
        "threshold_operator": ">=",
        "threshold": SIMILARITY_THRESHOLD,
        "threshold_declared_at": SIMILARITY_DECISION_DATE,
        "threshold_basis": (
            "fixed before training at the upper-tail break after rank 5; exact ranked "
            "pair scores remain in the restricted screen under F5"
        ),
        **(screen_meta or {}),
        "pair_count_above_threshold": len(screen_pairs),
        "affected_case_count": len({cid for item in screen_pairs for cid in item["case_ids"]}),
        "affected_case_ids": sorted({cid for item in screen_pairs for cid in item["case_ids"]}),
        "same_partition_groups": similarity_groups,
        "development_to_holdout_links": cross_links,
        "exact_pair_scores": "RESTRICTED_BY_F5",
        "regenerate": (
            "python tools/dataset_split/linkage_screen.py --archive <private ZIP> "
            "--dataset-manifest data/manifests/dataset_manifest.json "
            "--split-manifest data/manifests/split_manifest_path_a_seed2024.json "
            "--out <private path outside repository>/linkage_screen.json"
        ),
    } if not linkage_verified else {
        "status": "REPLACED_BY_AUTHORITATIVE_PATIENT_MAP",
        "decision_id": "DR-002b",
    })
    return {
        "manifest_version": "1.0",
        "split_id": "path_a_seed2024_dr002b_v1",
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
            "patient_linkage_exception_decision_id": "DR-002b",
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
        "similarity_screening": similarity_screening,
        "partitions": {
            "train": {
                "case_count": len(train_ids), "patient_group_count": len(train_keys),
                "case_ids": train_ids, "patient_group_ids": group_ids(train_keys),
                "known_distinct_acquisition_count": TRAIN_COUNT - 1,
                "training_exclusion_count": len(excluded_from_training),
                "training_excluded_case_ids": excluded_from_training,
                "effective_training_case_count": len(train_ids) - len(excluded_from_training),
                "effective_training_case_ids": sorted(set(train_ids) - set(excluded_from_training)),
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
            "25_percent": {**effective_training_block(subset_25_ids),
                           "patient_group_ids": group_ids(subset_25_keys)},
            "50_percent": {**effective_training_block(subset_50_ids),
                           "patient_group_ids": group_ids(subset_50_keys)},
            "100_percent": {**effective_training_block(train_ids),
                            "patient_group_ids": group_ids(train_keys)},
        },
        "training_exclusions": {
            "policy": (
                "Exclude every nominal-train development case directly linked to a "
                "holdout case at or above the threshold, plus its complete similarity "
                "group so no group is split by effective training."
            ),
            "direct_case_ids": direct_exclusions,
            "group_propagated_case_ids": propagated_exclusions,
            "all_excluded_case_ids": excluded_from_training,
            "remaining_effective_train_count": len(train_ids) - len(excluded_from_training),
            "exact_pair_scores": "RESTRICTED_BY_F5",
        },
        "sensitivity_analysis": {
            "status": "PENDING_SPIKE_C1",
            "primary_metric": "TO_BE_RECORDED_ON_ALL_54_LOCKED_HOLDOUT_CASES",
            "sensitivity_metric": (
                "TO_BE_RECORDED_AFTER_EXCLUDING_SUSPECTED_HOLDOUT_CASES"
            ),
            "suspected_holdout_case_ids": sorted({
                item["holdout_case_id"] for item in cross_links
            }),
            "interpretation_required": True,
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
            "similarity_groups_never_split_in_partitions_or_subsets": True,
            "training_exclusions_removed_from_every_effective_subset": all(
                not (set(block["effective_case_ids"]) & set(excluded_from_training))
                for block in (
                    effective_training_block(subset_25_ids),
                    effective_training_block(subset_50_ids),
                    effective_training_block(train_ids),
                )
            ),
            "holdout_membership_equals_released_testing_set": holdout_ids == released_test,
            "patient_linkage_limitation": LIMITATION,
        },
        "gate_split_01": {
            "status": "EVIDENCE_READY_FOR_REVIEW",
            "closed_by_this_script": False,
            "documented_exception": None if linkage_verified else LIMITATION,
            "closes_on": "review approval and Project Control transition",
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
        "acquisition": {"package_files": [{"sha256": "a" * 64}]},
        "summary": {"fail": 0, "owner_verdicts_outstanding": 0},
        "duplicate_evidence": [{
            "file": "laendo.nrrd", "case_ids": list(KNOWN_DUPLICATE),
        }],
        "cases": ([case(i, "Training Set") for i in range(1, 101)]
                  + [case(i, "Testing Set") for i in range(101, 155)]),
    }
    with tempfile.TemporaryDirectory() as tmp:
        dataset_path = Path(tmp) / "dataset.json"
        dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
        screen_path = Path(tmp).parent / f"split-selftest-{Path(tmp).name}.json"
        screen = {
            "case_count": 154,
            "pair_count": 11781,
            "source_dataset_sha256": "a" * 64,
            "top_all": [
                {"case_ids": ["CASE_0056", "CASE_0097"], "pearson_r": 0.999999},
                {"case_ids": ["CASE_0056", "CASE_0120"], "pearson_r": 0.9},
                {"case_ids": ["CASE_0057", "CASE_0058"], "pearson_r": 0.8},
                {"case_ids": ["CASE_0001", "CASE_0002"], "pearson_r": 0.7},
            ],
        }
        screen_path.write_text(json.dumps(screen), encoding="utf-8")
        try:
            first = build_split(dataset, dataset_path, None, screen_path,
                                "SELFTEST", "SELFTEST")
            second = build_split(dataset, dataset_path, None, screen_path,
                                 "SELFTEST", "SELFTEST")
        finally:
            screen_path.unlink(missing_ok=True)
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
            "DR-002b threshold declared before training":
                first["similarity_screening"]["threshold"] == SIMILARITY_THRESHOLD
                and first["similarity_screening"]["threshold_declared_at"]
                    == SIMILARITY_DECISION_DATE,
            "same-side correlation grouping is transitive": (
                lambda grouped: grouped["CASE_0001"] == grouped["CASE_0002"]
                == grouped["CASE_0003"] and grouped["CASE_0001"] != grouped["CASE_0101"]
            )(similarity_proxy_map(
                {"CASE_0001", "CASE_0002", "CASE_0003", "CASE_0101"},
                [{"case_ids": ["CASE_0001", "CASE_0002"]},
                 {"case_ids": ["CASE_0002", "CASE_0003"]}],
                {"CASE_0001", "CASE_0002", "CASE_0003"}, {"CASE_0101"}
            )[0]),
            "holdout-linked case and full group excluded from effective train":
                first["training_exclusions"]["direct_case_ids"] == ["CASE_0056"]
                and first["training_exclusions"]["group_propagated_case_ids"]
                    == ["CASE_0097"]
                and first["training_exclusions"]["remaining_effective_train_count"] == 78,
            "excluded group absent from every effective subset": all(
                not (set(KNOWN_DUPLICATE) & set(block["effective_case_ids"]))
                for block in first["training_subsets"].values()),
            "exact pair scores remain restricted":
                first["similarity_screening"]["exact_pair_scores"] == "RESTRICTED_BY_F5"
                and all(item["exact_score"] == "RESTRICTED_BY_F5"
                        for item in first["similarity_screening"]
                        ["development_to_holdout_links"]),
            "sensitivity placeholder names suspected holdout":
                first["sensitivity_analysis"]["status"] == "PENDING_SPIKE_C1"
                and first["sensitivity_analysis"]["suspected_holdout_case_ids"]
                    == ["CASE_0120"],
        }
        # Explicit pairs prove that whole multi-scan groups never split.
        mapping = {f"CASE_{i:04d}": f"P_{(i + 1) // 2:03d}" for i in range(1, 155)}
        mapping[KNOWN_DUPLICATE[1]] = mapping[KNOWN_DUPLICATE[0]]
        map_path = Path(tmp) / "patient-map.json"
        map_path.write_text(json.dumps({"case_to_patient": mapping}), encoding="utf-8")
        grouped = build_split(dataset, dataset_path, map_path, None,
                              "SELFTEST", "SELFTEST")
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
            build_split(dataset, dataset_path, map_path, None,
                        "SELFTEST", "SELFTEST")
            checks["patient crossing released boundary is refused"] = False
        except SplitError:
            checks["patient crossing released boundary is refused"] = True

        dirty_dataset = dict(dataset, summary={"fail": 1, "owner_verdicts_outstanding": 0})
        try:
            build_split(dirty_dataset, dataset_path, None, None,
                        "SELFTEST", "SELFTEST")
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
    parser.add_argument(
        "--linkage-screen", type=Path,
        help=("private linkage_screen.py JSON outside the repository; required under "
              "DR-002b unless --patient-map supplies an authoritative mapping"),
    )
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
                               args.linkage_screen.resolve() if args.linkage_screen else None,
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
    print(f"effective train after DR-002b exclusions: "
          f"{manifest['partitions']['train']['effective_training_case_count']}")
    print(f"GATE-SPLIT-01: {manifest['gate_split_01']['status']} — this script closes no gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
