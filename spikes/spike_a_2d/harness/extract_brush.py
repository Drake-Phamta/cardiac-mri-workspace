#!/usr/bin/env python3
"""
Recover the S5 brush record (A3-A7) from logcat.

THROWAWAY SPIKE CODE under spikes/spike_a_2d/.

The app emits, with fixed tags:

    SPIKE_A_A5          {"radius": 0, "pass": 60, "of": 60, "errors": [], "errors_total": 0,
                         "cases": [[cx, cy, pixels_painted, sha256_first12], ...]}   "kiểm A5"
    SPIKE_A_OPS_START   ops=14 records=45                                          "A3–A7 tự động"
    SPIKE_A_OPS         {"step": 1, "op": "OP-01", "slice": 8, "hash": "...", "changed": 5, "volume": "..."}
                        {"step": 29, "op": "undo-all", "hashes": [16 x sha256]}  (also redo-all, reset)
    SPIKE_A_OPS_END     records=45
    SPIKE_A_BRUSH       {"slice": 3, "mode": "add", "radius": 2, "samples_received": 41,
                         "samples_applied": 39, "samples_outside": 2, "changed": 57,
                         "committed": true, "end": "release", "feedback_ms_p50": ..., "feedback_ms_max": ...}
    SPIKE_A_BRUSH_UNDO / SPIKE_A_BRUSH_REDO / SPIKE_A_BRUSH_RESET

This script does not trust the app's own pass counts. It recomputes every
expectation from the fixtures with hashlib:

  A5   each brush case's expected painted set - {expected_source_pixel} from
       brush_cases.json at r = 0, painted_r2 from brush_ops.json at r = 2 - is
       stamped on a blank slice and hashed; the device's centre, pixel count and
       hash prefix must all agree
  OPS  brush_ops.json is replayed onto mask_synthetic.json from its stored
       changed_indices, so the hashes it stores are re-derived rather than
       believed; every device record must carry the same slice hash, count and
       volume hash as that replay at the same step

What counts as observed (a disagreement anywhere is FAIL, a gap is INCOMPLETE):
  A3  every ADD stroke record of a run matches     A4  every ERASE stroke record
  A5  one radius-0 and one radius-2 line, 60/60 cases each
  A6  every undo record and the undo-all hashes    A7  every redo record and redo-all
  and the reset record: the 16 source hashes with both history stacks empty

SPIKE_A_BRUSH lines from real strokes are kept raw, with a summary, as input for
A10/A11. No verdict on A10 or A11 is given here.

Usage:
    python extract_brush.py --label "release, ..."
    python extract_brush.py --file saved_logcat.txt [--out-dir DIR]
"""

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")
FIX = os.path.join(ROOT, "fixtures")

LINE = re.compile(r"(SPIKE_A_(?:BRUSH_UNDO|BRUSH_REDO|BRUSH_RESET|BRUSH|A5|OPS_START|OPS_END|OPS))\b"
                  r"(?:\s+(\{.*\}))?")
OBSERVED, INCOMPLETE, FAIL = "OBSERVED", "INCOMPLETE", "FAIL"


def read_logcat() -> str:
    adb = "adb"
    sdk = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk", "platform-tools", "adb.exe")
    if os.path.exists(sdk):
        adb = sdk
    try:
        out = subprocess.run([adb, "logcat", "-d", "-v", "brief"], capture_output=True,
                             text=True, errors="replace", timeout=60)
    except FileNotFoundError:
        sys.exit("adb not found. Add <SDK>/platform-tools to PATH and retry.")
    if out.returncode != 0:
        sys.exit(f"adb logcat failed:\n{out.stderr.strip()}")
    return out.stdout


