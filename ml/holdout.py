"""Holdout guardrails (#64 QA R-1 and N-1): the frozen split only, and a structured
GATE-IMG-01 authorization record, checked before any final_holdout prediction or evaluation.
Nothing here reads a case.

R-1  ml.infer, ml.evaluate and ml.export_contract2 accept only the FROZEN split, a file whose
     sha256 is ml.data.FROZEN_SPLIT_SHA256 (by default the repository's split manifest). No CLI
     can override this. The API keeps allow_unfrozen_split, a TEST-ONLY switch that ml/train.py
     passes for synthetic validation runs, but final_holdout refuses it. A split named from
     inside the run directory it is meant to check is always refused (QA probes H9b and C6).

N-1  Final_holdout prediction and evaluation need an authorization record. It is a JSON file
     committed with the GATE-IMG-01 decision, in format "ml-holdout-authorization/1". Every
     field below is required; "notes" (a string) is the only optional one. No other key is
     accepted, and no key may appear twice:

         format                        "ml-holdout-authorization/1"
         gate                          "GATE-IMG-01"
         gate_status                   "CLOSED"
         closed_at                     ISO 8601 time with a UTC offset
         decision_ref                  repository-relative path of the decision record (must exist)
         split_sha256                  must equal ml.data.FROZEN_SPLIT_SHA256
         postprocessing_config_sha256  sha256 of the frozen morphology config, or null (RAW only)
         authorized_runs               non-empty list of {experiment_id, checkpoint_sha256}
         authorized_by                 the person who authorizes (non-empty string)
         authorized_at                 ISO 8601 time with a UTC offset, not before closed_at

     A tool refuses unless all of these hold:
       - the record is valid JSON with exactly these fields and types;
       - the gate is CLOSED;
       - the record's split is the frozen split;
       - THIS run's experiment_id, paired with the sha256 of its checkpoints/best.pt, appears
         in authorized_runs.
     A PROCESSED_PREDICTION run also needs a non-null postprocessing_config_sha256 equal to the
     one its predictions manifest records.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import re
from pathlib import Path

from ml import data as D
from ml import manifests as MF

AUTHORIZATION_FORMAT = "ml-holdout-authorization/1"
GATE = "GATE-IMG-01"
GATE_CLOSED = "CLOSED"
BEST_CHECKPOINT = f"{MF.RUN_LAYOUT['checkpoints']}/best.pt"
REPO_ROOT = D.REPO_ROOT            # decision_ref is resolved against this repository checkout
FIELDS = ("format", "gate", "gate_status", "closed_at", "decision_ref", "split_sha256",
          "postprocessing_config_sha256", "authorized_runs", "authorized_by", "authorized_at")
OPTIONAL_FIELDS = ("notes",)
RUN_FIELDS = ("experiment_id", "checkpoint_sha256")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class HoldoutAuthorizationError(D.HoldoutAccessError):
    """The holdout authorization record is missing or malformed, or does not authorize this run."""


class HoldoutSplitError(MF.SplitMismatchError, D.HoldoutAccessError):
    """final_holdout was asked to accept a split other than the frozen one."""


# --- R-1: the frozen split only --------------------------------------------------------------

def refuse_unfrozen_split(partition: str, allow_unfrozen_split) -> None:
    """final_holdout never accepts the TEST-ONLY allow_unfrozen_split switch."""
    if partition == D.HOLDOUT_PARTITION and allow_unfrozen_split is not False:
        raise HoldoutSplitError("final_holdout accepts only the frozen split: allow_unfrozen_split is a "
                                "TEST-ONLY switch for validation runs and is refused here (#64 R-1)")


def refuse_split_inside_run(split_manifest, run_dir) -> None:
    """The split named as the frozen one must not be a file inside the run directory it checks."""
    try:
        inside = Path(split_manifest).resolve().is_relative_to(Path(run_dir).resolve())
    except (OSError, ValueError):
        inside = False
    if inside:
        raise MF.SplitMismatchError("the split manifest named as the frozen split lies inside the run directory; "
                                    "a run cannot vouch for its own split - name the repository's frozen split "
                                    "(the default) (#64 R-1, probes H9b / C6)")


# --- N-1: the authorization record -------------------------------------------------------------

def _is_sha(value) -> bool:
    return isinstance(value, str) and bool(SHA256_RE.match(value))


def _is_name(value) -> bool:
    return isinstance(value, str) and bool(value.strip()) and value == value.strip()


def _is_repo_relative(ref) -> bool:
    if not isinstance(ref, str) or not ref or "\\" in ref or ":" in ref or ref.startswith("/"):
        return False
    return all(part not in ("", ".", "..") for part in ref.split("/"))


def _time(record: dict, key: str, problems: list[str]):
    value = record[key]
    if not isinstance(value, str):
        problems.append(f"{key} must be an ISO 8601 string")
        return None
    try:
        t = _dt.datetime.fromisoformat(value)
    except ValueError:
        problems.append(f"{key} {value!r} is not an ISO 8601 time")
        return None
    if t.utcoffset() is None:
        problems.append(f"{key} {value!r} has no UTC offset")
        return None
    return t


def _no_duplicate_keys(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"key {key!r} appears twice")
        out[key] = value
    return out


def _no_constants(name):
    raise ValueError(f"{name} is not JSON")


def validate_record(record) -> dict:
    """Check the record's structure: exactly the documented fields, types and constant values."""
    if not isinstance(record, dict):
        raise HoldoutAuthorizationError(f"authorization record must be a JSON object, not {type(record).__name__}")
    missing = [k for k in FIELDS if k not in record]
    unknown = sorted(set(record) - set(FIELDS) - set(OPTIONAL_FIELDS))
    if missing or unknown:
        raise HoldoutAuthorizationError(f"authorization record: missing fields {missing}, unknown fields {unknown}")
    problems: list[str] = []
    if record["format"] != AUTHORIZATION_FORMAT:
        problems.append(f"format must be {AUTHORIZATION_FORMAT!r}")
    if record["gate"] != GATE:
        problems.append(f"gate must be {GATE!r}")
    if not isinstance(record["gate_status"], str):
        problems.append("gate_status must be a string")
    elif record["gate_status"] != GATE_CLOSED:
        problems.append(f"gate_status is {record['gate_status']!r}: {GATE} is not CLOSED")
    closed, authorized = _time(record, "closed_at", problems), _time(record, "authorized_at", problems)
    if closed is not None and authorized is not None and authorized < closed:
        problems.append("authorized_at is before closed_at")
    if not _is_repo_relative(record["decision_ref"]):
        problems.append("decision_ref must be a repository-relative path with forward slashes")
    if not _is_sha(record["split_sha256"]):
        problems.append("split_sha256 must be a lowercase 64-hex sha256")
    if record["postprocessing_config_sha256"] is not None and not _is_sha(record["postprocessing_config_sha256"]):
        problems.append("postprocessing_config_sha256 must be null or a lowercase 64-hex sha256")
    runs = record["authorized_runs"]
    if not isinstance(runs, list) or not runs:
        problems.append("authorized_runs must be a non-empty list")
    else:
        seen = set()
        for n, run in enumerate(runs):
            if not isinstance(run, dict) or set(run) != set(RUN_FIELDS):
                problems.append(f"authorized_runs[{n}] must be exactly {{experiment_id, checkpoint_sha256}}")
                continue
            if not _is_name(run["experiment_id"]):
                problems.append(f"authorized_runs[{n}].experiment_id must be a non-empty string")
            elif run["experiment_id"] in seen:
                problems.append(f"authorized_runs[{n}].experiment_id {run['experiment_id']!r} is listed twice")
            else:
                seen.add(run["experiment_id"])
            if not _is_sha(run["checkpoint_sha256"]):
                problems.append(f"authorized_runs[{n}].checkpoint_sha256 must be a lowercase 64-hex sha256")
    if not _is_name(record["authorized_by"]):
        problems.append("authorized_by must be a non-empty string (a person's name)")
    if "notes" in record and not isinstance(record["notes"], str):
        problems.append("notes must be a string")
    if problems:
        raise HoldoutAuthorizationError("authorization record: " + "; ".join(problems))
    return record


