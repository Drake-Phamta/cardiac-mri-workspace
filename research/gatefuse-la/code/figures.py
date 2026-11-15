"""Step 6 - figures for the report and the slides (results/figures/*.pdf|png).

Colours: validated categorical palette, one fixed colour per method, in the
same order everywhere; method names are always printed next to the marks.
"""
import json
import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
import torch
from scipy import ndimage

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from data import crop_volume, gt_volume, image_volume, load_meta, load_splits, open_arrays, volume_index  # noqa: E402

ORDER = ["classical", "unet", "dinov3", "mricore", "concat", "gate", "gatedge"]
COLOR = dict(zip(ORDER, ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"]))
NAME = {"classical": "Cổ điển", "unet": "U-Net", "dinov3": "A: DINOv3", "mricore": "B: MRI-CORE",
        "concat": "C: Ghép nối", "gate": "D: GateFuse", "gatedge": "D+: +Sobel"}
TICK = {"classical": "Cổ điển", "unet": "U-Net", "dinov3": "A\nDINOv3", "mricore": "B\nMRI-CORE",
        "concat": "C\nGhép nối", "gate": "D\nGateFuse", "gatedge": "D+\n+Sobel"}
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e1e0d9"
GT_COL, PRED_COL = "#e34948", "#1baf7a"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "figure.facecolor": "white", "axes.facecolor": "white", "savefig.bbox": "tight"})


def save(fig, name):
    C.FIGURES.mkdir(parents=True, exist_ok=True)
    for ext in ("pdf", "png"):
        fig.savefig(C.FIGURES / f"{name}.{ext}", dpi=200)
    plt.close(fig)
    print("saved", name)


def load_pred(model, labels, seed, split="test"):
    run = C.RUN_DIR / ("classical" if model == "classical" else f"{model}_{labels}_s{seed}")
    return np.load(run / f"pred_{split}.npz")


# ---------------------------------------------------------------- charts
def fig_boxplot(per_case):
    t = per_case[(per_case.split == "test") & (per_case.pp == "raw")]
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.4), sharey=True, gridspec_kw=dict(width_ratios=[7, 6]))
    for ax, labels, title in ((axes[0], "full", "72 khối có nhãn"), (axes[1], "few", "8 khối có nhãn (10%)")):
        models = [m for m in ORDER if (m == "classical" and labels == "full") or
                  ((t.model == m) & (t.labels == labels)).any()]
        if not models:
            ax.set_visible(False)
            continue
        data = []
        for m in models:
            sub = t[t.model == m] if m == "classical" else t[(t.model == m) & (t.labels == labels)]
            data.append(sub.groupby("vol").dice.mean().to_numpy())
        bp = ax.boxplot(data, widths=0.55, patch_artist=True, showfliers=False,
                        medianprops=dict(color=INK, linewidth=1.2), whiskerprops=dict(color=INK2),
                        capprops=dict(color=INK2))
        for patch, m in zip(bp["boxes"], models):
            patch.set(facecolor=COLOR[m], alpha=0.85, edgecolor="white", linewidth=1.5)
        rng = np.random.default_rng(0)
        for i, d in enumerate(data, start=1):
            ax.scatter(i + rng.uniform(-0.12, 0.12, len(d)), d, s=9, color=INK, alpha=0.55, zorder=3, linewidths=0)
            ax.text(i, 1.005, f"{np.mean(d):.3f}", ha="center", va="bottom", fontsize=8, color=INK)
        ax.set_xticks(range(1, len(models) + 1), [TICK[m] for m in models], rotation=0, fontsize=8)
        ax.set_title(title, fontsize=10, color=INK)
        ax.grid(axis="x", visible=False)
    axes[0].set_ylabel("Dice 3D trên tập test (mỗi điểm = 1 ca)")
    axes[0].set_ylim(0.2, 1.04)
    save(fig, "dice_boxplot")