def load(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return json.load(f)


def sha(data) -> str:
    return hashlib.sha256(bytes(data)).hexdigest()


def replay_ops(ops_fx, mask):
    """Expected device records, in step order, re-derived from the fixtures."""
    problems = []
    source = [base64.b64decode(b) for b in mask["slices_b64"]]
    if [sha(s) for s in source] != mask["slice_sha256"]:
        problems.append("mask_synthetic.json bytes do not match its own slice_sha256")
    if ops_fx["source_slice_sha256"] != mask["slice_sha256"]:
        problems.append("brush_ops.json does not start from mask_synthetic.json")
    work = [bytearray(s) for s in source]

    def volume():
        return sha(b"".join(bytes(w) for w in work))

    expected, done = [], []
    for op in ops_fx["ops"]:
        e, z = op["expected"], op["slice"]
        value = 1 if op["tool"] == "add" else 0
        if sha(work[z]) != e["slice_sha256_before"]:
            problems.append(f"{op['id']}: stored before-hash disagrees with the replay")
        old = [(i, work[z][i]) for i in e["changed_indices"]]
        if any(v == value for _, v in old) or len(old) != e["changed"]:
            problems.append(f"{op['id']}: changed_indices are not a set of real changes")
        for i, _ in old:
            work[z][i] = value
        rec = {"op": op["id"], "tool": op["tool"], "hash": sha(work[z]), "changed": len(old), "volume": volume()}
        if rec["hash"] != e["slice_sha256_after"] or rec["volume"] != e["volume_sha256_after"]:
            problems.append(f"{op['id']}: stored after-hashes disagree with the replay")
        expected.append(rec)
        done.append((op, old, value))
    for op, old, _ in reversed(done):
        z = op["slice"]
        for i, v in old:
            work[z][i] = v
        expected.append({"op": f"undo:{op['id']}", "hash": sha(work[z]), "changed": len(old), "volume": volume()})
    expected.append({"op": "undo-all", "hashes": [sha(w) for w in work]})
    for op, old, value in done:
        z = op["slice"]
        for i, _ in old:
            work[z][i] = value
        expected.append({"op": f"redo:{op['id']}", "hash": sha(work[z]), "changed": len(old), "volume": volume()})
    expected.append({"op": "redo-all", "hashes": [sha(w) for w in work]})
    expected.append({"op": "reset", "hashes": [sha(s) for s in source]})

    stored = ([w["slice_sha256"] for w in ops_fx["undo_walk"]], ops_fx["after_undo_all_slice_sha256"],
              [w["slice_sha256"] for w in ops_fx["redo_walk"]], ops_fx["after_redo_all_slice_sha256"],
              ops_fx["after_reset_slice_sha256"])
    n = len(done)
    mine = ([r["hash"] for r in expected[n:2 * n]], expected[2 * n]["hashes"],
            [r["hash"] for r in expected[2 * n + 1:3 * n + 1]], expected[3 * n + 1]["hashes"], expected[-1]["hashes"])
    if stored != mine:
        problems.append("brush_ops.json undo/redo/reset hashes disagree with the replay")
    if expected[2 * n]["hashes"] != mask["slice_sha256"]:
        problems.append("undo-all does not return to the source mask in the replay")
    return expected, problems


def group_status(expected_n, seen, matching):
    if matching < seen:
        return FAIL
    return OBSERVED if expected_n and seen == expected_n else INCOMPLETE


def evaluate_ops_run(run, expected):
    by_step, mismatches = {}, []
    for r in run["records"]:
        k = r.get("step")
        if not isinstance(k, int) or not 1 <= k <= len(expected):
            mismatches.append({"step": k, "problem": "step outside the fixture script", "device": r})
            continue
        w = expected[k - 1]
        if "hashes" in w:
            ok = r.get("op") == w["op"] and r.get("hashes") == w["hashes"]
            if w["op"] == "reset":
                ok = ok and r.get("undo_depth") == 0 and r.get("redo_depth") == 0
        else:
            ok = (r.get("op") == w["op"] and r.get("hash") == w["hash"] and r.get("changed") == w["changed"]
                  and r.get("volume") == w["volume"])
        by_step[k] = by_step.get(k, True) and ok
        if not ok:
            mismatches.append({"step": k, "expected_op": w["op"], "device": r})

    def group(pred):
        steps = [k for k, w in enumerate(expected, 1) if pred(w)]
        seen = sum(1 for k in steps if k in by_step)
        matching = sum(1 for k in steps if by_step.get(k) is True)
        return {"expected": len(steps), "seen": seen, "matching": matching,
                "status": group_status(len(steps), seen, matching)}

    groups = {
        "A3": group(lambda w: w.get("tool") == "add"),
        "A4": group(lambda w: w.get("tool") == "erase"),
        "A6": group(lambda w: w["op"].startswith("undo")),
        "A7": group(lambda w: w["op"].startswith("redo")),
        "reset": group(lambda w: w["op"] == "reset"),
    }
    return {"started": run["started"], "ended": run["ended"], "records": len(run["records"]),
            "groups": groups, "mismatches": mismatches}


def evaluate_a5_line(rec, brush, ops_fx, nx, ny):
    radius = rec.get("radius")
    if radius not in (0, 2):
        return {"radius": radius, "status": FAIL, "problem": "radius is not one of the fixture's 0 and 2"}
    device = rec.get("cases") or []
    hits, dist, bad = 0, Counter(), []
    for k, c in enumerate(brush["cases"]):
        if k >= len(device):
            break
        p = c["expected_source_pixel"]
        want = ([p[1] * nx + p[0]] if p else []) if radius == 0 else ops_fx["a5"]["cases"][k]["painted_r2"]
        blank = bytearray(nx * ny)
        for i in want:
            blank[i] = 1
        try:
            cx, cy, n, h12 = device[k]
        except (TypeError, ValueError):
            bad.append({"id": c["id"], "device": device[k], "problem": "malformed record"})
            continue
        centre_ok = (p is None and cx is None and cy is None) or (p is not None and [cx, cy] == p)
        ok = centre_ok and n == len(want) and h12 == sha(blank)[:12]
        hits += ok
        if p is not None and cx is not None:
            dist[f"({cx - p[0]},{cy - p[1]})"] += 1
        elif p is None:
            dist["outside the image, nothing painted" if cx is None and n == 0 else "outside the image, PAINTED"] += 1
        else:
            dist["inside the image, NOTHING painted"] += 1
        if not ok:
            bad.append({"id": c["id"], "device": device[k], "expected_pixel": p, "expected_count": len(want)})
    complete = len(device) == len(brush["cases"])
    status = FAIL if bad or len(device) > len(brush["cases"]) else (OBSERVED if complete else INCOMPLETE)
    return {"radius": radius, "cases_in_log": len(device), "cases_matching_fixture_recomputed": hits,
            "of": len(brush["cases"]), "device_reported_pass": rec.get("pass"),
            "dx_dy_distribution": dict(dist), "mismatches": bad, "status": status}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="read a saved logcat dump instead of calling adb")
    ap.add_argument("--label", default="", help="short note stored with the run")
    ap.add_argument("--out-dir", default=EVIDENCE, help="where the evidence JSON goes (default EVIDENCE_RAW/)")
    args = ap.parse_args()

    text = (open(args.file, encoding="utf-8", errors="replace").read() if args.file
            else read_logcat())
    events = []
    for m in LINE.finditer(text):
        tag, payload = m.group(1), m.group(2)
        rec = None
        if payload:
            try:
                rec = json.loads(payload)
            except json.JSONDecodeError:
                continue                       # truncated line: skip, never guess
        events.append((tag, rec))

    if not any(t in ("SPIKE_A_A5", "SPIKE_A_OPS") and r for t, r in events):
        print("No SPIKE_A_A5 or SPIKE_A_OPS records in the log. Nothing is written - a run with no")
        print("checks is not a measurement. Press 'kiểm A5' and 'A3–A7 tự động' in the app first.")
        return 1

    mask, brush, ops_fx = load("mask_synthetic.json"), load("brush_cases.json"), load("brush_ops.json")
    nx, ny, _ = mask["shape_xyz"]
    expected, problems = replay_ops(ops_fx, mask)
    for k, c in enumerate(brush["cases"]):
        p = c["expected_source_pixel"]
        if ops_fx["a5"]["cases"][k]["painted_r0"] != ([p[1] * nx + p[0]] if p else []):
            problems.append(f"{c['id']}: brush_ops.json painted_r0 disagrees with brush_cases.json")

    runs, current = [], None
    for tag, rec in events:
        if tag == "SPIKE_A_OPS_START":
            current = {"started": True, "ended": False, "records": []}
            runs.append(current)
        elif tag == "SPIKE_A_OPS" and rec:
            if current is None:                # the log began mid-run
                current = {"started": False, "ended": False, "records": []}
                runs.append(current)
            current["records"].append(rec)
        elif tag == "SPIKE_A_OPS_END" and current is not None:
            current["ended"] = True
            current = None
    ops_runs = [evaluate_ops_run(r, expected) for r in runs]
    a5_lines = [evaluate_a5_line(r, brush, ops_fx, nx, ny) for t, r in events if t == "SPIKE_A_A5" and r]

    criteria = {}
    for cid in ("A3", "A4", "A6", "A7", "reset"):
        states = [run["groups"][cid]["status"] for run in ops_runs]
        criteria[cid] = FAIL if FAIL in states else (OBSERVED if OBSERVED in states else INCOMPLETE)
    a5_states = [ln["status"] for ln in a5_lines]
    a5_full = {ln["radius"] for ln in a5_lines if ln["status"] == OBSERVED}
    criteria["A5"] = FAIL if FAIL in a5_states else (OBSERVED if a5_full == {0, 2} else INCOMPLETE)

    if problems or FAIL in criteria.values():
        verdict = FAIL
        why = ("the fixtures are not self-consistent: " + "; ".join(problems[:3]) if problems else
               "device records disagree with the fixture for " +
               ", ".join(k for k, v in criteria.items() if v == FAIL))
    elif all(v == OBSERVED for v in criteria.values()):
        verdict = OBSERVED
        why = ("a complete 'A3–A7 tự động' run matches the fixture replay at every step (strokes, undo walk, "
               "undo-all, redo walk, redo-all, reset) and 'kiểm A5' matches 60/60 cases at r = 0 and r = 2")
    else:
        verdict = INCOMPLETE
        why = ("still missing: " + ", ".join(k for k, v in criteria.items() if v != OBSERVED) +
               " - need one complete 'A3–A7 tự động' run and one 'kiểm A5' press")

    strokes = [r for t, r in events if t == "SPIKE_A_BRUSH" and r]
    committed = [s for s in strokes if s.get("committed") is True]
    unaccounted = [s for s in committed
                   if s.get("samples_received") != (s.get("samples_applied") or 0) + (s.get("samples_outside") or 0)]
    maxes = [s["feedback_ms_max"] for s in strokes if isinstance(s.get("feedback_ms_max"), (int, float))]
    history_actions = [dict(r, action=t[len("SPIKE_A_BRUSH_"):].lower()) for t, r in events
                       if t in ("SPIKE_A_BRUSH_UNDO", "SPIKE_A_BRUSH_REDO", "SPIKE_A_BRUSH_RESET") and r]

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(args.out_dir, exist_ok=True)
    path = os.path.join(args.out_dir, f"a3_a7_brush_{stamp}.json")
    n = 2
    while os.path.exists(path):                # two runs in one second: never overwrite a record
        path = os.path.join(args.out_dir, f"a3_a7_brush_{stamp}_{n}.json")
        n += 1
    record = {
        "criterion": "A3-A7 — brush ADD/ERASE exact, mapping after zoom/pan, undo, redo (stage S5)",
        "target": ("exact against fixtures/brush_ops.json and brush_cases.json (TASK.md A3-A7); proposed A5 "
                   "tolerance: 0 source pixels for the fixture triples"),
        "captured_at": stamp,
        "label": args.label,
        "operator": "[RECORD — who held the device]",
        "build_type": "[RECORD — release or debug]",
        "device_profile": "../../management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md",
        "verdict_from_raw_log": verdict,
        "verdict_reason": why,
        "criteria": criteria,
        "method": ("the app runs brush_ops.json and the 60 brush cases through app/brushMath.js strokeSample on "
                   "scratch buffers and logs every resulting hash; this script replays brush_ops.json onto "
                   "mask_synthetic.json from the stored changed pixels with hashlib, stamps each A5 case's "
                   "expected set on a blank slice, and compares the device's values one by one."),
        "fixture_self_consistent": not problems,
        "fixture_problems": problems,
        "a5_lines": a5_lines,
        "ops_runs": ops_runs,
        "strokes": strokes,
        "strokes_summary": {
            "n": len(strokes),
            "committed": len(committed),
            "rolled_back": dict(Counter(s.get("end") for s in strokes if s.get("committed") is False)),
            "committed_with_samples_unaccounted": len(unaccounted),
            "feedback_ms_max_worst": max(maxes) if maxes else None,
            "note": ("input for A10/A11 only - no verdict here. feedback_ms is a JS-side next-frame proxy "
                     "(handler entry -> first requestAnimationFrame after the overlay update); native input "
                     "delivery is not included. samples_received counts what reached the JS handler; "
                     "samples coalesced before that are invisible to the app. Per-stroke p50s cannot be "
                     "combined into an overall p50."),
        },
        "history_actions": history_actions,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"  A5 lines          {len(a5_lines)}   ops runs {len(ops_runs)}   strokes {len(strokes)} "
          f"(committed {len(committed)}, rolled back {len(strokes) - len(committed)})")
    for ln in a5_lines:
        print(f"  A5 r={ln['radius']}            {ln.get('cases_matching_fixture_recomputed', 0)}/{ln.get('of', '-')} "
              f"recomputed ({ln['status']}), distribution {ln.get('dx_dy_distribution', {})}")
    for i, run in enumerate(ops_runs):
        g = run["groups"]
        print(f"  ops run {i}         " + "  ".join(f"{k} {v['matching']}/{v['expected']}" for k, v in g.items()) +
              f"   ended={run['ended']}")
    print(f"  criteria          {criteria}")
    print(f"  A3-A7 from log    {verdict} — {why}")
    try:
        shown = os.path.relpath(path, os.getcwd())
    except ValueError:                         # Windows: different drive from the cwd
        shown = path
    print(f"\n  written           {shown}")
    print("  Fill operator and build_type by hand. Not acceptance evidence on a debug build.")
    return 0 if verdict != FAIL else 1


if __name__ == "__main__":
    raise SystemExit(main())
