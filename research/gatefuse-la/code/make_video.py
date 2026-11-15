"""Short demo video (< 1 min): the program run on a real test volume.

Frames: title card -> sweep through the axial slices of samples/volume_*.h5
(input, learned gate, probability, result vs. reference) -> the 7-step
figure of one slice -> closing card with the metrics of this volume.
Output: results/demo_video.mp4 (needs imageio + imageio-ffmpeg).
"""
import sys
from pathlib import Path

import h5py
import imageio.v2 as imageio
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data_prep import pad_to_canvas, stretch  # noqa: E402
from demo import DEFAULT_CKPT, Pipeline, pick_device, upsample_crop  # noqa: E402
from metrics import all_metrics  # noqa: E402
from postprocess import postprocess  # noqa: E402

W, H, FPS = 1280, 720, 8


def canvas_to_frame(fig):
    fig.canvas.draw()
    frame = np.asarray(fig.canvas.buffer_rgba())[..., :3].copy()
    plt.close(fig)
    return frame


def text_card(lines, sizes):
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    fig.patch.set_facecolor("white")
    y = 0.72
    for line, size in zip(lines, sizes):
        fig.text(0.5, y, line, ha="center", va="center", fontsize=size,
                 color="#C8102E" if size >= 26 else "#0b0b0b", family="DejaVu Sans")
        y -= 0.09 if size >= 20 else 0.065
    return canvas_to_frame(fig)


def main():
    h5 = sorted((C.REPO / "samples").glob("volume_*.h5"))[0]
    with h5py.File(h5, "r") as f:
        img = f["image"][:].astype(np.float32)
        gt = np.transpose(f["label"][:] > 0, (2, 0, 1))
    h, w, depth = img.shape
    canv = []
    for z in range(depth):
        c, top, left = pad_to_canvas(stretch(img[:, :, z]), C.CANVAS)
        canv.append(np.rint(c * 255).astype(np.uint8))
    pipe = Pipeline(DEFAULT_CKPT, pick_device())
    prob, gate, _ = pipe(np.stack(canv))
    prob = prob[:, top:top + h, left:left + w]
    mask = postprocess(prob >= 0.5, "lcc_fill_close")
    m = all_metrics(mask, gt)

    frames = []
    title = text_card(["GateFuse-LA", "Phân đoạn tâm nhĩ trái trên ảnh LGE-MRI thật",
                       f"$ python code/demo.py --h5 samples/{h5.name}",
                       "DINOv3 + MRI-CORE (đông cứng) -> cổng học được -> decoder -> hậu xử lý hình thái"],
                      [34, 20, 15, 13])
    frames += [title] * (FPS * 4)

    zs = [z for z in range(depth) if gt[z].any() or mask[z].any()]
    zs = list(range(max(0, zs[0] - 3), min(depth, zs[-1] + 4)))
    for z in zs:
        fig, axes = plt.subplots(1, 4, figsize=(W / 100, H / 100), dpi=100)
        g = upsample_crop(gate[z], top, left, h, w)
        axes[0].imshow(img[:, :, z], cmap="gray")
        axes[0].set_title("1. Ảnh LGE-MRI", fontsize=12)
        axes[1].imshow(g, cmap="coolwarm", vmin=0, vmax=1)
        axes[1].set_title("2. Cổng g\n(đỏ: DINOv3, xanh: MRI-CORE)", fontsize=12)
        axes[2].imshow(prob[z], cmap="magma", vmin=0, vmax=1)
        axes[2].set_title("3. Xác suất tâm nhĩ", fontsize=12)
        axes[3].imshow(img[:, :, z], cmap="gray")
        if gt[z].any():
            axes[3].contour(gt[z], levels=[0.5], colors=["#e34948"], linewidths=1.2)
        if mask[z].any():
            axes[3].contour(mask[z], levels=[0.5], colors=["#1baf7a"], linewidths=1.6)
        axes[3].set_title("4. Kết quả (xanh) vs nhãn (đỏ)", fontsize=12)
        for ax in axes:
            ax.axis("off")
        fig.suptitle(f"Ca test {h5.stem.split('_')[1]} - lát {z}/{depth - 1}", fontsize=14)
        fig.tight_layout()
        frames += [canvas_to_frame(fig)] * 2          # 4 slices per second

    steps = C.FIGURES / "demo_UPT6DX9I_z52_img.png"
    if steps.exists():
        im = imageio.imread(steps)[..., :3]
        fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
        ax = fig.add_axes([0.01, 0.2, 0.98, 0.6])
        ax.imshow(im)
        ax.axis("off")
        fig.text(0.5, 0.88, "7 bước của pipeline trên một lát", ha="center", fontsize=20, color="#C8102E")
        frames += [canvas_to_frame(fig)] * (FPS * 5)

    end = text_card(["Kết quả trên khối này",
                     f"Dice {m['dice']:.3f}   Jaccard {m['jaccard']:.3f}   HD95 {m['hd95']:.2f} vx   ASD {m['asd']:.2f} vx"],
                    [30, 18])
    frames += [end] * (FPS * 4)

    out = C.RESULTS / "demo_video.mp4"
    imageio.mimsave(out, [f[:H - H % 2, :W - W % 2] for f in frames], fps=FPS, macro_block_size=1)
    print(f"saved {out}: {len(frames)} frames, {len(frames) / FPS:.0f} s; Dice {m['dice']:.4f}")


if __name__ == "__main__":
    main()
