"""Step 3 - train one configuration (one seed) and write its test predictions.

Fusion heads (A-D) read the cached frozen features; the U-Net reads the
image; D+ (gatedge) reads both. All configurations share the split, loss, optimiser, iteration budget
and the checkpoint rule (best validation 3D Dice, threshold 0.5, no
post-processing).

Example:
  python code/train.py --model gate --labels full --seed 0
"""
import argparse
import copy
import json
import math
import queue
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import crop_volume, load_meta, load_splits, open_arrays, volume_index  # noqa: E402
from metrics import dice  # noqa: E402
from models import FusionDecoder, UNet2D, bce_dice_loss, n_params  # noqa: E402

FEATS_FOR = {"dinov3": ("dinov3",), "mricore": ("mricore",),
             "concat": ("dinov3", "mricore"), "gate": ("dinov3", "mricore"), "unet": (),
             "gatedge": ("dinov3", "mricore")}          # D+: GateFuse + Sobel detail branch
NEEDS_IMAGE = ("unet", "gatedge")


def parse():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=list(FEATS_FOR), required=True)
    ap.add_argument("--labels", choices=["full", "few"], default="full")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--iters", type=int, default=None)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--width", type=int, default=128)
    ap.add_argument("--unet-base", type=int, default=16)
    ap.add_argument("--eval-every", type=int, default=None)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else
                    ("cuda" if torch.cuda.is_available() else "cpu"))
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    a.iters = a.iters or (4000 if a.labels == "full" else 2000)
    a.eval_every = a.eval_every or (250 if a.labels == "full" else 200)
    a.out = Path(a.out or C.RUN_DIR / f"{a.model}_{a.labels}_s{a.seed}")
    return a


class Batches:
    """Background thread that gathers batches from the memmaps."""

    def __init__(self, src, train_idx, batch, iters, seed):
        self.src, self.q = src, queue.Queue(maxsize=6)
        rng = np.random.default_rng(seed)
        order = []
        while len(order) < iters * batch:
            order.extend(rng.permutation(train_idx).tolist())
        self.plan = np.array(order[: iters * batch]).reshape(iters, batch)
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        for idx in self.plan:
            self.q.put(self.src.get(np.sort(idx)))
        self.q.put(None)

    def __iter__(self):
        while (item := self.q.get()) is not None:
            yield item


class Source:
    def __init__(self, model_name):
        self.need = FEATS_FOR[model_name]
        self.images, self.labels, self.feats = open_arrays(self.need)
        self.with_image = model_name in NEEDS_IMAGE

    def get(self, idx, with_labels=True):
        out = {}
        if self.with_image:
            out["x"] = torch.from_numpy(np.asarray(self.images[idx]))
        for e in self.need:
            out[e] = torch.from_numpy(np.asarray(self.feats[e][idx]))
        if with_labels:
            out["y"] = torch.from_numpy(np.asarray(self.labels[idx]))
        return out


def forward(model, batch, dev, unet):
    if unet:
        x = batch["x"].to(dev).float().div(255.0).sub(0.5).div(0.25).unsqueeze(1)
        return model(x)
    f_g = batch["dinov3"].to(dev).float() if "dinov3" in batch else None
    f_m = batch["mricore"].to(dev).float() if "mricore" in batch else None
    if "x" in batch:                                     # D+ also sees the image at 256 x 256
        return model(f_g, f_m, batch["x"].to(dev).float().div(255.0).unsqueeze(1))
    return model(f_g, f_m)


@torch.no_grad()
def predict(model, src, idx, dev, unet, bs=32):
    model.eval()
    probs, gates = [], []
    for s in range(0, len(idx), bs):
        logits, g = forward(model, src.get(idx[s:s + bs], with_labels=False), dev, unet)
        probs.append(torch.sigmoid(logits)[:, 0].cpu().numpy().astype(np.float16))
        if g is not None:
            gates.append(g[:, 0].cpu().numpy().astype(np.float16))
    model.train()
    return np.concatenate(probs), (np.concatenate(gates) if gates else None)


