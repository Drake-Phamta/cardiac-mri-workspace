#!/usr/bin/env python3
"""Bytes per slice switch, from the backend request log (L4 of NFR-PERF-001).

L4 asks that a slice gesture never transfers a full volume. Grouping rules:

- a slice switch starts at a slice-view request (``.../cases/{case_id}/slices/{z}/mri``,
  ``.../ground-truth``, ``.../analysis-runs/{run_id}/slices/{z}/prediction``,
  ``.../reviewed-masks/{id}/slices/{z}``) whose (case_id, slice_index) differs from
  the current switch; run and reviewed-mask ids arrive already resolved to their
  case in the log;
- further slice views and other slice-scoped requests (metrics, error map) of the
  same (case_id, slice_index) join the current switch;
- an artifact fetch (``/artifacts/<sha256>.png``) joins the most recent switch whose
  slice views announced that digest, otherwise the current switch (by sequence).
  An artifact line's own case and slice are never used: identical bytes (an empty
  mask slice) share one digest across slices and cases, and the log marks those
  fetches ``shared``.

Bytes are the response bytes the server counted for each request, summed per switch.

    python backend/scripts/summarize_request_log.py --log <data>/logs/requests.jsonl [--data-cache <data>/data_cache]
        [--since 2026-10-01T12:00:00Z]

Prints the number of switches, bytes per switch (p50 / p95 / max), the largest
single response, how artifact fetches were attached, and - with the data cache -
the largest switch as a percentage of its case's raw uint8 volume.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

VIEW_ROUTE = re.compile(
    r".*/(cases/\{case_id\}/slices/\{slice_index\}/(mri|ground-truth)"
    r"|analysis-runs/\{run_id\}/slices/\{slice_index\}/prediction"
    r"|reviewed-masks/\{reviewed_mask_id\}/slices/\{slice_index\})")
ARTIFACT_ROUTE = re.compile(r".*/artifacts/\{name\}")
LOOKBACK = 16  # switches searched for the one that announced a fetched digest (prefetch tolerance)


class Switch:
    def __init__(self, case_id: str, slice_index: int):
        self.case_id = case_id
        self.slice_index = slice_index
        self.requests = 0
        self.bytes = 0
        self.announced: Set[str] = set()

    @property
    def key(self) -> Tuple[str, int]:
        return self.case_id, self.slice_index

    def add(self, line: Dict[str, Any]) -> None:
        self.requests += 1
        self.bytes += int(line.get("bytes") or 0)


def percentile(values: List[int], q: float) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(q * len(ordered)) - 1))]


def summarize(lines: List[Dict[str, Any]]) -> Tuple[List[Switch], Dict[str, int]]:
    """Group request-log lines (in log order) into slice switches."""
    switches: List[Switch] = []
    current: Optional[Switch] = None
    stats = {"artifacts_by_digest": 0, "artifacts_by_sequence": 0, "artifacts_before_any_switch": 0,
             "artifact_bytes_before_any_switch": 0, "shared_digest_fetches": 0,
             "other_requests": 0, "other_bytes": 0}
    for line in lines:
        route = str(line.get("route") or "")
        if ARTIFACT_ROUTE.fullmatch(route):
            if line.get("shared"):
                stats["shared_digest_fetches"] += 1
            digest = line.get("digest")
            target = next((switch for switch in reversed(switches[-LOOKBACK:])
                           if digest and digest in switch.announced), None)
            if target is not None:
                stats["artifacts_by_digest"] += 1
            elif current is not None:
                target = current
                stats["artifacts_by_sequence"] += 1
            else:
                stats["artifacts_before_any_switch"] += 1
                stats["artifact_bytes_before_any_switch"] += int(line.get("bytes") or 0)
                continue
            target.add(line)
            continue
        case_id, slice_index = line.get("case_id"), line.get("slice_index")
        scoped = isinstance(case_id, str) and isinstance(slice_index, int) and not isinstance(slice_index, bool)
        if scoped and VIEW_ROUTE.fullmatch(route):
            if current is None or current.key != (case_id, slice_index):
                current = Switch(case_id, slice_index)
                switches.append(current)
            current.add(line)
            if line.get("digest"):
                current.announced.add(str(line["digest"]))
            continue
        if scoped and current is not None and current.key == (case_id, slice_index):
            current.add(line)
            continue
        stats["other_requests"] += 1
        stats["other_bytes"] += int(line.get("bytes") or 0)
    return switches, stats


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--data-cache", type=Path, default=None)
    parser.add_argument("--since", default=None, help="ISO time; only lines at or after it")
    args = parser.parse_args(argv)
    lines = [json.loads(text) for text in args.log.read_text(encoding="utf-8").splitlines() if text.strip()]
    if args.since:
        lines = [line for line in lines if line.get("t", "") >= args.since]
    switches, stats = summarize(lines)
    if not switches:
        print("no slice switches in the log")
        return 1
    sizes = [switch.bytes for switch in switches]
    largest = max(lines, key=lambda line: int(line.get("bytes") or 0))
    print(f"slice switches: {len(switches)} over {len({switch.case_id for switch in switches})} case(s), "
          f"{sum(switch.requests for switch in switches)} requests")
    print(f"bytes per switch: p50 {percentile(sizes, 0.5):,}  p95 {percentile(sizes, 0.95):,}  max {max(sizes):,}")
    print(f"largest single response: {int(largest.get('bytes') or 0):,} bytes ({largest.get('route')}, "
          f"case {largest.get('case_id')}, slice {largest.get('slice_index')})")
    print(f"artifact fetches: {stats['artifacts_by_digest']} joined the switch that announced their digest, "
          f"{stats['artifacts_by_sequence']} joined by sequence, {stats['artifacts_before_any_switch']} came before "
          f"any switch ({stats['artifact_bytes_before_any_switch']:,} bytes); "
          f"{stats['shared_digest_fetches']} had a digest shared by several slices")
    print(f"other requests (not slice-scoped): {stats['other_requests']} ({stats['other_bytes']:,} bytes)")
    if args.data_cache:
        worst = max(switches, key=lambda switch: switch.bytes)
        case = json.loads((args.data_cache / "cases" / worst.case_id / "case.json").read_text(encoding="utf-8"))
        nx, ny, nz = case["shape"]
        volume = nx * ny * nz
        print(f"largest switch {worst.bytes:,} bytes ({worst.case_id} slice {worst.slice_index}) = "
              f"{100.0 * worst.bytes / volume:.2f} % of one raw volume ({volume:,} bytes uint8, {nz} slices); "
              f"L4 holds when every switch stays far below one volume")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
