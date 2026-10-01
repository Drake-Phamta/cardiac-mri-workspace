#!/usr/bin/env python3
"""
Spike C0 compute probe — peak memory, throughput, batch ceiling, output stride.

THROWAWAY SPIKE CODE under spikes/spike_c_ml/. Not production.

`SPIKE_C_ML/TASK.md` permits Claude to write this and keeps the readings with
the owner:

    "Claude may: build the harness, write the extrapolation script, propose
     candidate variants and decoders, structure the result template, and
     analyse measurements the owner supplies."
    "All hardware and timing measurements are executed by Be Quoc Khanh on the
     real compute."

So --operator is required and is written into every output. A number produced
on somebody else's machine answers a question about somebody else's machine.
C0-1 asks what compute EXISTS for this project; only its owner can answer that.

WHAT IT MEASURES                                              CRITERION
    available compute, read from the machine it runs on       C0-1
    peak memory for a UNet family and a DINOv2 family         C0-2
    largest fitting batch size, bracketed and bisected        C0-3
    forward and training-step throughput, steps/s + slices/s  C0-4
    effective output stride of each decoder                   C0-5
    per-variant cost: checkpoint, decoder, mode, precision    C0-6

THE DINOv2 FAMILY IS THE REAL CHECKPOINT (revision 3, 2026-09-14)
    The first two revisions measured a shape-equivalent nn.TransformerEncoder
    and called it a stand-in. The owner's review (PR #17, 2026-09-13) rejected
    that, correctly: C0-2 and C0-6 ask for the candidate DINOv2 variant, its
    exact checkpoint source and its measured cost, and a different
    implementation has different kernels, a different attention path and a CLS
    token the stand-in lacked. The backbone is now loaded from the Hugging Face
    checkpoint with `transformers.Dinov2Model`, and every trial records the
    repository, the resolved commit and the SHA-256 of the weights file.

    Candidates (proposed by Claude, as TASK.md permits; the choice is GATE-ML-01's):
        ViT-S/14  facebook/dinov2-small     ~22 M backbone parameters
        ViT-B/14  facebook/dinov2-base      ~86 M backbone parameters
    each with two decoders (linear, progressive) and two backbone modes
    (frozen, full fine-tuning) - `07` section 2 lists the fine-tuning mode as a
    field ADR-ML-001 must record, and it moves peak memory more than anything.

WHAT IT DOES NOT DO
    It does not close GATE-ML-01. DR-007 forbids that on C0 evidence alone, and
    C0-10 requires the statement to be explicit.

    It does not touch real data. C0 must not wait for Spike D. The input is
    synthetic, but at the dtype and in-plane sizes Spike D measured (A6).
"""

from __future__ import annotations

import argparse
import contextlib
import gc
import glob
import hashlib
import importlib.util
import json
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone

# Windows PowerShell may expose a legacy cp1252 stdout even when the operator's
# real name is Unicode. Evidence capture must not fail before a measurement just
# because the name contains Vietnamese characters.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(ROOT, "EVIDENCE_RAW")
DR011_PATH = os.path.join(ROOT, "dr011_normalization.json")
GENERATE_PATH = os.path.join(ROOT, "synthetic", "generate.py")

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
except ImportError:                                            # pragma: no cover
    raise SystemExit("This probe needs PyTorch and NumPy.\n"
                     "    pip install -r spikes/spike_c_ml/requirements.txt")

# The cohort, as Spike D measured it. Not a placeholder any more.
COHORT = {
    "dtype": "uint8",
    "shapes": [{"shape_xyz": [576, 576, 88], "cases": 69},
               {"shape_xyz": [640, 640, 88], "cases": 85}],
    "mask_values": [0, 255],
    "source": ("Spike D criterion A6, PR #25 by Be Quoc Khanh (merged 2026-09-15). "
               "QA-002 repair PR #34 keeps these measured dtype/shape counts unchanged; "
               "its physical-geometry and duplicate-acquisition corrections are separate."),
}

# Candidate DINOv2 checkpoints. The key is what variant names use.
DINO_CHECKPOINTS = {
    "s14": {"repo": "facebook/dinov2-small", "arch": "ViT-S/14"},
    "b14": {"repo": "facebook/dinov2-base", "arch": "ViT-B/14"},
}
DECODERS = ("linear", "progressive")
MODES = ("full", "frozen")


# --- candidate architectures -------------------------------------------------

class UNet2D(nn.Module):
    """Plain 2D UNet. Output stride 1: skip connections restore full resolution."""

    def __init__(self, in_ch: int = 1, base: int = 32, depth: int = 4):
        super().__init__()
        self.depth = depth
        self.downs = nn.ModuleList()
        self.ups = nn.ModuleList()
        ch = in_ch
        chans = []
        for d in range(depth):
            out = base * (2 ** d)
            self.downs.append(nn.Sequential(
                nn.Conv2d(ch, out, 3, padding=1), nn.BatchNorm2d(out), nn.ReLU(inplace=True),
                nn.Conv2d(out, out, 3, padding=1), nn.BatchNorm2d(out), nn.ReLU(inplace=True)))
            chans.append(out)
            ch = out
        self.bottleneck = nn.Sequential(
            nn.Conv2d(ch, ch * 2, 3, padding=1), nn.BatchNorm2d(ch * 2), nn.ReLU(inplace=True))
        ch = ch * 2
        for d in reversed(range(depth)):
            skip = chans[d]
            self.ups.append(nn.ModuleList([
                nn.ConvTranspose2d(ch, skip, 2, stride=2),
                nn.Sequential(
                    nn.Conv2d(skip * 2, skip, 3, padding=1), nn.BatchNorm2d(skip),
                    nn.ReLU(inplace=True))]))
            ch = skip
        self.head = nn.Conv2d(ch, 1, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x):
        skips = []
        for block in self.downs:
            x = block(x)
            skips.append(x)
            x = self.pool(x)
        x = self.bottleneck(x)
        for (up, conv), skip in zip(self.ups, reversed(skips)):
            x = up(x)
            x = conv(torch.cat([x, skip], dim=1))
        return self.head(x)

    @staticmethod
    def output_stride() -> float:
        return 1.0


