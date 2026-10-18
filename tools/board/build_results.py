#!/usr/bin/env python3
"""
Render the public results page (docs/results/holdout-day39.html) from management/day39/results_aggregate.json.

Aggregates only (means, CIs, medians, quartiles, paired deltas); no per-case value is published. Charts are inline
SVG with a <title> on every mark (hover text) and each chart has a table with the same numbers.

USAGE
    python tools/board/build_results.py
"""

from __future__ import annotations

import html
import json

from build_rebaseline import ROOT, page, inline

REPO = "https://github.com/Drake-Phamta/cardiac-mri-workspace"
SRC = ROOT / "management" / "day39" / "results_aggregate.json"
OUT = ROOT / "docs" / "results" / "holdout-day39.html"
LABEL = {"EXP-D-025": "DINOv2 25 %", "EXP-D-050": "DINOv2 50 %", "EXP-D-100": "DINOv2 100 %", "EXP-D-PP": "100 % + PP-4"}
CSS = """
.chart { width: 100%; height: auto; display: block; margin: 8px 0 4px; }
.chart text { font-family: var(--font-mono, monospace); font-size: 12px; fill: var(--muted); }
.chart .lbl { fill: var(--fg); font-size: 12.5px; }
.chart .grid { stroke: var(--rule); stroke-width: 1; }
.chart .s1 { fill: #2a78d6; stroke: #2a78d6; }
.chart .s2 { fill: #eb6834; stroke: #eb6834; }
.chart .ref { fill: var(--muted); }
.chart .band { fill: #2a78d6; opacity: .16; stroke: none; }
.chart .ln { fill: none !important; stroke-width: 2; }
@media (prefers-color-scheme: dark) { .chart .s1 { fill: #3987e5; stroke: #3987e5; } .chart .s2 { fill: #d95926; stroke: #d95926; } }
.legend2 { display: flex; gap: 16px; font-size: 13px; color: var(--muted); margin: 0; padding: 0; list-style: none; }
.legend2 i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
"""


def f3(x):
    return f"{x:.3f}".replace(".", ",")


def dot_whisker(runs) -> str:
    w, h, left, right, top, row = 760, 40 + 46 * len(runs), 150, 60, 20, 46
    lo, hi = 0.45, 0.75
    sx = lambda v: left + (v - lo) / (hi - lo) * (w - left - right)
    parts = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="Dice 3D trung bình và CI 95 % theo run">']
    for t in (0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75):
        x = sx(t)
        parts.append(f'<line class="grid" x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{h - 22}"/>'
                     f'<text x="{x:.1f}" y="{h - 6}" text-anchor="middle">{f3(t)[:4]}</text>')
    for i, r in enumerate(runs):
        y = top + 22 + i * row
        cls = "s2" if r["experiment_id"] == "EXP-D-PP" else "s1"
        a, b = r["dice_ci95"]
        tip = (f'{LABEL[r["experiment_id"]]}: trung bình {f3(r["dice_mean"])}, CI 95 % [{f3(a)}; {f3(b)}], '
               f'trung vị {f3(r["dice_median"])}, n = 54')
        parts.append(f'<g><title>{html.escape(tip)}</title>'
                     f'<text class="lbl" x="{left - 12}" y="{y + 4}" text-anchor="end">{LABEL[r["experiment_id"]]}</text>'
                     f'<line class="{cls}" x1="{sx(a):.1f}" y1="{y}" x2="{sx(b):.1f}" y2="{y}" stroke-width="2"/>'
                     f'<line class="{cls}" x1="{sx(a):.1f}" y1="{y - 6}" x2="{sx(a):.1f}" y2="{y + 6}" stroke-width="2"/>'
                     f'<line class="{cls}" x1="{sx(b):.1f}" y1="{y - 6}" x2="{sx(b):.1f}" y2="{y + 6}" stroke-width="2"/>'
                     f'<circle class="{cls}" cx="{sx(r["dice_mean"]):.1f}" cy="{y}" r="6" stroke="var(--bg)" stroke-width="2"/>'
                     f'<text class="lbl" x="{sx(b) + 10:.1f}" y="{y + 4}">{f3(r["dice_mean"])}</text></g>')
    parts.append("</svg>")
    return "".join(parts)


