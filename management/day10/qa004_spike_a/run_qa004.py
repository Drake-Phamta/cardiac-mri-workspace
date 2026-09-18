#!/usr/bin/env python3
"""
QA-004 — the re-run suite for Spike A, step 3 of `acceptance_workflow`.

Run this on `main`, in a clean worktree, AFTER #31 and #41 are merged and
after the S8 device session. It produces the table that
`management/day10/QA_REVIEW_004_SPIKE_A.md` is written from. It does not
produce the verdict: a person writes that, and the workflow requires it to be
a different person from the spike owner where possible.

WHAT THIS DOES THAT READING RESULT.md DOES NOT.

  1. It re-runs the four offline checks itself, on the tree it is pointed at,
     rather than believing a recorded "ok".
  2. It builds the A1-A12 table from the RAW EVIDENCE FILES in
     spikes/spike_a_2d/EVIDENCE_RAW/, not from README.md or RESULT.md. A
     criterion with no evidence file is NOT MEASURED, whatever the prose says.
  3. It REJECTS evidence recorded on a debug build, or whose build_type is
     still the placeholder the extractor writes. That is the one provenance
     failure which invalidates the number itself: a timing on a debug build
     is not acceptance evidence, and a QA pass that counted a placeholder
     would be certifying an unfilled form.
  4. It refuses an A8 record with no COLD reload, for the reason
     extract_a8.py gives: a warm round trip proves the codec, not persistence.
  5. It derives A9 from the recorded p95 against the frozen 200 ms of
     NFR-PERF-001, rather than from any prose. A9's extractor writes no
     verdict field, and reading one off RESULT.md would be reading the
     conclusion under review.

A missing `operator` or `device_profile` is reported as a CAVEAT, not a
rejection. It is a real bookkeeping gap and the QA note must carry it, but it
does not make the measurement wrong, and auto-failing an otherwise sound
`release` measurement over a missing name would be the checker inventing a
requirement nothing froze.

EVIDENCE SCHEMA. The extractors in spikes/spike_a_2d/harness/ write
`verdict_from_raw_log` + `verdict_reason`, a per-criterion `criteria` map
where one file covers several criteria, and `device_profile`. This script
reads those names, and falls back to `verdict` / `device` so a newer
extractor written to either convention still parses.

Usage, from the repository root:

    python management/day10/qa004_spike_a/run_qa004.py
    python management/day10/qa004_spike_a/run_qa004.py --json out.json
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

SPIKE = os.path.join("spikes", "spike_a_2d")
EVIDENCE = os.path.join(SPIKE, "EVIDENCE_RAW")

NOT_MEASURED = "NOT MEASURED"
OBSERVED = "OBSERVED"
FAIL = "FAIL"
REJECTED = "REJECTED"

PLACEHOLDER = re.compile(r"FILL IN BY HAND|\[RECORD", re.IGNORECASE)

# criterion -> (evidence filename glob, what the criterion claims)
CRITERIA = [
    ("A1",  None,                  "slice renders correctly, shows n / total"),
    ("A2",  "a2_zoom_pan_*.json",  "zoom/pan never change the source mask checksum"),
    ("A3",  "a3_a7_brush_*.json",  "brush adds to the working mask"),
    ("A4",  "a3_a7_brush_*.json",  "brush erases from the working mask"),
    ("A5",  "a3_a7_brush_*.json",  "touch maps to the same source pixel after zoom/pan"),
    ("A6",  "a3_a7_brush_*.json",  "undo"),
    ("A7",  "a3_a7_brush_*.json",  "redo"),
    ("A8",  "a8_save_reload_*.json", "save and reload return the same mask"),
    ("A9",  "a9_slice_switch_*.json", "cached slice switch, p95 <= 200 ms (NFR-PERF-001)"),
    # A10/A11 live in their own file: extract_brush.py collects their raw
    # strokes but refuses to conclude them, and extract_a10_a11.py is the
    # script that does.
    ("A10", "a10_a11_brush_feedback_*.json", "brush feedback <= 100 ms, zero committed samples lost"),
    ("A11", "a10_a11_brush_feedback_*.json", "one finger paints, two fingers never do"),
    ("A12", None,                  "development cost - hours from the work log, not a measurement"),
]

OFFLINE = [
    ("F1-F5", [sys.executable, os.path.join(SPIKE, "harness", "check_conformance.py")]),
    ("F4",    ["node", os.path.join(SPIKE, "harness", "test_viewer_math.mjs")]),
    ("F5",    ["node", os.path.join(SPIKE, "harness", "test_brush.mjs")]),
    ("F6",    ["node", os.path.join(SPIKE, "harness", "test_persist.mjs")]),
]


def run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=600)
    except FileNotFoundError as exc:
        return {"ok": False, "exit": None, "tail": f"not found: {exc}"}
    # Node prints a MODULE_TYPELESS_PACKAGE_JSON warning to stderr for the
    # spike's .js modules; showing that as the result line hides the result.
    lines = [ln for ln in (p.stdout + p.stderr).strip().splitlines()
             if ln.strip() and "Warning:" not in ln and not ln.startswith("(Use `node")
             and "Reparsing as ES module" not in ln and not ln.startswith("To eliminate this warning")]
    return {"ok": p.returncode == 0, "exit": p.returncode, "tail": "\n".join(lines[-3:])}


def newest(pattern):
    files = sorted(glob.glob(os.path.join(EVIDENCE, pattern)))
    return files[-1] if files else None


def rejects(record):
    """Why this file's NUMBERS may not be counted at all, or None."""
    build = str(record.get("build_type", ""))
    if not build.strip() or PLACEHOLDER.search(build):
        return "build_type was never filled in"
    if "release" not in build.lower():
        return "not a release build - a timing on debug is not acceptance evidence"
    return None


