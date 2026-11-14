"""Predict raw masks for one population with a run's checkpoint.

    python -m ml.infer --run-dir <run>                       validation population, best.pt
    python -m ml.infer --run-dir <run> --population holdout --holdout-authorization <record.json>

The validation population is the default. The locked final holdout is refused unless BOTH
--population holdout AND --holdout-authorization <record.json> are given. The record is the
GATE-IMG-01 authorization (ml.holdout, format ml-holdout-authorization/1): the gate is CLOSED,
the post-processing configuration is frozen, and this run's experiment_id + checkpoints/best.pt
sha256 is authorized. It is verified before anything is read or written. The verified record
(and its sha256) is embedded in the predictions manifest; ml.evaluate refuses holdout
predictions made under any other record. --morphology-config <file> additionally checks
that the file's sha256 is the record's postprocessing_config_sha256. Only the frozen split
is accepted (#64 R-1).

Writes <run>/predictions/<partition>/:
    <case>.nrrd                 uint8 {0, 1}, NRRD axis order, the SOURCE MRI header geometry
                                (ml.data.write_mask_nrrd); never overwritten
    progress.jsonl              one line per finished case (resume after an interruption)
    predictions_manifest.json   ml-predictions/1: population, checkpoint sha256, per-file sha256;
                                written last - its presence means the predictions are complete
and <run>/manifests/population_<partition>.json (the exact case list, copied from the split).

Pipeline per case (ADR-ML-001): DR-011 image at native size -> bilinear resize to img ->
float16 rounding (the cache dtype, so the model sees what it saw in training) -> logits
-> bilinear resize of the LOGITS back to native (H, W) -> sigmoid >= 0.5. No post-processing:
these are RAW_PREDICTION masks.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch

from ml import data as D
from ml import evaluate as E
from ml import holdout as H
from ml import manifests as MF
from ml import models as M

THRESHOLD = 0.5
PREDICTION_VARIANT = "RAW_PREDICTION"
POSTPROCESSING_VERSION = "none"
POPULATIONS = {"validation": "validation", "holdout": D.HOLDOUT_PARTITION}


class PredictionFailures(RuntimeError):
    """Some cases failed; the predictions manifest was not written (re-run retries them)."""


class NonFiniteLogitsError(FloatingPointError):
    """The model produced NaN or Inf logits; thresholding them would silently give 0 (N-7)."""


# --- prediction --------------------------------------------------------------------------

@torch.no_grad()
def predict_native_mask(model: torch.nn.Module, image_resized: np.ndarray, native_hw: tuple[int, int], *,
                        device: str, precision: str, batch: int, threshold: float = THRESHOLD) -> np.ndarray:
    """uint8 {0, 1} [Z, H, W] from a model input stack [Z, img, img] (float16 or float32).

    Logits are resized back to native resolution BEFORE thresholding, a batch of slices
    at a time (slices are independent 2D images, so batching does not change the result).
    Non-finite logits raise NonFiniteLogitsError: sigmoid(NaN) >= 0.5 is False, so a NaN
    would otherwise become a silent background prediction.
    """
    was_training = model.training
    model.eval()
    z = image_resized.shape[0]
    out = np.empty((z, int(native_hw[0]), int(native_hw[1])), np.uint8)
    for start in range(0, z, batch):
        stop = min(start + batch, z)
        x = torch.from_numpy(np.asarray(image_resized[start:stop], dtype=np.float32))[:, None].to(device)
        with M.autocast_for(device, precision):
            logits = model(x)
        logits = logits[:, 0].float()
        if not bool(torch.isfinite(logits).all()):
            bad = int((~torch.isfinite(logits)).sum())
            raise NonFiniteLogitsError(f"{bad} non-finite logit(s) in slices {start}..{stop - 1}")
        native = D.resize_logits_back(logits, native_hw)
        out[start:stop] = D.logits_to_mask(native, threshold).cpu().numpy()
    if was_training:
        model.train()
    return out


def load_checkpoint_payload(path: Path) -> dict:
    return torch.load(path, map_location="cpu", weights_only=True)


def model_from_checkpoint(payload: dict, device: str) -> torch.nn.Module:
    model = M.build_model(payload["model_variant"], int(payload["img"]))
    model.load_state_dict(payload["model_state"], strict=True)
    return model.to(device).eval()


# --- run-directory helpers ---------------------------------------------------------------

def _run_identity(run_dir: Path, frozen_split: str | Path,
                  allow_unfrozen_split: bool = False) -> tuple[dict, dict, str]:
    """(config, split, split sha256). The named split must be the FROZEN one (sha256 pinned in
    ml.data, unless the TEST-ONLY switch is set) and the run's split copy must be byte-identical
    to it - a run directory cannot vouch for its own split (QA B-1 / B-2 / H9)."""
    frozen_sha = MF.require_frozen_split(frozen_split, allow_unfrozen_split=allow_unfrozen_split)
    config = D.load_json(run_dir / MF.RUN_LAYOUT["config"])
    split_path = run_dir / MF.RUN_LAYOUT["split_manifest_copy"]
    split_sha = D.sha256_file(split_path)
    if split_sha != frozen_sha:
        raise MF.SplitMismatchError(f"the run's split copy (sha256 {split_sha}) is not the frozen split "
                                    f"manifest (sha256 {frozen_sha}); refusing to predict")
    return config, D.load_split_manifest(split_path), split_sha


def ensure_population_manifest(run_dir: Path, split: dict, partition: str, split_sha: str) -> dict:
    """Write manifests/population_<partition>.json once; afterwards it must be byte-identical."""
    rel = MF.RUN_LAYOUT["population_manifest"].format(partition=partition)
    doc = MF.population_manifest(split, partition, split_sha)
    path = run_dir / rel
    if path.exists():
        if path.read_bytes() != MF.json_bytes(doc):
            raise ValueError(f"{path} differs from the split manifest's {partition} partition")
    else:
        MF.write_json_new(path, doc)
    return {"partition": partition, "role": doc["role"], "manifest_id": doc["manifest_id"], "path": rel,
            "sha256": D.sha256_file(path), "case_count": doc["case_count"]}


def resolve_checkpoint(run_dir: Path, which: str) -> tuple[Path, str]:
    """(path, sha256) of best.pt / last.pt, checked against what training recorded."""
    if which not in ("best", "last"):
        raise ValueError("checkpoint must be 'best' or 'last'")
    rel = f"{MF.RUN_LAYOUT['checkpoints']}/{which}.pt"
    path = run_dir / rel
    if not path.is_file():
        raise FileNotFoundError(f"{path} does not exist")
    digest = D.sha256_file(path)
    state_path = run_dir / "run_state.json"
    if state_path.exists():
        recorded = D.load_json(state_path).get(f"{which}_sha256")
        if recorded and recorded != digest:
            raise ValueError(f"{rel}: sha256 {digest} != recorded {recorded}")
    manifest_path = run_dir / MF.RUN_LAYOUT["run_manifest"]
    if which == "best" and manifest_path.exists():
        recorded = MF.validate_run_manifest(D.load_json(manifest_path))["checkpoint"]["sha256"]
        if recorded != digest:
            raise ValueError(f"{rel}: sha256 {digest} != run manifest {recorded}")
    return path, digest


def _check_authorization(loaded: tuple[dict, str], morphology_config: Path | None, *, split_sha: str,
                         experiment_id: str, checkpoint_sha256: str) -> dict:
    """The GATE-IMG-01 record (#64 N-1; loaded by ml.holdout.load_record), verified for THIS run;
    the block the predictions manifest carries."""
    block = H.verified_block(*loaded, split_sha256=split_sha, experiment_id=experiment_id,
                             checkpoint_sha256=checkpoint_sha256, prediction_variant=PREDICTION_VARIANT)
    if morphology_config is not None:
        frozen = block["record"]["postprocessing_config_sha256"]
        actual = D.sha256_file(morphology_config)
        if frozen is None or actual != frozen:
            raise H.HoldoutAuthorizationError(f"{Path(morphology_config).name} has sha256 {actual}; "
                                              f"the record freezes {frozen}")
        block["morphology_config_verified"] = True
    block["verified_at"] = MF.now_iso()
    return block


def resolve_runtime(device, precision: str | None, config: dict) -> tuple[str, str]:
    """(device string, precision actually used).

    Any CUDA spelling ("cuda", "cuda:0", torch.device("cuda", 0)) is recognised through
    torch.device(...).type, never a string comparison; autocast is CUDA-only, so a CPU run
    records fp32 whatever was asked.
    """
    device = device or config.get("device") or ("cuda" if torch.cuda.is_available() else "cpu")
    if M._device_kind(device) == "cuda":
        precision = precision or config.get("precision") or "bf16"
    else:
        precision = "fp32"
    return str(device), precision


def _read_progress(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _append(path: Path, obj: dict) -> None:
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
        f.flush()


# --- the driver ------------------------------------------------------------------------------

def predict_population(run_dir: str | Path, partition: str = "validation", *, checkpoint: str = "best",
                       device: str | None = None, precision: str | None = None, batch: int | None = None,
                       holdout_authorization: str | os.PathLike | None = None,
                       morphology_config: Path | None = None,
                       dataset_manifest: dict | None = None, package_root: str | Path | None = None,
                       skip_if_complete: bool = False, accept_failures: bool = False,
                       split_manifest: str | Path = D.DEFAULT_SPLIT_MANIFEST,
                       allow_unfrozen_split: bool = False, log=print) -> Path:
    """Predict every case of `partition`; return the predictions directory.

    Resumable: cases recorded as SUCCEEDED in progress.jsonl (and whose file still has the
    recorded sha256) are skipped; FAILED cases are retried. Refuses to overwrite: a complete
    predictions directory raises FileExistsError (or is returned as-is with
    skip_if_complete=True), and an unrecorded file in the directory raises.

    When a case fails, the manifest is NOT written and PredictionFailures is raised, so a
    re-run retries it. accept_failures=True (CLI --accept-failures) records the failures in
    the manifest instead - a deliberate decision, since the manifest is final.

    split_manifest is the FROZEN split (default: the repository's); the run's split copy
    must be byte-identical to it. Failure reasons never carry absolute paths.

    final_holdout needs holdout_authorization, the path of the GATE-IMG-01 record (ml.holdout),
    which must authorize this run's experiment_id with the sha256 of its checkpoints/best.pt;
    it uses best.pt only and never accepts the TEST-ONLY allow_unfrozen_split.
    """
    run_dir = Path(run_dir)
    if partition not in ("validation", D.HOLDOUT_PARTITION):
        raise ValueError("partition must be 'validation' or 'final_holdout'")
    holdout = partition == D.HOLDOUT_PARTITION
    loaded = None
    if holdout:
        H.refuse_unfrozen_split(partition, allow_unfrozen_split)
        if holdout_authorization is None:
            raise H.HoldoutAuthorizationError("final_holdout prediction needs --population holdout and "
                                              "--holdout-authorization <record.json> (GATE-IMG-01)")
        if checkpoint != "best":
            raise H.HoldoutAuthorizationError("final_holdout predictions use checkpoints/best.pt only "
                                              "(the checkpoint the authorization names)")
        loaded = H.load_record(holdout_authorization)    # JSON + structure first; run checks below
    elif holdout_authorization is not None:
        raise ValueError("a holdout authorization was given for a non-holdout population")
    H.refuse_split_inside_run(split_manifest, run_dir)
    config, split, split_sha = _run_identity(run_dir, split_manifest, allow_unfrozen_split)
    authorization, resolved = None, None
    if holdout:                             # verified before anything is read or written
        resolved = resolve_checkpoint(run_dir, checkpoint)
        authorization = _check_authorization(loaded, morphology_config, split_sha=split_sha,
                                             experiment_id=config["experiment_id"], checkpoint_sha256=resolved[1])
    pred_dir = run_dir / MF.RUN_LAYOUT["predictions"].format(partition=partition)
    manifest_path = run_dir / MF.RUN_LAYOUT["predictions_manifest"].format(partition=partition)
    if manifest_path.exists():
        if skip_if_complete:
            return pred_dir
        raise FileExistsError(f"{manifest_path} exists; raw predictions are immutable")
    if partition == D.HOLDOUT_PARTITION:
        allow = D.CaseAllowlist.for_holdout(split, allow_holdout=True)      # authorised above
    else:
        allow = D.CaseAllowlist.for_validation(split)
    population = ensure_population_manifest(run_dir, split, partition, split_sha)
    ckpt_path, ckpt_sha = resolved or resolve_checkpoint(run_dir, checkpoint)
    paths_cfg = config.get("paths") or {}
    dataset_manifest = dataset_manifest or D.load_dataset_manifest(
        _resolve(paths_cfg.get("dataset_manifest"), D.DEFAULT_DATASET_MANIFEST))
    package_root = Path(package_root or _resolve(paths_cfg.get("package_root"), D.DEFAULT_PACKAGE_ROOT))
    paths = D.case_paths(dataset_manifest, package_root, allowlist=allow)
    device, precision = resolve_runtime(device, precision, config)
    batch = int(batch or config.get("val_batch") or config.get("batch") or 4)

    pred_dir.mkdir(parents=True, exist_ok=True)
    progress_path = pred_dir / "progress.jsonl"
    progress = _read_progress(progress_path)
    starts = [p for p in progress if p.get("event") == "start"]
    if starts and starts[0]["checkpoint_sha256"] != ckpt_sha:
        raise ValueError("partial predictions in this directory came from a different checkpoint")
    done: dict[str, dict] = {}
    for p in progress:
        if p.get("event") == "case" and p["status"] == "SUCCEEDED":
            f = pred_dir / p["file"]
            if not f.is_file() or D.sha256_file(f) != p["sha256"]:
                raise ValueError(f"{f}: recorded prediction is missing or changed")
            done[p["case_id"]] = p
    known = {p["file"] for p in done.values()}
    stray = sorted(f.name for f in pred_dir.glob("*.nrrd") if f.name not in known)
    if stray:
        raise FileExistsError(f"{pred_dir} holds unrecorded predictions {stray[:3]}; refusing to "
                              f"overwrite - move them aside after checking where they came from")
    payload = load_checkpoint_payload(ckpt_path)
    if payload.get("experiment_id") != config["experiment_id"]:
        raise ValueError("the checkpoint belongs to a different experiment")
    model = model_from_checkpoint(payload, device)
    scrub = E.path_scrubber({str(run_dir.resolve()): "<run>", str(run_dir): "<run>",
                             str(package_root.resolve()): "<package_root>", str(package_root): "<package_root>"})
    cv = MF.code_version()
    _append(progress_path, {"event": "start", "time": MF.now_iso(), "checkpoint_sha256": ckpt_sha,
                            "device": device, "precision": precision, "batch": batch,
                            "code_version": cv["version"], "resumed_cases": len(done)})
    img = int(payload["img"])
    for n, cid in enumerate(allow, 1):
        if cid in done:
            continue
        t0 = time.perf_counter()
        try:
            image, header, info = D.load_image(cid, paths)
            x = D.model_input_stack(image, img)
            mask = predict_native_mask(model, x, image.shape[1:], device=device, precision=precision,
                                       batch=batch)
            digest = D.write_mask_nrrd(pred_dir / f"{cid}.nrrd", mask, header)
            rec = {"event": "case", "case_id": cid, "status": "SUCCEEDED", "file": f"{cid}.nrrd",
                   "sha256": digest, "source_mri_sha256": info["mri_sha256"],
                   "shape_xyz": list(reversed(mask.shape)),
                   "predicted_voxels": int(mask.sum(dtype=np.int64)),
                   "seconds": round(time.perf_counter() - t0, 3)}
            done[cid] = rec
        except D.DataAccessError:
            raise
        except Exception as exc:  # noqa: BLE001 - recorded with its reason, never dropped
            rec = {"event": "case", "case_id": cid, "status": "FAILED",
                   "failure_reason": scrub(f"{type(exc).__name__}: {exc}")[:300]}
        _append(progress_path, rec)
        if log:
            log(f"  [{n}/{len(allow)}] {cid} {rec['status']}")
    final = {p["case_id"]: p for p in _read_progress(progress_path) if p.get("event") == "case"}
    cases = []
    for cid in allow:
        rec = {k: v for k, v in final[cid].items() if k != "event"}
        cases.append(rec)
    failed = [c for c in cases if c["status"] != "SUCCEEDED"]
    if failed and not accept_failures:
        raise PredictionFailures(f"{len(failed)} case(s) failed, e.g. {failed[0]['case_id']}: "
                                 f"{failed[0]['failure_reason']}. Re-run to retry them, or accept the "
                                 f"failures (--accept-failures) to record them as FAILED.")
    manifest = {
        "format": MF.PREDICTIONS_FORMAT,
        "experiment_id": config["experiment_id"],
        "split_manifest": {"manifest_id": split.get("split_id"),
                           "path": MF.RUN_LAYOUT["split_manifest_copy"], "sha256": split_sha},
        "population": population,
        "intended_case_ids": allow.case_ids,
        "prediction_variant": PREDICTION_VARIANT,
        "postprocessing_version": POSTPROCESSING_VERSION,
        "threshold": THRESHOLD,
        "threshold_rule": "sigmoid(logit) >= 0.5 after bilinear resize of the logits to native size",
        "checkpoint": {"checkpoint_id": f"{config['experiment_id']}/{checkpoint}@epoch{payload['epoch']}",
                       "path": f"{MF.RUN_LAYOUT['checkpoints']}/{checkpoint}.pt", "sha256": ckpt_sha,
                       "epoch": payload["epoch"]},
        "model_variant": payload["model_variant"],
        "img": img,
        "preprocessing_version": D.PREPROCESSING_VERSION,
        "frozen_split": {"expected_sha256": D.FROZEN_SPLIT_SHA256, "actual_sha256": split_sha,
                         "is_frozen": split_sha == D.FROZEN_SPLIT_SHA256,
                         "allow_unfrozen_split": allow_unfrozen_split},
        "holdout_authorization": authorization,
        "inference": {"device": device, "precision": precision, "batch": batch,
                      "code_version": cv["version"], "code_dirty": cv["dirty"],
                      "models_version": M.MODELS_VERSION},
        "succeeded_n": sum(c["status"] == "SUCCEEDED" for c in cases),
        "failed_n": sum(c["status"] != "SUCCEEDED" for c in cases),
        "cases": cases,
        "created_at": MF.now_iso(),
    }
    MF.write_json_new(manifest_path, MF.validate_predictions_manifest(manifest))
    return pred_dir


def _resolve(value, default) -> Path:
    if not value:
        return Path(default)
    p = Path(value)
    return p if p.is_absolute() else D.REPO_ROOT / p


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Predict raw masks with a run's checkpoint")
    ap.add_argument("--run-dir", required=True, type=Path)
    ap.add_argument("--population", choices=sorted(POPULATIONS), default="validation")
    ap.add_argument("--holdout-authorization", type=Path, default=None, metavar="RECORD_JSON",
                    help="required with --population holdout: the GATE-IMG-01 authorization record "
                         "(format ml-holdout-authorization/1, ml/README.md)")
    ap.add_argument("--morphology-config", type=Path, default=None,
                    help="optional: the frozen morphology file; its sha256 must be the record's "
                         "postprocessing_config_sha256")
    ap.add_argument("--checkpoint", choices=["best", "last"], default="best")
    ap.add_argument("--device", choices=["cuda", "cpu"], default=None)
    ap.add_argument("--precision", choices=["fp32", "bf16"], default=None)
    ap.add_argument("--batch", type=int, default=None)
    ap.add_argument("--accept-failures", action="store_true",
                    help="write the manifest even if cases failed, recording them as FAILED")
    ap.add_argument("--split-manifest", type=Path, default=D.DEFAULT_SPLIT_MANIFEST,
                    help="the FROZEN split (default: the repository's); any other sha256 is refused")
    args = ap.parse_args(argv)
    partition = POPULATIONS[args.population]
    if partition == D.HOLDOUT_PARTITION and args.holdout_authorization is None:
        print("REFUSED: --population holdout needs --holdout-authorization <record.json> (GATE-IMG-01)")
        return 2
    if partition != D.HOLDOUT_PARTITION and args.holdout_authorization is not None:
        print("REFUSED: --holdout-authorization only applies to --population holdout")
        return 2
    try:
        out = predict_population(args.run_dir, partition, checkpoint=args.checkpoint, device=args.device,
                                 precision=args.precision, batch=args.batch,
                                 holdout_authorization=args.holdout_authorization,
                                 morphology_config=args.morphology_config,
                                 accept_failures=args.accept_failures, split_manifest=args.split_manifest)
    except (D.DataAccessError, FileExistsError, MF.ManifestError) as exc:
        print(f"REFUSED: {type(exc).__name__}: {exc}")
        return 2
    except PredictionFailures as exc:
        print(f"INCOMPLETE: {exc}")
        return 3
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
