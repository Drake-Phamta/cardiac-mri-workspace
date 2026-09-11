#!/usr/bin/env python3
"""
Turn measured step times into a calendar verdict — criteria C0-7 and C0-8.

THROWAWAY SPIKE CODE under spikes/spike_c_ml/. Not production.

C0-7 asks for a PRELIMINARY per-run wall-clock extrapolation with the method
shown. C0-8 asks for a preliminary calendar verdict on the experiment matrix
with the arithmetic shown. "With the method shown" and "arithmetic shown" are
the operative phrases: this script prints every intermediate number so the
verdict can be checked by hand rather than trusted.

    "Preliminary per-run wall-clock extrapolation, method shown, explicitly
     labelled preliminary."                              -- C0-7
    "Preliminary calendar verdict on 6 runs + 1 ablation, arithmetic shown."
                                                         -- C0-8

IT CONSUMES MEASUREMENTS, IT DOES NOT PRODUCE THEM
    Input is a c0_probe_*.json written by harness/probe.py on the owner's real
    compute. If that file does not exist, this script exits rather than
    inventing a step time. TASK.md forbids fabricating "any calendar figure
    derived from unmeasured timings" by name.

WHAT MAKES THE ESTIMATE PRELIMINARY, STATED EVERY TIME IT RUNS
    1  The step time came from SYNTHETIC volumes at a PLACEHOLDER shape. The
       real cohort shape is Spike D criterion A6.
    2  The epoch count is an ASSUMPTION, not a measurement. Convergence is C1-6
       and needs real data; synthetic input cannot establish it.
    3  Data loading, augmentation, validation passes and checkpointing are not
       in the measured step time. The multiplier for them is an assumption too,
       and is printed as a separate line rather than buried.
    4  Nothing here accounts for the machine being shared, thermally throttled,
       or unavailable overnight.

    An estimate whose assumptions are invisible is a guess wearing a number.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# The experiment matrix from the spike task: 6 runs plus 1 ablation.
DEFAULT_RUNS = 6
DEFAULT_ABLATIONS = 1


def fmt_hours(h: float) -> str:
    if h < 1:
        return f"{h * 60:.0f} min"
    if h < 48:
        return f"{h:.1f} h"
    return f"{h / 24:.1f} days"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("probe_json", help="a c0_probe_*.json produced by harness/probe.py")
    ap.add_argument("--variant", help="which variant to extrapolate (default: each in turn)")
    ap.add_argument("--train-cases", type=int, default=80,
                    help="cases in the training partition (Path A default; DR-002 decides)")
    ap.add_argument("--slices-per-case", type=int, default=88,
                    help="ASSUMPTION unless Spike D A6 says otherwise")
    ap.add_argument("--epochs", type=int, default=50,
                    help="ASSUMPTION. Convergence is C1-6 and needs real data")
    ap.add_argument("--overhead-factor", type=float, default=1.35,
                    help="ASSUMPTION: data loading, augmentation, validation, checkpointing")
    ap.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    ap.add_argument("--ablations", type=int, default=DEFAULT_ABLATIONS)
    ap.add_argument("--hours-per-day", type=float, default=8.0,
                    help="ASSUMPTION: usable compute hours per calendar day")
    ap.add_argument("--out", help="write the extrapolation as JSON here")
    args = ap.parse_args()

    if not os.path.exists(args.probe_json):
        print(f"\n  No probe file at {args.probe_json}")
        print("  Run harness/probe.py on the real compute first.")
        print("  This script will not invent a step time. TASK.md forbids fabricating any")
        print("  calendar figure derived from unmeasured timings, by name.\n")
        return 2

    with open(args.probe_json, encoding="utf-8") as f:
        probe = json.load(f)

    batch = probe["input_shape"][0]
    variants = [r for r in probe["results"] if "train_step" in r]
    if args.variant:
        variants = [r for r in variants if r["variant"] == args.variant]
    if not variants:
        print("  No usable variant in that probe file (every one failed to run).")
        return 1

    slices_total = args.train_cases * args.slices_per_case
    steps_per_epoch = -(-slices_total // batch)          # ceil

    print()
    print("  " + "=" * 74)
    print("  C0-7 / C0-8 — PRELIMINARY extrapolation. Every input is shown.")
    print("  " + "=" * 74)
    print()
    print(f"  operator            {probe.get('operator')}")
    print(f"  compute             {probe['compute'].get('gpu_name')}  "
          f"({probe['device_used']})")
    print(f"  probe input         {probe['input_shape']}   SYNTHETIC, placeholder shape")
    print()
    print("  MEASURED (from the probe, on real hardware)")
    print(f"    batch size                      {batch}")
    print()
    print("  ASSUMED (not measured — change these and the verdict changes)")
    print(f"    training cases                  {args.train_cases}"
          f"      <- Path A default; DR-002 decides")
    print(f"    slices per case                 {args.slices_per_case}"
          f"      <- until Spike D A6 says otherwise")
    print(f"    epochs to convergence           {args.epochs}"
          f"      <- NOT measurable on synthetic data; this is C1-6")
    print(f"    overhead factor                 {args.overhead_factor}"
          f"    <- loading, augmentation, validation, checkpointing")
    print(f"    usable compute hours per day    {args.hours_per_day}")
    print(f"    runs x ablations                {args.runs} + {args.ablations}")
    print()
    print("  ARITHMETIC")
    print(f"    slices_total    = {args.train_cases} cases x {args.slices_per_case} slices"
          f" = {slices_total:,}")
    print(f"    steps_per_epoch = ceil({slices_total:,} / {batch}) = {steps_per_epoch:,}")
    print()

    head = (f"  {'variant':<30} {'ms/step':>9} {'h/epoch':>9} {'h/run':>10} "
            f"{'matrix':>12} {'calendar':>12}")
    print(head)
    print("  " + "-" * (len(head) - 2))

    rows = []
    for v in variants:
        ms = v["train_step"]["ms_median"]
        h_epoch = steps_per_epoch * ms / 1000.0 / 3600.0
        h_run = h_epoch * args.epochs * args.overhead_factor
        h_matrix = h_run * (args.runs + args.ablations)
        days = h_matrix / args.hours_per_day
        rows.append({
            "variant": v["variant"],
            "measured_ms_per_train_step": ms,
            "hours_per_epoch": round(h_epoch, 3),
            "hours_per_run": round(h_run, 2),
            "hours_full_matrix": round(h_matrix, 2),
            "calendar_days_at_given_hours": round(days, 2),
        })
        print(f"  {v['variant']:<30} {ms:>9.1f} {h_epoch:>9.2f} {h_run:>10.1f} "
              f"{fmt_hours(h_matrix):>12} {days:>10.1f} d")

    print()
    best = min(rows, key=lambda r: r["calendar_days_at_given_hours"])
    worst = max(rows, key=lambda r: r["calendar_days_at_given_hours"])
    print(f"  Cheapest variant: {best['variant']} — "
          f"{best['calendar_days_at_given_hours']:.1f} calendar days for the full matrix")
    print(f"  Dearest variant:  {worst['variant']} — "
          f"{worst['calendar_days_at_given_hours']:.1f} calendar days")
    print()
    print("  C0-8 PRELIMINARY VERDICT")
    print(f"    Fits a 30-day project only if the matrix is run on the cheapest variant AND")
    print(f"    the assumptions above hold. At {args.epochs} epochs and overhead "
          f"{args.overhead_factor}x, the")
    print(f"    spread across variants is {best['calendar_days_at_given_hours']:.1f} to "
          f"{worst['calendar_days_at_given_hours']:.1f} days — the architecture choice")
    print("    dominates the schedule, not the hardware.")
    print()
    print("  WHY THIS IS PRELIMINARY, NOT A PLAN")
    print("    - step time measured on SYNTHETIC volumes at a PLACEHOLDER shape (Spike D A6)")
    print("    - epoch count is an assumption; convergence is C1-6 and needs real data")
    print("    - overhead factor is an assumption, not a measurement")
    print("    - no allowance for a shared, throttled or unavailable machine")
    print()
    print("  C0-10: none of this closes GATE-ML-01. DR-007 forbids closing it on C0 alone.")
    print()

    if args.out:
        payload = {
            "criteria": ["C0-7", "C0-8"],
            "label": "PRELIMINARY",
            "source_probe": os.path.basename(args.probe_json),
            "operator": probe.get("operator"),
            "measured": {"batch_size": batch,
                         "device": probe["device_used"],
                         "compute": probe["compute"].get("gpu_name")},
            "assumptions": {
                "train_cases": args.train_cases,
                "slices_per_case": args.slices_per_case,
                "epochs": args.epochs,
                "overhead_factor": args.overhead_factor,
                "usable_hours_per_day": args.hours_per_day,
                "runs": args.runs, "ablations": args.ablations,
            },
            "derived": {"slices_total": slices_total, "steps_per_epoch": steps_per_epoch},
            "by_variant": rows,
            "c0_10_statement": "Does NOT close GATE-ML-01. DR-007 forbids it on C0 evidence alone.",
            "invalidated_by": ("Spike D criterion A6 reporting a different cohort shape, or C1-6 "
                               "showing convergence needs a different epoch count."),
        }
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"  wrote  {args.out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
