#!/usr/bin/env python3
"""
Rebuild every results table and figure of the presentation kit from the experiment artifacts.

    raw run artifacts  ->  results_aggregate.json  ->  RESULTS_TABLES.md + figures (PNG 160 dpi + SVG)
                                                   ->  CARDIAC_MRI_DECK_DRAFT.pptx   (tools/report/build_deck.py)

USAGE (from the repository root; PowerShell, one line)
    python tools/report/build_report_assets.py --runs-root <cardiac-runs dir> `
        --runs EXP-D-025 EXP-D-050 EXP-D-100 EXP-D-PP `
        --comparisons <cardiac-runs dir>/_holdout_d39/comparisons `
        --out management/presentation/final [--local-out <dir outside git>]

When the UNet results exist, add the runs (and re-run `ml.evaluate compare` for the pairs you want to show):
        --runs EXP-D-025 EXP-D-050 EXP-D-100 EXP-D-PP EXP-U-025 EXP-U-050 EXP-U-100

WHAT IS PUBLIC AND WHAT IS NOT
    The repository is public. Everything written to --out is an AGGREGATE: means, medians, quartiles, SDs,
    bootstrap CIs, paired deltas, counts of cases, per-epoch validation means, per-position means over cases.
    No per-case value, no case identifier, no MRI or mask pixel is written there. The builder renders the text outputs
    (the aggregate, the tables, the SVG figures) into a private staging folder, scans them there, and fails (exit 2)
    if it finds a CASE_ identifier, an IPv4-like literal or an absolute path: --out is written only after a clean
    scan, so a refused run leaves --out exactly as it was. The PNG figures are not scanned (they are drawn from the
    same aggregates).
    The two per-case figures (strip plot, raw-vs-processed scatter) go ONLY to --local-out, which defaults to
    <runs-root>/_report_local and is refused if it lies inside a git work tree.

INPUT LAYOUT (read only; nothing under --runs-root is modified)
    <runs-root>/<RUN>/evaluation/final_holdout/{metrics_summary,per_case_metrics,per_slice_metrics}.json
    <runs-root>/<RUN>/{run_manifest,run_state}.json, train_log.jsonl      (training runs only; EXP-D-PP has none)
    <comparisons>/*.json                                                  (ml-paired-comparison/1)
    <runs-root>/_gate_img_01/gate_run.json                                (GATE-IMG-01 validation candidates)
A run that is missing or incomplete is skipped with a warning (and listed under "skipped_runs"), never a crash.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_common import (AQUA, AXIS, BLUE, FAMILY_NAME, GRID, INK, INK2, MINUS, MUTED, NBSP, ORANGE,  # noqa: E402
                           QUESTION_NAME, SURFACE, ci_text, fraction_tint, nb, pct, run_color, sgn, thou, tint, vn)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "management" / "presentation" / "final"
FORMAT = "cardiac-results-aggregate/1"
BINS = 20                 # normalized slice position bins for the profile
SHARP_DROP = 0.10         # an epoch whose validation Dice is >= this far below the previous epoch
PREC = 6                  # decimals kept for 0-1 metrics (display rounding happens once, at the very end)
PREC_PCT = 4              # decimals kept for percent-valued metrics

# GATE-IMG-01 closed candidate list (management/day39/gate_img_01/SELECTION.md). Unknown ids simply get no text.
GATE_OPS = {
    "PP-0": "giữ nguyên mặt nạ thô (tham chiếu)",
    "PP-1": "thành phần liên thông 3D lớn nhất",
    "PP-2": "lấp lỗ 2D → thành phần lớn nhất",
    "PP-3": "đóng 3D → thành phần lớn nhất",
    "PP-4": "mở 3D → thành phần lớn nhất",
    "PP-5": "đóng 3D → lấp lỗ 2D → thành phần lớn nhất",
}

FIGURES = {
    "a": "fig_a_dice_mean_ci",
    "b": "fig_b_data_scarcity",
    "c": "fig_c_gate_img_01",
    "d": "fig_d_slice_profile",
    "e": "fig_e_training_val_dice",
    "f": "fig_f_paired_deltas",
}


def log(msg: str) -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(f"WARN  {msg}", flush=True)


# --------------------------------------------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------------------------------------------
def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def read_jsonl(p: Path) -> list[dict]:
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                warn(f"{p.name}: unreadable line skipped")
    return out


def r4(x) -> float | None:
    """0-1 metrics: kept at 6 decimals so a later 3- or 4-decimal display never double-rounds."""
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), PREC)


def r2(x) -> float | None:
    """percent-valued metrics (RVE): kept at 4 decimals."""
    return None if x is None else round(float(x), PREC_PCT)


class RunRaw:
    """The raw artifacts of one run. Per-case arrays live here only; they never reach the aggregate."""

    def __init__(self, exp_id: str, root: Path):
        self.id = exp_id
        self.dir = root / exp_id
        self.problem: str | None = None
        self.summary = self.per_case = self.per_slice = None
        self.manifest: dict = {}
        self.state: dict = {}
        self.train: list[dict] = []
        self._load()

    def _load(self) -> None:
        if not self.dir.is_dir():
            self.problem = "run directory not found"
            return
        ev = self.dir / "evaluation" / "final_holdout"
        if not (ev / "metrics_summary.json").is_file():
            self.problem = "no evaluation/final_holdout/metrics_summary.json (not evaluated on the holdout yet)"
            return
        try:
            self.summary = load_json(ev / "metrics_summary.json")
            _ = self.summary["cohort"]["metrics"]["dice_3d"]["mean"]
        except Exception as exc:  # noqa: BLE001 - any malformed summary means "skip this run"
            self.problem = f"metrics_summary.json unreadable ({type(exc).__name__})"
            self.summary = None
            return
        if (ev / "per_case_metrics.json").is_file():
            try:
                self.per_case = load_json(ev / "per_case_metrics.json").get("cases")
            except Exception:  # noqa: BLE001
                warn(f"{self.id}: per_case_metrics.json unreadable; per-case figures skipped for this run")
        if (ev / "per_slice_metrics.json").is_file():
            try:
                self.per_slice = load_json(ev / "per_slice_metrics.json").get("cases")
            except Exception:  # noqa: BLE001
                warn(f"{self.id}: per_slice_metrics.json unreadable; no slice profile for this run")
        for name, attr in (("run_manifest.json", "manifest"), ("run_state.json", "state")):
            p = self.dir / name
            if p.is_file():
                try:
                    setattr(self, attr, load_json(p))
                except Exception:  # noqa: BLE001
                    warn(f"{self.id}: {name} unreadable")
        if (self.dir / "train_log.jsonl").is_file():
            self.train = read_jsonl(self.dir / "train_log.jsonl")


ID_RE = re.compile(r"^EXP-([A-Z])-(\d{3}|[A-Z]+)$")
FAMILY_BY_LETTER = {"D": "dinov2", "U": "unet"}
FRACTION_BY_CODE = {"025": 0.25, "050": 0.5, "100": 1.0}


def describe(raw: RunRaw) -> dict:
    """Family, fraction, variant, label of a run: from its manifest first, then from its id; unknown stays unknown."""
    m = ID_RE.match(raw.id)
    fam = raw.manifest.get("model_family")
    if fam not in ("dinov2", "unet"):
        fam = FAMILY_BY_LETTER.get(m.group(1), "other") if m else "other"
    frac = raw.manifest.get("training_fraction")
    if frac is None and m:
        frac = FRACTION_BY_CODE.get(m.group(2))
    variant = raw.summary.get("prediction_variant") or raw.manifest.get("prediction_variant") or "RAW_PREDICTION"
    processed = str(variant).startswith("PROCESSED")
    pp = "none"
    if processed:
        pp = str(raw.manifest.get("postprocessing_version", "")).split(":")[-1] or "PP"
    derived = raw.manifest.get("derived_from")
    derived_id = derived.get("experiment_id") if isinstance(derived, dict) else (derived if isinstance(derived, str) else None)
    train_cases = (raw.manifest.get("training_subset_manifest") or {}).get("case_count")
    if train_cases is None:
        for ev in raw.train:
            if ev.get("event") == "start" and "train_cases" in ev:
                train_cases = ev["train_cases"]
                break
    if fam in ("dinov2", "unet") and frac is not None:
        label = f"{FAMILY_NAME[fam]} {int(round(float(frac) * 100))} %"
        if processed:
            label += f" + {pp}"
    else:
        label = raw.id
        if processed:
            label += " (đã xử lý)"
    return {
        "family": fam,
        "label": label,
        "training_fraction": None if frac is None else float(frac),
        "train_cases": train_cases,
        "variant": variant,
        "postprocessing": pp,
        "derived_from": derived_id,
    }


def metric(raw: RunRaw, name: str) -> dict:
    return raw.summary["cohort"]["metrics"].get(name) or {}


def ci(m: dict) -> list[float] | None:
    c = m.get("ci95_mean")
    return [r4(c["low"]), r4(c["high"])] if c else None


# --------------------------------------------------------------------------------------------------------------
# aggregation: raw artifacts -> the aggregate dict (everything below is an aggregate)
# --------------------------------------------------------------------------------------------------------------
def checkpoint_sha(raw: RunRaw) -> str | None:
    ck = raw.manifest.get("checkpoint")
    ck = ck if isinstance(ck, dict) else {}
    return raw.state.get("best_sha256") or ck.get("sha256") or ck.get("checkpoint_sha256")


def aggregate_run(raw: RunRaw) -> dict:
    d = describe(raw)
    dice, iou = metric(raw, "dice_3d"), metric(raw, "iou_3d")
    rve, fp, fn = metric(raw, "relative_volume_error_percent"), metric(raw, "fp_voxels"), metric(raw, "fn_voxels")
    msd = metric(raw, "mean_slice_dice")
    sens = ((raw.summary.get("holdout_slots") or {}).get("sensitivity_without_suspected_linkage") or {}).get("metrics", {})
    sd = sens.get("dice_3d") or {}
    n = dice.get("n") or raw.summary.get("successful_n")
    rec = {
        "experiment_id": raw.id,
        "training_fraction": d["training_fraction"],
        "variant": d["variant"],
        "dice_mean": r4(dice.get("mean")),
        "dice_ci95": ci(dice),
        "dice_median": r4(dice.get("median")),
        "dice_q1": r4(dice.get("q1")),
        "dice_q3": r4(dice.get("q3")),
        "dice_sd": r4(dice.get("std")),
        "iou_mean": r4(iou.get("mean")),
        "mean_slice_dice": r4(msd.get("mean")),
        "rve_percent_mean": r2(rve.get("mean")),
        "sensitivity_dice_mean": r4(sd.get("mean")),
        # --- additive fields (the day-39 schema stops above) ---
        "family": d["family"],
        "label": d["label"],
        "train_cases": d["train_cases"],
        "postprocessing": d["postprocessing"],
        "derived_from": d["derived_from"],
        "n": n,
        "intended_n": raw.summary.get("intended_n"),
        "iou_ci95": ci(iou),
        "mean_slice_dice_ci95": ci(msd),
        "rve_percent_median": r2(rve.get("median")),
        "rve_percent_ci95": [r2(rve["ci95_mean"]["low"]), r2(rve["ci95_mean"]["high"])] if rve.get("ci95_mean") else None,
        "fp_voxels_mean": None if fp.get("mean") is None else round(float(fp["mean"])),
        "fn_voxels_mean": None if fn.get("mean") is None else round(float(fn["mean"])),
        "sensitivity_n": sd.get("n"),
        "sensitivity_dice_ci95": ci(sd),
        "checkpoint_sha256": checkpoint_sha(raw),
    }
    return rec


def aggregate_comparisons(cmp_dir: Path | None, runs: list[dict]) -> tuple[list[dict], list[str]]:
    """Only paired comparisons written by `ml.evaluate compare` are used. A pair without a file is reported, never
    recomputed here (a second bootstrap implementation could disagree with the official one)."""
    if cmp_dir is None or not cmp_dir.is_dir():
        return [], []
    by_id = {r["experiment_id"]: r for r in runs}
    found = {}
    for p in sorted(cmp_dir.glob("*.json")):
        try:
            d = load_json(p)
        except Exception:  # noqa: BLE001
            warn(f"{p.name}: unreadable comparison skipped")
            continue
        if d.get("format") != "ml-paired-comparison/1":
            continue
        a, b = d.get("run_a"), d.get("run_b")
        if a not in by_id or b not in by_id:
            continue
        prim = (d.get("report") or {}).get("primary_all_holdout")
        if not prim or prim.get("metric", "dice_3d") != "dice_3d":
            continue
        st = prim["paired_statistics"]
        sens = ((d.get("report") or {}).get("sensitivity_without_suspected_linkage") or {}).get("paired_statistics")
        ra, rb = by_id[a], by_id[b]
        rec = {
            "a": a,
            "b": b,
            "mean_delta": r4(st["mean"]),
            "ci95": [r4(st["ci95_mean"]["low"]), r4(st["ci95_mean"]["high"])],
            "b_higher": st.get("n_run_b_higher"),
            "a_higher": st.get("n_run_a_higher"),
            # --- additive ---
            "n_equal": st.get("n_equal"),
            "n": st.get("n_pairs", st.get("n")),
            "question": classify_pair(ra, rb),
            "label": f"{ra['label']} → {rb['label']}",
            "comparable": (prim.get("comparability") or {}).get("label"),
            "sensitivity_mean_delta": r4(sens["mean"]) if sens else None,
            "sensitivity_ci95": [r4(sens["ci95_mean"]["low"]), r4(sens["ci95_mean"]["high"])] if sens else None,
        }
        found[(a, b)] = rec
    order = {r["experiment_id"]: i for i, r in enumerate(runs)}
    comps = sorted(found.values(), key=lambda c: (order[c["a"]], order[c["b"]]))
    return comps, expected_pairs_missing(runs, found)


def classify_pair(a: dict, b: dict) -> str:
    pa, pb = str(a["variant"]).startswith("PROCESSED"), str(b["variant"]).startswith("PROCESSED")
    if pb and not pa and (b.get("derived_from") == a["experiment_id"] or (
            a["family"] == b["family"] and a["training_fraction"] == b["training_fraction"])):
        return "postprocessing"
    if a["family"] != b["family"] and {a["family"], b["family"]} == {"dinov2", "unet"} \
            and a["training_fraction"] == b["training_fraction"] and pa == pb:
        return "model_comparison"
    if a["family"] == b["family"] and not pa and not pb and a["training_fraction"] != b["training_fraction"]:
        return "data_scarcity"
    return "other"


def expected_pairs_missing(runs: list[dict], found: dict) -> list[str]:
    """The comparisons the design calls for, among the runs present, that have no comparison file."""
    miss = []
    raw = [r for r in runs if not str(r["variant"]).startswith("PROCESSED") and r["training_fraction"] is not None]
    for fam in ("dinov2", "unet"):
        fr = sorted((r for r in raw if r["family"] == fam), key=lambda r: r["training_fraction"])
        for i in range(len(fr)):
            for j in range(i + 1, len(fr)):
                if (fr[i]["experiment_id"], fr[j]["experiment_id"]) not in found:
                    miss.append(f"{fr[i]['experiment_id']} → {fr[j]['experiment_id']}")
    for r in runs:
        if str(r["variant"]).startswith("PROCESSED") and r.get("derived_from"):
            if (r["derived_from"], r["experiment_id"]) not in found and r["derived_from"] in {x["experiment_id"] for x in runs}:
                miss.append(f"{r['derived_from']} → {r['experiment_id']}")
    by_frac = {}
    for r in raw:
        by_frac.setdefault(r["training_fraction"], {})[r["family"]] = r
    for frac, fams in sorted(by_frac.items()):
        if "dinov2" in fams and "unet" in fams:
            pair = (fams["dinov2"]["experiment_id"], fams["unet"]["experiment_id"])
            alt = (pair[1], pair[0])
            if pair not in found and alt not in found:
                miss.append(f"{pair[0]} → {pair[1]}")
    return miss


def aggregate_profile(raws: list[RunRaw], bins: int) -> dict | None:
    """Mean per-slice Dice along normalized slice position: per case and bin the mean over its applicable slices,
    then the mean over the cases that have at least one applicable slice in the bin (an aggregate)."""
    usable = [r for r in raws if r.per_slice]
    if not usable:
        return None
    out_runs, gt_frac = [], None
    for r in usable:
        per_bin = [[] for _ in range(bins)]
        gt_present = [[] for _ in range(bins)]
        for _cid, slices in r.per_slice.items():
            case_bin = [[] for _ in range(bins)]
            has_gt = [False] * bins
            for s in slices:
                b = min(int(float(s["normalized_position"]) * bins), bins - 1)
                if s.get("dice_status") == "VALUE":
                    case_bin[b].append(float(s["dice"]))
                if (s.get("ref_voxels") or 0) > 0:
                    has_gt[b] = True
            for b in range(bins):
                if case_bin[b]:
                    per_bin[b].append(float(np.mean(case_bin[b])))
                gt_present[b].append(has_gt[b])
        out_runs.append({
            "experiment_id": r.id,
            "mean_dice": [r4(np.mean(v)) if v else None for v in per_bin],
            "n_cases": [len(v) for v in per_bin],
        })
        if gt_frac is None:
            gt_frac = [r4(np.mean(v)) for v in gt_present]
    return {
        "bins": bins,
        "bin_centers": [r4((i + 0.5) / bins) for i in range(bins)],
        "definition": ("Dice 2D theo lát (ml-eval-1.0.0). Mỗi case: trung bình các lát áp dụng được trong bin; sau đó trung bình "
                       "trên các case có ít nhất một lát áp dụng được. Lát mà cả hai mặt nạ rỗng bị loại (NOT_APPLICABLE)."),
        "gt_case_fraction": gt_frac,
        "runs": out_runs,
    }


def aggregate_training(raw: RunRaw) -> dict | None:
    if not raw.train:
        return None
    epochs: dict[int, dict] = {}
    start = {}
    for ev in raw.train:
        if ev.get("event") == "epoch" and isinstance(ev.get("epoch"), int):
            epochs[ev["epoch"]] = ev           # a resumed run repeats nothing, but keep the last record per epoch
        elif ev.get("event") == "start" and not start:
            start = ev
    if not epochs:
        return None
    ks = sorted(epochs)
    val = [epochs[k].get("val_mean_dice_3d") for k in ks]
    loss = [epochs[k].get("train_loss_mean") for k in ks]
    vv = [v for v in val if v is not None]
    best_epoch = raw.state.get("best_epoch")
    best = raw.state.get("best_val_mean_dice_3d")
    if best_epoch is None and vv:
        best_epoch = ks[val.index(max(vv))]          # first maximum: ties keep the earlier epoch
        best = max(vv)
    drops = sum(1 for i in range(1, len(val)) if val[i] is not None and val[i - 1] is not None and val[i - 1] - val[i] >= SHARP_DROP)
    secs = 0.0
    for k in ks:
        wt = epochs[k].get("wall_time_s") or {}
        secs += float(wt.get("epoch", sum(v for v in wt.values() if isinstance(v, (int, float)))))
    return {
        "experiment_id": raw.id,
        "epochs_done": len(ks),
        "epochs_planned": epochs[ks[-1]].get("epochs"),
        "best_epoch": best_epoch,
        "best_val_dice": r4(best),
        "final_val_dice": r4(val[-1]),
        "min_val_dice": r4(min(vv)) if vv else None,
        "sharp_drop_epochs": drops,
        "sharp_drop_rule": "epoch có Dice validation thấp hơn epoch trước ≥ " + f"{SHARP_DROP:.2f}".replace(".", ","),
        "train_hours_sum_of_epochs": round(secs / 3600, 2),
        "train_cases": start.get("train_cases"),
        "train_slices": start.get("train_slices"),
        "validation_cases": start.get("validation_cases"),
        "val_dice_by_epoch": [r4(v) for v in val],
        "train_loss_by_epoch": [r4(v) for v in loss],
        "status": raw.state.get("status"),
    }


def aggregate_gate(gate_dir: Path | None) -> tuple[list[dict], dict | None]:
    if gate_dir is None or not (gate_dir / "gate_run.json").is_file():
        return [], None
    g = load_json(gate_dir / "gate_run.json")
    sel = g.get("selection") or {}
    cands = []
    for cid, c in (g.get("candidates") or {}).items():
        cands.append({
            "id": cid,
            "dice": r4(c.get("mean_dice_3d")),
            "iou": r4(c.get("mean_iou_3d")),
            "abs_rve_percent": r2(c.get("mean_abs_rve_percent")),
            "cases_above_pp0": c.get("cases_above_pp0"),
            "cases_below_pp0": c.get("cases_below_pp0"),
            "operations": GATE_OPS.get(cid),
            "selected": cid == sel.get("winner"),
        })
    cands.sort(key=lambda c: c["id"])
    meta = {
        "population": g.get("population"),
        "n": g.get("intended_n"),
        "source_experiment": g.get("source_experiment"),
        "winner": sel.get("winner"),
        "delta_vs_pp0": r4(sel.get("delta_vs_pp0")),
        "change_vs_pp0": sel.get("change_vs_pp0"),
        "tie_tolerance": g.get("tie_tolerance"),
        "frozen_config_sha256": g.get("frozen_config_sha256"),
        "checkpoint_id": (g.get("checkpoint") or {}).get("checkpoint_id"),
    }
    return cands, meta


def aggregate_split(raws: list[RunRaw]) -> dict | None:
    for r in raws:
        p = r.dir / "manifests" / "split_manifest.json"
        if not p.is_file():
            continue
        try:
            sm = load_json(p)
            parts = sm["partitions"]
            subs = sm.get("training_subsets", {})
            return {
                "split_id": (r.manifest.get("split_manifest") or {}).get("manifest_id") if isinstance(r.manifest.get("split_manifest"), dict) else sm.get("split_id"),
                "split_sha256": (r.manifest.get("split_manifest") or {}).get("sha256") if isinstance(r.manifest.get("split_manifest"), dict) else None,
                "seed": (sm.get("randomization") or {}).get("seed"),
                "train_nominal": parts["train"]["case_count"],
                "train_effective": parts["train"].get("effective_training_case_count"),
                "validation": parts["validation"]["case_count"],
                "final_holdout": parts["final_holdout"]["case_count"],
                "subsets_effective": {k: v.get("effective_case_count") for k, v in subs.items()},
                "subsets_nominal": {k: v.get("nominal_case_count") for k, v in subs.items()},
                "training_excluded_n": len((sm.get("training_exclusions") or {}).get("all_excluded_case_ids") or []),
                "sensitivity_excluded_n": len((sm.get("sensitivity_analysis") or {}).get("suspected_holdout_case_ids", [])),
            }
        except Exception:  # noqa: BLE001
            warn(f"{r.id}: split manifest unreadable")
    return None


def outlier_rule(raws: list[RunRaw]) -> dict | None:
    for r in raws:
        o = (r.summary.get("cohort") or {}).get("outlier_selection")
        if o:
            return {k: o[k] for k in ("rule_id", "selection_version", "metric_version", "rule") if k in o}
    return None


def build_aggregate(raws: list[RunRaw], skipped: list[dict], cmp_dir: Path | None, gate_dir: Path | None,
                    bins: int) -> dict:
    runs = [aggregate_run(r) for r in raws]
    by_id = {r["experiment_id"]: r for r in runs}
    for r in runs:                      # a processed run trains nothing: show its source run's training size
        src = by_id.get(r.get("derived_from") or "")
        if r["train_cases"] is None and src is not None:
            r["train_cases"] = src["train_cases"]
    comps, missing = aggregate_comparisons(cmp_dir, runs)
    gate, gate_meta = aggregate_gate(gate_dir)
    versions = {r.summary.get("evaluation_metric_version") for r in raws}
    ns = {r["n"] for r in runs if r["n"]}
    if len(ns) > 1:
        warn(f"runs have different n ({sorted(ns)}); the top-level n is the largest")
    boot = next((r.summary.get("bootstrap") for r in raws if r.summary.get("bootstrap")), None)
    codes = {}
    for r in raws:
        em = r.dir / "evaluation" / "final_holdout" / "evaluation_manifest.json"
        if em.is_file():
            try:
                codes[r.id] = load_json(em).get("evaluation_code_version")
            except Exception:  # noqa: BLE001
                pass
    agg = {
        "format": FORMAT,
        "population": (raws[0].summary.get("population") or {}).get("partition", "final_holdout") if raws else "final_holdout",
        "n": max(ns) if ns else None,
        "metric_version": sorted(v for v in versions if v)[0] if versions else None,
        "note": "aggregates only; per-case values stay outside git",
        "runs": runs,
        "comparisons": comps,
        "gate_img_01_validation": gate,
    }
    if gate_meta:
        agg["gate_img_01"] = gate_meta
    agg["bootstrap"] = boot
    agg["split"] = aggregate_split(raws)
    agg["outlier_rule"] = outlier_rule(raws)
    agg["evaluation_code_versions"] = codes or None
    agg["slice_profile"] = aggregate_profile(raws, bins)
    agg["training"] = [t for t in (aggregate_training(r) for r in raws) if t]
    if missing:
        agg["missing_comparisons"] = missing
    if skipped:
        agg["skipped_runs"] = skipped
    return agg


# --------------------------------------------------------------------------------------------------------------
# JSON writer: dicts multi-line, scalar lists inline (keeps the file readable in a GitHub diff)
# --------------------------------------------------------------------------------------------------------------
def dump_json(o, level: int = 0) -> str:
    pad = " " * (level + 1)
    if isinstance(o, dict):
        if not o:
            return "{}"
        items = [f'{pad}{json.dumps(k, ensure_ascii=False)}: {dump_json(v, level + 1)}' for k, v in o.items()]
        return "{\n" + ",\n".join(items) + "\n" + " " * level + "}"
    if isinstance(o, list):
        if all(not isinstance(x, (dict, list)) for x in o):
            return json.dumps(o, ensure_ascii=False)
        items = [f"{pad}{dump_json(v, level + 1)}" for v in o]
        return "[\n" + ",\n".join(items) + "\n" + " " * level + "]"
    return json.dumps(o, ensure_ascii=False)


# --------------------------------------------------------------------------------------------------------------
# tables (Vietnamese Markdown; aggregates only)
# --------------------------------------------------------------------------------------------------------------
def md_table(header: list[str], rows: list[list[str]], align: list[str] | None = None) -> str:
    align = align or ["---"] * len(header)
    out = ["| " + " | ".join(header) + " |", "| " + " | ".join(align) + " |"]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


def variant_short(v: str) -> str:
    return "ĐÃ XỬ LÝ" if str(v).startswith("PROCESSED") else "THÔ"


def build_tables_md(agg: dict, fig_dir_rel: str) -> str:
    runs, comps = agg["runs"], agg["comparisons"]
    n = agg["n"]
    split = agg.get("split") or {}
    boot = agg.get("bootstrap") or {}
    L: list[str] = []
    L.append("# Bảng kết quả trên tập holdout khoá (sinh tự động)")
    L.append("")
    L.append("> Tệp này do `tools/report/build_report_assets.py` sinh từ artifact thí nghiệm. **Không sửa tay**: chạy lại lệnh trong "
             "`README.md` cùng thư mục. Chỉ có số **tổng hợp** (trung bình, trung vị, tứ phân vị, SD, CI bootstrap, delta cặp, "
             "số case); không có giá trị theo từng case, không có mã case, không có ảnh MRI hay mặt nạ.")
    L.append("")
    meta = [["Quần thể", f"`{agg['population']}`, n = {n} case"],
            ["Phiên bản chỉ số", f"`{agg['metric_version']}` (Dice/IoU 3D theo từng case; voxel không bao giờ gộp giữa các case)"]]
    if boot:
        meta.append(["Khoảng tin cậy", f"CI {int(round(boot.get('level', .95) * 100))} % = bootstrap phân vị của trung bình theo case, "
                                       f"{thou(boot.get('resamples'))} lần lấy mẫu lại, seed {boot.get('seed')}"])
    if split:
        meta.append(["Chia dữ liệu đóng băng", f"`{split.get('split_id')}` — train danh nghĩa {split.get('train_nominal')} "
                                               f"(hiệu dụng {split.get('train_effective')}), validation {split.get('validation')}, "
                                               f"holdout {split.get('final_holdout')}"])
    meta.append(["Hình học", "đơn vị voxel; spacing là placeholder đơn vị (GATE-DATA-01 F2); RVE tính theo số voxel của ground truth"])
    L.append(md_table(["Mục", "Giá trị"], meta))
    L.append("")

    # 1 main results
    L.append(f"## 1 · Kết quả chính (n = {n})")
    L.append("")
    rows = []
    for r in runs:
        rows.append([
            f"`{r['experiment_id']}` {nb(r['label'])}", variant_short(r["variant"]),
            str(r["train_cases"]) if r["train_cases"] is not None else "—",
            f"**{vn(r['dice_mean'], 4)}** {ci_text(r['dice_ci95'], 4)}",
            f"{vn(r['dice_median'], 4)} ({vn(r['dice_q1'], 4)}–{vn(r['dice_q3'], 4)})",
            vn(r["dice_sd"], 4),
            f"{vn(r['iou_mean'], 4)} {ci_text(r['iou_ci95'], 4)}",
            vn(r["mean_slice_dice"], 4),
            f"{pct(r['rve_percent_mean'], 2, True)} / {pct(r['rve_percent_median'], 2, True)}",
            thou(r["fp_voxels_mean"]) if r["fp_voxels_mean"] is not None else "—",
            thou(r["fn_voxels_mean"]) if r["fn_voxels_mean"] is not None else "—",
        ])
    L.append(md_table(["Run", "Mặt nạ", "Case train", "Dice 3D TB [CI 95 %]", "Trung vị (Q1–Q3)", "SD", "IoU 3D TB [CI 95 %]",
                       "Dice TB theo lát", "RVE TB / trung vị", "FP voxel TB", "FN voxel TB"], rows))
    L.append("")
    L.append("Mặt nạ THÔ = dự đoán gốc của mô hình (ngưỡng 0,5); ĐÃ XỬ LÝ = sau hình thái học đã đóng băng "
             "(GATE-IMG-01). RVE = (V dự đoán − V ground truth) / V ground truth, tính theo voxel. FP/FN theo voxel, trung bình theo case. "
             "SD là độ lệch chuẩn mẫu (ddof = 1).")
    L.append("")
    L.append(f"![Dice 3D trung bình và CI 95 % theo run]({fig_dir_rel}/{FIGURES['a']}.png)")
    L.append("")

    # 2 paired
    L.append("## 2 · So sánh cặp từng case (run B − run A, Dice 3D)")
    L.append("")
    if comps:
        rows = []
        for c in comps:
            rows.append([f"`{c['a']}` → `{c['b']}`", QUESTION_NAME.get(c["question"], c["question"]),
                         f"**{sgn(c['mean_delta'], 4)}** {ci_text(c['ci95'], 4, True)}",
                         "chứa 0" if c["ci95"][0] <= 0 <= c["ci95"][1] else "không chứa 0",
                         f"{c['b_higher']} / {c['a_higher']}" + (f" (bằng nhau {c['n_equal']})" if c.get("n_equal") else ""),
                         str(c.get("comparable") or "—")])
        L.append(md_table(["A → B", "Câu hỏi", "Δ TB [CI 95 %]", "CI so với 0", "Case B tốt hơn / A tốt hơn", "Nhãn so sánh"], rows))
        L.append("")
        L.append(f"{len(comps)} CI **không** được hiệu chỉnh đa so sánh. Mỗi mức dữ liệu là một run, một seed: chênh lệch giữa các mức "
                 "gồm cả phương sai giữa các lần chạy mà thiết kế này không tách ra được. Ứng dụng cố ý trả `comparable: false` cho "
                 "cặp mặt nạ THÔ với ĐÃ XỬ LÝ; dòng hậu xử lý là phân tích ablation ngoại tuyến (spec `08` §2).")
        L.append("")
        L.append(f"![Delta Dice theo cặp (forest plot)]({fig_dir_rel}/{FIGURES['f']}.png)")
    else:
        L.append("_Chưa có tệp so sánh cặp (`ml.evaluate compare`) cho các run này._")
    if agg.get("missing_comparisons"):
        L.append("")
        L.append("Cặp chưa có tệp so sánh (chạy `python -m ml.evaluate compare` rồi chạy lại bộ dựng): "
                 + "; ".join(f"`{m}`" for m in agg["missing_comparisons"]) + ".")
    L.append("")

    # data scarcity figure
    L.append("## 3 · Ít dữ liệu: Dice theo số case huấn luyện")
    L.append("")
    L.append(f"![Dice 3D theo số case train hiệu dụng]({fig_dir_rel}/{FIGURES['b']}.png)")
    L.append("")

    # 4 sensitivity
    L.append("## 4 · Tập độ nhạy (bỏ case nghi trùng bệnh nhân, DR-002b)")
    L.append("")
    rows = []
    for r in runs:
        if r.get("sensitivity_dice_mean") is None:
            continue
        rows.append([f"`{r['experiment_id']}` {nb(r['label'])}", f"{vn(r['dice_mean'], 4)} (n = {r['n']})",
                     f"{vn(r['sensitivity_dice_mean'], 4)} (n = {r['sensitivity_n']})",
                     sgn(r["sensitivity_dice_mean"] - r["dice_mean"], 4)])
    if rows:
        L.append(md_table(["Run", "Dice TB, quần thể chính", "Dice TB, tập độ nhạy", "Chênh"], rows))
        sens_c = [c for c in comps if c.get("sensitivity_mean_delta") is not None]
        if sens_c:
            L.append("")
            L.append(md_table(["A → B", "Δ TB chính [CI 95 %]", "Δ TB độ nhạy [CI 95 %]"],
                              [[f"`{c['a']}` → `{c['b']}`", f"{sgn(c['mean_delta'], 4)} {ci_text(c['ci95'], 4, True)}",
                                f"{sgn(c['sensitivity_mean_delta'], 4)} {ci_text(c['sensitivity_ci95'], 4, True)}"] for c in sens_c]))
    else:
        L.append("_Không có tập độ nhạy trong các artifact._")
    L.append("")

    # 5 GATE-IMG-01
    gate = agg.get("gate_img_01_validation") or []
    gm = agg.get("gate_img_01") or {}
    L.append("## 5 · GATE-IMG-01: ứng viên hậu xử lý trên validation")
    L.append("")
    if gate:
        nv = gm.get("n")
        L.append(f"Chọn chỉ bằng validation (n = {nv}), danh sách ứng viên và luật chọn được ghi vào repo trước khi chạy. "
                 f"Người thắng: **{gm.get('winner')}**, hơn PP-0 {sgn(gm.get('delta_vs_pp0'), 4)} Dice; ngưỡng hoà "
                 f"{vn(gm.get('tie_tolerance'), 3)}; cấu hình đóng băng sha256 `{(gm.get('frozen_config_sha256') or '')[:8]}…`.")
        L.append("")
        rows = [[f"{'**' if c['selected'] else ''}{c['id']}{'**' if c['selected'] else ''}", c.get("operations") or "—", vn(c["dice"], 4),
                 vn(c["iou"], 4), vn(c["abs_rve_percent"], 2),
                 f"{c['cases_above_pp0']} / {c['cases_below_pp0']}" if c["id"] != "PP-0" else "—"] for c in gate]
        L.append(md_table(["Ứng viên", "Thao tác theo thứ tự", "Dice 3D TB", "IoU 3D TB", "RVE tuyệt đối TB (%)", "Case trên / dưới PP-0"], rows))
        L.append("")
        L.append("Đây là số validation dùng để **chọn** cấu hình, không phải kết quả; 20 case validation cũng đã chọn checkpoint.")
        L.append("")
        L.append(f"![Ứng viên GATE-IMG-01 trên validation]({fig_dir_rel}/{FIGURES['c']}.png)")
    else:
        L.append("_Không tìm thấy `gate_run.json` (GATE-IMG-01)._")
    L.append("")

    # 6 slice profile
    prof = agg.get("slice_profile")
    L.append("## 6 · Profile Dice theo vị trí lát")
    L.append("")
    if prof:
        L.append(f"{prof['definition']} {prof['bins']} bin trên vị trí lát đã chuẩn hoá [0, 1]; số case đóng góp từng bin nằm trong "
                 "`results_aggregate.json` (`slice_profile.runs[].n_cases`). Ở hai đầu stack ground truth thường vắng nên Dice lát bằng 0 "
                 "ngay cả khi mô hình chỉ sai nhẹ; hậu xử lý xoá bớt dự đoán thừa ở đó, và lát cả hai rỗng rời khỏi phép trung bình.")
        L.append("")
        L.append(f"![Dice theo vị trí lát]({fig_dir_rel}/{FIGURES['d']}.png)")
    else:
        L.append("_Không có `per_slice_metrics.json`._")
    L.append("")

    # 7 training
    tr = agg.get("training") or []
    L.append("## 7 · Huấn luyện")
    L.append("")
    if tr:
        by = {r["experiment_id"]: r for r in runs}
        rows = []
        for t in tr:
            lab = nb(by[t["experiment_id"]]["label"]) if t["experiment_id"] in by else t["experiment_id"]
            rows.append([f"`{t['experiment_id']}` {lab}", str(t["train_cases"] or "—"), f"{t['epochs_done']}/{t['epochs_planned']}",
                         f"{t['best_epoch']} ({vn(t['best_val_dice'], 4)})", vn(t["final_val_dice"], 4), vn(t["min_val_dice"], 4),
                         str(t["sharp_drop_epochs"]), vn(t["train_hours_sum_of_epochs"], 1)])
        L.append(md_table(["Run", "Case train", "Epoch", "Epoch tốt nhất (Dice validation)", "Dice validation epoch cuối",
                           "Dice validation thấp nhất", "Số lần tụt mạnh", "Giờ huấn luyện (tổng các epoch)"], rows))
        L.append("")
        L.append(f"Dice validation là trung bình 3D trên {tr[0].get('validation_cases') or 20} case validation, chỉ dùng để chọn checkpoint. "
                 f"\"Tụt mạnh\" = {tr[0]['sharp_drop_rule']}. EXP-D-PP không huấn luyện (hậu xử lý dự đoán của EXP-D-100).")
        L.append("")
        L.append(f"![Dice validation theo epoch]({fig_dir_rel}/{FIGURES['e']}.png)")
    else:
        L.append("_Không có `train_log.jsonl`._")
    L.append("")

    # 8 provenance
    L.append("## 8 · Nguồn gốc")
    L.append("")
    prov = []
    for r in runs:
        sha = r.get("checkpoint_sha256")
        prov.append([f"`{r['experiment_id']}`", f"`{sha[:8]}…{sha[-5:]}`" if sha else "—",
                     f"`{(agg.get('evaluation_code_versions') or {}).get(r['experiment_id'], '—')[:12]}`"])
    L.append(md_table(["Run", "Checkpoint best.pt (sha256)", "Mã chấm điểm (git)"], prov))
    if agg.get("skipped_runs"):
        L.append("")
        L.append("Run bị bỏ qua: " + "; ".join(f"`{s['experiment_id']}` ({s['reason']})" for s in agg["skipped_runs"]) + ".")
    L.append("")
    return "\n".join(L)


# --------------------------------------------------------------------------------------------------------------
# figures
# --------------------------------------------------------------------------------------------------------------
FONT_SCALE = 1.2          # figures are shrunk to ~90 % on a slide: draw their text large enough to read from the back of a room


def fs(x: float) -> float:
    return round(x * FONT_SCALE, 1)


def setup_mpl():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Segoe UI", "Arial", "Helvetica", "DejaVu Sans"],
        "svg.fonttype": "path",
        "svg.hashsalt": "cardiac-report",
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": AXIS, "axes.labelcolor": INK2, "axes.linewidth": 0.8,
        "xtick.color": MUTED, "ytick.color": MUTED, "text.color": INK,
        "axes.spines.top": False, "axes.spines.right": False,
        "grid.color": GRID, "grid.linewidth": 0.8, "grid.linestyle": "-",
        "font.size": fs(10.5), "axes.labelsize": fs(10.5), "xtick.labelsize": fs(10), "ytick.labelsize": fs(10),
        "legend.frameon": False, "legend.fontsize": fs(10),
    })
    return plt


def comma_fmt(nd: int = 2):
    from matplotlib.ticker import FuncFormatter
    return FuncFormatter(lambda v, _p: f"{v:.{nd}f}".replace(".", ",").replace("-", MINUS))


def save_fig(plt, fig, out_dir: Path, name: str, formats=("png", "svg")) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for ext in formats:
        p = out_dir / f"{name}.{ext}"
        if ext == "png":
            fig.savefig(p, dpi=160, metadata={"Software": None})
        else:
            fig.savefig(p, metadata={"Date": None})
            text = p.read_text(encoding="utf-8")
            # path data wraps lines after a trailing space; that whitespace is insignificant to XML, and a clean
            # diff (git diff --check) is worth more than byte-identity with matplotlib's raw output
            p.write_text(re.sub(r"[ \t]+$", "", text, flags=re.M), encoding="utf-8", newline="\n")
        paths.append(p)
    plt.close(fig)
    return paths


def footnote(fig, text: str) -> None:
    import textwrap
    fig.text(0.012, 0.012, "\n".join(textwrap.wrap(text, 112)), color=MUTED, fontsize=fs(8.5), ha="left", va="bottom", linespacing=1.25)


def marker_for(run: dict) -> str:
    if str(run.get("variant", "")).startswith("PROCESSED"):
        return "D"
    return "s" if run.get("family") == "unet" else "o"


def legend_handles(runs: list[dict]):
    from matplotlib.lines import Line2D
    seen, hs = set(), []
    for r in runs:
        key = (run_color(r), marker_for(r))
        if key in seen:
            continue
        seen.add(key)
        if str(r["variant"]).startswith("PROCESSED"):
            lab = f"Đã hậu xử lý ({r.get('postprocessing') or 'PP'})"
        else:
            lab = f"{FAMILY_NAME.get(r['family'], r['family'])} (mặt nạ thô)"
        hs.append(Line2D([0], [0], color=run_color(r), lw=2, marker=marker_for(r), ms=8, mec=SURFACE, mew=1.5, label=lab))
    return hs


def y_limits(vals: list[float], pad_lo: float, pad_hi: float, step: float = 0.05) -> tuple[float, float]:
    lo, hi = min(vals) - pad_lo, max(vals) + pad_hi
    return math.floor(lo / step) * step, math.ceil(hi / step) * step


def fig_a(plt, agg, out_dir):
    runs = agg["runs"]
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    fig.subplots_adjust(left=0.235, right=0.97, top=0.87, bottom=0.2)
    ys = list(range(len(runs)))[::-1]
    xlo, xhi = y_limits([r["dice_ci95"][0] for r in runs] + [r["dice_ci95"][1] for r in runs], 0.03, 0.07)
    ax.set_xlim(xlo, xhi)
    ax.set_ylim(-0.7, len(runs) - 0.3)
    ax.xaxis.set_major_formatter(comma_fmt(2))
    ax.grid(axis="x")
    ax.set_axisbelow(True)
    for r, y in zip(runs, ys):
        col = run_color(r)
        a, b = r["dice_ci95"]
        ax.plot([a, b], [y, y], color=col, lw=1.8, solid_capstyle="round", zorder=2)
        for e in (a, b):
            ax.plot([e, e], [y - 0.13, y + 0.13], color=col, lw=1.8, zorder=2)
        ax.plot(r["dice_mean"], y, marker=marker_for(r), ms=10, mfc=col, mec=SURFACE, mew=2, zorder=3, ls="none")
        ax.text(b + 0.007, y, vn(r["dice_mean"]), va="center", ha="left", color=INK, fontsize=fs(11.5), fontweight="semibold")
    ax.set_yticks(ys)
    ax.set_yticklabels([nb(r["label"]) for r in runs], color=INK, fontsize=fs(11))
    ax.tick_params(axis="y", length=0)
    ax.set_xlabel(f"Dice 3D trung bình trên {agg['n']} case holdout (vạch = khoảng tin cậy 95 %)")
    fig.legend(handles=legend_handles(runs), loc="upper left", bbox_to_anchor=(0.012, 0.985), ncol=3, handletextpad=0.4,
               columnspacing=1.6)
    boot = agg.get("bootstrap") or {}
    footnote(fig, f"Dice 3D theo từng case, trung bình trên n = {agg['n']}; CI 95 % = bootstrap của trung bình theo case "
                  f"({thou(boot.get('resamples', 10000))} lần, seed {boot.get('seed', 2024)}).")
    return save_fig(plt, fig, out_dir, FIGURES["a"])


def fig_b(plt, agg, out_dir):
    runs = agg["runs"]
    raw = [r for r in runs if not str(r["variant"]).startswith("PROCESSED") and r.get("training_fraction")]
    pps = [r for r in runs if str(r["variant"]).startswith("PROCESSED") and r.get("training_fraction")]
    by_id = {r["experiment_id"]: r for r in runs}
    top = max([r["train_cases"] or 0 for r in raw] or [1]) or 1

    def xpos(r):
        return r["train_cases"] if r.get("train_cases") else r["training_fraction"] * top

    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    fig.subplots_adjust(left=0.1, right=0.97, top=0.88, bottom=0.265)
    allv = [v for r in raw + pps for v in r["dice_ci95"]]
    ylo, yhi = y_limits(allv, 0.04, 0.05)
    ax.set_ylim(ylo, yhi)
    xs_all = sorted({xpos(r) for r in raw})
    span = (max(xs_all) - min(xs_all)) if len(xs_all) > 1 else max(xs_all[0], 1)
    dx = 0.05 * span
    ax.set_xlim(min(xs_all) - 0.07 * span, max(xs_all) + 0.2 * span)
    ax.yaxis.set_major_formatter(comma_fmt(2))
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    fams = {}
    for r in raw:
        fams.setdefault(r["family"], []).append(r)
    for fam, rs in fams.items():
        rs.sort(key=xpos)
        col = run_color(rs[0])
        x = [xpos(r) for r in rs]
        ax.fill_between(x, [r["dice_ci95"][0] for r in rs], [r["dice_ci95"][1] for r in rs], color=col, alpha=0.14, lw=0, zorder=1)
        ax.plot(x, [r["dice_mean"] for r in rs], color=col, lw=2, zorder=2)
        ax.plot(x, [r["dice_mean"] for r in rs], color=col, marker=marker_for(rs[0]), ms=10, mfc=col, mec=SURFACE, mew=2, ls="none", zorder=3)
    # value labels: the family that is higher at an x is labelled above, the others below
    for xv in xs_all:
        here = sorted((r for r in raw if xpos(r) == xv), key=lambda r: -r["dice_mean"])
        for i, r in enumerate(here):
            above = i == 0
            ax.annotate(vn(r["dice_mean"]), (xv, r["dice_mean"]), xytext=(0, 13 if above else -19), textcoords="offset points",
                        ha="center", color=INK, fontsize=fs(11), fontweight="semibold")
    for r in pps:
        src = by_id.get(r.get("derived_from") or "")
        x0 = xpos(src) if src else xpos(r)
        x = x0 + dx
        col = run_color(r)
        a, b = r["dice_ci95"]
        ax.plot([x, x], [a, b], color=col, lw=1.8, zorder=2)
        for e in (a, b):
            ax.plot([x - 0.012 * span, x + 0.012 * span], [e, e], color=col, lw=1.8, zorder=2)
        ax.plot(x, r["dice_mean"], marker="D", ms=9, mfc=col, mec=SURFACE, mew=2, ls="none", zorder=3)
        ax.annotate(f"{r.get('postprocessing') or 'PP'}  {vn(r['dice_mean'])}", (x, r["dice_mean"]), xytext=(11, -4),
                    textcoords="offset points", ha="left", color=INK, fontsize=fs(11), fontweight="semibold")
    ticks = []
    for xv in xs_all:
        r = next(r for r in raw if xpos(r) == xv)
        ticks.append(f"{int(round(r['training_fraction'] * 100))}{NBSP}%\n{r['train_cases']} case" if r.get("train_cases")
                     else f"{int(round(r['training_fraction'] * 100))}{NBSP}%")
    ax.set_xticks(xs_all)
    ax.set_xticklabels(ticks)
    ax.set_xlabel("Tỉ lệ dữ liệu huấn luyện (số case hiệu dụng; các tập lồng nhau)")
    ax.set_ylabel(f"Dice 3D trung bình, n = {agg['n']} case holdout")
    fig.legend(handles=legend_handles(raw + pps), loc="upper left", bbox_to_anchor=(0.012, 0.985), ncol=3, handletextpad=0.4, columnspacing=1.6)
    footnote(fig, "Vùng mờ và vạch = CI 95 % bootstrap của trung bình. Mỗi mức dữ liệu là một run (một seed). "
                  "Hậu xử lý áp lên dự đoán của run 100 %, không phải một mức dữ liệu riêng.")
    return save_fig(plt, fig, out_dir, FIGURES["b"])


def fig_c(plt, agg, out_dir):
    cands = agg.get("gate_img_01_validation") or []
    if not cands:
        return []
    meta = agg.get("gate_img_01") or {}
    winner = meta.get("winner")
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    fig.subplots_adjust(left=0.43, right=0.965, top=0.87, bottom=0.23)
    ys = list(range(len(cands)))[::-1]
    vals = [c["dice"] for c in cands]
    xlo, xhi = min(vals) - 0.006, max(vals) + 0.03
    ax.set_xlim(xlo, xhi)
    ax.set_ylim(-0.7, len(cands) - 0.3)
    ax.xaxis.set_major_formatter(comma_fmt(3))
    ax.grid(axis="x")
    ax.set_axisbelow(True)
    ax.spines["left"].set_visible(False)
    ref = next((c for c in cands if c["id"] == "PP-0"), None)
    for c, y in zip(cands, ys):
        col = BLUE if c["id"] == "PP-0" else ORANGE if c["id"] == winner else MUTED
        ax.axhline(y, color=GRID, lw=0.8, zorder=0)
        ax.plot(c["dice"], y, marker="o", ms=11 if c["id"] == winner else 9, mfc=col, mec=SURFACE, mew=2, ls="none", zorder=3)
        txt = vn(c["dice"], 4)
        if c["id"] == winner and ref:
            txt += f"   ({sgn(c['dice'] - ref['dice'], 4)} so với PP-0)"
        ax.text(c["dice"] + 0.0015, y, txt, va="center", ha="left", color=INK, fontsize=fs(11),
                fontweight="semibold" if c["id"] == winner else "normal")
    ax.set_yticks(ys)
    ax.set_yticklabels([f"{c['id']}  {c.get('operations') or ''}".rstrip() for c in cands], color=INK, fontsize=fs(10.5))
    ax.tick_params(axis="y", length=0)
    ax.set_xlabel(f"Dice 3D trung bình trên validation (n = {meta.get('n', 20)}), mặt nạ thô của EXP-D-100")
    from matplotlib.lines import Line2D
    hs = [Line2D([0], [0], marker="o", ls="none", ms=8, mfc=BLUE, mec=SURFACE, mew=1.5, label="PP-0: mặt nạ thô (tham chiếu, không đủ điều kiện)"),
          Line2D([0], [0], marker="o", ls="none", ms=8, mfc=MUTED, mec=SURFACE, mew=1.5, label="ứng viên không được chọn"),
          Line2D([0], [0], marker="o", ls="none", ms=8, mfc=ORANGE, mec=SURFACE, mew=1.5, label=f"được chọn ({winner})")]
    fig.legend(handles=hs, loc="upper left", bbox_to_anchor=(0.01, 0.985), ncol=3, handletextpad=0.3, columnspacing=1.4, fontsize=fs(9.5))
    footnote(fig, "Danh sách ứng viên và luật chọn được ghi vào repo trước khi chạy; chọn chỉ trên validation, không dùng holdout. "
                  "Đây là số để chọn, không phải kết quả.")
    return save_fig(plt, fig, out_dir, FIGURES["c"])


def fig_d(plt, agg, out_dir):
    prof = agg.get("slice_profile")
    if not prof:
        return []
    by_id = {r["experiment_id"]: r for r in agg["runs"]}
    fig, (ax, axb) = plt.subplots(2, 1, figsize=(9.6, 5.4), sharex=True, gridspec_kw={"height_ratios": [4, 1], "hspace": 0.1})
    fig.subplots_adjust(left=0.105, right=0.97, top=0.96, bottom=0.21)
    x = prof["bin_centers"]
    runs = [by_id[p["experiment_id"]] for p in prof["runs"] if p["experiment_id"] in by_id]
    strong = {r["experiment_id"] for r in runs if (r.get("training_fraction") in (1.0, None) or str(r["variant"]).startswith("PROCESSED"))}
    for p in prof["runs"]:
        r = by_id.get(p["experiment_id"])
        if not r:
            continue
        y = [np.nan if v is None else v for v in p["mean_dice"]]
        col = tint(run_color(r), fraction_tint(r))
        ax.plot(x, y, color=col, lw=2.0 if r["experiment_id"] in strong else 1.5, zorder=3 if r["experiment_id"] in strong else 2,
                label=nb(r["label"]), solid_capstyle="round")
    ax.set_ylim(0, 0.85)
    ax.yaxis.set_major_formatter(comma_fmt(1))
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.set_ylabel("Dice 2D trung bình theo lát")
    ax.tick_params(axis="x", length=0)
    leg = ax.legend(loc="upper left", bbox_to_anchor=(0.0, 1.0), ncol=1, handlelength=1.8, fontsize=fs(9.5))
    gt = prof.get("gt_case_fraction")
    if gt:
        axb.fill_between(x, 0, gt, color=MUTED, alpha=0.35, lw=0, step=None)
        axb.plot(x, gt, color=MUTED, lw=1.2)
    axb.set_ylim(0, 1.05)
    axb.set_yticks([0, 1])
    axb.set_yticklabels(["0", "1"])
    axb.set_ylabel("Tỉ lệ case\ncó ground truth", fontsize=fs(8.5))
    axb.set_xlim(0, 1)
    axb.xaxis.set_major_formatter(comma_fmt(1))
    axb.set_xlabel("Vị trí lát chuẩn hoá trong stack (0 = đầu, 1 = cuối)")
    axb.grid(axis="y")
    footnote(fig, f"Trung bình theo case trong {prof['bins']} bin vị trí lát (n = {agg['n']} case). Lát cả hai mặt nạ rỗng bị loại; "
                  "lát có dự đoán nhưng không có ground truth tính Dice = 0.")
    return save_fig(plt, fig, out_dir, FIGURES["d"])


def fig_e(plt, agg, out_dir):
    tr = agg.get("training") or []
    if not tr:
        return []
    by_id = {r["experiment_id"]: r for r in agg["runs"]}
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    fig.subplots_adjust(left=0.1, right=0.97, top=0.88, bottom=0.23)
    labels_done = []
    for t in tr:
        r = by_id.get(t["experiment_id"], {"family": "other", "variant": "RAW_PREDICTION", "label": t["experiment_id"], "training_fraction": None})
        col = tint(run_color(r), fraction_tint(r))
        y = [np.nan if v is None else v for v in t["val_dice_by_epoch"]]
        ep = list(range(1, len(y) + 1))
        ax.plot(ep, y, color=col, lw=1.8 if fraction_tint(r) == 0 else 1.5, label=nb(r["label"]), solid_capstyle="round", zorder=2)
        be = t.get("best_epoch")
        if be and 1 <= be <= len(y) and not np.isnan(y[be - 1]):
            ax.plot(be, y[be - 1], marker="o", ms=10, mfc=col, mec=SURFACE, mew=2, ls="none", zorder=3)
            ax.annotate(f"epoch {be}: {vn(y[be - 1])}", (be, y[be - 1]), xytext=(0, 12), textcoords="offset points", ha="center",
                        color=INK, fontsize=fs(10), fontweight="semibold",
                        bbox={"boxstyle": "round,pad=0.2", "fc": SURFACE, "ec": "none", "alpha": 0.9})
    top = max([v for t in tr for v in t["val_dice_by_epoch"] if v is not None] or [0.7])
    ax.set_ylim(0, math.ceil((top + 0.1) / 0.1) * 0.1)
    ax.set_xlim(0, max(len(t["val_dice_by_epoch"]) for t in tr) + 1)
    ax.yaxis.set_major_formatter(comma_fmt(1))
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Dice 3D trung bình trên case validation")
    h_, l_ = ax.get_legend_handles_labels()
    fig.legend(h_, l_, loc="upper left", bbox_to_anchor=(0.012, 0.985), ncol=4, handlelength=1.8, columnspacing=1.6)
    footnote(fig, "Chấm tròn = epoch được chọn làm checkpoint (Dice validation cao nhất). Không augmentation, learning rate hằng số: "
                  "Dice validation tụt mạnh rồi hồi phục ở cả ba run.")
    return save_fig(plt, fig, out_dir, FIGURES["e"])


def short_pair(ra: dict, rb: dict, q: str) -> str:
    fa, fb = ra.get("training_fraction"), rb.get("training_fraction")
    if q == "data_scarcity" and fa and fb:
        return nb(f"{FAMILY_NAME.get(ra['family'], ra['family'])} {int(round(fa * 100))} % → {int(round(fb * 100))} %")
    if q == "postprocessing":
        return nb(f"{ra['label']} → + {rb.get('postprocessing') or 'PP'}")
    return f"{nb(ra['label'])} → {nb(rb['label'])}"


def fig_f(plt, agg, out_dir):
    comps = agg.get("comparisons") or []
    if not comps:
        return []
    by_id = {r["experiment_id"]: r for r in agg["runs"]}
    order = ["data_scarcity", "postprocessing", "model_comparison", "other"]
    groups = [(q, [c for c in comps if c["question"] == q]) for q in order]
    groups = [(q, cs) for q, cs in groups if cs]
    nrows = sum(len(cs) for _q, cs in groups) + len(groups)
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    left, right = 0.265, 0.565
    fig.subplots_adjust(left=left, right=right, top=0.84, bottom=0.23)
    lo = min(c["ci95"][0] for c in comps)
    hi = max(c["ci95"][1] for c in comps)
    xlo = math.floor((min(lo, 0) - 0.01) / 0.05) * 0.05
    xhi = math.ceil((hi + 0.01) / 0.05) * 0.05
    ax.set_xlim(xlo, xhi)
    ax.set_ylim(-0.8, nrows - 0.2)
    ax.xaxis.set_major_formatter(comma_fmt(2))
    ax.grid(axis="x")
    ax.set_axisbelow(True)
    ax.axvline(0, color=AXIS, lw=1.4, zorder=1)
    col1 = (0.58 - left) / (right - left)      # value column, axes coordinates
    col2 = (0.825 - left) / (right - left)      # counts column
    lab_x = -0.04                                # row labels end just left of the axes
    y = nrows - 1
    for q, cs in groups:
        ax.text(lab_x, y, QUESTION_NAME.get(q, q), transform=ax.get_yaxis_transform(), ha="right", va="center", color=INK2,
                fontsize=fs(9.5), fontweight="semibold")
        y -= 1
        for c in cs:
            ra, rb = by_id[c["a"]], by_id[c["b"]]
            col = ORANGE if q == "postprocessing" else AQUA if "unet" in (ra["family"], rb["family"]) else BLUE
            a, b = c["ci95"]
            includes0 = a <= 0 <= b
            ax.plot([a, b], [y, y], color=col, lw=1.8, solid_capstyle="round", zorder=2)
            for e in (a, b):
                ax.plot([e, e], [y - 0.14, y + 0.14], color=col, lw=1.8, zorder=2)
            ax.plot(c["mean_delta"], y, marker="o", ms=10, mfc=SURFACE if includes0 else col, mec=col if includes0 else SURFACE,
                    mew=2.2 if includes0 else 2, ls="none", zorder=3)
            ax.text(lab_x, y, short_pair(ra, rb, q), transform=ax.get_yaxis_transform(), ha="right", va="center", color=INK,
                    fontsize=fs(10.5))
            ax.text(col1, y, f"{sgn(c['mean_delta'], 3)}  [{sgn(a, 3)}; {sgn(b, 3)}]", transform=ax.get_yaxis_transform(),
                    ha="left", va="center", color=INK, fontsize=fs(10.5), fontweight="semibold")
            ax.text(col2, y, f"{c['b_higher']} / {c['a_higher']}", transform=ax.get_yaxis_transform(), ha="left", va="center",
                    color=INK2, fontsize=fs(10.5))
            y -= 1
    ax.text(col1, nrows - 0.35, "Δ [CI 95 %]", transform=ax.get_yaxis_transform(), ha="left", va="bottom", color=MUTED, fontsize=fs(9))
    ax.text(col2, nrows - 0.35, "case B tốt hơn\n/ A tốt hơn", transform=ax.get_yaxis_transform(), ha="left", va="bottom",
            color=MUTED, fontsize=fs(9), linespacing=1.15)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    ax.set_xlabel("Δ Dice 3D trung bình (run B − run A)")
    from matplotlib.lines import Line2D
    hs = [Line2D([0], [0], marker="o", ls="none", ms=8, mfc=MUTED, mec=SURFACE, mew=1.5, label="CI không chứa 0"),
          Line2D([0], [0], marker="o", ls="none", ms=8, mfc=SURFACE, mec=MUTED, mew=2, label="CI chứa 0 (chưa khẳng định)")]
    fig.legend(handles=hs, loc="upper left", bbox_to_anchor=(0.012, 0.985), ncol=2, handletextpad=0.3, columnspacing=1.4, fontsize=fs(9.5))
    footnote(fig, "Delta theo cặp trên cùng một tập case; CI 95 % bootstrap theo cặp. Không hiệu chỉnh đa so sánh. "
                  "Màu: xanh = DINOv2 thô, cam = hậu xử lý, ngọc = có UNet.")
    return save_fig(plt, fig, out_dir, FIGURES["f"])


def local_figures(plt, raws: list[RunRaw], agg: dict, local_dir: Path) -> list[Path]:
    """PER-CASE figures. Written only under --local-out (outside git)."""
    by_id = {r["experiment_id"]: r for r in agg["runs"]}
    paths: list[Path] = []
    pc = {r.id: {c["case_id"]: c["dice_3d"] for c in r.per_case if c.get("status", "SUCCEEDED") == "SUCCEEDED"}
          for r in raws if r.per_case}
    if not pc:
        return paths
    rng = np.random.default_rng(2024)
    ids = [i for i in by_id if i in pc]
    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    fig.subplots_adjust(left=0.2, right=0.97, top=0.9, bottom=0.17)
    for k, i in enumerate(ids[::-1]):
        r = by_id[i]
        v = np.array(list(pc[i].values()))
        y = k + rng.uniform(-0.18, 0.18, size=len(v))
        col = run_color(r)
        ax.scatter(v, y, s=26, color=col, alpha=0.75, edgecolors=SURFACE, linewidths=0.8, zorder=3)
        ax.plot([np.median(v)] * 2, [k - 0.3, k + 0.3], color=INK, lw=1.8, zorder=4)
    ax.set_yticks(range(len(ids)))
    ax.set_yticklabels([nb(by_id[i]["label"]) for i in ids[::-1]], color=INK)
    ax.set_xlim(0, 1)
    ax.xaxis.set_major_formatter(comma_fmt(1))
    ax.grid(axis="x")
    ax.set_axisbelow(True)
    ax.set_xlabel("Dice 3D theo từng case (vạch đen = trung vị)")
    footnote(fig, "CỤC BỘ - chứa giá trị từng case, không được commit.")
    paths += save_fig(plt, fig, local_dir, "fig_local_per_case_strip", formats=("png",))
    pp = [r for r in agg["runs"] if str(r["variant"]).startswith("PROCESSED") and r.get("derived_from") in pc and r["experiment_id"] in pc]
    for r in pp:
        src = r["derived_from"]
        common = sorted(set(pc[src]) & set(pc[r["experiment_id"]]))
        x = np.array([pc[src][c] for c in common])
        yv = np.array([pc[r["experiment_id"]][c] for c in common])
        fig, ax = plt.subplots(figsize=(6.4, 6.4))
        fig.subplots_adjust(left=0.13, right=0.96, top=0.93, bottom=0.17)
        ax.plot([0, 1], [0, 1], color=AXIS, lw=1.2, zorder=1)
        better = yv > x
        ax.scatter(x[~better], yv[~better], s=34, color=MUTED, alpha=0.8, edgecolors=SURFACE, linewidths=0.8, zorder=3, label="không cải thiện")
        ax.scatter(x[better], yv[better], s=34, color=ORANGE, alpha=0.85, edgecolors=SURFACE, linewidths=0.8, zorder=3, label="cải thiện")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.set_aspect("equal")
        ax.xaxis.set_major_formatter(comma_fmt(1))
        ax.yaxis.set_major_formatter(comma_fmt(1))
        ax.grid(True)
        ax.set_axisbelow(True)
        ax.set_xlabel(f"Dice 3D, {nb(by_id[src]['label'])} (thô)")
        ax.set_ylabel(f"Dice 3D, {nb(r['label'])}")
        ax.legend(loc="lower right")
        footnote(fig, "CỤC BỘ - mỗi chấm là một case, không được commit.")
        paths += save_fig(plt, fig, local_dir, f"fig_local_raw_vs_pp_scatter_{src}_{r['experiment_id']}", formats=("png",))
    return paths


# --------------------------------------------------------------------------------------------------------------
# safety
# --------------------------------------------------------------------------------------------------------------
LEAK_PATTERNS = [
    (re.compile(r"CASE_\d{3,}"), "case identifier"),
    (re.compile(r"(?<![\w.])\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?!\w|\.\d)"), "IPv4-like literal"),
    (re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]"), "absolute Windows path"),
    (re.compile(r"(?:^|[\s\"'(=])/(?:Users|home|Volumes|mnt|tmp|var)/"), "absolute POSIX path"),
]


def scan_for_leaks(paths: list[Path]) -> list[str]:
    problems = []
    for p in paths:
        if p.suffix.lower() not in (".json", ".md", ".svg", ".txt"):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        for rx, what in LEAK_PATTERNS:
            m = rx.search(text)
            if m:
                line = text.count("\n", 0, m.start()) + 1
                problems.append(f"{p.name}:{line}: {what}")
    return problems


def inside_git_worktree(p: Path) -> bool:
    q = p.resolve()
    for d in [q, *q.parents]:
        if (d / ".git").exists():
            return True
    return False


# --------------------------------------------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-root", required=True, type=Path, help="directory that holds the run directories (read only)")
    ap.add_argument("--runs", required=True, nargs="+", help="run ids, in display order, e.g. EXP-D-025 EXP-D-050 EXP-D-100 EXP-D-PP")
    ap.add_argument("--comparisons", type=Path, default=None, help="directory of ml-paired-comparison/1 JSON files")
    ap.add_argument("--gate-dir", type=Path, default=None, help="GATE-IMG-01 detail dir (default <runs-root>/_gate_img_01)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output dir inside the repo (aggregates only)")
    ap.add_argument("--local-out", type=Path, default=None,
                    help="OUTSIDE git: per-case figures go here (default <runs-root>/_report_local)")
    ap.add_argument("--no-local", action="store_true", help="skip the per-case figures")
    ap.add_argument("--bins", type=int, default=BINS, help="slice-position bins for the profile")
    args = ap.parse_args(argv)

    root = args.runs_root.resolve()
    if not root.is_dir():
        print(f"ERROR --runs-root is not a directory: {root.name}")
        return 1
    out = args.out if args.out.is_absolute() else (Path.cwd() / args.out)
    out = out.resolve()
    fig_dir = out / "figures"
    local_out = None if args.no_local else (args.local_out or (root / "_report_local")).resolve()
    if local_out is not None:
        if inside_git_worktree(local_out) or out == local_out or out in local_out.parents:
            print("ERROR --local-out is inside a git work tree or under --out; per-case figures must stay outside git.")
            return 1

    raws, skipped = [], []
    for rid in args.runs:
        r = RunRaw(rid, root)
        if r.problem:
            warn(f"{rid}: skipped - {r.problem}")
            skipped.append({"experiment_id": rid, "reason": r.problem})
        else:
            raws.append(r)
    if not raws:
        print("ERROR none of the requested runs has final-holdout results")
        return 1
    cmp_dir = args.comparisons.resolve() if args.comparisons else None
    gate_dir = (args.gate_dir or (root / "_gate_img_01")).resolve()
    if args.comparisons and not cmp_dir.is_dir():
        warn("--comparisons is not a directory; no paired comparisons will be shown")
    agg = build_aggregate(raws, skipped, cmp_dir, gate_dir if gate_dir.is_dir() else None, args.bins)
    if not agg["gate_img_01_validation"]:
        warn("no GATE-IMG-01 candidates found (gate_run.json); figure (c) and its table are skipped")
    if agg.get("missing_comparisons"):
        warn("comparison files missing for: " + "; ".join(agg["missing_comparisons"]))

    # Every text output (the aggregate, the tables, the SVG figures) is rendered into a private staging folder and
    # scanned THERE; --out receives files only when the scan is clean. An exit-2 run therefore leaves --out exactly as
    # it was, instead of holding the offending files next to a previous good build (QA_PR100_103_D39 #102 NB-1).
    plt = setup_mpl()
    with tempfile.TemporaryDirectory(prefix="report-assets-stage-") as stage_name:
        stage = Path(stage_name)
        staged: list[Path] = []
        json_path = stage / "results_aggregate.json"
        json_path.write_text(dump_json(agg) + "\n", encoding="utf-8", newline="\n")
        staged.append(json_path)
        for fn in (fig_a, fig_b, fig_c, fig_d, fig_e, fig_f):
            staged += fn(plt, agg, stage / "figures")
        md = stage / "RESULTS_TABLES.md"
        md.write_text(build_tables_md(agg, "figures").rstrip("\n") + "\n", encoding="utf-8", newline="\n")
        staged.append(md)

        problems = scan_for_leaks(staged)
        if problems:
            print("ERROR the committed outputs contain per-case or environment data (nothing was written to --out):")
            for q in problems:
                print("  -", q)
            return 2

        out.mkdir(parents=True, exist_ok=True)
        written: list[Path] = []
        for source in staged:
            target = out / source.relative_to(stage)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            written.append(target)
    json_path = out / "results_aggregate.json"
    md = out / "RESULTS_TABLES.md"

    local_written: list[Path] = []
    if local_out is not None:
        local_out.mkdir(parents=True, exist_ok=True)
        local_written = local_figures(plt, raws, agg, local_out)

    log(f"runs: {', '.join(r['experiment_id'] for r in agg['runs'])}"
        + (f"  (skipped: {', '.join(s['experiment_id'] for s in skipped)})" if skipped else ""))
    log(f"comparisons: {len(agg['comparisons'])}   gate candidates: {len(agg['gate_img_01_validation'])}   "
        f"UNet present: {any(r['family'] == 'unet' for r in agg['runs'])}")
    log(f"wrote {len(written)} files to the output dir (aggregates only), e.g. {json_path.name}, {md.name}, figures/*.png|svg")
    if local_written:
        log(f"wrote {len(local_written)} per-case figure(s) to the local-only folder (outside git)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
