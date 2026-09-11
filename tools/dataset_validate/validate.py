#!/usr/bin/env python3
"""
Spike D dataset validator — command-line entry point.

Runs the `06` section 9 checks against an extracted LASC 2018 package, emits the
machine-readable manifest required by `06` section 9.1 / criterion A20, and can
render management/DATASET_AUDIT.md from that manifest.

    # prove the tool works, without the real package
    python validate.py --selftest

    # inspect a package, print the criteria table, write nothing
    python validate.py --root "C:/cardiac-data/lasc2018/2018_UTAH_MICCAI"

    # produce the acceptance artifacts
    python validate.py --root <dir> --acquisition acquisition.json \
                       --write-manifest --write-audit

Exit codes:  0 no FAIL  ·  1 at least one FAIL  ·  2 the run could not proceed.

WHO RUNS THIS
    Spike D's Primary Owner is Bế Quốc Khánh, and SPIKE_D_DATASET/TASK.md line
    196 reads: "All of the above must be read from the actual downloaded package
    by Bế Quốc Khánh." This script is the harness, which the same file's line 198
    explicitly permits Claude to write. Running it and signing the result is the
    owner's work. The script records who ran it, and does not fill that in for
    anyone.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import checks                                    # noqa: E402
from audit_report import render                  # noqa: E402
from dataset_scan import scan_package            # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DEFAULT_MANIFEST = os.path.join(REPO_ROOT, "data", "manifests", "dataset_manifest.json")
DEFAULT_AUDIT = os.path.join(REPO_ROOT, "management", "DATASET_AUDIT.md")

MARK = {
    checks.PASS: "ok  ",
    checks.FAIL: "FAIL",
    checks.NOT_RUN: "--  ",
    checks.OWNER: "own ",
}


def print_table(results: list[checks.Result], summary: dict) -> None:
    width = max(len(r.title) for r in results)
    print()
    for r in results:
        print(f"  {MARK[r.status]} {r.cid:3s} {r.title:{width}s}  {r.detail}")
    print()
    print(f"  {summary['pass']} pass · {summary['fail']} fail · "
          f"{summary['not_run']} not run · {summary['owner_verdict_required']} owner verdict")
    if summary["owner_verdict_required"]:
        print("  Criteria marked 'own' need the owner's written verdict. A script cannot")
        print("  decide what an annotation means or which split path to take.")
    if summary["not_run"]:
        print("  Criteria marked '--' were NOT checked. They are not passing.")
    print()


def selftest() -> int:
    """Exercise the whole pipeline on synthetic NRRDs.

    This proves the harness works before it is handed to the owner, and it uses
    fabricated volumes on purpose — so nothing it produces could ever be mistaken
    for dataset evidence. The synthetic package deliberately contains one
    unlabelled partition and one oblique volume, because a checker that has only
    ever seen clean input has not been tested.
    """
    try:
        import numpy as np
        import nrrd
    except ImportError as exc:
        print(f"selftest needs numpy and pynrrd: {exc}")
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        root = os.path.join(tmp, "SYNTHETIC_PACKAGE")

        def write_case(partition, name, shape, with_mask=True, oblique=False):
            d = os.path.join(root, partition, name)
            os.makedirs(d, exist_ok=True)
            nx, ny, nz = shape
            mri = (np.arange(nx * ny * nz, dtype=np.int16) % 1000).reshape(shape)
            directions = np.diag([0.625, 0.625, 1.25]).tolist()
            if oblique:
                directions[0][1] = 0.1          # a real off-diagonal term
            header = {
                "space": "left-posterior-superior",
                "space directions": directions,
                "space origin": [0.0, 0.0, 0.0],
            }
            nrrd.write(os.path.join(d, "lgemri.nrrd"), mri, header)
            if with_mask:
                mask = np.zeros(shape, dtype=np.uint8)
                mask[nx // 4: nx // 2, ny // 4: ny // 2, nz // 4: nz // 2] = 1
                nrrd.write(os.path.join(d, "laendo.nrrd"), mask, header)

        write_case("Training Set", "case-aaa", (32, 32, 8))
        write_case("Training Set", "case-bbb", (32, 32, 8))
        write_case("Training Set", "case-ccc", (40, 40, 8))      # makes in-plane dims vary
        write_case("Testing Set", "case-ddd", (32, 32, 8), with_mask=False)
        write_case("Testing Set", "case-eee", (32, 32, 8), with_mask=False, oblique=True)

        manifest = scan_package(root, want_checksums=True, acquisition={
            "source_url": "SYNTHETIC — selftest, no download occurred",
            "documented_source": "SYNTHETIC",
            "download_started": "SYNTHETIC",
            "download_finished": "SYNTHETIC",
            "acquired_by": "SYNTHETIC — selftest",
            "package_files": [{"name": "synthetic", "size_bytes": 0, "sha256": "0" * 64}],
            "attribution_note": "SELFTEST OUTPUT — fabricated volumes. Never dataset evidence.",
        })
        results = checks.run_checks(manifest)
        summary = checks.summarise(results)
        print_table(results, summary)

        by_id = {r.cid: r for r in results}
        expected = {
            "A2": checks.PASS,     # two partitions discovered
            "A3": checks.PASS,     # every case has an MRI
            "A4": checks.PASS,     # everything loads and is 3D
            "A6": checks.PASS,     # shape distribution computed
            "A10": checks.PASS,    # mask value sets recorded
            "A14": checks.FAIL,    # the oblique volume MUST be caught
            "A11": checks.OWNER,   # never answered by the script
            "A13": checks.OWNER,
            "A18": checks.OWNER,
        }
        problems = []
        for cid, want in expected.items():
            got = by_id[cid].status
            if got != want:
                problems.append(f"{cid}: expected {want}, got {got}")

        dist = manifest["shape_distribution"]
        if dist["in_plane_dimensions_vary"] is not True:
            problems.append("A6 should have detected varying in-plane dimensions")
        parts = manifest["partitions"]
        if parts["Testing Set"]["cases_with_mask"] != 0:
            problems.append("the unlabelled partition should show zero masks")
        if parts["Training Set"]["case_count"] != 3:
            problems.append("expected 3 training cases")

        # The renderer must survive a manifest with missing and failing fields.
        text = render(manifest, results, summary)
        for needed in ("Acquisition", "Cohort shape distribution", "OWNER VERDICT REQUIRED",
                       "Axis alignment", "A20"):
            if needed not in text:
                problems.append(f"rendered audit is missing the section containing '{needed}'")

        print("  --- selftest assertions ---")
        if problems:
            for p in problems:
                print(f"  FAIL  {p}")
            print(f"\n  SELFTEST FAILED: {len(problems)} problem(s)\n")
            return 1
        print("  ok    oblique volume caught by A14")
        print("  ok    varying in-plane dimensions caught by A6")
        print("  ok    unlabelled partition reported, not treated as an error")
        print("  ok    A11 / A13 / A18 left to the owner, never auto-passed")
        print("  ok    audit renders from a manifest containing failures")
        print()
        print("  SELFTEST PASSED - the harness works. It has measured nothing real.")
        print("  Exit code 0 means the SELFTEST passed. The A14 FAIL printed above is the")
        print("  expected result on a deliberately planted oblique volume, not a run failure -")
        print("  the documented 0/1 exit contract applies to --root runs, not to --selftest.")
        print()
        return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", help="directory holding the extracted package")
    ap.add_argument("--acquisition", help="JSON file with the real acquisition record (A1)")
    ap.add_argument("--no-checksums", action="store_true",
                    help="skip per-file SHA-256 (faster; A1 then reports the gap)")
    ap.add_argument("--write-manifest", action="store_true",
                    help=f"write {os.path.relpath(DEFAULT_MANIFEST, REPO_ROOT)}")
    ap.add_argument("--write-audit", action="store_true",
                    help=f"write {os.path.relpath(DEFAULT_AUDIT, REPO_ROOT)}")
    ap.add_argument("--manifest-out", default=DEFAULT_MANIFEST)
    ap.add_argument("--audit-out", default=DEFAULT_AUDIT)
    ap.add_argument("--selftest", action="store_true",
                    help="run the pipeline on synthetic volumes and verify its behaviour")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not args.root:
        ap.error("--root is required (or use --selftest)")
    if not os.path.isdir(args.root):
        print(f"not a directory: {args.root}")
        return 2

    acquisition = None
    if args.acquisition:
        with open(args.acquisition, encoding="utf-8") as f:
            acquisition = json.load(f)

    manifest = scan_package(args.root, want_checksums=not args.no_checksums,
                            acquisition=acquisition)
    if manifest["case_count_total"] == 0:
        print(f"\n  No directory under {args.root} contains lgemri.nrrd.")
        print("  Nothing is written. An empty manifest is not a finding of zero cases —")
        print("  it means the package layout differs from what this scanner expects.")
        print("  Check the extraction path before recording anything.\n")
        return 2

    results = checks.run_checks(manifest)
    summary = checks.summarise(results)
    print_table(results, summary)

    if args.write_manifest:
        os.makedirs(os.path.dirname(args.manifest_out), exist_ok=True)
        payload = dict(manifest)
        payload["criteria_results"] = [r.as_dict() for r in results]
        payload["summary"] = summary
        with open(args.manifest_out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, indent=1, ensure_ascii=False, sort_keys=False)
            f.write("\n")
        print(f"  manifest  -> {os.path.relpath(args.manifest_out, REPO_ROOT)}")

    if args.write_audit:
        os.makedirs(os.path.dirname(args.audit_out), exist_ok=True)
        with open(args.audit_out, "w", encoding="utf-8", newline="\n") as f:
            f.write(render(manifest, results, summary))
        print(f"  audit     -> {os.path.relpath(args.audit_out, REPO_ROOT)}")

    if args.write_manifest or args.write_audit:
        print()
        print("  These files are evidence artifacts. Commit them under the account of the")
        print("  person who ran this command, and record that name in the acquisition JSON.")
        print()

    return 1 if summary["fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
