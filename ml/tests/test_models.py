"""Tests for ml.models (CPU, tiny inputs).

The DINOv2 tests need the pinned checkpoints in the local Hugging Face cache and are
skipped (not failed) on a machine without them. Nothing is downloaded.
"""

from __future__ import annotations

import os

import pytest
import torch

os.environ.setdefault("HF_HUB_OFFLINE", "1")

from ml import models as M  # noqa: E402

IMG = 112          # a multiple of both 16 and 14


def _have(key: str) -> bool:
    try:
        M.fetch_checkpoint(key)
        return True
    except Exception:  # noqa: BLE001 - absence of the cache is the only expected failure
        return False


@pytest.mark.parametrize("variant", ["unet_base32_depth4", "unet_base16_depth4"])
def test_unet_variants_forward(variant):
    torch.manual_seed(2024)
    model = M.build_model(variant, IMG).eval()
    with torch.no_grad():
        out = model(torch.rand(2, 1, IMG, IMG))
    assert out.shape == (2, 1, IMG, IMG)
    card = M.model_card(model)
    assert card["model_variant"] == variant and card["model_family"] == "unet"
    assert card["checkpoint"] is None and card["effective_output_stride"] == 1.0
    assert card["parameters_trainable"] == card["parameters_total"] > 0


def test_same_seed_same_initialisation():
    torch.manual_seed(2024)
    a = M.build_model("unet_base16_depth4", IMG).state_dict()
    torch.manual_seed(2024)
    b = M.build_model("unet_base16_depth4", IMG).state_dict()
    assert all(torch.equal(a[k], b[k]) for k in a)


def test_unknown_variant_and_bad_sizes_are_refused():
    with pytest.raises(ValueError):
        M.build_model("unet_base64_depth5", IMG)
    with pytest.raises(ValueError):
        M.build_model("unet_base32_depth4", 100)          # not a multiple of 16
    with pytest.raises(ValueError):
        M.check_img("dinov2_s14_full_progressive", 128)   # not a multiple of 14
    M.check_img("dinov2_s14_full_progressive", 560)
    M.check_img("unet_base32_depth4", 560)


def test_adr_ml_001_families_are_supported_variants():
    for variant in M.ADR_ML_001_FAMILIES.values():
        assert variant in M.VARIANTS
    assert set(M.VARIANTS) == {"unet_base32_depth4", "unet_base16_depth4",
                               "dinov2_s14_full_progressive", "dinov2_s14_frozen_progressive",
                               "dinov2_b14_full_progressive"}


def test_autocast_is_a_no_op_off_cuda():
    with M.autocast_for("cpu", "bf16"):
        y = torch.ones(2, 2) @ torch.ones(2, 2)
    assert y.dtype == torch.float32
    with pytest.raises(ValueError):
        M.autocast_for("cuda", "int8")


class _AutocastRecorder:
    """Stands in for torch.autocast so the CUDA branch is testable on a CPU-only machine."""
    calls: list = []

    def __init__(self, device_type, dtype=None, **kwargs):
        _AutocastRecorder.calls.append((device_type, dtype))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.mark.parametrize("device", ["cuda", "cuda:0", torch.device("cuda"), torch.device("cuda", 0)])
def test_every_cuda_spelling_takes_the_cuda_path(device, monkeypatch):
    # torch.device("cuda") == "cuda" is False and "cuda:0" != "cuda": a string comparison
    # would silently train in fp32 while the run records bf16 (PR #60 QA finding B1).
    _AutocastRecorder.calls = []
    monkeypatch.setattr(torch, "autocast", _AutocastRecorder)
    with M.autocast_for(device, "bf16"):
        pass
    with M.autocast_for(device, "fp16"):
        pass
    assert _AutocastRecorder.calls == [("cuda", torch.bfloat16), ("cuda", torch.float16)]
    assert M._device_kind(device) == "cuda"
    assert M.PeakTracker(device).device == "cuda"          # true CUDA peak, not an RSS delta


@pytest.mark.parametrize("device", ["cpu", torch.device("cpu")])
def test_cpu_spellings_never_autocast(device, monkeypatch):
    _AutocastRecorder.calls = []
    monkeypatch.setattr(torch, "autocast", _AutocastRecorder)
    with M.autocast_for(device, "bf16"):
        pass
    assert _AutocastRecorder.calls == []
    assert M.PeakTracker(device).device == "cpu"


def test_peak_tracker_cpu_reports_rss_delta():
    t = M.PeakTracker("cpu")
    t.start()
    t.sample()
    r = t.result()
    assert r["is_true_peak"] is False


@pytest.mark.parametrize("variant", ["dinov2_s14_full_progressive", "dinov2_s14_frozen_progressive"])
def test_dinov2_small_variants_forward(variant):
    if not _have("s14"):
        pytest.skip("pinned facebook/dinov2-small not in the local Hugging Face cache")
    torch.manual_seed(2024)
    model = M.build_model(variant, IMG).eval()
    with torch.no_grad():
        out = model(torch.rand(1, 1, IMG, IMG))
    assert out.shape == (1, 1, IMG, IMG)
    card = M.model_card(model)
    ck = card["checkpoint"]
    assert ck["revision_resolved"] == M.PINNED_REVISIONS["s14"]
    assert len(ck["weights_sha256"]) == 64 and "_path" not in ck
    assert card["decoder"] == "progressive" and card["effective_output_stride"] == 14 / 8
    backbone_trainable = any(p.requires_grad for p in model.backbone.parameters())
    assert backbone_trainable == (card["backbone_mode"] == "full")


def test_dinov2_base_full_progressive_builds():
    if not _have("b14"):
        pytest.skip("pinned facebook/dinov2-base not in the local Hugging Face cache")
    model = M.build_model("dinov2_b14_full_progressive", IMG).eval()
    with torch.no_grad():
        out = model(torch.rand(1, 1, IMG, IMG))
    assert out.shape == (1, 1, IMG, IMG)
    assert M.model_card(model)["checkpoint"]["revision_resolved"] == M.PINNED_REVISIONS["b14"]


def test_pinned_revision_mismatch_is_refused():
    if not _have("s14"):
        pytest.skip("pinned facebook/dinov2-small not in the local Hugging Face cache")
    with pytest.raises(Exception):
        M.fetch_checkpoint("s14", "0" * 40)               # not in the cache, never downloaded
