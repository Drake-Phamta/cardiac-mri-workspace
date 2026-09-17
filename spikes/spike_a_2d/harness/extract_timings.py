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

S6 (2026-09-17) added three things, all of them to remove typed numbers:

  * CACHE POLICY is read from the run's own SPIKE_A_TIMING_RUN_START line, along
    with nx/ny/nz and whether the bundle was a dev bundle. build_type used to be
    a "[RECORD - release or debug]" placeholder filled in by the operator; it is
    now derived from __DEV__ as the app itself reported it.
  * IN-WINDOW percentiles are reported separately. Under a bounded cache a jump
    beyond the window is a cache MISS, and NFR-PERF-001 bounds only "switching
    among already available/cached slices". Quoting an all-steps p95 against that
    ceiling would be the same category error the Day-7 record made with Spike E's
    E4, so the two numbers are kept apart and labelled.
  * MEMORY from capture_conditions.py is folded in when passed, which is what
    turns RESULT.md's 376 MB extrapolation into a measurement.

Usage:
    python extract_timings.py                 # read adb logcat buffer
    python extract_timings.py --file log.txt  # read a saved logcat dump

    # stage S6 - the full form
    python extract_timings.py --label "release, 576x576x88, charging" \
        --meminfo-before /tmp/a9_all_before.json \
        --meminfo-after  /tmp/a9_all_after.json
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
# The run header the app emits when a scripted run starts. Carries the fixture
# dimensions, the cache policy and __DEV__, so none of those has to be typed.
RUN_START_RE = re.compile(re.escape(TAG) + r"_RUN_START\s+(\{.*?\})")


# adb is not on PATH on the machine that runs these measurements, and a harness
# that dies on that is a harness that does not get run. Look in the usual SDK
# location first, the same way capture_conditions.py does.
ADB_CANDIDATES = [
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk",
                 "platform-tools", "adb.exe"),
    os.path.join(os.environ.get("ANDROID_HOME", ""), "platform-tools", "adb.exe"),
    "adb",
]


def find_adb() -> str:
    for c in ADB_CANDIDATES:
        if not c:
            continue
        try:
            subprocess.run([c, "version"], capture_output=True, timeout=20, check=True)
            return c
        except Exception:
            continue
    sys.exit("adb not found. Tried:\n  " + "\n  ".join(x for x in ADB_CANDIDATES if x))


def clear_logcat() -> None:
    """
    Drop the buffer so the next run starts clean. Worth doing between two runs of
    different cache policies: a stale buffer is how one run's samples end up in
    another run's record.
    """
    adb = find_adb()
    subprocess.run([adb, "logcat", "-c"], capture_output=True, timeout=60)
    print("  logcat buffer cleared. Start the run on the device now.")


def read_logcat() -> str:
    """Dump the current logcat buffer. Does not clear it."""
    adb = find_adb()
    try:
        out = subprocess.run(
            [adb, "logcat", "-d", "-v", "brief"],
            capture_output=True, text=True, errors="replace", timeout=60,
        )
    except FileNotFoundError:
        sys.exit("adb not on PATH. Add <SDK>/platform-tools and retry.")
    if out.returncode != 0:
        sys.exit(f"adb logcat failed:\n{out.stderr.strip()}")
    return out.stdout


def last_run_slice(text: str) -> str:
    """
    Return only the part of the buffer belonging to the MOST RECENT run.

    Without this, measuring two cache policies back to back silently pools them:
    the run header is read from the last run while the samples come from both, and
    the record then describes a distribution that never happened. Scoping to the
    last header is the fix. A buffer with no header at all is returned whole, so
    pre-S6 dumps still work.
    """
    last = None
    for m in RUN_START_RE.finditer(text):
        last = m
    return text[last.start():] if last else text


def parse(text: str):
    samples = []
    for m in SAMPLE_RE.finditer(text):
        try:
            samples.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            continue                       # truncated logcat line: skip, do not guess
    return samples


def parse_run_header(text: str):
    """
    The LAST run header in the buffer describes the run whose samples we are
    about to read. Older headers belong to earlier runs and are ignored.
    Returns {} when the app predates S6 - the record then says so explicitly
    rather than inventing a policy.
    """
    found = None
    for m in RUN_START_RE.finditer(text):
        try:
            found = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
    return found or {}


