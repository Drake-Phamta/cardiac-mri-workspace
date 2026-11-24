"""Frozen foundation encoders used as feature extractors.

* DINOv3 ViT-B/16 (general domain, LVD-1689M natural images) - timm weights
  `vit_base_patch16_dinov3.lvd1689m`; RoPE positions, 1 cls + 4 register tokens.
* MRI-CORE ViT-B/16 (MRI domain, ~6M MRI slices, DINOv2 objective, initialised
  from SAM ViT-B) - the official teacher checkpoint is a DINOv2-style ViT
  (cls token, 14x14 absolute position grid, final LayerNorm). We load it into
  timm's standard ViT-B/16 and let timm resample the position grid.

Both encoders receive the same 512 x 512 input and return a (B, 768, 32, 32)
patch-token map taken after the final LayerNorm.
"""
import re
import sys
from pathlib import Path

import timm
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

MRICORE_CKPT = C.WEIGHT_DIR / "mricore" / "MRI_CORE_vitb.pth"


def _mricore_state_dict(path: Path) -> dict:
    ckpt = torch.load(path, map_location="cpu", weights_only=True)
    teacher = ckpt["teacher"] if "teacher" in ckpt else ckpt
    out = {}
    for k, v in teacher.items():
        if not k.startswith("backbone.") or "mask_token" in k:
            continue  # drop DINO/iBOT heads and the iBOT mask token
        k = k[len("backbone."):]
        # DINOv2 stores blocks in chunks: blocks.<chunk>.<idx>.* -> blocks.<idx>.*
        k = re.sub(r"^blocks\.\d+\.(\d+)\.", r"blocks.\1.", k)
        out[k] = v
    return out


def load_encoder(name: str) -> torch.nn.Module:
    if name == "dinov3":
        model = timm.create_model("vit_base_patch16_dinov3.lvd1689m", pretrained=True,
                                  num_classes=0, dynamic_img_size=True)
    elif name == "mricore":
        model = timm.create_model("vit_base_patch16_224", pretrained=False,
                                  num_classes=0, dynamic_img_size=True)
        missing, unexpected = model.load_state_dict(_mricore_state_dict(MRICORE_CKPT), strict=False)
        if missing or unexpected:
            raise RuntimeError(f"MRI-CORE load mismatch: missing={missing} unexpected={unexpected}")
    else:
        raise ValueError(name)
    model.eval().requires_grad_(False)
    return model


def to_encoder_input(canvas_u8: torch.Tensor) -> torch.Tensor:
    """(B, H, W) uint8 canvas -> (B, 3, ENC_SIZE, ENC_SIZE) ImageNet-normalised float."""
    x = canvas_u8.float().div(255.0).unsqueeze(1)
    x = F.interpolate(x, size=(C.ENC_SIZE, C.ENC_SIZE), mode="bilinear", align_corners=False)
    x = x.repeat(1, 3, 1, 1)
    mean = torch.tensor(C.IMAGENET_MEAN, device=x.device).view(1, 3, 1, 1)
    std = torch.tensor(C.IMAGENET_STD, device=x.device).view(1, 3, 1, 1)
    return (x - mean) / std


@torch.no_grad()
def patch_features(model: torch.nn.Module, x: torch.Tensor) -> torch.Tensor:
    """Return the (B, D, H/16, W/16) map of normalised patch tokens."""
    tokens = model.forward_features(x)
    tokens = tokens[:, model.num_prefix_tokens:, :]
    b, n, d = tokens.shape
    gh, gw = x.shape[-2] // 16, x.shape[-1] // 16
    assert n == gh * gw, (n, gh, gw)
    return tokens.transpose(1, 2).reshape(b, d, gh, gw)
