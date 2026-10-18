#!/usr/bin/env python3
"""From a signed holdout authorization record to the results: ONE command.

    python tools/ml/holdout_pipeline.py --record <auth.json> --runs-root <dir> \\
        --experiments EXP-U-025 EXP-U-050 EXP-U-100 --compare-family-pairs --aggregate-out <aggregate.json>
    ... same command with --dry-run: prints the exact commands and the pre-flight verdict, runs nothing

Every step is the existing module CLI in its own process (nothing is re-implemented here). In order:

    for each experiment      ml.infer --population holdout            (resumes a crashed inference)
                             [ml.postprocess derive]                  only with --derive-pp-from EXP-D-100
                             ml.evaluate run --population final_holdout --allow-holdout
                             [ml.evaluate run on the derived EXP-D-PP]
    paired comparisons       within family   (a -> b = b minus a; 025->100, 050->100, 025->050)
                             cross family at equal fraction, with --compare-family-pairs (the RQ-A core;
                             run a = EXP-U-<f>, run b = EXP-D-<f>)
                             RAW -> PROCESSED ablation (EXP-D-100 -> EXP-D-PP) with --derive-pp-from
                             into <runs-root>/_holdout_<tag>/comparisons/<a>__vs__<b>.final_holdout.json
    Contract 2               ml.export_contract2 --validate for each new run (a derived run with --source-run)
    aggregate                tools/ml/results_aggregate.py over the new runs and comparisons, extending the Day 39
                             aggregate (--aggregate-base), written to --aggregate-out

Before the first step, a PRE-FLIGHT checks everything that can be known without reading a holdout case, so that no
GPU hours are spent on a command that would fail later: the record (strict JSON, gate CLOSED, frozen split,
decision_ref in the checkout, committed and unmodified in git), every run COMPLETE with a best.pt the record authorizes, a clean `ml/` tree (the
exporter refuses dirty code), the counterpart runs of the comparisons already scored, and the scored-once rule:

    evaluation/final_holdout exists under THIS record     the step is done; the identical command resumes after it
    ... predictions exist under THIS record               inference is skipped, evaluation runs
    ... partial predictions (crash during inference)      ml.infer resumes them
    anything made under ANOTHER record, or under none     REFUSED: a run is scored once

One problem refuses the whole command (exit 2) before anything runs. After that every step logs to
<runs-root>/_holdout_<tag>/<name>.log and the pipeline stops at the first failure (exit 1) naming the log; run the
identical command again to continue. Exit 0 means every step finished. A summary table is printed at the end.

The gate states passed to the exporter default to ACCEPTED / ACCEPTED, which is what the Day 39 exports asserted and
what `validate_contract2.py` requires (both gates are CLOSED in management/PROJECT_STATE.yaml); override them with
--gate-split-01 / --gate-ml-01.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[2]
for _p in (str(Path(__file__).resolve().parent), str(ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import make_holdout_authorization as MA   # noqa: E402
import results_aggregate as RA            # noqa: E402
from ml import data as D                  # noqa: E402
from ml import export_contract2 as X      # noqa: E402
from ml import holdout as H               # noqa: E402
from ml import manifests as MF            # noqa: E402

PARTITION = D.HOLDOUT_PARTITION
ID_RE = re.compile(r"^EXP-([UD])-(025|050|100)$")
FRACTIONS = ("025", "050", "100")
WITHIN_FAMILY = (("025", "100"), ("050", "100"), ("025", "050"))
DERIVE_SOURCE, DERIVED_ID = "EXP-D-100", "EXP-D-PP"
DEFAULT_PP_CONFIG = MA.DEFAULT_FROZEN_CONFIG
DEFAULT_AGGREGATE_BASE = "management/day39/results_aggregate.json"
VALIDATOR = "contracts/ingestion/contract2_experiment_artifact/validate_contract2.py"


# --- the plan ---------------------------------------------------------------------------------------

@dataclasses.dataclass
class Config:
    record_path: Path
    runs_root: Path
    experiments: list[str]
    derive_from: str | None = None
    compare_family_pairs: bool = False
    tag: str | None = None
    pp_config: Path | None = None
    gate_split_01: str = "ACCEPTED"
    gate_ml_01: str = "ACCEPTED"
    device: str | None = None
    infer_batch: int | None = None
    aggregate_out: Path | None = None
    aggregate_base: str | None = DEFAULT_AGGREGATE_BASE
    require_clean_code: bool = True
    require_committed_record: bool = True
    python: str = sys.executable


@dataclasses.dataclass
class Step:
    key: str                          # "EXP-U-025.infer"
    kind: str                         # infer | derive | evaluate | compare | export | validate | aggregate
    argv: list[str] | None            # None: done in this process (aggregate)
    log: Path | None
    action: str = "run"               # run | skip
    note: str = ""
    expect: list[Path] = dataclasses.field(default_factory=list)    # must exist after the step
    needs: list[Path] = dataclasses.field(default_factory=list)     # must exist before the step


@dataclasses.dataclass
class Plan:
    steps: list[Step]
    problems: list[str]
    notes: list[str]                  # the pre-flight lines
    log_dir: Path
    comparisons_dir: Path
    aggregate_out: Path
    aggregate_runs: list[Path]
    aggregate_comparisons: list[Path]
    record_sha256: str | None = None


def _py(cfg: Config, *module_args: str) -> list[str]:
    return [cfg.python, "-u", "-m", *module_args]


def display(argv: list[str]) -> str:
    """The command as a person would type it (the interpreter shown as `python`)."""
    shown = ["python", *argv[1:]]
    return subprocess.list2cmdline(shown) if os.name == "nt" else shlex.join(shown)


def _state(fp: dict, record_sha: str, who: str, problems: list[str]) -> str:
    """Where a run stands on the holdout relative to THIS record: new | partial | predicted | scored.
    Anything made under another record (or none) is a scored-once refusal."""
    if fp["scored"]:
        if not fp["evaluation_manifest"]:
            problems.append(f"{who}: evaluation/{PARTITION} exists without an evaluation_manifest.json; "
                            f"inspect it, it is never overwritten")
        elif fp["evaluation_record_sha256"] != record_sha:
            problems.append(MA.already_used_problem(who, fp) + "; it is not scored again under this record")
        elif fp["predictions_record_sha256"] not in (None, record_sha):
            problems.append(f"{who}: its predictions were made under another record than its evaluation")
        else:
            return "scored"
    elif fp["predicted"]:
        if fp["predictions_record_sha256"] != record_sha:
            problems.append(MA.already_used_problem(who, fp) + "; it is not evaluated under this record")
        else:
            return "predicted"
    elif fp["partial"]:
        return "partial"
    return "new"


def record_problem(path: str | Path) -> str | None:
    """Why the record is not a committed file of this checkout, or None. A holdout authorization with no commit behind
    it leaves no trail of what was authorized, so the pipeline wants the bytes it reads to be the committed ones."""
    p = Path(path).resolve()
    try:
        rel = p.relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return f"the record {p.name} is outside this repository checkout; it must be committed to main (ml/README.md)"
    try:
        tracked = subprocess.run(["git", "-C", str(ROOT), "ls-files", "--error-unmatch", "--", rel],
                                 capture_output=True, text=True, timeout=30)
        status = subprocess.run(["git", "-C", str(ROOT), "status", "--porcelain", "--", rel],
                                capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None                                # no git here: the clean-code check reports that
    if tracked.returncode != 0:
        return f"the record {p.name} is not tracked by git: commit it to main first (ml/README.md)"
    if status.stdout.strip():
        return f"the record {p.name} has uncommitted changes: the bytes read must be the committed ones"
    return None


def build_plan(cfg: Config, *, record: dict | None = None, record_sha: str | None = None) -> Plan:
    """Everything the command would do, and every reason it would be refused. Reads file presence and manifests
    only (never a case); writes nothing."""
    problems: list[str] = []
    notes: list[str] = []
    runs_root = Path(os.path.abspath(cfg.runs_root))     # children run from the repository root
    if record is None:
        try:
            record, record_sha = H.load_record(cfg.record_path)
        except H.HoldoutAuthorizationError as exc:
            problems.append(f"the authorization record: {exc}")
    tag = cfg.tag or (record_sha[:8] if record_sha else "norecord")
    log_dir = runs_root / f"_holdout_{tag}"
    comp_dir = log_dir / "comparisons"
    aggregate_out = (Path(os.path.abspath(cfg.aggregate_out)) if cfg.aggregate_out
                     else log_dir / "results_aggregate.json")
    plan = Plan([], problems, notes, log_dir, comp_dir, aggregate_out, [], [], record_sha)
    if record is None:
        return plan
    if cfg.require_committed_record:
        committed = record_problem(cfg.record_path)
        if committed:
            problems.append(committed)
    notes.append(f"record {Path(cfg.record_path).name} sha256 {record_sha}")
    notes.append(f"  {record['gate']} {record['gate_status']} at {record['closed_at']}; signed by "
                 f"{record['authorized_by']} at {record['authorized_at']}; decision {record['decision_ref']}")

    if not runs_root.is_dir():
        problems.append(f"the runs root does not exist: {runs_root}")
    elif D.inside_git_worktree(runs_root):
        problems.append(f"the runs root is inside a git work tree: {runs_root} (run directories live outside git)")
    if cfg.aggregate_base:                          # found out now, not after the last step
        base_path = Path(cfg.aggregate_base) if Path(cfg.aggregate_base).is_absolute() else ROOT / cfg.aggregate_base
        if not base_path.is_file():
            notes.append(f"  aggregate base {base_path.name} not found: a fresh aggregate will be written")
        else:
            try:
                base_doc = json.loads(base_path.read_text(encoding="utf-8"))
            except ValueError:
                base_doc = None
            if (not isinstance(base_doc, dict) or base_doc.get("format") != RA.FORMAT
                    or base_doc.get("population") != PARTITION):
                problems.append(f"--aggregate-base {base_path.name} is not a {RA.FORMAT} file for {PARTITION}")
    if cfg.require_clean_code:
        version = MF.code_version()["version"]
        if not MF.is_clean_code_version(version):
            problems.append(f"the checkout is not a clean commit ({version}): commit or stash changes under ml/; "
                            f"the exporter refuses code that is not a clean commit")
    exps = list(cfg.experiments)
    if not exps:
        problems.append("--experiments is empty")
    if len(set(exps)) != len(exps):
        problems.append("--experiments names an experiment twice")
    for e in exps:
        if not ID_RE.match(e):
            problems.append(f"{e} is not a core matrix run (EXP-U/D-025/050/100, spec 08 section 2)")
    derive = cfg.derive_from
    if derive is not None and derive != DERIVE_SOURCE:
        problems.append(f"--derive-pp-from {derive}: {DERIVED_ID} is derived from {DERIVE_SOURCE} only (ml.postprocess)")
        derive = None
    exps = [e for e in exps if ID_RE.match(e)]
    authorized = {r["experiment_id"]: r["checkpoint_sha256"] for r in record["authorized_runs"]}
    run_dir = lambda e: runs_root / e              # noqa: E731

    # --- per experiment: run, record, scored-once state ---
    facts: dict[str, dict] = {}
    state: dict[str, str] = {}
    for e in exps + ([derive] if derive and derive not in exps else []):
        d = run_dir(e)
        if not d.is_dir():
            f, run_problems = None, [f"{e}: no run directory at {d}; copy the finished run directory (config.json, "
                                     f"run_manifest.json, run_state.json, manifests/, checkpoints/best.pt) there "
                                     f"from the machine that trained it"]
        else:
            f, run_problems = MA.inspect_run(d, e)
        problems += run_problems
        if e not in authorized:
            problems.append(f"{e} is not in the record's authorized_runs {sorted(authorized)}: build and sign a "
                            f"record for it (tools/ml/make_holdout_authorization.py) and commit it")
        elif f is not None and f["best_sha256"] is not None:
            facts[e] = f
            try:
                H.verify_record(record, split_sha256=f["split_sha256"] or "", experiment_id=e,
                                checkpoint_sha256=f["best_sha256"])
            except H.HoldoutAuthorizationError as exc:
                problems.append(f"{e}: the record does not authorize this run: {exc}")
        fp = MA.holdout_footprint(d)
        if e in exps:
            state[e] = _state(fp, record_sha, e, problems)
        elif not (fp["predicted"] or fp["scored"]):
            problems.append(f"{e} (the source of {DERIVED_ID}) has no holdout predictions and is not in --experiments")
        else:
            state[e] = _state(fp, record_sha, e, problems)
        sha8 = (f["best_sha256"] or "")[:8] if f else "-"
        notes.append(f"  {e:<10} run {'COMPLETE' if f and not run_problems else 'NOT READY':<9} best.pt {sha8:<8} "
                     f"in record {'yes' if e in authorized else 'NO ':<3} holdout: {state.get(e, 'unknown')}")
    pp_cfg = Path(os.path.abspath(cfg.pp_config)) if cfg.pp_config else ROOT / DEFAULT_PP_CONFIG
    derived_state = "new"
    if derive:
        if DERIVED_ID not in authorized:
            problems.append(f"--derive-pp-from needs {DERIVED_ID} in the record's authorized_runs")
        elif derive in facts:
            if not pp_cfg.is_file():
                problems.append(f"the frozen post-processing config {pp_cfg.name} does not exist")
            else:
                try:
                    H.verify_record(record, split_sha256=facts[derive]["split_sha256"], experiment_id=DERIVED_ID,
                                    checkpoint_sha256=facts[derive]["best_sha256"],
                                    prediction_variant="PROCESSED_PREDICTION",
                                    postprocessing_config_sha256=D.sha256_file(pp_cfg))
                except H.HoldoutAuthorizationError as exc:
                    problems.append(f"{DERIVED_ID}: the record does not authorize this derivation: {exc}")
        dfp = MA.holdout_footprint(run_dir(DERIVED_ID))
        derived_state = _state(dfp, record_sha, DERIVED_ID, problems)
        if derived_state == "partial":
            problems.append(f"{DERIVED_ID}: has partial predictions; derived predictions are written atomically, "
                            f"inspect {run_dir(DERIVED_ID).name}/predictions before running again")
        notes.append(f"  {DERIVED_ID:<10} derived from {derive}; holdout: {derived_state}")

    # --- comparison pairs ---
    in_run = set(exps) | ({DERIVED_ID} if derive else set())
    pairs: list[tuple[str, str, bool, str]] = []        # (a, b, allow variant mismatch, label)
    families = list(dict.fromkeys(ID_RE.match(e).group(1) for e in exps))
    for fam in families:
        for lo, hi in WITHIN_FAMILY:
            a, b = f"EXP-{fam}-{lo}", f"EXP-{fam}-{hi}"
            if a in exps and b in exps:
                pairs.append((a, b, False, "within family"))
    if cfg.compare_family_pairs:
        for frac in FRACTIONS:
            u, dino = f"EXP-U-{frac}", f"EXP-D-{frac}"
            if u in exps or dino in exps:
                pairs.append((u, dino, False, "cross family (RQ-A)"))
    if derive:
        pairs.append((DERIVE_SOURCE, DERIVED_ID, True, "RAW -> PROCESSED ablation (RQ-B)"))
    for a, b, _, label in pairs:
        for side in (a, b):
            fp = MA.holdout_footprint(run_dir(side))
            if side not in in_run and not (fp["scored"] and fp["evaluation_manifest"]):
                problems.append(f"comparison {a} vs {b} ({label}): {side} is not in --experiments and has no "
                                f"evaluation/{PARTITION} in the runs root; score it first or drop the comparison")

    # --- the steps ---
    steps: list[Step] = []
    log = lambda name: log_dir / f"{name}.log"      # noqa: E731
    rec = os.path.abspath(cfg.record_path)
    pm = lambda e: run_dir(e) / MF.RUN_LAYOUT["predictions_manifest"].format(partition=PARTITION)    # noqa: E731
    em = lambda e: run_dir(e) / MF.RUN_LAYOUT["evaluation"].format(partition=PARTITION) / "evaluation_manifest.json"  # noqa: E731

    def infer(e):
        s = state.get(e, "new")
        argv = _py(cfg, "ml.infer", "--run-dir", str(run_dir(e)), "--population", "holdout",
                   "--holdout-authorization", rec)
        if cfg.device:
            argv += ["--device", cfg.device]
        if cfg.infer_batch:
            argv += ["--batch", str(cfg.infer_batch)]
        skip = s in ("predicted", "scored")
        steps.append(Step(f"{e}.infer", "infer", argv, log(f"{e}.infer"), "skip" if skip else "run",
                          "already predicted under this record" if skip else
                          ("resumes the partial inference" if s == "partial" else ""), [pm(e)]))

    def evaluate(e, s):
        argv = _py(cfg, "ml.evaluate", "run", "--run-dir", str(run_dir(e)), "--population", PARTITION,
                   "--allow-holdout", "--holdout-authorization", rec)
        steps.append(Step(f"{e}.evaluate", "evaluate", argv, log(f"{e}.evaluate"),
                          "skip" if s == "scored" else "run",
                          "already scored under this record" if s == "scored" else "", [em(e)]))

    for e in exps:
        infer(e)
        if derive == e:
            argv = _py(cfg, "ml.postprocess", "derive", "--source-run", str(run_dir(e)), "--population", "holdout",
                       "--config", str(pp_cfg), "--out-run", str(run_dir(DERIVED_ID)),
                       "--holdout-authorization", rec)
            skip = derived_state in ("predicted", "scored")
            steps.append(Step(f"{DERIVED_ID}.derive", "derive", argv, log(f"{DERIVED_ID}.derive"),
                              "skip" if skip else "run", "already derived under this record" if skip else "",
                              [pm(DERIVED_ID), run_dir(DERIVED_ID) / MF.RUN_LAYOUT["run_manifest"]]))
        evaluate(e, state.get(e, "new"))
        if derive == e:
            evaluate(DERIVED_ID, derived_state)
    if derive and derive not in exps:                   # the source was scored in an earlier command
        steps.append(Step(f"{DERIVED_ID}.derive", "derive",
                          _py(cfg, "ml.postprocess", "derive", "--source-run", str(run_dir(derive)), "--population",
                              "holdout", "--config", str(pp_cfg), "--out-run", str(run_dir(DERIVED_ID)),
                              "--holdout-authorization", rec), log(f"{DERIVED_ID}.derive"),
                          "skip" if derived_state in ("predicted", "scored") else "run",
                          "already derived under this record" if derived_state in ("predicted", "scored") else "",
                          [pm(DERIVED_ID), run_dir(DERIVED_ID) / MF.RUN_LAYOUT["run_manifest"]]))
        evaluate(DERIVED_ID, derived_state)

    for a, b, allow_mismatch, label in pairs:
        out = comp_dir / f"{a}__vs__{b}.{PARTITION}.json"
        argv = _py(cfg, "ml.evaluate", "compare", "--run-a", str(run_dir(a)), "--run-b", str(run_dir(b)),
                   "--population", PARTITION, "--out", str(out))
        if allow_mismatch:
            argv.append("--allow-variant-mismatch")
        steps.append(Step(f"{a}__vs__{b}.compare", "compare", argv, log(f"{a}__vs__{b}.compare"),
                          "skip" if out.exists() else "run", label + ("; file exists" if out.exists() else ""),
                          [out], [em(a), em(b)]))
        plan.aggregate_comparisons.append(out)

    for e in exps + ([DERIVED_ID] if derive else []):
        variant = "PROCESSED_PREDICTION" if e == DERIVED_ID else "RAW_PREDICTION"
        manifest = run_dir(e) / MF.RUN_LAYOUT["contract2"] / f"{X.default_manifest_id(e, variant)}.json"
        if manifest.exists():                           # ml.export_contract2 never overwrites: validate instead
            argv = [cfg.python, "-u", VALIDATOR, "--manifest", str(manifest), "--root", str(run_dir(e))]
            steps.append(Step(f"{e}.export", "validate", argv, log(f"{e}.export"), "run",
                              "manifest exists: validate it again", [manifest]))
        else:
            argv = _py(cfg, "ml.export_contract2", "--run-dir", str(run_dir(e)), "--gate-split-01", cfg.gate_split_01,
                       "--gate-ml-01", cfg.gate_ml_01, "--validate")
            if e == DERIVED_ID:
                argv += ["--source-run", str(run_dir(derive))]
            steps.append(Step(f"{e}.export", "export", argv, log(f"{e}.export"), "run", "", [manifest]))

    in_aggregate = list(dict.fromkeys(exps + ([DERIVED_ID] if derive else [])
                                      + [s for a, b, _, _ in pairs for s in (a, b)]))
    plan.aggregate_runs = [run_dir(e) for e in in_aggregate]
    steps.append(Step("aggregate", "aggregate", None, None, "run", f"-> {aggregate_out.name}", [aggregate_out]))
    plan.steps = steps
    return plan


# --- running ----------------------------------------------------------------------------------------

def subprocess_runner(step: Step, *, cwd: Path = ROOT, env: dict | None = None) -> int:
    """Run one step as a child process; stdout and stderr go to the step's log (append), live."""
    step.log.parent.mkdir(parents=True, exist_ok=True)
    child_env = dict(env or os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
    with open(step.log, "ab") as out:
        out.write(f"=== {step.key} {MF.now_iso()}\n{display(step.argv)}\n".encode("utf-8"))
        out.flush()
        proc = subprocess.run(step.argv, cwd=str(cwd), stdout=out, stderr=subprocess.STDOUT, env=child_env)
        out.write(f"--- exit {proc.returncode} {MF.now_iso()}\n".encode("utf-8"))
    return proc.returncode


def _tail(path: Path, lines: int = 8) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
    except OSError:
        return []


def _event(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(dict(obj, time=MF.now_iso()), ensure_ascii=False) + "\n")


def run_aggregate(cfg: Config, plan: Plan) -> str:
    base = None
    if cfg.aggregate_base:
        base_path = ROOT / cfg.aggregate_base if not Path(cfg.aggregate_base).is_absolute() else Path(cfg.aggregate_base)
        if base_path.is_file():
            base = json.loads(base_path.read_text(encoding="utf-8"))
    comparisons = [p for p in plan.aggregate_comparisons if p.is_file()]
    aggregate = RA.build_aggregate(plan.aggregate_runs, comparisons, base=base)
    return RA.write_aggregate(aggregate, plan.aggregate_out)


def summary_table(results: list[dict]) -> list[str]:
    width = max([len(r["key"]) for r in results] + [4])
    lines = [f"{'step':<{width}}  {'action':<6}  {'result':<8}  {'seconds':>8}"]
    for r in results:
        lines.append(f"{r['key']:<{width}}  {r['action']:<6}  {r['result']:<8}  {r.get('seconds', 0.0):>8.1f}")
    return lines


def result_lines(plan: Plan) -> list[str]:
    """The aggregate numbers, from the file just written (aggregates only)."""
    try:
        agg = json.loads(plan.aggregate_out.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    lines = [f"{'run':<10} {'variant':<9} {'Dice 3D mean [95% CI]':<28} {'median':>7} {'IoU':>7}  n={agg['n']}"]
    for r in agg["runs"]:
        ci = r["dice_ci95"]
        lines.append(f"{r['experiment_id']:<10} {r['variant'].split('_')[0]:<9} "
                     f"{r['dice_mean']:.4f} [{ci[0]:.4f}, {ci[1]:.4f}]".ljust(50)
                     + f" {r['dice_median']:>7.4f} {r['iou_mean']:>7.4f}")
    lines.append("")
    lines.append(f"{'comparison (b minus a)':<28} {'kind':<14} {'mean delta [95% CI]':<30} b higher / a higher")
    for c in agg["comparisons"]:
        name = f"{c['a']} -> {c['b']}"
        if "mean_delta" not in c:
            lines.append(f"{name:<28} {c.get('kind', ''):<14} NON_COMPARABLE {c.get('failed_checks')}")
        else:
            lines.append(f"{name:<28} {c.get('kind', ''):<14} {c['mean_delta']:+.4f} [{c['ci95'][0]:+.4f}, "
                         f"{c['ci95'][1]:+.4f}]".ljust(75) + f" {c['b_higher']} / {c['a_higher']}")
    return lines


def run_pipeline(cfg: Config, *, dry_run: bool = False, runner: Callable[[Step], int] | None = None,
                 echo: Callable[[str], None] = print) -> int:
    """0 = every step finished (or the dry run is clean), 1 = a step failed, 2 = refused at pre-flight."""
    plan = build_plan(cfg)
    echo("PRE-FLIGHT")
    for line in plan.notes:
        echo(line)
    n = len(plan.steps)
    echo(f"{'DRY RUN - nothing is executed' if dry_run else 'PLAN'}: {n} step(s), logs in {plan.log_dir}")
    for i, s in enumerate(plan.steps, 1):
        echo(f"[{i}/{n}] {s.key}  {s.action.upper()}{'  (' + s.note + ')' if s.note else ''}")
        if s.argv:
            echo(f"      {display(s.argv)}")
    if plan.problems:
        echo("")
        echo(f"REFUSED: {len(plan.problems)} problem(s); the command would stop here and run nothing:")
        for p in plan.problems:
            echo(f"  - {p}")
        if dry_run:
            echo("DRY RUN: the commands above are what would run once the problems are fixed.")
        return 2
    if dry_run:
        echo("DRY RUN: pre-flight is clean; run the same command without --dry-run to execute it.")
        return 0

    runner = runner or subprocess_runner
    events = plan.log_dir / "pipeline_log.jsonl"
    _event(events, {"event": "start", "record_sha256": plan.record_sha256, "experiments": cfg.experiments,
                    "steps": [s.key for s in plan.steps]})
    results: list[dict] = []
    failed = None
    for i, s in enumerate(plan.steps, 1):
        if s.action == "skip":
            results.append({"key": s.key, "action": "skip", "result": "skipped"})
            _event(events, {"event": "skipped", "step": s.key, "note": s.note})
            echo(f"[{i}/{n}] {s.key}: skipped ({s.note})")
            continue
        missing = [p for p in s.needs if not p.exists()]
        t0 = time.perf_counter()
        if missing:
            rc, reason = 1, "a required file is missing: " + ", ".join(p.name for p in missing)
        elif s.kind == "aggregate":
            echo(f"[{i}/{n}] {s.key}: running")
            try:
                digest = run_aggregate(cfg, plan)
                rc, reason = 0, f"sha256 {digest}"
            except (RA.AggregateError, OSError, ValueError) as exc:
                rc, reason = 1, f"{type(exc).__name__}: {exc}"
        else:
            echo(f"[{i}/{n}] {s.key}: running (log {s.log})")
            rc, reason = runner(s), ""
            if rc != 0:
                reason = f"exit {rc}"
            else:
                absent = [p for p in s.expect if not p.exists()]
                if absent:
                    rc, reason = 1, "finished but did not write " + ", ".join(p.name for p in absent)
        seconds = round(time.perf_counter() - t0, 1)
        if rc == 0:
            results.append({"key": s.key, "action": "run", "result": "ok", "seconds": seconds})
            _event(events, {"event": "ok", "step": s.key, "seconds": seconds, "detail": reason})
            echo(f"    ok ({seconds}s){' ' + reason if reason else ''}")
        else:
            results.append({"key": s.key, "action": "run", "result": "FAILED", "seconds": seconds})
            _event(events, {"event": "failed", "step": s.key, "seconds": seconds, "reason": reason})
            failed = (s, reason)
            break
    echo("")
    for line in summary_table(results):
        echo(line)
    if failed:
        s, reason = failed
        echo("")
        echo(f"STOPPED at {s.key}: {reason}")
        if s.log is not None:
            echo(f"  log: {s.log}")
            for line in _tail(s.log):
                echo(f"  | {line}")
        echo("  The remaining steps did not run. Fix the cause and run the IDENTICAL command again: finished "
             "steps are skipped, a crashed inference resumes, nothing is scored twice.")
        return 1
    echo("")
    for line in result_lines(plan):
        echo(line)
    echo("")
    echo(f"aggregate: {plan.aggregate_out}")
    echo("next: copy each new run directory (not predictions/validation, evaluation/validation, last.pt) into the "
         "backend experiments directory and redeploy (ml/README.md 'UNet family: from training to the app')")
    return 0


# --- CLI --------------------------------------------------------------------------------------------

def main(argv: list[str] | None = None, *, runner: Callable[[Step], int] | None = None,
         echo: Callable[[str], None] = print) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Holdout inference, evaluation, comparisons, Contract 2 export and "
                                             "aggregate for the runs a signed authorization record names")
    ap.add_argument("--record", required=True, type=Path, help="the signed ml-holdout-authorization/1 record")
    ap.add_argument("--runs-root", required=True, type=Path, help="the directory holding the EXP-* run directories")
    ap.add_argument("--experiments", required=True, nargs="+", metavar="EXP", help="e.g. EXP-U-025 EXP-U-050 EXP-U-100")
    ap.add_argument("--derive-pp-from", default=None, metavar="EXP-D-100",
                    help="also derive EXP-D-PP (frozen PP-4) from EXP-D-100's RAW holdout predictions; the record "
                         "must list EXP-D-PP")
    ap.add_argument("--compare-family-pairs", action="store_true",
                    help="also compare UNet and DINOv2 at equal fraction (EXP-U-<f> -> EXP-D-<f>)")
    ap.add_argument("--aggregate-out", type=Path, default=None,
                    help="where to write the aggregate JSON (default: <runs-root>/_holdout_<tag>/results_aggregate.json)")
    ap.add_argument("--aggregate-base", default=DEFAULT_AGGREGATE_BASE,
                    help="the aggregate to extend (repo-relative or absolute; 'none' for a fresh one)")
    ap.add_argument("--tag", default=None, help="names <runs-root>/_holdout_<tag> (default: first 8 hex of the record)")
    ap.add_argument("--pp-config", type=Path, default=None, help="the frozen PP-4 config (default: the Day 39 file)")
    ap.add_argument("--gate-split-01", default="ACCEPTED", choices=list(X.GATE_STATES))
    ap.add_argument("--gate-ml-01", default="ACCEPTED", choices=list(X.GATE_STATES))
    ap.add_argument("--device", choices=["cuda", "cpu"], default=None, help="passed to ml.infer")
    ap.add_argument("--infer-batch", type=int, default=None, help="passed to ml.infer as --batch")
    ap.add_argument("--dry-run", action="store_true", help="print the exact commands and the pre-flight verdict only")
    args = ap.parse_args(argv)
    cfg = Config(record_path=args.record, runs_root=args.runs_root, experiments=list(args.experiments),
                 derive_from=args.derive_pp_from, compare_family_pairs=args.compare_family_pairs, tag=args.tag,
                 pp_config=args.pp_config, gate_split_01=args.gate_split_01, gate_ml_01=args.gate_ml_01,
                 device=args.device, infer_batch=args.infer_batch, aggregate_out=args.aggregate_out,
                 aggregate_base=None if str(args.aggregate_base).lower() == "none" else args.aggregate_base)
    return run_pipeline(cfg, dry_run=args.dry_run, runner=runner, echo=echo)


if __name__ == "__main__":
    raise SystemExit(main())
