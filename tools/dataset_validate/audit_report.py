"""
Render management/DATASET_AUDIT.md from a generated manifest.

`06` section 9.1 names the eight fields the audit must record, and Spike D
criterion A19 requires the file to cover every one of them. This renderer emits
all eight whether or not the data is there: a field with no reading is printed
as NOT MEASURED with its reason, never dropped.

Why the audit is generated rather than hand-written: SPIKE_D_DATASET/TASK.md
forbids creating DATASET_AUDIT.md before real evidence exists, and requires the
manifest to be produced by a script rather than typed. Generating the prose from
the same manifest keeps the document and the data from drifting apart, and means
no empty template sits in the repository inviting someone to fill it in by hand.

Two fields are deliberately left for the owner: the label-semantics verdict
(A11) and the split-path evidence (A13). The renderer writes the question and
the measured inputs, and leaves the verdict blank with the owner's name on it.
"""

from __future__ import annotations

import json
from typing import Any

NOT_MEASURED = "NOT MEASURED"


def _fmt(value: Any) -> str:
    if value is None:
        return "`null`"
    if isinstance(value, bool):
        return "**yes**" if value else "**no**"
    if isinstance(value, str) and value.startswith(NOT_MEASURED):
        return f"`{value}`"
    if isinstance(value, (list, dict)):
        return f"`{json.dumps(value, ensure_ascii=False)}`"
    return str(value)


