#!/usr/bin/env python3
"""
Reconnect / retry characterisation — criterion E9.

THROWAWAY SPIKE CODE under spikes/spike_e_transport/. Not production.

E9 asks for reconnect/retry behaviour to be CHARACTERISED for the canonical
demo, and the measurements table asks for "Reconnect time after link loss".
The spec prescribes no backoff policy, no retry count, no timeout - so this
harness does not invent one and present it as the answer. It measures a stated
policy and reports what happened, leaving the policy itself as a recommendation
the owner makes in E13.

WHAT IT MEASURES
    1  Steady-state probe latency, so a degraded link is distinguishable from
       a dropped one.
    2  Time from link loss to first successful request after recovery, which is
       the number E9 actually names.
    3  How many attempts the stated backoff policy spends getting there.

HOW LINK LOSS IS PRODUCED
    By you, physically: turn off mobile data, walk into a lift, leave overlay
    coverage. The harness cannot cut the link and must not pretend to - a
    simulated outage measures the simulator. It polls, detects the outage,
    detects recovery, and timestamps both.

    A run where no outage occurred is reported as "no outage observed", never
    as a reconnect time of zero.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")


def probe(url: str, timeout: float) -> tuple[bool, float, str | None]:
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            resp.read(64)
            return True, (time.perf_counter() - t0) * 1000.0, None
    except urllib.error.HTTPError as exc:
        return False, (time.perf_counter() - t0) * 1000.0, f"HTTP {exc.code}"
    except Exception as exc:
        return False, (time.perf_counter() - t0) * 1000.0, f"{type(exc).__name__}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--path", required=True, choices=["cellular-overlay", "lan-diagnostic"])
    ap.add_argument("--connection", required=True, choices=["direct", "relayed"])
    ap.add_argument("--operator", required=True)
    ap.add_argument("--duration", type=int, default=300, help="seconds to observe")
    ap.add_argument("--interval", type=float, default=1.0, help="seconds between probes")
    ap.add_argument("--timeout", type=float, default=5.0, help="per-probe timeout, seconds")
    ap.add_argument("--backoff", default="0.5,1,2,4,8",
                    help="stated retry backoff in seconds; measured, not recommended")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    url = args.base.rstrip("/") + "/health"
    backoff = [float(v) for v in args.backoff.split(",")]
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(EVIDENCE, exist_ok=True)
    out = os.path.join(EVIDENCE, f"e_reconnect_{stamp}.jsonl")

    print()
    print(f"  probing {url} every {args.interval}s for {args.duration}s")
    print(f"  backoff policy under test: {backoff} seconds")
    print()
    print("  Cut the link when you are ready - turn off mobile data, or walk out of")
    print("  coverage. The harness will timestamp the outage and the recovery.")
    print()

    samples: list[dict] = []
    outages: list[dict] = []
    current: dict | None = None
    attempts_in_outage = 0
    end = time.time() + args.duration
    was_up: bool | None = None

    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps({
            "record_type": "run_header", "captured_at": stamp, "operator": args.operator,
            "base": args.base, "measurement_path": args.path,
            "overlay_connection": args.connection, "backoff_policy_s": backoff,
            "probe_interval_s": args.interval, "probe_timeout_s": args.timeout,
            "conditions_note": args.note,
            "is_acceptance_evidence": args.path == "cellular-overlay",
            "criterion": "E9 - reconnect/retry behaviour",
        }, ensure_ascii=False) + "\n")

        while time.time() < end:
            ok, ms, err = probe(url, args.timeout)
            now = time.time()
            rec = {"record_type": "probe", "t": now, "ok": ok,
                   "ms": round(ms, 2), "error": err}
            samples.append(rec)
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            if was_up is None:
                print("  link is " + ("UP" if ok else "DOWN") + " at start")
            elif was_up and not ok:
                current = {"down_at": now, "attempts": 0}
                attempts_in_outage = 0
                print(f"  {time.strftime('%H:%M:%S')}  link DOWN ({err})")
            elif (not was_up) and ok:
                if current:
                    current["up_at"] = now
                    current["reconnect_seconds"] = round(now - current["down_at"], 3)
                    current["attempts"] = attempts_in_outage
                    outages.append(current)
                    f.write(json.dumps({"record_type": "outage", **current},
                                       ensure_ascii=False) + "\n")
                    print(f"  {time.strftime('%H:%M:%S')}  link UP again after "
                          f"{current['reconnect_seconds']}s, {attempts_in_outage} attempt(s)")
                    current = None
            was_up = ok

            if not ok:
                attempts_in_outage += 1
                delay = backoff[min(attempts_in_outage - 1, len(backoff) - 1)]
            else:
                delay = args.interval
            time.sleep(delay)

        up = [s for s in samples if s["ok"]]
        summary = {
            "record_type": "summary",
            "probes": len(samples),
            "successful": len(up),
            "availability_fraction": round(len(up) / len(samples), 4) if samples else None,
            "steady_state_ms_median": (sorted(s["ms"] for s in up)[len(up) // 2]
                                       if up else None),
            "outages_observed": len(outages),
            "reconnect_seconds": [o["reconnect_seconds"] for o in outages],
            "unresolved_outage_at_end": bool(current),
            "note": ("No outage was observed during this run. That is not a reconnect time "
                     "of zero - it means the link never dropped while the harness watched."
                     if not outages else None),
        }
        f.write(json.dumps(summary, ensure_ascii=False) + "\n")

    print()
    print(f"  probes {summary['probes']}, up {summary['successful']} "
          f"({(summary['availability_fraction'] or 0) * 100:.1f}%)")
    print(f"  outages observed: {summary['outages_observed']}")
    if summary["reconnect_seconds"]:
        print(f"  reconnect seconds: {summary['reconnect_seconds']}")
    else:
        print("  no outage observed - E9 is NOT answered by this run")
    if summary["unresolved_outage_at_end"]:
        print("  the link was still DOWN when the run ended; that outage has no recovery time")
    print(f"  wrote  {os.path.relpath(out, ROOT)}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
