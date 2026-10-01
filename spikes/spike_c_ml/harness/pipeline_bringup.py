#!/usr/bin/env python3
"""One-epoch synthetic C0 pipeline bring-up; never reads real dataset bytes."""

from __future__ import annotations

import argparse
from importlib.metadata import version
import contextlib
import gc
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

import numpy as np
import torch
import torch.nn.functional as F

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parents[1]
FIXTURE = ROOT / "synthetic" / "split_manifest_8_cases.json"
DR011 = ROOT / "dr011_normalization.json"
GENERATE = ROOT / "synthetic" / "generate.py"
sys.path.insert(0, str(HERE))
import probe  # noqa: E402


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def load_split(path: Path) -> tuple[list[str], list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    parts = data.get("partitions", {})
    train = parts.get("train", {}).get("case_ids", [])
    val = parts.get("validation", {}).get("case_ids", [])
    if not train or not val or len(train) != len(set(train)) or len(val) != len(set(val)):
        raise ValueError("split needs non-empty, unique train and validation case_ids")
    if set(train) & set(val):
        raise ValueError("a case crosses train and validation")
    for key, ids in (("train", train), ("validation", val)):
        declared = parts[key].get("case_count")
        if declared != len(ids):
            raise ValueError(f"{key}.case_count={declared}, actual={len(ids)}")
        if any(not str(case).startswith("SYNTH_CASE_") for case in ids):
            raise ValueError("bring-up accepts synthetic fixture case IDs only")
    return train, val


def dr011_config() -> tuple[float, float]:
    cfg = json.loads(DR011.read_text(encoding="utf-8"))["implementation"]
    return float(cfg["p_low"]), float(cfg["p_high"])


def prepare_cases(case_ids: list[str], img: int) -> tuple[list[tuple[torch.Tensor, torch.Tensor]], list[dict]]:
    """Create one center slice per logical 88-slice synthetic volume."""
    gen = load_module(GENERATE, "c0_synthetic_generate")
    low, high = dr011_config()
    samples, records = [], []
    for index, case_id in enumerate(case_ids):
        size = 576 if index % 2 == 0 else 640
        shape = (size, size, 88)
        seed = 2024 + index
        volume = gen.make_volume(shape, seed=seed)
        mask = gen.make_mask(shape)
        normalized = probe.dr011_normalize(volume, low, high)
        z = shape[2] // 2
        x = torch.from_numpy(np.ascontiguousarray(normalized[:, :, z].T))[None, None]
        y = torch.from_numpy(np.ascontiguousarray(mask[:, :, z].T.astype(np.float32)))[None, None]
        x = F.interpolate(x, size=(img, img), mode="bilinear", align_corners=False,
                          antialias=True).clamp_(0, 1)[0]
        y = (F.interpolate(y, size=(img, img), mode="nearest-exact") > 0).float()[0]
        samples.append((x, y))
        records.append({"case_id": case_id, "source_shape_xyz": list(shape), "dtype": "uint8",
                        "seed": seed, "slice_index": z})
        del volume, mask, normalized
        gc.collect()
    return samples, records


def amp(device: str, precision: str):
    if device == "cuda" and precision == "bf16":
        return torch.autocast("cuda", dtype=torch.bfloat16)
    return contextlib.nullcontext()


def dice(logits: torch.Tensor, target: torch.Tensor) -> float:
    pred = torch.sigmoid(logits) >= 0.5
    truth = target >= 0.5
    inter = (pred & truth).sum(dtype=torch.float64)
    denom = pred.sum(dtype=torch.float64) + truth.sum(dtype=torch.float64)
    return float((2 * inter + 1e-6) / (denom + 1e-6))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_variant(name: str, img: int, dino_checkpoint: dict | None):
    if name == "unet_base16_depth4":
        return probe.UNet2D(base=16, depth=4)
    if name == "dinov2_s14_frozen_progressive":
        if dino_checkpoint is None:
            raise ValueError("DINOv2 checkpoint was not resolved")
        return probe.DinoSeg(dino_checkpoint, img=img, decoder="progressive", mode="frozen")
    raise ValueError(f"unsupported bring-up variant: {name}")


def save_payload(model, optimizer, variant: str, checkpoint_ref: dict | None, epoch: int) -> dict:
    state = model.state_dict()
    if variant.startswith("dinov2_"):
        state = {key: value for key, value in state.items() if not key.startswith("backbone.")}
    return {
        "format": "c0-synthetic-bringup-v1",
        "variant": variant,
        "epoch": epoch,
        "model_state": state,
        "optimizer_state": optimizer.state_dict(),
        "external_frozen_backbone": ({
            "repo": checkpoint_ref["repo"],
            "revision_resolved": checkpoint_ref["revision_resolved"],
            "weights_sha256": checkpoint_ref["weights_sha256"],
        } if checkpoint_ref else None),
    }


def run_variant(name: str, train, val, *, img: int, device: str, precision: str,
                checkpoint_dir: Path, dino_checkpoint: dict | None) -> dict:
    torch.manual_seed(2024)
    model = build_variant(name, img, dino_checkpoint).to(device)
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=1e-4)
    loss_fn = torch.nn.BCEWithLogitsLoss()
    started = time.perf_counter()
    losses = []
    model.train()
    for x_cpu, y_cpu in train:
        x, y = x_cpu.to(device), y_cpu.to(device)
        optimizer.zero_grad(set_to_none=True)
        with amp(device, precision):
            logits = model(x[None])
            loss = loss_fn(logits, y[None])
        loss.backward()
        optimizer.step()
        losses.append(float(loss.detach().cpu()))
    elapsed = time.perf_counter() - started

    model.eval()
    scores = []
    with torch.no_grad():
        for x_cpu, y_cpu in val:
            with amp(device, precision):
                logits = model(x_cpu[None].to(device))
            scores.append(dice(logits.float().cpu(), y_cpu[None]))
        reference = model(val[0][0][None].to(device)).float().cpu()

    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / f"{name}.pt"
    torch.save(save_payload(model, optimizer, name, dino_checkpoint, 1), checkpoint_path)
    checkpoint_hash = sha256(checkpoint_path)
    del model, optimizer
    if device == "cuda":
        torch.cuda.empty_cache()

    restored = build_variant(name, img, dino_checkpoint).to(device)
    restored_optimizer = torch.optim.AdamW((p for p in restored.parameters() if p.requires_grad), lr=1e-4)
    payload = torch.load(checkpoint_path, map_location=device, weights_only=True)
    loaded = restored.load_state_dict(payload["model_state"], strict=False)
    unexpected = list(loaded.unexpected_keys)
    missing = list(loaded.missing_keys)
    if unexpected or (name.startswith("unet_") and missing) or any(
            not key.startswith("backbone.") for key in missing):
        raise RuntimeError(f"checkpoint key mismatch: missing={missing[:3]}, unexpected={unexpected[:3]}")
    restored_optimizer.load_state_dict(payload["optimizer_state"])
    restored.eval()
    with torch.no_grad():
        reloaded = restored(val[0][0][None].to(device)).float().cpu()
    max_abs = float((reference - reloaded).abs().max())
    if max_abs > 1e-5:
        raise RuntimeError(f"checkpoint reload output differs by {max_abs}")
    del restored, restored_optimizer, reference, reloaded
    if device == "cuda":
        torch.cuda.empty_cache()

    return {
        "variant": name,
        "epoch": 1,
        "train_steps": len(train),
        "mean_train_loss": sum(losses) / len(losses),
        "synthetic_validation_dice": sum(scores) / len(scores),
        "elapsed_seconds": elapsed,
        "precision": precision,
        "checkpoint": {
            "filename": checkpoint_path.name,
            "bytes": checkpoint_path.stat().st_size,
            "sha256": checkpoint_hash,
            "reload_verified": True,
            "max_abs_output_difference": max_abs,
        },
    }