def load_record(path) -> tuple[dict, str]:
    """(record, sha256 of the file's bytes). The record must be a file of valid, strict JSON."""
    if path is None:
        raise HoldoutAuthorizationError(f"final_holdout needs a {GATE} authorization record "
                                        f"(--holdout-authorization <record.json>, format {AUTHORIZATION_FORMAT})")
    if not isinstance(path, (str, os.PathLike)):
        raise HoldoutAuthorizationError(f"the holdout authorization must be the path of a record file, "
                                        f"not a {type(path).__name__}")
    p = Path(path)
    try:
        raw = p.read_bytes()
    except OSError as exc:
        raise HoldoutAuthorizationError(f"cannot read the authorization record {p.name}: {type(exc).__name__}") from exc
    try:
        record = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=_no_duplicate_keys,
                            parse_constant=_no_constants)
    except ValueError as exc:                     # UnicodeDecodeError and JSONDecodeError included
        raise HoldoutAuthorizationError(f"the authorization record {p.name} is not valid JSON: {exc}") from exc
    return validate_record(record), hashlib.sha256(raw).hexdigest()


def verify_record(record, *, split_sha256: str, experiment_id: str, checkpoint_sha256: str,
                  prediction_variant: str = "RAW_PREDICTION", postprocessing_config_sha256: str | None = None) -> dict:
    """Refuse unless the record authorizes THIS run (experiment_id + best.pt sha256) on the frozen split."""
    validate_record(record)
    frozen = D.FROZEN_SPLIT_SHA256
    if split_sha256 != frozen:
        raise HoldoutAuthorizationError(f"the run's split (sha256 {split_sha256}) is not the frozen split {frozen}")
    if record["split_sha256"] != frozen:
        raise HoldoutAuthorizationError(f"the record authorizes split sha256 {record['split_sha256']}, "
                                        f"not the frozen split {frozen}")
    if {"experiment_id": experiment_id, "checkpoint_sha256": checkpoint_sha256} not in record["authorized_runs"]:
        raise HoldoutAuthorizationError(f"{experiment_id} with {BEST_CHECKPOINT} sha256 {checkpoint_sha256} "
                                        f"is not in the record's authorized_runs")
    if prediction_variant == "PROCESSED_PREDICTION":
        frozen_pp = record["postprocessing_config_sha256"]
        if frozen_pp is None or frozen_pp != postprocessing_config_sha256:
            raise HoldoutAuthorizationError(f"processed predictions use post-processing config "
                                            f"{postprocessing_config_sha256}; the record freezes {frozen_pp}")
    elif prediction_variant != "RAW_PREDICTION":
        raise HoldoutAuthorizationError(f"unknown prediction variant {prediction_variant!r}")
    if not (Path(REPO_ROOT) / record["decision_ref"]).is_file():
        raise HoldoutAuthorizationError(f"decision_ref {record['decision_ref']} is not a file in this repository "
                                        f"checkout; commit the {GATE} decision first")
    return record


