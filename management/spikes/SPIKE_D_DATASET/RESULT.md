# SPIKE_D — RESULT (QA-002 repair)

**Owner:** Bế Quốc Khánh
**Secondary reviewer:** Vũ Hùng Anh
**Original execution:** 2026-09-14
**QA-002 repair rerun:** 2026-09-17
**Status:** `NEEDS_FIX` after QA-002 reject; regenerated evidence is submitted
for reviewer and QA recheck, **not ACCEPTED**.

## Measured result

The official `2018_UTAH_MICCAI.zip` was read directly from the ZIP, one NRRD at
a time. The expanded 14.2 GiB package was **not** extracted on this machine.

```text
16 PASS · 0 FAIL · 1 NOT_RUN (A19) · 3 owner verdicts confirmed
```

- 154 cases: 100 released `Training Set`, 54 released `Testing Set`.
- All 154 cases contain readable `lgemri.nrrd` and `laendo.nrrd`; the 308
  required volumes are 3D `uint8`, with `{0,255}` cavity masks.
- 69 cases are 576×576×88; 85 cases are 640×640×88.
- The 462 inspected NRRD headers have default spacing `(1,1,1)`, origin
  `(0,0,0)`, and identity direction. MRI/mask grids match **at header level**
  in 154/154 cases. Physical anatomical spacing is **not verified**; mm/mL
  measures remain disabled.
- `CASE_0056` and `CASE_0097` have byte-identical `laendo.nrrd` and
  `lawall.nrrd` (two reported anomalies). QA-002 separately measured MRI
  Pearson r ≈ 0.9965. Under the leader's `DR-002a`, they form one known
  acquisition group and both are pinned to train.
- Testing labels are physically present in 54/54 directories of the obtained
  release; this does not claim they were public during the challenge.
- `CASE_0097/desktop.ini` remains excluded from ingestion/app metadata; the
  raw archive is unchanged.
- Package-wide inventory now also finds `Unet.py` and `preprocess_data.py` at
  the ZIP root. Independent inspection identifies both as Python source code,
  not case images, masks or metadata. Khánh explicitly excluded both from
  ingestion/app metadata on 2026-09-17; they remain unchanged in the raw
  archive and are not executed.

## Owner verdicts and remaining human review

Khánh previously confirmed the A10/A11/A12/A13/A17/A18 verdicts on
2026-09-14. The QA-002 repair adds bounded technical evidence:

- `A11`: 154/154 cavity files differ in SHA-256 from companion wall files;
  QA-002 independently observed no cavity/wall foreground overlap.
- `A14`: 308/308 required headers are axis-aligned, **but** that supports
  voxel-grid rendering only, not mm/mL geometry or clinical orientation.
- `A18/F5`: the leader's 2026-09-16 decision is implemented: the public
  manifest retains bounded case metadata and aggregate evidence; per-data-file
  SHA-256 values are in a deterministic restricted manifest outside the repo.
  Its content hash and regeneration command remain public.

Khánh read and confirmed these updated A11/A14/F5 bounds through HITL on
2026-09-16. The leader subsequently selected the narrow F5 publication policy
recorded in `POLICY_EVIDENCE.md`.

The prior A17 verdict covered `CASE_0097/desktop.ini` only. The two newly
inventoried root scripts received a separate explicit owner disposition on
2026-09-17; the earlier verdict was not silently broadened.

`A19` remains `NOT_RUN` by construction in the scanner. Under the leader's
2026-09-16 Q2 decision, the exact split IDs are explicitly **deferred to
`GATE-SPLIT-01` and not passed**. Training remains **BLOCKED** until that gate
closes. The audit records `DR-002`, `DR-002a`, `DR-002b`, and the proposed split
manifest path without implying that patient-level separation was verified.

## Evidence index

- `management/DATASET_AUDIT.md` — generated readable audit.
- `data/manifests/dataset_manifest.json` — generated machine manifest.
- External `dataset_manifest_restricted.json` — deterministic per-data-file
  checksum table; intentionally not tracked. Its SHA-256 is in the public
  manifest.
- `tools/dataset_validate/validate.py` — reproducible scanner.
- `management/spikes/SPIKE_D_DATASET/QA002_REPAIR_EVIDENCE.md` — validator
  output, environment and A1–A20 mapping.
- `management/spikes/SPIKE_D_DATASET/POLICY_EVIDENCE.md` — CAP policy reading
  and leader decision request.
- External archive SHA-256:
  `bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0`.

## Reproduction

```powershell
python tools/dataset_validate/validate.py `
  --archive <private path to 2018_UTAH_MICCAI.zip> `
  --acquisition <private path to acquisition.json> `
  --restricted-manifest-out <private path to dataset_manifest_restricted.json> `
  --write-manifest --write-audit
```

This result does not close `GATE-DATA-01` or `GATE-SPLIT-01`. Acceptance still
requires reviewer approval, QA PASS, and Project Control transition. The exact
split IDs remain deferred to `GATE-SPLIT-01`, which still blocks training.
