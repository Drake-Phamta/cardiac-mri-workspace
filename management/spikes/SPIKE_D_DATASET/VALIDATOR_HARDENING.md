# QA-002 validator hardening — Day 7

**Scope:** separate follow-up to PR #34 for QA-002 F6–F11, F14 and F15.
This change does not claim `GATE-DATA-01` acceptance and does not alter the raw
archive.

## Regression map

| Finding | Repair | Synthetic regression |
|---|---|---|
| F6 | A9 requires equality of shape, spacing, origin and direction matrix, not origin alone | shape-mismatched mask returns A9 `FAIL` |
| F7 | NRRD metadata uses an allowlist; unknown keys, free-text `content`, non-standard comments, unread headers and unexcluded sidecars cannot pass | DICOM-like key + content + comment returns A17 `FAIL` without copying values |
| F8 | Every readable mask must contain exactly the owner-recorded background and foreground values | extra label and empty mask both return A10 `FAIL` |
| F9 | `--archive` recomputes source ZIP size/SHA-256 and compares them with acquisition JSON | deliberately false acquisition hash returns A1 `FAIL` |
| F10 | Scanner inventories orphan, nested and outside-case files; unsafe and duplicate ZIP member paths are refused | orphan mask, nested sidecar and outside file are recorded; `../` ZIP path is rejected |
| F11 | Direction matrix must be finite, non-degenerate and axis-aligned; strict JSON never writes NaN | NaN is `NOT MEASURED`; zero row is A14-invalid |
| F14 | Scan exceptions are controlled refusals | corrupt ZIP exits `2` without traceback |
| F15 | A16 checks format/order/uniqueness; A20 checks required fields, cross-counts and strict JSON | malformed case ID and contradictory count both fail |

Reproduce:

```powershell
python tools/dataset_validate/validate.py --selftest
python tools/dataset_validate/hardening_regression.py
```

Observed on 2026-09-17: base self-test PASS; hardening regression **8/8 PASS**.

## Official-ZIP rerun

The hardened scanner re-read all 154 cases and regenerated the public manifest
and audit while keeping the restricted checksum table outside Git:

- A1 independently recomputed and matched the 2.2 GB archive SHA-256;
- A9 passed complete-grid equality for 154/154 labelled cases;
- A10 passed the recorded `{0,255}` mapping for 154/154 masks;
- A14 passed 308/308 required volumes;
- two previously invisible top-level files were inventoried: `Unet.py` and
  `preprocess_data.py`.

Those two scripts are not images or labels. On 2026-09-17 the owner explicitly
excluded both from ingestion and application metadata while preserving them
unchanged in the raw archive. The regenerated package-wide run reports A17
`PASS`; neither script is executed or propagated to app metadata.