def selftest() -> int:
    train, val = load_split(FIXTURE)
    assert len(train) == 6 and len(val) == 2 and not (set(train) & set(val))
    sample = np.arange(256, dtype=np.uint8).reshape(16, 16)
    norm = probe.dr011_normalize(sample, 0.5, 99.5)
    assert norm.dtype == np.float32 and 0 <= norm.min() <= norm.max() <= 1
    assert abs(dice(torch.tensor([[[[10.0, -10.0]]]]), torch.tensor([[[[1.0, 0.0]]]])) - 1) < 1e-6
    print("pipeline bring-up selftest: PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=FIXTURE)
    parser.add_argument("--operator", required=False)
    parser.add_argument("--img", type=int, default=560)
    parser.add_argument("--precision", choices=["fp32", "bf16"], default="bf16")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--checkpoint-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.operator:
        parser.error("--operator is required for an evidence run")
    if args.img % 112:
        parser.error("--img must be divisible by both 16 and 14 (for example 560)")
    if args.device == "cuda" and not torch.cuda.is_available():
        parser.error("CUDA requested but unavailable")
    if args.precision == "bf16" and args.device != "cuda":
        parser.error("bf16 bring-up requires CUDA")
    if args.checkpoint_dir is None or args.output is None:
        parser.error("--checkpoint-dir and --output are required for an evidence run")

    train_ids, val_ids = load_split(args.manifest)
    all_samples, cases = prepare_cases(train_ids + val_ids, args.img)
    train = all_samples[:len(train_ids)]
    val = all_samples[len(train_ids):]
    dino = probe.fetch_checkpoint("s14")
    results = []
    for variant in ("unet_base16_depth4", "dinov2_s14_frozen_progressive"):
        print(f"running {variant} ...", flush=True)
        result = run_variant(variant, train, val, img=args.img, device=args.device,
                             precision=args.precision, checkpoint_dir=args.checkpoint_dir,
                             dino_checkpoint=dino)
        results.append(result)
        print(f"  loss={result['mean_train_loss']:.4f} synthetic_dice="
              f"{result['synthetic_validation_dice']:.4f} reload=PASS")

    record = {
        "status": "SYNTHETIC_PIPELINE_BRINGUP_PASS",
        "operator": args.operator,
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "device": torch.cuda.get_device_name(0) if args.device == "cuda" else "CPU",
        "framework": {
            "python": sys.version.split()[0],
            "torch": torch.__version__,
            "transformers": version("transformers"),
            "huggingface_hub": version("huggingface_hub"),
            "cudnn": torch.backends.cudnn.version() if args.device == "cuda" else None,
        },
        "input": {
            "manifest": str(args.manifest.relative_to(REPO)).replace(os.sep, "/"),
            "real_dataset_bytes_read": False,
            "case_count": len(cases),
            "cases": cases,
            "normalization": "DR-011 per-volume p0.5/p99.5; no cohort-fitted statistic",
            "resize": f"MRI bilinear antialias and mask nearest-exact to {args.img}x{args.img}",
        },
        "dinov2_checkpoint": {key: dino[key] for key in (
            "repo", "revision_resolved", "weights_sha256", "mean_std_source")},
        "results": results,
        "limitations": [
            "Synthetic Dice is a plumbing signal only; it is not model-quality evidence.",
            "This run cannot establish convergence or real LA boundary behavior.",
            "This run does not close GATE-ML-01; Spike C1 remains required.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