def fig_label_efficiency(summary):
    """Dumbbell chart: Dice with 8 vs 72 labelled volumes for each configuration."""
    s = summary[(summary.split == "test") & (summary.pp == "raw") & (summary.labels.isin(["full", "few"]))]
    models = [m for m in ORDER if m != "classical" and
              all(((s.model == m) & (s.labels == lab)).any() for lab in ("full", "few"))]
    if not models:
        print("label efficiency: no complete model yet")
        return
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    for i, m in enumerate(models[::-1]):
        few = s[(s.model == m) & (s.labels == "few")].iloc[0]
        full = s[(s.model == m) & (s.labels == "full")].iloc[0]
        ax.plot([few.dice_mean, full.dice_mean], [i, i], color="#c3c2b7", lw=2, zorder=1)
        ax.errorbar(few.dice_mean, i, xerr=few.dice_std, fmt="o", ms=7, mfc="white", mec=COLOR[m], mew=2,
                    ecolor=INK2, elinewidth=0.8, capsize=2, zorder=3)
        ax.errorbar(full.dice_mean, i, xerr=full.dice_std, fmt="o", ms=7, color=COLOR[m],
                    ecolor=INK2, elinewidth=0.8, capsize=2, zorder=3)
        ax.text(few.dice_mean, i + 0.2, f"{few.dice_mean:.3f}", ha="center", va="bottom", fontsize=7.5, color=INK)
        ax.text(full.dice_mean, i + 0.2, f"{full.dice_mean:.3f}", ha="center", va="bottom", fontsize=7.5, color=INK)
    ax.set_yticks(range(len(models)), [NAME[m] for m in models[::-1]], fontsize=8)
    ax.set_ylim(-0.5, len(models) - 0.3)
    ax.set_xlabel("Dice 3D trên test (TB ± ĐLC qua 3 seed)")
    ax.set_xlim(0.80, 0.935)
    ax.grid(axis="y", visible=False)
    from matplotlib.lines import Line2D
    handles = [Line2D([], [], marker="o", ls="", ms=7, mfc="white", mec="#52514e", mew=2, label="8 khối có nhãn"),
               Line2D([], [], marker="o", ls="", ms=7, color="#52514e", label="72 khối có nhãn")]
    ax.legend(handles=handles, fontsize=8, frameon=False, loc="lower left", bbox_to_anchor=(0.0, 1.0), ncol=2)
    save(fig, "label_efficiency")


def fig_curves():
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    for m in ["unet", "dinov3", "mricore", "concat", "gate", "gatedge"]:
        hp = C.RUN_DIR / f"{m}_full_s0" / "history.csv"
        if not hp.exists():
            continue
        h = pd.read_csv(hp)
        ax.plot(h["iter"], h["val_dice"], color=COLOR[m], lw=2, label=NAME[m])
        ax.text(h["iter"].iloc[-1] + 60, h["val_dice"].iloc[-1], NAME[m], fontsize=7, color=INK2, va="center")
    ax.set_xlabel("Vòng lặp huấn luyện")
    ax.set_ylabel("Dice 3D tập validation")
    ax.legend(fontsize=7, frameon=False, loc="lower right")
    save(fig, "val_curves")


# ---------------------------------------------------------------- image panels
def contour(ax, mask, color, lw):
    if mask.any():
        ax.contour(mask.astype(float), levels=[0.5], colors=[color], linewidths=lw)