def trend(runs) -> str:
    raw = [r for r in runs if r["experiment_id"] != "EXP-D-PP"]
    pp = next(r for r in runs if r["experiment_id"] == "EXP-D-PP")
    xs = {0.25: 20, 0.5: 38, 1.0: 78}
    w, h, left, right, top, bottom = 760, 300, 60, 120, 16, 40
    lo, hi = 0.45, 0.75
    sx = lambda n: left + (n - 15) / (83 - 15) * (w - left - right)
    sy = lambda v: top + (hi - v) / (hi - lo) * (h - top - bottom)
    parts = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="Dice 3D theo số case train">']
    for t in (0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75):
        parts.append(f'<line class="grid" x1="{left}" y1="{sy(t):.1f}" x2="{w - right}" y2="{sy(t):.1f}"/>'
                     f'<text x="{left - 8}" y="{sy(t) + 4:.1f}" text-anchor="end">{f3(t)[:4]}</text>')
    band_top = " ".join(f"{sx(xs[r['training_fraction']]):.1f},{sy(r['dice_ci95'][1]):.1f}" for r in raw)
    band_bot = " ".join(f"{sx(xs[r['training_fraction']]):.1f},{sy(r['dice_ci95'][0]):.1f}" for r in reversed(raw))
    parts.append(f'<polygon class="band" points="{band_top} {band_bot}"/>')
    line = " ".join(f"{sx(xs[r['training_fraction']]):.1f},{sy(r['dice_mean']):.1f}" for r in raw)
    parts.append(f'<polyline class="s1 ln" points="{line}"/>')
    for r in raw:
        n = xs[r["training_fraction"]]
        # the 78-case label sits left of its point, so it never meets the PP-4 whisker on its right
        lx, anchor = (sx(n) - 10, "end") if n == 78 else (sx(n) + 8, "start")
        parts.append(f'<g><title>{html.escape(LABEL[r["experiment_id"]])}: {n} case train, Dice {f3(r["dice_mean"])}</title>'
                     f'<circle class="s1" cx="{sx(n):.1f}" cy="{sy(r["dice_mean"]):.1f}" r="6" stroke="var(--bg)" stroke-width="2"/>'
                     f'<text class="lbl" x="{lx:.1f}" y="{sy(r["dice_mean"]) + 20:.1f}" text-anchor="{anchor}">{f3(r["dice_mean"])}</text>'
                     f'<text x="{sx(n):.1f}" y="{h - 14}" text-anchor="middle">{n}</text></g>')
    a, b = pp["dice_ci95"]
    x = sx(78) + 26
    parts.append(f'<g><title>100 % + PP-4: Dice {f3(pp["dice_mean"])}, CI 95 % [{f3(a)}; {f3(b)}]</title>'
                 f'<line class="s2" x1="{x:.1f}" y1="{sy(a):.1f}" x2="{x:.1f}" y2="{sy(b):.1f}" stroke-width="2"/>'
                 f'<rect class="s2" x="{x - 6:.1f}" y="{sy(pp["dice_mean"]) - 6:.1f}" width="12" height="12" transform="rotate(45 {x:.1f} {sy(pp["dice_mean"]):.1f})"/>'
                 f'<text class="lbl" x="{x + 12:.1f}" y="{sy(pp["dice_mean"]) + 4:.1f}">+ PP-4 {f3(pp["dice_mean"])}</text></g>')
    parts.append(f'<text x="{(left + w - right) / 2:.1f}" y="{h - 0}" text-anchor="middle">số case train hiệu dụng</text></svg>')
    return "".join(parts)


