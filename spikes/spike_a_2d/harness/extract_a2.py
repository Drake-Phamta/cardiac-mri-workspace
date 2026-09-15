#!/usr/bin/env python3
"""
Recover the A2 (zoom/pan leaves the source mask unchanged) record from logcat.

THROWAWAY SPIKE CODE under spikes/spike_a_2d/.

The app emits, with fixed tags:

    SPIKE_A_MAP      {"pass": 60, "of": 60}          app mapping vs brush_cases.json
    SPIKE_A_A2       {"check": 0, "label": "manual", "match": 16, "of": 16,
                      "gestures_since_last_check": 0, "hashes": [...], ...}
    SPIKE_A_GESTURE  {"kind": "pinch", "ms": 812.4, "max_frame_gap_ms": 21.3, ...}
    SPIKE_A_TAP      {"u": 312, "v": 400, "src": [18, 23], ...}
    SPIKE_A_A2_AUTO_START / SPIKE_A_A2_AUTO_END

This script does not trust the app's own "match" count. It recomputes the
expected SHA-256 of every source-mask slice from fixtures/mask_synthetic.json
with hashlib and compares the hashes the device reported, one by one.

What counts as A2 observed (all must hold, otherwise INCOMPLETE or FAIL):
  1. a check BEFORE any real gesture, matching the fixture on every slice
  2. at least one real PINCH and one real PAN gesture after it
  3. a check AFTER those gestures, matching the fixture on every slice
  4. no check anywhere that differs from the fixture (that is a FAIL)
The automated sequence is recorded alongside; it supplements, never replaces,
real gestures.

Usage:
    python extract_a2.py --label "release, 60 Hz, battery 80%"
    python extract_a2.py --file saved_logcat.txt
"""

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")
MASK = os.path.join(ROOT, "fixtures", "mask_synthetic.json")

LINE = re.compile(r"(SPIKE_A_(?:A2_AUTO_START|A2_AUTO_END|A2|GESTURE|TAP|MAP))(?:\s+(\{.*\}))?")


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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="read a saved logcat dump instead of calling adb")
    ap.add_argument("--label", default="", help="short note stored with the run")
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

    checks = [r for t, r in events if t == "SPIKE_A_A2" and r]
    if not checks:
        print("No SPIKE_A_A2 checks in the log. Nothing is written - a run with no checks")
        print("is not a measurement. Press 'kiểm A2' in the app before and after gestures.")
        return 1

    with open(MASK, encoding="utf-8") as f:
        mask = json.load(f)
    expected = [hashlib.sha256(base64.b64decode(b)).hexdigest() for b in mask["slices_b64"]]
    fixture_ok = expected == mask["slice_sha256"]

    # Walk the log in order, attributing gestures to the interval before each check.
    timeline, pinch_after_first, pan_after_first = [], 0, 0
    first_check_seen = False
    gestures = []
    for tag, rec in events:
        if tag == "SPIKE_A_GESTURE" and rec:
            gestures.append(rec)
            if first_check_seen:
                pinch_after_first += rec.get("kind") == "pinch"
                pan_after_first += rec.get("kind") == "pan"
        elif tag == "SPIKE_A_A2" and rec:
            dev = rec.get("hashes") or []
            same = [i for i, h in enumerate(dev) if i < len(expected) and h == expected[i]]
            timeline.append({
                "check": rec.get("check"), "label": rec.get("label"),
                "slices_matching_fixture_recomputed": len(same), "of": len(expected),
                "device_reported_match": rec.get("match"),
                "real_gestures_before_this_check": rec.get("gestures_since_last_check"),
                "auto_steps_before_this_check": rec.get("auto_steps_since_last_check"),
                "pinches_and_pans_so_far": {"pinch": pinch_after_first, "pan": pan_after_first},
                "transform": rec.get("transform"),
            })
            first_check_seen = True
        elif tag.startswith("SPIKE_A_A2_AUTO"):
            timeline.append({"marker": tag})

    real_checks = [c for c in timeline if "check" in c]
    any_mismatch = any(c["slices_matching_fixture_recomputed"] != c["of"] for c in real_checks)
    before = next((c for c in real_checks if c["pinches_and_pans_so_far"] == {"pinch": 0, "pan": 0}), None)
    after = next((c for c in real_checks if c["pinches_and_pans_so_far"]["pinch"] >= 1
                  and c["pinches_and_pans_so_far"]["pan"] >= 1), None)
    if any_mismatch or not fixture_ok:
        verdict = "FAIL"
        why = ("a device checksum differs from the fixture" if any_mismatch
               else "the fixture's own slice_sha256 does not match its bytes")
    elif before and after:
        verdict = "OBSERVED"
        why = (f"check {before['check']} before any gesture and check {after['check']} after "
               f"{after['pinches_and_pans_so_far']['pinch']} pinch + "
               f"{after['pinches_and_pans_so_far']['pan']} pan gestures both match the fixture on "
               f"all {len(expected)} slices")
    else:
        verdict = "INCOMPLETE"
        why = ("need a check before any gesture, then at least one pinch and one pan, then "
               "another check")

    maps = [r for t, r in events if t == "SPIKE_A_MAP" and r]
    taps = [r for t, r in events if t == "SPIKE_A_TAP" and r]
    stalls = [x for x in gestures if x.get("stall_over_500ms")]
    gaps = sorted(x.get("max_frame_gap_ms", 0) for x in gestures)

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(EVIDENCE, exist_ok=True)
    path = os.path.join(EVIDENCE, f"a2_zoom_pan_{stamp}.json")
    record = {
        "criterion": "A2 — pinch-zoom and pan do not alter source-mask geometry",
        "target": "checksum of the source mask unchanged (TASK.md A2)",
        "captured_at": stamp,
        "label": args.label,
        "operator": "[RECORD — who held the device]",
        "build_type": "[RECORD — release or debug]",
        "device_profile": "../../management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md",
        "verdict_from_raw_log": verdict,
        "verdict_reason": why,
        "method": ("app hashes every source-mask slice (SHA-256, app/viewerMath.js) on demand; "
                   "this script recomputes the fixture hashes with hashlib and compares the "
                   "device's hashes one by one. Gestures are counted from the device's own "
                   "SPIKE_A_GESTURE lines."),
        "fixture_self_consistent": fixture_ok,
        "timeline": timeline,
        "gestures": gestures,
        "gesture_frame_gaps": {
            "n": len(gaps), "max_frame_gap_ms_worst": gaps[-1] if gaps else None,
            "stalls_over_500ms": len(stalls),
            "note": "max frame gap per gesture, sampled with requestAnimationFrame (TASK.md: stall > 500 ms)",
        },
        "mapping_self_check": maps[-1] if maps else None,
        "taps": taps,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"  checks            {len(real_checks)}   gestures {len(gestures)} "
          f"(pinch {sum(g.get('kind') == 'pinch' for g in gestures)}, "
          f"pan {sum(g.get('kind') == 'pan' for g in gestures)})   taps {len(taps)}")
    print(f"  frame gaps        worst {gaps[-1] if gaps else '-'} ms, stalls > 500 ms: {len(stalls)}")
    print(f"  mapping check     {maps[-1] if maps else 'not in log'}")
    print(f"  A2 from raw log   {verdict} — {why}")
    try:
        shown = os.path.relpath(path, os.getcwd())
    except ValueError:                         # Windows: different drive from the cwd
        shown = path
    print(f"\n  written           {shown}")
    print("  Fill operator and build_type by hand. Not acceptance evidence on a debug build.")
    return 0 if verdict != "FAIL" else 1


if __name__ == "__main__":
    raise SystemExit(main())