def load_conditions(path, which):
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
    except Exception as exc:
        sys.exit(f"could not read --meminfo-{which} ({path}): {exc}")
    if d.get("phase") != which:
        sys.exit(f"--meminfo-{which} points at a capture whose phase is "
                 f"{d.get('phase')!r}. Refusing to mislabel it.")
    # The verbatim dumpsys dump is large and already committed alongside; keep the
    # parsed values in the record and drop the raw blob so the evidence file stays
    # readable. The capture file itself is the place to re-parse from.
    d.pop("raw", None)
    return d


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
    ap.add_argument("--meminfo-before", help="JSON from capture_conditions.py --phase before")
    ap.add_argument("--meminfo-after", help="JSON from capture_conditions.py --phase after")
    ap.add_argument("--clear", action="store_true",
                    help="clear the logcat buffer and exit; run this BEFORE each measured run")
    ap.add_argument("--all-runs", action="store_true",
                    help="do not scope to the last run (pools every run in the buffer)")
    args = ap.parse_args()

    if args.clear:
        clear_logcat()
        return

    raw_text = open(args.file, encoding="utf-8", errors="replace").read() if args.file else read_logcat()
    text = raw_text if args.all_runs else last_run_slice(raw_text)
    samples = parse(text)
    pooled = len(parse(raw_text))
    if not args.all_runs and pooled > len(samples):
        print(f"  note: buffer held {pooled} samples across several runs; using the "
              f"{len(samples)} from the most recent run only.")

    if not samples:
        print(f"No {TAG} samples found.")
        print("Nothing is written. A run with no samples is not a measurement of zero —")
        print("it means the run did not happen, or logcat was cleared, or the build")
        print("stripped console output. Check before recording anything as evidence.")
        sys.exit(1)

    header = parse_run_header(text)
    before = load_conditions(args.meminfo_before, "before")
    after = load_conditions(args.meminfo_after, "after")

    frame = summarise([s["ms_to_frame"] for s in samples])
    load = summarise([s["ms_to_load"] for s in samples])

    # --- S6: in-window vs all steps ---------------------------------------
    # Samples from a pre-S6 build carry no in_window field. Treating a missing
    # field as True would silently claim every step was a cache hit, so it is
    # treated as unknown and the split is reported as unavailable instead.
    has_flag = all("in_window" in s for s in samples)
    hits = [s for s in samples if s.get("in_window") is True]
    misses = [s for s in samples if s.get("in_window") is False]
    policy = header.get("cache_policy")

    if has_flag:
        scope = {
            "_why": "NFR-PERF-001 bounds switching among ALREADY CACHED slices. Under a "
                    "bounded cache a step beyond the window is a miss and is NOT in that "
                    "scope. The two are reported separately and never pooled.",
            "steps_total": len(samples),
            "steps_in_window": len(hits),
            "steps_missed": len(misses),
            "summary_ms_to_frame_in_window": summarise([s["ms_to_frame"] for s in hits]) if hits else None,
            "summary_ms_to_frame_missed": summarise([s["ms_to_frame"] for s in misses]) if misses else None,
            "comparable_to_NFR_PERF_001": "summary_ms_to_frame_in_window",
            "felt_by_a_user": "summary_ms_to_frame (all steps)",
        }
    else:
        scope = {
            "_why": "This run came from a build older than stage S6: its samples carry no "
                    "in_window flag. The cache-hit split is NOT available and is not guessed.",
            "steps_total": len(samples),
        }

    # build_type used to be typed in. __DEV__ as the app reported it replaces it.
    dev = header.get("dev_bundle")
    if dev is True:
        build_type = "debug (dev bundle: the app reported __DEV__ === true). NOT acceptance evidence."
    elif dev is False:
        build_type = "release (the app reported __DEV__ === false)"
    else:
        build_type = ("[UNKNOWN — this build predates S6 and did not report __DEV__. "
                      "Do not record it as release without independent proof.]")

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(EVIDENCE, exist_ok=True)
    suffix = f"_{policy}" if policy else ""
    path = os.path.join(EVIDENCE, f"a9_slice_switch_{stamp}{suffix}.json")

    record = {
        "criterion": "A9 — cached slice-switch latency",
        "target": "NFR-PERF-001: p95 <= 200 ms over a 30-step navigation test, "
                  "among ALREADY AVAILABLE/CACHED slices, on the target demo device",
        "captured_at": stamp,
        "label": args.label,
        "definitions": {
            "ms_to_frame": "state change -> first frame after the image decoded. "
                           "This is the one NFR-PERF-001 means by 'update the visible slice'.",
            "ms_to_load": "state change -> image decode reported. Kept so the decode/paint split is visible.",
            "percentile": "nearest-rank, no interpolation, no outlier removal",
            "in_window": "the slice was already held by the cache policy when the step "
                         "was issued. Always true under policy 'all'.",
        },
        "run": {
            "_source": "read from the app's own SPIKE_A_TIMING_RUN_START line, not typed in",
            "cache_policy": policy,
            "window_radius": header.get("window_radius"),
            "fixture_nx": header.get("nx"),
            "fixture_ny": header.get("ny"),
            "fixture_nz": header.get("nz"),
            "steps_planned": header.get("steps"),
            "sequence": header.get("sequence"),
        },
        "build_type": build_type,
        "device_profile": "../../management/spikes/SPIKE_A_2D/DR006_DEVICE_PROFILE.md",
        "conditions": {
            "_source": "harness/capture_conditions.py read these off the device; none was typed in",
            "before": before,
            "after": after,
            "_missing": None if (before and after) else
                        "One or both captures were not supplied. Memory and thermal "
                        "conditions for this run are UNKNOWN, not nominal.",
        },
        "memory_delta": (
            {
                "_why": "The cache question in one row: what did holding these slices cost?",
                "graphics_mb_before": before["memory"].get("graphics_mb"),
                "graphics_mb_after": after["memory"].get("graphics_mb"),
                "graphics_mb_delta": (
                    round(after["memory"]["graphics_mb"] - before["memory"]["graphics_mb"], 2)
                    if after["memory"].get("graphics_mb") is not None
                    and before["memory"].get("graphics_mb") is not None else None),
                "total_pss_mb_before": before["memory"].get("total_pss_mb"),
                "total_pss_mb_after": after["memory"].get("total_pss_mb"),
                "java_heap_mb_after": after["memory"].get("java_heap_mb"),
                "heapgrowthlimit": after["device"].get("heapgrowthlimit"),
            } if before and after else None),
        "scope": scope,
        "summary_ms_to_frame": frame,
        "summary_ms_to_load": load,
        "samples": samples,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"  samples          {len(samples)}")
    print(f"  cache policy     {policy or '(pre-S6 build, not reported)'}"
          + (f"  radius +/-{header['window_radius']}" if header.get("window_radius") else ""))
    if header.get("nz"):
        print(f"  fixture          {header.get('nx')}x{header.get('ny')}x{header.get('nz')}")
    print(f"  build            {build_type}")
    print(f"  ms to frame      min {frame['min']}  p50 {frame['p50']}  p95 {frame['p95']}  max {frame['max']}")
    print(f"  ms to decode     min {load['min']}  p50 {load['p50']}  p95 {load['p95']}  max {load['max']}")
    if has_flag and misses:
        iw = scope["summary_ms_to_frame_in_window"]
        mi = scope["summary_ms_to_frame_missed"]
        print(f"  in window        {len(hits)}/{len(samples)} steps"
              + (f"   p95 {iw['p95']}  <- the one comparable to NFR-PERF-001" if iw else ""))
        print(f"  cache misses     {len(misses)}/{len(samples)} steps"
              + (f"   p95 {mi['p95']}" if mi else ""))
    elif has_flag:
        print(f"  in window        {len(hits)}/{len(samples)} steps — no misses")
    if record["memory_delta"]:
        d = record["memory_delta"]
        print(f"  graphics         {d['graphics_mb_before']} -> {d['graphics_mb_after']} MB"
              f"   (delta {d['graphics_mb_delta']} MB)")
        print(f"  TOTAL PSS        {d['total_pss_mb_before']} -> {d['total_pss_mb_after']} MB")
    print(f"\n  written          {os.path.relpath(path, os.getcwd())}")
    print("\n  A9 target is p95 <= 200 ms on ms_to_frame among CACHED slices.")
    if dev is not False:
        print("  WARNING: this was not confirmed to be a release build, so it is NOT")
        print("  acceptance evidence. Debug bundles distort timings.")
    if not (before and after):
        print("  NOTE: no memory capture was supplied, so the cache cost of this run is")
        print("  unknown. Run capture_conditions.py either side of the next run.")


if __name__ == "__main__":
    main()
