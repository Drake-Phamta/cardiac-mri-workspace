"""Model definitions for the ADR-ML-001 experiment matrix.

PROVENANCE
    UNet2D, DinoSeg, fetch_checkpoint, autocast_for, PeakTracker and _rss are COPIED from
        spikes/spike_c_ml/harness/probe.py  at commit 896c11a  (Spike C0 harness, revision 4)
    Product code must not import from spikes/, so the code is copied, not imported. The
    network definitions (UNet2D, DinoSeg) are unchanged line for line, so a checkpoint
    trained here has the same parameter names as the C0 measurements. Every deliberate
    change against the source is marked "CHANGED vs probe.py" next to the object.

VARIANTS (names as Spike C0 used them)
    unet_base32_depth4              UNet2D(base=32, depth=4)           ADR-ML-001 family
    unet_base16_depth4              UNet2D(base=16, depth=4)
    dinov2_s14_full_progressive     DinoSeg(dinov2-small, progressive, full)  ADR-ML-001 family
    dinov2_s14_frozen_progressive   DinoSeg(dinov2-small, progressive, frozen)
    dinov2_b14_full_progressive     DinoSeg(dinov2-base, progressive, full)

    The DINOv2 checkpoints are pinned to exact Hugging Face commits and resolved from the
    LOCAL cache only (local_files_only=True). A missing cache entry is an error, never a
    silent download of whatever `main` points at today.

INPUT
    Every model takes x [B, 1, img, img] float32 in [0, 1] (the DR-011 output, see
    ml/data.py) and returns logits [B, 1, img, img]. DinoSeg replicates the channel to 3
    and applies the checkpoint's own fixed image_mean/image_std inside forward(); those
    are pretrained-model constants, which DR-011 permits, not cohort statistics.
    img must be a multiple of 16 for the UNet (four 2x poolings) and of 14 for DINOv2
    (patch size); 112, 224, 336, 448, 560 satisfy both.
"""

from __future__ import annotations

import contextlib
import functools
import glob
import hashlib
import json
import os

import torch
import torch.nn as nn
import torch.nn.functional as F

MODELS_VERSION = "ml-models-1.0.0"

# Candidate DINOv2 checkpoints. The key is what variant names use. (copied from probe.py)
DINO_CHECKPOINTS = {
    "s14": {"repo": "facebook/dinov2-small", "arch": "ViT-S/14"},
    "b14": {"repo": "facebook/dinov2-base", "arch": "ViT-B/14"},
}

# Pinned revisions (already in the Hugging Face cache on the team's training PC).
PINNED_REVISIONS = {
    "s14": "ed25f3a31f01632728cabb09d1542f84ab7b0056",
    "b14": "f9e44c814b77203eaa57a6bdbbd535f21ede1415",
}

VARIANTS = {
    "unet_base32_depth4": {"family": "unet", "base": 32, "depth": 4},
    "unet_base16_depth4": {"family": "unet", "base": 16, "depth": 4},
    "dinov2_s14_full_progressive": {"family": "dinov2", "backbone": "s14", "mode": "full",
                                    "decoder": "progressive"},
    "dinov2_s14_frozen_progressive": {"family": "dinov2", "backbone": "s14", "mode": "frozen",
                                      "decoder": "progressive"},
    "dinov2_b14_full_progressive": {"family": "dinov2", "backbone": "b14", "mode": "full",
                                    "decoder": "progressive"},
}

# ADR-ML-001 pre-declared families (decided before any result was seen).
ADR_ML_001_FAMILIES = {"unet": "unet_base32_depth4", "dinov2": "dinov2_s14_full_progressive"}


