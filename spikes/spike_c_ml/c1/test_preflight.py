#!/usr/bin/env python3
"""Self-test for preflight.py and verify_subsets.py. Reads NO dataset bytes.

Setup
-----
* The REAL committed manifests, taken as git BLOB bytes (``git cat-file blob HEAD:<path>``)
  so the pin is tested against exactly what is committed; without git, the working-tree
  file is used and the source is printed.
* A SYNTHETIC package in a temp dir: a placeholder of a few bytes at every path the
  dataset manifest declares (MRI, mask and companion volumes of all 154 cases).

Every root below is built inside that temp dir; no link ever points outside it.

Usage
-----
    python spikes/spike_c_ml/c1/test_preflight.py [--keep]

Prints one line per assertion and a summary; exit 0 only when every assertion holds.
"""

from __future__ import annotations

import argparse
import contextlib
import copy
import hashlib
import io
import json
import os
import string
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
import preflight  # noqa: E402
from verify_subsets import verify  # noqa: E402

SPLIT_REL = "data/manifests/split_manifest_path_a_seed2024.json"
DATASET_REL = "data/manifests/dataset_manifest.json"
GOOD_PIN = "c5c65a0913b03945a39438302d64ad027faaa6c5a8057953f28375c42b37396d"   # the committed blob
BAD_PIN = "ff1517d00b8da4808e87bf6ab1325148fa3543031c0b5453d2dda11e0bbe3ce0"    # CRLF+BOM redirected copy

RESULTS: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: Any = "") -> bool:
    RESULTS.append((name, bool(ok), str(detail)))
    line = f"[{'PASS' if ok else 'FAIL'}] {name}"
    if not ok and detail:
        line += f"\n         detail: {str(detail)[:600]}"
    print(line)
    return bool(ok)


def committed_bytes(rel: str) -> tuple[bytes, str]:
    try:
        r = subprocess.run(["git", "-C", str(REPO), "cat-file", "blob", f"HEAD:{rel}"],
                           capture_output=True, check=False)
        if r.returncode == 0:
            return r.stdout, f"git blob HEAD:{rel}"
    except OSError:
        pass
    return (REPO / rel).read_bytes(), f"working tree {rel} (git unavailable)"


