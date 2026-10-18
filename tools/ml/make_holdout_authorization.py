#!/usr/bin/env python3
"""Build a NEW `ml-holdout-authorization/1` record for finished run directories.

The leader signs, the script prepares. It never invents a name or a time: `--authorized-by` and
`--authorized-at` are required arguments. Everything else is read from files:

    for every run          run_state.json + run_manifest.json must say COMPLETE; checkpoints/best.pt is hashed
                           and must be the checkpoint the run recorded (run manifest, run_state.json); the run's
                           split copy must be the frozen split
    from the gate record   closed_at, decision_ref, split_sha256 and postprocessing_config_sha256 are COPIED from
                           the GATE-IMG-01 authorization record of Day 39 (the first record; the decision it
                           points to is committed). The post-processing sha256 is cross-checked against the
                           frozen PP-4 config file itself.

A run is scored once. The script refuses a run that already has `evaluation/final_holdout` or holdout predictions,
and a run whose (experiment_id, best.pt sha256) is already authorized in the gate record or in any record named
with --also-check-record. Refusals are all listed, nothing is written.

    python tools/ml/make_holdout_authorization.py --runs-root <runs> --experiments EXP-U-025 EXP-U-050 EXP-U-100 \\
        --authorized-by "<the leader's name>" --authorized-at 2026-10-20T09:00:00+07:00 \\
        --out management/<day>/gate_img_01/holdout_authorization_unet.json

The file is written UTF-8 with LF line ends, to a NEW path (never over an existing file), re-read with
`ml.holdout.load_record` (strict JSON, every field and type checked) and every run is verified against it with
`ml.holdout.verify_record`. The sha256 of the file is printed: commit the file to `main` before running the
pipeline, because `decision_ref` and the record are resolved from the committed checkout.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import sys
from pathlib import Path

ROOT =Path(__file__).resolve().parents[2]
for _p in (str(Path(__file__).resolve().parent), str(ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from ml import data as D          # noqa: E402
from ml import holdout as H       # noqa: E402
from ml import manifests as MF    # noqa: E402

DEFAULT_GATE_RECORD = "management/day39/gate_img_01/holdout_authorization.json"
DEFAULT_FROZEN_CONFIG = "management/day39/gate_img_01/postprocess_config.frozen.json"
PARTITION = D.HOLDOUT_PARTITION
CORE_ID_RE = re.compile(r"^EXP-([UD])-(025|050|100)$")
CORE_FRACTIONS = {"025": 0.25, "050": 0.5, "100": 1.0}


class Refused(Exception):
    """The record cannot be made; the message lists every reason."""


# --- one run ---------------------------------------------------------------------------------------

def _json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None


def inspect_run(run_dir: str | Path, expected_id: str | None = None) -> tuple[dict | None, list[str]]:
    """(facts, problems) for a trained run directory. facts is None when the run cannot be read at all."""
    run_dir = Path(run_dir)
    name = run_dir.name
    if not run_dir.is_dir():
        return None, [f"{name}: the run directory does not exist"]
    problems: list[str] = []
    state = _json(run_dir / "run_state.json")
    if state is None:
        problems.append(f"{name}: run_state.json is missing or unreadable - the run is not finished "
                        f"(ml.train writes it)")
    elif state.get("status") != "COMPLETE":
        problems.append(f"{name}: run_state.json status is {state.get('status')!r}, not COMPLETE")
    rm = _json(run_dir / MF.RUN_LAYOUT["run_manifest"])
    if rm is None:
        problems.append(f"{name}: run_manifest.json is missing or unreadable (ml.train writes it last)")
        return None, problems
    try:
        MF.validate_run_manifest(rm)
    except MF.ManifestError as exc:
        return None, problems + [f"{name}: run_manifest.json is not a valid run manifest: {exc}"]
    if rm["status"] != "COMPLETE":
        problems.append(f"{name}: run_manifest.json status is {rm['status']!r}, not COMPLETE")
    experiment_id = rm["experiment_id"]
    config = _json(run_dir / MF.RUN_LAYOUT["config"])
    if config is None or config.get("experiment_id") != experiment_id:
        problems.append(f"{name}: config.json is missing or names another experiment than run_manifest.json")
    if expected_id is not None and experiment_id != expected_id:
        problems.append(f"{name}: the run directory holds experiment {experiment_id}, not {expected_id}")
    core = CORE_ID_RE.match(experiment_id)
    if core:                                    # a core matrix id must say what the run really is (08 section 2)
        fraction = CORE_FRACTIONS[core.group(2)]
        if rm.get("training_fraction") != fraction:
            problems.append(f"{name}: {experiment_id} is a {fraction:g} run but the run trained on fraction "
                            f"{rm.get('training_fraction')!r}")
        family = str(rm.get("model_family", "")).lower()
        if core.group(1) == "U" and not family.startswith("unet") or core.group(1) == "D" and not family.startswith("dino"):
            problems.append(f"{name}: {experiment_id} names the {'UNet' if core.group(1) == 'U' else 'DINOv2'} "
                            f"family but the run's model_family is {rm.get('model_family')!r}")
    best = run_dir / H.BEST_CHECKPOINT
    best_sha = None
    if not best.is_file():
        problems.append(f"{name}: {H.BEST_CHECKPOINT} does not exist")
    else:
        best_sha = D.sha256_file(best)
        recorded = [("run_manifest.json", rm["checkpoint"]["sha256"]),
                    ("run_state.json", (state or {}).get("best_sha256"))]
        for where, sha in recorded:
            if sha is not None and sha != best_sha:
                problems.append(f"{name}: {H.BEST_CHECKPOINT} has sha256 {best_sha}, but {where} recorded {sha}; "
                                f"the checkpoint was replaced after training")
    split_copy = run_dir / MF.RUN_LAYOUT["split_manifest_copy"]
    split_sha = D.sha256_file(split_copy) if split_copy.is_file() else None
    if split_sha != D.FROZEN_SPLIT_SHA256:
        problems.append(f"{name}: the run's split copy is not the frozen split (sha256 {split_sha})")
    facts = {"experiment_id": experiment_id, "run_dir": run_dir, "best_sha256": best_sha,
             "best_epoch": (rm.get("checkpoint") or {}).get("epoch"), "split_sha256": split_sha,
             "training_fraction": rm.get("training_fraction"), "model_variant": rm.get("model_variant"),
             "deviations": list(rm.get("recipe_deviations_from_adr_ml_001") or [])}
    return facts, problems


def holdout_footprint(run_dir: str | Path) -> dict:
    """What a run already has on the final holdout (file presence and the record named inside; no case is read)."""
    run_dir = Path(run_dir)
    pred_dir = run_dir / MF.RUN_LAYOUT["predictions"].format(partition=PARTITION)
    pm_path = run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=PARTITION)
    eval_dir = run_dir / MF.RUN_LAYOUT["evaluation"].format(partition=PARTITION)

    def record_sha(path: Path):
        doc = _json(path)
        block = doc.get("holdout_authorization") if isinstance(doc, dict) else None
        return block.get("record_sha256") if isinstance(block, dict) else None

    predicted = pm_path.is_file()
    started = pred_dir.is_dir() and not predicted and (
        (pred_dir / "progress.jsonl").exists() or any(pred_dir.glob("*.nrrd")))
    return {"predicted": predicted, "partial": bool(started), "scored": eval_dir.exists(),
            "evaluation_manifest": (eval_dir / "evaluation_manifest.json").is_file(),
            "predictions_record_sha256": record_sha(pm_path) if predicted else None,
            "evaluation_record_sha256": record_sha(eval_dir / "evaluation_manifest.json")}


def already_used_problem(experiment_id: str, fp: dict) -> str | None:
    """The 'scored once' refusal text for a run with holdout artifacts, or None."""
    if fp["scored"]:
        return (f"{experiment_id}: already scored on the final holdout (evaluation/{PARTITION} exists, record "
                f"sha256 {fp['evaluation_record_sha256'] or 'not recorded'}); a run is scored once")
    if fp["predicted"]:
        return (f"{experiment_id}: already predicted on the final holdout (record sha256 "
                f"{fp['predictions_record_sha256'] or 'not recorded'}); finish it under that record")
    if fp["partial"]:
        return (f"{experiment_id}: has partial holdout predictions; resume them under the record that started "
                f"them, do not authorize the run again")
    return None


# --- the record ------------------------------------------------------------------------------------

def _resolve(path: str | Path, root: Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else root / p


def build_record(run_dirs: list[Path], *, authorized_by: str, authorized_at: str,
                 gate_record: str | Path = DEFAULT_GATE_RECORD, frozen_config: str | Path = DEFAULT_FROZEN_CONFIG,
                 also_check_records: list[Path] = (), notes: str | None = None,
                 expected_ids: list[str] | None = None) -> tuple[dict, list[dict], list[str]]:
    """(record, run facts, warnings). Raises Refused with every reason when the record cannot be made."""
    problems: list[str] = []
    warnings: list[str] = []
    gate_path = _resolve(gate_record, ROOT)
    gate, gate_sha = None, None
    try:
        gate, gate_sha = H.load_record(gate_path)
    except H.HoldoutAuthorizationError as exc:
        problems.append(f"gate record {gate_path.name}: {exc}")
    pp_sha = None
    if gate is not None:
        pp_sha = gate["postprocessing_config_sha256"]
        if gate["split_sha256"] != D.FROZEN_SPLIT_SHA256:
            problems.append("the gate record's split_sha256 is not the frozen split")
        if pp_sha is None:
            problems.append("the gate record freezes no post-processing config (postprocessing_config_sha256 is null)")
        cfg_path = _resolve(frozen_config, ROOT)
        if not cfg_path.is_file():
            problems.append(f"the frozen post-processing config {cfg_path.name} is not in the checkout; its sha256 "
                            f"cannot be checked against the gate record")
        elif pp_sha is not None and D.sha256_file(cfg_path) != pp_sha:
            problems.append(f"{cfg_path.name} has sha256 {D.sha256_file(cfg_path)}, but the gate record freezes "
                            f"{pp_sha}")
        if not (Path(H.REPO_ROOT) / gate["decision_ref"]).is_file():
            problems.append(f"decision_ref {gate['decision_ref']} is not a file in this checkout")
    if not run_dirs:
        problems.append("no run directory given")
    facts: list[dict] = []
    for n, run_dir in enumerate(run_dirs):
        f, run_problems = inspect_run(run_dir, expected_ids[n] if expected_ids else None)
        problems += run_problems
        if f is None:
            continue
        facts.append(f)
        used = already_used_problem(f["experiment_id"], holdout_footprint(run_dir))
        if used:
            problems.append(used)
        if f["deviations"]:
            warnings.append(f"{f['experiment_id']}: the run departs from ADR-ML-001: " + "; ".join(f["deviations"]))
    ids = [f["experiment_id"] for f in facts]
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        problems.append(f"{dup} is listed twice")
    known = ([(gate_path, gate)] if gate is not None else [])
    for path in also_check_records:
        try:
            known.append((Path(path), H.load_record(path)[0]))
        except H.HoldoutAuthorizationError as exc:
            problems.append(f"--also-check-record {Path(path).name}: {exc}")
    for path, record in known:
        listed = {(r["experiment_id"], r["checkpoint_sha256"]) for r in record["authorized_runs"]}
        listed_ids = {r["experiment_id"] for r in record["authorized_runs"]}
        for f in facts:
            if (f["experiment_id"], f["best_sha256"]) in listed:
                problems.append(f"{f['experiment_id']}: this checkpoint is already authorized in {path.name}; "
                                f"a run is scored once")
            elif f["experiment_id"] in listed_ids:
                warnings.append(f"{f['experiment_id']} is also named in {path.name} with another checkpoint")
    if problems:
        raise Refused("\n".join(f"  - {p}" for p in problems))
    if authorized_at == "now":
        authorized_at = _dt.datetime.now().astimezone().isoformat(timespec="seconds")
    record = {
        "format": H.AUTHORIZATION_FORMAT, "gate": H.GATE, "gate_status": H.GATE_CLOSED,
        "closed_at": gate["closed_at"], "decision_ref": gate["decision_ref"],
        "split_sha256": gate["split_sha256"], "postprocessing_config_sha256": pp_sha,
        "authorized_runs": [{"experiment_id": f["experiment_id"], "checkpoint_sha256": f["best_sha256"]}
                            for f in sorted(facts, key=lambda f: f["experiment_id"])],
        "authorized_by": authorized_by, "authorized_at": authorized_at,
        "notes": notes if notes is not None else
        (f"Built by tools/ml/make_holdout_authorization.py from {gate['decision_ref']} under the frozen "
         f"configuration; each run predicted and scored once."),
    }
    try:
        H.validate_record(record)
        for f in facts:
            H.verify_record(record, split_sha256=f["split_sha256"], experiment_id=f["experiment_id"],
                            checkpoint_sha256=f["best_sha256"])
    except H.HoldoutAuthorizationError as exc:
        raise Refused(f"  - {exc}") from exc
    return record, facts, warnings


def write_record(record: dict, out: str | Path) -> tuple[Path, str]:
    """Write to a NEW file (UTF-8, LF), re-read it with ml.holdout.load_record; returns (path, sha256)."""
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(out, "xb") as f:
            f.write(MF.json_bytes(record))
    except FileExistsError as exc:
        raise Refused(f"  - {out.name} exists; an authorization record is never overwritten (use a new name)") from exc
    loaded, sha = H.load_record(out)
    if loaded != record:
        raise Refused(f"  - {out.name} does not read back as written")
    return out, sha


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Build a new ml-holdout-authorization/1 record for finished runs")
    where = ap.add_mutually_exclusive_group(required=True)
    where.add_argument("--run-dirs", nargs="+", type=Path, metavar="RUN", help="the finished run directories")
    where.add_argument("--runs-root", type=Path, help="the directory holding the run directories (with --experiments)")
    ap.add_argument("--experiments", nargs="+", default=[], help="experiment ids under --runs-root")
    ap.add_argument("--authorized-by", required=True, help="the person who signs (never filled in by the script)")
    ap.add_argument("--authorized-at", required=True,
                    help="ISO 8601 time with a UTC offset (not before the gate's closed_at), or the word now")
    ap.add_argument("--out", required=True, type=Path, help="the NEW record file (commit it to main)")
    ap.add_argument("--gate-record", default=DEFAULT_GATE_RECORD,
                    help="the GATE-IMG-01 record to copy the gate fields from (default: the Day 39 record)")
    ap.add_argument("--frozen-config", default=DEFAULT_FROZEN_CONFIG,
                    help="the frozen post-processing config; its sha256 must be the gate record's")
    ap.add_argument("--also-check-record", action="append", type=Path, default=[],
                    help="another record whose runs must not be authorized again (repeatable)")
    ap.add_argument("--notes", default=None)
    args = ap.parse_args(argv)
    expected = None
    if args.runs_root is not None:
        if not args.experiments:
            print("REFUSED: --runs-root needs --experiments")
            return 2
        run_dirs, expected = [args.runs_root / e for e in args.experiments], list(args.experiments)
    else:
        run_dirs = args.run_dirs
    try:
        record, facts, warnings = build_record(
            run_dirs, authorized_by=args.authorized_by, authorized_at=args.authorized_at,
            gate_record=args.gate_record, frozen_config=args.frozen_config,
            also_check_records=args.also_check_record, notes=args.notes, expected_ids=expected)
        out, sha = write_record(record, args.out)
    except Refused as exc:
        print(f"REFUSED: no record written\n{exc}")
        return 2
    except H.HoldoutAuthorizationError as exc:
        print(f"REFUSED: {exc}")
        return 2
    for w in warnings:
        print(f"WARNING: {w}")
    print(f"{'experiment':<11} {'fraction':>8} {'best epoch':>10}  best.pt sha256")
    for f in sorted(facts, key=lambda f: f["experiment_id"]):
        print(f"{f['experiment_id']:<11} {f['training_fraction']!s:>8} {f['best_epoch']!s:>10}  {f['best_sha256']}")
    print(f"gate     {record['gate']} {record['gate_status']} at {record['closed_at']}; decision {record['decision_ref']}")
    print(f"post-processing config sha256 {record['postprocessing_config_sha256']} (copied from the gate record, "
          f"checked against the config file)")
    print(f"signed by {record['authorized_by']} at {record['authorized_at']}")
    print(f"wrote {out}")
    print(f"record sha256 {sha}")
    try:
        inside = out.resolve().is_relative_to(ROOT)
    except OSError:
        inside = False
    print("next: commit the record to main" if inside else
          "next: the record is OUTSIDE this repository; copy it into the repository and commit it to main")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