def caveats(record):
    """Provenance gaps worth writing down that do not invalidate the number."""
    out = []
    for field, alts in (("operator", ()), ("device_profile", ("device",))):
        value = record.get(field)
        for alt in alts:
            if not value:
                value = record.get(alt)
        value = str(value or "")
        if not value.strip() or PLACEHOLDER.search(value):
            out.append(f"{field} not recorded")
    return out


def verdict_of(record, cid):
    """
    The extractor's verdict FOR THIS CRITERION.

    A file that carries a per-criterion `criteria` map covers several
    criteria, and one absent from that map is NOT covered - however
    confident the file-level verdict looks. This is not hypothetical: the
    A3-A7 evidence file says OBSERVED at the top and lists A3, A4, A5, A6, A7
    in its map, while extract_brush.py states in as many words that it does
    NOT conclude A10 or A11 - it only keeps their raw strokes. Inheriting the
    file-level verdict marked A10 and A11 OBSERVED off a file whose own
    author refused to, which is the exact failure this suite exists to catch.

    The file-level verdict is only used when there is no map at all.
    """
    per = record.get("criteria")
    if isinstance(per, dict):
        if cid in per:
            return str(per[cid]).upper()
        return "NOT_COVERED"
    for key in ("verdict_from_raw_log", "verdict"):
        if key in record:
            return str(record[key]).upper()
    return ""


def a9_from_p95(record):
    """
    A9 has no verdict field: its extractor reports a distribution and stops.
    NFR-PERF-001 freezes p95 <= 200 ms for switching among ALREADY CACHED
    slices, so the comparison is a reading, not a judgement.
    """
    summary = record.get("summary_ms_to_frame") or {}
    p95 = summary.get("p95")
    if p95 is None:
        return NOT_MEASURED, "no summary_ms_to_frame.p95 in the record"
    n = summary.get("n", "?")
    if p95 <= 200:
        return OBSERVED, f"p95 {p95} ms over n = {n} steps, within the 200 ms of NFR-PERF-001"
    return FAIL, f"p95 {p95} ms over n = {n} steps, above the 200 ms of NFR-PERF-001"


def a8_extra(record):
    """A8 has one more refusal than the others: no cold reload, no verdict."""
    detail = record.get("detail") or {}
    if detail.get("reloads_cold", 0) < 1:
        return "no COLD reload - a warm round trip proves the codec, not persistence"
    if detail.get("cold_matched_to_a_save", 0) < 1:
        return "the cold reload does not match any save in the same log"
    if detail.get("saves_with_edits", 0) < 1:
        return "every save was of an unedited mask"
    return None


