"""Run the full GateFuse-LA pipeline on a real image and show every step.

Slice mode (one axial PNG slice, optional ground-truth mask):
  python code/demo.py --image samples/<case>_z045_img.png --mask samples/<case>_z045_mask.png

Volume mode (one LA-challenge h5 volume, as distributed by UA-MT):
  python code/demo.py --h5 work/data/uamt_src/data/2018LA_Seg_Training\\ Set/<case>/mri_norm2.h5

Steps: contrast stretching + zero padding (ch. 2-3) -> frozen DINOv3 and
MRI-CORE features -> learned per-pixel gate -> decoder -> threshold ->
largest connected component + hole filling (ch. 7).
"""
import argparse
import sys
import time
from pathlib import Path

import h5py
import matplotlib
import numpy as np
import torch
from PIL import Image

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data_prep import pad_to_canvas, stretch  # noqa: E402
from encoders import load_encoder, patch_features, to_encoder_input  # noqa: E402
from metrics import all_metrics  # noqa: E402
from models import FusionDecoder  # noqa: E402
from postprocess import VARIANTS, fill_holes_slicewise, postprocess  # noqa: E402

DEFAULT_CKPT = C.RESULTS / "checkpoints" / "gatefuse_full_s0.pt"


def pick_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


class Pipeline:
    def __init__(self, ckpt: Path, dev):
        self.dev = dev
        self.enc = {e: load_encoder(e).to(dev) for e in C.ENCODERS}
        self.head = FusionDecoder("gate").to(dev).eval()
        self.head.load_state_dict(torch.load(ckpt, map_location="cpu", weights_only=True))

    @torch.no_grad()
    def __call__(self, canvases_u8: np.ndarray, bs: int = 16):
        probs, gates, feats = [], [], {e: [] for e in C.ENCODERS}
        for s in range(0, len(canvases_u8), bs):
            x = to_encoder_input(torch.from_numpy(canvases_u8[s:s + bs]).to(self.dev))
            f = {e: patch_features(m, x) for e, m in self.enc.items()}
            logits, g = self.head(f["dinov3"], f["mricore"])
            probs.append(torch.sigmoid(logits)[:, 0].cpu().numpy())
            gates.append(g[:, 0].cpu().numpy())
            for e in f:
                feats[e].append(f[e].cpu().numpy())
        return (np.concatenate(probs), np.concatenate(gates),
                {e: np.concatenate(v) for e, v in feats.items()})


POS_MEAN = C.RESULTS / "checkpoints" / "feature_pos_mean.pt"


def pca_rgb(feat: np.ndarray, pos_mean=None) -> np.ndarray:
    """(D, G, G) features -> (G, G, 3) image of the first three principal components.

    The per-position mean token (from 600 training slices) is removed first,
    otherwise the leading components only encode the grid position.
    """
    d, gh, gw = feat.shape
    if pos_mean is not None:
        feat = feat - pos_mean
    x = feat.reshape(d, -1).T.astype(np.float64)
    x -= x.mean(0)
    _, _, vt = np.linalg.svd(x, full_matrices=False)
    p = x @ vt[:3].T
    lo, hi = np.percentile(p, 2, axis=0), np.percentile(p, 98, axis=0)
    p = np.clip((p - lo) / (hi - lo + 1e-8), 0, 1)
    return p.reshape(gh, gw, 3)


def upsample_crop(grid_img: np.ndarray, top, left, h, w):
    t = torch.from_numpy(np.ascontiguousarray(grid_img)).float()
    t = t.permute(2, 0, 1)[None] if t.ndim == 3 else t[None, None]
    t = torch.nn.functional.interpolate(t, size=(C.CANVAS, C.CANVAS), mode="bilinear", align_corners=False)[0]
    t = t.permute(1, 2, 0).numpy() if t.shape[0] == 3 else t[0].numpy()
    return t[top:top + h, left:left + w]


