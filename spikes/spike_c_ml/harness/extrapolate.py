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
    1  The step time came from SYNTHETIC volumes - at the cohort's dtype and
       in-plane sizes (Spike D A6), resized to the probe's model input - on one
       machine, in one run.
    2  The epoch count is an ASSUMPTION, not a measurement. Convergence is C1-6
       and needs real data; synthetic input cannot establish it.
    3  Data loading, augmentation, validation passes and checkpointing are not
       in the measured step time. The multiplier for them is an assumption too,
       and is printed as a separate line rather than buried.
    4  Nothing here accounts for the machine being shared, thermally throttled,
       or unavailable overnight.

    An estimate whose assumptions are invisible is a guess wearing a number.

THE VERDICT IS AGAINST THE REMAINING CALENDAR (revision 3, 2026-09-14)
    Revision 2 compared the matrix with "a 30-day project" and concluded that
    "the architecture choice dominates the schedule, not the hardware". The
    PR #17 review (point 5) rejected both: the project has a fixed calendar
    with days already spent, and one run on one machine cannot say anything
    about other hardware. The budget is now
        GPU hours available = days in the training window x GPU hours per day
    with the window, the hours and the arithmetic printed, and each variant is
    judged FITS / DOES NOT FIT against that budget - nothing wider.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

# The experiment matrix from the spike task: 6 runs plus 1 ablation.
DEFAULT_RUNS = 6
DEFAULT_ABLATIONS = 1

# Project calendar, from management/PROJECT_STATE.yaml (Day 0 = 2026-09-09, Day 30 fixed).
DAY0 = dt.date(2026, 9, 9)
# The matrix cannot start before GATE-ML-01 closes (M4: SPIKE_C1 accepted, Day 8-12) and
# must be complete by M6 (experiment matrix complete, Day 12-22).
DEFAULT_WINDOW_START = DAY0 + dt.timedelta(days=12)     # 2026-09-21, end of M4
DEFAULT_DEADLINE = DAY0 + dt.timedelta(days=22)         # 2026-10-01, end of M6

