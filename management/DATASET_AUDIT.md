# DATASET AUDIT — 2018 Atria Segmentation Data (LASC 2018)

> **Generated file — do not edit by hand.**
> Produced by `tools/dataset_validate/` from `data/manifests/dataset_manifest.json`.
> Regenerate with:
>
> ```bash
> python tools/dataset_validate/validate.py --root <extracted package> \
>        --acquisition <acquisition.json> --write-manifest --write-audit
> ```
>
> Editing this file by hand makes it disagree with the manifest, and the manifest is
> the artifact `GATE-DATA-01` accepts (`06` §9.1, criterion A20).

**Generated at:** 2026-09-14T03:06:08+07:00
**NRRD reader:** `pynrrd 1.1.3`
**Package root:** `D:\cardiac-mri-workspace-data\lasc2018\2018_UTAH_MICCAI.zip!/`

---

## 1 · Acquisition — `06` §9.1: source URL, timestamp, checksums

| Field | Value |
|---|---|
| Source URL | https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/ |
| Documented official source | https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/ |
| Download started | 2026-09-11T23:12:06+07:00 |
| Download finished | 2026-09-11T23:41:51+07:00 |
| Acquired by | Phạm Tuấn Anh |
| Extraction location | NOT EXTRACTED - the 14.2 GiB package exceeds available disk; validated by streaming the official ZIP one NRRD at a time |
| Licence / terms preserved at | D:/cardiac-mri-workspace-data/lasc2018/official_terms |
| Owner verdicts confirmed by | Bế Quốc Khánh |
| Owner verdicts confirmed at | 2026-09-14T02:50:39+07:00 |
| A18 owner verdict | Two official Cardiac Atlas policy PDFs are archived externally with SHA-256 evidence. The ZIP contains no embedded licence file. Do not redistribute raw or derived data until the applicable DDA or permission has been confirmed by the responsible downloader/project lead. |

| Package file | Size (bytes) | SHA-256 |
|---|---:|---|
| `2018_UTAH_MICCAI.zip` | 2200962438 | `bee5ee5bd19a1caa1a375e147e56e7e691a4bc64e3873dc672d9d2b963a8f5e0` |

| Preserved policy file | Size (bytes) | SHA-256 |
|---|---:|---|
| `CAPPolicyStatementParticipants.pdf` | 63113 | `64324ff2f8adb22cc918c67e6471fd14032f74fe88dc58aee6ce95945d294ffb` |
| `CAPPolicyStatementUsers.pdf` | 81535 | `e0633f5b40d591c9769df65602e080b2d8859aeeb284fa54444daf19c67a1fe4` |

> Package acquired by Phạm Tuấn Anh as the INC-001 recovery action. Full-cohort validation was executed for Spike D under Bế Quốc Khánh's authenticated workspace; owner verdicts were confirmed by Bế Quốc Khánh through HITL on 2026-09-14.

## 2 · Case counts by released partition — `06` §9.1

**Total cases discovered: 154**

| Partition as released | Cases | With `lgemri.nrrd` | With `laendo.nrrd` |
|---|---:|---:|---:|
| `Testing Set` | 54 | 54 | 54 |
| `Training Set` | 100 | 100 | 100 |

## 3 · Label availability and provenance — `06` §9.1, criteria A11 · A12

**Measured — file-level presence:**

- `Testing Set` — 54 of 54: every case carries a mask
- `Training Set` — 100 of 100: every case carries a mask

**NOT measured — the owner's written verdict is required:**

| Question | Criterion | Verdict |
|---|---|---|
| Is `laendo.nrrd` the LA **cavity** target for this package? | A11 | Owner-confirmed: laendo.nrrd is the left-atrial cavity target. Evidence: the official Cardiac Atlas dataset description and the measured binary masks present alongside lgemri.nrrd in all 154 cases. |
| What is the **provenance** of any test labels present? | A12 · RA-H02 | File-level released-package evidence: laendo.nrrd is physically present in 54/54 directories under Testing Set in the obtained official archive. The official page wording is inconsistent, so this record does not claim that these labels were available during the original challenge evaluation. |

> File presence is a machine reading. What an annotation **means** is not, and this
> audit does not pretend otherwise.

## 4 · Geometry summary — `06` §9.1, criteria A6 · A7 · A8 · A9 · A14

### 4.1 Cohort shape distribution (A6)

**Distinct shapes: 2** · **in-plane dimensions vary: **yes****

| Shape `[x, y, z]` | Cases |
|---|---:|
| `[640, 640, 88]` | 85 |
| `[576, 576, 88]` | 69 |

> **A6 feeds Spike A.** The `A9` slice-switch measurement was taken on a 64×64 fixture
> and is a lower bound only. It must be re-measured at the in-plane size recorded above.

### 4.2 MRI ↔ mask compatibility (A8 · A9)

- Cases needing **no** resampling: **154**
- Cases needing a transform: **0**
- Undetermined (no mask, or unreadable): **0**

### 4.3 Axis alignment — DR-012 boundary (A14)

Every readable volume **and mask** is axis-aligned — compatible with DR-012.

## 5 · Foreground label mapping — `06` §9.1, criterion A10

**Measured — the value sets actually present in the masks:**

| Unique values | Cases |
|---|---:|
| `[0.0, 255.0]` | 154 |

**Mapping — owner-recorded:**

| Value | Meaning |
|---|---|
| `0` | background |
| `255` | LA cavity foreground |

> `06` §9 requires the mapping to be **recorded rather than assumed**. The value set above
> is measured; which value means foreground is a statement the owner makes.

## 6 · Split path — `06` §9.1, criterion A13

**This spike supplies evidence. It does not select the path** — `DR-002` / `GATE-SPLIT-01` does.

