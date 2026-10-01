"""Train one experiment from a JSON config. Resumable.

    python -m ml.train --config <experiment.json> [--epochs E] [--batch B]

--epochs / --batch, when given, replace the config's values before anything else and are
recorded in the run's config.json (E comes from the calendar rule at launch time).

CONFIG (JSON; unknown keys are refused so a typo cannot silently change a run)
    experiment_id   run directory name, e.g. "EXP-U-025"                       required
    variant         one of ml.models.VARIANTS                                  required
    subset          "25_percent" | "50_percent" | "100_percent"               required
    epochs, batch, lr, img, seed                                               required
                    batch must be 8, 4 or 2 (ADR-ML-001)
    precision       "bf16" (CUDA autocast) | "fp32"         default bf16 on CUDA, fp32 on CPU
    device          "cuda" | "cpu"                          default cuda when available
    num_workers     DataLoader workers                      default 0
    val_batch       slices per forward pass in validation   default = batch
    post_train_validation   predict + evaluate the validation population with best.pt
                            (ml.infer + ml.evaluate)        default true
    require_clean_code      refuse to start from a modified ml/ tree   default false
    allow_unfrozen_split    TEST ONLY: accept a split whose sha256 is not ml.data.FROZEN_SPLIT_SHA256
                            (synthetic test splits); recorded as a deviation   default false.
                            Without it, any other split is refused before anything is written.
    paths           {split_manifest, dataset_manifest, package_root, cache_root, runs_root}
                    optional; relative paths resolve against the repository root
    notes           free text, recorded

WHAT IT DOES (the ADR-ML-001 recipe, declared before any result)
    * trains on the subset's effective_case_ids only, through the slice cache (ml.data);
      the allowlists come from CaseAllowlist.for_training / for_validation - this module
      never requests holdout access, and a test checks that it cannot;
    * loss 0.5 * BCEWithLogits (mean over pixels) + 0.5 * soft Dice on sigmoid probabilities
      (per sample, smoothing 1.0, mean over the batch); AdamW at a constant lr with torch's
      default betas / weight decay; bf16 autocast on CUDA; no augmentation; all slices,
      reshuffled every epoch by ONE generator seeded with `seed` and reused across epochs;
    * every epoch: mean validation 3D Dice over the validation cases, scored at NATIVE
      resolution (logits resized back, then thresholded at 0.5) - the same rule ml.evaluate
      and ml.infer apply;
    * keeps checkpoints/last.pt (every epoch, with optimizer + RNG state) and
      checkpoints/best.pt (strictly better mean validation Dice; ties keep the earlier
      epoch), each with its SHA-256 in run_state.json and in the log;
    * train_log.jsonl: per epoch train loss, validation Dice (mean and per case), wall
      times, peak memory;
    * resumes from last.pt (the config must be byte-for-byte the same; last.pt carries the
      shuffle generator's state, so a resumed run trains the same batches as an
      uninterrupted one);
    * when all epochs are done: optional validation predictions + evaluation, then
      run_manifest.json with the `08` section 10 fields. Its presence means COMPLETE.

Run directories live OUTSIDE git: <CARDIAC_RUNS_ROOT>/<experiment_id>/, where
CARDIAC_RUNS_ROOT is the environment variable, else `cardiac-runs` next to the main checkout
of this repository (ml.data.main_checkout_root(); no machine-specific path is hard-coded).
The device is "cuda" or "cpu" exactly; any other spelling is refused, never reinterpreted.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import re
import socket
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from ml import data as D
from ml import evaluate as E
from ml import infer as I
from ml import manifests as MF
from ml import models as M

DEFAULT_RUNS_ROOT = Path(os.environ.get("CARDIAC_RUNS_ROOT") or D.main_checkout_root().parent / "cardiac-runs")
TRAIN_CODE_VERSION = "ml-train-1.0.0"
REQUIRED = {"experiment_id": str, "variant": str, "subset": str, "epochs": int, "batch": int,
            "lr": float, "img": int, "seed": int}
OPTIONAL = {"precision": str, "device": str, "num_workers": int, "val_batch": int,
            "post_train_validation": bool, "require_clean_code": bool, "paths": dict, "notes": str,
            "allow_unfrozen_split": bool}
PATH_KEYS = {"split_manifest", "dataset_manifest", "package_root", "cache_root", "runs_root"}
BATCH_CHOICES = (8, 4, 2)
ADR_ML_001 = {"img": 560, "lr": 1e-4, "seed": 2024, "precision": "bf16", "device": "cuda",
              "variants": tuple(M.ADR_ML_001_FAMILIES.values())}
RECIPE = {
    "loss": ("0.5 * BCEWithLogits (mean over all pixels) + 0.5 * soft Dice on sigmoid probabilities "
             "(per sample, smoothing 1.0, mean over the batch); computed in fp32"),
    "optimizer": "AdamW (torch defaults: betas 0.9/0.999, eps 1e-8, weight_decay 0.01), trainable params only",
    "lr_policy": "constant",
    "precision": "bf16 autocast on CUDA (fp32 on CPU)",
    "augmentation": "none",
    "slices": ("all slices of every training case, reshuffled every epoch by ONE torch.Generator seeded "
               "with the seed and reused across epochs; its state is saved in last.pt and restored on resume"),
    "threshold": "sigmoid >= 0.5 after resizing logits back to native resolution",
    "checkpoint_selection": ("best mean validation 3D Dice over the validation partition, evaluated every "
                             "epoch at NATIVE resolution (logits resized back, then thresholded); strictly "
                             "greater replaces, ties keep the earlier epoch"),
    "normalization": "DR-011 per-volume (ml.data)",
}
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# Test hook: called after each epoch's checkpoints and log line are written.
_after_epoch_hook = None


class ConfigError(ValueError):
    pass


class ConfigMismatch(RuntimeError):
    """An existing run directory was started with a different config."""


# --- config -----------------------------------------------------------------------------------

def validate_config(cfg: dict) -> dict:
    """Type/value checks; returns a normalized copy with defaults filled in."""
    if not isinstance(cfg, dict):
        raise ConfigError("config must be a JSON object")
    unknown = sorted(set(cfg) - set(REQUIRED) - set(OPTIONAL))
    if unknown:
        raise ConfigError(f"unknown config keys {unknown}")
    out = {}
    for key, typ in REQUIRED.items():
        if key not in cfg:
            raise ConfigError(f"missing required key {key!r}")
        val = cfg[key]
        if typ is float and isinstance(val, int) and not isinstance(val, bool):
            val = float(val)
        if not isinstance(val, typ) or isinstance(val, bool):
            raise ConfigError(f"{key} must be {typ.__name__}, got {type(val).__name__}")
        out[key] = val
    for key, typ in OPTIONAL.items():
        if key in cfg:
            if not isinstance(cfg[key], typ) or (typ is int and isinstance(cfg[key], bool)):
                raise ConfigError(f"{key} must be {typ.__name__}")
            out[key] = cfg[key]
    if not _ID_RE.match(out["experiment_id"]):
        raise ConfigError("experiment_id must match [A-Za-z0-9][A-Za-z0-9._-]*")
    M.parse_variant(out["variant"])
    M.check_img(out["variant"], out["img"])
    if out["subset"] not in MF.SUBSET_FRACTIONS:
        raise ConfigError(f"subset must be one of {sorted(MF.SUBSET_FRACTIONS)}")
    if out["epochs"] < 1:
        raise ConfigError("epochs must be >= 1")
    if out["batch"] not in BATCH_CHOICES:
        raise ConfigError(f"batch must be one of {BATCH_CHOICES} (ADR-ML-001)")
    if not (out["lr"] > 0 and math.isfinite(out["lr"])):
        raise ConfigError("lr must be a positive number")
    device = out.get("device") or ("cuda" if torch.cuda.is_available() else "cpu")
    if device not in ("cuda", "cpu"):
        raise ConfigError("device must be 'cuda' or 'cpu'")
    out["device"] = device
    precision = out.get("precision") or ("bf16" if device == "cuda" else "fp32")
    if precision not in ("bf16", "fp32"):
        raise ConfigError("precision must be 'bf16' or 'fp32'")
    if precision == "bf16" and device != "cuda":
        raise ConfigError("bf16 autocast needs CUDA")
    out["precision"] = precision
    out.setdefault("num_workers", 0)
    out.setdefault("val_batch", out["batch"])
    out.setdefault("post_train_validation", True)
    out.setdefault("require_clean_code", False)
    out.setdefault("allow_unfrozen_split", False)          # TEST-ONLY; recorded as a deviation
    paths = dict(out.get("paths") or {})
    bad = sorted(set(paths) - PATH_KEYS)
    if bad:
        raise ConfigError(f"unknown paths keys {bad}")
    out["paths"] = paths
    return out


def recipe_deviations(cfg: dict, split_sha256: str | None = None) -> list[str]:
    """Where this config departs from the ADR-ML-001 declared values (recorded, not refused)."""
    dev = []
    for key in ("img", "lr", "seed", "precision", "device"):
        if cfg[key] != ADR_ML_001[key]:
            dev.append(f"{key} {cfg[key]!r} != ADR-ML-001 {ADR_ML_001[key]!r}")
    if cfg["variant"] not in ADR_ML_001["variants"]:
        dev.append(f"variant {cfg['variant']!r} is not an ADR-ML-001 family {list(ADR_ML_001['variants'])}")
    if cfg.get("allow_unfrozen_split"):
        dev.append("allow_unfrozen_split=true (TEST-ONLY switch)")
    if split_sha256 is not None and split_sha256 != D.FROZEN_SPLIT_SHA256:
        dev.append(f"split manifest sha256 {split_sha256} is NOT the frozen split {D.FROZEN_SPLIT_SHA256}")
    return dev


def check_frozen_split(cfg: dict) -> tuple[Path, str]:
    """(path, sha256) of the split the config names. Anything but the FROZEN split
    (ml.data.FROZEN_SPLIT_SHA256) is refused unless the config sets the TEST-ONLY switch
    allow_unfrozen_split, which recipe_deviations() and the run manifest record. Called
    before anything is written (QA B-2 / probe P1)."""
    path = _path(cfg, "split_manifest", D.DEFAULT_SPLIT_MANIFEST)
    return path, MF.require_frozen_split(path, allow_unfrozen_split=cfg["allow_unfrozen_split"])


def _path(cfg: dict, key: str, default) -> Path:
    value = cfg["paths"].get(key)
    if not value:
        return Path(default)
    p = Path(value)
    return p if p.is_absolute() else D.REPO_ROOT / p


def run_dir_for(cfg: dict) -> Path:
    return _path(cfg, "runs_root", DEFAULT_RUNS_ROOT) / cfg["experiment_id"]


def run_status(run_dir: Path) -> str:
    """COMPLETE | PARTIAL (has last.pt) | STARTED (config only) | NEW."""
    if (run_dir / MF.RUN_LAYOUT["run_manifest"]).exists():
        return "COMPLETE"
    if (run_dir / MF.RUN_LAYOUT["checkpoints"] / "last.pt").exists():
        return "PARTIAL"
    if (run_dir / MF.RUN_LAYOUT["config"]).exists():
        return "STARTED"
    return "NEW"


# --- loss and validation ------------------------------------------------------------------------

def soft_dice_loss(logits: torch.Tensor, target: torch.Tensor, smooth: float = 1.0) -> torch.Tensor:
    """1 - soft Dice on sigmoid probabilities, computed per sample (over its pixels) with
    smoothing 1.0, then averaged over the batch."""
    p = torch.sigmoid(logits).flatten(1)
    t = target.flatten(1)
    dice = (2.0 * (p * t).sum(dim=1) + smooth) / (p.sum(dim=1) + t.sum(dim=1) + smooth)
    return 1.0 - dice.mean()


def recipe_loss(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """ADR-ML-001: 0.5 * BCEWithLogits (mean over all pixels) + 0.5 * soft Dice (mean over the batch), fp32."""
    logits = logits.float()
    return 0.5 * F.binary_cross_entropy_with_logits(logits, target) + 0.5 * soft_dice_loss(logits, target)


def validate(model, val_ds: D.SliceDataset, *, device: str, precision: str, batch: int) -> dict:
    """Mean 3D Dice over the validation cases, at native resolution (ml.evaluate semantics)."""
    per_case = {}
    for cid in val_ds.case_list:
        image, _ = val_ds.case_arrays(cid)
        ref = np.asarray(val_ds.native_mask(cid))
        pred = I.predict_native_mask(model, image, ref.shape[1:], device=device, precision=precision,
                                     batch=batch)
        c = E.confusion_counts(pred, ref)
        dice = E.dice_score(c["tp"], c["fp"], c["fn"])
        if dice is None:
            raise RuntimeError(f"{cid}: validation Dice undefined (empty reference and prediction)")
        per_case[cid] = dice
    return {"val_mean_dice_3d": float(np.mean(list(per_case.values()))), "val_dice_per_case": per_case}


# --- checkpoints -------------------------------------------------------------------------------

def _save_atomic(obj: dict, path: Path) -> str:
    tmp = path.with_name(path.name + ".tmp")
    torch.save(obj, tmp)
    os.replace(tmp, path)
    return D.sha256_file(path)


def _cpu_copy(state_dict: dict) -> dict:
    return {k: v.detach().to("cpu", copy=True) for k, v in state_dict.items()}


def _last_payload(cfg, model, optimizer, epoch, best, best_state, config_sha, shuffle_gen) -> dict:
    """last.pt: everything needed to resume, INCLUDING the best weights so far.

    last.pt is the single commit point of an epoch: best.pt is always re-derivable from it,
    so an interruption between the two writes cannot leave them inconsistent.
    """
    return {
        "format": "ml-checkpoint/1",
        "kind": "last",
        "experiment_id": cfg["experiment_id"],
        "model_variant": cfg["variant"],
        "img": cfg["img"],
        "epoch": epoch,
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "best": dict(best),
        "best_model_state": best_state,
        "config_sha256": config_sha,
        "backbone_checkpoint": getattr(model, "checkpoint_ref", None),
        "shuffle_generator_state": shuffle_gen.get_state(),
        "torch_rng_state": torch.get_rng_state(),
        "cuda_rng_states": torch.cuda.get_rng_state_all() if cfg["device"] == "cuda" else [],
    }


def _best_payload(cfg, best, best_state, config_sha, backbone) -> dict:
    """best.pt: the selected weights only (what ml.infer loads)."""
    return {
        "format": "ml-checkpoint/1",
        "kind": "best",
        "experiment_id": cfg["experiment_id"],
        "model_variant": cfg["variant"],
        "img": cfg["img"],
        "epoch": best["epoch"],
        "model_state": best_state,
        "best": dict(best),
        "config_sha256": config_sha,
        "backbone_checkpoint": backbone,
    }


# --- the lock ------------------------------------------------------------------------------------

def _create_time(pid: int) -> float | None:
    import psutil                                    # required: the queue refuses to start without it
    try:
        return psutil.Process(pid).create_time()
    except psutil.Error:
        return None


def _acquire_lock(run_dir: Path) -> Path:
    """One trainer per run directory. A lock left by a dead process is taken over.

    The lock records the pid AND that process's create_time, so a recycled pid is not taken
    for the original trainer.
    """
    lock = run_dir / ".lock.json"
    if lock.exists():
        held = D.load_json(lock)
        if held.get("state") == "held" and held.get("host") == socket.gethostname():
            pid = int(held.get("pid", -1))
            alive = pid != os.getpid() and _create_time(pid) is not None and \
                (held.get("create_time") is None or _create_time(pid) == held.get("create_time"))
            if alive:
                raise RuntimeError(f"{run_dir} is being trained by pid {pid}")
    MF.write_json_replace(lock, {"state": "held", "pid": os.getpid(), "create_time": _create_time(os.getpid()),
                                 "host": socket.gethostname(), "since": MF.now_iso()})
    return lock


def _release_lock(lock: Path) -> None:
    MF.write_json_replace(lock, {"state": "released", "pid": os.getpid(), "host": socket.gethostname(),
                                 "at": MF.now_iso()})


# --- the run -------------------------------------------------------------------------------------

def _log(path: Path, obj: dict) -> None:
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def _ensure_file(path: Path, data: bytes, what: str) -> None:
    if path.exists():
        if path.read_bytes() != data:
            raise ConfigMismatch(f"{path} exists with different content ({what})")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "xb") as f:
            f.write(data)


def environment(device: str = "cpu") -> dict:
    """Software and hardware identity. The GPU is queried only for a CUDA run, so a CPU run
    never opens a CUDA context on a GPU someone else is using."""
    env = {"python": platform.python_version(), "platform": platform.platform(), "torch": torch.__version__,
           "numpy": np.__version__, "device": device, "host": socket.gethostname()}
    try:
        import transformers
        env["transformers"] = transformers.__version__
    except ImportError:
        env["transformers"] = "not installed"
    try:
        import nrrd
        env["pynrrd"] = getattr(nrrd, "__version__", "unknown")
    except ImportError:
        pass
    if device == "cuda":
        try:
            env["gpu_name"] = torch.cuda.get_device_name(0)
            env["vram_total_bytes"] = int(torch.cuda.get_device_properties(0).total_memory)
            env["cuda_runtime_in_torch_build"] = torch.version.cuda
        except Exception as exc:  # noqa: BLE001 - recorded, never guessed
            env["gpu_name"] = f"NOT MEASURED - {type(exc).__name__}: {str(exc)[:100]}"
    return env


def run_experiment(raw_config: dict, *, log=print) -> dict:
    """Train (or resume, or skip) one experiment. Returns {"status", "run_dir", ...}."""
    log = log or (lambda *args, **kwargs: None)
    cfg = validate_config(raw_config)
    check_frozen_split(cfg)                      # before ANYTHING is written (QA B-2 / probe P1)
    run_dir = run_dir_for(cfg)
    if D.inside_git_worktree(run_dir):
        raise ConfigError(f"run directory {run_dir} is inside a git work tree; runs stay outside git")
    config_bytes = MF.json_bytes(raw_config)
    if run_status(run_dir) == "COMPLETE":
        if (run_dir / MF.RUN_LAYOUT["config"]).read_bytes() != config_bytes:
            raise ConfigMismatch(f"{run_dir} is complete with a different config")
        return {"status": "SKIPPED_COMPLETE", "run_dir": str(run_dir)}
    run_dir.mkdir(parents=True, exist_ok=True)
    lock = _acquire_lock(run_dir)
    try:
        return _run_locked(cfg, raw_config, config_bytes, run_dir, log=log)
    finally:
        _release_lock(lock)


def _run_locked(cfg: dict, raw_config: dict, config_bytes: bytes, run_dir: Path, *, log) -> dict:
    _ensure_file(run_dir / MF.RUN_LAYOUT["config"], config_bytes, "config.json")
    config_sha = D.sha256_file(run_dir / MF.RUN_LAYOUT["config"])
    # The split must be the FROZEN one (sha256 pinned in ml.data) unless the TEST-ONLY switch is
    # set; the run's copy is written from it and must stay byte-identical (QA B-1 / B-2).
    split_src, src_sha = check_frozen_split(cfg)
    split_bytes = split_src.read_bytes()
    _ensure_file(run_dir / MF.RUN_LAYOUT["split_manifest_copy"], split_bytes, "split manifest copy")
    split = D.load_split_manifest(run_dir / MF.RUN_LAYOUT["split_manifest_copy"])
    split_sha = D.sha256_file(run_dir / MF.RUN_LAYOUT["split_manifest_copy"])
    if split_sha != src_sha:
        raise MF.SplitMismatchError("the run's split copy is not byte-identical to the frozen split manifest")
    subset_rel = MF.RUN_LAYOUT["training_subset_manifest"].format(subset=cfg["subset"])
    _ensure_file(run_dir / subset_rel,
                 MF.json_bytes(MF.training_subset_manifest(split, cfg["subset"], split_sha)), "subset manifest")
    population = I.ensure_population_manifest(run_dir, split, "validation", split_sha)

    cv = MF.code_version()
    if cfg["require_clean_code"] and cv["dirty"] is not False:
        raise RuntimeError(f"require_clean_code: ml/ is modified or git is unavailable ({cv['version']})")
    if cfg["device"] == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("config asks for CUDA but torch sees no GPU")

    train_allow = D.CaseAllowlist.for_training(split, cfg["subset"])
    val_allow = D.CaseAllowlist.for_validation(split)
    dataset_manifest = D.load_dataset_manifest(_path(cfg, "dataset_manifest", D.DEFAULT_DATASET_MANIFEST))
    package_root = _path(cfg, "package_root", D.DEFAULT_PACKAGE_ROOT)
    cache_dir = _path(cfg, "cache_root", D.DEFAULT_CACHE_ROOT) / split["split_id"] / f"img{cfg['img']}"
    D.build_cache(train_allow, D.case_paths(dataset_manifest, package_root, allowlist=train_allow),
                  cfg["img"], cache_dir, log=log)
    D.build_cache(val_allow, D.case_paths(dataset_manifest, package_root, allowlist=val_allow),
                  cfg["img"], cache_dir, native_mask=True, log=log)
    train_ds = D.SliceDataset(train_allow, cache_dir)
    val_ds = D.SliceDataset(val_allow, cache_dir)

    device, precision = cfg["device"], cfg["precision"]
    torch.manual_seed(cfg["seed"])
    model = M.build_model(cfg["variant"], cfg["img"]).to(device)
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=cfg["lr"])
    log_path = run_dir / MF.RUN_LAYOUT["train_log"]
    state_path = run_dir / "run_state.json"
    ckpt_dir = run_dir / MF.RUN_LAYOUT["checkpoints"]
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    state = D.load_json(state_path) if state_path.exists() else {}
    best = {"epoch": None, "val_mean_dice_3d": None}
    best_state = None
    start_epoch = 1
    last_path, best_path = ckpt_dir / "last.pt", ckpt_dir / "best.pt"
    backbone = getattr(model, "checkpoint_ref", None)
    shuffle_gen = torch.Generator().manual_seed(cfg["seed"])     # ONE generator, reused across epochs
    if last_path.exists():
        digest = D.sha256_file(last_path)
        payload = torch.load(last_path, map_location="cpu", weights_only=True)
        if payload["config_sha256"] != config_sha:
            raise ConfigMismatch("last.pt was written under a different config")
        if state.get("last_sha256") not in (None, digest) and int(payload["epoch"]) <= int(state.get("epochs_done", 0)):
            raise RuntimeError(f"{last_path} does not match the sha256 recorded in run_state.json")
        model.load_state_dict(payload["model_state"], strict=True)
        optimizer.load_state_dict(payload["optimizer_state"])
        best = dict(payload["best"])
        best_state = payload["best_model_state"]
        start_epoch = int(payload["epoch"]) + 1
        shuffle_gen.set_state(payload["shuffle_generator_state"])
        torch.set_rng_state(payload["torch_rng_state"])
        if device == "cuda" and payload.get("cuda_rng_states"):
            torch.cuda.set_rng_state_all(payload["cuda_rng_states"])
        # last.pt is the epoch's commit point. best.pt is kept when it is the one last.pt names
        # (torch.save is not byte-deterministic, so an identical rewrite would change its
        # sha256); otherwise an interruption fell between the two writes and best.pt is
        # re-derived from the best weights stored in last.pt.
        best_consistent = (best_path.exists() and state.get("best_epoch") == best["epoch"]
                           and state.get("best_sha256") == D.sha256_file(best_path))
        if not best_consistent:
            state["best_sha256"] = _save_atomic(_best_payload(cfg, best, best_state, config_sha, backbone),
                                                best_path)
        state.update({"last_sha256": digest, "epochs_done": int(payload["epoch"]),
                      "best_epoch": best["epoch"], "best_val_mean_dice_3d": best["val_mean_dice_3d"]})
        _log(log_path, {"event": "resume", "time": MF.now_iso(), "from_epoch": start_epoch,
                        "last_sha256": digest, "best_sha256": state["best_sha256"],
                        "best_rederived": not best_consistent, "code_version": cv["version"]})
        log(f"  resuming {cfg['experiment_id']} at epoch {start_epoch}")
    else:
        _log(log_path, {"event": "start", "time": MF.now_iso(), "config_sha256": config_sha,
                        "code_version": cv["version"], "code_dirty": cv["dirty"],
                        "train_cases": len(train_allow), "train_slices": len(train_ds),
                        "validation_cases": len(val_allow), "device": device, "precision": precision,
                        "environment": environment(device)})
    versions = list(state.get("code_versions_used") or [])
    if cv["version"] not in versions:
        versions.append(cv["version"])
    state.update({"experiment_id": cfg["experiment_id"], "status": "RUNNING", "code_versions_used": versions,
                  "config_sha256": config_sha})
    MF.write_json_replace(state_path, state)

    model.train()
    first_step_logged = False
    loader = torch.utils.data.DataLoader(train_ds, batch_size=cfg["batch"], shuffle=True, generator=shuffle_gen,
                                         num_workers=cfg["num_workers"], drop_last=False,
                                         pin_memory=(device == "cuda"))
    for epoch in range(start_epoch, cfg["epochs"] + 1):
        t_epoch = time.perf_counter()
        tracker = M.PeakTracker(device)
        tracker.start()
        loss_sum, steps, seen = 0.0, 0, 0
        for x, y in loader:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with M.autocast_for(device, precision):
                logits = model(x)
            if not first_step_logged:            # runtime evidence of the precision actually in effect
                evidence = {"event": "first_step", "time": MF.now_iso(), "epoch": epoch,
                            "logits_dtype": str(logits.dtype), "precision_configured": precision,
                            "device": device,
                            "cuda_bf16_supported": (bool(torch.cuda.is_bf16_supported())
                                                    if M._device_kind(device) == "cuda" else None)}
                _log(log_path, evidence)
                state["first_step_evidence"] = {k: evidence[k] for k in
                                                ("logits_dtype", "precision_configured", "cuda_bf16_supported")}
                first_step_logged = True
            loss = recipe_loss(logits, y)
            if not torch.isfinite(loss):
                raise FloatingPointError(f"non-finite loss at epoch {epoch}, step {steps + 1}")
            loss.backward()
            optimizer.step()
            loss_sum += float(loss.detach()) * x.shape[0]
            seen += x.shape[0]
            steps += 1
            tracker.sample()
        t_train = time.perf_counter() - t_epoch
        t_val0 = time.perf_counter()
        val = validate(model, val_ds, device=device, precision=precision, batch=cfg["val_batch"])
        model.train()
        t_val = time.perf_counter() - t_val0
        tracker.sample()
        is_best = best["val_mean_dice_3d"] is None or val["val_mean_dice_3d"] > best["val_mean_dice_3d"]
        if is_best:
            best = {"epoch": epoch, "val_mean_dice_3d": val["val_mean_dice_3d"]}
            best_state = _cpu_copy(model.state_dict())
        state["last_sha256"] = _save_atomic(                       # commit point of the epoch
            _last_payload(cfg, model, optimizer, epoch, best, best_state, config_sha, shuffle_gen), last_path)
        if is_best:
            state["best_sha256"] = _save_atomic(_best_payload(cfg, best, best_state, config_sha, backbone),
                                                best_path)
        state.update({"epochs_done": epoch, "best_epoch": best["epoch"],
                      "best_val_mean_dice_3d": best["val_mean_dice_3d"]})
        MF.write_json_replace(state_path, state)
        record = {"event": "epoch", "time": MF.now_iso(), "epoch": epoch, "epochs": cfg["epochs"],
                  "train_loss_mean": loss_sum / max(seen, 1), "train_steps": steps, "train_slices": seen,
                  "val_mean_dice_3d": val["val_mean_dice_3d"], "val_dice_per_case": val["val_dice_per_case"],
                  "is_best": is_best, "best_epoch": best["epoch"],
                  "best_val_mean_dice_3d": best["val_mean_dice_3d"],
                  "wall_time_s": {"train": round(t_train, 3), "validation": round(t_val, 3),
                                  "epoch": round(time.perf_counter() - t_epoch, 3)},
                  "peak_memory": tracker.result(),
                  "last_sha256": state["last_sha256"], "best_sha256": state.get("best_sha256")}
        _log(log_path, record)
        log(f"  epoch {epoch}/{cfg['epochs']}  loss {record['train_loss_mean']:.4f}  "
            f"val dice {val['val_mean_dice_3d']:.4f}{'  *best*' if is_best else ''}  "
            f"{record['wall_time_s']['epoch']:.1f}s")
        if _after_epoch_hook is not None:
            _after_epoch_hook(epoch)

    state["status"] = "TRAINED"
    MF.write_json_replace(state_path, state)
    eval_refs = {"metrics_summary": None, "per_case_metrics": None, "per_slice_metrics": None}
    evaluation_code_version = None
    if cfg["post_train_validation"]:
        I.predict_population(run_dir, "validation", checkpoint="best", device=device, precision=precision,
                             batch=cfg["val_batch"], dataset_manifest=dataset_manifest,
                             package_root=package_root, skip_if_complete=True, split_manifest=split_src,
                             allow_unfrozen_split=cfg["allow_unfrozen_split"], log=log)
        eval_dir = run_dir / MF.RUN_LAYOUT["evaluation"].format(partition="validation")
        if not eval_dir.exists():
            E.evaluate_run(run_dir, "validation", dataset_manifest=dataset_manifest,
                           package_root=package_root, split_manifest=split_src,
                           allow_unfrozen_split=cfg["allow_unfrozen_split"], log=log)
        em = MF.validate_evaluation_manifest(D.load_json(eval_dir / "evaluation_manifest.json"))
        eval_refs = {k: em["outputs"][k] for k in eval_refs}
        evaluation_code_version = em["evaluation_code_version"]
    return _write_run_manifest(cfg, run_dir, state, split, split_sha, subset_rel, population, model,
                               config_sha, versions, eval_refs, evaluation_code_version)


def _write_run_manifest(cfg, run_dir, state, split, split_sha, subset_rel, population, model, config_sha,
                        versions, eval_refs, evaluation_code_version) -> dict:
    spec = M.parse_variant(cfg["variant"])
    epochs = [json.loads(line) for line in (run_dir / MF.RUN_LAYOUT["train_log"]).read_text(
        encoding="utf-8").splitlines() if line.strip()]
    epoch_lines = [e for e in epochs if e.get("event") == "epoch"]
    peaks = [e["peak_memory"].get("bytes") for e in epoch_lines if e.get("peak_memory", {}).get("bytes")]
    best_rel = f"{MF.RUN_LAYOUT['checkpoints']}/best.pt"
    best_sha = D.sha256_file(run_dir / best_rel)
    if best_sha != state["best_sha256"]:
        raise RuntimeError("best.pt changed after it was recorded")
    manifest = {
        "format": MF.RUN_MANIFEST_FORMAT,
        "status": "COMPLETE",
        "experiment_id": cfg["experiment_id"],
        "model_family": spec["family"],
        "model_variant": cfg["variant"],
        "decoder": spec.get("decoder", "unet"),
        "backbone_mode": spec.get("mode", "n/a"),
        "training_fraction": MF.SUBSET_FRACTIONS[cfg["subset"]],
        "training_subset": cfg["subset"],
        "split_manifest": {"manifest_id": split["split_id"], "path": MF.RUN_LAYOUT["split_manifest_copy"],
                           "sha256": split_sha},
        "training_subset_manifest": {"manifest_id": f"{split['split_id']}:{cfg['subset']}", "path": subset_rel,
                                     "sha256": D.sha256_file(run_dir / subset_rel),
                                     "case_count": len(D.subset_case_ids(split, cfg["subset"]))},
        "seed": cfg["seed"],
        "preprocessing_version": D.PREPROCESSING_VERSION,
        "preprocessing": D.PREPROCESSING,
        "postprocessing_version": I.POSTPROCESSING_VERSION,
        "prediction_variant": I.PREDICTION_VARIANT,
        "evaluation_population_manifest": dict(
            population, purpose=("checkpoint selection and validation metrics; the locked final holdout "
                                 "is evaluated separately (evaluation/final_holdout)")),
        "evaluation_metric_version": E.EVALUATION_METRIC_VERSION,
        "training_code_version": versions[0] if len(versions) == 1 else "MIXED:" + ";".join(versions),
        "training_code_versions_used": versions,
        "training_code_module_version": TRAIN_CODE_VERSION,
        "checkpoint": {"checkpoint_id": f"{cfg['experiment_id']}/best@epoch{state['best_epoch']}",
                       "path": best_rel, "sha256": best_sha, "epoch": state["best_epoch"],
                       "selection": RECIPE["checkpoint_selection"]},
        "last_checkpoint": {"path": f"{MF.RUN_LAYOUT['checkpoints']}/last.pt", "sha256": state["last_sha256"],
                            "epoch": state["epochs_done"]},
        "evaluation_code_version": evaluation_code_version,
        "num_test_cases": population["case_count"],
        **eval_refs,
        "best_val_mean_dice_3d": state["best_val_mean_dice_3d"],
        "epochs": cfg["epochs"],
        "recipe": RECIPE,
        "recipe_values": {k: cfg[k] for k in ("img", "batch", "lr", "seed", "precision", "device")},
        "recipe_deviations_from_adr_ml_001": recipe_deviations(cfg, split_sha),
        "frozen_split": {"expected_sha256": D.FROZEN_SPLIT_SHA256, "actual_sha256": split_sha,
                         "is_frozen": split_sha == D.FROZEN_SPLIT_SHA256,
                         "allow_unfrozen_split": cfg["allow_unfrozen_split"]},
        "precision_evidence": state.get("first_step_evidence"),
        "model_card": M.model_card(model),
        "config": {"path": MF.RUN_LAYOUT["config"], "sha256": config_sha},
        "train_log": {"path": MF.RUN_LAYOUT["train_log"], "epoch_lines": len(epoch_lines)},
        "training": {"total_wall_time_s": round(sum(e["wall_time_s"]["epoch"] for e in epoch_lines), 3),
                     "peak_memory_max_bytes": max(peaks) if peaks else None,
                     "peak_memory_metric": epoch_lines[-1]["peak_memory"].get("metric") if epoch_lines else None},
        "environment": environment(cfg["device"]),
        "created_at": MF.now_iso(),
    }
    MF.write_json_new(run_dir / MF.RUN_LAYOUT["run_manifest"], MF.validate_run_manifest(manifest))
    state["status"] = "COMPLETE"
    MF.write_json_replace(run_dir / "run_state.json", state)
    return {"status": "COMPLETED", "run_dir": str(run_dir), "best_epoch": state["best_epoch"],
            "best_val_mean_dice_3d": state["best_val_mean_dice_3d"]}


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Train one experiment from a JSON config (resumable)")
    ap.add_argument("--config", required=True, type=Path)
    ap.add_argument("--epochs", type=int, default=None, help="replaces the config's epochs (recorded)")
    ap.add_argument("--batch", type=int, default=None, help="replaces the config's batch: 8, 4 or 2 (recorded)")
    args = ap.parse_args(argv)
    raw = apply_overrides(D.load_json(args.config), epochs=args.epochs, batch=args.batch)
    result = run_experiment(raw)
    print(json.dumps(result))
    return 0


def apply_overrides(raw: dict, *, epochs: int | None = None, batch: int | None = None) -> dict:
    """The config with --epochs / --batch applied. The result is what config.json records."""
    out = dict(raw)
    if epochs is not None:
        out["epochs"] = int(epochs)
    if batch is not None:
        out["batch"] = int(batch)
    return out


if __name__ == "__main__":
    raise SystemExit(main())
