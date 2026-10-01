"""Run a list of experiment configs one after another: skip completed runs, resume partial
ones, log every transition.

    python -m ml.queue --queue <queue.json> [--log <queue_log.jsonl>] [--dry-run]

queue.json
    [ {<ml.train config>}, "relative/or/absolute/config.json", ... ]        queue_id = file stem
    or {"queue_id": "matrix-v1", "experiments": [ ...same entries... ]}
    (ml/configs/matrix_queue.template.json is the six-run template; set E and the batch first)

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


def load_queue(path: Path) -> tuple[str, list[dict]]:
    q = D.load_json(path)
    if isinstance(q, list):                      # a bare JSON list of configs / paths
        q = {"queue_id": Path(path).stem, "experiments": q}
    if not isinstance(q, dict) or not isinstance(q.get("experiments"), list) or not q["experiments"]:
        raise ValueError("queue must be a JSON list of configs, or "
                         "{\"queue_id\": ..., \"experiments\": [config | path, ...]}")
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
    ids = [c.get("experiment_id") for c in configs]
    if len(ids) != len(set(ids)):
        raise ValueError(f"experiment_id repeated in the queue: {ids}")
    for c in configs:
        T.validate_config(c)                     # fail before the first run, not hours later
    return queue_id, configs


def run_queue(queue_path: Path, *, log_path: Path | None = None, dry_run: bool = False,
              python: str = sys.executable, env: dict | None = None, echo=print) -> dict:
    queue_id, configs = load_queue(queue_path)
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
        with open(stdout_path, "ab") as out:
            proc = subprocess.run([python, "-m", "ml.train", "--config", str(cfg_file)], cwd=str(D.REPO_ROOT),
                                  stdout=out, stderr=subprocess.STDOUT, env=env or dict(os.environ))
        elapsed = round(time.perf_counter() - t0, 1)
        after = T.run_status(run_dir)
        outcome = "completed" if proc.returncode == 0 and after == "COMPLETE" else "failed"
        _log(log_path, dict(entry, event=outcome, exit_code=proc.returncode, status_after=after,
                            wall_time_s=elapsed))
        echo(f"    {outcome} (exit {proc.returncode}, {elapsed}s, now {after})")
        results.append(dict(entry, outcome=outcome, exit_code=proc.returncode, status_after=after))
    failed = [r["experiment_id"] for r in results if r["outcome"] == "failed"]
    _log(log_path, {"event": "queue_end", "queue_id": queue_id, "failed": failed})
    return {"queue_id": queue_id, "log": str(log_path), "results": results, "failed": failed}


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Run experiment configs sequentially (skip / resume / start)")
    ap.add_argument("--queue", required=True, type=Path)
    ap.add_argument("--log", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true", help="show what would run; launch nothing")
    args = ap.parse_args(argv)
    result = run_queue(args.queue, log_path=args.log, dry_run=args.dry_run)
    print(f"queue log: {result['log']}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
