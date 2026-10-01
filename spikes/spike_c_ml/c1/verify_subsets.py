#!/usr/bin/env python3
"""C1 split-manifest structural verifier -- SET CONTAINMENT, not counting.

Scope and limits
----------------
This script reads a split manifest JSON and proves structural properties by
explicit set algebra. It does NOT read voxels, does NOT open any NRRD, does NOT
resolve any path on disk, and does NOT train anything.

It exists because the manifest's own ``invariants`` block asserts booleans
(``subsets_nested_25_in_50_in_100: true`` and friends). An asserted boolean is a
claim by the generator, not evidence. This script recomputes each claim from the
case-ID lists themselves and reports agreement or disagreement.

Counting is not containment. ``len(a) <= len(b)`` proves nothing about ``a <= b``.
Every nesting check here is ``set.issubset``.

Usage
-----
    python verify_subsets.py --manifest <split_manifest.json> [--json-out <path>]

Exit code 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


def _load(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    return json.loads(raw.decode("utf-8-sig")), sha


def _ids(node: Any, *keys: str) -> set[str]:
    cur = node
    for k in keys:
        cur = cur[k]
    if not isinstance(cur, list):
        raise TypeError(f"expected list at {'/'.join(keys)}, got {type(cur).__name__}")
    out = set(cur)
    if len(out) != len(cur):
        dupes = sorted({c for c in cur if cur.count(c) > 1})
        raise ValueError(f"duplicate ids at {'/'.join(keys)}: {dupes}")
    return out


class Report:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []

    def add(self, cid: str, desc: str, ok: bool, detail: Any = None) -> None:
        self.checks.append(
            {"check_id": cid, "description": desc, "passed": bool(ok), "detail": detail}
        )

    @property
    def ok(self) -> bool:
        return all(c["passed"] for c in self.checks)


def verify(m: dict[str, Any]) -> Report:
    r = Report()

    train_all = _ids(m, "partitions", "train", "case_ids")
    train_eff = _ids(m, "partitions", "train", "effective_training_case_ids")
    validation = _ids(m, "partitions", "validation", "case_ids")
    holdout = _ids(m, "partitions", "final_holdout", "case_ids")
    excluded = _ids(m, "training_exclusions", "all_excluded_case_ids")

    s25 = _ids(m, "training_subsets", "25_percent", "effective_case_ids")
    s50 = _ids(m, "training_subsets", "50_percent", "effective_case_ids")
    s100 = _ids(m, "training_subsets", "100_percent", "effective_case_ids")

    n25 = _ids(m, "training_subsets", "25_percent", "case_ids")
    n50 = _ids(m, "training_subsets", "50_percent", "case_ids")
    n100 = _ids(m, "training_subsets", "100_percent", "case_ids")

    # --- NESTING BY SET CONTAINMENT -------------------------------------
    r.add(
        "NEST-EFF-25-IN-50",
        "effective 25% subset is a SUBSET of the effective 50% subset",
        s25 <= s50,
        {"missing_from_50": sorted(s25 - s50)},
    )
    r.add(
        "NEST-EFF-50-IN-100",
        "effective 50% subset is a SUBSET of the effective 100% subset",
        s50 <= s100,
        {"missing_from_100": sorted(s50 - s100)},
    )
    r.add(
        "NEST-EFF-25-IN-100",
        "effective 25% subset is a SUBSET of the effective 100% subset (transitive, checked directly)",
        s25 <= s100,
        {"missing_from_100": sorted(s25 - s100)},
    )
    r.add(
        "NEST-NOM-25-IN-50",
        "nominal 25% subset is a SUBSET of the nominal 50% subset",
        n25 <= n50,
        {"missing_from_50": sorted(n25 - n50)},
    )
    r.add(
        "NEST-NOM-50-IN-100",
        "nominal 50% subset is a SUBSET of the nominal 100% subset",
        n50 <= n100,
        {"missing_from_100": sorted(n50 - n100)},
    )

    # --- PARTITION DISCIPLINE -------------------------------------------
    r.add(
        "TRAIN-ONLY-100",
        "every effective-100% case is a member of the train partition",
        s100 <= train_all,
        {"outside_train": sorted(s100 - train_all)},
    )
    r.add(
        "NO-VALIDATION-LEAK",
        "no effective training subset intersects the validation partition",
        not (s100 & validation) and not (s50 & validation) and not (s25 & validation),
        {
            "in_25": sorted(s25 & validation),
            "in_50": sorted(s50 & validation),
            "in_100": sorted(s100 & validation),
        },
    )
    r.add(
        "NO-HOLDOUT-LEAK",
        "no effective training subset intersects the locked final holdout",
        not (s100 & holdout) and not (s50 & holdout) and not (s25 & holdout),
        {
            "in_25": sorted(s25 & holdout),
            "in_50": sorted(s50 & holdout),
            "in_100": sorted(s100 & holdout),
        },
    )
    r.add(
        "PARTITIONS-DISJOINT",
        "train / validation / final_holdout are pairwise disjoint",
        not (train_all & validation) and not (train_all & holdout) and not (validation & holdout),
        {
            "train_n_validation": sorted(train_all & validation),
            "train_n_holdout": sorted(train_all & holdout),
            "validation_n_holdout": sorted(validation & holdout),
        },
    )

    # --- DR-002b EXCLUSIONS ---------------------------------------------
    r.add(
        "EXCL-ABSENT-EVERYWHERE",
        "every DR-002b training exclusion is absent from EVERY effective subset",
        not (excluded & (s25 | s50 | s100)),
        {
            "excluded": sorted(excluded),
            "leaked_into_25": sorted(excluded & s25),
            "leaked_into_50": sorted(excluded & s50),
            "leaked_into_100": sorted(excluded & s100),
        },
    )
    r.add(
        "EXCL-DERIVES-EFFECTIVE-TRAIN",
        "effective train == train partition minus the exclusion set (recomputed, not trusted)",
        train_eff == (train_all - excluded),
        {
            "unexpected_present": sorted(train_eff - (train_all - excluded)),
            "unexpected_absent": sorted((train_all - excluded) - train_eff),
        },
    )
    r.add(
        "EFF-100-EQUALS-EFF-TRAIN",
        "the effective 100% subset is exactly the effective train partition",
        s100 == train_eff,
        {
            "only_in_subset": sorted(s100 - train_eff),
            "only_in_train": sorted(train_eff - s100),
        },
    )

    # --- CORRELATION GROUPS ARE NEVER SPLIT ------------------------------
    groups = m["similarity_screening"]["same_partition_groups"]
    split_in_partition: list[dict[str, Any]] = []
    split_in_subset: list[dict[str, Any]] = []
    for g in groups:
        gid = g["group_id"]
        members = set(g["case_ids"])
        for pname, pset in (
            ("train", train_all),
            ("validation", validation),
            ("final_holdout", holdout),
        ):
            inter = members & pset
            if inter and inter != members:
                split_in_partition.append(
                    {"group_id": gid, "partition": pname, "inside": sorted(inter),
                     "outside": sorted(members - pset)}
                )
        for sname, sset in (("25_percent", s25), ("50_percent", s50), ("100_percent", s100)):
            # A group may be wholly absent from a subset. It must never be partly present,
            # unless the missing members are DR-002b exclusions, which are absent by policy.
            inter = members & sset
            expected = members - excluded
            if inter and inter != expected:
                split_in_subset.append(
                    {"group_id": gid, "subset": sname, "present": sorted(inter),
                     "expected": sorted(expected)}
                )
    r.add(
        "GROUPS-WHOLE-IN-PARTITION",
        "no correlation group is split across train / validation / holdout",
        not split_in_partition,
        {"violations": split_in_partition},
    )
    r.add(
        "GROUPS-WHOLE-IN-SUBSET",
        "no correlation group is partially present in a nested subset (exclusions aside)",
        not split_in_subset,
        {"violations": split_in_subset},
    )

    # --- TRANSITIVE COMPONENTS (QA-003 open question) --------------------
    # Recompute connected components from the declared same-partition groups
    # treated as edge sets, so a non-transitive grouping is visible.
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for g in groups:
        ids = g["case_ids"]
        for other in ids[1:]:
            union(ids[0], other)
    comps: dict[str, set[str]] = {}
    for case in parent:
        comps.setdefault(find(case), set()).add(case)
    declared = {frozenset(g["case_ids"]) for g in groups}
    recomputed = {frozenset(v) for v in comps.values()}
    r.add(
        "GROUPS-TRANSITIVE",
        "declared same-partition groups equal the recomputed transitive components",
        declared == recomputed,
        {
            "declared_component_count": len(declared),
            "recomputed_component_count": len(recomputed),
            "declared_only": [sorted(c) for c in declared - recomputed],
            "recomputed_only": [sorted(c) for c in recomputed - declared],
        },
    )

    # --- CENSUS ----------------------------------------------------------
    total = train_all | validation | holdout
    declared_total = m["source_dataset_manifest"]["case_count"]
    r.add(
        "CENSUS-EXACTLY-ONCE",
        "the three partitions together cover every declared case exactly once",
        len(total) == declared_total
        and len(train_all) + len(validation) + len(holdout) == declared_total,
        {
            "union_size": len(total),
            "sum_of_partitions": len(train_all) + len(validation) + len(holdout),
            "declared_case_count": declared_total,
        },
    )

    # --- MANIFEST SELF-CONSISTENCY ---------------------------------------
    stated = {
        "25_percent": m["training_subsets"]["25_percent"]["effective_case_count"],
        "50_percent": m["training_subsets"]["50_percent"]["effective_case_count"],
        "100_percent": m["training_subsets"]["100_percent"]["effective_case_count"],
    }
    actual = {"25_percent": len(s25), "50_percent": len(s50), "100_percent": len(s100)}
    r.add(
        "COUNTS-MATCH-LISTS",
        "stated effective_case_count matches the length of the corresponding id list",
        stated == actual,
        {"stated": stated, "actual": actual},
    )
    r.add(
        "THRESHOLD-DECLARED",
        "DR-002b threshold, operator and declaration date are present as fields",
        all(
            m["similarity_screening"].get(k) not in (None, "")
            for k in ("threshold", "threshold_operator", "threshold_declared_at")
        ),
        {
            "threshold": m["similarity_screening"].get("threshold"),
            "operator": m["similarity_screening"].get("threshold_operator"),
            "declared_at": m["similarity_screening"].get("threshold_declared_at"),
        },
    )

    return r


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", required=True, type=Path)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument(
        "--label",
        default="UNLABELLED",
        help="provenance label, e.g. C1_PREP/NON-AUTHORITATIVE_DRY_RUN or C1_ACTIVE",
    )
    args = ap.parse_args()

    manifest, sha = _load(args.manifest)
    report = verify(manifest)

    payload = {
        "label": args.label,
        "manifest_path": str(args.manifest),
        "manifest_sha256": sha,
        "split_id": manifest.get("split_id"),
        "manifest_generated_at": manifest.get("generated_at"),
        "verifier": "spikes/spike_c_ml/c1/verify_subsets.py",
        "method": "explicit set containment over case-id lists; no counting shortcuts",
        "checks": report.checks,
        "all_passed": report.ok,
    }

    print(f"label            : {args.label}")
    print(f"manifest         : {args.manifest}")
    print(f"manifest sha256  : {sha}")
    print(f"split_id         : {manifest.get('split_id')}")
    print("-" * 72)
    for c in report.checks:
        print(f"[{'PASS' if c['passed'] else 'FAIL'}] {c['check_id']:<28} {c['description']}")
        if not c["passed"]:
            print(f"       detail: {json.dumps(c['detail'], ensure_ascii=False)}")
    print("-" * 72)
    print(f"RESULT: {'ALL CHECKS PASS' if report.ok else 'FAILURES PRESENT'}")

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"json evidence  : {args.json_out}")

    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
