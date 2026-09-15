#!/usr/bin/env python3
"""Generate the C0 cost table and SVG chart from fp32/bf16 probe JSON files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path) -> dict:
    with path.open(encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    if not payload.get("input_is_synthetic") or len(payload.get("results", [])) != 10:
        raise ValueError(f"{path}: expected a complete 10-variant synthetic C0 probe")
    return payload


def mib(value: int) -> float:
    return value / (1024 * 1024)


def rows(probes: list[dict]) -> list[dict]:
    output = []
    for probe in probes:
        for item in probe["results"]:
            if "error" in item:
                raise ValueError(f"{item['variant']} failed: {item['error']}")
            search = item.get("batch_search") or {}
            output.append({
                "precision": probe["precision"], "variant": item["variant"],
                "family": item["family"], "batch": item["batch"],
                "max_batch": search.get("largest_fitting_batch"),
                "cap_reached": search.get("cap_reached", False),
                "memory_mib": mib(item["peak_memory_bytes_train"]),
                "slices_s": item["train_step"]["slices_per_s"],
                "stride": item["effective_output_stride"],
            })
    return output


def svg_chart(items: list[dict], path: Path) -> None:
    # Compact, dependency-free chart: BF16 throughput and peak memory for all variants.
    data = [r for r in items if r["precision"] == "bf16"]
    width, height = 1100, 570
    left, top, chart_w, chart_h = 345, 65, 690, 410
    max_speed = max(r["slices_s"] for r in data)
    max_mem = max(r["memory_mib"] for r in data)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#0f172a"/>',
        '<style>text{font-family:Segoe UI,Arial,sans-serif;fill:#e2e8f0}.small{font-size:13px}.axis{stroke:#475569;stroke-width:1}.speed{fill:#38bdf8}.mem{fill:#f59e0b}</style>',
        '<text x="36" y="35" font-size="22" font-weight="700">C0 BF16 cost on RTX 4050 Laptop GPU — synthetic 560×560</text>',
        '<text x="36" y="56" class="small">Blue: training throughput (slices/s) · orange: peak allocated memory (MiB), batch 2</text>',
    ]
    row_h = chart_h / len(data)
    for i, r in enumerate(data):
        y = top + i * row_h
        speed_w = r["slices_s"] / max_speed * chart_w
        mem_w = r["memory_mib"] / max_mem * chart_w
        label = r["variant"].replace("dinov2_", "dino_")
        parts += [
            f'<text x="36" y="{y + 16:.1f}" class="small">{label}</text>',
            f'<rect class="speed" x="{left}" y="{y + 3:.1f}" width="{speed_w:.1f}" height="12" rx="2"/>',
            f'<rect class="mem" x="{left}" y="{y + 19:.1f}" width="{mem_w:.1f}" height="8" rx="2" opacity="0.9"/>',
            f'<text x="{left + speed_w + 7:.1f}" y="{y + 14:.1f}" class="small">{r["slices_s"]:.2f}</text>',
            f'<text x="{left + mem_w + 7:.1f}" y="{y + 28:.1f}" class="small">{r["memory_mib"]:.0f}</text>',
        ]
    parts += [
        f'<line class="axis" x1="{left}" y1="{top - 8}" x2="{left}" y2="{top + chart_h + 4}"/>',
        '<text x="36" y="535" class="small">C0 is a hardware/throughput probe only. It does not establish convergence or close GATE-ML-01.</text>',
        '</svg>',
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def markdown(probes: list[dict], items: list[dict], chart_path: str) -> str:
    bf16 = {r["variant"]: r for r in items if r["precision"] == "bf16"}
    compute = probes[0]["compute"]
    checkpoints = probes[0]["checkpoints"]
    lines = [
        "# SPIKE C0 — PRELIMINARY RESULT",
        "",
        "**Owner/operator:** Bế Quốc Khánh",
        "**Execution:** 2026-09-16 on the owner's RTX 4050 Laptop GPU",
        "**Status:** `PARTIAL_EVIDENCE` — C0-1…C0-6, C0-9 and C0-10 measured; "
        "C0-7/C0-8 await the owner's real GPU-hours/day input.",
        "**Scope:** synthetic hardware/throughput probe only; **does not close `GATE-ML-01`**.",
        "",
        "## Environment and method",
        "",
        f"- Windows build 26200; Python {compute['python']}; PyTorch {compute['torch']}; "
        f"CUDA {compute['cuda_runtime_in_torch_build']}; cuDNN {compute['cudnn']}; driver {compute['nvidia_driver']}.",
        f"- GPU: {compute['gpu_name']}, {compute['vram_total_gb']:.1f} GiB; host RAM {compute['host_ram_gb']:.2f} GiB; BF16 supported.",
        "- Synthetic `uint8` 640×640×88 volume, DR-011 per-volume p0.5/p99.5 clip and [0,1] scale; "
        "slices resized bilinear to 560×560, masks nearest-exact. No cohort-fitted statistic.",
        "- Intended batch 2; 2 warm-up + 10 timed, synchronized steps; data loading excluded. "
        "Peak is `torch.cuda.max_memory_allocated`. Each CUDA measurement/search attempt ran in an isolated worker.",
        "- Batch search capped at 16. A result of 16 with `cap` means the true ceiling may be higher.",
        "",
        "## Measured configuration cost",
        "",
        "| Precision | Variant | Batch | Max fit | Peak MiB | Train slices/s | Output stride |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for r in items:
        max_fit = f"{r['max_batch']}{' (cap)' if r['cap_reached'] else ''}"
        lines.append(f"| {r['precision']} | `{r['variant']}` | {r['batch']} | {max_fit} | "
                     f"{r['memory_mib']:.1f} | {r['slices_s']:.2f} | {r['stride']:g} |")
    lines += [
        "",
        f"![Automatically generated C0 BF16 cost chart]({chart_path})",
        "",
        "At batch 2, BF16 reduced memory and increased throughput for every measured full-training "
        "configuration. This is a cost observation, not a final recipe selection. The BF16 "
        f"DINOv2-S/14 frozen progressive candidate measured {bf16['dinov2_s14_frozen_progressive']['memory_mib']:.1f} MiB "
        f"and {bf16['dinov2_s14_frozen_progressive']['slices_s']:.2f} slices/s; full B/14 progressive measured "
        f"{bf16['dinov2_b14_full_progressive']['memory_mib']:.1f} MiB and "
        f"{bf16['dinov2_b14_full_progressive']['slices_s']:.2f} slices/s.",
        "",
        "## Checkpoints and decoder stride",
        "",
        f"- DINOv2-S/14: `facebook/dinov2-small` at `{checkpoints['s14']['revision_resolved']}`, "
        f"weights SHA-256 `{checkpoints['s14']['weights_sha256']}`.",
        f"- DINOv2-B/14: `facebook/dinov2-base` at `{checkpoints['b14']['revision_resolved']}`, "
        f"weights SHA-256 `{checkpoints['b14']['weights_sha256']}`.",
        "- Linear decoder effective stride 14; progressive decoder 1.75 after three learned ×2 stages; "
        "UNet stride 1. Whether these are appropriate for real LA boundaries is C1-5, not measurable in C0.",
        "",
        "## Calendar feasibility — C0-7/C0-8",
        "",
        "`NOT MEASURED — owner has not yet supplied the number of real GPU hours available per day.` "
        "No per-run/calendar verdict is emitted because doing so would invent an owner availability input. "
        "Once supplied, run `extrapolate.py` against both raw JSON files with `--train-cases 80` and "
        "`--gpu-hours-per-day <owner value>`; the result remains preliminary.",
        "",
        "## Acceptance coverage",
        "",
        "| Criterion | Result |",
        "|---|---|",
        "| C0-1 compute | PASS — exact host/GPU/framework recorded |",
        "| C0-2 memory | PASS — both families, 10 candidates × 2 precisions |",
        "| C0-3 largest fitting batch | PASS within declared cap 16; capped values are lower bounds |",
        "| C0-4 throughput | PASS — synchronized median, steps/s and slices/s |",
        "| C0-5 decoder stride | PASS — measured/model-reported |",
        "| C0-6 candidate costs | PASS — checkpoint revision/hash, mode, decoder, precision |",
        "| C0-7 per-run extrapolation | NOT MEASURED — owner GPU-hours/day missing |",
        "| C0-8 calendar verdict | NOT MEASURED — same blocker |",
        "| C0-9 DR-011 | PASS — per-volume only plus fixed pretrained constants |",
        "| C0-10 gate statement | PASS — C0 does not close GATE-ML-01 |",
        "",
        "**Overall:** 8/10 criteria evidenced; `PARTIAL_EVIDENCE`, not `EVIDENCE_READY`. "
        "No real dataset, validation, holdout, convergence run, or core matrix run was used.",
        "",
        "## Raw evidence",
        "",
        "- `spikes/spike_c_ml/EVIDENCE_RAW/c0_probe_20260916T004325+0700.json` — complete FP32 matrix.",
        "- `spikes/spike_c_ml/EVIDENCE_RAW/c0_probe_20260916T005659+0700.json` — complete BF16 matrix.",
        "- `spikes/spike_c_ml/harness/probe.py` — measurement harness.",
        "- `spikes/spike_c_ml/harness/extrapolate.py` — pending calendar arithmetic.",
        "",
        "The raw logs contain one stale descriptive sentence saying PR #25 was pending review; #25 is merged "
        "and QA-002 repair PR #34 leaves the dtype/shape counts used here unchanged. The harness source is "
        "corrected for future runs; measured values were not edited after capture.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fp32", type=Path)
    parser.add_argument("bf16", type=Path)
    parser.add_argument("--result", type=Path, required=True)
    parser.add_argument("--chart", type=Path, required=True)
    args = parser.parse_args()
    probes = [load(args.fp32), load(args.bf16)]
    if [p["precision"] for p in probes] != ["fp32", "bf16"]:
        raise ValueError("inputs must be fp32 then bf16")
    items = rows(probes)
    svg_chart(items, args.chart)
    args.result.parent.mkdir(parents=True, exist_ok=True)
    chart_rel = Path("../../../spikes/spike_c_ml") / args.chart.name
    args.result.write_text(markdown(probes, items, chart_rel.as_posix()), encoding="utf-8")
    print(f"wrote {args.result} and {args.chart} from {len(items)} measurements")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
