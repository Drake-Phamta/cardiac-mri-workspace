"""GATE-IMG-01 selection: score the post-processing candidates on EXP-D-100's RAW VALIDATION predictions.

    python -m ml.gate_img_01 --source-run <EXP-D-100 run> --population validation

The rule is pre-declared in `management/day39/RECOVERY_OVERRIDE_DAY39.md` section 4 and implemented
here without parameters of its own:
  * evidence: the RAW validation predictions of EXP-D-100 (20 cases, best.pt) and nothing else;
  * candidates: PP-0 (identity, reference only, not eligible) and PP-1 .. PP-5 (ml.postprocess.CONFIGS),
    each applied in memory to the raw mask of every case;
  * every case of every candidate is scored by ml.evaluate's own case scoring (evaluate_population ->
    evaluate_case, the `ml-eval-1.0.0` semantics), with the ground truth resolved by the same code that
    resolves it for every evaluation (ml.evaluate.make_pair_loader -> ml.data.load_mask);
  * the winner is the eligible candidate with the highest mean 3D Dice over the 20 cases; every eligible
    candidate whose mean is within 0.001 of the best mean ties with it, and the tie goes to the lower ID
    (PP-1 before PP-2 ...: fewer operations);
  * the winner is frozen WHETHER OR NOT it beats PP-0. The change against PP-0 is reported as `improves`
    (winner mean above PP-0's by more than 0.001), `worsens` (below by more than 0.001) or `unchanged`
    (within 0.001, the tolerance of the tie rule); the exact delta is printed next to the word.

Population: validation only. Any other value of --population (holdout, final_holdout, ...) is refused
before anything is read; the final holdout is never opened here (only the validation allowlist,
ml.data.CaseAllowlist.for_validation, is ever built).

Writes (nothing is overwritten):
  <selection-dir> (default management/day39/gate_img_01, in git):
      SELECTION.md                     aggregate means only, no per-case value, no absolute path
      postprocess_config.frozen.json   the winner as ml-postprocess-config/1; its sha256 is in SELECTION.md
  <detail-dir> (default <CARDIAC_RUNS_ROOT>/_gate_img_01, OUTSIDE git):
      per_case_<ID>.json               per-case Dice / IoU / RVE for each candidate
      gate_run.json                    the same summary as SELECTION.md in machine-readable form
The committed code must be clean (no uncommitted change under ml/), so the code version recorded is true.
"""

from __future__ import annotations

import argparse
import os
import platform
import sys
from pathlib import Path

import numpy as np
import scipy

from ml import data as D
from ml import evaluate as E
from ml import manifests as MF
from ml import postprocess as PP

SOURCE_RULE = PP.SOURCE_RULE
TIE_TOLERANCE = 0.001
SOURCE_EXPERIMENT = PP.SOURCE_EXPERIMENT_ID
DEFAULT_SELECTION_DIR = Path("management/day39/gate_img_01")
DEFAULT_DETAIL_DIR = Path(os.environ.get("CARDIAC_RUNS_ROOT") or D.main_checkout_root().parent / "cardiac-runs") / "_gate_img_01"
SELECTION_FILE = "SELECTION.md"
FROZEN_FILE = PP.FROZEN_CONFIG_NAME
FORMAT = "ml-gate-img-01/1"


class GateRefused(D.HoldoutAccessError):
    """The gate runs on EXP-D-100's validation predictions only."""


# --- the pure parts: selection and wording ---------------------------------------------------

def select_winner(dice_means: dict[str, float], eligible, tolerance: float = TIE_TOLERANCE) -> dict:
    """The pre-declared rule. `dice_means` maps candidate id -> mean 3D Dice. Returns
    {winner, best, tied}: `tied` lists, in id order, every eligible candidate within `tolerance` of the
    best mean; the lowest id among them wins."""
    ids = sorted((i for i in dice_means if i in set(eligible)), key=lambda i: int(i.split("-")[1]))
    if not ids:
        raise ValueError("no eligible candidate")
    best = max(dice_means[i] for i in ids)
    tied = [i for i in ids if best - dice_means[i] <= tolerance + 1e-12]
    return {"winner": tied[0], "best": best, "tied": tied}


