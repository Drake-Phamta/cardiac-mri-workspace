#!/usr/bin/env python3
"""Aggregate-only results JSON (format `cardiac-results-aggregate/1`) from evaluated run directories.

This is the builder behind `management/day39/results_aggregate.json`, the file `tools/board/build_results.py`
renders into the public results page. It reads, for every run, only the aggregate files `ml.evaluate` wrote:

    <run>/run_manifest.json                                training fraction
    <run>/evaluation/<population>/metrics_summary.json     cohort statistics (+ the DR-002b sensitivity slot)

and, for every paired comparison, the JSON that `python -m ml.evaluate compare --out` wrote (only its
`paired_statistics`; the per-case `pairs` it also holds are never copied). No per-case value, case id, path or
timestamp ends up in the output, so the result is the same bytes on every run over the same inputs.

    from results_aggregate import build_aggregate, write_aggregate        # importable (tools/ml/holdout_pipeline.py)

    python tools/ml/results_aggregate.py --runs-root <runs> --experiments EXP-U-025 EXP-U-050 EXP-U-100 \\
        --comparisons <runs>/_holdout_<tag>/comparisons --base management/day39/results_aggregate.json \\
        --out <results_aggregate.json>
    python tools/ml/results_aggregate.py --run-dirs <run> <run> ... --out <results_aggregate.json>

--base is an earlier aggregate to extend: its runs and comparisons are kept, those of the same id are replaced by
the ones computed now, and its `gate_img_01_validation` block (the PP-0 .. PP-5 validation table) is carried over.
Every comparison must name two runs that are in the result, and all runs must share one population size and one
evaluation metric version, otherwise the build is refused (nothing is written).

Only the standard library is used, so this runs without torch.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Iterable, Sequence

FORMAT = "cardiac-results-aggregate/1"
NOTE = "aggregates only; per-case values stay outside git"
DEFAULT_POPULATION = "final_holdout"
SUBSET_FRACTIONS = {"25_percent": 0.25, "50_percent": 0.5, "100_percent": 1.0}   # as ml.manifests.SUBSET_FRACTIONS
SENSITIVITY_SLOT = "sensitivity_without_suspected_linkage"
PRIMARY_SLOT = "primary_all_holdout"


class AggregateError(ValueError):
    """The aggregate cannot be built faithfully; nothing is written."""


def _load(path: Path, what: str):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise AggregateError(f"{what}: cannot read {Path(path).name}: {type(exc).__name__}") from exc
    except ValueError as exc:
        raise AggregateError(f"{what}: {Path(path).name} is not valid JSON: {exc}") from exc


def _need(obj, *keys, what: str):
    cur = obj
    for key in keys:
        if not isinstance(cur, dict) or key not in cur:
            raise AggregateError(f"{what}: missing {'.'.join(keys)}")
        cur = cur[key]
    return cur


def _round(value, digits: int):
    return None if value is None else round(float(value), digits)


def run_entry(run_dir: str | Path, population: str = DEFAULT_POPULATION) -> dict:
    """One `runs[]` entry from <run>/evaluation/<population>/metrics_summary.json (aggregate numbers only)."""
    return _read_run(run_dir, population)[0]


def _read_run(run_dir: str | Path, population: str) -> tuple[dict, int, str]:
    """(entry, intended N, evaluation metric version)."""
    run_dir = Path(run_dir)
    summary_path = run_dir / "evaluation" / population / "metrics_summary.json"
    if not summary_path.is_file():
        raise AggregateError(f"{run_dir.name}: no evaluation/{population}/metrics_summary.json - "
                             f"the run has not been scored on {population}")
    summary = _load(summary_path, run_dir.name)
    experiment_id = _need(summary, "experiment_id", what=run_dir.name)
    manifest = _load(run_dir / "run_manifest.json", run_dir.name) if (run_dir / "run_manifest.json").is_file() else {}
    fraction = manifest.get("training_fraction")
    if fraction is None:
        subset = manifest.get("training_subset")
        fraction = SUBSET_FRACTIONS.get(subset)
    if fraction is None:
        raise AggregateError(f"{experiment_id}: the run manifest names no training fraction")
    cohort = _need(summary, "cohort", what=experiment_id)
    metrics = _need(cohort, "metrics", what=experiment_id)
    dice = _need(metrics, "dice_3d", what=experiment_id)
    ci = _need(dice, "ci95_mean", what=experiment_id)
    entry = {
        "experiment_id": experiment_id,
        "training_fraction": float(fraction),
        "variant": _need(summary, "prediction_variant", what=experiment_id),
        "dice_mean": _round(dice["mean"], 4),
        "dice_ci95": [_round(ci["low"], 4), _round(ci["high"], 4)],
        "dice_median": _round(dice["median"], 4),
        "dice_q1": _round(dice["q1"], 4),
        "dice_q3": _round(dice["q3"], 4),
        "dice_sd": _round(dice["std"], 4),
        "iou_mean": _round(_need(metrics, "iou_3d", "mean", what=experiment_id), 4),
        "mean_slice_dice": _round(_need(metrics, "mean_slice_dice", "mean", what=experiment_id), 4),
        "rve_percent_mean": _round(_need(metrics, "relative_volume_error_percent", "mean", what=experiment_id), 2),
    }
    sensitivity = (summary.get("holdout_slots") or {}).get(SENSITIVITY_SLOT)
    if sensitivity is not None:
        entry["sensitivity_dice_mean"] = _round(_need(sensitivity, "metrics", "dice_3d", "mean",
                                                      what=f"{experiment_id} sensitivity slot"), 4)
    failed = int(_need(cohort, "failed_n", what=experiment_id))
    if failed:                                  # DR-018: a failed case is listed, never dropped; so is it here
        entry["successful_n"] = int(_need(cohort, "successful_n", what=experiment_id))
        entry["failed_n"] = failed
    return (entry, int(_need(cohort, "intended_n", what=experiment_id)),
            _need(summary, "evaluation_metric_version", what=experiment_id))


def _family(experiment_id: str) -> str:
    return experiment_id.split("-")[1] if experiment_id.count("-") >= 2 else experiment_id


def comparison_kind(a: dict, b: dict) -> str:
    """within_family (data scarcity), cross_family (RQ-A, UNet vs DINOv2 at one fraction) or ablation (RAW vs
    PROCESSED, RQ-B)."""
    if a.get("variant") != b.get("variant"):
        return "ablation"
    return "within_family" if _family(a["experiment_id"]) == _family(b["experiment_id"]) else "cross_family"


def comparison_entry(path: str | Path, population: str = DEFAULT_POPULATION) -> dict:
    """One `comparisons[]` entry (run_b - run_a on the primary population) from an `ml.evaluate compare` JSON.
    A NON_COMPARABLE pair is kept, honestly, with no delta."""
    path = Path(path)
    doc = _load(path, path.name)
    if _need(doc, "format", what=path.name) != "ml-paired-comparison/1":
        raise AggregateError(f"{path.name}: not an ml-paired-comparison/1 file")
    if doc.get("population") != population:
        raise AggregateError(f"{path.name}: population is {doc.get('population')!r}, not {population!r}")
    report = _need(doc, "report", what=path.name)
    slot = report.get(PRIMARY_SLOT, report)          # a validation comparison has no holdout slots
    entry = {"a": _need(doc, "run_a", what=path.name), "b": _need(doc, "run_b", what=path.name)}
    comparability = _need(slot, "comparability", what=path.name)
    stats = slot.get("paired_statistics")
    if not comparability.get("comparable") or stats is None:
        entry.update({"comparable": False, "label": comparability.get("label"),
                      "failed_checks": list(comparability.get("failed_checks") or [])})
        return entry
    ci = _need(stats, "ci95_mean", what=path.name)
    entry.update({"mean_delta": _round(stats["mean"], 4), "ci95": [_round(ci["low"], 4), _round(ci["high"], 4)],
                  "b_higher": int(stats["n_run_b_higher"]), "a_higher": int(stats["n_run_a_higher"])})
    return entry


def build_aggregate(run_dirs: Sequence[str | Path], comparison_files: Iterable[str | Path] = (), *,
                    population: str = DEFAULT_POPULATION, base: dict | None = None) -> dict:
    """The aggregate for `run_dirs` and `comparison_files`, extending `base` (an earlier aggregate) when given."""
    if not run_dirs and not (base and base.get("runs")):
        raise AggregateError("no run directory given")
    read = [_read_run(d, population) for d in run_dirs]
    entries = [r[0] for r in read]
    if len({e["experiment_id"] for e in entries}) != len(entries):
        raise AggregateError("the same experiment appears twice in the run directories")
    n, metric_version = {r[1] for r in read}, {r[2] for r in read}
    if base:
        if base.get("format") != FORMAT:
            raise AggregateError(f"the base aggregate is not {FORMAT}")
        if base.get("population") != population:
            raise AggregateError(f"the base aggregate is for {base.get('population')!r}, not {population!r}")
        n.add(base.get("n"))
        metric_version.add(base.get("metric_version"))
    n.discard(None)
    metric_version.discard(None)
    if len(n) != 1 or len(metric_version) != 1:
        raise AggregateError(f"runs disagree on the population size {sorted(n)} or the metric version "
                             f"{sorted(metric_version)}; they are not comparable and are not merged")
    new_ids = {e["experiment_id"] for e in entries}
    runs = [r for r in (base or {}).get("runs", []) if r["experiment_id"] not in new_ids] + entries
    comparisons = [comparison_entry(f, population) for f in comparison_files]
    new_pairs = {(c["a"], c["b"]) for c in comparisons}
    comparisons = [c for c in (base or {}).get("comparisons", []) if (c["a"], c["b"]) not in new_pairs] + comparisons
    ids = {r["experiment_id"] for r in runs}
    variants = {r["experiment_id"]: r["variant"] for r in runs}
    for c in comparisons:
        for side in ("a", "b"):
            if c[side] not in ids:
                raise AggregateError(f"comparison {c['a']} vs {c['b']} names {c[side]}, which is not a run of this "
                                     f"aggregate; add its run directory")
        c["kind"] = comparison_kind({"experiment_id": c["a"], "variant": variants[c["a"]]},
                                    {"experiment_id": c["b"], "variant": variants[c["b"]]})
    out = {"format": FORMAT, "population": population, "n": n.pop(), "metric_version": metric_version.pop(),
           "note": NOTE, "runs": runs, "comparisons": comparisons}
    if base and base.get("gate_img_01_validation") is not None:
        out["gate_img_01_validation"] = base["gate_img_01_validation"]
    return out


def aggregate_bytes(aggregate: dict) -> bytes:
    """UTF-8, indent 1, LF, trailing newline: the layout of management/day39/results_aggregate.json."""
    return (json.dumps(aggregate, indent=1, ensure_ascii=False) + "\n").encode("utf-8")


def write_aggregate(aggregate: dict, out: str | Path) -> str:
    """Write the aggregate (replacing an earlier file of the same name, atomically; it is derived data and is
    regenerated from the runs). Returns the sha256 of the bytes written."""
    import hashlib
    data = aggregate_bytes(aggregate)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{out.name}.", suffix=".tmp", dir=str(out.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, out)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return hashlib.sha256(data).hexdigest()


def comparison_files_in(path: str | Path, population: str = DEFAULT_POPULATION) -> list[Path]:
    """The `<a>__vs__<b>.<population>.json` files of a comparisons directory, in name order."""
    return sorted(Path(path).glob(f"*__vs__*.{population}.json"))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Aggregate-only results JSON from evaluated run directories")
    where = ap.add_mutually_exclusive_group(required=True)
    where.add_argument("--run-dirs", nargs="+", type=Path, metavar="RUN", help="run directories to include")
    where.add_argument("--runs-root", type=Path, help="directory holding the run directories (with --experiments)")
    ap.add_argument("--experiments", nargs="+", default=[], help="experiment ids under --runs-root")
    ap.add_argument("--comparisons", nargs="*", type=Path, default=[],
                    help="ml.evaluate compare JSON files, or directories holding <a>__vs__<b>.<population>.json")
    ap.add_argument("--base", type=Path, default=None, help="an earlier aggregate to extend")
    ap.add_argument("--population", default=DEFAULT_POPULATION, choices=[DEFAULT_POPULATION, "validation"])
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(argv)
    try:
        if args.runs_root is not None:
            if not args.experiments:
                raise AggregateError("--runs-root needs --experiments")
            run_dirs = [args.runs_root / e for e in args.experiments]
        else:
            run_dirs = args.run_dirs
        files: list[Path] = []
        for item in args.comparisons:
            files += comparison_files_in(item, args.population) if item.is_dir() else [item]
        base = _load(args.base, "base aggregate") if args.base else None
        aggregate = build_aggregate(run_dirs, files, population=args.population, base=base)
        digest = write_aggregate(aggregate, args.out)
    except AggregateError as exc:
        print(f"REFUSED: {exc}")
        return 2
    print(f"wrote {args.out.name}: {len(aggregate['runs'])} run(s), {len(aggregate['comparisons'])} comparison(s), "
          f"sha256 {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
