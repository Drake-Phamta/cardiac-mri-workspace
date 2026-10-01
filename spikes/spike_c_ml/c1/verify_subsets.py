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

Leakage chain (QA BLOCKING 3, Day 22)
-------------------------------------
The exclusion set is DERIVED, never trusted and never hard-coded. A union-find runs over
the declared same-partition groups PLUS the ``development_to_holdout_links``; no effective
training case, in any subset, may share a component with a validation or final_holdout
case. The exclusions are recomputed as the group closure of the linked development cases
and compared with ``training_exclusions``. The screen's own counts
(``pair_count_above_threshold``, ``affected_case_ids``) are checked against the groups and
links: they are the only support here that does not come from the groups themselves.

What it cannot do: the union-find runs over the DECLARED groups and links. A pair the
manifest omits altogether is invisible to it; only the restricted screen (F5) can show one.

Usage
-----
    python verify_subsets.py --manifest <split_manifest.json>
                             [--dataset-manifest <dataset_manifest.json>] [--json-out <path>]

With ``--dataset-manifest`` the census is also checked by SET EQUALITY against the dataset
manifest's case ids, so an invented id cannot hide behind a correct count.

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


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb

    def components(self) -> list[set[str]]:
        comps: dict[str, set[str]] = {}
        for case in list(self.parent):
            comps.setdefault(self.find(case), set()).add(case)
        return list(comps.values())


class Report:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []
        # Recomputed from the groups + links; preflight cross-checks DR-002b against it.
        self.derived_exclusions: set[str] = set()

    def add(self, cid: str, desc: str, ok: bool, detail: Any = None) -> None:
        self.checks.append(
            {"check_id": cid, "description": desc, "passed": bool(ok), "detail": detail}
        )

    @property
    def ok(self) -> bool:
        return all(c["passed"] for c in self.checks)