def change_word(delta: float, tolerance: float = TIE_TOLERANCE) -> str:
    """`improves`, `worsens` or `unchanged` for winner minus PP-0 (|delta| within the tolerance: unchanged)."""
    if delta > tolerance + 1e-12:
        return "improves"
    if delta < -tolerance - 1e-12:
        return "worsens"
    return "unchanged"


# --- scoring ---------------------------------------------------------------------------------

def _score_candidate(cid: str, intended: list[str], source_run: Path, pred_dir: Path, by_case: dict, paths,
                     population: dict) -> dict:
    loader = E.make_pair_loader(source_run, pred_dir, by_case, paths, transform=lambda m, c=cid: PP.apply(c, m))
    result = E.evaluate_population(intended, loader, population=population,
                                   prediction_variant="RAW_PREDICTION" if cid == "PP-0" else "PROCESSED_PREDICTION")
    if result["failed_n"]:
        raise RuntimeError(f"{cid}: {result['failed_n']} case(s) could not be scored "
                           f"({[f['reason_code'] for f in result['failures']]}); the selection needs all "
                           f"{result['intended_n']}")
    summary = E.cohort_summary(result, metrics=("dice_3d", "iou_3d"))
    recs = result["cases"]
    return {"id": cid, "intended_n": result["intended_n"], "successful_n": result["successful_n"],
            "mean_dice_3d": summary["metrics"]["dice_3d"]["mean"],
            "mean_iou_3d": summary["metrics"]["iou_3d"]["mean"],
            "mean_abs_rve_percent": float(np.mean([abs(r["relative_volume_error_percent"]) for r in recs])),
            "per_case": [{k: r[k] for k in ("case_id", "dice_3d", "iou_3d", "relative_volume_error_percent",
                                            "pred_voxels", "ref_voxels", "fp_voxels", "fn_voxels")} for r in recs]}


def _placeholder(path: Path, runs_root_name: str = "<CARDIAC_RUNS_ROOT>") -> str:
    """A path as it may appear in a committed file: never absolute."""
    return f"{runs_root_name}/{Path(path).name}"


def command_text(source_run: Path, partition: str, selection_dir: Path, detail_dir: Path) -> str:
    sel = selection_dir
    try:
        sel = Path(selection_dir).resolve().relative_to(D.REPO_ROOT.resolve())
    except ValueError:
        sel = Path("<selection-dir>")
    return (f"python -m ml.gate_img_01 --source-run {_placeholder(source_run)} --population {partition} "
            f"--selection-dir {sel.as_posix()} --detail-dir {_placeholder(detail_dir)}")


