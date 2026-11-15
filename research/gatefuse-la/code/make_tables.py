"""Turn the evaluation CSVs into LaTeX tables (report + slides) and a
numbers.tex file of \\newcommand macros, so every number quoted in the text
comes from the same source as the tables. Also writes a Markdown copy of the
main table for the README.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

NAME = {"classical": "Cổ điển (Otsu + hình thái)", "unet": "U-Net 2D (từ đầu)", "dinov3": "A: DINOv3",
        "mricore": "B: MRI-CORE", "concat": "C: Ghép nối", "gate": r"\textbf{D: GateFuse (đề xuất)}",
        "gatedge": r"\textbf{D+: GateFuse + nhánh Sobel}"}
SHORT = {"classical": "Cổ điển", "unet": "U-Net", "dinov3": "DINOv3", "mricore": "MRI-CORE",
         "concat": "Ghép nối", "gate": "GateFuse", "gatedge": "D+"}
ORDER = ["classical", "unet", "dinov3", "mricore", "concat", "gate", "gatedge"]
PP_NAME = {"raw": "Ngưỡng 0{,}5", "lcc": "+ TPLT lớn nhất", "lcc_fill": "+ lấp lỗ", "lcc_fill_close": "+ đóng"}
MODELS_EA = ["unet", "dinov3", "mricore", "concat", "gate", "gatedge"]
MACRO_MODEL = {"classical": "Classical", "unet": "Unet", "dinov3": "Dino", "mricore": "Mri",
               "concat": "Concat", "gate": "Gate", "gatedge": "GateEdge"}


def vn(x) -> str:
    """Vietnamese decimal comma; {,} keeps LaTeX from adding space in math mode."""
    return str(x).replace(".", "{,}")


def pval(p) -> str:
    """Relation + value, used as $p\\P...$ in the text: '{=}0{,}036' or '{<}0{,}001'."""
    return "{<}0{,}001" if p < 1e-3 else "{=}" + vn(f"{p:.3f}")


def fmt(mean, std, nd=3):
    if pd.isna(std):
        return vn(f"{mean:.{nd}f}")
    return vn(f"{mean:.{nd}f}") + "{\\scriptsize$\\pm$" + vn(f"{std:.{nd}f}") + "}"


def row(summary, model, labels, pp="raw", split="test"):
    lab = "none" if model == "classical" else labels
    r = summary[(summary.model == model) & (summary.labels == lab) & (summary.pp == pp) & (summary.split == split)]
    return None if r.empty else r.iloc[0]


def results_table(summary, eff, labels, models):
    best = {}
    rows = {m: row(summary, m, labels) for m in models}
    rows = {m: r for m, r in rows.items() if r is not None}
    if not rows:
        return r"\textit{(chưa có kết quả)}"
    for k, better in (("dice", max), ("jaccard", max), ("hd95", min), ("asd", min), ("vol_err", min)):
        best[k] = better(r[f"{k}_mean"] for r in rows.values())
    lines = [r"\begin{tabular}{lrccccc}", r"\toprule",
             r"Phương pháp & Tham số học & Dice $\uparrow$ & Jaccard $\uparrow$ & HD95 (vx) $\downarrow$ & ASD (vx) $\downarrow$ & $|\Delta V|$ (\%) $\downarrow$\\",
             r"\midrule"]
    for m, r in rows.items():
        e = eff[(eff.model == m) & (eff.labels == labels)]
        params = "0" if m == "classical" else (vn(f"{e.n_params.iloc[0] / 1e6:.2f}") + "\\,M" if not e.empty else "--")
        cells = []
        for k, nd in (("dice", 3), ("jaccard", 3), ("hd95", 2), ("asd", 2), ("vol_err", 1)):
            s = fmt(r[f"{k}_mean"], r[f"{k}_std"], nd)
            if np.isclose(r[f"{k}_mean"], best[k]):
                s = r"\textbf{" + s + "}"
            cells.append(s)
        lines.append(f"{NAME[m]} & {params} & " + " & ".join(cells) + r"\\")
    lines += [r"\bottomrule", r"\end{tabular}"]
    return "\n".join(lines)


def pp_table(summary):
    models = ["unet", "dinov3", "mricore", "concat", "gate", "gatedge"]
    lines = [r"\begin{tabular}{l" + "cc" * len(models) + "}", r"\toprule",
             "Hậu xử lý & " + " & ".join(rf"\multicolumn{{2}}{{c}}{{{SHORT[m]}}}" for m in models) + r"\\",
             " & " + " & ".join(["Dice & HD95"] * len(models)) + r"\\", r"\midrule"]
    for pp, name in PP_NAME.items():
        cells = []
        for m in models:
            r = row(summary, m, "full", pp)
            cells += ["--", "--"] if r is None else [vn(f"{r.dice_mean:.3f}"), vn(f"{r.hd95_mean:.2f}")]
        lines.append(f"{name} & " + " & ".join(cells) + r"\\")
    lines += [r"\bottomrule", r"\end{tabular}"]
    return "\n".join(lines)


def pp_table_slide(summary):
    """Compact slide version: HD95 (voxel) after each post-processing step."""
    models = ["unet", "dinov3", "mricore", "concat", "gate", "gatedge"]
    lines = [r"\begin{tabular}{l" + "c" * len(models) + "}", r"\toprule",
             r"HD95 (voxel) & " + " & ".join(SHORT[m] for m in models) + r"\\", r"\midrule"]
    for pp, name in PP_NAME.items():
        cells = []
        for m in models:
            r = row(summary, m, "full", pp)
            cells.append("--" if r is None else vn(f"{r.hd95_mean:.2f}"))
        lines.append(f"{name} & " + " & ".join(cells) + r"\\")
    lines += [r"\bottomrule", r"\end{tabular}"]
    return "\n".join(lines)


def wilcoxon_table(w):
    """One row per pair; full-label and few-label tests side by side."""
    pairs = [("mricore", "dinov3"), ("concat", "dinov3"), ("gate", "dinov3"), ("gate", "mricore"),
             ("gate", "concat"), ("gatedge", "gate"), ("gate", "unet"), ("gatedge", "unet")]
    lines = [r"\begin{tabular}{lrrrrrr}", r"\toprule",
             r" & \multicolumn{3}{c}{72 khối có nhãn} & \multicolumn{3}{c}{8 khối có nhãn}\\",
             r"\cmidrule(lr){2-4}\cmidrule(lr){5-7}",
             r"So sánh & $\Delta$Dice & thắng & $p$ & $\Delta$Dice & thắng & $p$\\", r"\midrule"]
    for a, b in pairs:
        cells = []
        for labels in ("full", "few"):
            r = w[(w.a == a) & (w.b == b) & (w.labels == labels)]
            if r.empty:
                cells += ["--", "--", "--"]
                continue
            r = r.iloc[0]
            p = "$<$0{,}001" if r.p_value < 1e-3 else vn(f"{r.p_value:.3f}")
            if r.p_value < 0.05:
                p = r"\textbf{" + p + "}"
            cells += [vn(f"{r.mean_diff:+.4f}"), f"{int(r.a_better)}/{int(r.n)}", p]
        lines.append(f"{SHORT[a]} vs {SHORT[b]} & " + " & ".join(cells) + r"\\")
    lines += [r"\bottomrule", r"\end{tabular}"]
    return "\n".join(lines)


def macros(summary, eff, w, gate_regions, classical):
    out = []

    def nc(name, val):
        out.append(f"\\newcommand{{\\{name}}}{{{vn(val)}}}")

    for m in ORDER:
        for labels, tag in (("full", "Full"), ("few", "Few")):
            if m == "classical" and labels == "few":
                continue
            r = row(summary, m, labels)
            if r is None:
                continue
            for k, nd, mk in (("dice", 3, "Dice"), ("jaccard", 3, "Jac"), ("hd95", 2, "Hd"), ("asd", 2, "Asd"),
                              ("vol_err", 1, "Vol")):
                nc(f"{mk}{MACRO_MODEL[m]}{tag}", f"{r[f'{k}_mean']:.{nd}f}")
            if not pd.isna(r.dice_std):
                nc(f"DiceSd{MACRO_MODEL[m]}{tag}", f"{r.dice_std:.3f}")
    # final pipeline = chosen post-processing (best on validation for every model)
    for m in ORDER[1:]:
        for labels, tag in (("full", "Full"), ("few", "Few")):
            r = row(summary, m, labels, pp="lcc_fill_close")
            if r is not None:
                nc(f"DicePp{MACRO_MODEL[m]}{tag}", f"{r.dice_mean:.3f}")
                nc(f"HdPp{MACRO_MODEL[m]}{tag}", f"{r.hd95_mean:.2f}")
                nc(f"VolPp{MACRO_MODEL[m]}{tag}", f"{r.vol_err_mean:.1f}")
    for _, r in w.iterrows():
        tag = "Full" if r.labels == "full" else "Few"
        key = f"{MACRO_MODEL[r.a]}Vs{MACRO_MODEL[r.b]}{tag}"
        out.append(f"\\newcommand{{\\P{key}}}{{{pval(r.p_value)}}}")
        nc(f"Win{key}", f"{int(r.a_better)}/{int(r.n)}")
        nc(f"Diff{key}", f"{r.mean_diff:+.3f}")
    for k, v in gate_regions.items():
        nc(f"Gate{k.capitalize()}", f"{v:.3f}")
    nc("ClassicalSigma", f"{classical['sigma']:g}")
    nc("ClassicalK", f"{classical['k']:g}")
    nc("ClassicalR", f"{classical['r']}")
    for m in ("unet", "dinov3", "gate", "gatedge"):
        e = eff[(eff.model == m) & (eff.labels == "full")]
        if not e.empty:
            nc(f"Params{MACRO_MODEL[m]}", f"{e.n_params.iloc[0] / 1e6:.2f}")
    bm_path = C.TABLES / "benchmark.csv"
    if bm_path.exists():
        bm = pd.read_csv(bm_path).set_index("model")
        for m in ("dinov3", "gate", "gatedge", "unet"):
            nc(f"TrainMs{MACRO_MODEL[m]}", f"{bm.loc[m, 'train_ms_per_iter']:.0f}")
        nc("InferGate", f"{bm.loc['gate', 'infer_s_per_volume']:.1f}")
        nc("InferUnet", f"{bm.loc['unet', 'infer_s_per_volume']:.1f}")
    ea_path = C.TABLES / "error_analysis.csv"
    if ea_path.exists():
        ea = pd.read_csv(ea_path, index_col=0)
        nc("ErrBand", f"{100 * ea.loc[MODELS_EA, 'frac_boundary'].mean():.0f}")
        nc("ErrEnds", f"{100 * ea.loc[MODELS_EA, 'frac_ends'].mean():.0f}")
        nc("RefBand", f"{100 * ea.loc['reference_share', 'frac_boundary']:.0f}")
        nc("RefEnds", f"{100 * ea.loc['reference_share', 'frac_ends']:.0f}")
    for pp in ("raw", "lcc", "lcc_fill", "lcc_fill_close"):
        r = row(summary, "gate", "full", pp)
        if r is not None:
            tag = pp.replace("_", " ").title().replace(" ", "")
            nc(f"GatePp{tag}Dice", f"{r.dice_mean:.3f}")
            nc(f"GatePp{tag}Hd", f"{r.hd95_mean:.2f}")
    return "\n".join(out) + "\n"


def markdown(summary, labels, models):
    lines = ["| Method | Dice | Jaccard | HD95 (vox) | ASD (vox) |", "|---|---|---|---|---|"]
    for m in models:
        r = row(summary, m, labels)
        if r is None:
            continue
        sd = "" if pd.isna(r.dice_std) else f" ± {r.dice_std:.3f}"
        lines.append(f"| {SHORT[m]} | {r.dice_mean:.3f}{sd} | {r.jaccard_mean:.3f} | {r.hd95_mean:.2f} | {r.asd_mean:.2f} |")
    return "\n".join(lines) + "\n"


def main():
    summary = pd.read_csv(C.TABLES / "summary.csv")
    eff = pd.read_csv(C.TABLES / "efficiency.csv")
    w = pd.read_csv(C.TABLES / "wilcoxon.csv")
    gate_regions = json.loads((C.TABLES / "gate_regions.json").read_text())
    classical = json.loads((C.RUN_DIR / "classical" / "params.json").read_text())
    (C.TABLES / "main_table.tex").write_text(results_table(summary, eff, "full", ORDER))
    (C.TABLES / "few_table.tex").write_text(results_table(summary, eff, "few", ORDER[1:]))
    (C.TABLES / "pp_table.tex").write_text(pp_table(summary))
    (C.TABLES / "pp_table_slide.tex").write_text(pp_table_slide(summary))
    (C.TABLES / "wilcoxon_table.tex").write_text(wilcoxon_table(w))
    (C.TABLES / "numbers.tex").write_text(macros(summary, eff, w, gate_regions, classical))
    (C.TABLES / "main_table.md").write_text("72 training volumes\n\n" + markdown(summary, "full", ORDER) +
                                            "\n8 training volumes\n\n" + markdown(summary, "few", ORDER[1:]))
    print((C.TABLES / "main_table.md").read_text())


if __name__ == "__main__":
    main()
