"""Clean timing on an idle GPU (training times logged during the experiments
are inflated because several runs shared the GPU).

  * training: ms per iteration (batch 16) of each head on cached features,
    and of the U-Net on images
  * inference: seconds per test volume (88 slices) for the full pipelines
    (both encoders + head, or the U-Net alone)
Output: results/tables/benchmark.csv
"""
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import load_meta, load_splits, open_arrays, volume_index  # noqa: E402
from encoders import load_encoder, patch_features, to_encoder_input  # noqa: E402
from models import FusionDecoder, UNet2D, bce_dice_loss  # noqa: E402


def sync(dev):
    if dev.type == "mps":
        torch.mps.synchronize()
    elif dev.type == "cuda":
        torch.cuda.synchronize()


def time_train(model, inputs, y, dev, n=30):
    opt = torch.optim.AdamW(model.parameters(), 1e-3)
    for i in range(n + 5):
        if i == 5:
            sync(dev)
            t = time.time()
        logits, _ = model(*inputs)
        loss = bce_dice_loss(logits, y)
        opt.zero_grad()
        loss.backward()
        opt.step()
    sync(dev)
    return (time.time() - t) / n * 1000


def main():
    dev = torch.device("mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu"))
    meta, splits = load_meta(), load_splits()
    images, labels, feats = open_arrays(C.ENCODERS)
    idx = np.sort(np.random.default_rng(0).choice(np.flatnonzero(meta.split == "train"), 16, replace=False))
    fg = torch.from_numpy(np.asarray(feats["dinov3"][idx])).float().to(dev)
    fm = torch.from_numpy(np.asarray(feats["mricore"][idx])).float().to(dev)
    img = torch.from_numpy(np.asarray(images[idx])).float().div(255).unsqueeze(1).to(dev)
    y = torch.from_numpy(np.asarray(labels[idx])).float().unsqueeze(1).to(dev)
    rows = []
    for m in ("dinov3", "mricore", "concat", "gate", "gatedge"):
        args = {"dinov3": (fg, None), "mricore": (None, fm), "gatedge": (fg, fm, img)}.get(m, (fg, fm))
        rows.append(dict(model=m, train_ms_per_iter=time_train(FusionDecoder(m).to(dev), args, y, dev)))
    rows.append(dict(model="unet", train_ms_per_iter=time_train(UNet2D(base=16).to(dev), ((img - 0.5) / 0.25,), y, dev)))

    # inference on one test volume (88 slices), batch 16
    vol = splits["test"][0]
    canv = torch.from_numpy(np.asarray(images[volume_index(meta, vol)]))
    encs = {e: load_encoder(e).to(dev) for e in C.ENCODERS}
    head = FusionDecoder("gate").to(dev).eval()
    unet = UNet2D(base=16).to(dev).eval()

    @torch.no_grad()
    def run_fm():
        for s in range(0, len(canv), 16):
            x = to_encoder_input(canv[s:s + 16].to(dev))
            head(patch_features(encs["dinov3"], x), patch_features(encs["mricore"], x))

    @torch.no_grad()
    def run_unet():
        for s in range(0, len(canv), 16):
            unet(canv[s:s + 16].to(dev).float().div(255).sub(0.5).div(0.25).unsqueeze(1))

    infer = {}
    for name, fn in (("gate", run_fm), ("unet", run_unet)):
        fn()
        sync(dev)
        t = time.time()
        for _ in range(3):
            fn()
        sync(dev)
        infer[name] = (time.time() - t) / 3
    for r in rows:
        r["infer_s_per_volume"] = infer.get(r["model"], np.nan)
    df = pd.DataFrame(rows)
    df.to_csv(C.TABLES / "benchmark.csv", index=False)
    print(df.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