# --- candidate architectures (copied from probe.py, unchanged) ------------------

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


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@functools.lru_cache(maxsize=None)
def _fetch_checkpoint_cached(key: str, revision: str) -> dict:
    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:                                 # pragma: no cover
        raise RuntimeError("The DINOv2 family needs transformers and huggingface_hub.") from exc
    repo = DINO_CHECKPOINTS[key]["repo"]
    # CHANGED vs probe.py: local_files_only=True - the cache is the only source.
    path = snapshot_download(repo_id=repo, revision=revision, local_files_only=True,
                             allow_patterns=["*.json", "*.safetensors"])
    weights = sorted(glob.glob(os.path.join(path, "*.safetensors")))
    if not weights:
        path = snapshot_download(repo_id=repo, revision=revision, local_files_only=True,
                                 allow_patterns=["*.json", "pytorch_model.bin"])
        weights = sorted(glob.glob(os.path.join(path, "pytorch_model.bin")))
    if not weights:
        raise RuntimeError(f"No weights file found for {repo} at {path}")
    resolved = os.path.basename(os.path.normpath(path))
    # CHANGED vs probe.py: a pinned revision must resolve to exactly itself.
    if resolved != revision:
        raise RuntimeError(f"{repo}: pinned revision {revision} resolved to {resolved}")
    mean, std, mean_src = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225], "ImageNet constants (fallback)"
    pre = os.path.join(path, "preprocessor_config.json")
    if os.path.exists(pre):
        with open(pre, encoding="utf-8") as f:
            cfg = json.load(f)
        if "image_mean" in cfg and "image_std" in cfg:
            mean, std = cfg["image_mean"], cfg["image_std"]
            mean_src = "preprocessor_config.json of this checkpoint"
    record = {
        "key": key, "repo": repo, "arch": DINO_CHECKPOINTS[key]["arch"],
        "revision_requested": revision,
        "revision_resolved": resolved,
        "weights_file": os.path.basename(weights[0]),
        "weights_bytes": os.path.getsize(weights[0]),
        "weights_sha256": _sha256_file(weights[0]),
        "image_mean": list(mean), "image_std": list(std), "mean_std_source": mean_src,
        "_path": path,
    }
    return record


def fetch_checkpoint(key: str, revision: str | None = None) -> dict:
    """Resolve a pinned DINOv2 checkpoint from the LOCAL Hugging Face cache and record its identity.

    CHANGED vs probe.py:
      * revision defaults to PINNED_REVISIONS[key], never to `main`;
      * local_files_only=True - nothing is downloaded; a missing cache entry raises;
      * the resolved snapshot directory must equal the pinned commit;
      * the result is memoised per (key, revision), so the weights are hashed once.
    The returned dict carries the weights file SHA-256; "_path" is the local snapshot
    directory and is never written into a manifest.
    """
    if key not in DINO_CHECKPOINTS:
        raise ValueError(f"unknown DINOv2 checkpoint key {key!r}; known: {sorted(DINO_CHECKPOINTS)}")
    revision = revision or PINNED_REVISIONS[key]
    out = dict(_fetch_checkpoint_cached(key, revision))
    out["image_mean"], out["image_std"] = list(out["image_mean"]), list(out["image_std"])
    return out


def public_checkpoint_ref(ckpt: dict | None) -> dict | None:
    """The manifest-safe part of a fetch_checkpoint() record (no local paths)."""
    if ckpt is None:
        return None
    return {k: v for k, v in ckpt.items() if not k.startswith("_")}


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

    (copied from probe.py, unchanged)
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


# --- variants ------------------------------------------------------------------

def parse_variant(name: str) -> dict:
    """The spec of one supported variant. Unknown names raise (no guessing)."""
    if name not in VARIANTS:
        raise ValueError(f"unknown model variant {name!r}; supported: {sorted(VARIANTS)}")
    return dict(VARIANTS[name])


def check_img(variant: str, img: int) -> None:
    spec = parse_variant(variant)
    if not isinstance(img, int) or img <= 0:
        raise ValueError(f"img must be a positive int, got {img!r}")
    if spec["family"] == "unet":
        div = 2 ** spec["depth"]
        if img % div:
            raise ValueError(f"{variant}: img {img} is not a multiple of {div} "
                             f"({spec['depth']} 2x poolings)")
    elif img % 14:
        raise ValueError(f"{variant}: img {img} is not a multiple of the DINOv2 patch size 14")