def assess(cid, pattern):
    if pattern is None:
        return {"criterion": cid, "status": NOT_MEASURED, "why": "no machine evidence by design",
                "file": None}
    path = newest(pattern)
    if path is None:
        return {"criterion": cid, "status": NOT_MEASURED, "why": f"no {pattern} in EVIDENCE_RAW/",
                "file": None}
    try:
        with open(path, encoding="utf-8") as f:
            record = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return {"criterion": cid, "status": FAIL, "why": f"{os.path.basename(path)} unreadable: {exc}",
                "file": path}

    row = {"criterion": cid, "file": os.path.relpath(path),
           "label": record.get("label", ""), "operator": record.get("operator", ""),
           "build_type": record.get("build_type", ""),
           "device_profile": record.get("device_profile", record.get("device", "")),
           "caveats": caveats(record)}

    reason = rejects(record)
    if reason:
        row.update(status=REJECTED, why=reason)
        return row

    if cid == "A9":
        status, why = a9_from_p95(record)
        row.update(status=status, why=why)
        return row

    if cid == "A8":
        reason = a8_extra(record)
        if reason:
            row.update(status=REJECTED, why=reason)
            return row

    verdict = verdict_of(record, cid)
    # A file covering several criteria may carry a per-criterion reason
    # (record["a10"]["why"]). Prefer it: the file-level verdict_reason
    # concatenates them, and quoting A10's sentence next to A11's status is
    # how a QA note ends up asserting the wrong thing.
    block = record.get(cid.lower())
    why = (block.get("why") if isinstance(block, dict) else None) \
        or record.get("verdict_reason") or record.get("why") or ""
    if verdict == "NOT_COVERED":
        row.update(status=NOT_MEASURED,
                   why=(f"{os.path.basename(path)} holds this criterion's raw data but its "
                        f"extractor does not conclude {cid} - its criteria map covers "
                        f"{', '.join(sorted(record['criteria']))}"))
    elif verdict == "FAIL":
        row.update(status=FAIL, why=why or "the extractor reported FAIL")
    elif verdict == OBSERVED:
        row.update(status=OBSERVED, why=why)
    else:
        row.update(status=NOT_MEASURED,
                   why=why or f"extractor verdict {verdict or 'absent'} for {cid}")
    return row


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="also write the whole result here")
    ap.add_argument("--skip-offline", action="store_true", help="table only, no re-run")
    args = ap.parse_args()

    if not os.path.isdir(SPIKE):
        sys.exit(f"run this from the repository root; {SPIKE} not found")

    head = run(["git", "rev-parse", "HEAD"])
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    dirty = run(["git", "status", "--porcelain"])
    print(f"  tree              {branch['tail']} at {head['tail']}"
          f"{'  ** WORKTREE NOT CLEAN **' if dirty['tail'] else '  (clean)'}")

    offline = {}
    if not args.skip_offline:
        print("\n  offline re-run")
        for name, cmd in OFFLINE:
            offline[name] = run(cmd)
            mark = "ok  " if offline[name]["ok"] else "FAIL"
            print(f"    {mark} {name:6s} {offline[name]['tail'].splitlines()[-1] if offline[name]['tail'] else ''}")

    print("\n  criteria, from the raw evidence files only")
    rows = [assess(cid, pattern) for cid, pattern, _ in CRITERIA]
    for row, (_, _, what) in zip(rows, CRITERIA):
        print(f"    {row['status']:12s} {row['criterion']:4s} {what}")
        if row.get("why"):
            print(f"                      {row['why'][:110]}")
        if row.get("file"):
            print(f"                      {row['file']}")
        for c in row.get("caveats", []):
            print(f"                      caveat: {c}")

    counts = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    offline_ok = all(r["ok"] for r in offline.values()) if offline else None
    all_caveats = sorted({c for row in rows for c in row.get("caveats", [])})

    print(f"\n  summary           " + "  ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if all_caveats:
        print(f"  caveats           {'; '.join(all_caveats)} - carry these into the QA note")
    print(f"  offline           {'all pass' if offline_ok else ('NOT RUN' if offline_ok is None else 'A CHECK FAILED')}")
    print("\n  This script does NOT issue the verdict. It produces the table; a person")
    print("  writes management/day10/QA_REVIEW_004_SPIKE_A.md from it, and the owner of")
    print("  the spike is not the person who signs it.")

    result = {
        "suite": "QA-004",
        "spike": "SPIKE_A_2D",
        "ran_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "head": head["tail"], "branch": branch["tail"], "worktree_clean": not dirty["tail"],
        "offline": offline, "criteria": rows, "counts": counts, "caveats": all_caveats,
    }
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"  written           {args.json}")

    # Exit non-zero on anything that would block an ACCEPTED, so this cannot be
    # skimmed: a FAIL criterion, a rejected evidence file, or a failing re-run.
    blocking = counts.get(FAIL, 0) + counts.get(REJECTED, 0)
    if offline and not offline_ok:
        blocking += 1
    return 1 if blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
