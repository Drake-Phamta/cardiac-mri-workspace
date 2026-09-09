# SPIKE D — TASK

## Identity

| Field | Value |
|---|---|
| **Spike ID** | `SPIKE_D` |
| **Name** | Dataset acquisition, validation and provenance audit |
| **Priority** | **P0 — highest in the phase** |
| **Primary Owner** | **Bế Quốc Khánh** |
| **Secondary Reviewer** | **Vũ Hùng Anh** |
| **Status** | **PREPARED** — authorised and assigned; **execution not started**. On starting: set `ACTIVE` and record the real `started_at` (never backdate). |
| **Blocked by** | nothing |
| **Lead Claude chat** | CHAT C — ML / Imaging Research (support: CHAT D for scripts, CHAT A for the escalation trigger) |

## Source requirement IDs

`GATE-DATA-01` · `GATE-SPLIT-01` · `06` §3 · `06` §4 · `06` §9 · `06` §9.1 · `NFR-SEC-005` · `12` §2 ·
`12` §3 · PR-EXP-01 · PR-EXP-02 · PR-EXP-03 · PR-EXP-04 · PR-PRIV-01 · PR-PRIV-02 · PR-SCI-02 ·
NFR-REP-001 · NFR-REP-002 · `TC-SEC-005` · `TC-EXP-008`
**Decisions:** DR-001 ✅ · DR-002 (OPEN — this spike supplies its evidence) · DR-012 ✅ · DR-G01 · DR-G02
**Findings:** RA-H01 · RA-H02 · RA-M02 · RA-M14(b)

## Objective

Obtain the official **2018 Atria Segmentation Data (LASC 2018)** package from the documented Cardiac Atlas
source, and execute the specification-defined dataset audit against **the actual package** — not against
published descriptions. Produce the acceptance artifacts `06` §9.1 requires so `GATE-DATA-01` can be
decided on evidence.

## Hypotheses / questions to answer

| # | Question | Why it matters |
|---:|---|---|
| Q1 | Does the obtained package contain, per case, a readable `lgemri.nrrd` and `laendo.nrrd`? | The core MVP artifacts (`06` §2) |
| Q2 | **Are official test labels actually present AND usable?** | Decides **Path A vs Path B** (`06` §6) — a 54-case vs 15-case holdout, a 3.6× difference in evaluation population. **[UNRESOLVED]** The official source is internally inconsistent: its historical challenge description indicates labels were withheld, while its current file-description section indicates the Test Set contains 54 MRIs *and* LA cavity labels. **This spike asserts neither reading; it settles the question from the files.** |
| Q3 | What is the exact foreground/background value mapping in `laendo.nrrd`? | `06` §9 requires it **recorded, not assumed** |
| Q4 | Is every volume **axis-aligned**? | **DR-012 ✅** declared axis-aligned-only support. If the package contains non-axis-aligned geometry, **RA-M02 escalates** and a new DR is required. This is what closes **condition C6**. |
| Q5 | Do in-plane dimensions vary across the cohort? | RA-M14(b) — drives the `07` §3 resize policy, viewer layout assumptions and fixture construction |
| Q6 | Are MRI and mask spatially aligned per case, or is resampling required? | `06` §4 |
| Q7 | Do headers or sidecar metadata contain unexpected direct identifiers? | `NFR-SEC-005`, `12` §2 metadata allowlist, `TC-SEC-005` |
| Q8 | Are there corrupted, missing or unreadable files? | `06` §9; exclusions must be recorded, never silently dropped |

## Inputs

- Documented official source: the Cardiac Atlas Project 2018 Atria Segmentation Data page recorded in
  `06` §1. **Use the documented official source only.**
- `06` §3 acquisition-manifest field list and `06` §9 validation-check list — both are the authoritative
  checklists for this spike.

## Prerequisites

None. **This spike has no prerequisite decision and is the phase's P0.**

## Exact environment