# Spike D A6 (PR #25): in-plane sizes and case counts of the cohort.
COHORT_INPLANE = [(576, 69), (640, 85)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("probe_json", help="a c0_probe_*.json produced by harness/probe.py")
    ap.add_argument("--variant", help="which variant to extrapolate (default: each in turn)")
    ap.add_argument("--train-cases", type=int, default=80,
                    help="cases in the training partition: 80, because DR-002 was decided as "
                         "Path A on 2026-09-14 (80 train / 20 validation / 54 locked holdout)")
    ap.add_argument("--slices-per-case", type=int, default=88,
                    help="88, measured by Spike D A6 for every case")
    ap.add_argument("--epochs", type=int, default=50,
                    help="ASSUMPTION. Convergence is C1-6 and needs real data")
    ap.add_argument("--overhead-factor", type=float, default=1.35,
                    help="ASSUMPTION: data loading, augmentation, validation, checkpointing")
    ap.add_argument("--runs", type=int, default=DEFAULT_RUNS)
    ap.add_argument("--ablations", type=int, default=DEFAULT_ABLATIONS)
    ap.add_argument("--gpu-hours-per-day", "--hours-per-day", dest="hours_per_day",
                    type=float, default=8.0,
                    help="ASSUMPTION: hours per calendar day this GPU can train. 8 if it only "
                         "runs while you work, up to 24 if it can run overnight - the owner knows")
    ap.add_argument("--today", default=None,
                    help="YYYY-MM-DD, default: the date this runs")
    ap.add_argument("--window-start", default=DEFAULT_WINDOW_START.isoformat(),
                    help="first day the matrix can train: after GATE-ML-01, end of M4 "
                         "(default %(default)s = Day 12). The later of this and --today is used")
    ap.add_argument("--deadline", default=DEFAULT_DEADLINE.isoformat(),
                    help="day the matrix must be complete: M6 exit (default %(default)s = Day 22)")
    ap.add_argument("--remaining-days", type=float, default=None,
                    help="override the training-window length in days instead of computing it")
    ap.add_argument("--target-img", default=None,
                    help="in-plane size the calendar should describe, or 'native' for the cohort's "
                         "own sizes weighted by case count (69 x 576^2, 85 x 640^2). Step time is "
                         "scaled with pixel count - an assumption; re-running the probe is better")
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
    probe_img = probe["input_shape"][-1]
    all_results = probe.get("results", [])
    variants = [r for r in all_results if "train_step" in r]
    failed = [r for r in all_results if "train_step" not in r]

    if args.variant:
        wanted = [r for r in variants if r["variant"] == args.variant]
        if not wanted:
            known = sorted(r["variant"] for r in all_results)
            # #48: a typo used to print "every one failed to run", which is the
            # wrong diagnosis and sends the reader looking for an OOM.
            if any(r["variant"] == args.variant for r in failed):
                rec = next(r for r in failed if r["variant"] == args.variant)
                print()
                print(f"  Variant {args.variant!r} is in this probe file but did not run:")
                print(f"    {rec.get('error', 'no train_step recorded')[:160]}")
                print()
            else:
                print(f"\n  No variant named {args.variant!r} in that probe file.")
                print(f"  Present: {', '.join(known)}\n")
            return 1
        variants = wanted

    if not variants:
        print("\n  No variant in that probe file produced a timing.")
        for r in failed:
            print(f"    {r['variant']}: {r.get('error', 'no train_step recorded')[:140]}")
        print("\n  Nothing to extrapolate from. This is not a calendar of zero days.\n")
        return 1

    for name, val in (("--gpu-hours-per-day", args.hours_per_day), ("--epochs", args.epochs),
                      ("--train-cases", args.train_cases),
                      ("--slices-per-case", args.slices_per_case),
                      ("--overhead-factor", args.overhead_factor)):
        if val <= 0:
            print(f"\n  {name} is {val}. A calendar built on that is not a small number,")
            print("  it is a meaningless one - the old version printed 0.0 days and said the")
            print("  matrix fits in 30 days.\n")
            return 2

    slices_total = args.train_cases * args.slices_per_case
    steps_per_epoch = -(-slices_total // batch)          # ceil

    # The training window: from the later of today and the window start, to the deadline.
    try:
        today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
        w_start = max(today, dt.date.fromisoformat(args.window_start))
        deadline = dt.date.fromisoformat(args.deadline)
    except ValueError as exc:
        print(f"\n  Bad date: {exc}. Use YYYY-MM-DD.\n")
        return 2
    if args.remaining_days is not None:
        window_days = args.remaining_days
        window_how = f"--remaining-days {args.remaining_days} (given)"
    else:
        window_days = float((deadline - w_start).days)
        window_how = (f"{deadline.isoformat()} - {w_start.isoformat()} = {window_days:.0f} days "
                      f"(deadline minus the later of today {today.isoformat()} and the window "
                      f"start {args.window_start})")
    if window_days <= 0:
        print(f"\n  The training window is {window_days} days: {window_how}.")
        print("  There is no calendar left to fit anything into - that is the verdict.\n")
        return 1
    budget_h = window_days * args.hours_per_day

    precision = probe.get("precision", "fp32 (not recorded - probe revision 2 or earlier)")
    print()
    print("  " + "=" * 74)
    print("  C0-7 / C0-8 — PRELIMINARY extrapolation. Every input is shown.")
    print("  " + "=" * 74)
    print()
    print(f"  operator            {probe.get('operator')}")
    print(f"  compute             {probe['compute'].get('gpu_name')}  "
          f"({probe['device_used']}), driver {probe['compute'].get('nvidia_driver', '?')}")
    inp = probe.get("input") or {}
    print(f"  probe input         {probe['input_shape']}   SYNTHETIC, "
          f"{inp.get('source_dtype', '?')} from {inp.get('source_shape_xyz', '?')}, "
          f"precision {precision}")
    print()
    print("  MEASURED (from the probe, on real hardware)")
    print(f"    batch size                      {batch}")
    print()
    print("  ASSUMED (not measured — change these and the verdict changes)")
    print(f"    training cases                  {args.train_cases}"
          f"      <- DR-002 = Path A, decided 2026-09-14")
    print(f"    slices per case                 {args.slices_per_case}"
          f"      <- Spike D A6 measured 88 for every case")
    print(f"    epochs to convergence           {args.epochs}"
          f"      <- NOT measurable on synthetic data; this is C1-6")
    print(f"    overhead factor                 {args.overhead_factor}"
          f"    <- loading, augmentation, validation, checkpointing")
    print(f"    GPU hours per calendar day      {args.hours_per_day}"
          f"     <- the owner knows whether it can run overnight")
    print(f"    runs x ablations                {args.runs} + {args.ablations}")
    print()
    print("  CALENDAR (from PROJECT_STATE.yaml; override with --window-start / --deadline)")
    print(f"    training window                 {window_how}")
    print(f"    GPU-hour budget                 {window_days:.0f} days x {args.hours_per_day} h/day"
          f" = {budget_h:.0f} h")
    print("    The matrix cannot start before GATE-ML-01 (M4, Day 8-12) and must finish by M6")
    print("    (Day 12-22). Every other use of the GPU in that window comes out of this budget.")
    print()
    # #42: the old version multiplied steps by the measured ms with no reference
    # to the resolution that ms came from.
    scale, target_desc = 1.0, None
    resized = bool(inp.get("resize_policy"))
    if args.target_img == "native":
        n = sum(c for _, c in COHORT_INPLANE)
        mean_px = sum(s * s * c for s, c in COHORT_INPLANE) / n
        scale = mean_px / (probe_img ** 2)
        target_desc = "native cohort sizes"
        print("  RESOLUTION - calendar for training at the cohort's NATIVE sizes (no resize)")
        print("    mean pixels per slice = (" + " + ".join(f"{c} x {s}^2" for s, c in COHORT_INPLANE)
              + f") / {n} = {mean_px:,.0f}")
        print(f"    scale vs the probe's {probe_img}^2 = {mean_px:,.0f} / {probe_img ** 2:,} = "
              f"{scale:.3f}x   <- ASSUMPTION: step time proportional to pixel count")
        print()
    elif args.target_img:
        try:
            tgt = int(args.target_img)
        except ValueError:
            print(f"\n  --target-img must be an integer or 'native', not {args.target_img!r}\n")
            return 2
        if tgt != probe_img:
            scale = (tgt / probe_img) ** 2
            target_desc = f"{tgt} x {tgt}"
            print("  RESOLUTION MISMATCH - scaled, and the assumption is stated")
            print(f"    probe measured at            {probe_img} x {probe_img}")
            print(f"    calendar is for              {tgt} x {tgt}")
            print(f"    quadratic scale factor       {scale:.2f}x   <- ASSUMPTION, not measured")
            print("    The right fix is to re-run the probe at the target size.")
            print()
    elif resized:
        print(f"  RESOLUTION: the probe resized its uint8 source to {probe_img} x {probe_img}")
        print(f"    ({inp['resize_policy'].get('mri')}). Under that policy both cohort sizes,")
        print(f"    576 and 640, train at {probe_img} x {probe_img}, so every slice costs the same")
        print("    step time and the 69/85 mix does not change the calendar. Pass --target-img")
        print("    native to see the calendar without resizing.")
        print()
    else:
        print(f"  NOTE: step time was measured at {probe_img} x {probe_img} by a probe that did")
        print("  not record a resize policy (revision 2 or earlier). Re-run the current probe.")
        print()

    print("  ARITHMETIC")
    print(f"    slices_total    = {args.train_cases} cases x {args.slices_per_case} slices"
          f" = {slices_total:,}")
    print(f"    steps_per_epoch = ceil({slices_total:,} / batch) = {steps_per_epoch:,} at the intended "
          f"batch {batch}")
    print("                      a variant the probe measured at a smaller DISCOVERED batch (the intended")
    print("                      one did not fit) uses its own batch - its row says so")
    print()

    print("    h/epoch  = steps_per_epoch x ms/step / 3 600 000")
    print(f"    h/run    = h/epoch x {args.epochs} epochs x {args.overhead_factor} overhead")
    print(f"    matrix h = h/run x ({args.runs} + {args.ablations})")
    print(f"    days     = matrix h / {args.hours_per_day} GPU h per day;  "
          f"fits  <=>  matrix h <= {budget_h:.0f} h")
    print()

    head = (f"  {'variant':<32} {'ms/step':>9} {'h/epoch':>9} {'h/run':>9} "
            f"{'matrix':>10} {'days':>7} {'budget':>8}  verdict")
    print(head)
    print("  " + "-" * (len(head) - 2))

    rows = []
    for v in variants:
        ms = v["train_step"]["ms_median"] * scale
        # Probe revision 4 records the batch each variant was actually timed at: when the
        # intended batch did not fit, the timing is at the largest batch the search found.
        vb = int(v.get("batch") or batch)
        spe = -(-slices_total // vb)
        h_epoch = spe * ms / 1000.0 / 3600.0
        h_run = h_epoch * args.epochs * args.overhead_factor
        h_matrix = h_run * (args.runs + args.ablations)
        days = h_matrix / args.hours_per_day
        # #41: round once, use that everywhere.
        days_r = round(days, 2)
        share = h_matrix / budget_h
        fits = h_matrix <= budget_h
        rows.append({
            "variant": v["variant"],
            "batch": vb,
            "steps_per_epoch": spe,
            "measured_at": v.get("measured_at"),
            "precision": v.get("precision", precision),
            "measured_ms_per_train_step": round(v["train_step"]["ms_median"], 2),
            "ms_per_train_step_after_scaling": round(ms, 2),
            "resolution_scale_applied": round(scale, 4),
            "hours_per_epoch": round(h_epoch, 3),
            "hours_per_run": round(h_run, 2),
            "hours_full_matrix": round(h_matrix, 2),
            "calendar_days_at_given_hours": days_r,
            "share_of_budget": round(share, 3),
            "fits_remaining_calendar": fits,
        })
        # The matrix column stays in GPU hours. Revision 2 printed it as days of
        # 24 h right next to a days column computed at --gpu-hours-per-day.
        print(f"  {v['variant']:<32} {ms:>9.1f} {h_epoch:>9.2f} {h_run:>9.1f} "
              f"{h_matrix:>8.1f} h {days_r:>7.1f} {share * 100:>7.0f}%  "
              f"{'FITS' if fits else 'DOES NOT FIT'}"
              f"{f'   (batch {vb}, intended {batch} did not fit)' if vb != batch else ''}")

    if failed:
        print()
        print(f"  {len(failed)} variant(s) produced no timing and are ABSENT from the table:")
        for r in failed:
            print(f"    {r['variant']:<30} {r.get('error', 'no train_step')[:90]}")
        print("  A spread computed across the survivors is not a spread across the candidates.")

    print()
    fit_rows = [r for r in rows if r["fits_remaining_calendar"]]
    print("  C0-8 PRELIMINARY VERDICT — this machine, this run, the remaining calendar")
    print(f"    Budget: {budget_h:.0f} GPU hours ({window_days:.0f} days x {args.hours_per_day} h) "
          f"on {probe['compute'].get('gpu_name')}, precision {precision}.")
    if fit_rows:
        print(f"    {len(fit_rows)} of {len(rows)} variant(s) fit the full matrix of "
              f"{args.runs} runs + {args.ablations} ablation:")
        for r in sorted(fit_rows, key=lambda r: r["hours_full_matrix"]):
            print(f"      {r['variant']:<32} {r['hours_full_matrix']:>8.1f} h  "
                  f"({r['share_of_budget'] * 100:.0f}% of the budget)")
    else:
        print(f"    None of the {len(rows)} variant(s) fits the full matrix in the budget.")
    nofit = [r for r in rows if not r["fits_remaining_calendar"]]
    if nofit:
        print(f"    Does not fit: {', '.join(r['variant'] for r in nofit)}")
    print("    The verdict is limited to what was measured: one machine, one run, synthetic")
    print("    input. It says nothing about other hardware, and it holds only while the")
    print("    assumptions above hold. Change any of them and re-run this script.")
    print()
    print("  WHY THIS IS PRELIMINARY, NOT A PLAN")
    print("    - step time measured on SYNTHETIC volumes (cohort dtype and sizes, Spike D A6)")
    print("    - epoch count is an assumption; convergence is C1-6 and needs real data")
    print("    - overhead factor is an assumption, not a measurement")
    print("    - GPU hours per day is an assumption about how the machine will be used")
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
                         "compute": probe["compute"].get("gpu_name"),
                         "precision": precision},
            "assumptions": {
                "train_cases": args.train_cases,
                "slices_per_case": args.slices_per_case,
                "epochs": args.epochs,
                "overhead_factor": args.overhead_factor,
                "gpu_hours_per_day": args.hours_per_day,
                "runs": args.runs, "ablations": args.ablations,
            },
            "calendar": {"today": today.isoformat(), "window_start": w_start.isoformat(),
                         "deadline": deadline.isoformat(), "window_days": window_days,
                         "window_computed_as": window_how,
                         "gpu_hour_budget": round(budget_h, 1),
                         "basis": ("matrix starts after GATE-ML-01 (M4, Day 8-12) and must be "
                                   "complete by M6 (Day 12-22); Day 30 = 2026-10-09 fixed")},
            "derived": {"slices_total": slices_total, "steps_per_epoch": steps_per_epoch},
            "by_variant": rows,
            "verdict_scope": "this machine, this run, synthetic input, the assumptions listed",
            "c0_10_statement": "Does NOT close GATE-ML-01. DR-007 forbids it on C0 evidence alone.",
            "resolution": {"probe_img": probe_img, "target_img": args.target_img,
                           "target_described_as": target_desc,
                           "probe_resize_policy": inp.get("resize_policy"),
                           "scale_applied": round(scale, 4),
                           "scaling_assumption": "step time proportional to pixel count"},
            "variants_that_did_not_run": [
                {"variant": r["variant"], "error": r.get("error")} for r in failed],
            "invalidated_by": ("C1-6 showing convergence needs a different epoch count, the "
                               "owner's real GPU hours per day, or a probe re-run replacing the "
                               "pixel-count scaling assumption with a measurement. The training "
                               "partition is fixed: DR-002 = Path A, 80 training cases."),
        }
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"  wrote  {args.out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
