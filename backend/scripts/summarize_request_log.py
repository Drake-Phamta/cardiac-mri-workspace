#!/usr/bin/env python3
"""Bytes per slice switch, from the backend request log (L4 of NFR-PERF-001).

L4 asks that a slice gesture never transfers a full volume. A "slice switch" is
the run of consecutive requests attributed to one (case_id, slice_index): the
slice metadata calls plus the PNG fetches of its content_url(s). The log
attributes artifact fetches to their case and slice, so the grouping needs no
timing heuristic.

    python backend/scripts/summarize_request_log.py --log <data>/logs/requests.jsonl [--data-cache <data>/data_cache]
        [--since 2026-10-01T12:00:00Z]

Prints the number of switches, bytes per switch (p50 / p95 / max), the largest
single response, and - with the data cache - each case's raw uint8 volume size
and the largest switch as a percentage of it.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def percentile(values: List[int], q: float) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(q * len(ordered)) - 1))]


def switches(lines: List[dict]) -> List[Tuple[str, int, int, int]]:
    """(case_id, slice_index, requests, bytes) for each consecutive run of one slice."""
    runs: List[Tuple[str, int, int, int]] = []
    current: Optional[Tuple[str, int]] = None
    count = total = 0
    for line in lines:
        key = (line.get("case_id"), line.get("slice_index"))
        if key[0] is None or not isinstance(key[1], int):
            continue
        if key != current:
            if current is not None:
                runs.append((current[0], current[1], count, total))
            current, count, total = key, 0, 0
        count += 1
        total += int(line.get("bytes", 0))
    if current is not None:
        runs.append((current[0], current[1], count, total))
    return runs


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--data-cache", type=Path, default=None)
    parser.add_argument("--since", default=None, help="ISO time; only lines at or after it")
    args = parser.parse_args(argv)
    lines = [json.loads(text) for text in args.log.read_text(encoding="utf-8").splitlines() if text.strip()]
    if args.since:
        lines = [line for line in lines if line.get("t", "") >= args.since]
    lines = [line for line in lines if line.get("status") == 200]
    runs = switches(lines)
    if not runs:
        print("no slice-attributed requests in the log")
        return 1
    sizes = [run[3] for run in runs]
    largest = max(lines, key=lambda line: int(line.get("bytes", 0)))
    print(f"slice switches: {len(runs)} over {len({run[0] for run in runs})} case(s)")
    print(f"bytes per switch: p50 {percentile(sizes, 0.5):,}  p95 {percentile(sizes, 0.95):,}  max {max(sizes):,}")
    print(f"largest single response: {int(largest['bytes']):,} bytes ({largest.get('route')}, {largest.get('case_id')} "
          f"slice {largest.get('slice_index')})")
    if args.data_cache:
        worst = max(runs, key=lambda run: run[3])
        case = json.loads((args.data_cache / "cases" / worst[0] / "case.json").read_text(encoding="utf-8"))
        nx, ny, nz = case["shape"]
        volume = nx * ny * nz
        print(f"largest switch {worst[3]:,} bytes = {100.0 * worst[3] / volume:.2f} % of one raw volume of {worst[0]} "
              f"({volume:,} bytes uint8, {nz} slices); L4 holds when every switch stays far below one volume")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
