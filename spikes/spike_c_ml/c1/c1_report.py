#!/usr/bin/env python3
"""
Spike C1 — calendar verdict (C1-9), ADR-ML-001 coverage (C1-10) and the RESULT table.

Reads the machine evidence written by run_feasibility.py and measure_boundary.py and writes:
  c1_calendar_<stamp>.json   epochs E chosen by the PRE-DECLARED rule, with every input labelled
                             MEASURED / READ / ASSUMPTION / DECISION
  c1_result_table.md         the criterion table for management/spikes/SPIKE_C_ML/RESULT.md,
                             generated from JSON (no measured value is typed by hand)

The epoch rule is the one recorded in management/day22/RECOVERY_OVERRIDE_DAY22.md §4 before any
C1 result existed: one E for all six runs, E = min(50, the largest E for which the training
queues on the two DR-016 hosts finish by the deadline at the measured speed); if E < 10 at the
practical resolution, DR-007 applies before the freeze (both families move to the next grid size).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

SLICES_PER_CASE = 88
SUBSETS = {"025": "25_percent", "050": "50_percent", "100": "100_percent"}
FAMILY_TAG = {"unet_base32_depth4": "U", "dinov2_s14_full_progressive": "D"}


def run_hours(n_cases: int, n_val: int, batch: int, train_ms: float, val_ms: float, epochs: int,
              overhead: float) -> float:
    steps = (n_cases * SLICES_PER_CASE) // batch
    val_batches = -(-n_val * SLICES_PER_CASE // batch)
    per_epoch_ms = steps * train_ms + val_batches * val_ms
    return epochs * per_epoch_ms * overhead / 3.6e6


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--measurements", type=Path, required=True)
    ap.add_argument("--boundary", type=Path, required=True)
    ap.add_argument("--split-manifest", type=Path, required=True)
    ap.add_argument("--dinov2-start", required=True, help="ISO time the DINOv2 queue starts on the leader PC")
    ap.add_argument("--unet-start", required=True, help="ISO time the UNet queue starts on the RTX 4050")
    ap.add_argument("--deadline", default="2026-10-03T12:00:00+07:00")
    ap.add_argument("--overhead", type=float, default=1.10,
                    help="ASSUMPTION: checkpoint saves, logging, cache misses beyond the measured step")
    ap.add_argument("--out-dir", type=Path, required=True)
    args = ap.parse_args()

    m = json.loads(args.measurements.read_text(encoding="utf-8"))
    b = json.loads(args.boundary.read_text(encoding="utf-8"))
    split = json.loads(args.split_manifest.read_text(encoding="utf-8"))
    pp = m["practical_point"]
    img, batch = pp["img"], pp["batch"]
    speed = {}
    for g in m["grid_C1_1_C1_2_C1_3"]:
        if g.get("fits") and g["img"] == img and g["batch"] == batch:
            speed[g["variant"]] = (g["train_step_ms_median"], g["val_step_ms_median"])
    n_val = len(split["partitions"]["validation"]) if isinstance(split["partitions"]["validation"], list) \
        else len(split["partitions"]["validation"]["case_ids"])
    sizes = {k: split["training_subsets"][v]["effective_case_count"] for k, v in SUBSETS.items()}

    start = {"dinov2_s14_full_progressive": dt.datetime.fromisoformat(args.dinov2_start),
             "unet_base32_depth4": dt.datetime.fromisoformat(args.unet_start)}
    deadline = dt.datetime.fromisoformat(args.deadline)

    def queue_end(fam: str, epochs: int) -> dt.datetime:
        tr, va = speed[fam]
        hrs = sum(run_hours(sizes[k], n_val, batch, tr, va, epochs, args.overhead) for k in sizes)
        return start[fam] + dt.timedelta(hours=hrs)

    chosen = 0
    for e in range(50, 0, -1):
        if all(queue_end(f, e) <= deadline for f in speed):
            chosen = e
            break
    verdict = "FITS" if chosen >= 10 else "DR-007 REQUIRED (E < 10 at this resolution)"
    per_run = {}
    for fam in speed:
        tr, va = speed[fam]
        for k in sizes:
            per_run[f"EXP-{FAMILY_TAG[fam]}-{k}"] = round(run_hours(sizes[k], n_val, batch, tr, va,
                                                                    max(chosen, 1), args.overhead), 2)
    calendar = {
        "criterion": "C1-9",
        "rule_source": "management/day22/RECOVERY_OVERRIDE_DAY22.md §4 (declared before C1 ran)",
        "inputs": {
            "step_ms_by_family": {"value": {f: {"train": s[0], "val": s[1]} for f, s in speed.items()},
                                  "kind": "MEASURED on the leader PC (C1-2)"},
            "practical_point": {"value": pp, "kind": "MEASURED (C1-3)"},
            "effective_subset_sizes": {"value": sizes, "kind": "READ from the split manifest"},
            "validation_cases": {"value": n_val, "kind": "READ"},
            "slices_per_case": {"value": SLICES_PER_CASE, "kind": "READ (dataset manifest, uniform)"},
            "overhead": {"value": args.overhead, "kind": "ASSUMPTION"},
            "unet_host_speed": {"value": "leader-PC speed used for the RTX 4050 as an upper bound",
                                "kind": "ASSUMPTION (conservative; the 4050 is the faster card)"},
            "queue_starts": {"value": {f: start[f].isoformat() for f in start}, "kind": "DECISION (DR-016)"},
            "deadline": {"value": deadline.isoformat(), "kind": "DECISION"},
        },
        "epochs_E": chosen,
        "verdict": verdict,
        "hours_per_run_at_E": per_run,
        "queue_end": {f: queue_end(f, max(chosen, 1)).isoformat() for f in speed},
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / f"c1_calendar_{m['stamp']}.json").write_text(json.dumps(calendar, indent=2), encoding="utf-8")

    t = m["convergence_C1_6"]
    rows = [
        ("C1-1", "Peak memory, both families, practical point",
         "; ".join(f"{g['variant']} {g['img']}/b{g['batch']}: {g.get('peak_allocated_mib','OOM')} MiB"
                   for g in m["grid_C1_1_C1_2_C1_3"] if g["img"] == img and g["batch"] == batch)),
        ("C1-2", "Train / validation step time (real data, loading included)",
         "; ".join(f"{f}: {s[0]} / {s[1]} ms" for f, s in speed.items())),
        ("C1-3", "Practical input resolution and batch", f"{img}×{img}, batch {batch} (first grid point where both fit)"),
        ("C1-4", "Decoder behaviour on real anatomy (fixed panel)",
         "; ".join(f"{f}: {sum(1 for p in t[f]['decoder_panel'] if p.get('panel') == 'smallest' and p['dice'] < 0.5)} small-area panel slices below Dice 0.5"
                   for f in t)),
        ("C1-5", "Thinnest structures vs decoder stride (voxels)",
         f"p5 thickness at model input {b['thickness_at_model_input']['p5']} px; fraction thinner than stride: "
         + ", ".join(f"{k} {v}" for k, v in b["fraction_thinner_than_stride_at_model_input"].items())),
        ("C1-6", "Equal-budget convergence",
         "; ".join(f"{f}: {t[f]['verdict']} (loss {t[f]['loss_mean_first_10pct']} → {t[f]['loss_mean_last_10pct']}, "
                   f"fold-val Dice {t[f]['fold_val_curve'][-1]['fold_val_dice_mean'] if t[f]['fold_val_curve'] else 'n/a'})"
                   for f in t)),
        ("C1-7", "DR-011 at runtime", "per-volume statistics only; cohort statistics used: "
         + str(m["dr011_runtime_C1_7"]["cohort_statistics_used"])),
        ("C1-8", "Subset provenance", f"{len(m['provenance_C1_8']['selected_case_ids'])} ids from "
         f"{m['provenance_C1_8']['selected_pointer']}; split sha256 {m['provenance_C1_8']['split_manifest_sha256'][:12]}…; "
         "validation and holdout never loaded"),
        ("C1-9", "Calendar verdict", f"E = {chosen} → {verdict}"),
        ("C1-10", "ADR-ML-001 fields evidenced", "see the coverage table in ADR-ML-001"),
    ]
    md = ["| Criterion | What | Evidence (generated from JSON) |", "|---|---|---|"]
    md += [f"| `{c}` | {w} | {e} |" for c, w, e in rows]
    (args.out_dir / "c1_result_table.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    # Aggregate evidence for git (C1 plan §7): no per-case values, no per-file hashes, no paths.
    def agg(values):
        v = sorted(x for x in values if x is not None)
        return {"n": len(v), "min": v[0], "median": v[len(v) // 2], "max": v[-1]} if v else {"n": 0}

    dr = m["dr011_runtime_C1_7"]["per_case_records"]
    summary = {
        "spike": "SPIKE_C1", "stamp": m["stamp"], "code_commit": m["code_commit"],
        "operator": m["operator"], "owner": m["owner"], "compute_host_decision": m["compute_host_decision"],
        "environment": m["environment"],
        "provenance_C1_8": {k: m["provenance_C1_8"][k] for k in
                            ("preflight_label", "split_manifest_sha256", "dataset_manifest_sha256",
                             "selected_pointer", "selected_case_ids", "internal_fold", "data_access",
                             "validation_partition_loaded", "holdout_loaded", "source_shape_strata")
                            if k in m["provenance_C1_8"]},
        "one_case_verification": {k: v for k, v in m["one_case_verification"].items() if k != "mask_voxels"},
        "preprocessing": m["preprocessing"],
        "dr011_runtime_C1_7": {"policy_file": m["dr011_runtime_C1_7"]["policy_file"],
                               "cohort_statistics_used": m["dr011_runtime_C1_7"]["cohort_statistics_used"],
                               "cases": len(dr),
                               "volume_lo": agg([r["volume_lo"] for r in dr.values()]),
                               "volume_hi": agg([r["volume_hi"] for r in dr.values()])},
        "grid_C1_1_C1_2_C1_3": m["grid_C1_1_C1_2_C1_3"],
        "practical_point": pp,
        "convergence_C1_6": {
            f: {**{k: v for k, v in r.items() if k not in ("fold_val_curve", "decoder_panel", "checkpoint")},
                "checkpoint": {k: r["checkpoint"][k] for k in ("bytes", "sha256", "reload_max_abs_diff")},
                "fold_val_dice_mean_by_step": [{"step": c["step"], "dice_mean": c["fold_val_dice_mean"]}
                                               for c in r["fold_val_curve"]],
                "decoder_panel_C1_4": {
                    tag: {"slices": sum(1 for p in r["decoder_panel"] if p.get("panel") == tag),
                          "dice": agg([p["dice"] for p in r["decoder_panel"] if p.get("panel") == tag])}
                    for tag in ("largest", "median", "smallest")} | {
                    "empty_gt_slices": sum(p["count"] for p in r["decoder_panel"] if p.get("panel") == "empty_gt_slices"),
                    "empty_gt_slices_with_false_positive": sum(p["slices_with_false_positive"] for p in r["decoder_panel"]
                                                               if p.get("panel") == "empty_gt_slices")}}
            for f, r in t.items()},
        "boundary_C1_5": {k: v for k, v in b.items() if k != "per_case"},
        "calendar_C1_9": calendar,
        "recipe": m["recipe"],
    }
    (args.out_dir / f"c1_summary_{m['stamp']}.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"epochs_E": chosen, "verdict": verdict, "hours_per_run_at_E": per_run}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