class Env:
    def __init__(self, tmp: Path) -> None:
        self.tmp = tmp
        split_bytes, self.split_src = committed_bytes(SPLIT_REL)
        dataset_bytes, self.dataset_src = committed_bytes(DATASET_REL)
        self.split_bytes = split_bytes
        self.split_path = tmp / "split_manifest.json"
        self.split_path.write_bytes(split_bytes)
        self.dataset_path = tmp / "dataset_manifest.json"
        self.dataset_path.write_bytes(dataset_bytes)
        self.split = json.loads(split_bytes.decode("utf-8"))
        self.dataset = json.loads(dataset_bytes.decode("utf-8"))
        self.by_id = {c["case_id"]: c for c in self.dataset["cases"]}
        self.train = list(self.split["training_subsets"]["100_percent"]["effective_case_ids"])
        self.validation = list(self.split["partitions"]["validation"]["case_ids"])
        self.holdout = list(self.split["partitions"]["final_holdout"]["case_ids"])
        self.pkg = tmp / "pkg" / "extracted"
        n = 0
        for c in self.dataset["cases"]:
            for p in preflight._case_file_paths(c, self.pkg):
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(f"SYNTHETIC PLACEHOLDER {c['case_id']} {p.name}\n".encode("ascii"))
                n += 1
        self.placeholder_count = n
        self._n = 0

    def path(self, name: str) -> Path:
        return self.tmp / name

    def make_root(self, out: Path, layout: str, package_root: Path | None = None) -> tuple[int, str]:
        argv = ["make-root", "--split-manifest", str(self.split_path),
                "--dataset-manifest", str(self.dataset_path),
                "--package-root", str(package_root or self.pkg), "--out-root", str(out), "--layout", layout]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = preflight.main(argv)
        return code, buf.getvalue()

    def check(self, data_root: Path, *, package_root: Path | None = None, split_path: Path | None = None,
              gates: tuple[str, str] = ("CLOSED", "CLOSED"), pin: str | None = GOOD_PIN,
              allow_open: bool = False) -> tuple[int, dict[str, Any], str]:
        self._n += 1
        out = self.tmp / "json" / f"check_{self._n:02d}.json"
        argv = ["check", "--split-manifest", str(split_path or self.split_path),
                "--dataset-manifest", str(self.dataset_path),
                "--data-root", str(data_root), "--package-root", str(package_root or self.pkg),
                "--gate-data-01", gates[0], "--gate-split-01", gates[1],
                "--operator", "test_preflight.py", "--label", "SELFTEST/SYNTHETIC", "--json-out", str(out)]
        if pin:
            argv += ["--expect-split-sha256", pin]
        if allow_open:
            argv.append("--allow-open-gates")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = preflight.main(argv)
        return code, json.loads(out.read_text(encoding="utf-8")), buf.getvalue()

    # --- hand-built roots for the attacks: built from scratch, never by editing a good root ---
    def junction_root(self, name: str, override: dict[str, Path] | None = None) -> Path:
        root = self.path(name)
        root.mkdir()
        override = override or {}
        for cid in self.train:
            target = override.get(cid, self.pkg / self.by_id[cid]["source_dir_relative"])
            err = preflight._make_dir_link(target, root / cid)
            if err:
                raise RuntimeError(f"cannot create a directory link: {err}")
        return root

    def hardlink_root(self, name: str, *, skip: set[str] | None = None,
                      replace: dict[tuple[str, str], Path] | None = None,
                      extra: dict[tuple[str, str], Path] | None = None) -> Path:
        root = self.path(name)
        root.mkdir()
        replace, extra = replace or {}, extra or {}
        for cid in self.train:
            if skip and cid in skip:
                continue
            d = root / cid
            d.mkdir()
            c = self.by_id[cid]
            for key in ("mri", "mask"):
                rel = c[key]["path_relative"]
                fname = preflight._basename(rel)
                os.link(replace.get((cid, fname), self.pkg / rel), d / fname)
        for (cid, fname), src in extra.items():
            os.link(src, root / cid / fname)
        return root


def failed_ids(payload: dict[str, Any]) -> set[str]:
    return {c["check_id"] for c in payload["checks"] if not c["passed"]}


def expect_refused(env: Env, name: str, root: Path, must_fail: set[str], **kw: Any) -> dict[str, Any]:
    code, p, out = env.check(root, **kw)
    bad = failed_ids(p)
    record(f"{name}: refused (exit 1, runnable=false, is_spike_c1_evidence=false)",
           code == 1 and not p["runnable"] and not p["is_spike_c1_evidence"],
           {"exit": code, "runnable": p["runnable"], "failed": sorted(bad)})
    record(f"{name}: fails {sorted(must_fail)}", must_fail <= bad, {"failed": sorted(bad)})
    return p


def other_volume_than(p: Path) -> Path | None:
    if os.name != "nt":
        return None
    dev = os.stat(p).st_dev
    for letter in string.ascii_uppercase:
        drive = Path(f"{letter}:\\")
        try:
            if drive.exists() and os.stat(drive).st_dev != dev:
                return drive
        except OSError:
            continue
    return None