def fetch_checkpoint(key: str, revision: str | None = None) -> dict:
    """Download (or reuse the cached) DINOv2 checkpoint and record its identity.

    The resolved commit is the snapshot directory name huggingface_hub returns,
    so a moving branch like `main` is pinned to the exact commit that ran.
    Set HF_HUB_OFFLINE=1 to use the cache only.
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:                                        # pragma: no cover
        raise SystemExit("The DINOv2 family needs transformers and huggingface_hub.\n"
                         "    pip install -r spikes/spike_c_ml/requirements.txt")
    repo = DINO_CHECKPOINTS[key]["repo"]
    path = snapshot_download(repo_id=repo, revision=revision,
                             allow_patterns=["*.json", "*.safetensors"])
    weights = sorted(glob.glob(os.path.join(path, "*.safetensors")))
    if not weights:
        path = snapshot_download(repo_id=repo, revision=revision,
                                 allow_patterns=["*.json", "pytorch_model.bin"])
        weights = sorted(glob.glob(os.path.join(path, "pytorch_model.bin")))
    if not weights:
        raise RuntimeError(f"No weights file found for {repo} at {path}")
    h = hashlib.sha256()
    with open(weights[0], "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    mean, std, mean_src = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225], "ImageNet constants (fallback)"
    pre = os.path.join(path, "preprocessor_config.json")
    if os.path.exists(pre):
        with open(pre, encoding="utf-8") as f:
            cfg = json.load(f)
        if "image_mean" in cfg and "image_std" in cfg:
            mean, std = cfg["image_mean"], cfg["image_std"]
            mean_src = "preprocessor_config.json of this checkpoint"
    return {
        "key": key, "repo": repo, "arch": DINO_CHECKPOINTS[key]["arch"],
        "revision_requested": revision or "main",
        "revision_resolved": os.path.basename(os.path.normpath(path)),
        "weights_file": os.path.basename(weights[0]),
        "weights_bytes": os.path.getsize(weights[0]),
        "weights_sha256": h.hexdigest(),
        "image_mean": mean, "image_std": std, "mean_std_source": mean_src,
        "_path": path,
    }


class DinoSeg(nn.Module):
    """Real DINOv2 backbone + a segmentation decoder.

    Input is one channel in [0, 1] - the output of the DR-011 per-volume
    normalization. The backbone was pretrained on 3-channel ImageNet-normalised
    images, so the channel is replicated and the checkpoint's own fixed
    mean/std are applied inside forward(). Those are pretrained-model
    constants, which DR-011 permits "where the backbone requires them"; they
    are not statistics of this cohort.

    Two decoders, because C0-5 asks for the EFFECTIVE output stride and the
    decoder is what sets it:
        'linear'       one projection per patch, then bilinear upsample -> stride 14
        'progressive'  three learned doublings (x8), remainder interpolated
                       -> effective stride 14/8 = 1.75, NOT 1. No power-of-two
                       stack lands on 14 = 2*7, so the last step interpolates
                       and carries no learned detail.

    Two backbone modes, because `07` section 2 makes the fine-tuning mode an
    ADR-ML-001 field and it dominates memory:
        'full'    every backbone weight trains (weights + grads + 2 AdamW moments)
        'frozen'  the backbone runs under no_grad; only the decoder trains
    """

    def __init__(self, ckpt: dict, img: int, decoder: str, mode: str):
        super().__init__()
        from transformers import Dinov2Model
        # transformers versions differ in whether loading consumes the global RNG.
        # Keep decoder initialization independent of that implementation detail.
        with torch.random.fork_rng(devices=[]):
            try:
                self.backbone = Dinov2Model.from_pretrained(
                    ckpt["_path"], local_files_only=True, attn_implementation="sdpa")
            except (ValueError, TypeError, ImportError):
                self.backbone = Dinov2Model.from_pretrained(ckpt["_path"], local_files_only=True)
        cfg = self.backbone.config
        self.attn_implementation = getattr(cfg, "_attn_implementation", "unknown")
        self.patch = int(cfg.patch_size)
        if img % self.patch:
            raise ValueError(f"image size {img} is not a multiple of the patch size {self.patch}")
        self.img, self.grid = img, img // self.patch
        self.decoder_kind, self.mode = decoder, mode
        dim = int(cfg.hidden_size)
        self.register_buffer("mean", torch.tensor(ckpt["image_mean"]).view(1, 3, 1, 1),
                             persistent=False)
        self.register_buffer("std", torch.tensor(ckpt["image_std"]).view(1, 3, 1, 1),
                             persistent=False)
        if mode == "frozen":
            for p in self.backbone.parameters():
                p.requires_grad_(False)
        if decoder == "linear":
            self.head = nn.Linear(dim, 1)
        else:
            chans = [dim, 128, 64, 32]
            ups = []
            for i in range(3):
                ups += [nn.ConvTranspose2d(chans[i], chans[i + 1], 2, stride=2),
                        nn.BatchNorm2d(chans[i + 1]), nn.ReLU(inplace=True)]
            self.up = nn.Sequential(*ups)
            self.head = nn.Conv2d(32, 1, 1)

    def forward(self, x):
        b = x.shape[0]
        x = (x.expand(-1, 3, -1, -1) - self.mean) / self.std
        if self.mode == "frozen":
            with torch.no_grad():
                h = self.backbone(pixel_values=x).last_hidden_state
        else:
            h = self.backbone(pixel_values=x).last_hidden_state
        # Drop the CLS (and any register) tokens: keep the last grid*grid patch tokens.
        t = h[:, -self.grid * self.grid:, :]
        if self.decoder_kind == "linear":
            logits = self.head(t).transpose(1, 2).reshape(b, 1, self.grid, self.grid)
            return F.interpolate(logits, scale_factor=self.patch, mode="bilinear",
                                 align_corners=False)
        f = t.transpose(1, 2).reshape(b, -1, self.grid, self.grid)
        out = self.head(self.up(f))
        if out.shape[-2:] != (self.img, self.img):
            out = F.interpolate(out, size=(self.img, self.img), mode="bilinear",
                                align_corners=False)
        return out

    def output_stride(self) -> float:
        # 'linear' predicts one logit per 14x14 patch; upsampling afterwards adds
        # no information, so the EFFECTIVE stride stays 14.
        return float(self.patch) if self.decoder_kind == "linear" else self.patch / 8.0


def _count(model) -> tuple[int, int]:
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total, trainable


# --- compute description (C0-1) -----------------------------------------------

def _nvidia_driver() -> str:
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                             capture_output=True, text=True, timeout=20)
        v = out.stdout.strip().splitlines()
        if out.returncode == 0 and v:
            return v[0].strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return "NOT MEASURED - nvidia-smi unavailable"


def _version(mod: str) -> str:
    try:
        return __import__(mod).__version__
    except Exception:                                          # noqa: BLE001
        return "not installed"


def describe_compute() -> dict:
    """C0-1. Read from the machine this runs on. Nothing here is inferred."""
    info = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "processor": platform.processor() or "NOT MEASURED - platform reports nothing",
        "cpu_logical_cores": os.cpu_count(),
        "torch": torch.__version__,
        "numpy": np.__version__,
        "transformers": _version("transformers"),
        "huggingface_hub": _version("huggingface_hub"),
        "cuda_available": torch.cuda.is_available(),
        "mps_available": bool(getattr(torch.backends, "mps", None)
                              and torch.backends.mps.is_available()),
    }
    try:
        import psutil
        info["host_ram_bytes"] = int(psutil.virtual_memory().total)
        info["host_ram_gb"] = round(info["host_ram_bytes"] / 1024 ** 3, 2)
    except ImportError:
        info["host_ram_gb"] = "NOT MEASURED - psutil not installed"
    if torch.cuda.is_available():
        idx = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(idx)
        info.update({
            "device_kind": "cuda",
            "gpu_name": props.name,
            "vram_total_bytes": props.total_memory,
            "vram_total_gb": round(props.total_memory / 1024 ** 3, 2),
            "nvidia_driver": _nvidia_driver(),
            "cuda_runtime_in_torch_build": torch.version.cuda,
            "cudnn": torch.backends.cudnn.version(),
            "capability": f"{props.major}.{props.minor}",
            "bf16_supported": bool(torch.cuda.is_bf16_supported()),
        })
    elif info["mps_available"]:
        info.update({"device_kind": "mps", "gpu_name": "Apple Silicon (MPS)",
                     "vram_total_bytes": None,
                     "vram_total_gb": "NOT MEASURED - MPS reports no total"})
    else:
        info.update({
            "device_kind": "cpu",
            "gpu_name": "NONE - CPU only",
            "vram_total_gb": None,
            "c0_1_note": ("This machine exposes no GPU to PyTorch. That is a valid and "
                          "important C0-1 answer, not a failure: TASK.md asks for the GPU "
                          "model and VRAM 'or an explicit statement that only CPU/Colab-class "
                          "resources exist'."),
        })
    return info


# --- measurement ---------------------------------------------------------------

def _rss() -> int | None:
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss
    except ImportError:
        return None


class PeakTracker:
    """Peak memory for the measured section only.

    On CUDA this is torch.cuda.max_memory_allocated, a true peak. On CPU it is
    an RSS delta above a baseline taken at the start of the section, sampled
    during the run - labelled rss_delta and never called "peak", because the
    allocator does not hand memory back promptly.
    """

    def __init__(self, device: str):
        self.device = device
        self.baseline = None
        self.max_rss = 0

    def start(self):
        if self.device == "cuda":
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.empty_cache()
        else:
            self.baseline = _rss()
            self.max_rss = self.baseline or 0

    def sample(self):
        if self.device != "cuda":
            r = _rss()
            if r and r > self.max_rss:
                self.max_rss = r

    def result(self) -> dict:
        if self.device == "cuda":
            return {"metric": "torch.cuda.max_memory_allocated",
                    "bytes": int(torch.cuda.max_memory_allocated()),
                    "is_true_peak": True}
        if self.baseline is None:
            return {"metric": "unavailable", "bytes": None, "is_true_peak": False,
                    "note": "psutil not installed; install it or read this as NOT MEASURED"}
        return {"metric": "process RSS delta above a baseline, sampled during the run",
                "bytes": int(self.max_rss - self.baseline),
                "baseline_bytes": int(self.baseline),
                "is_true_peak": False,
                "note": "NOT a true peak. Do not compare it across processes."}


def reset_peak(device: str) -> None:
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.empty_cache()


def sync(device: str) -> None:
    if device == "cuda":
        torch.cuda.synchronize()


def autocast_for(device: str, precision: str):
    """fp32 runs plain; fp16/bf16 use CUDA autocast. Recorded per trial."""
    if precision == "fp32":
        return contextlib.nullcontext()
    return torch.autocast(device_type="cuda",
                          dtype=torch.float16 if precision == "fp16" else torch.bfloat16)


def make_optimizer(model):
    params = [p for p in model.parameters() if p.requires_grad]
    return torch.optim.AdamW(params, lr=1e-4)


def make_scaler(precision: str):
    # fp16 needs loss scaling to train; bf16 and fp32 do not.
    return torch.amp.GradScaler("cuda") if precision == "fp16" else None


def train_step(model, opt, scaler, x, y, loss_fn, device, precision):
    opt.zero_grad(set_to_none=True)
    with autocast_for(device, precision):
        out = model(x)
    loss = loss_fn(out.float(), y)
    if scaler is not None:
        scaler.scale(loss).backward()
        scaler.step(opt)
        scaler.update()
    else:
        loss.backward()
        opt.step()


def time_steps(model, x, y, device: str, steps: int, train: bool, precision: str) -> dict:
    loss_fn = nn.BCEWithLogitsLoss()
    opt = make_optimizer(model) if train else None
    scaler = make_scaler(precision) if train else None
    model.train(train)

    def one():
        if train:
            train_step(model, opt, scaler, x, y, loss_fn, device, precision)
        else:
            with torch.no_grad(), autocast_for(device, precision):
                model(x)

    # Warm up. The first steps pay for kernel selection and allocator growth.
    for _ in range(2):
        one()
    sync(device)
    tracker = PeakTracker(device)
    tracker.start()

    times = []
    for _ in range(steps):
        t0 = time.perf_counter()
        one()
        sync(device)
        times.append((time.perf_counter() - t0) * 1000.0)
        tracker.sample()

    times.sort()
    # Nearest-rank p50, the same definition the Spike E aggregator uses.
    k = max(1, -(-50 * len(times) // 100))
    ms_med = times[k - 1]
    batch = x.shape[0]
    del opt, scaler
    return {
        "steps": steps,
        "warmup_steps": 2,
        "ms_min": round(times[0], 2),
        "ms_median": round(ms_med, 2),
        "median_definition": "nearest-rank p50, no interpolation",
        "ms_max": round(times[-1], 2),
        "steps_per_s": round(1000.0 / ms_med, 3) if ms_med else None,
        "slices_per_s": round(batch * 1000.0 / ms_med, 3) if ms_med else None,
        "throughput_method": (f"median wall time of {steps} timed steps after 2 warm-up steps, "
                              f"device synchronised after every step; slices/s = batch {batch} "
                              f"x steps/s. Data loading is NOT included."),
        "memory": tracker.result(),
    }


# --- C0-3: batch search ----------------------------------------------------------

def search_batch(fits, start: int, cap: int) -> dict:
    """Largest batch b in [1, cap] with fits(b) True, assuming fitting is monotone.

    fits(b) -> (bool, dict). The review of revision 2 (PR #17, point 2) found the
    old search only doubled and stopped at the first failure - 8 fits and 16
    fails left 9-15 untried - and never tried batch 1 when the starting batch
    failed. Now:
        1. try `start`
        2. if it fits, keep doubling until something fails or `cap` is reached
           (bracket [last fit, first failure])
        3. if it does not fit, try 1; if 1 fits the bracket is [1, start]
        4. bisect the bracket to the exact boundary
    """
    tried = []

    def t(b):
        ok, rec = fits(b)
        tried.append(dict(rec, batch=b, fitted=bool(ok)))
        return bool(ok)

    cap = max(1, cap)
    start = max(1, min(start, cap))
    lo, hi, cap_reached = 0, None, False
    if t(start):
        lo = start
        while hi is None:
            if lo >= cap:
                cap_reached = True
                break
            nb = min(lo * 2, cap)
            if t(nb):
                lo = nb
            else:
                hi = nb
    elif start > 1 and t(1):
        lo, hi = 1, start
    else:
        hi = 1 if start == 1 else start
    while hi is not None and lo >= 1 and hi - lo > 1:
        mid = (lo + hi) // 2
        if t(mid):
            lo = mid
        else:
            hi = mid
    first_fail = next((r for r in tried if r["batch"] == hi), None) if hi else None
    return {
        "largest_fitting_batch": lo,
        "first_failing_batch": hi,
        "cap": cap,
        "cap_reached": cap_reached,
        "attempts": tried,
        "method": ("try the intended batch; if it fits, double to bracket the boundary, "
                   "otherwise try batch 1; then bisect the bracket to the exact boundary"),
        "assumption": "fitting is monotone in batch size",
        "stopped_because": (first_fail.get("reason") if first_fail else
                            (f"search capped at {cap}; the true ceiling may be higher"
                             if cap_reached else None)),
    }


def _fit_trial(build, b: int, img: int, device: str, precision: str,
               vram_bytes: int | None) -> tuple[bool, dict]:
    """One full training step (forward, backward, AdamW step) at batch b.

    Cleans up in `finally`, so a failed attempt cannot leave its model, input or
    optimizer state resident and make the next attempt fail for the wrong reason
    (PR #17 review, point 2).
    """
    model = opt = scaler = x = y = None
    try:
        reset_peak(device)
        model = build().to(device)
        opt = make_optimizer(model)
        scaler = make_scaler(precision)
        # Values do not affect memory or step time; [0, 1] matches the DR-011 output.
        x = torch.rand(b, 1, img, img, device=device)
        y = (torch.rand(b, 1, img, img, device=device) > 0.8).float()
        train_step(model, opt, scaler, x, y, nn.BCEWithLogitsLoss(), device, precision)
        sync(device)
        peak = int(torch.cuda.max_memory_allocated()) if device == "cuda" else None
        # On Windows the NVIDIA driver can spill past VRAM into system memory
        # instead of raising OOM. A step that only ran because it spilled is a
        # performance cliff, not a fit.
        spilled = bool(vram_bytes and peak and peak > vram_bytes)
        rec = {"ran_without_error": True, "peak_memory_bytes": peak, "exceeded_vram": spilled}
        if spilled:
            rec["reason"] = (f"batch {b} allocated {peak / 1024 ** 3:.2f} GB against "
                             f"{vram_bytes / 1024 ** 3:.2f} GB of VRAM - spilled to system "
                             f"memory, counted as NOT fitting")
        return (not spilled), rec
    except (RuntimeError, MemoryError, OSError) as exc:
        # torch.cuda.OutOfMemoryError is a RuntimeError; OSError covers a weights load that fails on
        # memory, e.g. Windows "WinError 1455: the paging file is too small" (PR #17 re-review)
        return False, {"ran_without_error": False,
                       "error": f"{type(exc).__name__}: {str(exc)[:160]}",
                       "reason": f"batch {b} raised {type(exc).__name__}"}
    finally:
        model = opt = scaler = x = y = None
        _cleanup(device)


def largest_fitting_batch(fits, device: str, start: int, cap: int,
                          precision: str, vram_bytes: int | None) -> dict:
    """C0-3 search. `fits(b) -> (bool, record)` runs one training step at batch b - in this
    process, or in a worker process when the probe isolates CUDA work (the default on CUDA)."""
    res = search_batch(fits, start=start, cap=cap)
    notes = []
    if vram_bytes is None and device == "cuda":
        notes.append("VRAM total unknown, so a silent spill could not be detected.")
    if device != "cuda":
        notes.append("Not a CUDA device: there is no VRAM limit to test against, so a batch is "
                     "counted as fitting whenever it does not raise. Treat with suspicion.")
    res.update({"precision": precision, "vram_total_bytes": vram_bytes,
                "note": " ".join(notes) or None})
    return res


def selftest() -> int:
    """Check search_batch against known boundaries, without a GPU."""
    cases = [  # (true ceiling, start, cap, expected, expect cap_reached)
        (11, 2, 64, 11, False),     # doubling 2,4,8,16 then bisect 8..16
        (11, 16, 64, 11, False),    # start fails -> 1 fits -> bisect 1..16
        (0, 4, 64, 0, False),       # nothing fits, not even 1
        (1, 4, 64, 1, False),       # only batch 1 fits
        (100, 2, 64, 64, True),     # capped
        (8, 8, 64, 8, False),       # power-of-two boundary
        (5, 1, 64, 5, False),       # start at 1
        (63, 3, 64, 63, False),     # boundary just below the cap
    ]
    bad = 0
    for ceiling, start, cap, want, want_cap in cases:
        r = search_batch(lambda b: (b <= ceiling, {}), start=start, cap=cap)
        got = r["largest_fitting_batch"]
        tries = [a["batch"] for a in r["attempts"]]
        ok = got == want and r["cap_reached"] == want_cap and len(tries) == len(set(tries))
        bad += not ok
        print(f"  {'ok  ' if ok else 'FAIL'} ceiling={ceiling:<3} start={start:<2} cap={cap} "
              f"-> {got:<3} (want {want}) tries={tries}")
    print(f"\n  search_batch selftest: {len(cases) - bad}/{len(cases)} passed\n")
    runner_bad = _selftest_runner()
    return 1 if (bad or runner_bad) else 0


# --- input: uint8 at the cohort's in-plane sizes, DR-011, explicit resize --------

def load_dr011() -> dict:
    with open(DR011_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    impl = cfg["implementation"]
    return {"p_low": float(impl["p_low"]), "p_high": float(impl["p_high"])}


def dr011_normalize(vol: np.ndarray, p_low: float, p_high: float) -> np.ndarray:
    """Per-volume: clip to this volume's [p_low, p_high] percentiles, scale to [0, 1]."""
    lo, hi = (np.float32(q) for q in np.percentile(vol, [p_low, p_high]))
    v = vol.astype(np.float32)
    if hi <= lo:
        return np.zeros_like(v)
    # float32 throughout: np.percentile returns float64, and a float64 input
    # makes the UNet's float32 convolutions refuse it.
    return ((np.clip(v, lo, hi) - lo) / (hi - lo)).astype(np.float32)


def _load_generate():
    spec = importlib.util.spec_from_file_location("c0_generate", GENERATE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


RESIZE_POLICY = {
    "mri": "bilinear, antialias=True, align_corners=False, to --img x --img",
    "mask": "nearest-exact, to --img x --img, then foreground = value > 0",
    "why": ("The DINOv2 family needs a multiple of the 14-pixel patch and the UNet a multiple of "
            "16; neither 576 nor 640 is a multiple of 14. Resizing both cohort sizes to one "
            "--img keeps one model input shape for the whole cohort. It is a CONFIGURATION "
            "choice for C0 - the alternative, padding to a multiple of 14, is equally valid "
            "and C1 decides."),
}


def build_input(args, device, dr011) -> tuple:
    """(x, y, meta). x: [B,1,img,img] float in [0,1]; y: [B,1,img,img] {0,1}."""
    if args.input_from:
        files = sorted(glob.glob(os.path.join(args.input_from, "*_volume_uint8.npy")))
        if not files:
            old = glob.glob(os.path.join(args.input_from, "*_volume_int16.npy"))
            hint = (" Only old int16 files are there - regenerate them; the cohort is uint8."
                    if old else "")
            raise SystemExit(f"No *_volume_uint8.npy under {args.input_from}.{hint}\n"
                             f"Run: python spikes/spike_c_ml/synthetic/generate.py")
        vol = np.load(files[0])
        mpath = files[0].replace("_volume_uint8.npy", "_mask_uint8.npy")
        mask = np.load(mpath) if os.path.exists(mpath) else None
        source = os.path.basename(files[0])
    else:
        gen = _load_generate()
        shape = (args.source_size, args.source_size, 88)
        vol = gen.make_volume(shape)
        mask = gen.make_mask(shape)
        source = f"in-memory synthetic/generate.py volume {list(shape)}, seed {gen.SEED}"
    if vol.dtype != np.uint8:
        raise SystemExit(f"Source volume is {vol.dtype}; the cohort is uint8 (Spike D A6).")
    nx, ny, nz = vol.shape
    norm = dr011_normalize(vol, dr011["p_low"], dr011["p_high"])     # whole volume
    idx = [k % nz for k in range(args.batch)]
    xs = np.stack([norm[:, :, k].T for k in idx])[:, None]
    x = torch.from_numpy(np.ascontiguousarray(xs, dtype=np.float32)).to(device)
    x = F.interpolate(x, size=(args.img, args.img), mode="bilinear",
                      align_corners=False, antialias=True).clamp_(0, 1)
    if mask is not None:
        ms = np.stack([mask[:, :, k].T for k in idx])[:, None].astype(np.float32)
        y = F.interpolate(torch.from_numpy(np.ascontiguousarray(ms)).to(device),
                          size=(args.img, args.img), mode="nearest-exact")
        y = (y > 0).float()
    else:
        y = (torch.rand(args.batch, 1, args.img, args.img, device=device) > 0.8).float()
    meta = {
        "model_input_shape": [args.batch, 1, args.img, args.img],
        "source": source,
        "source_dtype": str(vol.dtype),
        "source_shape_xyz": [nx, ny, nz],
        "cohort_reference": COHORT,
        "resize_policy": RESIZE_POLICY,
        "normalization": {
            "policy": "DR-011 per-volume percentile clip then scale to [0, 1]",
            "config_file": "dr011_normalization.json", **dr011,
            "applied_to": "the whole source volume before slicing",
            "dinov2_extra": ("1 channel replicated to 3, then the checkpoint's fixed "
                             "image_mean/image_std - pretrained-model constants, not cohort "
                             "statistics (recorded per checkpoint)"),
        },
        "labels": ("synthetic mask, resized nearest, foreground = value > 0" if mask is not None
                   else "random - no mask file next to the volume"),
    }
    return x, y, meta


# --- variants ----------------------------------------------------------------------

def variant_names(backbones: list[str]) -> list[str]:
    names = ["unet_base32_depth4", "unet_base16_depth4"]
    for bb in backbones:
        for mode in MODES:
            for dec in DECODERS:
                names.append(f"dinov2_{bb}_{mode}_{dec}")
    return names


def parse_variant(name: str) -> dict:
    if name.startswith("unet_base"):
        base = int(name.split("_")[1].replace("base", ""))
        depth = int(name.split("_")[2].replace("depth", ""))
        return {"family": "unet", "base": base, "depth": depth}
    parts = name.split("_")
    if len(parts) != 4 or parts[0] != "dinov2" or parts[1] not in DINO_CHECKPOINTS \
            or parts[2] not in MODES or parts[3] not in DECODERS:
        raise SystemExit(f"Unknown variant {name!r}. Form: unet_base32_depth4 or "
                         f"dinov2_<{'|'.join(DINO_CHECKPOINTS)}>_<{'|'.join(MODES)}>_"
                         f"<{'|'.join(DECODERS)}>")
    return {"family": "dinov2", "backbone": parts[1], "mode": parts[2], "decoder": parts[3]}


# --- main ----------------------------------------------------------------------------

VARIANT_ERRORS = (RuntimeError, ValueError, MemoryError, OSError)
WORKER_TAG = "C0_WORKER_RESULT "


class WorkerError(RuntimeError):
    """A worker process reported a failure; its message already names the original error."""


def _err(exc: BaseException) -> str:
    return str(exc)[:400] if isinstance(exc, WorkerError) else f"{type(exc).__name__}: {str(exc)[:400]}"


def _cleanup(device: str) -> str | None:
    """Best-effort. Freeing memory after an OOM can itself raise: on a 4 GB card
    torch.cuda.empty_cache() raised 'CUDA error: out of memory' right after a failed
    trial, and an unguarded cleanup ended the probe with no JSON written. Cleanup
    reports its error instead of raising it."""
    try:
        gc.collect()
        reset_peak(device)
        return None
    except Exception as exc:  # noqa: BLE001 - cleanup must never end the probe
        first = str(exc).strip().splitlines()[0][:200] if str(exc).strip() else ""
        return f"{type(exc).__name__}: {first}"


def cuda_usable(device: str) -> bool:
    """After a CUDA error the context can be left unusable for the rest of the process."""
    if device != "cuda":
        return True
    try:
        t = torch.zeros(1, device="cuda")
        float(t.sum().item())
        torch.cuda.synchronize()
        del t
        return True
    except Exception:  # noqa: BLE001
        return False


def measure_variant(build, p, x, y, device, steps, precision, checkpoint=None) -> dict:
    """Build one candidate and time forward + training steps at batch x.shape[0]. Raises on failure."""
    model = None
    try:
        model = build().to(device)
        stride = float(model.output_stride())
        total, trainable = _count(model)
        fwd = time_steps(model, x, y, device, steps, train=False, precision=precision)
        trn = time_steps(model, x, y, device, steps, train=True, precision=precision)
        out = {
            "batch": int(x.shape[0]),
            "effective_output_stride": stride,
            "stride_source": "model.output_stride(), not a hardcoded table",
            "parameters_total": total,
            "parameters_trainable": trainable,
            "forward": fwd,
            "train_step": trn,
            "train_memory": trn["memory"],
            "peak_memory_bytes_train": trn["memory"]["bytes"],
        }
        if p["family"] == "dinov2":
            out.update({
                "backbone": checkpoint["arch"],
                "checkpoint": {k: v for k, v in checkpoint.items() if not k.startswith("_")},
                "backbone_mode": p["mode"],
                "decoder": p["decoder"],
                "attn_implementation": getattr(model, "attn_implementation", "unknown"),
            })
        else:
            out.update({"backbone": "none (trained from scratch)", "decoder": "UNet",
                        "backbone_mode": "n/a"})
        return out
    finally:
        model = None
        _cleanup(device)


def _spill_reason(measured: dict, vram_bytes: int | None) -> str | None:
    """The same rule the batch search applies in _fit_trial, applied to a measurement."""
    peak = measured.get("peak_memory_bytes_train")
    if vram_bytes and peak and peak > vram_bytes:
        return (f"VRAMSpill: batch {measured.get('batch')} allocated {peak / 1024 ** 3:.2f} GB against "
                f"{vram_bytes / 1024 ** 3:.2f} GB of VRAM - it ran only by spilling to system memory, "
                f"so its timing is not this variant's cost")
    return None


def run_variant(name, p, *, measure, fits, intended_batch, find_batch, batch_cap, device,
                precision, vram_bytes, img, context_check=lambda: True, cleanup=lambda: None) -> dict:
    """One candidate end to end. Never aborts the probe.

    Revision 4 fixes the two runtime blockers of the owner's re-review on his RTX 4050
    (PR #17, 2026-09-15):

    1. The batch search used to sit in the same `try` as the intended-batch measurement, so it
       was skipped exactly when C0-3 needs it. Now the intended measurement, the search and a
       re-measurement at the discovered batch are separate steps, and the record keeps the
       failed intended trial AND the search result.
    2. An OSError while building or loading a candidate (WinError 1455 while loading DINOv2)
       ended the process before any JSON was written. It is recorded against that candidate.

    `measure(b)` and `fits(b)` run in worker processes by default on CUDA (see isolated_strategies):
    on Windows a real driver OOM can leave the CUDA context unusable for the whole process, and a
    search that shares that process can then never find a fit.
    """
    entry = {"variant": name, "family": p["family"], "input_size": img,
             "intended_batch": intended_batch, "precision": precision}
    intended_error = None
    try:
        measured = measure(intended_batch)
        spill = _spill_reason(measured, vram_bytes)
        if spill:
            # It ran, but only because the driver spilled past VRAM into system memory. The
            # timing is a performance cliff, not this variant's cost: keep it on the record,
            # treat the intended batch as not fitting, and measure at the discovered batch.
            intended_error = spill
            entry["intended_batch_error"] = intended_error
            entry["intended_batch_spilled_measurement"] = {
                k: measured.get(k) for k in ("batch", "forward", "train_step", "peak_memory_bytes_train")}
        else:
            entry.update(measured)
    except VARIANT_ERRORS as exc:
        intended_error = _err(exc)
        entry["intended_batch_error"] = intended_error
        if not context_check():
            entry["cuda_context_lost"] = True
            entry["error"] = intended_error
            entry["note"] = ("the CUDA context became unusable after this error in this process, so no "
                             "batch search or re-measurement was possible. Run without --no-isolate, or "
                             f"run this variant alone (--variants {name}) with a smaller --batch")
            return entry

    if find_batch:
        try:
            entry["batch_search"] = largest_fitting_batch(
                fits, device, start=max(1, intended_batch), cap=batch_cap,
                precision=precision, vram_bytes=vram_bytes)
        except VARIANT_ERRORS as exc:
            entry["batch_search"] = {"largest_fitting_batch": None, "error": _err(exc)}
        cleanup_error = cleanup()
        if cleanup_error:
            entry["cleanup_error_after_search"] = cleanup_error
        if not context_check():
            entry["cuda_context_lost"] = True

    if intended_error:
        found = (entry.get("batch_search") or {}).get("largest_fitting_batch")
        if found and 1 <= found < intended_batch and not entry.get("cuda_context_lost"):
            try:
                measured = measure(found)
                entry.update(measured)
                entry["measured_at"] = (f"discovered batch {found}; the intended batch {intended_batch} "
                                        f"did not fit ({intended_error.split(':')[0]})")
                spill = _spill_reason(measured, vram_bytes)
                if spill:
                    entry["discovered_batch_spill_warning"] = spill
            except VARIANT_ERRORS as exc:
                entry["discovered_batch_error"] = _err(exc)
        if "train_step" not in entry:
            entry["error"] = intended_error
            entry["note"] = ("did not run at the intended batch"
                             + (" and no smaller batch fitted" if find_batch
                                else "; re-run with --find-batch to search for a batch that fits"))
    return entry


# --- worker processes ----------------------------------------------------------------

def _worker_run(spec: dict) -> dict:
    torch.manual_seed(2024)
    kind = spec["kind"]
    if kind == "describe":
        return {"ok": True, "compute": describe_compute()}
    if kind == "selftest-raise":
        raise OSError("[WinError 1455] The paging file is too small (simulated in a worker)")
    device, name = spec["device"], spec["variant"]
    p = parse_variant(name)
    ckpt = None
    if p["family"] == "dinov2":
        # pinned to the exact commit the parent resolved; HF_HUB_OFFLINE keeps it from the network
        ckpt = fetch_checkpoint(p["backbone"], spec.get("revision"))
        build = lambda: DinoSeg(ckpt, img=spec["img"], decoder=p["decoder"], mode=p["mode"])  # noqa: E731
    else:
        build = lambda: UNet2D(base=p["base"], depth=p["depth"])  # noqa: E731
    if kind == "trial":
        ok, rec = _fit_trial(build, spec["batch"], spec["img"], device, spec["precision"],
                             spec.get("vram_bytes"))
        return {"ok": True, "fitted": bool(ok), "record": rec}
    if kind == "measure":
        ns = argparse.Namespace(input_from=spec.get("input_from"), source_size=spec["source_size"],
                                batch=spec["batch"], img=spec["img"])
        x, y, _ = build_input(ns, device, load_dr011())
        entry = measure_variant(build, p, x, y, device, spec["steps"], spec["precision"], ckpt)
        return {"ok": True, "entry": entry}
    raise ValueError(f"unknown worker kind {kind!r}")


def _worker_main(spec_json: str) -> int:
    try:
        result = _worker_run(json.loads(spec_json))
    except BaseException as exc:  # noqa: BLE001 - a worker reports; it never tracebacks
        result = {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:400]}"}
    sys.stdout.write(WORKER_TAG + json.dumps(result, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    return 0


def _spawn_worker(spec: dict, timeout_s: int) -> dict:
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env["HF_HUB_OFFLINE"] = "1"
    try:
        out = subprocess.run([sys.executable, os.path.abspath(__file__), "--_worker", json.dumps(spec)],
                             capture_output=True, text=True, encoding="utf-8", errors="replace",
                             timeout=timeout_s, env=env)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"TimeoutExpired: worker exceeded {timeout_s} s"}
    tagged = [ln for ln in out.stdout.splitlines() if ln.startswith(WORKER_TAG)]
    if tagged:
        return json.loads(tagged[-1][len(WORKER_TAG):])
    tail = [ln for ln in (out.stderr or "").strip().splitlines() if ln.strip()][-1:]
    return {"ok": False,
            "error": f"WorkerCrashed: exit {out.returncode}; {tail[0][:300] if tail else 'no output'}"}


def isolated_strategies(name, p, checkpoint, *, device, img, steps, precision, source_size,
                        input_from, vram_bytes, timeout_s):
    """measure(b) and fits(b) that each run in a fresh worker process."""
    spec = {"device": device, "variant": name, "img": img, "steps": steps, "precision": precision,
            "source_size": source_size, "input_from": input_from, "vram_bytes": vram_bytes,
            "revision": checkpoint["revision_resolved"] if checkpoint else None}

    def measure(b):
        r = _spawn_worker(dict(spec, kind="measure", batch=b), timeout_s)
        if not r.get("ok"):
            raise WorkerError(r.get("error", "worker failed"))
        return r["entry"]

    def fits(b):
        r = _spawn_worker(dict(spec, kind="trial", batch=b), timeout_s)
        if not r.get("ok"):
            err = r.get("error", "worker failed")
            return False, {"ran_without_error": False, "error": err[:300],
                           "reason": f"batch {b}: worker failed - {err[:120]}"}
        return r["fitted"], r["record"]

    return measure, fits


class _SelftestNet(nn.Module):
    """CPU stand-in that raises a simulated OOM above a batch size. Selftest only."""

    def __init__(self, max_batch: int):
        super().__init__()
        self.max_batch = max_batch
        self.conv = nn.Conv2d(1, 1, 3, padding=1)

    def forward(self, x):
        if x.shape[0] > self.max_batch:
            raise RuntimeError(f"CUDA out of memory (simulated above batch {self.max_batch})")
        return self.conv(x)

    @staticmethod
    def output_stride() -> float:
        return 1.0


def _selftest_runner() -> int:
    """The runtime paths of the PR #17 re-review, on CPU: in-process fakes, then real workers."""
    img = 16
    x = torch.rand(8, 1, img, img)
    y = (torch.rand(8, 1, img, img) > 0.5).float()
    p = {"family": "unet"}

    def strategies(build):
        return dict(measure=lambda b: measure_variant(build, p, x[:b], y[:b], "cpu", 1, "fp32"),
                    fits=lambda b: _fit_trial(build, b, img, "cpu", "fp32", None))

    common = dict(intended_batch=8, batch_cap=16, device="cpu", precision="fp32", vram_bytes=None,
                  img=img)

    def oserror_build():
        raise OSError("[WinError 1455] The paging file is too small (simulated)")

    checks = []
    e = run_variant("intended_fails_search_finds_3", p, find_batch=True,
                    **strategies(lambda: _SelftestNet(3)), **common)
    checks.append(("intended batch 8 fails -> search still runs -> measured at 3",
                   e.get("batch_search", {}).get("largest_fitting_batch") == 3
                   and e.get("batch") == 3 and "train_step" in e
                   and "intended_batch_error" in e and "error" not in e))
    e = run_variant("oserror_on_load", p, find_batch=True, **strategies(oserror_build), **common)
    checks.append(("OSError while building -> recorded, probe continues",
                   "OSError" in e.get("error", "")
                   and e.get("batch_search", {}).get("largest_fitting_batch") == 0))
    e = run_variant("intended_fails_no_search", p, find_batch=False,
                    **strategies(lambda: _SelftestNet(3)), **common)
    checks.append(("no --find-batch -> failure recorded with a hint",
                   "error" in e and "--find-batch" in e.get("note", "") and "batch_search" not in e))
    e = run_variant("fits", p, find_batch=False, **strategies(lambda: _SelftestNet(64)), **common)
    checks.append(("intended batch fits -> measured at 8, no error",
                   e.get("batch") == 8 and "train_step" in e and "error" not in e))

    global reset_peak
    real_reset = reset_peak

    def raising_reset(_device):
        raise RuntimeError("CUDA error: out of memory (simulated inside empty_cache)")

    reset_peak = raising_reset
    try:
        reported = _cleanup("cpu")
    except Exception:  # noqa: BLE001
        reported = None
    finally:
        reset_peak = real_reset
    checks.append(("a cleanup that raises is reported, never raised",
                   bool(reported) and "CUDA error" in reported))
    e = run_variant("cleanup_error_recorded", p, find_batch=True,
                    cleanup=lambda: "RuntimeError: CUDA error (simulated)",
                    **strategies(lambda: _SelftestNet(3)), **common)
    checks.append(("a cleanup error after the search is recorded; the run completes",
                   bool(e.get("cleanup_error_after_search")) and e.get("batch") == 3 and "train_step" in e))

    def fake_measure(b):  # peak grows with batch; VRAM below is 3.5 kB so batch > 3 spills
        return {"batch": b, "forward": {"ms_median": 1.0}, "train_step": {"ms_median": 10.0 * b},
                "peak_memory_bytes_train": 1000 * b}

    e = run_variant("intended_spills", p, measure=fake_measure,
                    fits=lambda b: (b * 1000 <= 3500, {"peak_memory_bytes": b * 1000}),
                    intended_batch=8, find_batch=True, batch_cap=16, device="cuda", precision="fp32",
                    vram_bytes=3500, img=img)
    checks.append(("intended batch that spills past VRAM -> not a fit -> measured at 3",
                   e.get("batch") == 3 and "VRAMSpill" in e.get("intended_batch_error", "")
                   and e.get("intended_batch_spilled_measurement", {}).get("batch") == 8
                   and "error" not in e))

    r = _spawn_worker({"kind": "selftest-raise"}, 300)
    checks.append(("worker process: a failure is reported as data, not a traceback",
                   r.get("ok") is False and "WinError 1455" in r.get("error", "")))
    spec = {"device": "cpu", "variant": "unet_base16_depth4", "img": 32, "precision": "fp32",
            "steps": 1, "source_size": 576, "input_from": None, "vram_bytes": None, "revision": None}
    r = _spawn_worker(dict(spec, kind="trial", batch=2), 600)
    checks.append(("worker process: a training-step trial returns a fit",
                   r.get("ok") is True and r.get("fitted") is True))
    r = _spawn_worker(dict(spec, kind="measure", batch=2), 900)
    checks.append(("worker process: a measurement returns a timing",
                   r.get("ok") is True and "train_step" in (r.get("entry") or {})))

    bad = 0
    for label, ok in checks:
        bad += not ok
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    print(f"\n  run_variant selftest: {len(checks) - bad}/{len(checks)} passed\n")
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--operator", help="who is running this, on their own compute (C0-1). Required")
    ap.add_argument("--img", type=int, default=560,
                    help="square model input size; must be divisible by BOTH 16 (UNet pools 4x) "
                         "and 14 (DINOv2 patch). 112, 224, 336, 448, 560, 672 all work")
    ap.add_argument("--batch", type=int, default=2, help="intended batch size")
    ap.add_argument("--steps", type=int, default=10)
    ap.add_argument("--precision", choices=["fp32", "fp16", "bf16"], default="fp32",
                    help="fp16/bf16 use CUDA autocast (fp16 with loss scaling). Recorded per trial")
    ap.add_argument("--device", default=None, help="cuda | mps | cpu (default: best available)")
    ap.add_argument("--find-batch", action="store_true", help="also run the C0-3 batch search")
    ap.add_argument("--batch-cap", type=int, default=64, help="upper bound for the batch search")
    ap.add_argument("--backbones", default="s14,b14",
                    help=f"DINOv2 checkpoints to include: {','.join(DINO_CHECKPOINTS)}")
    ap.add_argument("--variants", default=None,
                    help="comma list of variant names to run (default: every variant of "
                         "--backbones plus both UNets). Run with --list-variants to see them")
    ap.add_argument("--list-variants", action="store_true")
    ap.add_argument("--revision", action="append", default=[],
                    help="pin a checkpoint, KEY=COMMIT, e.g. s14=<sha>. Default: main, resolved "
                         "to its commit and recorded")
    ap.add_argument("--source-size", type=int, choices=[576, 640], default=640,
                    help="in-plane size of the in-memory synthetic source volume (the two cohort "
                         "sizes from Spike D A6). Ignored with --input-from")
    ap.add_argument("--input-from", default=None,
                    help="directory from synthetic/generate.py; the first *_volume_uint8.npy is used")
    ap.add_argument("--out-dir", default=EVIDENCE,
                    help="where the JSON record is written (default: EVIDENCE_RAW/)")
    ap.add_argument("--note", default="")
    ap.add_argument("--selftest", action="store_true",
                    help="check the batch-search and runner logic without a GPU, then exit")
    ap.add_argument("--no-isolate", action="store_true",
                    help="run CUDA measurements in this process instead of one worker process per "
                         "measurement and per batch-search attempt (isolation is the default on CUDA)")
    ap.add_argument("--worker-timeout", type=int, default=900,
                    help="seconds before a worker process is abandoned and recorded as failed")
    ap.add_argument("--_worker", default=None, help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args._worker:
        return _worker_main(args._worker)
    if args.selftest:
        return selftest()
    backbones = [b.strip() for b in args.backbones.split(",") if b.strip()]
    for b in backbones:
        if b not in DINO_CHECKPOINTS:
            raise SystemExit(f"Unknown backbone {b!r}; known: {', '.join(DINO_CHECKPOINTS)}")
    names = ([v.strip() for v in args.variants.split(",") if v.strip()] if args.variants
             else variant_names(backbones))
    if args.list_variants:
        print("\n".join(variant_names(list(DINO_CHECKPOINTS))))
        return 0
    if not args.operator:
        ap.error("--operator is required: C0-1 asks what compute the OWNER has")

    isolate = torch.cuda.is_available() and args.device in (None, "cuda") and not args.no_isolate
    if isolate:
        # The parent never initialises CUDA: a context costs VRAM on a 4-6 GB card and would skew
        # every ceiling the workers measure, and a lost context must not outlive one attempt.
        described = _spawn_worker({"kind": "describe"}, args.worker_timeout)
        if not described.get("ok"):
            raise SystemExit(f"Could not read the compute description in a worker: "
                             f"{described.get('error')}")
        compute = described["compute"]
    else:
        compute = describe_compute()
    device = args.device or compute["device_kind"]
    if device != compute.get("device_kind"):
        compute = dict(compute)
        compute["device_actually_used"] = device
        compute["compute_used_for_this_run"] = (
            f"{device} - NOT the {compute.get('gpu_name')} reported above. Every timing and "
            f"memory figure in this record was produced on {device}.")
    if args.precision != "fp32" and device != "cuda":
        raise SystemExit(f"--precision {args.precision} needs CUDA autocast; this run is on {device}.")
    if args.precision == "bf16" and not compute.get("bf16_supported"):
        raise SystemExit("--precision bf16: this GPU does not support bf16. Use fp16 or fp32.")
    torch.manual_seed(2024)

    unet_div, vit_div = 2 ** 4, 14
    if args.img % unet_div or args.img % vit_div:
        lcm = 112
        lower = (args.img // lcm) * lcm
        print()
        print(f"  --img {args.img} does not work for both families.")
        print(f"    UNet   needs a multiple of {unet_div} (it pools 4 times): "
              f"{'ok' if args.img % unet_div == 0 else 'NO'}")
        print(f"    DINOv2 needs a multiple of {vit_div} (patch size):        "
              f"{'ok' if args.img % vit_div == 0 else 'NO'}")
        print(f"    Nearest sizes that satisfy both: {lower if lower else lower + lcm} or {lower + lcm}")
        print("    Common usable sizes: 112, 224, 336, 448, 560, 672")
        print()
        return 2

    pins = {}
    for r in args.revision:
        k, _, v = r.partition("=")
        pins[k.strip()] = v.strip() or None
    parsed = [(n, parse_variant(n)) for n in names]
    needed = sorted({p["backbone"] for _, p in parsed if p["family"] == "dinov2"})
    checkpoints, checkpoint_errors = {}, {}
    for key in needed:
        print(f"  checkpoint {DINO_CHECKPOINTS[key]['repo']} ...", end="", flush=True)
        try:
            checkpoints[key] = fetch_checkpoint(key, pins.get(key))
            print(f" {checkpoints[key]['revision_resolved'][:12]}  "
                  f"{checkpoints[key]['weights_bytes'] / 1024 ** 2:.0f} MB")
        except Exception as exc:  # network, cache, disk or permission - diagnose, never a traceback
            checkpoint_errors[key] = f"{type(exc).__name__}: {str(exc)[:300]}"
            print(" FAILED")
            print(f"    {checkpoint_errors[key]}")
            print(f"    Variants using {key} are skipped and recorded; the others still run.")

    def builder(p):
        if p["family"] == "unet":
            return lambda: UNet2D(base=p["base"], depth=p["depth"])
        ck = checkpoints[p["backbone"]]
        return lambda: DinoSeg(ck, img=args.img, decoder=p["decoder"], mode=p["mode"])

    dr011 = load_dr011()
    # Isolated: the parent builds the input on the CPU for its metadata only; each worker rebuilds
    # the same deterministic input on the GPU.
    x, y, input_meta = build_input(args, "cpu" if isolate else device, dr011)

    print()
    print(f"  operator   {args.operator}")
    print(f"  device     {device}   {compute.get('gpu_name')}   driver {compute.get('nvidia_driver', '-')}")
    if compute.get("vram_total_gb"):
        print(f"  vram       {compute['vram_total_gb']} GB")
    print(f"  input      {args.batch} x 1 x {args.img} x {args.img}   precision {args.precision}")
    print(f"  source     {input_meta['source']}  ({input_meta['source_dtype']}), "
          f"resized bilinear to {args.img}, DR-011 p{dr011['p_low']}/p{dr011['p_high']}")
    print()
    head = (f"  {'variant':<32} {'stride':>6} {'train M':>8} {'fwd ms':>8} {'train ms':>9} "
            f"{'slice/s':>8} {'peak MB':>9}")
    print(head)
    print("  " + "-" * (len(head) - 2))

    results = []
    context_lost_by = None
    for name, p in parsed:
        if context_lost_by:
            results.append({"variant": name, "family": p["family"], "precision": args.precision,
                            "error": f"not run - the CUDA context was lost during {context_lost_by}",
                            "note": "run this variant in a fresh process with --variants"})
            print(f"  {name:<32} {'—':>6} {'—':>8} {'—':>8} {'—':>9} {'—':>8} {'—':>9}   NOT RUN")
            continue
        if p["family"] == "dinov2" and p["backbone"] in checkpoint_errors:
            results.append({"variant": name, "family": "dinov2", "precision": args.precision,
                            "error": f"checkpoint unavailable - {checkpoint_errors[p['backbone']]}",
                            "note": "skipped: its checkpoint could not be fetched or verified"})
            print(f"  {name:<32} {'—':>6} {'—':>8} {'—':>8} {'—':>9} {'—':>8} {'—':>9}   SKIPPED")
            continue
        vram = compute.get("vram_total_bytes")
        ckpt = checkpoints.get(p.get("backbone"))
        if isolate:
            measure, fits = isolated_strategies(
                name, p, ckpt, device=device, img=args.img, steps=args.steps,
                precision=args.precision, source_size=args.source_size, input_from=args.input_from,
                vram_bytes=vram, timeout_s=args.worker_timeout)
            context_check, cleanup = (lambda: True), (lambda: None)
        else:
            build = builder(p)
            measure = (lambda b, build=build, p=p, ckpt=ckpt:
                       measure_variant(build, p, x[:b], y[:b], device, args.steps, args.precision, ckpt))
            fits = (lambda b, build=build: _fit_trial(build, b, args.img, device, args.precision, vram))
            context_check, cleanup = (lambda: cuda_usable(device)), (lambda: _cleanup(device))
        entry = run_variant(
            name, p, measure=measure, fits=fits, intended_batch=args.batch,
            find_batch=args.find_batch, batch_cap=args.batch_cap, device=device,
            precision=args.precision, vram_bytes=vram, img=args.img,
            context_check=context_check, cleanup=cleanup)
        results.append(entry)
        if entry.get("cuda_context_lost") and device == "cuda":
            context_lost_by = name
        if "train_step" in entry:
            fwd, trn, peak = entry["forward"], entry["train_step"], entry["peak_memory_bytes_train"]
            lfb = (f"   max batch {entry['batch_search'].get('largest_fitting_batch')}"
                   if "batch_search" in entry else "")
            at = f"   measured at batch {entry['batch']}" if entry.get("measured_at") else ""
            print(f"  {name:<32} {entry['effective_output_stride']:>6.2f} "
                  f"{entry['parameters_trainable'] / 1e6:>8.2f} "
                  f"{fwd['ms_median']:>8.1f} {trn['ms_median']:>9.1f} {trn['slices_per_s']:>8.2f} "
                  f"{(peak / 1024 ** 2 if peak else float('nan')):>9.1f}{lfb}{at}")
        else:
            reason = entry["error"].splitlines()[0][:90]
            print(f"  {name:<32} {'—':>6} {'—':>8} {'—':>8} {'—':>9} {'—':>8} {'—':>9}   FAILED")
            print(f"  {'':<32} reason: {reason}")

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%dT%H%M%S%z")
    os.makedirs(args.out_dir, exist_ok=True)
    out = os.path.join(args.out_dir, f"c0_probe_{stamp}.json")
    record = {
        "harness": "spikes/spike_c_ml/harness/probe.py revision 4 (2026-09-15) - real DINOv2; batch search runs even when the intended batch fails; OSError recorded per candidate; CUDA work isolated per process",
        "criterion_coverage": ["C0-1", "C0-2", "C0-3" if args.find_batch else "C0-3 (not run)",
                               "C0-4", "C0-5", "C0-6"],
        "captured_at": stamp,
        "operator": args.operator,
        "conditions_note": args.note,
        "compute": compute,
        "device_used": device,
        "isolation": ("one worker process per measurement and per batch-search attempt; the parent "
                      "never initialises CUDA" if isolate else "in-process (--no-isolate or not CUDA)"),
        "precision": args.precision,
        "input_shape": [args.batch, 1, args.img, args.img],
        "input_is_synthetic": True,
        "input": input_meta,
        "checkpoints": {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")}
                        for k, v in checkpoints.items()},
        "checkpoint_errors": checkpoint_errors,
        "c0_10_statement": ("C0 evidence does NOT close GATE-ML-01. DR-007 forbids closing it "
                            "on C0 alone. Convergence, achievable quality, and the interaction "
                            "between output stride and the real LA boundary thickness are C1."),
        "results": results,
    }
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print()
    if device != "cuda":
        print("  NOTE on the memory column: this is not a CUDA device, so the figure is a")
        print("  process RSS delta, not a true peak, and it is not comparable across runs.")
        print()
    print("  C0-5 — effective output stride is set by the DECODER, not the encoder:")
    print("     UNet                        stride 1     full resolution via skip connections")
    print("     DINOv2 /14 linear decoder   stride 14    one logit per patch; upsampling adds")
    print("                                              no information")
    print("     DINOv2 /14 progressive      stride 1.75  three learned doublings (x8); the")
    print("                                              remainder of 14 = 2*7 is interpolated")
    print()
    print("  Whether stride 14 is acceptable depends on the LA cavity boundary thickness in")
    print("  voxels, which is criterion C1-5 and needs REAL anatomy. C0 cannot answer it.")
    print()
    print(f"  wrote  {out}")
    print("  Extrapolate a calendar with:  python harness/extrapolate.py <that file>")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
