#!/usr/bin/env python3
"""
Self-test: do the UNet results flow into the tables, figures and deck by themselves?

It fabricates SYNTHETIC run directories in a temporary folder (random numbers, no patient data, nothing under the
real runs root is read), builds the assets and the deck twice, and checks:

    1. without EXP-U-* : the deck shows the marked placeholder "CHỜ KẾT QUẢ UNET (Khánh)" and RQ-A is "chưa trả lời";
    2. with EXP-U-*    : the placeholder is gone from every slide, the aggregate carries the UNet family, the model
                         comparison appears in the forest plot data, and the figures still render;
    3. an unknown run id is carried through as family "other", and a missing run directory is skipped with a warning.

    python tools/report/selftest_unet_flow.py                  # prints PASS / FAIL, exit code 0 / 1
    python tools/report/selftest_unet_flow.py --keep <dir>     # keep the synthetic outputs there, to look at the decks

Without --keep the temporary folder is removed by the TemporaryDirectory context manager, which deletes only what it
created.
"""

from __future__ import annotations

import contextlib
import json
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_deck  # noqa: E402
import build_report_assets as assets  # noqa: E402

PLACEHOLDER = build_deck.UNET_PLACEHOLDER
N_CASES = 54


def boot_ci(v: np.ndarray, rng) -> dict:
    idx = rng.integers(0, len(v), size=(1000, len(v)))
    m = v[idx].mean(axis=1)
    return {"method": "synthetic", "level": 0.95, "resamples": 1000, "seed": 1, "low": float(np.quantile(m, .025)), "high": float(np.quantile(m, .975))}


def stat(v: np.ndarray, rng) -> dict:
    return {"n": len(v), "mean": float(v.mean()), "std": float(v.std(ddof=1)), "median": float(np.median(v)), "q1": float(np.quantile(v, .25)),
            "q3": float(np.quantile(v, .75)), "ci95_mean": boot_ci(v, rng)}