def run_gate(source_run: str | Path, partition: str = "validation", *,
             selection_dir: str | Path = DEFAULT_SELECTION_DIR, detail_dir: str | Path = DEFAULT_DETAIL_DIR,
             split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST, dataset_manifest: dict | None = None,
             package_root: str | Path = D.DEFAULT_PACKAGE_ROOT, allow_unfrozen_split: bool = False,
             allow_dirty_code: bool = False, log=print) -> dict:
    """Score every candidate, apply the rule, write SELECTION.md + the frozen config + the detail files."""
    if partition != "validation":
        raise GateRefused(f"GATE-IMG-01 selection runs on the validation population only, not {partition!r}; "
                          f"the final holdout is never opened here")
    source_run, selection_dir, detail_dir = Path(source_run), Path(selection_dir), Path(detail_dir)
    if not selection_dir.is_absolute():
        selection_dir = D.REPO_ROOT / selection_dir
    for name in (SELECTION_FILE, FROZEN_FILE):
        if (selection_dir / name).exists():
            raise FileExistsError(f"{selection_dir.name}/{name} exists; the selection record is written once")
    if detail_dir.is_dir() and any(detail_dir.glob("*.json")):
        raise FileExistsError(f"{detail_dir.name} already holds gate files; they are written once")
    cv, mod = MF.code_version(), PP.module_code_version()
    if (cv["dirty"] is not False or mod["dirty"] is not False) and not allow_dirty_code:
        raise RuntimeError(f"the code under ml/ is not a clean commit ({cv['version']}); commit first so the "
                           f"recorded code version is true")

    pm_path = source_run / MF.RUN_LAYOUT["predictions_manifest"].format(partition="validation")
    pm = MF.validate_predictions_manifest(D.load_json(pm_path))
    if pm["experiment_id"] != SOURCE_EXPERIMENT or pm["prediction_variant"] != "RAW_PREDICTION" \
            or pm.get("derived_from") is not None:
        raise ValueError(f"the evidence is the RAW predictions of {SOURCE_EXPERIMENT}, nothing else")
    if pm["population"]["partition"] != "validation" or pm["population"]["role"] != "VALIDATION":
        raise GateRefused("the predictions manifest is not a validation population")
    if any(c["status"] != "SUCCEEDED" for c in pm["cases"]):
        raise ValueError("the source predictions have failed cases; the rule is defined on all 20")
    split, split_sha = E.load_run_split(source_run, "validation", frozen_split=split_manifest,
                                        allow_unfrozen_split=allow_unfrozen_split)
    allow = D.CaseAllowlist.for_validation(split)                  # the only allowlist ever built here
    intended = list(pm["intended_case_ids"])
    if sorted(intended) != sorted(allow.case_ids):
        raise ValueError("source predictions do not cover the exact validation population")
    dataset_manifest = dataset_manifest or D.load_dataset_manifest()
    paths = D.case_paths(dataset_manifest, package_root, allowlist=allow)
    pop = D.load_json(source_run / pm["population"]["path"])
    population = {"role": "VALIDATION", "partition": "validation", "manifest_id": pop["manifest_id"],
                  "case_ids": intended}
    pred_dir, by_case = pm_path.parent, {c["case_id"]: c for c in pm["cases"]}

    scored = {}
    for cid in PP.CONFIGS:
        if log:
            log(f"{cid}: {PP.CONFIGS[cid]['summary']}")
        scored[cid] = _score_candidate(cid, intended, source_run, pred_dir, by_case, paths, population)
        if log:
            log(f"   mean Dice {scored[cid]['mean_dice_3d']:.6f}  IoU {scored[cid]['mean_iou_3d']:.6f}  "
                f"|RVE| {scored[cid]['mean_abs_rve_percent']:.3f}%  ({scored[cid]['successful_n']}/"
                f"{scored[cid]['intended_n']} cases)")

    # PP-0 must reproduce the recorded raw evaluation of the source run, case for case (same code, same bytes)
    recorded_path = source_run / "evaluation" / "validation" / "per_case_metrics.json"
    pp0_matches = None
    if recorded_path.is_file():
        recorded = {c["case_id"]: c["dice_3d"] for c in D.load_json(recorded_path)["cases"]}
        pp0 = {c["case_id"]: c["dice_3d"] for c in scored["PP-0"]["per_case"]}
        pp0_matches = recorded == pp0
        if not pp0_matches:
            raise RuntimeError("PP-0 (the raw masks) does not reproduce the source run's recorded validation "
                               "evaluation; the scoring path differs from the evaluation's - stopping")

    means = {cid: s["mean_dice_3d"] for cid, s in scored.items()}
    selection = select_winner(means, PP.ELIGIBLE_IDS)
    winner = selection["winner"]
    delta = means[winner] - means["PP-0"]
    word = change_word(delta)
    pp0_by_case = {c["case_id"]: c["dice_3d"] for c in scored["PP-0"]["per_case"]}
    for cid, s in scored.items():
        diffs = [c["dice_3d"] - pp0_by_case[c["case_id"]] for c in s["per_case"]]
        s["cases_above_pp0"] = sum(d > 0 for d in diffs)
        s["cases_below_pp0"] = sum(d < 0 for d in diffs)
        s["cases_equal_pp0"] = sum(d == 0 for d in diffs)

    selection_dir.mkdir(parents=True, exist_ok=True)
    detail_dir.mkdir(parents=True, exist_ok=True)
    frozen_path = selection_dir / FROZEN_FILE
    frozen_sha = PP.write_frozen_config(frozen_path, winner, mod["version"])
    for cid, s in scored.items():
        MF.write_json_new(detail_dir / f"per_case_{cid}.json",
                          {"format": "ml-gate-img-01-per-case/1", "candidate": cid, "source_experiment": SOURCE_EXPERIMENT,
                           "evaluation_metric_version": E.EVALUATION_METRIC_VERSION, "cases": s["per_case"]})
    summary = {
        "format": FORMAT, "source_rule": SOURCE_RULE, "source_experiment": SOURCE_EXPERIMENT,
        "population": "validation", "intended_n": len(intended), "tie_tolerance": TIE_TOLERANCE,
        "evaluation_metric_version": E.EVALUATION_METRIC_VERSION,
        "predictions_manifest_sha256": D.sha256_file(pm_path), "split_sha256": split_sha,
        "checkpoint": {"checkpoint_id": pm["checkpoint"]["checkpoint_id"], "sha256": pm["checkpoint"]["sha256"]},
        "code_version": cv["version"], "postprocess_module_code_version": mod["version"],
        "pp0_reproduces_recorded_raw_evaluation": pp0_matches,
        "candidates": {cid: {k: v for k, v in s.items() if k != "per_case"} for cid, s in scored.items()},
        "selection": dict(selection, delta_vs_pp0=delta, change_vs_pp0=word),
        "frozen_config_sha256": frozen_sha,
        "created_at": MF.now_iso(),
    }
    MF.write_json_new(detail_dir / "gate_run.json", summary)
    text = selection_markdown(summary, command_text(source_run, partition, selection_dir, detail_dir))
    with open(selection_dir / SELECTION_FILE, "x", encoding="utf-8", newline="\n") as f:
        f.write(text)
    if log:
        log(f"winner {winner} (tied within {TIE_TOLERANCE}: {selection['tied']}); vs PP-0 {delta:+.6f} {word}; "
            f"frozen config sha256 {frozen_sha}")
    return summary