def pick_cases(per_case):
    t = per_case[(per_case.split == "test") & (per_case.pp == "raw") & (per_case.labels.isin(["full", "none"]))]
    case = t.groupby(["model", "vol"]).dice.mean().unstack(0)
    gate = case["gate"].sort_values()
    median_vol = gate.index[len(gate) // 2]
    worst_vol = gate.index[0]
    gain = case["gate"] - case[["dinov3", "mricore"]].max(axis=1)
    gain_vol = gain.drop([median_vol, worst_vol]).idxmax()
    return [("Ca trung vị", median_vol), ("Ca GateFuse lợi nhất", gain_vol), ("Ca khó nhất", worst_vol)], case


def fig_qualitative(per_case):
    meta, splits = load_meta(), load_splits()
    images, labels, _ = open_arrays()
    cases, case_dice = pick_cases(per_case)
    preds = {m: load_pred(m, "full", 0) for m in ORDER}
    fig, axes = plt.subplots(len(cases), len(ORDER) + 1, figsize=(2.0 * (len(ORDER) + 1), 2.15 * len(cases)))
    for r, (title, vol) in enumerate(cases):
        img = image_volume(meta, images, vol)
        gt = gt_volume(meta, labels, vol)
        z = int(np.argmax(gt.sum(axis=(1, 2))))
        axes[r, 0].imshow(img[z], cmap="gray")
        contour(axes[r, 0], gt[z], GT_COL, 1.2)
        axes[r, 0].set_title(f"{title}\nnhãn (đỏ), lát {z}", fontsize=8)
        for c, m in enumerate(ORDER, start=1):
            p = preds[m][vol] >= 128
            ax = axes[r, c]
            ax.imshow(img[z], cmap="gray")
            contour(ax, gt[z], GT_COL, 0.9)
            contour(ax, p[z], PRED_COL, 1.2)
            ax.set_title(f"{NAME[m]}\nDice khối {case_dice.loc[vol, m]:.3f}", fontsize=8)
    for ax in axes.ravel():
        ax.axis("off")
    fig.tight_layout(h_pad=0.6, w_pad=0.3)
    save(fig, "qualitative")
    return cases


def fig_qualitative_slide(cases, per_case):
    """Larger, slide-sized version: 2 cases x 6 panels."""
    meta, splits = load_meta(), load_splits()
    images, labels, _ = open_arrays()
    _, case_dice = pick_cases(per_case)
    models = ["classical", "unet", "mricore", "gate", "gatedge"]
    preds = {m: load_pred(m, "full", 0) for m in models}
    rows = [cases[0], cases[-1]]
    fig, axes = plt.subplots(len(rows), len(models) + 1, figsize=(2.3 * (len(models) + 1), 2.6 * len(rows)))
    for r, (title, vol) in enumerate(rows):
        img, gt = image_volume(meta, images, vol), gt_volume(meta, labels, vol)
        z = int(np.argmax(gt.sum(axis=(1, 2))))
        axes[r, 0].imshow(img[z], cmap="gray")
        contour(axes[r, 0], gt[z], GT_COL, 1.4)
        axes[r, 0].set_title(f"{title}\nnhãn (đỏ)", fontsize=10)
        for c, m in enumerate(models, start=1):
            ax = axes[r, c]
            ax.imshow(img[z], cmap="gray")
            contour(ax, gt[z], GT_COL, 1.0)
            contour(ax, (preds[m][vol] >= 128)[z], PRED_COL, 1.5)
            ax.set_title(f"{NAME[m]}\nDice {case_dice.loc[vol, m]:.3f}", fontsize=10)
    for ax in axes.ravel():
        ax.axis("off")
    fig.tight_layout(h_pad=0.8, w_pad=0.3)
    save(fig, "qualitative_slide")


def upsample_grid(g):
    t = torch.from_numpy(g.astype(np.float32))[:, None]
    return torch.nn.functional.interpolate(t, size=(C.CANVAS, C.CANVAS), mode="bilinear", align_corners=False)[:, 0].numpy()


def gate_region_stats():
    """Mean gate value in anatomical bands around the reference atrium (test set, 3 seeds)."""
    meta, splits = load_meta(), load_splits()
    _, labels, _ = open_arrays()
    sums = {k: [0.0, 0] for k in ("inside", "boundary", "near", "far")}
    for seed in C.SEEDS:
        path = C.RUN_DIR / f"gate_full_s{seed}" / "gate_test.npz"
        if not path.exists():
            continue
        gates = np.load(path)
        for vol in splits["test"]:
            idx = volume_index(meta, vol)
            g = crop_volume(upsample_grid(gates[vol]), meta.loc[idx[0]])
            gt = gt_volume(meta, labels, vol)
            st = ndimage.generate_binary_structure(3, 1)
            d3, e3 = ndimage.binary_dilation(gt, st, 3), ndimage.binary_erosion(gt, st, 3)
            d15 = ndimage.binary_dilation(gt, st, 15)
            regions = {"inside": e3, "boundary": d3 & ~e3, "near": d15 & ~d3, "far": ~d15}
            for k, m in regions.items():
                sums[k][0] += float(g[m].sum())
                sums[k][1] += int(m.sum())
    return {k: (s / n if n else float("nan")) for k, (s, n) in sums.items()}


def fig_gate(cases):
    meta, splits = load_meta(), load_splits()
    images, labels, _ = open_arrays()
    gates = np.load(C.RUN_DIR / "gate_full_s0" / "gate_test.npz")
    fig, axes = plt.subplots(2, len(cases), figsize=(3.0 * len(cases), 5.6))
    for c, (title, vol) in enumerate(cases):
        idx = volume_index(meta, vol)
        img, gt = image_volume(meta, images, vol), gt_volume(meta, labels, vol)
        g = crop_volume(upsample_grid(gates[vol]), meta.loc[idx[0]])
        z = int(np.argmax(gt.sum(axis=(1, 2))))
        axes[0, c].imshow(img[z], cmap="gray")
        contour(axes[0, c], gt[z], GT_COL, 1.2)
        axes[0, c].set_title(f"{title} (lát {z})", fontsize=9)
        im = axes[1, c].imshow(g[z], cmap="coolwarm", vmin=0, vmax=1)
        contour(axes[1, c], gt[z], INK, 1.0)
        axes[1, c].set_title("cổng g: đỏ→DINOv3, xanh→MRI-CORE", fontsize=8)
    for ax in axes.ravel():
        ax.axis("off")
    cb = fig.colorbar(im, ax=axes[1, :].tolist(), fraction=0.025, pad=0.02)
    cb.set_label("g (trọng số của DINOv3)", fontsize=8)
    save(fig, "gate_maps")

    stats = gate_region_stats()
    (C.TABLES / "gate_regions.json").write_text(json.dumps(stats, indent=1))
    names = {"inside": "trong tâm nhĩ", "boundary": "dải biên ±3 vx", "near": "nền gần (3–15 vx)", "far": "nền xa"}
    fig, ax = plt.subplots(figsize=(5.2, 2.6))
    keys = list(names)
    vals = [stats[k] for k in keys]
    bars = ax.bar(range(len(keys)), vals, 0.6, color="#8a8a86", edgecolor="white")
    ax.axhline(0.5, color=INK2, lw=0.8, ls="--")
    ax.text(len(keys) - 0.5, 0.505, "g = 0.5 (cân bằng)", fontsize=7, color=INK2, ha="right", va="bottom")
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.01, f"{v:.3f}", ha="center", fontsize=8, color=INK)
    ax.set_xticks(range(len(keys)), [names[k] for k in keys], fontsize=8)
    ax.set_ylabel("g trung bình (→1: DINOv3)")
    ax.set_ylim(0, 1)
    ax.grid(axis="x", visible=False)
    save(fig, "gate_regions")
    return stats


