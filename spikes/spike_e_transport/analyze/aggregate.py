#!/usr/bin/env python3
"""
Turn Spike E raw timing records into distributions.

THROWAWAY SPIKE CODE under spikes/spike_e_transport/. Not production.

    "Aggregation script producing p50/p95/max distributions - not hand-typed
     summaries."                                 -- SPIKE_E_TRANSPORT/TASK.md
    "Latency spread reported, not only a median" -- criterion E8

Rules this script will not bend:

  * No outlier removal. Cellular variation IS the measurement; dropping the
    tail deletes the answer to E8.
  * Nearest-rank percentiles, no interpolation - the same definition Spike A's
    harness uses, so the two are comparable.
  * A run labelled lan-diagnostic is reported with that label on every line and
    is never folded into an acceptance summary.
  * Mixing direct and relayed samples into one distribution is refused. E12
    requires the connection type recorded for every measurement, and averaging
    across it hides the thing it was recorded for.
  * Failed requests are counted and reported. A p95 computed only over the
    requests that succeeded, on a link that dropped a third of them, is a lie
    with a decimal point.
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict

NFR_PERF_001_MS = 200      # p95 target for slice navigation

# Above this share of failed requests a distribution stops describing the link
# and starts describing the subset that happened to survive. Not a spec number;
# a harness guard, stated so it can be argued with.
MAX_FAIL_RATE = 0.05


def nearest_rank(sorted_vals: list[float], p: int):
    if not sorted_vals:
        return None
    k = max(1, min(len(sorted_vals), -(-p * len(sorted_vals) // 100)))
    return sorted_vals[k - 1]


def summarise(values: list[float]) -> dict:
    v = sorted(values)
    return {
        "n": len(v),
        "min": round(v[0], 2),
        "p50": round(nearest_rank(v, 50), 2),
        "p90": round(nearest_rank(v, 90), 2),
        "p95": round(nearest_rank(v, 95), 2),
        "p99": round(nearest_rank(v, 99), 2),
        "max": round(v[-1], 2),
    }


def load(path: str):
    """Read a run file, tolerating the way real runs end.

    A cellular run stops when the phone dies or the operator hits Ctrl-C, which
    leaves the last line half-written. The first version called json.loads with
    no guard and died with a JSONDecodeError traceback instead of saying the
    run was incomplete.
    """
    header, samples, truncated = None, [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                truncated += 1
                continue
            if rec.get("record_type") == "run_header":
                header = rec
            elif rec.get("record_type") == "sample":
                samples.append(rec)
    if truncated:
        print(f"  {os.path.basename(path)}: {truncated} unparseable line(s) skipped - the run "
              f"ended mid-write. Samples before that point are still valid.")
    return header, samples


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="one or more e_transport_*.jsonl")
    ap.add_argument("--out", help="write the summary as JSON here")
    args = ap.parse_args()

    headers, samples = [], []
    for path in args.files:
        h, s = load(path)
        if h is None:
            print(f"  {path}: no run header. Refusing to summarise an unlabelled run —")
            print("  without --path and --connection there is no way to tell diagnostic")
            print("  data from acceptance data.")
            return 2
        headers.append((path, h))
        samples.extend(s)

    if not samples:
        print("  No sample records found. Nothing is written.")
        print("  An empty run is not a measurement of zero; it means the run did not happen.")
        return 1

    paths = {h["measurement_path"] for _, h in headers}
    conns = {h["overlay_connection"] for _, h in headers}
    if len(paths) > 1:
        print(f"  Refusing to merge runs across measurement paths: {sorted(paths)}")
        print("  E1 keeps LAN runs out of the acceptance dataset; merging defeats that.")
        return 2
    if len(conns) > 1:
        print(f"  Refusing to merge direct and relayed samples: {sorted(conns)}")
        print("  E12 requires the connection type per measurement. Summarise separately,")
        print("  then compare — that comparison is part of what E12 is for.")
        return 2

    path_kind = paths.pop()
    connection = conns.pop()
    acceptance = path_kind == "cellular-overlay"

    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for s in samples:
        groups[(s["criterion"], s["scenario"])].append(s)

    print()
    print(f"  path        {path_kind}" + ("" if acceptance else "   <-- DIAGNOSTIC ONLY"))
    print(f"  connection  {connection}")
    print(f"  operators   {', '.join(sorted({h['operator'] for _, h in headers}))}")
    print(f"  runs        {len(headers)}   samples {len(samples)}")
    print()

    head = (f"  {'crit':<5} {'scenario':<20} {'n':>4} {'fail':>4} {'KB':>8} "
            f"{'p50':>8} {'p95':>8} {'max':>8}  {'srv p50':>8}")
    print(head)
    print("  " + "-" * (len(head) - 2))

    report: dict = {
        "measurement_path": path_kind,
        "overlay_connection": connection,
        "is_acceptance_evidence": acceptance,
        "percentile_definition": "nearest-rank, no interpolation, no outlier removal",
        "source_files": [os.path.basename(p) for p, _ in headers],
        "scenarios": {},
    }

    for (criterion, scenario) in sorted(groups):
        rows = groups[(criterion, scenario)]
        ok = [r for r in rows if r.get("ok")]
        fails = len(rows) - len(ok)
        if not ok:
            print(f"  {criterion:<5} {scenario:<20} {len(rows):>4} {fails:>4} "
                  f"{'—':>8} {'—':>8} {'—':>8} {'—':>8}  {'—':>8}   all requests failed")
            report["scenarios"][f"{criterion}:{scenario}"] = {
                "criterion": criterion, "scenario": scenario,
                "requests": len(rows), "failed": fails,
                "total_ms": None,
                "note": "every request failed; no distribution exists",
            }
            continue

        # #25: the docstring above names this exact lie - "a p95 computed only
        # over the requests that succeeded, on a link that dropped a third of
        # them, is a lie with a decimal point" - and the first version then told
        # it. The p95 is still computed over successes, because a failed request
        # has no latency, but the failure rate now travels WITH the number
        # everywhere it is printed or written, and a run that lost too much is
        # not reported as a clean result.
        total = summarise([r["ms_total"] for r in ok])
        fail_rate = fails / len(rows) if rows else 0.0
        total["failed"] = fails
        total["failure_rate"] = round(fail_rate, 4)
        total["distribution_is_representative"] = fail_rate <= MAX_FAIL_RATE
        srv = [r["server_handling_ms"] for r in ok
               if isinstance(r.get("server_handling_ms"), (int, float))
               and r["server_handling_ms"] == r["server_handling_ms"]]
        srv_s = summarise(srv) if srv else None
        kb = sum(r["bytes"] for r in ok) / len(ok) / 1024.0

        flag = "" if total["distribution_is_representative"] else \
            f"   <-- {fail_rate * 100:.0f}% FAILED, distribution not representative"
        print(f"  {criterion:<5} {scenario:<20} {total['n']:>4} {fails:>4} {kb:>8.1f} "
              f"{total['p50']:>8.1f} {total['p95']:>8.1f} {total['max']:>8.1f}  "
              f"{(srv_s['p50'] if srv_s else float('nan')):>8.2f}{flag}")

        report["scenarios"][f"{criterion}:{scenario}"] = {
            "criterion": criterion,
            "scenario": scenario,
            "requests": len(rows),
            "failed": fails,
            "mean_payload_kb": round(kb, 2),
            "total_ms": total,
            "server_handling_ms": srv_s,
            "network_and_transfer_ms": summarise(
                [r["ms_network_and_transfer"] for r in ok
                 if "ms_network_and_transfer" in r]) if any(
                "ms_network_and_transfer" in r for r in ok) else None,
        }

    # E4 / NFR-PERF-001 - the one threshold this spike can check directly.
    print()
    # #26: this section used to vanish silently when every E4 request failed -
    # precisely when the target is most violated. An E4 scenario that produced
    # no successful request is now REPORTED as unanswerable rather than omitted.
    all_e4 = {k: v for k, v in report["scenarios"].items() if v["criterion"] == "E4"}
    if all_e4:
        print(f"  NFR-PERF-001 — p95 <= {NFR_PERF_001_MS} ms for slice navigation (E4):")
        by_scenario = {}
        for name, v in sorted(all_e4.items()):
            t = v.get("total_ms")
            if not t:
                print(f"    {name:<20} NOT ANSWERABLE — all {v['requests']} requests failed")
                by_scenario[name] = None
                continue
            p95 = t["p95"]
            verdict = "within target" if p95 <= NFR_PERF_001_MS else "EXCEEDS TARGET"
            if not t["distribution_is_representative"]:
                verdict += (f"  (but {t['failure_rate'] * 100:.0f}% of requests failed - "
                            f"this p95 describes the survivors, not the link)")
            print(f"    {name:<20} p95 {p95:>8.1f} ms   {verdict}")
            by_scenario[name] = p95
        report["nfr_perf_001"] = {"target_ms": NFR_PERF_001_MS, "by_scenario": by_scenario}
    else:
        print("  NFR-PERF-001 — no E4 navigation scenario in this run, so the 200 ms target")
        print("  was not exercised at all.")

    print()
    if not acceptance:
        print("  THIS RUN IS DIAGNOSTIC ONLY.")
        print("  TASK.md: 'DO NOT use same-LAN measurements as the acceptance evidence for")
        print("  this spike.' Useful for isolating network cost from server cost. Not E1.")
    else:
        print("  Labelled as acceptance evidence. It is evidence only if the path really was")
        print("  Galaxy A17 -> real cellular -> ZeroTier overlay -> remote Mac mini M2,")
        print("  and only the operator can attest to that.")
    print()
    print("  E10 (a proposed first-load budget) and E13 (the strategy recommendation) are")
    print("  the owner's written conclusions. This script supplies their inputs; it does")
    print("  not draw them.")

    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(report, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"\n  wrote  {args.out}")

    # #27: the first version returned 0 for a run that lost 46 of 57 requests.
    # A summary of a catastrophically incomplete run must not look like success
    # to whoever is reading the exit code.
    unrepresentative = [k for k, v in report["scenarios"].items()
                        if v.get("total_ms") and
                        not v["total_ms"]["distribution_is_representative"]]
    dead = [k for k, v in report["scenarios"].items() if not v.get("total_ms")]
    overall_fail = sum(v["failed"] for v in report["scenarios"].values())
    overall_n = sum(v["requests"] for v in report["scenarios"].values())
    report["run_quality"] = {
        "requests": overall_n, "failed": overall_fail,
        "failure_rate": round(overall_fail / overall_n, 4) if overall_n else None,
        "scenarios_with_no_successful_request": dead,
        "scenarios_above_max_fail_rate": unrepresentative,
        "max_fail_rate_used": MAX_FAIL_RATE,
    }
    if dead or unrepresentative:
        print()
        print(f"  RUN QUALITY: {overall_fail} of {overall_n} requests failed "
              f"({overall_fail / overall_n * 100:.0f}%).")
        if dead:
            print(f"    no successful request at all: {', '.join(sorted(dead))}")
        if unrepresentative:
            print(f"    above the {MAX_FAIL_RATE * 100:.0f}% threshold: "
                  f"{', '.join(sorted(unrepresentative))}")
        print("  Exiting non-zero. These numbers describe the requests that survived, not the")
        print("  link, and they are not acceptance evidence in this state.")
        print()
        return 1
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