| Input | Measured value |
|---|---|
| `Testing Set` — labelled cases available | 54 of 54 |
| `Training Set` — labelled cases available | 100 of 100 |

| Decision field | Status |
|---|---|
| Path A vs Path B evidence and reasoning | The measured package contains 154 labelled cases, including labels in 54/54 released Testing Set directories, so Path A is technically feasible from a data-presence perspective. Spike D does not select Path A or Path B; DR-002 and GATE-SPLIT-01 own that decision and the final patient-level seed-2024 split. |
| Selected path | `[DR-002 — leader decision, not this audit]` |
| Exact manifest case IDs per partition | `[written once GATE-SPLIT-01 resolves]` |

> Split invariants that hold whichever path is chosen (`06` §6): **patient-level only,**
> **no slice-level split**, no case crosses partitions, **seed 2024**, and split membership
> may not change after test results are observed.

## 7 · Exclusions, corruptions and privacy findings — `06` §9.1, criteria A15 · A17

**Anomalies: 0**

- none

**Direct-identifier findings in headers: 0** — `NFR-SEC-005`, `12` §2

- none

**Non-NRRD sidecars in case directories: 1**

- `CASE_0097/desktop.ini`

**A17 owner disposition:** Exclude CASE_0097/desktop.ini from ingestion and application metadata as an operating-system artifact. Preserve it untouched in the raw archive and record the exclusion; do not delete or silently accept it.

---

## 8 · Acceptance criteria A1–A20

| # | Criterion | Status | Detail |
|---|---|---|---|
| A1 | Acquisition record: date, source URL, file names, checksums | **PASS** | 1 package file(s) from https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/ |
| A2 | Case count by released partition | **PASS** | total 154 - Testing Set: 54; Training Set: 100 |
| A3 | Per-case presence of lgemri.nrrd and laendo.nrrd | **PASS** | 154 case(s) discovered by the presence of lgemri.nrrd; 154 also carry laendo.nrrd. A case directory lacking lgemri.nrrd is not discovered at all and therefore cannot be reported here - a package whose layout differs is caught by A2. |
| A4 | Every NRRD loads; MRI is 3D; mask is 3D | **PASS** | all volumes across 154 cases loaded and are 3D |
| A5 | File format and dtype recorded per file | **PASS** | mask:uint8 x154, mri:uint8 x154 |
| A6 | Cohort shape distribution; do in-plane dimensions vary? | **PASS** | 2 distinct shape(s); in-plane dimensions vary: True; in-plane sizes seen: [[576, 576], [640, 640]] |
| A7 | Spacing, origin and direction recorded per case | **PASS** | all three fields present for 154 cases |
| A8 | MRI/mask shape, spacing, origin and direction compatibility; resampling needed? | **PASS** | 154 case(s) need no resampling |
| A9 | Are masks already spatially aligned with the MRI? | **PASS** | all 154 labelled case(s) share the MRI origin exactly |
| A10 | Mask unique values recorded; foreground mapping stated | **PASS** | [0.0, 255.0] in 154 case(s). The foreground/background MAPPING is the owner's written statement, not an inference. |
| A11 | laendo.nrrd verified as the LA cavity target | `OWNER VERDICT` | Requires the owner's written verdict citing specific files and values. A script cannot establish what an annotation means. |
| A12 | Are official test labels present, and what is their provenance? | **PASS** | Testing Set: 54/54 case(s) carry laendo.nrrd; Training Set: 100/100 case(s) carry laendo.nrrd. File-level presence is measured here; PROVENANCE remains the owner's written verdict (RA-H02). |
| A13 | Path A vs Path B evidence and reasoning | `OWNER VERDICT` | This spike supplies evidence only; DR-002 / GATE-SPLIT-01 selects the path. The manifest's partition summary is the input. |
| A14 | Axis-alignment verdict - DR-012 boundary | **PASS** | all 308 volume(s) axis-aligned |
| A15 | Corrupted / missing / unreadable files listed | **PASS** | 0 anomaly(ies): none |
| A16 | Case IDs unique; de-identified internal IDs assigned | **PASS** | 154 unique CASE_NNNN IDs assigned deterministically by sorted source path |
| A17 | Metadata audit against the privacy allowlist | **FAIL** | 1 non-NRRD sidecar file(s) inside case directories: CASE_0097/desktop.ini. `06` section 2 says a file outside the required pair is not a core target until its provenance and semantics are verified, and TASK.md:130 asks for identifiers in headers OR SIDECARS. Content was NOT read - the owner decides whether to exclude or clear each one. |
| A18 | Licence / data-use terms preserved and archived | `OWNER VERDICT` | Confirmed by the person who performed the download, against the acquisition directory. Not derivable from the package contents. |
| A19 | management/DATASET_AUDIT.md exists, covers 06 section 9.1 | `NOT RUN` | Produced by audit_report.py from this manifest; verify after generating it. |
| A20 | data/manifests/dataset_manifest.* exists and is machine-readable | **PASS** | This manifest is the artifact; it is generated, not hand-typed. |

**15 pass · 1 fail · 1 not run · 3 owner verdict confirmed · 0 owner verdict outstanding.**

> ### This document is not an acceptance
>
> `GATE-DATA-01` closes through the four-step workflow — owner evidence → Secondary
> Reviewer `APPROVE` → CHAT E QA `PASS` → Project Control transition — and for Spike D
> QA must inspect **the actual recorded evidence**, not this summary. A script printing
> `PASS` closes nothing.

**Related:** `management/spikes/SPIKE_D_DATASET/TASK.md` · `docs/specs/v1.0/06_DATASET_CONTRACT.md` · `data/manifests/dataset_manifest.json`