def bars(cands) -> str:
    w, h, left, top, bottom = 760, 230, 60, 16, 34
    lo, hi = 0.56, 0.60
    bw = (w - left - 20) / len(cands)
    sy = lambda v: top + (hi - v) / (hi - lo) * (h - top - bottom)
    parts = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="GATE-IMG-01: Dice validation theo ứng viên">']
    for t in (0.56, 0.57, 0.58, 0.59, 0.60):
        parts.append(f'<line class="grid" x1="{left}" y1="{sy(t):.1f}" x2="{w - 20}" y2="{sy(t):.1f}"/>'
                     f'<text x="{left - 8}" y="{sy(t) + 4:.1f}" text-anchor="end">{f3(t)[:4]}</text>')
    for i, c in enumerate(cands):
        x = left + i * bw + bw * 0.2
        cls = "ref" if c["id"] == "PP-0" else ("s2" if c["id"] == "PP-4" else "s1")
        y = sy(c["dice"])
        parts.append(f'<g><title>{c["id"]}: Dice validation {c["dice"]:.4f}</title>'
                     f'<path class="{cls}" d="M{x:.1f},{sy(lo):.1f} V{y + 4:.1f} q0,-4 4,-4 h{bw * 0.6 - 8:.1f} q4,0 4,4 V{sy(lo):.1f} Z"/>'
                     f'<text class="lbl" x="{x + bw * 0.3:.1f}" y="{y - 6:.1f}" text-anchor="middle">{c["dice"]:.4f}</text>'
                     f'<text x="{x + bw * 0.3:.1f}" y="{h - 12}" text-anchor="middle">{c["id"]}</text></g>')
    parts.append("</svg>")
    return "".join(parts)


