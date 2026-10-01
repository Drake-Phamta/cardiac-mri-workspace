#!/usr/bin/env python3
"""Spike C1 preflight -- fail-closed gate, subset and data-root checks.

Implements section 1 of management/spikes/SPIKE_C_ML/C1_MEASUREMENT_PLAN.md.

It does NOT read voxels. It resolves paths and calls ``Path.exists()``; it never
opens an NRRD. Its whole purpose is to prove, before a single byte of image data
is loaded, that the run cannot reach validation or holdout cases.

Two subcommands
---------------
``check``      run the preflight against a data root and a split manifest.
``make-root``  build an allowlisted TRAINING-ONLY root out of directory links,
               so that holdout and validation cases are not merely filtered in
               software but are not reachable through the root at all.

Why ``make-root`` exists
------------------------
The released package puts ``Training Set/`` and ``Testing Set/`` side by side
under one parent. Pointing the loader at that parent means the locked holdout is
one path join away. The measurement plan is explicit that "a software filter
alone is not proof". ``make-root`` produces a root that contains links to the
effective training case directories and nothing else, and ``check`` then proves
that no validation or holdout directory resolves beneath it.

Gate state is never inferred. ``--gate-split-01`` and ``--gate-data-01`` must be
passed explicitly, and ``check`` refuses to report a runnable preflight unless
both are ``CLOSED``. Passing ``--allow-open-gates`` downgrades the run to a
labelled dry run that is explicitly NOT Spike C1 evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from verify_subsets import verify as verify_subsets  # noqa: E402


def _load(p: Path) -> tuple[Any, str]:
    raw = p.read_bytes()
    return json.loads(raw.decode("utf-8-sig")), hashlib.sha256(raw).hexdigest()


def _case_dirs(dataset: dict[str, Any]) -> dict[str, str]:
    return {c["case_id"]: c["source_dir_relative"] for c in dataset["cases"]}


def _environment() -> dict[str, Any]:
    env: dict[str, Any] = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "processor": platform.processor(),
        "hostname": platform.node(),
        "captured_at": datetime.now(timezone.utc).astimezone().isoformat(),
    }
    for mod in ("torch", "numpy", "transformers", "huggingface_hub", "nrrd"):
        try:
            m = __import__(mod)
            env[mod] = getattr(m, "__version__", "unknown")
        except Exception as exc:  # noqa: BLE001
            env[mod] = f"NOT INSTALLED ({type(exc).__name__})"
    try:
        import torch

        env["cuda_available"] = torch.cuda.is_available()
        env["cuda_version"] = torch.version.cuda
        env["cudnn_version"] = torch.backends.cudnn.version()
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            env["gpu_name"] = props.name
            env["gpu_total_memory_bytes"] = props.total_memory
            env["bf16_supported"] = torch.cuda.is_bf16_supported()
        else:
            env["gpu_name"] = None
        env["mps_available"] = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    except Exception as exc:  # noqa: BLE001
        env["torch_probe_error"] = f"{type(exc).__name__}: {exc}"
    return env


def _git_commit(repo: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=20, check=False,
        )
        return out.stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


def cmd_make_root(args: argparse.Namespace) -> int:
    split, _ = _load(args.split_manifest)
    dataset, _ = _load(args.dataset_manifest)
    dirs = _case_dirs(dataset)
    ids = split["training_subsets"]["100_percent"]["effective_case_ids"]

    root = args.out_root
    root.mkdir(parents=True, exist_ok=True)
    made, skipped, failed = [], [], []
    for cid in sorted(ids):
        rel = dirs.get(cid)
        if rel is None:
            failed.append({"case_id": cid, "reason": "absent from dataset manifest"})
            continue
        src = (args.package_root / rel).resolve()
        if not src.is_dir():
            failed.append({"case_id": cid, "reason": f"source dir missing: {src}"})
            continue
        dst = root / cid
        if dst.exists():
            skipped.append(cid)
            continue
        try:
            os.symlink(src, dst, target_is_directory=True)
            made.append(cid)
        except OSError:
            # Windows without developer mode: fall back to a directory junction.
            r = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(dst), str(src)],
                capture_output=True, text=True, check=False,
            )
            if r.returncode == 0:
                made.append(cid)
            else:
                failed.append({"case_id": cid, "reason": r.stderr.strip() or r.stdout.strip()})

    print(f"root         : {root}")
    print(f"linked       : {len(made)}")
    print(f"already there: {len(skipped)}")
    print(f"failed       : {len(failed)}")
    for f in failed[:10]:
        print(f"  FAIL {f}")
    print()
    print("This root is a set of LINKS. It copies no image bytes and modifies nothing")
    print("in the source package. Removing the root removes only the links.")
    return 1 if failed else 0


def cmd_check(args: argparse.Namespace) -> int:
    split, split_sha = _load(args.split_manifest)
    dataset, dataset_sha = _load(args.dataset_manifest)
    dirs = _case_dirs(dataset)

    checks: list[dict[str, Any]] = []

    def add(cid: str, desc: str, ok: bool, detail: Any = None) -> None:
        checks.append({"check_id": cid, "description": desc, "passed": bool(ok), "detail": detail})

    # --- gate state, never inferred -------------------------------------
    gates_closed = args.gate_split_01 == "CLOSED" and args.gate_data_01 == "CLOSED"
    add("GATE-STATE", "GATE-DATA-01 and GATE-SPLIT-01 both declared CLOSED by the operator",
        gates_closed, {"gate_data_01": args.gate_data_01, "gate_split_01": args.gate_split_01})

    # --- manifest provenance ---------------------------------------------
    declared_src = split.get("source_dataset_manifest", {}).get("sha256")
    add("DATASET-MANIFEST-HASH",
        "split manifest's declared source dataset-manifest sha256 matches the file supplied",
        declared_src == dataset_sha, {"declared": declared_src, "actual": dataset_sha})

    if args.expect_split_sha256:
        add("SPLIT-MANIFEST-HASH", "split manifest sha256 matches the pinned value",
            args.expect_split_sha256 == split_sha,
            {"expected": args.expect_split_sha256, "actual": split_sha})

    # --- structural split checks (set containment) ------------------------
    sub = verify_subsets(split)
    for c in sub.checks:
        checks.append({**c, "check_id": "SUBSET/" + c["check_id"]})

    # --- DR-002b named exclusions ----------------------------------------
    excluded = set(split["training_exclusions"]["all_excluded_case_ids"])
    eff = {k: set(split["training_subsets"][k]["effective_case_ids"])
           for k in ("25_percent", "50_percent", "100_percent")}
    add("EXCLUSIONS-NAMED",
        "CASE_0133 (direct link) and CASE_0117 (group-propagated) are in the exclusion set",
        {"CASE_0133", "CASE_0117"} <= excluded, {"exclusion_set": sorted(excluded)})
    add("EXCLUSIONS-ABSENT",
        "no excluded case appears in any effective training subset",
        not any(excluded & s for s in eff.values()),
        {k: sorted(excluded & v) for k, v in eff.items()})

    # --- DATA ROOT CONTAINMENT: the point of this script -------------------
    root: Path = args.data_root.resolve()
    add("ROOT-EXISTS", "the declared training-only data root exists", root.is_dir(), {"root": str(root)})

    validation_ids = split["partitions"]["validation"]["case_ids"]
    holdout_ids = split["partitions"]["final_holdout"]["case_ids"]

    def resolve_attempts(case_ids: list[str]) -> list[dict[str, Any]]:
        """Try every plausible layout for a case beneath the root. No file is opened."""
        hits = []
        for cid in case_ids:
            rel = dirs.get(cid)
            candidates = [root / cid]
            if rel:
                candidates += [root / rel, root / Path(rel).name]
            for cand in candidates:
                try:
                    if cand.exists():
                        hits.append({"case_id": cid, "resolved_path": str(cand)})
                        break
                except OSError:
                    continue
        return hits

    val_hits = resolve_attempts(validation_ids)
    hold_hits = resolve_attempts(holdout_ids)
    add("VALIDATION-UNREACHABLE",
        "no validation case directory resolves beneath the data root",
        not val_hits, {"validation_paths_resolved": len(val_hits), "hits": val_hits[:10]})
    add("HOLDOUT-UNREACHABLE",
        "no holdout case directory resolves beneath the data root",
        not hold_hits,
        {"holdout_case_count": 0 if not hold_hits else len(hold_hits),
         "holdout_paths_resolved": len(hold_hits), "hits": hold_hits[:10]})

    train_ids = split["training_subsets"]["100_percent"]["effective_case_ids"]
    train_hits = resolve_attempts(list(train_ids))
    add("TRAINING-REACHABLE",
        "every effective training case resolves beneath the data root",
        len(train_hits) == len(train_ids),
        {"expected": len(train_ids), "resolved": len(train_hits),
         "unresolved": sorted(set(train_ids) - {h['case_id'] for h in train_hits})[:10]})

    # A root that contains anything beyond the allowlist is refused outright.
    try:
        entries = {p.name for p in root.iterdir()}
    except OSError:
        entries = set()
    extra = entries - set(train_ids)
    add("ROOT-IS-ALLOWLIST-ONLY",
        "the data root contains the effective training cases and nothing else",
        not extra, {"unexpected_entries": sorted(extra)[:20], "entry_count": len(entries)})

    all_ok = all(c["passed"] for c in checks)
    runnable = all_ok and gates_closed

    payload = {
        "label": args.label,
        "is_spike_c1_evidence": runnable and not args.allow_open_gates,
        "generated_by": "spikes/spike_c_ml/c1/preflight.py",
        "captured_at": datetime.now(timezone.utc).astimezone().isoformat(),
        "operator": args.operator,
        "gate_state_declared": {"GATE-DATA-01": args.gate_data_01, "GATE-SPLIT-01": args.gate_split_01},
        "split_manifest": {"path": str(args.split_manifest), "sha256": split_sha,
                           "split_id": split.get("split_id"), "generated_at": split.get("generated_at")},
        "dataset_manifest": {"path": str(args.dataset_manifest), "sha256": dataset_sha},
        "data_root": str(root),
        "repo_commit": _git_commit(args.repo) if args.repo else None,
        "environment": _environment(),
        "selected_case_ids": sorted(train_ids),
        "selected_case_ids_pointer": "$.training_subsets.100_percent.effective_case_ids",
        "holdout_case_count": len(hold_hits),
        "holdout_paths_resolved": len(hold_hits),
        "validation_paths_resolved": len(val_hits),
        "checks": checks,
        "all_checks_passed": all_ok,
        "runnable": runnable,
    }

    print(f"label          : {args.label}")
    print(f"data root      : {root}")
    print(f"split sha256   : {split_sha}")
    print(f"gates declared : DATA-01={args.gate_data_01}  SPLIT-01={args.gate_split_01}")
    print("-" * 78)
    for c in checks:
        print(f"[{'PASS' if c['passed'] else 'FAIL'}] {c['check_id']:<34} {c['description']}")
        if not c["passed"]:
            print(f"       detail: {json.dumps(c['detail'], ensure_ascii=False)[:400]}")
    print("-" * 78)
    print(f"validation_paths_resolved : {len(val_hits)}")
    print(f"holdout_paths_resolved    : {len(hold_hits)}")
    print(f"ALL CHECKS PASSED         : {all_ok}")
    print(f"RUNNABLE AS SPIKE C1      : {runnable}")
    if not gates_closed:
        print("REFUSED as C1 evidence: a gate is not CLOSED. Any output is a DRY RUN only.")

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"json evidence  : {args.json_out}")

    if not all_ok:
        return 1
    if not gates_closed and not args.allow_open_gates:
        return 2
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sp = ap.add_subparsers(dest="cmd", required=True)

    mk = sp.add_parser("make-root", help="build an allowlisted training-only root of directory links")
    mk.add_argument("--split-manifest", required=True, type=Path)
    mk.add_argument("--dataset-manifest", required=True, type=Path)
    mk.add_argument("--package-root", required=True, type=Path,
                    help="directory containing the released 'Training Set' / 'Testing Set' folders")
    mk.add_argument("--out-root", required=True, type=Path)
    mk.set_defaults(func=cmd_make_root)

    ck = sp.add_parser("check", help="run the fail-closed preflight")
    ck.add_argument("--split-manifest", required=True, type=Path)
    ck.add_argument("--dataset-manifest", required=True, type=Path)
    ck.add_argument("--data-root", required=True, type=Path)
    ck.add_argument("--gate-data-01", required=True, choices=["OPEN", "CLOSED"])
    ck.add_argument("--gate-split-01", required=True, choices=["OPEN", "CLOSED"])
    ck.add_argument("--expect-split-sha256")
    ck.add_argument("--operator", default="UNDECLARED")
    ck.add_argument("--repo", type=Path)
    ck.add_argument("--label", default="UNLABELLED")
    ck.add_argument("--allow-open-gates", action="store_true",
                    help="permit a labelled DRY RUN while a gate is still OPEN; never C1 evidence")
    ck.add_argument("--json-out", type=Path)
    ck.set_defaults(func=cmd_check)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