def slice_mode(args, pipe):
    raw = np.asarray(Image.open(args.image).convert("L")).astype(np.float32)
    s = stretch(raw)
    canvas, top, left = pad_to_canvas(s, C.CANVAS)
    canvas_u8 = np.rint(canvas * 255).astype(np.uint8)[None]
    prob, gate, feats = pipe(canvas_u8)
    h, w = raw.shape
    prob = prob[0, top:top + h, left:left + w]
    # a single slice has no 3D context: a vein branch that looks detached here is
    # connected in 3D, so only hole filling is applied (the 3D connected-component
    # step is used in volume mode)
    final = fill_holes_slicewise((prob >= 0.5)[None])[0]
    gt = np.asarray(Image.open(args.mask).convert("L")) > 0 if args.mask else None
    pm = ({k: v.float().numpy() for k, v in torch.load(POS_MEAN, weights_only=True).items()}
          if POS_MEAN.exists() else {})

    panels = [("1. Ảnh vào", raw, "gray"), ("2. Kéo giãn + đệm (ch.2-3)", canvas, "gray"),
              ("3. PCA đặc trưng DINOv3", upsample_crop(pca_rgb(feats["dinov3"][0], pm.get("dinov3")), top, left, h, w), None),
              ("4. PCA đặc trưng MRI-CORE", upsample_crop(pca_rgb(feats["mricore"][0], pm.get("mricore")), top, left, h, w), None),
              ("5. Cổng g (đỏ=DINOv3, xanh=MRI-CORE)", upsample_crop(gate[0], top, left, h, w), "coolwarm"),
              ("6. Xác suất", prob, "magma")]
    fig, axes = plt.subplots(1, 7, figsize=(21, 3.6))
    for ax, (title, im, cmap) in zip(axes, panels):
        ax.imshow(im, cmap=cmap, vmin=0 if cmap else None, vmax=1 if cmap in ("coolwarm", "magma") else None)
        ax.set_title(title, fontsize=10)
    axes[-1].imshow(raw, cmap="gray")
    axes[-1].contour(final, levels=[0.5], colors=["#1baf7a"], linewidths=1.5)
    title = "7. Ngưỡng 0.5 + lấp lỗ (ch.7)"
    if gt is not None:
        axes[-1].contour(gt, levels=[0.5], colors=["#e34948"], linewidths=1.0)
        d = all_metrics(final, gt)["dice"]
        title += f"\nDice 2D = {d:.3f} (xanh: dự đoán, đỏ: nhãn)"
    axes[-1].set_title(title, fontsize=10)
    for ax in axes:
        ax.axis("off")
    out = Path(args.out or C.FIGURES / f"demo_{Path(args.image).stem}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print(f"saved {out}")


def volume_mode(args, pipe):
    with h5py.File(args.h5, "r") as f:
        img = f["image"][:].astype(np.float32)
        gt = (f["label"][:] > 0) if "label" in f else None
    h, w, depth = img.shape
    canv = []
    for z in range(depth):
        c, top, left = pad_to_canvas(stretch(img[:, :, z]), C.CANVAS)
        canv.append(np.rint(c * 255).astype(np.uint8))
    t0 = time.time()
    prob, _, _ = pipe(np.stack(canv))
    prob = prob[:, top:top + h, left:left + w]                  # (z, h, w)
    mask = postprocess(prob >= 0.5, args.pp)
    sec = time.time() - t0
    out_dir = Path(args.out or C.FIGURES / "demo_volume")
    out_dir.mkdir(parents=True, exist_ok=True)
    np.save(out_dir / "mask_zhw.npy", mask.astype(np.uint8))
    msg = f"khối {h}x{w}x{depth}: {int(mask.sum())} voxel tâm nhĩ, {sec:.1f} s"
    if gt is not None:
        m = all_metrics(mask, np.transpose(gt, (2, 0, 1)))
        msg += f" | Dice {m['dice']:.4f}  Jaccard {m['jaccard']:.4f}  HD95 {m['hd95']:.2f} vx  ASD {m['asd']:.2f} vx"
    zs = np.linspace(0.3, 0.7, 4) * depth
    fig, axes = plt.subplots(1, 4, figsize=(14, 4))
    for ax, z in zip(axes, zs.astype(int)):
        ax.imshow(img[:, :, z], cmap="gray")
        ax.contour(mask[z], levels=[0.5], colors=["#1baf7a"], linewidths=1.5)
        if gt is not None:
            ax.contour(gt[:, :, z], levels=[0.5], colors=["#e34948"], linewidths=1.0)
        ax.set_title(f"lát z={z}")
        ax.axis("off")
    fig.suptitle(msg, fontsize=10)
    fig.tight_layout()
    fig.savefig(out_dir / "montage.png", dpi=130)
    print(msg)
    print(f"saved {out_dir}")


def main():
    if hasattr(sys.stdout, "reconfigure"):  # Windows: a redirected stdout may be cp1252
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--image")
    ap.add_argument("--mask")
    ap.add_argument("--h5")
    ap.add_argument("--ckpt", default=str(DEFAULT_CKPT))
    ap.add_argument("--pp", default="lcc_fill_close", choices=VARIANTS, help="3D post-processing (volume mode)")
    ap.add_argument("--out")
    args = ap.parse_args()
    if not (args.image or args.h5):
        ap.error("give --image or --h5")
    pipe = Pipeline(Path(args.ckpt), pick_device())
    slice_mode(args, pipe) if args.image else volume_mode(args, pipe)


if __name__ == "__main__":
    main()