def verified_block(record: dict, record_sha256: str, **run) -> dict:
    """Verify a loaded record for this run (verify_record keywords); returns {"record_sha256",
    "record"}, the block that predictions and evaluation manifests carry."""
    verify_record(record, **run)
    return {"record_sha256": record_sha256, "record": record}


def authorize(path, **run) -> dict:
    """Load, validate and verify the record at `path` for this run (see verified_block)."""
    record, sha = load_record(path)
    return verified_block(record, sha, **run)


def require_same_record(embedded, block: dict, what: str = "the holdout predictions") -> None:
    """The holdout predictions must have been made under this very record (same bytes, same content)."""
    if (not isinstance(embedded, dict) or embedded.get("record_sha256") != block["record_sha256"]
            or embedded.get("record") != block["record"]):
        raise HoldoutAuthorizationError(f"{what} were not made under this authorization record "
                                        f"(sha256 {block['record_sha256']}); a presence-only or other record is refused")


def verify_embedded(embedded, **run) -> dict:
    """For a consumer that holds no record file (the exporter): the block a manifest carries must hold
    a structurally valid record that authorizes this run."""
    if not isinstance(embedded, dict) or not _is_sha(embedded.get("record_sha256")) or "record" not in embedded:
        raise HoldoutAuthorizationError("the predictions manifest carries no structured holdout authorization "
                                        f"(format {AUTHORIZATION_FORMAT})")
    verify_record(embedded["record"], **run)
    return embedded