def fig_pca():
    """What each frozen encoder 'sees': first 3 PCA components of the patch tokens.

    The mean token of every grid position (600 random training slices) is
    subtracted first; otherwise the leading components only encode position.
    """
    meta, splits = load_meta(), load_splits()
    images, labels, feats = open_arrays(C.ENCODERS)
    train_idx = meta.index[meta.split == "train"].to_numpy()
    sub = np.sort(np.random.default_rng(0).choice(train_idx, 600, replace=False))
    pos_mean = {e: np.asarray(feats[e][sub]).astype(np.float32).mean(0) for e in C.ENCODERS}
    # also used by demo.py (no access to the cached features on other machines)
    (C.RESULTS / "checkpoints").mkdir(parents=True, exist_ok=True)
    torch.save({e: torch.from_numpy(v).half() for e, v in pos_mean.items()},
               C.RESULTS / "checkpoints" / "feature_pos_mean.pt")
    vols = splits["test"][:3]
    fig, axes = plt.subplots(len(vols), 3, figsize=(7.2, 2.5 * len(vols)))
    for r, vol in enumerate(vols):
        idx = volume_index(meta, vol)
        gt = gt_volume(meta, labels, vol)
        z = int(np.argmax(gt.sum(axis=(1, 2))))
        row = meta.loc[idx[0]]
        img = image_volume(meta, images, vol)[z]
        axes[r, 0].imshow(img, cmap="gray")
        contour(axes[r, 0], gt[z], GT_COL, 1.0)
        for c, e in enumerate(C.ENCODERS, start=1):
            f = (np.asarray(feats[e][idx[z]]).astype(np.float32) - pos_mean[e])
            f = f.reshape(C.FEAT_DIM, -1).T.astype(np.float64)
            f -= f.mean(0)
            _, _, vt = np.linalg.svd(f, full_matrices=False)
            p = f @ vt[:3].T
            lo, hi = np.percentile(p, 2, axis=0), np.percentile(p, 98, axis=0)
            p = np.clip((p - lo) / (hi - lo + 1e-8), 0, 1)
            rgb = upsample_grid(p.T.reshape(3, C.GRID, C.GRID))
            rgb = rgb[:, int(row.top):int(row.top) + int(row.h), int(row.left):int(row.left) + int(row.w)]
            axes[r, c].imshow(np.clip(np.transpose(rgb, (1, 2, 0)), 0, 1))
            contour(axes[r, c], gt[z], "white", 0.8)
        axes[r, 0].set_title("Ảnh + nhãn" if r == 0 else "", fontsize=9)
        axes[r, 1].set_title("PCA đặc trưng DINOv3" if r == 0 else "", fontsize=9)
        axes[r, 2].set_title("PCA đặc trưng MRI-CORE" if r == 0 else "", fontsize=9)
    for ax in axes.ravel():
        ax.axis("off")
    fig.tight_layout()
    save(fig, "feature_pca")