def selection_markdown(summary: dict, command: str) -> str:
    """SELECTION.md: aggregate means over the 20 validation cases, the rule's outcome, the evidence."""
    cands, sel = summary["candidates"], summary["selection"]
    winner = sel["winner"]
    rows = []
    for cid, c in cands.items():
        ops = " → ".join(o["op"] for o in PP.CONFIGS[cid]["operations"]) or "identity"
        mark = "**winner**" if cid == winner else ("reference, not eligible" if cid == "PP-0" else
                                                   ("tied with the best" if cid in sel["tied"] else ""))
        rows.append(f"| {cid} | {ops} | {c['mean_dice_3d']:.4f} | {c['mean_iou_3d']:.4f} | "
                    f"{c['mean_abs_rve_percent']:.2f} | {c['cases_above_pp0']} / {c['cases_equal_pp0']} / "
                    f"{c['cases_below_pp0']} | {mark} |")
    n = summary["intended_n"]
    pp0 = cands["PP-0"]["mean_dice_3d"]
    w = cands[winner]["mean_dice_3d"]
    return f"""# GATE-IMG-01 selection record (validation)

**Rule:** `{summary['source_rule']}`, "Pre-declared rule for GATE-IMG-01". This file records its outcome. Nothing
here was tuned: the candidate set is the closed list PP-0 .. PP-5, and the metric is the `ml/evaluate.py`
case scoring (`{summary['evaluation_metric_version']}`).

## Evidence

| Item | Value |
|---|---|
| Source | RAW validation predictions of `{summary['source_experiment']}` ({n} validation cases, `{summary['checkpoint']['checkpoint_id']}`) |
| Predictions manifest sha256 | `{summary['predictions_manifest_sha256']}` |
| Checkpoint sha256 | `{summary['checkpoint']['sha256']}` |
| Split manifest sha256 | `{summary['split_sha256']}` |
| evaluation_metric_version | `{summary['evaluation_metric_version']}` |
| PP-0 reproduces the recorded raw evaluation, case for case | {'yes' if summary['pp0_reproduces_recorded_raw_evaluation'] else 'not checked'} |
| Code version (ml/) | `{summary['code_version']}` |
| Code version of `ml/postprocess.py` (written into the frozen config) | `{summary['postprocess_module_code_version']}` |
| Libraries | python {platform.python_version()}, numpy {np.__version__}, scipy {scipy.__version__} |

## Candidates: means over the {n} validation cases

| ID | Operations, in order | Mean 3D Dice | Mean IoU | Mean abs. RVE (%) | Cases above / equal / below PP-0 (Dice) | Note |
|---|---|---|---|---|---|---|
{chr(10).join(rows)}

The last-but-one column counts cases only; no per-case value is recorded in this file. Per-case detail is kept
outside git. Relative volume error (RVE) is in voxels (`07` section 6); spacing is an identity placeholder.

## Result

- **Winner: {winner}** ({PP.CONFIGS[winner]['summary']}). Highest mean 3D Dice among the eligible candidates
  PP-1 .. PP-5; candidates within {summary['tie_tolerance']} of the best mean tie and the lower ID wins; the tie set
  was {', '.join(sel['tied'])}.
- **Against PP-0 (the raw masks): {sel['change_vs_pp0']}.** Mean 3D Dice {w:.4f} against {pp0:.4f}, a difference of
  {sel['delta_vs_pp0']:+.4f}. (`improves` / `worsens` mean the winner is above / below PP-0 by more than
  {summary['tie_tolerance']}, the tolerance of the tie rule; otherwise `unchanged`. `07` section 5: image processing
  is not assumed to improve the model.)
- **The winner is frozen whether or not it beats PP-0.**

## Frozen configuration

| Item | Value |
|---|---|
| File | `management/day39/gate_img_01/{FROZEN_FILE}` |
| Format | `ml-postprocess-config/1` |
| config_id | `{winner}` |
| **sha256 of the file bytes** (the `postprocessing_config_sha256` of the authorization record) | `{summary['frozen_config_sha256']}` |

Operation details (kernel, iterations, connectivity, border handling) are in the file and in the
`ml/postprocess.py` docstring.

## Command

```
{command}
```

Run from the repository root on a clean commit of `ml/`; the paths named `<CARDIAC_RUNS_ROOT>` are the run
directories of this PC (`ml/README.md`, "Run directory and evaluation").

## Holdout statement

No final-holdout case was read, predicted or scored for this selection. `ml/gate_img_01.py` builds only the
validation allowlist (`CaseAllowlist.for_validation`) and refuses any other population before reading anything;
the evidence is the {n} validation predictions of `{summary['source_experiment']}` already on disk.

## What this record does not do

It does not authorize the holdout. The `ml-holdout-authorization/1` record, with this config's sha256, is the next
commit in the order of events of the override record, section 4.
"""


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="GATE-IMG-01: select the post-processing candidate on validation")
    ap.add_argument("--source-run", required=True, type=Path, help="the EXP-D-100 run directory")
    ap.add_argument("--population", default="validation",
                    help="must be 'validation'; anything else is refused")
    ap.add_argument("--selection-dir", type=Path, default=DEFAULT_SELECTION_DIR,
                    help="where SELECTION.md and the frozen config go (default: %(default)s, in the repository)")
    ap.add_argument("--detail-dir", type=Path, default=DEFAULT_DETAIL_DIR,
                    help="per-case detail, OUTSIDE git (default: <CARDIAC_RUNS_ROOT>/_gate_img_01)")
    ap.add_argument("--split-manifest", type=Path, default=D.DEFAULT_SPLIT_MANIFEST,
                    help="the FROZEN split (default: the repository's); any other sha256 is refused")
    args = ap.parse_args(argv)
    try:
        run_gate(args.source_run, args.population, selection_dir=args.selection_dir, detail_dir=args.detail_dir,
                 split_manifest=args.split_manifest)
    except (D.DataAccessError, FileExistsError, FileNotFoundError, MF.ManifestError, ValueError, RuntimeError) as exc:
        print(f"REFUSED: {type(exc).__name__}: {exc}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