def build_model(variant: str, img: int) -> nn.Module:
    """Build one supported variant for square inputs of size img.

    Parameter initialisation uses the global torch RNG: call torch.manual_seed(seed)
    first for a reproducible model. The DINOv2 backbone weights come from the pinned
    checkpoint and do not consume the RNG (DinoSeg forks it while loading).

    The returned module carries:
        model.variant_name   the variant string
        model.variant_spec   parse_variant(variant)
        model.input_size     img
        model.checkpoint_ref public_checkpoint_ref(...) for DINOv2, None for the UNet
    """
    spec = parse_variant(variant)
    check_img(variant, img)
    if spec["family"] == "unet":
        model = UNet2D(in_ch=1, base=spec["base"], depth=spec["depth"])
        ckpt = None
    else:
        ckpt = fetch_checkpoint(spec["backbone"], PINNED_REVISIONS[spec["backbone"]])
        model = DinoSeg(ckpt, img=img, decoder=spec["decoder"], mode=spec["mode"])
    model.variant_name = variant
    model.variant_spec = spec
    model.input_size = img
    model.checkpoint_ref = public_checkpoint_ref(ckpt)
    return model


def model_card(model: nn.Module) -> dict:
    """Identity and size of a model built by build_model(), for run manifests."""
    spec = getattr(model, "variant_spec", None)
    if spec is None:
        raise ValueError("model_card() needs a model built by build_model()")
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    card = {
        "models_version": MODELS_VERSION,
        "model_variant": model.variant_name,
        "model_family": spec["family"],
        "input_size": model.input_size,
        "parameters_total": int(total),
        "parameters_trainable": int(trainable),
        "effective_output_stride": float(model.output_stride()),
    }
    if spec["family"] == "unet":
        card.update({"decoder": "unet", "backbone": "none (trained from scratch)",
                     "backbone_mode": "n/a", "unet_base": spec["base"], "unet_depth": spec["depth"],
                     "checkpoint": None})
    else:
        card.update({"decoder": spec["decoder"], "backbone": DINO_CHECKPOINTS[spec["backbone"]]["arch"],
                     "backbone_mode": spec["mode"], "checkpoint": model.checkpoint_ref,
                     "attn_implementation": getattr(model, "attn_implementation", "unknown")})
    return card


# --- runtime helpers (copied from probe.py) ---------------------------------------

def _device_kind(device) -> str:
    """'cuda' for "cuda", "cuda:0", torch.device("cuda", 0) ...; 'cpu' for "cpu"; etc.

    A plain string comparison is wrong here: torch.device("cuda") == "cuda" is False and
    "cuda:0" != "cuda", so a CUDA run would silently fall back to the CPU branch.
    """
    return torch.device(device).type


def autocast_for(device, precision: str):
    """fp32 runs plain; fp16/bf16 use CUDA autocast.

    CHANGED vs probe.py:
      * the device is normalised with torch.device(device).type, so "cuda:0" and
        torch.device("cuda", 0) take the CUDA path (probe.py compared strings);
      * on a non-CUDA device this is always a no-op (fp32), so CPU tests never enter a
        CUDA autocast region;
      * an unknown precision raises.
    """
    if precision not in ("fp32", "fp16", "bf16"):
        raise ValueError(f"unknown precision {precision!r}")
    if precision == "fp32" or _device_kind(device) != "cuda":
        return contextlib.nullcontext()
    return torch.autocast(device_type="cuda",
                          dtype=torch.float16 if precision == "fp16" else torch.bfloat16)


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

    (copied from probe.py; CHANGED: the device is normalised with torch.device(device).type,
    so "cuda:0" and torch.device("cuda", 0) report the true CUDA peak - probe.py compared
    strings)
    """

    def __init__(self, device):
        self.device = _device_kind(device)
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
