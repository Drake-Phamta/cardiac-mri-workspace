#!/usr/bin/env python3
"""
Recover the S8 save/reload record (A8) from logcat.

THROWAWAY SPIKE CODE under spikes/spike_a_2d/.

The app emits, with fixed tags:

    SPIKE_A_A8_STARTUP  {"found": true, "bytes": 812345, "uri": "file:///..."}
    SPIKE_A_A8          {"phase": "save", "nx":..,"ny":..,"nz":.., "edited_slices": 7,
                         "strokes": 25, "rle_ms":.., "sha_ms":.., "volume_sha_ms":..,
                         "json_ms":.., "write_ms":.., "save_ms":.., "bytes":..,
                         "raw_bytes":.., "ratio":.., "volume_sha256": "...", "uri": "..."}
    SPIKE_A_A8          {"phase": "reload", "cold": true, "nz":.., "read_ms":..,
                         "parse_ms":.., "rle_decode_ms":.., "verify_ms":.., "restore_ms":..,
                         "reload_ms":.., "bytes":.., "verified": 88, "mismatches": [],
                         "mismatches_total": 0, "volume_sha256_file": "...",
                         "volume_sha256_after": "...", "volume_sha256_match": true}
    SPIKE_A_A8_CYCLE    one per automated round trip
    SPIKE_A_A8_SUMMARY  {"cycles": 5, "exact": 5, "of": 5}

WHAT THIS SCRIPT DECIDES, AND WHAT IT REFUSES TO DECIDE.

A8 is "save and reload the corrected mask". The only reload that settles it is
a COLD one: a reload in a process that never saved, so the file is genuinely
from a previous run of the app. A warm round trip proves the codec and the
file; it does not prove the correction survived the app being killed, and this
script will not report OBSERVED without a cold reload, however many warm
cycles passed.

Three further refusals, each a way the check could pass for the wrong reason:

  - a reload whose volume_sha256_after differs from the volume_sha256 the
    SAVE printed is a FAIL even if every per-slice checksum verified, because
    self-consistency is not the same as returning what was stored;
  - a cold reload with no preceding save in the log is INCOMPLETE, not a pass:
    nothing in the log says what those bytes were supposed to be;
  - a save of an UNEDITED mask is INCOMPLETE. Round-tripping the source mask
    would pass without ever exercising a correction, which is the whole point.

No verdict is given on timing here. `save_ms` and `reload_ms` are reported as
a distribution and left for RESULT.md, because no frozen requirement bounds
them and inventing a threshold is not this script's job.

Usage:
    python extract_a8.py --label "release, A17, cold reload after force-stop"
    python extract_a8.py --file saved_logcat.txt [--out-dir DIR]
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")

LINE = re.compile(r"(SPIKE_A_A8(?:_STARTUP|_CYCLE|_SUMMARY)?)\b(?:\s+(\{.*\}))?")
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


def parse(text):
    """Every A8 record in the log, in order, with its tag."""
    out = []
    for raw in text.splitlines():
        m = LINE.search(raw)
        if not m:
            continue
        tag, payload = m.group(1), m.group(2)
        if payload is None:
            continue
        try:
            out.append((tag, json.loads(payload)))
        except json.JSONDecodeError:
            out.append((tag, {"_unparsable": payload[:200]}))
    return out


def distribution(values):
    """Nearest-rank, the same definition extract_timings.py and the app use."""
    if not values:
        return None
    v = sorted(values)

    def rank(p):
        return v[min(len(v) - 1, max(0, math.ceil(p * len(v)) - 1))]

    return {"n": len(v), "min": v[0], "p50": rank(0.5), "p95": rank(0.95), "max": v[-1]}


def judge(saves, reloads, startups):
    """Returns (verdict, why, detail). Every refusal above is applied here."""
    detail = {}
    if not saves and not reloads:
        return INCOMPLETE, "no save and no reload in the log", detail

    cold = [r for r in reloads if r.get("cold") is True]
    warm = [r for r in reloads if r.get("cold") is not True]
    detail["saves"] = len(saves)
    detail["reloads_cold"] = len(cold)
    detail["reloads_warm"] = len(warm)

    # A mismatch anywhere is a failure, warm or cold: it means bytes changed.
    bad = [r for r in reloads if r.get("mismatches_total", 1) != 0 or r.get("volume_sha256_match") is not True]
    if bad:
        detail["failing_reloads"] = bad[:4]
        return FAIL, f"{len(bad)} of {len(reloads)} reloads did not return the stored bytes", detail

    if not cold:
        return INCOMPLETE, (f"{len(warm)} warm round trips passed, but no COLD reload. "
                            "Save, force-stop the app, relaunch, then press 'nạp lại'."), detail

    # A cold reload only means something against a save that says what the
    # bytes were. Match on the volume hash, not on ordering.
    saved_hashes = {s.get("volume_sha256") for s in saves if s.get("volume_sha256")}
    matched = [r for r in cold if r.get("volume_sha256_file") in saved_hashes]
    detail["cold_matched_to_a_save"] = len(matched)
    if not matched:
        return INCOMPLETE, ("a cold reload verified itself, but no save in this log wrote that "
                            "volume hash - capture the save and the cold reload in one log"), detail

    edited = [s for s in saves if s.get("edited_slices", 0) > 0]
    detail["saves_with_edits"] = len(edited)
    if not edited:
        return INCOMPLETE, ("every save in this log was of an UNEDITED mask; A8 is about a "
                            "correction surviving, so paint before saving"), detail

    # The cold reload must correspond to a save that actually carried edits.
    edited_hashes = {s["volume_sha256"] for s in edited if s.get("volume_sha256")}
    if not any(r.get("volume_sha256_file") in edited_hashes for r in matched):
        return INCOMPLETE, "the cold reload matched a save of an unedited mask", detail

    return OBSERVED, (f"{len(matched)} cold reload(s) returned the exact bytes of an edited save, "
                      f"{sum(r.get('verified', 0) for r in cold)} slice checksums verified"), detail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="read a saved logcat dump instead of calling adb")
    ap.add_argument("--label", default="", help="short note stored with the run")
    ap.add_argument("--out-dir", default=EVIDENCE, help="where the evidence JSON goes (default EVIDENCE_RAW/)")
    args = ap.parse_args()

    text = open(args.file, encoding="utf-8", errors="replace").read() if args.file else read_logcat()
    records = parse(text)
    if not records:
        print("No SPIKE_A_A8 records in the log. Nothing is written - a run with no save and no")
        print("reload is not a measurement. Press 'lưu' and 'nạp lại' in the app first.")
        return 1

    startups = [r for t, r in records if t == "SPIKE_A_A8_STARTUP"]
    saves = [r for t, r in records if t == "SPIKE_A_A8" and r.get("phase") == "save"]
    reloads = [r for t, r in records if t == "SPIKE_A_A8" and r.get("phase") == "reload" and "error" not in r]
    errors = [r for t, r in records if t == "SPIKE_A_A8" and "error" in r]
    cycles = [r for t, r in records if t == "SPIKE_A_A8_CYCLE"]
    summaries = [r for t, r in records if t == "SPIKE_A_A8_SUMMARY"]

    verdict, why, detail = judge(saves, reloads, startups)

    # Field names follow the other extractors in this directory
    # (verdict_from_raw_log / verdict_reason / device_profile) so that
    # management/day10/qa004_spike_a/run_qa004.py reads one convention.
    record = {
        "criterion": "A8 — save the corrected working mask, reload it, get the same bytes back",
        "target": "the reviewed mask a corrector saves survives the app being killed, byte for byte",
        "captured_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "label": args.label,
        "operator": "FILL IN BY HAND",
        "build_type": "FILL IN BY HAND (debug or release)",
        "device_profile": "FILL IN BY HAND",
        "verdict_from_raw_log": verdict,
        "verdict_reason": why,
        "detail": detail,
        "save_ms": distribution([s["save_ms"] for s in saves if "save_ms" in s]),
        "reload_ms": distribution([r["reload_ms"] for r in reloads if "reload_ms" in r]),
        "bytes": distribution([s["bytes"] for s in saves if "bytes" in s]),
        "startups": startups,
        "saves": saves,
        "reloads": reloads,
        "errors": errors,
        "cycles": cycles,
        "summaries": summaries,
        "note": ("Timing is reported, not judged: no frozen requirement bounds save or reload, "
                 "and this script does not invent a threshold. Not acceptance evidence on a debug build."),
    }

    os.makedirs(args.out_dir, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y%m%dT%H%M%S%z")
    path = os.path.join(args.out_dir, f"a8_save_reload_{stamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"  startups          {len(startups)}   saves {len(saves)}   reloads {len(reloads)} "
          f"(cold {detail.get('reloads_cold', 0)}, warm {detail.get('reloads_warm', 0)})   "
          f"cycles {len(cycles)}   errors {len(errors)}")
    for s in saves:
        print(f"  save              {s.get('bytes')} B ({s.get('ratio')}x of raw) in {s.get('save_ms')} ms "
              f"· rle {s.get('rle_ms')} sha {s.get('sha_ms')} json {s.get('json_ms')} write {s.get('write_ms')} "
              f"· {s.get('edited_slices')} edited slices")
    for r in reloads:
        print(f"  reload {'COLD' if r.get('cold') else 'warm'}       {r.get('verified')}/{r.get('nz')} verified "
              f"· volume hash {'match' if r.get('volume_sha256_match') else 'MISMATCH'} "
              f"· {r.get('reload_ms')} ms")
    print(f"  A8 from log       {verdict} — {why}")
    try:
        shown = os.path.relpath(path, os.getcwd())
    except ValueError:
        shown = path
    print(f"\n  written           {shown}")
    print("  Fill operator, device and build_type by hand. Not acceptance evidence on a debug build.")
    return 0 if verdict != FAIL else 1


if __name__ == "__main__":
    raise SystemExit(main())
