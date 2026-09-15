# SPIKE_D — RESULT (QA-002 repair)

**Owner:** Bế Quốc Khánh
**Secondary reviewer:** Vũ Hùng Anh
**Original execution:** 2026-09-14
**QA-002 repair rerun:** 2026-09-16
**Status:** `NEEDS_FIX` after QA-002 reject; regenerated evidence is submitted
for reviewer and QA recheck, **not ACCEPTED**.

## Measured result

The official `2018_UTAH_MICCAI.zip` was read directly from the ZIP, one NRRD at
a time. The expanded 14.2 GiB package was **not** extracted on this machine.

```text
16 PASS · 0 FAIL · 1 NOT_RUN (A19) · 3 previous owner verdicts recorded
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

## Owner verdicts and remaining human review

Khánh previously confirmed the A10/A11/A12/A13/A17/A18 verdicts on
2026-09-14. The QA-002 repair adds bounded technical evidence:

- `A11`: 154/154 cavity files differ in SHA-256 from companion wall files;
  QA-002 independently observed no cavity/wall foreground overlap.
- `A14`: 308/308 required headers are axis-aligned, **but** that supports
  voxel-grid rendering only, not mm/mL geometry or clinical orientation.
- `A18/F5`: the public metadata question is **not resolved** by stripping
  machine-specific paths. See `POLICY_EVIDENCE.md`; the leader must decide
  whether the remaining case-level fields may stay public.

Khánh read and confirmed these updated A11/A14/F5 bounds through HITL on
2026-09-16. This confirmation does not replace the leader's pending public
metadata policy decision under A18/F5.

`A19` remains `NOT_RUN` by construction in the scanner. The regenerated audit
now names `DR-002`, `DR-002a`, and the proposed split manifest path; exact
membership must be cross-checked when the replacement split PR lands. The
leader's QA-002 Q2 choice about deferring this audit item is still pending.

## Evidence index

- `management/DATASET_AUDIT.md` — generated readable audit.
- `data/manifests/dataset_manifest.json` — generated machine manifest.
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
  --write-manifest --write-audit
```

This result does not close `GATE-DATA-01` or `GATE-SPLIT-01`. Acceptance still
requires updated owner confirmation, reviewer approval, QA PASS, leader policy
decision, and Project Control transition.