| Field | Value |
|---|---|
| Machine | **[UNVERIFIED — record]** OS, CPU, RAM, free disk before download |
| Python / tooling | **[UNVERIFIED — record]** interpreter version and the exact NRRD-reading library + version |
| Working directory | project workspace; raw package stored outside version control |
| Network | **[UNVERIFIED — record]** connection used, and download start/end timestamps |

## Implementation boundary

**Allowed to create or modify:**

```text
management/spikes/SPIKE_D_DATASET/RESULT.md      (only when real evidence exists)
management/DATASET_AUDIT.md
data/manifests/dataset_manifest.*
tools/dataset_validate/**                        validation scripts only
```

**Forbidden:**

- Any edit to `docs/specs/v1.0/`.
- Committing dataset bytes to the repository (`12` §3 — do not redistribute).
- Writing any application/production module.
- **Selecting the split.** This spike produces the *evidence*; **DR-002 / GATE-SPLIT-01 selects the path.**
- Substituting a different dataset.

## Day-one ordering — required so the DR-001 trigger is evaluable

**DR-001 ✅ measures its trigger at the end of the first execution day.** Order the work so acquisition and
a first-pass provenance read happen **before** deep validation, otherwise the trigger cannot be evaluated
on time.

| Step | Day-one action | Produces |
|---:|---|---|
| 1 | Acquire the package from the documented official source; record timestamps, file names, sizes, checksums where practical | acquisition record |
| 2 | Extract; produce the **raw file inventory** and **case count** | inventory |
| 3 | **First-pass provenance read: does the test partition contain label files at all?** | preliminary Q2 answer |
| 4 | Open 2–3 volumes: confirm NRRD loads, is 3D, and read spacing/origin/**direction** | preliminary Q4 answer |
| 5 | **Evaluate the DR-001 trigger and report to the leader** | trigger decision |

Steps 6+ (full-cohort validation) continue on subsequent days.

### DR-001 escalation rule — exact text

> **If, by the end of the first execution day**, there is **no usable official package locally**, **or**
> package/provenance validation exposes a **blocking defect preventing `GATE-DATA-01` acceptance** — then
> **RA-H01 escalates to BLOCKER** and the **dataset contingency process opens**.

**Do not silently substitute another dataset.** Substitution is a protocol change requiring the full
`00` §13 sequence: Decision Request → impact analysis → leader/spec-owner approval → specification update.

## Acceptance criteria

Spike D is ACCEPTED only when **every** item below is answered with real evidence:

| # | Criterion | Source |
|---:|---|---|
| A1 | Download date, source URL, package/file names recorded; checksums where practical | `06` §3 |
| A2 | Extracted **case count** recorded, by released partition | `06` §3, `06` §9.1 |
| A3 | **Per-case presence** of `lgemri.nrrd` and `laendo.nrrd` recorded | `06` §2, §9 |
| A4 | Every NRRD loads successfully; MRI is 3D; mask is 3D | `06` §9 |
| A5 | File format and dtype recorded per file | `06` §3 |
| A6 | **Cohort shape distribution** recorded, explicitly stating whether in-plane dimensions vary | `06` §3, RA-M14(b) |
| A7 | Spacing, origin and **direction** recorded per case | `06` §3, §4 |
| A8 | MRI/mask **shape and spacing compatibility** determined; whether any resampling is required | `06` §4 |
| A9 | Whether masks are already spatially aligned with the MRI | `06` §4 |
| A10 | **Mask unique values** recorded and the **exact foreground/background mapping** stated — recorded, not assumed | `06` §9 |
| A11 | **Explicit verification that `laendo.nrrd` is the LA cavity target for this package** | `06` §3 |
| A12 | **Whether official test labels are present, and their provenance** — with file-level evidence | `06` §3, RA-H02 |
| A13 | **Path A vs Path B evidence** stated, with the reasoning. *(This spike does not select the path.)* | `06` §6, DR-002 |
| A14 | **Axis-alignment verdict:** is every volume axis-aligned, i.e. compatible with the DR-012 ✅ boundary? | DR-012, RA-M02, C6 |
| A15 | Corrupted/missing/unreadable files listed; exclusions recorded with reasons | `06` §9 |
| A16 | Case IDs unique; de-identified internal IDs assigned (`CASE_0001` style) | `06` §5, §9 |
| A17 | **Metadata audit against the privacy allowlist** — any unexpected direct identifiers found in headers or sidecars reported and excluded from the app metadata path | `NFR-SEC-005`, `12` §2, `TC-SEC-005` |
| A18 | Any license / data-use terms accompanying the download preserved and archived | `12` §3 |
| A19 | `management/DATASET_AUDIT.md` exists and covers every `06` §9.1 field | `06` §9.1 |
| A20 | `data/manifests/dataset_manifest.*` exists and is **machine-readable** | `06` §9.1 |

## Measurements required

Counts and inventories, not timings: case counts per partition; per-case file presence matrix; shape /
spacing / origin / direction table; dtype per file; mask unique-value sets; per-case MRI-vs-mask shape
comparison; list of anomalies.

## Automated evidence required

- A validation script under `tools/dataset_validate/` implementing the `06` §9 checks, **re-runnable** by
  the reviewer.
- Machine-readable `dataset_manifest.*` generated by that script — **not hand-typed**.
- Script output log attached to `RESULT.md`.

## Manual evidence required

- Owner's written verdict on **Q2** (test-label provenance) and **Q4** (axis alignment), each citing the
  specific files and values that justify it.
- Owner's confirmation that the license/terms file was preserved.

## Fail conditions

| Condition | Consequence |
|---|---|
| No usable package locally by end of day 1 | **RA-H01 → BLOCKER**; DR-001 contingency opens |
| Blocking defect preventing GATE-DATA-01 acceptance | **RA-H01 → BLOCKER**; DR-001 contingency opens |
| `laendo.nrrd` cannot be verified as the LA cavity target | GATE-DATA-01 cannot be accepted |
| Package contains **non-axis-aligned** geometry | **RA-M02 escalates**; new DR required; **C6 cannot close** |
| Unexpected direct identifiers found | Must be excluded from the app metadata path before any ingestion |
| Any dataset substituted without a DR | **Governance violation** — `00` §13 |

## Expected deliverables

1. `management/DATASET_AUDIT.md` — the `06` §9.1 acceptance artifact.
2. `data/manifests/dataset_manifest.*` — machine-readable, script-generated.
3. `management/spikes/SPIKE_D_DATASET/RESULT.md` — spike verdict and evidence index.
4. `tools/dataset_validate/**` — re-runnable validation code.
5. Archived license/terms file.

## Estimated effort

**[ESTIMATE — to be calibrated per `15` §23]** Day 1: acquisition + inventory + first-pass provenance and
geometry read (the trigger-critical path). Days 2–3: full-cohort validation, manifest generation, audit
write-up. Download time is environment-dependent and is **not** an estimate this document can make.

## Risk

`RISK-DATA-01` (HIGH) · `RISK-SPLIT-01` (MEDIUM). This spike gates more downstream work than any other:
all training, `GATE-SPLIT-01`, `GATE-ML-01` via Spike C1, and conditions **C1** and **C6**.

## Downstream unblocked

`GATE-DATA-01` (DR-G01) · `GATE-SPLIT-01` (DR-G02) evidence · **DR-002** · **DR-012** confirmation ·
**condition C1** · **condition C6** · **Spike C1** · ingestion Contract 1 (DR-004 ✅)

## What Claude may NOT fabricate

> **Claude must not invent, estimate-as-measured, or otherwise fabricate any of:** file inventories, case
> counts, whether test labels exist, label semantics or provenance, shapes, dtypes, spacing, origin,
> direction matrices, mask value sets, alignment verdicts, checksums, corruption findings, or metadata
> contents.
>
> **All of the above must be read from the actual downloaded package by Bế Quốc Khánh.**
>
> Claude **may**: write the validation script, define the manifest schema, structure
> `DATASET_AUDIT.md`, and analyse and interpret output the owner supplies.

**No `RESULT.md` exists in this directory.** Create it only when real package evidence exists.