def make_run(root: Path, rid: str, family: str, frac: float, mean: float, rng, processed=False, derived=None) -> np.ndarray:
    d = root / rid
    ev = d / "evaluation" / "final_holdout"
    ev.mkdir(parents=True)
    dice = np.clip(rng.normal(mean, 0.15, N_CASES), 0.02, 0.95)
    cases = [{"case_id": f"SYN_{i:04d}", "status": "SUCCEEDED", "dice_3d": float(x)} for i, x in enumerate(dice)]
    metrics = {"dice_3d": stat(dice, rng), "iou_3d": stat(dice * 0.75, rng), "mean_slice_dice": stat(dice * 0.7, rng),
               "relative_volume_error_percent": stat(rng.normal(10, 30, N_CASES), rng),
               "fp_voxels": stat(rng.normal(9e4, 2e4, N_CASES), rng), "fn_voxels": stat(rng.normal(7e4, 2e4, N_CASES), rng)}
    variant = "PROCESSED_PREDICTION" if processed else "RAW_PREDICTION"
    summary = {"experiment_id": rid, "prediction_variant": variant, "evaluation_metric_version": "ml-eval-synthetic", "population": {"partition": "final_holdout"},
               "intended_n": N_CASES, "successful_n": N_CASES, "bootstrap": {"level": .95, "resamples": 1000, "seed": 1},
               "cohort": {"metrics": metrics, "outlier_selection": {"rule_id": "synthetic", "rule": "synthetic"}},
               "holdout_slots": {"sensitivity_without_suspected_linkage": {"metrics": {"dice_3d": stat(dice[1:], rng)}}}}
    (ev / "metrics_summary.json").write_text(json.dumps(summary), encoding="utf-8")
    (ev / "per_case_metrics.json").write_text(json.dumps({"cases": cases}), encoding="utf-8")
    slices = {c["case_id"]: [{"normalized_position": k / 40, "dice_status": "VALUE", "dice": float(np.clip(np.sin(np.pi * k / 40) * c["dice_3d"], 0, 1)),
                              "ref_voxels": 10 if 6 < k < 34 else 0} for k in range(41)] for c in cases}
    (ev / "per_slice_metrics.json").write_text(json.dumps({"cases": slices}), encoding="utf-8")
    n_train = int(round(78 * frac)) if frac else 20
    manifest = {"experiment_id": rid, "model_family": family, "training_fraction": frac, "prediction_variant": variant,
                "training_subset_manifest": {"case_count": n_train}}
    if processed:
        manifest.update({"postprocessing_version": "synthetic:PP-4", "derived_from": {"experiment_id": derived}})
    (d / "run_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if not processed:
        (d / "run_state.json").write_text(json.dumps({"status": "COMPLETE", "best_epoch": 5, "best_val_mean_dice_3d": 0.5, "best_sha256": "0" * 64}), encoding="utf-8")
        with (d / "train_log.jsonl").open("w", encoding="utf-8") as fh:
            fh.write(json.dumps({"event": "start", "train_cases": n_train, "train_slices": 100, "validation_cases": 20}) + "\n")
            for e in range(1, 11):
                fh.write(json.dumps({"event": "epoch", "epoch": e, "epochs": 10, "train_loss_mean": 1 / e, "val_mean_dice_3d": 0.05 * e,
                                     "wall_time_s": {"epoch": 60.0}}) + "\n")
    return dice


def write_cmp(cdir: Path, a: str, b: str, da: np.ndarray, db: np.ndarray, rng) -> None:
    diff = db - da
    st = {"n": len(diff), "mean": float(diff.mean()), "ci95_mean": boot_ci(diff, rng), "n_pairs": len(diff), "n_run_b_higher": int((diff > 0).sum()),
          "n_run_a_higher": int((diff < 0).sum()), "n_equal": 0}
    doc = {"format": "ml-paired-comparison/1", "run_a": a, "run_b": b,
           "report": {"primary_all_holdout": {"metric": "dice_3d", "comparability": {"label": "COMPARABLE"}, "paired_statistics": st}}}
    (cdir / f"{a}__vs__{b}.final_holdout.json").write_text(json.dumps(doc), encoding="utf-8")


def check(cond: bool, msg: str, fails: list[str]) -> None:
    print(("  ok    " if cond else "  FAIL  ") + msg)
    if not cond:
        fails.append(msg)


def deck_text(path: Path) -> list[str]:
    from pptx import Presentation
    prs = Presentation(str(path))
    out = []
    for sl in prs.slides:
        t = []
        for sp in sl.shapes:
            if sp.has_text_frame:
                t.append(sp.text_frame.text)
            if getattr(sp, "has_table", False) and sp.has_table:
                t += [c.text_frame.text for r in sp.table.rows for c in r.cells]
        out.append("\n".join(t))
    return out


def main() -> int:
    fails: list[str] = []
    rng = np.random.default_rng(7)
    keep = sys.argv[sys.argv.index("--keep") + 1] if "--keep" in sys.argv else None
    if keep:
        Path(keep).mkdir(parents=True, exist_ok=True)
    with (contextlib.nullcontext(keep) if keep else tempfile.TemporaryDirectory()) as tmp:
        root = Path(tmp) / "runs"
        cdir = Path(tmp) / "cmp"
        gdir = root / "_gate_img_01"
        cdir.mkdir(parents=True)
        gdir.mkdir(parents=True)
        dd = {}
        for rid, f, m in (("EXP-D-025", .25, .56), ("EXP-D-050", .5, .62), ("EXP-D-100", 1.0, .64)):
            dd[rid] = make_run(root, rid, "dinov2", f, m, rng)
        dd["EXP-D-PP"] = make_run(root, "EXP-D-PP", "dinov2", 1.0, .66, rng, processed=True, derived="EXP-D-100")
        make_run(root, "EXP-X-777", "other", None, .5, rng)          # an id the builders have never heard of
        for a, b in (("EXP-D-025", "EXP-D-050"), ("EXP-D-025", "EXP-D-100"), ("EXP-D-050", "EXP-D-100"), ("EXP-D-100", "EXP-D-PP")):
            write_cmp(cdir, a, b, dd[a], dd[b], rng)
        gdir.joinpath("gate_run.json").write_text(json.dumps({
            "population": "validation", "intended_n": 20, "tie_tolerance": 0.001, "selection": {"winner": "PP-4", "delta_vs_pp0": 0.02},
            "candidates": {f"PP-{i}": {"mean_dice_3d": 0.57 + 0.005 * i, "mean_iou_3d": 0.4, "mean_abs_rve_percent": 30, "cases_above_pp0": 18,
                                       "cases_below_pp0": 2} for i in range(6)}}), encoding="utf-8")

        def run(tag: str, runs: list[str]) -> tuple[dict, list[str]]:
            out = Path(tmp) / tag
            rc = assets.main(["--runs-root", str(root), "--runs", *runs, "--comparisons", str(cdir), "--out", str(out), "--local-out",
                              str(Path(tmp) / (tag + "_local"))])
            check(rc == 0, f"[{tag}] assets builder exit code {rc}", fails)
            rc = build_deck.main(["--assets", str(out), "--out", str(out)])
            check(rc == 0, f"[{tag}] deck builder exit code {rc}", fails)
            agg = json.loads((out / "results_aggregate.json").read_text(encoding="utf-8"))
            return agg, deck_text(out / build_deck.DECK_NAME)

        print("1. DINOv2 only (+ one unknown id and one missing directory)")
        agg1, txt1 = run("a", ["EXP-D-025", "EXP-D-050", "EXP-D-100", "EXP-D-PP", "EXP-X-777", "EXP-U-025"])
        check(not any(r["family"] == "unet" for r in agg1["runs"]), "no UNet family in the aggregate", fails)
        check({s["experiment_id"] for s in agg1.get("skipped_runs", [])} == {"EXP-U-025"}, "a missing run directory is skipped and listed", fails)
        check(any(r["experiment_id"] == "EXP-X-777" and r["family"] == "other" and r["label"] == "EXP-X-777" for r in agg1["runs"]),
              "an unknown run id is kept, labelled by its id, family 'other'", fails)
        n_ph = sum(PLACEHOLDER in t for t in txt1)
        check(n_ph >= 4, f"placeholder shown on {n_ph} slides (expected at least 4)", fails)

        print("2. with the UNet family")
        for rid, f, m in (("EXP-U-025", .25, .50), ("EXP-U-050", .5, .60), ("EXP-U-100", 1.0, .68)):
            dd[rid] = make_run(root, rid, "unet", f, m, rng)
        for u in ("025", "050", "100"):
            write_cmp(cdir, f"EXP-D-{u}", f"EXP-U-{u}", dd[f"EXP-D-{u}"], dd[f"EXP-U-{u}"], rng)
        agg2, txt2 = run("b", ["EXP-D-025", "EXP-D-050", "EXP-D-100", "EXP-D-PP", "EXP-U-025", "EXP-U-050", "EXP-U-100"])
        check(sum(r["family"] == "unet" for r in agg2["runs"]) == 3, "three UNet runs in the aggregate", fails)
        check(sum(c["question"] == "model_comparison" for c in agg2["comparisons"]) == 3, "three UNet-vs-DINOv2 comparisons classified", fails)
        check(not any(PLACEHOLDER in t for t in txt2), "the placeholder is gone from every slide", fails)
        check(any("UNet 100" in t for t in txt2), "UNet runs appear in the deck text", fails)
        for fig in ("fig_b_data_scarcity", "fig_f_paired_deltas"):
            check((Path(tmp) / "b" / "figures" / f"{fig}.png").is_file(), f"{fig}.png rendered with the UNet family", fails)
    print("\nPASS" if not fails else f"\nFAIL ({len(fails)})")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
