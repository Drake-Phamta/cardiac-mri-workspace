# QA-002 repair — reproducibility and criteria map

**Source archive:** official `2018_UTAH_MICCAI.zip`, 2,200,962,438 bytes;
SHA-256 independently recomputed on 2026-09-16:
`bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0`.
Only one NRRD was temporarily materialized at a time. No full-package
extraction or raw data was committed.

**Operator environment:** Windows build 26200; Python 3.11.9; NumPy 2.4.6;
pynrrd 1.1.3. Repair branch: `codex/day6-khanh`; source commit is the PR head
covering `tools/dataset_validate/` and the generated artifacts. Run through
the shared Khánh workspace by Codex; Khánh's current owner verdict on the
newly bounded claims still requires his explicit review.

## Executed commands and validator output

```powershell
python tools/dataset_validate/validate.py --selftest
python tools/dataset_validate/validate.py `
  --archive <private path to 2018_UTAH_MICCAI.zip> `
  --acquisition <private path to acquisition.json> `
  --restricted-manifest-out <private path to dataset_manifest_restricted.json> `
  --write-manifest --write-audit
python tools/dataset_validate/validate.py `
  --render-from-manifest data/manifests/dataset_manifest.json --write-audit
```

```text
selftest: PASS (synthetic failures expected; duplicate laendo/lawall detected
in both extracted and ZIP paths)
official cohort: 154 = 100 Training Set + 54 Testing Set
A15: 2 listed anomalies: identical laendo.nrrd bytes CASE_0056/CASE_0097;
     identical lawall.nrrd bytes CASE_0056/CASE_0097
A17: CASE_0097/desktop.ini listed and excluded from ingestion metadata
16 PASS · 0 FAIL · 1 NOT_RUN (A19) · 3 owner fields previously confirmed
```

The machine statuses are not `GATE-DATA-01` acceptance. The leader's narrow F5
policy is implemented; reviewer approval, QA PASS and Project Control remain.

## A1–A20 evidence map

| Criteria | Evidence / check | QA-002 bound |
|---|---|---|
| A1–A2 | `dataset_manifest.json` acquisition, archive SHA-256 and partition census; `validate.py` output | archive hash recomputed locally |
| A3–A5 | manifest `cases[*].files_present`, `mri`, `mask` | 154/154 required pairs readable; 3D uint8 |
| A6 | manifest `shape_distribution`; audit §4.1 | 576/640 in-plane, 88 slices |
| A7–A9 | manifest per-case shape, spacing, origin, directions, `mri_mask_compatibility`; audit §4.2 | **header-grid only**, not real physical geometry |
| A10 | manifest mask unique values + existing owner mapping; audit §5 | `{0,255}` measured; mapping is human-confirmed |
| A11–A12 | owner verdict, official challenge page, manifest labels, cavity-vs-wall SHA aggregate; audit §3 | 54 test labels present in released archive, not original challenge provenance |
| A13 | `DR-002` Path A, manifest cohort and audit §6 | exact IDs pending regenerated split PR / `GATE-SPLIT-01` |
| A14 | 308/308 required axis-aligned headers; audit §4.3 | physical mm/mL still disabled; owner confirmed bound through HITL on 2026-09-16 |
| A15–A16 | manifest `duplicate_evidence`, scanner cross-case SHA and ID/name checks; audit §7 | F1 known duplicated acquisition, grouped under `DR-002a` |
| A17 | header/sidecar scanner + owner exclusion; audit §7 | no sidecar content propagated |
| A18 | `POLICY_EVIDENCE.md`, archived PDF names/hashes, public hash of external restricted manifest | narrow public scope decided 2026-09-16; gate acceptance remains human |
| A19 | generated audit §§1–7 and proposed split manifest path | machine `NOT_RUN`; Q2 explicitly defers exact IDs to `GATE-SPLIT-01`, so training stays `BLOCKED` |
| A20 | regenerated JSON manifest + schema validation | machine-readable artifact; no acceptance transition |

## Remaining QA follow-up (non-blocking for this repair PR)

QA-002 F6–F11 and F14–F15 identify validator hardening needed before it
becomes a production ingestion/geometry gate. Their reproducible negative
cases are under `management/day06/qa002/`. This PR closes the requested F1–F5,
F12–F13 repair evidence only to the extent stated; it does not claim those
separate hardening findings are fixed.
