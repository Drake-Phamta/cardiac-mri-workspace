"""Run a list of experiment configs one after another: skip completed runs, resume partial
ones, log every transition.

    python -m ml.queue --queue <queue.json> [--epochs E] [--batch B] [--log <queue_log.jsonl>] [--dry-run]

queue.json
    [ {<ml.train config>}, "relative/or/absolute/config.json", ... ]        queue_id = file stem
    or {"queue_id": "matrix-v1", "experiments": [ ...same entries... ],
        "compare": [["EXP-U-025", "EXP-D-025"], ...]}
    (ml/configs/matrix_queue.template.json is the six-run template; set E and the batch first,
    or pass --epochs / --batch, which apply the same values to every run and are recorded in
    each run's config.json)

Per experiment: train -> predict the validation population with best.pt -> evaluate it
(ml.train's post-training step). Children run unbuffered (python -u), so the per-run stdout
log is live; monitor <run>/train_log.jsonl and _queue/<queue_id>/queue_log.jsonl. Every
config's split must be the pinned frozen split before the first run starts, and a COMPLETE
run whose config.json differs from its queue entry is reported as failed, not skipped.
The queue refuses to start without psutil (the run lock checks pid and create_time). After all runs: for each "compare" pair whose two runs are
COMPLETE, a paired VALIDATION comparison (ml.evaluate.compare_runs) written once to
<runs_root>/_queue/<queue_id>/comparisons/<a>__vs__<b>.validation.json. The holdout is
never touched by the queue.

Run it as a module from the repository root. Running ml/queue.py as a file would put ml/ on
sys.path and shadow the standard-library `queue` module that torch's DataLoader imports.

Each experiment runs in its own Python process (python -m ml.train --config <file>), so a
CUDA failure or leak in one run cannot poison the next. Status before each run comes from
the run directory (ml.train.run_status): COMPLETE runs are skipped, PARTIAL / STARTED runs
resume (ml.train resumes from last.pt), NEW runs start. A run that fails is logged with
its exit code and the queue moves on; the exit code of the queue is non-zero when any run
failed. Inline configs are written to <runs_root>/_queue/<queue_id>/configs/ so the exact
config each run used is on disk next to the log. Every config is validated BEFORE the
first run starts, so a typo in run 5 cannot surface hours later.

The queue never requests holdout access: it only launches ml.train, which only builds
training and validation allowlists.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from ml import data as D
from ml import manifests as MF
from ml import train as T

STATUS_ACTION = {"COMPLETE": "skip", "PARTIAL": "resume", "STARTED": "restart", "NEW": "start"}


def _log(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(dict(obj, time=MF.now_iso()), ensure_ascii=False) + "\n")


def load_queue(path: Path, *, epochs: int | None = None,
               batch: int | None = None) -> tuple[str, list[dict], list[tuple[str, str]]]:
    """(queue_id, configs with --epochs/--batch applied, comparison pairs). Validates everything."""
    q = D.load_json(path)
    if isinstance(q, list):                      # a bare JSON list of configs / paths
        q = {"queue_id": Path(path).stem, "experiments": q}
    if not isinstance(q, dict) or not isinstance(q.get("experiments"), list) or not q["experiments"]:
        raise ValueError("queue must be a JSON list of configs, or "
                         "{\"queue_id\": ..., \"experiments\": [config | path, ...], \"compare\": [[a, b], ...]}")
    queue_id = q.get("queue_id") or Path(path).stem
    if not T._ID_RE.match(queue_id):
        raise ValueError("queue_id must match [A-Za-z0-9][A-Za-z0-9._-]*")
    configs = []
    for item in q["experiments"]:
        if isinstance(item, str):
            p = Path(item)
            p = p if p.is_absolute() else Path(path).parent / p
            configs.append(D.load_json(p))
        elif isinstance(item, dict):
            configs.append(item)
        else:
            raise ValueError(f"queue entries are config objects or paths, got {type(item).__name__}")
    configs = [T.apply_overrides(c, epochs=epochs, batch=batch) for c in configs]
    ids = [c.get("experiment_id") for c in configs]
    if len(ids) != len(set(ids)):
        raise ValueError(f"experiment_id repeated in the queue: {ids}")
    for c in configs:                            # fail before the first run, not hours later
        T.check_frozen_split(T.validate_config(c))       # the pinned frozen split (QA B-2)
    pairs = []
    for pair in q.get("compare") or []:
        if not (isinstance(pair, list) and len(pair) == 2 and all(p in ids for p in pair) and pair[0] != pair[1]):
            raise ValueError(f"compare entries are [experiment_a, experiment_b] from this queue, got {pair!r}")
        pairs.append((pair[0], pair[1]))
    return queue_id, configs, pairs


def run_comparisons(pairs: list[tuple[str, str]], configs: list[dict], queue_dir: Path, log_path: Path,
                    *, dry_run: bool = False, echo=print) -> list[dict]:
    """Paired VALIDATION comparison (ml.evaluate.compare_runs) for each pair whose two runs are
    COMPLETE; written once to <queue_dir>/comparisons/<a>__vs__<b>.validation.json."""
    from ml import evaluate as E
    by_id = {c["experiment_id"]: T.validate_config(c) for c in configs}
    results = []
    for a, b in pairs:
        ca, cb = by_id[a], by_id[b]
        run_a, run_b = T.run_dir_for(ca), T.run_dir_for(cb)
        out = queue_dir / "comparisons" / f"{a}__vs__{b}.validation.json"
        entry = {"event": "compare", "run_a": a, "run_b": b, "population": "validation", "out": str(out)}
        if dry_run:
            results.append(dict(entry, outcome="planned"))
            continue
        if out.exists():
            results.append(dict(entry, outcome="exists"))
        elif T.run_status(run_a) != "COMPLETE" or T.run_status(run_b) != "COMPLETE":
            results.append(dict(entry, outcome="skipped", reason="both runs must be COMPLETE"))
        else:
            try:
                report = E.compare_runs(run_a, run_b, "validation",
                                        split_manifest=T._path(ca, "split_manifest", D.DEFAULT_SPLIT_MANIFEST),
                                        allow_unfrozen_split=ca["allow_unfrozen_split"])
                report["note"] = ("VALIDATION population: a pipeline / model-selection check, not a result; "
                                  "the locked holdout is evaluated only after GATE-IMG-01")
                MF.write_json_new(out, report)
                results.append(dict(entry, outcome="compared",
                                    comparable=report["report"]["comparability"]["label"]))
            except Exception as exc:  # noqa: BLE001 - logged, the queue result says it failed
                results.append(dict(entry, outcome="failed", error=f"{type(exc).__name__}: {exc}"[:300]))
        _log(log_path, results[-1])
        echo(f"    compare {a} vs {b}: {results[-1]['outcome']}")
    return results


def require_psutil() -> None:
    """The run lock identifies a live trainer by pid AND create_time; without psutil it cannot."""
    try:
        import psutil  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("ml.queue needs psutil (the run lock checks pid and create_time); "
                           "pip install psutil") from exc


def run_queue(queue_path: Path, *, log_path: Path | None = None, dry_run: bool = False,
              python: str = sys.executable, env: dict | None = None, echo=print,
              epochs: int | None = None, batch: int | None = None) -> dict:
    require_psutil()
    queue_id, configs, pairs = load_queue(queue_path, epochs=epochs, batch=batch)
    first = T.validate_config(configs[0])
    queue_dir = T._path(first, "runs_root", T.DEFAULT_RUNS_ROOT) / "_queue" / queue_id
    if D.inside_git_worktree(queue_dir):
        raise ValueError(f"{queue_dir} is inside a git work tree")
    log_path = log_path or queue_dir / "queue_log.jsonl"
    _log(log_path, {"event": "queue_start", "queue_id": queue_id, "queue_file": str(queue_path),
                    "experiments": [c["experiment_id"] for c in configs], "dry_run": dry_run})
    results = []
    for n, raw in enumerate(configs, 1):
        cfg = T.validate_config(raw)
        run_dir = T.run_dir_for(cfg)
        status = T.run_status(run_dir)
        action = STATUS_ACTION[status]
        entry = {"experiment_id": cfg["experiment_id"], "run_dir": str(run_dir), "status_before": status,
                 "action": action}
        echo(f"[{n}/{len(configs)}] {cfg['experiment_id']}: {status} -> {action}")
        if action == "skip":
            # a COMPLETE run is only "skipped" when it was trained with exactly this config
            recorded = (run_dir / MF.RUN_LAYOUT["config"]).read_bytes()
            if recorded != MF.json_bytes(raw):
                reason = "COMPLETE run has a different config.json than this queue entry"
                _log(log_path, dict(entry, event="failed", reason=reason))
                results.append(dict(entry, outcome="failed", reason=reason))
                echo(f"    failed: {reason}")
                continue
        if action == "skip" or dry_run:
            _log(log_path, dict(entry, event="planned" if dry_run else "skipped"))
            results.append(dict(entry, outcome="skipped" if action == "skip" else "planned"))
            continue
        cfg_file = queue_dir / "configs" / f"{cfg['experiment_id']}.json"
        MF.write_json_replace(cfg_file, raw)
        stdout_path = run_dir.parent / f"{cfg['experiment_id']}.stdout.log"
        stdout_path.parent.mkdir(parents=True, exist_ok=True)
        _log(log_path, dict(entry, event="launch", config_file=str(cfg_file), stdout=str(stdout_path)))
        t0 = time.perf_counter()
        child_env = dict(env or os.environ, PYTHONUNBUFFERED="1")         # live per-run stdout log
        with open(stdout_path, "ab") as out:
            proc = subprocess.run([python, "-u", "-m", "ml.train", "--config", str(cfg_file)],
                                  cwd=str(D.REPO_ROOT), stdout=out, stderr=subprocess.STDOUT, env=child_env)
        elapsed = round(time.perf_counter() - t0, 1)
        after = T.run_status(run_dir)
        outcome = "completed" if proc.returncode == 0 and after == "COMPLETE" else "failed"
        _log(log_path, dict(entry, event=outcome, exit_code=proc.returncode, status_after=after,
                            wall_time_s=elapsed))
        echo(f"    {outcome} (exit {proc.returncode}, {elapsed}s, now {after})")
        results.append(dict(entry, outcome=outcome, exit_code=proc.returncode, status_after=after))
    comparisons = run_comparisons(pairs, configs, queue_dir, log_path, dry_run=dry_run, echo=echo)
    failed = [r["experiment_id"] for r in results if r["outcome"] == "failed"]
    failed += [f"compare:{c['run_a']}__vs__{c['run_b']}" for c in comparisons if c["outcome"] == "failed"]
    _log(log_path, {"event": "queue_end", "queue_id": queue_id, "failed": failed})
    return {"queue_id": queue_id, "log": str(log_path), "results": results, "comparisons": comparisons,
            "failed": failed}


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Run experiment configs sequentially (skip / resume / start)")
    ap.add_argument("--queue", required=True, type=Path)
    ap.add_argument("--log", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true", help="show what would run; launch nothing")
    ap.add_argument("--epochs", type=int, default=None, help="the one E for every run (recorded per run)")
    ap.add_argument("--batch", type=int, default=None, help="the one batch for every run (recorded per run)")
    args = ap.parse_args(argv)
    result = run_queue(args.queue, log_path=args.log, dry_run=args.dry_run, epochs=args.epochs, batch=args.batch)
    print(f"queue log: {result['log']}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
