#!/usr/bin/env python3
"""
Spike E client harness — instrumented transport measurement.

THROWAWAY SPIKE CODE under spikes/spike_e_transport/. Not production.

Emits one machine-readable record per request so the distribution survives, not
just a summary. TASK.md requires exactly that:

    "Instrumented client harness producing machine-readable timing logs,
     re-runnable by the reviewer."
    "Aggregation script producing p50/p95/max distributions - not hand-typed
     summaries."

TWO FLAGS ARE MANDATORY, AND THE HARNESS REFUSES TO RUN WITHOUT THEM
--------------------------------------------------------------------
--path         cellular-overlay | lan-diagnostic
--connection   direct | relayed

Neither is discoverable from inside this process, and both are acceptance
conditions:

    E1   "All acceptance measurements taken over real cellular + overlay -
          LAN runs labelled diagnostic only"
    E12  "Direct-vs-relayed overlay connection recorded for EVERY measurement"

Defaulting either one would let a LAN run wearing no label drift into the
acceptance dataset. TASK.md is blunt about the consequence: "LAN measurements
presented as acceptance evidence -> Evidence rejected".

Find the connection type with:  zerotier-cli peers

WHO RUNS IT
    The operator named by --operator physically runs the Galaxy A17 over real
    cellular against the Mac mini. The --owner is Nguyễn Gia Đức Trung: he
    owns the criteria, interprets the run and writes E10/E13. If Trung runs
    the phone himself, both fields may contain his name.

Usage:
    python harness.py --base http://10.x.x.x:8787 \
        --path cellular-overlay --connection direct \
        --operator "Pham Tuan Anh" --owner "Nguyen Gia Duc Trung" --slices 88
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")

_CTX = ssl.create_default_context()


def _get(url: str, timeout: float = 60.0) -> dict:
    """One request. Records wall-clock, server handling time, and byte count.

    time_to_first_byte is separated from total because the strategies differ in
    where their cost sits: a whole-volume download and a small PNG can share a
    total while being completely different experiences on a phone.
    """
    started = time.perf_counter()
    record: dict = {"url": url}
    try:
        req = urllib.request.Request(url, headers={"Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as resp:
            first = time.perf_counter()
            body = resp.read()
            done = time.perf_counter()
            record.update({
                "ok": True,
                "status": resp.status,
                "bytes": len(body),
                "ms_total": round((done - started) * 1000.0, 3),
                "ms_to_first_byte": round((first - started) * 1000.0, 3),
                "server_handling_ms": float(resp.headers.get("X-Server-Handling-Ms", "nan")),
                "strategy": resp.headers.get("X-Strategy"),
            })
            # Network time is total minus what the server says it spent. Stated
            # explicitly rather than left for the reader to subtract.
            if record["server_handling_ms"] == record["server_handling_ms"]:   # not NaN
                record["ms_network_and_transfer"] = round(
                    record["ms_total"] - record["server_handling_ms"], 3)
    except urllib.error.HTTPError as exc:
        record.update({"ok": False, "status": exc.code, "error": f"HTTP {exc.code}",
                       "ms_total": round((time.perf_counter() - started) * 1000.0, 3)})
    except Exception as exc:
        record.update({"ok": False, "status": None, "error": f"{type(exc).__name__}: {exc}",
                       "ms_total": round((time.perf_counter() - started) * 1000.0, 3)})
    return record


def scenarios(base: str, slices: int, window_radius: int) -> list[tuple[str, str, str]]:
    """(scenario, criterion, url) triples.

    Named after the criteria they feed, so a record can never be attributed to
    a criterion it did not measure.
    """
    mid = slices // 2
    out: list[tuple[str, str, str]] = []

    # E2 - time to first usable slice on a cold case open, per strategy
    out.append(("cold_open_s1", "E2", f"{base}/s1/slice/{mid:d}.png"))
    out.append(("cold_open_s3", "E2", f"{base}/s3/volume.raw"))
    out.append(("cold_open_s4", "E2", f"{base}/s4/window?z={mid}&radius={window_radius}"))

    # E3 - uncached slice request latency, per strategy. Spread across the stack
    # so caching anywhere in the path shows up as an outlier rather than hiding.
    step = max(1, slices // 12)
    for z in range(0, slices, step):
        out.append(("uncached_slice_s1", "E3", f"{base}/s1/slice/{z}.png"))

    # E4 - continuous navigation against NFR-PERF-001's 200 ms p95
    for z in range(mid, min(slices, mid + 20)):
        out.append(("navigate_s1", "E4", f"{base}/s1/slice/{z}.png"))
    for z in range(mid, min(slices, mid + 20), max(1, window_radius * 2 + 1)):
        out.append(("navigate_s4", "E4", f"{base}/s4/window?z={z}&radius={window_radius}"))

    # E5 - representative mask/overlay transport cost
    for z in range(0, slices, step):
        out.append(("mask_s2", "E5", f"{base}/s2/mask/{z}.bin"))

    # E6 - mesh transport cost per decimation level available
    for level in range(4):
        out.append((f"mesh_level_{level}", "E6", f"{base}/mesh/{level}.obj"))

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="stub base URL, e.g. http://10.x.x.x:8787")
    ap.add_argument("--path", required=True, choices=["cellular-overlay", "lan-diagnostic"],
                    help="E1: acceptance evidence requires cellular-overlay")
    ap.add_argument("--connection", required=True, choices=["direct", "relayed"],
                    help="E12: required for EVERY measurement. Find it with: zerotier-cli peers")
    ap.add_argument("--operator", required=True, help="device operator who physically ran this")
    ap.add_argument("--owner", required=True,
                    help="owner who designed and interprets the measurement (DR-006a)")
    ap.add_argument("--slices", type=int, default=88)
    ap.add_argument("--window-radius", type=int, default=2)
    ap.add_argument("--repeats", type=int, default=3,
                    help="E8 wants a spread, not a median; one pass is not a distribution")
    ap.add_argument("--note", default="", help="cellular signal conditions, location, time of day")
    args = ap.parse_args()

    plan = scenarios(args.base.rstrip("/"), args.slices, args.window_radius)
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(EVIDENCE, exist_ok=True)
    out_path = os.path.join(EVIDENCE, f"e_transport_{stamp}.jsonl")

    header = {
        "record_type": "run_header",
        "captured_at": stamp,
        "operator": args.operator,
        "owner": args.owner,
        "base": args.base,
        "measurement_path": args.path,
        "overlay_connection": args.connection,
        "repeats": args.repeats,
        "conditions_note": args.note,
        "is_acceptance_evidence": args.path == "cellular-overlay",
        "warning": (None if args.path == "cellular-overlay" else
                    "DIAGNOSTIC ONLY. TASK.md: 'DO NOT use same-LAN measurements as the "
                    "acceptance evidence for this spike.' Presenting these as acceptance "
                    "evidence gets the evidence rejected."),
    }

    print()
    print(f"  operator    {args.operator}")
    print(f"  owner       {args.owner}")
    print(f"  path        {args.path}"
          + ("" if args.path == "cellular-overlay" else "   <-- DIAGNOSTIC ONLY"))
    print(f"  connection  {args.connection}    (E12)")
    print(f"  requests    {len(plan)} x {args.repeats} repeats")
    print()

    n_ok = n_fail = 0
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(header, ensure_ascii=False) + "\n")
        for rep in range(args.repeats):
            for scenario, criterion, url in plan:
                rec = _get(url)
                rec.update({
                    "record_type": "sample",
                    "repeat": rep,
                    "scenario": scenario,
                    "criterion": criterion,
                    "measurement_path": args.path,
                    "overlay_connection": args.connection,
                    "operator": args.operator,
                    "owner": args.owner,
                })
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                if rec["ok"]:
                    n_ok += 1
                else:
                    n_fail += 1
                    print(f"  FAIL {scenario:20s} {rec.get('error')}")
            print(f"  repeat {rep + 1}/{args.repeats} done")

    print()
    print(f"  {n_ok} ok, {n_fail} failed")
    print(f"  wrote  {os.path.relpath(out_path, ROOT)}")
    print()
    if n_ok == 0:
        print("  No successful request. Nothing here is a measurement of anything.")
        print("  Check the stub is running and the overlay address is reachable.")
        print()
        return 1
    print("  Summarise with:  python ../analyze/aggregate.py " +
          os.path.relpath(out_path, os.path.join(ROOT, "analyze")))
    if args.path != "cellular-overlay":
        print()
        print("  REMINDER: this run is labelled lan-diagnostic. It is useful for isolating")
        print("  whether a bottleneck is the network or the server. It is NOT E1 evidence.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