def build(d) -> str:
    runs, comps = d["runs"], d["comparisons"]
    rows = "".join(
        f'<tr><td>{LABEL[r["experiment_id"]]}</td><td>{r["variant"].split("_")[0]}</td><td>{f3(r["dice_mean"])}</td>'
        f'<td>[{f3(r["dice_ci95"][0])}; {f3(r["dice_ci95"][1])}]</td><td>{f3(r["dice_median"])} ({f3(r["dice_q1"])}–{f3(r["dice_q3"])})</td>'
        f'<td>{f3(r["iou_mean"])}</td><td>{f3(r["mean_slice_dice"])}</td><td>{r["rve_percent_mean"]:+.1f} %</td>'
        f'<td>{f3(r["sensitivity_dice_mean"])}</td></tr>' for r in runs)
    crows = "".join(
        f'<tr><td>{LABEL[c["a"]]} → {LABEL[c["b"]]}</td><td>{c["mean_delta"]:+.3f}</td>'
        f'<td>[{c["ci95"][0]:+.3f}; {c["ci95"][1]:+.3f}]</td><td>{c["b_higher"]} / {c["a_higher"]}</td></tr>' for c in comps)
    gate = "".join(f'<tr><td>{c["id"]}</td><td>{c["dice"]:.4f}</td></tr>' for c in d["gate_img_01_validation"])
    body = f"""<header class="masthead">
  <p class="eyebrow">Cardiac MRI Workspace · kết quả</p>
  <h1>Kết quả trên tập holdout khoá — 18/10/2026</h1>
  <p class="sub">54 case LASC 2018 chưa từng dùng để train hay chọn mô hình, mỗi run được dự đoán và chấm đúng một lần sau
  khi GATE-IMG-01 đóng. Chỉ số theo từng case (<code>ml-eval-1.0.0</code>); CI 95 % bootstrap 10 000 lần. Trang này chỉ có số tổng hợp.</p>
  <dl class="facts">
    <div><dt>Dice 3D tốt nhất</dt><dd>0,659</dd><p>DINOv2 100 % + hậu xử lý PP-4</p></div>
    <div><dt>Ít dữ liệu: 20 → 78 case</dt><dd>+0,081</dd><p>CI 95 % [+0,047; +0,118]</p></div>
    <div><dt>Hậu xử lý PP-4</dt><dd>+0,020</dd><p>CI [+0,015; +0,026], 45/54 case tốt hơn</p></div>
    <div><dt>E2E hero flow (API)</dt><dd>22 PASS · 0 FAIL</dd><p>1 SKIP: UNet chưa train</p></div>
  </dl>
</header>
<main>
<section id="runs"><h2>Dice 3D theo run</h2>
  <ul class="legend2"><li><i style="background:#2a78d6"></i>DINOv2 (RAW)</li><li><i style="background:#eb6834"></i>+ hậu xử lý PP-4</li></ul>
  {dot_whisker(runs)}
  <div class="tablewrap"><table><thead><tr><th>Run</th><th>Variant</th><th>Dice TB</th><th>CI 95 %</th><th>Trung vị (Q1–Q3)</th>
  <th>IoU TB</th><th>Dice TB theo lát</th><th>Sai lệch thể tích TB</th><th>Dice TB, tập độ nhạy (n = 53)</th></tr></thead><tbody>{rows}</tbody></table></div>
</section>
<section id="scarcity"><h2>Ít dữ liệu: Dice theo số case train</h2>
  <p>Ba run DINOv2 chỉ khác tập train (lồng nhau 20 ⊂ 38 ⊂ 78 case). Vùng mờ là CI 95 %. Mỗi mức là một run, một seed.</p>
  {trend(runs)}
</section>
<section id="paired"><h2>So sánh cặp từng case (run B − run A)</h2>
  <div class="tablewrap"><table><thead><tr><th>So sánh</th><th>Δ Dice TB</th><th>CI 95 %</th><th>Case B tốt hơn / A tốt hơn</th></tr></thead><tbody>{crows}</tbody></table></div>
  <p>50 % → 100 %: CI chạm 0, không khẳng định được lợi ích của lần nhân đôi cuối. Không hiệu chỉnh đa so sánh.
  App trả <code>comparable: false</code> cho cặp RAW vs PROCESSED; dòng cuối là phân tích ablation ngoại tuyến (spec 08 §2).</p>
</section>
<section id="gate"><h2>GATE-IMG-01: hậu xử lý chọn chỉ trên validation</h2>
  <p>Tập ứng viên và luật chọn được ghi vào repo trước khi chạy (#91). PP-4 = mở hình thái học 3D 3×3×3, rồi giữ thành
  phần liên thông 26 lớn nhất. Cấu hình đóng băng bằng sha256 <code>c0a68cc7…</code>.</p>
  {bars(d["gate_img_01_validation"])}
  <div class="tablewrap"><table><thead><tr><th>Ứng viên</th><th>Dice TB validation (n = 20)</th></tr></thead><tbody>{gate}</tbody></table></div>
</section>
<section id="limits"><h2>Giới hạn</h2>
  <ul>
    <li><strong>UNet chưa train</strong>: so sánh UNet vs DINOv2 (RQ-A) chưa trả lời được.</li>
    <li>Không augmentation, lr hằng số (validation Dice dao động mạnh), train 2D theo lát, một seed mỗi mức.</li>
    <li>Spacing là placeholder đơn vị: sai lệch thể tích tính theo voxel, không có mm/mL.</li>
    <li>Dữ liệu không có ánh xạ case → bệnh nhân (DR-002b); tập độ nhạy bỏ một case nghi trùng, kết luận không đổi.</li>
  </ul>
</section>
<section id="doc"><h2>Tài liệu</h2><ul class="chips">
  <li><a href="{REPO}/blob/main/management/day39/RESULTS_HOLDOUT_DINOV2.md">Biên bản kết quả</a></li>
  <li><a href="{REPO}/blob/main/management/day39/GATE_IMG_01_DECISION.md">GATE-IMG-01</a></li>
  <li><a href="{REPO}/blob/main/management/day39/gate_img_01/SELECTION.md">Bảng chọn trên validation</a></li>
  <li><a href="{REPO}/blob/main/tools/e2e/README.md">E2E hero flow</a></li>
  <li><a href="../index.html">Bảng điều phối hôm nay</a></li>
</ul></section>
</main>"""
    nav = (f'<nav class="topnav" aria-label="Trang"><a href="../index.html">Hôm nay</a><a href="holdout-day39.html" class="on">Kết quả</a>'
           f'<span class="sep"></span><a href="{REPO}">GitHub</a></nav>')
    return page("vi", "Kết quả holdout · Cardiac MRI", "Kết quả trên tập holdout khoá, 18/10/2026", nav,
                f"<style>{CSS}</style>" + body)


def main() -> int:
    d = json.loads(SRC.read_text(encoding="utf-8"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(d), encoding="utf-8", newline="\n")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size:,} bytes from {SRC.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