def predict_volumes(model, src, meta, vols, dev, unet):
    out_p, out_g = {}, {}
    for v in vols:
        idx = volume_index(meta, v)
        p, g = predict(model, src, idx, dev, unet)
        out_p[v] = crop_volume(p, meta.loc[idx[0]])
        if g is not None:
            out_g[v] = g
    return out_p, out_g


def val_dice(model, src, meta, labels, vols, dev, unet):
    probs, _ = predict_volumes(model, src, meta, vols, dev, unet)
    scores = []
    for v in vols:
        idx = volume_index(meta, v)
        gt = crop_volume(np.asarray(labels[idx]), meta.loc[idx[0]]).astype(bool)
        scores.append(dice(probs[v] >= 0.5, gt))
    return float(np.mean(scores))


def main():
    a = parse()
    a.out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(a.seed)
    np.random.seed(a.seed)
    dev = torch.device(a.device)
    meta, splits = load_meta(), load_splits()
    train_vols = splits["train"] if a.labels == "full" else splits["few"]
    train_idx = meta.index[meta.vol.isin(train_vols)].to_numpy()

    unet = a.model == "unet"
    model = (UNet2D(base=a.unet_base) if unet else FusionDecoder(a.model, width=a.width)).to(dev)
    src = Source(a.model)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=a.wd)
    warm = 100
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda it: (it + 1) / warm if it < warm else
        0.5 * (1 + math.cos(math.pi * (it - warm) / max(1, a.iters - warm))))

    cfg = dict(vars(a), out=str(a.out), n_params=n_params(model), n_train_slices=len(train_idx),
               n_train_vols=len(train_vols))
    (a.out / "config.json").write_text(json.dumps(cfg, indent=1))
    print(json.dumps({k: cfg[k] for k in ("model", "labels", "seed", "iters", "n_params", "n_train_vols")}))

    best, best_state, hist, run_loss, t0 = -1.0, None, [], [], time.time()
    model.train()
    for it, batch in enumerate(Batches(src, train_idx, a.batch, a.iters, a.seed), start=1):
        logits, _ = forward(model, batch, dev, unet)
        loss = bce_dice_loss(logits, batch["y"].to(dev).float().unsqueeze(1))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        run_loss.append(loss.item())
        if it % a.eval_every == 0 or it == a.iters:
            vd = val_dice(model, src, meta, src.labels, splits["val"], dev, unet)
            hist.append(dict(iter=it, loss=float(np.mean(run_loss)), val_dice=vd,
                             lr=sched.get_last_lr()[0], sec=time.time() - t0))
            run_loss = []
            if vd > best:
                best, best_state, best_it = vd, copy.deepcopy(model.state_dict()), it
            print(f"it {it:5d} loss {hist[-1]['loss']:.4f} val3D {vd:.4f} best {best:.4f} "
                  f"({time.time() - t0:.0f}s)", flush=True)

    train_sec = time.time() - t0
    model.load_state_dict(best_state)
    torch.save(best_state, a.out / "best.pt")
    pd.DataFrame(hist).to_csv(a.out / "history.csv", index=False)

    for split in ("val", "test"):
        probs, gates = predict_volumes(model, src, meta, splits[split], dev, unet)
        np.savez_compressed(a.out / f"pred_{split}.npz",
                            **{v: np.rint(p.astype(np.float32) * 255).astype(np.uint8) for v, p in probs.items()})
        if gates:
            np.savez_compressed(a.out / f"gate_{split}.npz", **gates)
    summary = dict(best_iter=best_it, best_val_dice=best, train_sec=train_sec, n_params=cfg["n_params"])
    (a.out / "summary.json").write_text(json.dumps(summary, indent=1))
    print("done", json.dumps(summary))


if __name__ == "__main__":
    main()
