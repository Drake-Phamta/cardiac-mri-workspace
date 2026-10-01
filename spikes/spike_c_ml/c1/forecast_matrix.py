#!/usr/bin/env python3
"""Fraction-weighted wall-clock forecast for the 08 section 2 experiment matrix.

Why this exists alongside harness/extrapolate.py
------------------------------------------------
``harness/extrapolate.py`` (Spike C0, 2026-09-16) costs the matrix as
``7 x hours_per_run`` where every run is priced at the FULL 80-case training
partition. That is deliberately conservative but it is not the matrix that
``08`` section 2 actually specifies: ``EXP-D-025 / 050 / 100`` train on the
nested 25 / 50 / 100 percent subsets, whose EFFECTIVE sizes after the DR-002b
exclusions are read from the split manifest, not assumed.

This script prices each run at its own subset size, taken from the manifest.

Provenance of every number it emits
-----------------------------------
* ms per train step   -- MEASURED, but by Spike C0 on SYNTHETIC data on the
                         owner's RTX 4050 Laptop GPU. It is NOT a C1 number and
                         it is NOT measured on real volumes.
* effective subset sizes -- read from the split manifest passed in.
* slices per case     -- read from the dataset manifest (measured), not assumed.
* epochs, overhead, gpu hours/day -- ASSUMPTIONS. They are echoed into the
                         output under ``assumptions`` so no reader can mistake
                         them for measurements.

The script never invents a throughput. If a variant has no measured step time
in the probe JSON it is reported as NOT MEASURED and skipped.

Usage
-----
    python forecast_matrix.py --probe <c0_probe_bf16.json> \
        --split-manifest <split_manifest.json> \
        --dataset-manifest <dataset_manifest.json> \
        --window-start 2026-09-24 --deadline 2026-10-09 \
        --gpu-hours-per-day 4 --epochs 50 --overhead 1.35 \
        --unet <variant> --dinov2 <variant> --label <label> --json-out <path>
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import statistics
from pathlib import Path
from typing import Any


def _load(p: Path) -> Any:
    return json.loads(p.read_bytes().decode("utf-8-sig"))


def _step_ms(result: dict[str, Any]) -> float | None:
    """Pull the measured median train-step time in ms, or None."""
    ts = result.get("train_step")
    if not isinstance(ts, dict):
        return None
    for key in ("median_ms", "ms_median", "median_ms_per_step", "ms_per_step_median"):
        if isinstance(ts.get(key), (int, float)):
            return float(ts[key])
    samples = ts.get("samples_ms") or ts.get("timings_ms") or ts.get("ms_samples")
    if isinstance(samples, list) and samples:
        return float(statistics.median(samples))
    for key in ("steps_per_s", "steps_per_sec", "steps_per_second"):
        v = ts.get(key)
        if isinstance(v, (int, float)) and v > 0:
            return 1000.0 / float(v)
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", required=True, type=Path)
    ap.add_argument("--split-manifest", required=True, type=Path)
    ap.add_argument("--dataset-manifest", required=True, type=Path)
    ap.add_argument("--window-start", required=True)
    ap.add_argument("--deadline", required=True)
    ap.add_argument("--gpu-hours-per-day", type=float, required=True)
    ap.add_argument("--epochs", type=int, required=True)
    ap.add_argument("--overhead", type=float, required=True)
    ap.add_argument("--unet", required=True, help="UNet variant name in the probe JSON")
    ap.add_argument("--dinov2", required=True, help="DINOv2 variant name in the probe JSON")
    ap.add_argument("--ablations", type=int, default=1)
    ap.add_argument("--label", default="UNLABELLED")
    ap.add_argument("--json-out", type=Path)
    args = ap.parse_args()

    probe = _load(args.probe)
    split = _load(args.split_manifest)
    dataset = _load(args.dataset_manifest)

    by_variant = {r["variant"]: r for r in probe["results"]}
    for name in (args.unet, args.dinov2):
        if name not in by_variant:
            raise SystemExit(f"variant {name!r} absent from probe; available: {sorted(by_variant)}")

    # Slices per case: MEASURED, from the dataset manifest's own shapes.
    depths = sorted({tuple(c["mri"]["shape"])[2] for c in dataset["cases"] if c.get("mri", {}).get("shape")})
    if len(depths) != 1:
        raise SystemExit(f"non-uniform slice depth across cases: {depths}; refuse to assume one")
    slices_per_case = depths[0]

    subsets = {
        "25_percent": len(split["training_subsets"]["25_percent"]["effective_case_ids"]),
        "50_percent": len(split["training_subsets"]["50_percent"]["effective_case_ids"]),
        "100_percent": len(split["training_subsets"]["100_percent"]["effective_case_ids"]),
    }

    start = dt.date.fromisoformat(args.window_start)
    end = dt.date.fromisoformat(args.deadline)
    window_days = (end - start).days
    budget_h = window_days * args.gpu_hours_per_day

    runs: list[dict[str, Any]] = []
    not_measured: list[str] = []
    for family_label, variant in (("UNet", args.unet), ("DINOv2", args.dinov2)):
        res = by_variant[variant]
        ms = _step_ms(res)
        if ms is None:
            not_measured.append(variant)
            continue
        batch = int(res["batch"])
        for frac, cases in subsets.items():
            slices = cases * slices_per_case
            steps_per_epoch = -(-slices // batch)  # ceil
            hours = steps_per_epoch * args.epochs * (ms / 1000.0) / 3600.0 * args.overhead
            runs.append(
                {
                    "run": f"EXP-{'D' if family_label == 'DINOv2' else 'U'}-{frac.split('_')[0].zfill(3)}",
                    "family": family_label,
                    "variant": variant,
                    "fraction": frac,
                    "effective_cases": cases,
                    "slices_per_case_measured": slices_per_case,
                    "slices_total": slices,
                    "batch": batch,
                    "steps_per_epoch": steps_per_epoch,
                    "measured_ms_per_train_step": ms,
                    "hours": round(hours, 2),
                }
            )

    core_h = sum(r["hours"] for r in runs)
    # A derived ablation is priced at the most expensive single run, which is the
    # conservative choice; it is an assumption and is labelled as one.
    ablation_h = round(max((r["hours"] for r in runs), default=0.0) * args.ablations, 2)
    total_h = round(core_h + ablation_h, 2)
    days_needed = round(total_h / args.gpu_hours_per_day, 2) if args.gpu_hours_per_day else None

    payload = {
        "label": args.label,
        "generated_by": "spikes/spike_c_ml/c1/forecast_matrix.py",
        "throughput_provenance": {
            "source_file": str(args.probe),
            "captured_at": probe.get("captured_at"),
            "operator": probe.get("operator"),
            "compute": probe.get("compute", {}).get("gpu_name"),
            "precision": probe.get("precision"),
            "input_is_synthetic": probe.get("input_is_synthetic"),
            "warning": (
                "Step times are Spike C0 measurements on SYNTHETIC data. They are NOT "
                "Spike C1 evidence and cannot close GATE-ML-01."
            ),
        },
        "measured_inputs": {
            "slices_per_case": slices_per_case,
            "slices_per_case_source": "dataset_manifest cases[].mri.shape[2], uniform across all cases",
            "effective_subset_sizes": subsets,
            "effective_subset_source": "split manifest training_subsets[*].effective_case_ids (length of the id list)",
            "split_id": split.get("split_id"),
        },
        "assumptions": {
            "epochs": args.epochs,
            "overhead_factor": args.overhead,
            "gpu_hours_per_day": args.gpu_hours_per_day,
            "ablation_priced_as": "the single most expensive core run",
            "note": "NOT MEASURED. Epoch count is unmeasured until C1-6 convergence evidence exists.",
        },
        "calendar": {
            "window_start": args.window_start,
            "deadline": args.deadline,
            "window_days": window_days,
            "gpu_hour_budget": round(budget_h, 2),
        },
        "runs": runs,
        "not_measured_variants": not_measured,
        "totals": {
            "core_six_runs_hours": round(core_h, 2),
            "ablation_hours": ablation_h,
            "total_hours": total_h,
            "days_needed_at_budget_rate": days_needed,
            "fits_window": total_h <= budget_h,
            "headroom_hours": round(budget_h - total_h, 2),
        },
        "gate_statement": (
            "This forecast does NOT close GATE-ML-01. Its throughput input is C0 synthetic "
            "evidence; DR-007 requires C1 real-data evidence."
        ),
    }

    print(f"label: {args.label}")
    print(f"window {args.window_start} -> {args.deadline} = {window_days} d, "
          f"budget {budget_h:.1f} GPU-h at {args.gpu_hours_per_day} h/day")
    print(f"slices/case (measured): {slices_per_case}; effective subsets: {subsets}")
    print("-" * 78)
    print(f"{'run':<13}{'family':<9}{'cases':>6}{'steps/ep':>10}{'ms/step':>10}{'hours':>9}")
    for r in runs:
        print(f"{r['run']:<13}{r['family']:<9}{r['effective_cases']:>6}"
              f"{r['steps_per_epoch']:>10}{r['measured_ms_per_train_step']:>10.2f}{r['hours']:>9.2f}")
    print("-" * 78)
    print(f"six core runs : {core_h:.2f} h")
    print(f"+ 1 ablation  : {ablation_h:.2f} h")
    print(f"TOTAL         : {total_h:.2f} h   ({days_needed} days at {args.gpu_hours_per_day} h/day)")
    print(f"BUDGET        : {budget_h:.2f} h  -> {'FITS' if total_h <= budget_h else 'DOES NOT FIT'}"
          f"  (headroom {budget_h - total_h:+.2f} h)")
    if not_measured:
        print(f"NOT MEASURED  : {not_measured}")

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"json evidence : {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