def verify(m: dict[str, Any], dataset: dict[str, Any] | None = None) -> Report:
    """Recompute every structural claim of split manifest ``m``.

    ``dataset`` (the dataset manifest), when given, adds the census set-equality checks.
    """
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

    # --- TRANSITIVE COMPONENTS OF THE DECLARED GROUPS (QA-003) -----------
    # A union-find over the DECLARED same-partition groups, treated as edge sets. It
    # shows a non-transitive grouping (two declared groups sharing a case). It is not
    # independent of the groups: a pair the manifest omits is invisible here. The
    # independent support is SCREEN-COUNTS-CONSISTENT below.
    same = _UnionFind()
    for g in groups:
        ids = g["case_ids"]
        same.find(ids[0])
        for other in ids[1:]:
            same.union(ids[0], other)
    declared = {frozenset(g["case_ids"]) for g in groups}
    recomputed = {frozenset(v) for v in same.components()}
    r.add(
        "GROUPS-TRANSITIVE",
        "declared same-partition groups equal their own transitive closure (union-find over the declared groups)",
        declared == recomputed,
        {
            "declared_component_count": len(declared),
            "recomputed_component_count": len(recomputed),
            "declared_only": [sorted(c) for c in declared - recomputed],
            "recomputed_only": [sorted(c) for c in recomputed - declared],
        },
    )

    # --- LEAKAGE CHAIN: groups + development->holdout links (QA BLOCKING 3) ----
    sim = m["similarity_screening"]
    links = sim.get("development_to_holdout_links") or []
    development = train_all | validation
    bad_links = [
        lk for lk in links
        if lk.get("development_case_id") not in development
        or lk.get("holdout_case_id") not in holdout
    ]
    r.add(
        "LINKS-ENDPOINTS-VALID",
        "every development_to_holdout link joins a development (train/validation) case to a final_holdout case",
        not bad_links,
        {"link_count": len(links), "invalid_links": bad_links},
    )

    chain = _UnionFind()
    for g in groups:
        ids = g["case_ids"]
        chain.find(ids[0])
        for other in ids[1:]:
            chain.union(ids[0], other)
    for lk in links:
        chain.union(lk["development_case_id"], lk["holdout_case_id"])
    locked = validation | holdout
    effective_sets = {
        "effective_train": train_eff,
        "25_percent": s25,
        "50_percent": s50,
        "100_percent": s100,
    }
    chain_violations: list[dict[str, Any]] = []
    touching_locked: list[list[str]] = []
    for comp in chain.components():
        if not comp & locked:
            continue
        touching_locked.append(sorted(comp))
        for sname, sset in effective_sets.items():
            if comp & sset:
                chain_violations.append(
                    {"component": sorted(comp), "subset": sname,
                     "training_members": sorted(comp & sset),
                     "validation_or_holdout_members": sorted(comp & locked)}
                )
    r.add(
        "LEAKAGE-CHAIN-CLEAN",
        "no effective training case (any subset) shares a groups+links component with a validation or final_holdout case",
        not chain_violations,
        {"components_touching_validation_or_holdout": touching_locked,
         "violations": chain_violations},
    )

    # --- EXCLUSIONS DERIVED FROM THE LINKS, NOT TRUSTED ----------------------
    # Policy (manifest training_exclusions.policy): every nominal-train case directly linked
    # to a holdout case, plus its complete same-partition group.
    linked_dev = {lk["development_case_id"] for lk in links if "development_case_id" in lk}
    comp_of: dict[str, set[str]] = {}
    for comp in same.components():
        for case in comp:
            comp_of[case] = comp
    closure: set[str] = set()
    for d in linked_dev:
        closure |= comp_of.get(d, {d})
    derived_all = closure & train_all
    derived_direct = linked_dev & train_all
    derived_propagated = derived_all - derived_direct
    tex = m["training_exclusions"]
    declared_direct = set(tex.get("direct_case_ids") or [])
    declared_propagated = set(tex.get("group_propagated_case_ids") or [])
    r.derived_exclusions = set(derived_all)
    r.add(
        "EXCL-DERIVED-FROM-LINKS",
        "training_exclusions equal the group closure of the linked development cases (recomputed from groups + links)",
        derived_all == excluded
        and derived_direct == declared_direct
        and derived_propagated == declared_propagated,
        {
            "derived_all": sorted(derived_all),
            "declared_all": sorted(excluded),
            "derived_direct": sorted(derived_direct),
            "declared_direct": sorted(declared_direct),
            "derived_group_propagated": sorted(derived_propagated),
            "declared_group_propagated": sorted(declared_propagated),
            "validation_cases_linked_to_holdout": sorted(linked_dev & validation),
        },
    )
    subset_mismatch: list[dict[str, Any]] = []
    for sname, nominal, eff in (("25_percent", n25, s25), ("50_percent", n50, s50), ("100_percent", n100, s100)):
        declared_ex = set(m["training_subsets"][sname].get("excluded_case_ids") or [])
        if declared_ex != nominal & derived_all or eff != nominal - derived_all:
            subset_mismatch.append(
                {"subset": sname,
                 "declared_excluded": sorted(declared_ex),
                 "derived_excluded": sorted(nominal & derived_all),
                 "effective_minus_derived": sorted(eff - (nominal - derived_all)),
                 "derived_minus_effective": sorted((nominal - derived_all) - eff)}
            )
    r.add(
        "SUBSET-EXCLUSIONS-DERIVED",
        "each subset's excluded_case_ids == nominal & derived exclusions, and effective == nominal - derived exclusions",
        not subset_mismatch,
        {"violations": subset_mismatch},
    )

    # --- SCREEN COUNTS vs GROUPS + LINKS (the independent support) -----------
    # Each above-threshold pair is either inside a same-partition group or a link. A group
    # of k cases holds between k-1 (a chain) and k(k-1)/2 (a clique) pairs.
    pairs_min = sum(len(g["case_ids"]) - 1 for g in groups) + len(links)
    pairs_max = sum(len(g["case_ids"]) * (len(g["case_ids"]) - 1) // 2 for g in groups) + len(links)
    affected_expected: set[str] = set()
    for g in groups:
        affected_expected |= set(g["case_ids"])
    for lk in links:
        affected_expected |= {lk.get("development_case_id"), lk.get("holdout_case_id")}
    affected_declared_list = sim.get("affected_case_ids") or []
    affected_declared = set(affected_declared_list)
    pair_count = sim.get("pair_count_above_threshold")
    affected_count = sim.get("affected_case_count")
    r.add(
        "SCREEN-COUNTS-CONSISTENT",
        "pair_count_above_threshold and affected_case_ids agree with the declared groups + links",
        isinstance(pair_count, int)
        and pairs_min <= pair_count <= pairs_max
        and affected_declared == affected_expected
        and len(affected_declared) == len(affected_declared_list)
        and affected_count == len(affected_declared),
        {
            "pair_count_above_threshold": pair_count,
            "pairs_implied_by_groups_and_links": [pairs_min, pairs_max],
            "group_count": len(groups),
            "link_count": len(links),
            "affected_case_count": affected_count,
            "affected_declared_only": sorted(affected_declared - affected_expected),
            "affected_implied_only": sorted(affected_expected - affected_declared),
        },
    )
    suspected = set((m.get("sensitivity_analysis") or {}).get("suspected_holdout_case_ids") or [])
    linked_holdout = {lk.get("holdout_case_id") for lk in links}
    r.add(
        "SENSITIVITY-SLOT-MATCHES-LINKS",
        "sensitivity_analysis.suspected_holdout_case_ids == the holdout ends of the links",
        suspected == linked_holdout,
        {"suspected": sorted(suspected), "linked_holdout": sorted(c for c in linked_holdout if c)},
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
    if dataset is not None:
        # A count cannot see an invented id that replaced a real one; set equality can.
        ds_list = [c.get("case_id") for c in dataset.get("cases", [])]
        ds_ids = set(ds_list)
        released_testing = {
            c.get("case_id") for c in dataset.get("cases", [])
            if c.get("partition_as_released") == "Testing Set"
        }
        r.add(
            "CENSUS-SET-EQUALS-DATASET",
            "train | validation | final_holdout == the dataset manifest's case ids (set equality, not a count)",
            total == ds_ids
            and len(ds_ids) == len(ds_list)
            and len(train_all) + len(validation) + len(holdout) == len(ds_ids)
            and dataset.get("case_count_total") == len(ds_ids),
            {
                "in_split_not_in_dataset": sorted(total - ds_ids),
                "in_dataset_not_in_split": sorted(c for c in ds_ids - total if c),
                "dataset_case_count_total": dataset.get("case_count_total"),
                "dataset_distinct_ids": len(ds_ids),
                "dataset_id_rows": len(ds_list),
            },
        )
        r.add(
            "HOLDOUT-EQUALS-RELEASED-TESTING-SET",
            "final_holdout == the cases released as 'Testing Set' in the dataset manifest",
            holdout == released_testing,
            {"holdout_only": sorted(holdout - released_testing),
             "testing_set_only": sorted(released_testing - holdout)},
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
    try:
        sys.stdout.reconfigure(errors="backslashreplace")  # a redirected cp1252 console must not crash
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True, type=Path)
    ap.add_argument("--dataset-manifest", type=Path,
                    help="also check the census by set equality against this dataset manifest")
    ap.add_argument("--json-out", type=Path)
    ap.add_argument(
        "--label",
        default="UNLABELLED",
        help="provenance label, e.g. C1_PREP/NON-AUTHORITATIVE_DRY_RUN or C1_ACTIVE",
    )
    args = ap.parse_args()

    manifest, sha = _load(args.manifest)
    dataset = _load(args.dataset_manifest)[0] if args.dataset_manifest else None
    report = verify(manifest, dataset)

    payload = {
        "label": args.label,
        "manifest_path": str(args.manifest),
        "manifest_sha256": sha,
        "split_id": manifest.get("split_id"),
        "manifest_generated_at": manifest.get("generated_at"),
        "verifier": "spikes/spike_c_ml/c1/verify_subsets.py",
        "method": "explicit set containment over case-id lists; no counting shortcuts; "
                  "exclusions derived from groups + development_to_holdout_links",
        "dataset_manifest_path": str(args.dataset_manifest) if args.dataset_manifest else None,
        "derived_training_exclusions": sorted(report.derived_exclusions),
        "checks": report.checks,
        "all_passed": report.ok,
    }

    print(f"label            : {args.label}")
    print(f"manifest         : {args.manifest}")
    print(f"manifest sha256  : {sha}")
    print(f"split_id         : {manifest.get('split_id')}")
    print("-" * 72)
    for c in report.checks:
        print(f"[{'PASS' if c['passed'] else 'FAIL'}] {c['check_id']:<36} {c['description']}")
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