def run(tmp: Path) -> None:
    env = Env(tmp)
    print(f"temp dir        : {tmp}")
    print(f"split manifest  : {env.split_src}")
    print(f"dataset manifest: {env.dataset_src}")
    print(f"synthetic files : {env.placeholder_count} placeholders (no dataset bytes)")
    print(f"effective train : {len(env.train)}; validation {len(env.validation)}; holdout {len(env.holdout)}")
    print("-" * 78)

    # ---------- the pin (BLOCKING 2) ----------
    blob_sha = hashlib.sha256(env.split_bytes).hexdigest()
    crlf_bom = b"\xef\xbb\xbf" + env.split_bytes.replace(b"\n", b"\r\n")
    record("committed blob hashes to c5c65a09...396d", blob_sha == GOOD_PIN, blob_sha)
    record("a CRLF+BOM copy of the blob (what a PS 5.1 '>' redirect writes) hashes to ff1517d0...3ce0",
           hashlib.sha256(crlf_bom).hexdigest() == BAD_PIN, hashlib.sha256(crlf_bom).hexdigest())

    # ---------- the two good layouts ----------
    hl = env.path("root_hardlink")
    code, out = env.make_root(hl, "hardlink")
    record("make-root --layout hardlink exits 0", code == 0, out[-600:])
    shapes = {tuple(sorted(f.name for f in os.scandir(hl / cid))) for cid in env.train}
    record("hardlink root: 78 case dirs, each exactly {laendo.nrrd, lgemri.nrrd}; companions not linked",
           len(list(os.scandir(hl))) == 78 and shapes == {("laendo.nrrd", "lgemri.nrrd")}, shapes)
    sample = env.train[0]
    record("hardlink root: files are os.path.samefile with the package files",
           all(os.path.samefile(hl / sample / preflight._basename(env.by_id[sample][k]["path_relative"]),
                                env.pkg / env.by_id[sample][k]["path_relative"]) for k in ("mri", "mask")))
    code, out = env.make_root(hl, "hardlink")
    record("make-root is idempotent (re-run: exit 0, 78 already there)",
           code == 0 and "already there: 78" in out, out[-400:])
    code, p, out = env.check(hl)
    record("hardlink root + pin c5c65a09 + gates CLOSED: RUNNABLE (exit 0)",
           code == 0 and p["runnable"] and p["is_spike_c1_evidence"] and p["data_root_layout"] == "hardlink",
           {"exit": code, "failed": sorted(failed_ids(p))})
    record("hardlink root: validation_paths_resolved 0, holdout_paths_resolved 0",
           p["validation_paths_resolved"] == 0 and p["holdout_paths_resolved"] == 0 and p["holdout_case_count"] == 0)

    jn = env.path("root_junction")
    code, out = env.make_root(jn, "junction")
    record("make-root --layout junction exits 0", code == 0, out[-600:])
    code, p, out = env.check(jn)
    record("junction root + pin c5c65a09 + gates CLOSED: RUNNABLE (exit 0)",
           code == 0 and p["runnable"] and p["data_root_layout"] == "junction"
           and p["validation_paths_resolved"] == 0 and p["holdout_paths_resolved"] == 0,
           {"exit": code, "failed": sorted(failed_ids(p))})

    # ---------- the pin ----------
    code, p, out = env.check(hl, pin=BAD_PIN)
    record("pin ff1517d0 (redirected copy) FAILS SPLIT-MANIFEST-HASH and refuses (exit 1)",
           code == 1 and "SPLIT-MANIFEST-HASH" in failed_ids(p), {"exit": code, "failed": sorted(failed_ids(p))})

    # ---------- BLOCKING 1: names are not trusted ----------
    victim = "CASE_0055" if "CASE_0055" in env.train else env.train[0]
    val_dir = env.pkg / env.by_id[env.validation[0]]["source_dir_relative"]
    root = env.junction_root("attack_link_to_validation", {victim: val_dir})
    p = expect_refused(env, f"junction {victim} -> a VALIDATION case dir", root,
                       {"ENTRY-TARGETS-VERIFIED", "VALIDATION-UNREACHABLE", "TRAINING-COMPLETE"})
    record("  ... and it reports validation_paths_resolved >= 1", p["validation_paths_resolved"] >= 1,
           p["validation_paths_resolved"])

    root = env.junction_root("attack_link_to_package_root", {victim: env.pkg})
    p = expect_refused(env, f"junction {victim} -> the PACKAGE ROOT (holdout at {victim}/Testing Set/...)", root,
                       {"ENTRY-TARGETS-VERIFIED", "VALIDATION-UNREACHABLE", "HOLDOUT-UNREACHABLE"})
    record("  ... and it reports 20 validation and 54 holdout cases reachable",
           p["validation_paths_resolved"] == len(env.validation) and p["holdout_paths_resolved"] == len(env.holdout),
           (p["validation_paths_resolved"], p["holdout_paths_resolved"]))

    root = env.junction_root("attack_link_to_package_parent", {victim: env.pkg.parent})
    expect_refused(env, f"junction {victim} -> the package's PARENT directory", root,
                   {"ENTRY-TARGETS-VERIFIED", "VALIDATION-UNREACHABLE", "HOLDOUT-UNREACHABLE"})

    hold_case = env.by_id[env.holdout[0]]
    hold_mri = env.pkg / hold_case["mri"]["path_relative"]
    victim_mri = preflight._basename(env.by_id[victim]["mri"]["path_relative"])
    root = env.hardlink_root("attack_hardlink_of_holdout_file", replace={(victim, victim_mri): hold_mri})
    p = expect_refused(env, f"hardlink of a HOLDOUT mri under {victim}/{victim_mri}", root,
                       {"ENTRY-TARGETS-VERIFIED", "NO-FILE-IS-VALIDATION-OR-HOLDOUT", "HOLDOUT-UNREACHABLE"})
    record("  ... and it names the holdout case it reached",
           any(h["case_id"] == hold_case["case_id"] for h in
               next(c for c in p["checks"] if c["check_id"] == "HOLDOUT-UNREACHABLE")["detail"]["hits"]))

    comp = env.pkg / next(iter(env.by_id[victim]["companion_volumes"].values()))["path_relative"]
    root = env.hardlink_root("attack_extra_file", extra={(victim, comp.name): comp})
    expect_refused(env, f"an EXTRA file ({comp.name}) in {victim}'s case dir", root,
                   {"ENTRY-TARGETS-VERIFIED", "TRAINING-COMPLETE"})

    root = env.hardlink_root("attack_missing_case", skip={victim})
    expect_refused(env, f"a MISSING case ({victim})", root, {"TRAINING-COMPLETE"})

    p = expect_refused(env, "the NAIVE package root as the data root", env.pkg,
                       {"ROOT-NOT-PACKAGE", "ROOT-IS-ALLOWLIST-ONLY", "VALIDATION-UNREACHABLE",
                        "HOLDOUT-UNREACHABLE", "NO-FILE-IS-VALIDATION-OR-HOLDOUT"})
    record("  ... and it reports 20 validation and 54 holdout cases reachable",
           p["validation_paths_resolved"] == 20 and p["holdout_paths_resolved"] == 54,
           (p["validation_paths_resolved"], p["holdout_paths_resolved"]))

    # ---------- gates and exit codes ----------
    code, p, _ = env.check(hl, gates=("CLOSED", "OPEN"))
    record("gate OPEN without --allow-open-gates: refused (exit 1, REFUSED_GATE_OPEN)",
           code == 1 and p["verdict"] == "REFUSED_GATE_OPEN" and not p["runnable"], (code, p["verdict"]))
    code, p, _ = env.check(hl, gates=("CLOSED", "OPEN"), allow_open=True)
    record("gate OPEN with --allow-open-gates, all else clean: DRY RUN (exit 2), not C1 evidence",
           code == 2 and p["verdict"] == "DRY_RUN_GATE_OPEN" and not p["is_spike_c1_evidence"], (code, p["verdict"]))
    code, p, _ = env.check(env.pkg, gates=("CLOSED", "OPEN"), allow_open=True)
    record("gate OPEN with --allow-open-gates but another check fails: exit 1",
           code == 1 and p["verdict"] == "REFUSED", (code, p["verdict"]))

    # ---------- make-root refusals (nothing may be created) ----------
    in_repo = REPO / "c1_selftest_root_must_not_exist"
    code, out = env.make_root(in_repo, "hardlink")
    record("make-root refuses an out-root inside a git work tree, and creates nothing",
           code == 1 and "work tree" in out and not in_repo.exists(), out[-400:])
    for label, target in (("equal to", env.pkg), ("inside", env.pkg / "Training Set" / "c1_root"),
                          ("a parent of", env.pkg.parent)):
        existed = target.exists()
        code, out = env.make_root(target, "hardlink")
        record(f"make-root refuses an out-root {label} the package root",
               code == 1 and "REFUSED" in out and target.exists() == existed, out[-300:])
    other = other_volume_than(tmp)
    if other is None:
        print("[SKIP] make-root refuses another volume: no second volume on this machine")
    else:
        xvol = other / "c1_selftest_xvol_must_not_exist" / "root"
        code, out = env.make_root(xvol, "hardlink")
        record(f"make-root refuses an out-root on another volume ({other}), and creates nothing",
               code == 1 and "cannot cross volumes" in out and not xvol.parent.exists(), out[-400:])

    # ---------- BLOCKING 3: verify_subsets mutations ----------
    base = verify(env.split, env.dataset)
    record("verify_subsets on the committed manifest: every check PASSES",
           base.ok, [c["check_id"] for c in base.checks if not c["passed"]])
    record("derived exclusions == {CASE_0117, CASE_0133} (the component {0027, 0117, 0133} is out of training)",
           base.derived_exclusions == {"CASE_0117", "CASE_0133"}, sorted(base.derived_exclusions))

    m = copy.deepcopy(env.split)
    sim = m["similarity_screening"]
    new_dev, new_hold = victim, env.holdout[-1]
    sim["development_to_holdout_links"].append(
        {"development_case_id": new_dev, "holdout_case_id": new_hold,
         "score_relation": "pearson_r >= 0.75", "exact_score": "SYNTHETIC_MUTATION"})
    # keep the counts consistent so ONLY the recomputation can catch it
    sim["pair_count_above_threshold"] += 1
    sim["affected_case_ids"] = sorted(set(sim["affected_case_ids"]) | {new_dev, new_hold})
    sim["affected_case_count"] = len(sim["affected_case_ids"])
    m["sensitivity_analysis"]["suspected_holdout_case_ids"].append(new_hold)
    r = verify(m, env.dataset)
    bad = {c["check_id"] for c in r.checks if not c["passed"]}
    record(f"mutation: new link {new_dev} (still in training) -> {new_hold}: verify FAILS",
           not r.ok and {"LEAKAGE-CHAIN-CLEAN", "EXCL-DERIVED-FROM-LINKS"} <= bad, sorted(bad))

    m = copy.deepcopy(env.split)
    real = m["partitions"]["validation"]["case_ids"][0]
    m["partitions"]["validation"]["case_ids"][0] = "CASE_9999"
    r = verify(m, env.dataset)
    bad = {c["check_id"] for c in r.checks if not c["passed"]}
    record(f"mutation: invented CASE_9999 replaces {real} in the census: the count check alone still passes",
           "CENSUS-EXACTLY-ONCE" not in bad, sorted(bad))
    record("mutation: invented id: CENSUS-SET-EQUALS-DATASET FAILS", "CENSUS-SET-EQUALS-DATASET" in bad, sorted(bad))
    mutated = env.path("split_invented_id.json")
    mutated.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
    code, p, _ = env.check(hl, split_path=mutated, pin=None)
    record("mutation: invented id: preflight check refuses (SUBSET/CENSUS-SET-EQUALS-DATASET)",
           code == 1 and "SUBSET/CENSUS-SET-EQUALS-DATASET" in failed_ids(p), sorted(failed_ids(p)))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keep", action="store_true", help="keep the temp dir for inspection")
    args = ap.parse_args()
    tmp = Path(tempfile.mkdtemp(prefix="c1-preflight-selftest-"))
    try:
        run(tmp)
    except Exception as exc:  # noqa: BLE001
        record("self-test ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        if args.keep:
            print(f"kept: {tmp}")
        else:
            # Only this run's own synthetic temp dir. Directory links are removed as links
            # (shutil.rmtree does not follow junctions on Python >= 3.8).
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
    passed = sum(ok for _, ok, _ in RESULTS)
    failed = [n for n, ok, _ in RESULTS if not ok]
    print("-" * 78)
    print(f"SELF-TEST SUMMARY: {passed}/{len(RESULTS)} assertions passed, {len(failed)} failed")
    for n in failed:
        print(f"  FAILED: {n}")
    return 0 if RESULTS and not failed else 1


if __name__ == "__main__":
    sys.exit(main())