def render(manifest: dict, results: list, summary: dict) -> str:
    acq = manifest.get("acquisition") or {}
    parts = manifest.get("partitions") or {}
    dist = manifest.get("shape_distribution") or {}
    cases = manifest.get("cases") or []

    L: list[str] = []
    add = L.append

    add("# DATASET AUDIT — 2018 Atria Segmentation Data (LASC 2018)")
    add("")
    add("> **Generated file — do not edit by hand.**")
    add("> Produced by `tools/dataset_validate/` from `data/manifests/dataset_manifest.json`.")
    add("> Regenerate with:")
    add(">")
    add("> ```bash")
    add("> python tools/dataset_validate/validate.py --root <extracted package> \\")
    add(">        --acquisition <acquisition.json> --write-manifest --write-audit")
    add("> ```")
    add(">")
    add("> Editing this file by hand makes it disagree with the manifest, and the manifest is")
    add("> the artifact `GATE-DATA-01` accepts (`06` §9.1, criterion A20).")
    add("")
    add(f"**Generated at:** {manifest.get('generated_at')}  ")
    add(f"**NRRD reader:** `{manifest.get('nrrd_library')}`  ")
    add(f"**Package root:** `{manifest.get('package_root')}`")
    add("")
    add("---")
    add("")

    # --- 06 §9.1 field 1-2: source and checksums ---------------------------
    add("## 1 · Acquisition — `06` §9.1: source URL, timestamp, checksums")
    add("")
    add("| Field | Value |")
    add("|---|---|")
    add(f"| Source URL | {_fmt(acq.get('source_url', NOT_MEASURED + ' — not supplied'))} |")
    add(f"| Documented official source | {_fmt(acq.get('documented_source', NOT_MEASURED))} |")
    add(f"| Download started | {_fmt(acq.get('download_started', NOT_MEASURED))} |")
    add(f"| Download finished | {_fmt(acq.get('download_finished', NOT_MEASURED))} |")
    add(f"| Acquired by | {_fmt(acq.get('acquired_by', NOT_MEASURED))} |")
    add(f"| Extraction location | {_fmt(acq.get('extraction_location', NOT_MEASURED))} |")
    add(f"| Licence / terms preserved at | {_fmt(acq.get('license_terms_path', NOT_MEASURED))} |")
    add("")
    files = acq.get("package_files") or []
    if files:
        add("| Package file | Size (bytes) | SHA-256 |")
        add("|---|---:|---|")
        for f in files:
            add(f"| `{f.get('name')}` | {f.get('size_bytes')} | `{f.get('sha256', NOT_MEASURED)}` |")
    else:
        add(f"Package files: `{NOT_MEASURED} — acquisition record not supplied`")
    add("")
    if acq.get("attribution_note"):
        add(f"> {acq['attribution_note']}")
        add("")

    # --- field 3: case counts by partition ---------------------------------
    add("## 2 · Case counts by released partition — `06` §9.1")
    add("")
    add(f"**Total cases discovered: {manifest.get('case_count_total')}**")
    add("")
    add("| Partition as released | Cases | With `lgemri.nrrd` | With `laendo.nrrd` |")
    add("|---|---:|---:|---:|")
    for name, b in sorted(parts.items()):
        add(f"| `{name}` | {b['case_count']} | {b['cases_with_mri']} | {b['cases_with_mask']} |")
    add("")

    # --- field 4: label availability and provenance ------------------------
    add("## 3 · Label availability and provenance — `06` §9.1, criteria A11 · A12")
    add("")
    add("**Measured — file-level presence:**")
    add("")
    for name, b in sorted(parts.items()):
        verdict = "every case carries a mask" if b["all_cases_have_mask"] else \
                  f"{b['case_count'] - b['cases_with_mask']} case(s) carry no mask"
        add(f"- `{name}` — {b['cases_with_mask']} of {b['case_count']}: {verdict}")
    add("")
    add("**NOT measured — the owner's written verdict is required:**")
    add("")
    add("| Question | Criterion | Verdict |")
    add("|---|---|---|")
    add("| Is `laendo.nrrd` the LA **cavity** target for this package? | A11 | "
        "`[OWNER VERDICT REQUIRED — Bế Quốc Khánh]` cite the files and values that justify it |")
    add("| What is the **provenance** of any test labels present? | A12 · RA-H02 | "
        "`[OWNER VERDICT REQUIRED — Bế Quốc Khánh]` file-level evidence required |")
    add("")
    add("> File presence is a machine reading. What an annotation **means** is not, and this")
    add("> audit does not pretend otherwise.")
    add("")

    # --- field 5: geometry summary and anomalies ---------------------------
    add("## 4 · Geometry summary — `06` §9.1, criteria A6 · A7 · A8 · A9 · A14")
    add("")
    add("### 4.1 Cohort shape distribution (A6)")
    add("")
    add(f"**Distinct shapes: {dist.get('distinct_shapes')}** · "
        f"**in-plane dimensions vary: {_fmt(dist.get('in_plane_dimensions_vary'))}**")
    add("")
    counts = dist.get("counts_by_shape") or {}
    if counts:
        add("| Shape `[x, y, z]` | Cases |")
        add("|---|---:|")
        for shape, n in counts.items():
            add(f"| `{shape}` | {n} |")
    add("")
    add("> **A6 feeds Spike A.** The `A9` slice-switch measurement was taken on a 64×64 fixture")
    add("> and is a lower bound only. It must be re-measured at the in-plane size recorded above.")
    add("")
    add("### 4.2 MRI ↔ mask compatibility (A8 · A9)")
    add("")
    resample = sum(1 for c in cases
                   if (c.get("mri_mask_compatibility") or {}).get("resampling_required") is True)
    no_resample = sum(1 for c in cases
                      if (c.get("mri_mask_compatibility") or {}).get("resampling_required") is False)
    add(f"- Cases needing **no** resampling: **{no_resample}**")
    add(f"- Cases needing a transform: **{resample}**")
    add(f"- Undetermined (no mask, or unreadable): "
        f"**{len(cases) - resample - no_resample}**")
    add("")
    add("### 4.3 Axis alignment — DR-012 boundary (A14)")
    add("")
    # Masks were skipped here while checks.py A14 examined both, so the same
    # document could print "every readable volume is axis-aligned" in this
    # section and A14 FAIL naming an oblique mask in section 8.
    oblique = [f"{c['case_id']}/{role}" for c in cases for role in ("mri", "mask")
               if (c.get(role) or {}).get("axis_aligned") is False]
    unknown = [f"{c['case_id']}/{role}" for c in cases for role in ("mri", "mask")
               if c.get(role) is not None
               and not isinstance((c.get(role) or {}).get("axis_aligned"), bool)]
    if oblique:
        add(f"**{len(oblique)} volume(s) are NOT axis-aligned:** {', '.join(oblique[:20])}")
        add("")
        add("> DR-012 restricts the MVP to **validated axis-aligned geometry**. An oblique case is")
        add("> rejected with `GEOMETRY_NOT_VALIDATED`. It is not silently resampled into range.")
    elif unknown:
        add(f"**{len(unknown)} volume(s) could not be checked** (no usable direction matrix): "
            f"{', '.join(unknown[:20])}")
        add("")
        add("> Unchecked is not aligned. DR-012 needs *validated* axis-aligned geometry.")
    else:
        add("Every readable volume **and mask** is axis-aligned — compatible with DR-012.")
    add("")

    # --- field 6: foreground label mapping ---------------------------------
    add("## 5 · Foreground label mapping — `06` §9.1, criterion A10")
    add("")
    sets: dict[str, int] = {}
    for c in cases:
        mask = c.get("mask")
        if mask and isinstance(mask.get("unique_values"), dict):
            key = str(mask["unique_values"].get("values"))
            sets[key] = sets.get(key, 0) + 1
    if sets:
        add("**Measured — the value sets actually present in the masks:**")
        add("")
        add("| Unique values | Cases |")
        add("|---|---:|")
        for k, v in sorted(sets.items(), key=lambda kv: -kv[1]):
            add(f"| `{k}` | {v} |")
    else:
        add(f"`{NOT_MEASURED} — no readable mask in this package`")
    add("")
    add("**Mapping — `[OWNER VERDICT REQUIRED — Bế Quốc Khánh]`**")
    add("")
    add("| Value | Meaning |")
    add("|---|---|")
    add("| _(record)_ | _(background / LA cavity foreground — state it, do not assume it)_ |")
    add("")
    add("> `06` §9 requires the mapping to be **recorded rather than assumed**. The value set above")
    add("> is measured; which value means foreground is a statement the owner makes.")
    add("")

    # --- field 7: selected split path --------------------------------------
    add("## 6 · Split path — `06` §9.1, criterion A13")
    add("")
    add("**This spike supplies evidence. It does not select the path** — `DR-002` / `GATE-SPLIT-01` does.")
    add("")
    add("| Input | Measured value |")
    add("|---|---|")
    for name, b in sorted(parts.items()):
        add(f"| `{name}` — labelled cases available | {b['cases_with_mask']} of {b['case_count']} |")
    add("")
    add("| Decision field | Status |")
    add("|---|---|")
    add("| Path A vs Path B evidence and reasoning | `[OWNER VERDICT REQUIRED — Bế Quốc Khánh]` |")
    add("| Selected path | `[DR-002 — leader decision, not this audit]` |")
    add("| Exact manifest case IDs per partition | `[written once GATE-SPLIT-01 resolves]` |")
    add("")
    add("> Split invariants that hold whichever path is chosen (`06` §6): **patient-level only,**")
    add("> **no slice-level split**, no case crosses partitions, **seed 2024**, and split membership")
    add("> may not change after test results are observed.")
    add("")

    # --- field 8: exclusions / corruptions ---------------------------------
    add("## 7 · Exclusions, corruptions and privacy findings — `06` §9.1, criteria A15 · A17")
    add("")
    anomalies = []
    privacy = []
    for c in cases:
        for role in ("mri", "mask"):
            vol = c.get(role)
            if not vol:
                continue
            if not vol.get("read_ok"):
                anomalies.append(f"`{c['case_id']}` / {role} — {vol.get('read_error')}")
            elif vol.get("has_non_finite") is True:
                anomalies.append(f"`{c['case_id']}` / {role} — contains non-finite values")
            f = vol.get("header_identifier_findings")
            if isinstance(f, list):
                for item in f:
                    privacy.append(f"`{c['case_id']}` / {role} — header key `{item['key']}` "
                                   f"matched `{item['matched_pattern']}`")
    add(f"**Anomalies: {len(anomalies)}**")
    add("")
    for a in anomalies[:40]:
        add(f"- {a}")
    if not anomalies:
        add("- none")
    add("")
    add(f"**Direct-identifier findings in headers: {len(privacy)}** — `NFR-SEC-005`, `12` §2")
    add("")
    for p in privacy[:40]:
        add(f"- {p}")
    if not privacy:
        add("- none")
    add("")
    if privacy:
        add("> Matched values are **not** reproduced here. Copying a suspected identifier into a")
        add("> tracked file is the leak this check exists to prevent. Exclude these keys from the")
        add("> app metadata path.")
        add("")

    # --- criteria table -----------------------------------------------------
    add("---")
    add("")
    add("## 8 · Acceptance criteria A1–A20")
    add("")
    add("| # | Criterion | Status | Detail |")
    add("|---|---|---|---|")
    for r in results:
        mark = {"PASS": "**PASS**", "FAIL": "**FAIL**",
                "NOT_RUN": "`NOT RUN`", "OWNER_VERDICT_REQUIRED": "`OWNER VERDICT`"}[r.status]
        detail = r.detail.replace("|", "\\|")
        add(f"| {r.cid} | {r.title} | {mark} | {detail} |")
    add("")
    add(f"**{summary['pass']} pass · {summary['fail']} fail · {summary['not_run']} not run · "
        f"{summary['owner_verdict_required']} awaiting the owner's verdict.**")
    add("")
    add("> ### This document is not an acceptance")
    add(">")
    add("> `GATE-DATA-01` closes through the four-step workflow — owner evidence → Secondary")
    add("> Reviewer `APPROVE` → CHAT E QA `PASS` → Project Control transition — and for Spike D")
    add("> QA must inspect **the actual recorded evidence**, not this summary. A script printing")
    add("> `PASS` closes nothing.")
    add("")
    add("**Related:** `management/spikes/SPIKE_D_DATASET/TASK.md` · "
        "`docs/specs/v1.0/06_DATASET_CONTRACT.md` · `data/manifests/dataset_manifest.json`")
    add("")
    return "\n".join(L)