def fig_classical_radius():
    """Chapter-7 trade-off: Dice of the classical pipeline vs the opening radius."""
    g = pd.read_csv(C.TABLES / "classical_grid_all.csv")
    best = g.groupby("r").dice.max()
    fig, ax = plt.subplots(figsize=(4.6, 2.6))
    ax.plot(best.index, best.values, color=COLOR["classical"], lw=2, marker="o", ms=4)
    r_opt = int(best.idxmax())
    ax.annotate(f"tối ưu r = {r_opt}\nDice = {best.max():.3f}", (r_opt, best.max()), xytext=(r_opt - 15, best.max() - 0.03),
                fontsize=8, color=INK, arrowprops=dict(arrowstyle="-", color=INK2, lw=0.8))
    ax.annotate("phép mở xoá cả tâm nhĩ", (best.index[-1], best.values[-1]), xytext=(best.index[-1] - 15, best.values[-1] + 0.03),
                fontsize=8, color=INK, arrowprops=dict(arrowstyle="-", color=INK2, lw=0.8))
    ax.set_xlabel("bán kính phần tử cấu trúc của phép mở r (voxel)")
    ax.set_ylabel("Dice tốt nhất (24 khối dò)")
    save(fig, "classical_radius")


def fig_data_examples():
    """Four test patients: the atrium (red) touches vessels and chambers of similar brightness."""
    meta, splits = load_meta(), load_splits()
    images, labels, _ = open_arrays()
    vols = splits["test"][4:8]
    fig, axes = plt.subplots(1, len(vols), figsize=(2.6 * len(vols), 2.6))
    for ax, vol in zip(axes, vols):
        img, gt = image_volume(meta, images, vol), gt_volume(meta, labels, vol)
        z = int(np.argmax(gt.sum(axis=(1, 2))))
        ax.imshow(img[z], cmap="gray")
        contour(ax, gt[z], GT_COL, 1.2)
        ax.set_title(f"ca {vol[:6]}, lát {z}", fontsize=8)
        ax.axis("off")
    fig.tight_layout()
    save(fig, "data_examples")


def main():
    per_case = pd.read_csv(C.TABLES / "per_case.csv")
    summary = pd.read_csv(C.TABLES / "summary.csv")
    fig_data_examples()
    fig_classical_radius()
    fig_boxplot(per_case)
    fig_label_efficiency(summary)
    fig_curves()
    fig_pca()
    cases = fig_qualitative(per_case)
    fig_qualitative_slide(cases, per_case)
    stats = fig_gate(cases)
    print("gate regions", stats)


if __name__ == "__main__":
    main()
