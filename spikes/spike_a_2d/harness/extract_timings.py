#!/usr/bin/env python3
"""
Pull SPIKE_A timing samples off the device and turn them into a distribution.

THROWAWAY SPIKE CODE under spikes/spike_a_2d/.

The app emits one line per navigation step to logcat:

    SPIKE_A_TIMING {"slice": 7, "ms_to_load": 12.3, "ms_to_frame": 28.9}

This script recovers those RAW samples. It does not smooth them, drop
outliers, or fill gaps. If there are no samples it says so and exits non-zero
rather than printing a number.

Why raw samples and not just p95: NFR-PERF-001 states a p95 target, but a p95
alone hides whether the tail is one bad frame or a systematic stall, and
TASK.md asks the spike to report the distribution. The summary is derived here
from samples that stay in EVIDENCE_RAW/ so anyone can recompute it.

Usage:
    python extract_timings.py                 # read adb logcat buffer
    python extract_timings.py --file log.txt  # read a saved logcat dump
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
EVIDENCE = os.path.join(os.path.dirname(HERE), "EVIDENCE_RAW")

TAG = "SPIKE_A_TIMING"
SAMPLE_RE = re.compile(re.escape(TAG) + r"\s+(\{.*?\})")


def read_logcat() -> str:
    """Dump the current logcat buffer. Does not clear it."""
    try:
        out = subprocess.run(
            ["adb", "logcat", "-d", "-v", "brief"],
            capture_output=True, text=True, errors="replace", timeout=60,
        )
    except FileNotFoundError:
        sys.exit("adb not on PATH. Add <SDK>/platform-tools and retry.")
    if out.returncode != 0:
        sys.exit(f"adb logcat failed:\n{out.stderr.strip()}")
    return out.stdout


def parse(text: str):
    samples = []
    for m in SAMPLE_RE.finditer(text):
        try:
            samples.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            continue                       # truncated logcat line: skip, do not guess
    return samples


def percentile_nearest_rank(sorted_vals, p):
    """Nearest-rank, the same definition the app uses on screen."""
    if not sorted_vals:
        return None
    k = max(1, min(len(sorted_vals), -(-p * len(sorted_vals) // 100)))
    return sorted_vals[k - 1]


def summarise(values):
    v = sorted(values)
    return {
        "n": len(v),
        "min": v[0],
        "p50": percentile_nearest_rank(v, 50),
        "p90": percentile_nearest_rank(v, 90),
        "p95": percentile_nearest_rank(v, 95),
        "p99": percentile_nearest_rank(v, 99),
        "max": v[-1],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="read a saved logcat dump instead of calling adb")
    ap.add_argument("--label", default="", help="short note stored with the run, e.g. 'release, charging, 60Hz'")
    args = ap.parse_args()

    text = open(args.file, encoding="utf-8", errors="replace").read() if args.file else read_logcat()
    samples = parse(text)

    if not samples:
        print(f"No {TAG} samples found.")
        print("Nothing is written. A run with no samples is not a measurement of zero —")
        print("it means the run did not happen, or logcat was cleared, or the build")
        print("stripped console output. Check before recording anything as evidence.")
        sys.exit(1)

    frame = summarise([s["ms_to_frame"] for s in samples])
    load = summarise([s["ms_to_load"] for s in samples])

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(EVIDENCE, exist_ok=True)
    path = os.path.join(EVIDENCE, f"a9_slice_switch_{stamp}.json")

    record = {
        "criterion": "A9 — cached slice-switch latency",
        "target": "NFR-PERF-001: p95 <= 200 ms over a 30-step navigation test",
        "captured_at": stamp,
        "label": args.label,
        "definitions": {
            "ms_to_frame": "state change -> first frame after the image decoded. "
                           "This is the one NFR-PERF-001 means by 'update the visible slice'.",
            "ms_to_load": "state change -> image decode reported. Kept so the decode/paint split is visible.",
            "percentile": "nearest-rank, no interpolation, no outlier removal",
        },
        "build_type": "[RECORD — release or debug. Debug builds distort timings and are NOT acceptance evidence.]",
        "device_profile": "../../management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md",
        "conditions": "[RECORD — thermal start/end, charging or battery, brightness mode, refresh rate, background load]",
        "summary_ms_to_frame": frame,
        "summary_ms_to_load": load,
        "samples": samples,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"  samples          {len(samples)}")
    print(f"  ms to frame      min {frame['min']}  p50 {frame['p50']}  p95 {frame['p95']}  max {frame['max']}")
    print(f"  ms to decode     min {load['min']}  p50 {load['p50']}  p95 {load['p95']}  max {load['max']}")
    print(f"\n  written          {os.path.relpath(path, os.getcwd())}")
    print("\n  A9 target is p95 <= 200 ms on ms_to_frame.")
    print("  This is NOT acceptance evidence until build_type and conditions are filled in")
    print("  and the run was a RELEASE build. Fill those two fields by hand.")


if __name__ == "__main__":
    main()
