# Dataset Audit — LASC 2018 / Atria Segmentation Data

**Spike:** `SPIKE_D`  
**Owner:** Bế Quốc Khánh  
**Status:** Evidence collected; formal review and gate transition are still pending.  
**Validated:** 2026-09-11  

## 1. Acquisition record

| Field | Evidence |
|---|---|
| Official source | <https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/> |
| Archive | `2018_UTAH_MICCAI.zip` |
| Archive location | Outside Git: `D:\cardiac-mri-workspace-data\lasc2018\2018_UTAH_MICCAI.zip` |
| Archive size | `2,200,962,438` bytes |
| Archive SHA-256 | `bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0` |
| Recorded archive timestamp | `2026-09-11T15:47:28.8056909Z` |
| Raw dataset committed to Git | **No** |

The archive was read directly from the ZIP stream because full extraction exceeds the available local
disk capacity. The validator is re-runnable at `tools/dataset_validate/validate_zip.py` and generated
`data/manifests/dataset_manifest.json`.

## 2. Package inventory

| Partition | Cases | `lgemri.nrrd` | `laendo.nrrd` | Extra |
|---|---:|---:|---:|---|
| Training Set | 100 | 100/100 | 100/100 | `lawall.nrrd` ×100; one `desktop.ini` |
| Testing Set | 54 | 54/54 | 54/54 | `lawall.nrrd` ×54 |
| **Total** | **154** | **154/154** | **154/154** | — |

Top-level helper files are `preprocess_data.py` and `Unet.py`. `lawall.nrrd` is recorded as an extra
artifact and is not treated as the core LA cavity target.

## 3. Validation results

| Criterion | Result | Evidence |
|---|---|---|
| A1 — source, archive, timestamp, checksum | **PASS** | Acquisition record above; archive SHA-256 recorded |
| A2 — case count by partition | **PASS** | 100 training, 54 testing |
| A3 — required file presence | **PASS** | 308/308 core files present |
| A4 — NRRD load, 3D shape | **PASS** | 308/308 payloads parsed; all `dimension: 3` |
| A5 — file type/dtype | **PASS** | All core files: `unsigned char`, `raw` encoding |
| A6 — cohort shape distribution | **PASS** | `576×576×88`: 69 cases; `640×640×88`: 85 cases; in-plane dimensions vary |
| A7 — spacing/origin/direction | **PASS** | All 308 core files: spacing `(1,1,1)`, origin `(0,0,0)`, direction identity |
| A8 — MRI/mask shape and spacing | **PASS** | 154/154 cases match |
| A9 — MRI/mask spatial alignment | **PASS** | Directions and origins match for 154/154 cases |
| A10 — mask values and mapping | **PASS** | Every mask has unique values `{0,255}`; background `0`, foreground `255` |
| A11 — `laendo.nrrd` target identity | **PASS with source review noted** | File name and official page description identify LA cavity; keep provenance note below |
| A12 — test labels present/provenance | **FILE-LEVEL PASS; DECISION OPEN** | All 54 testing case directories contain `laendo.nrrd`; official page text is internally inconsistent |
| A13 — Path A vs Path B evidence | **EVIDENCE READY; DO NOT SELECT** | Package supports the presence branch; leader/spec owner must decide via DR-002 |
| A14 — axis-alignment verdict | **PASS** | 308/308 direction matrices are axis-aligned identity matrices |
| A15 — corruption/missing/unreadable files | **PASS** | No validation failures; no missing core files |
| A16 — unique/de-identified IDs | **PASS** | 154 unique source IDs mapped to `CASE_0001`–`CASE_0154` in manifest |
| A17 — metadata privacy audit | **PASS for inspected NRRD headers** | No direct-identifier fields detected; app metadata must use generated case IDs |
| A18 — license/data-use terms preserved | **PASS with DDA caveat** | No terms file was embedded in the ZIP; official CAP policy PDFs were archived externally and hashed below |
| A19 — human-readable audit artifact | **PASS** | This file |
| A20 — machine-readable manifest | **PASS** | `data/manifests/dataset_manifest.json` |

### Shape distribution detail

| Partition | Shape | Cases |
|---|---|---:|
| Training Set | `576×576×88` | 47 |
| Training Set | `640×640×88` | 53 |
| Testing Set | `576×576×88` | 22 |
| Testing Set | `640×640×88` | 32 |

### Geometry detail

All 308 validated core files reported:

```text
space directions: (1,0,0) (0,1,0) (0,0,1)
space origin:     (0,0,0)
spacing:          (1.0, 1.0, 1.0)
```

This confirms compatibility with the currently approved axis-aligned support boundary. It does not
replace reviewer confirmation of the geometry contract.

## 4. Test-label provenance and split decision

The downloaded official package contains `laendo.nrrd` in all 54 testing case directories. This is
file-level evidence from the actual package. The official source page simultaneously contains wording
that describes the testing release as data-only and a file-description section that lists testing MRI
and LA cavity labels. Therefore:

- the package evidence is recorded as-is;
- no Path A/Path B decision is made in this audit;
- DR-002 / `GATE-SPLIT-01` remains leader/spec-owner controlled;
- the final split must remain patient-level and use seed `2024` once the decision is recorded.

## 5. Privacy and extra artifacts

No direct identifier fields were detected in the inspected NRRD headers. `desktop.ini` was treated as an
operational extra file, not as clinical metadata. `lawall.nrrd` is retained in the external raw package
for provenance but is outside the core `laendo.nrrd` target contract until separately verified.

## 6. Reproduction command

```powershell
py tools/dataset_validate/validate_zip.py `
  D:\cardiac-mri-workspace-data\lasc2018\2018_UTAH_MICCAI.zip `
  --source-url https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/ `
  --downloaded-at 2026-09-11T15:47:28.8056909Z `
  --output data\manifests\dataset_manifest.json
```

## 7. Terms and data-use policy evidence

No license/terms file was embedded in the dataset ZIP. The applicable official CAP policy documents were
downloaded outside Git under `D:\cardiac-mri-workspace-data\lasc2018\official_terms\`:

| Document | Official URL | SHA-256 |
|---|---|---|
| CAP Policies and Procedures for Participants | <https://www.cardiacatlas.org/wp-content/uploads/2022/10/CAPPolicyStatementParticipants.pdf> | `64324ff2f8adb22cc918c67e6471fd14032f74fe88dc58aee6ce95945d294ffb` |
| CAP Policies and Procedures for Data Distribution to Users | <https://www.cardiacatlas.org/wp-content/uploads/2022/10/CAPPolicyStatementUsers.pdf> | `e0633f5b40d591c9769df65602e080b2d8859aeeb284fa54444daf19c67a1fe4` |

The CAP policy states that contributing studies retain control through study-specific DDAs. The team
must confirm the applicable DDA/permission for this research project before redistributing data or
derivatives. The raw archive remains outside Git and is not copied into the repository.

## 8. Remaining acceptance action

The provenance contradiction around test labels is explicitly recorded for DR-002; it is not silently
resolved here. Project Control/reviewer still needs to confirm the applicable DDA scope and perform the
formal gate transition.
