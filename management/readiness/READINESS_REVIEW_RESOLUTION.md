# READINESS REVIEW RESOLUTION

**Project:** AI-assisted Cardiac MRI Research Workspace
**Subject:** specification owner's review of the Implementation Readiness Audit
**Review outcome:** **ACCEPTED WITH CORRECTIONS** — three decision rounds applied
**Date:** 2026-09-08 (Round 1: audit review · Round 2: leader/spec-owner decisions · Round 3: final free
conditions — ownership and deployment)
**Prepared by:** Project Control

---

## 0. Purpose and authority

The specification owner accepted `IMPLEMENTATION_READINESS_AUDIT.md` with corrections, answered all nine
clarification questions, and approved five Decision Requests (**Round 1**). A second round of
leader/spec-owner decisions then approved five further Decision Requests, corrected one condition status,
and closed two conditions (**Round 2**, §9). This document is the **authoritative record of post-review
state**. Where it differs from the audit artifacts as originally written, **this document governs**.

> **Read §10 for current state.** §1–§8 record Round 1; §9 records Round 2. **§10 records Round 3 and is
> authoritative** — it supersedes §5–§7 and §9.10–§9.12 wherever they differ.
>
> **After Round 3: no free leader decision remains open.** Every remaining open item is evidence-driven.

**Scope boundaries observed:**

- **No file under `docs/specs/v1.0/` was modified.** Integrity re-verified after all edits: **19/19 OK**.
- Corrections were applied to the readiness artifacts **only**.
- **No spike has been executed.** **No 30-day plan has been created.**
- SCQ-07's answer targets a **future** specification revision and has **not** been applied to v1.0.

### Naming collision — read this before using any `C` identifier

The review introduced Spike C stages named "C0" and "C1", which collide with readiness conditions
`C1`–`C8`. Disambiguation rule used throughout all readiness artifacts:

| Written as | Means |
|---|---|
| **`C1` … `C8`** (bare) | **readiness condition** from `IMPLEMENTATION_READINESS_STATUS.md` §6 |
| **"Spike C0" / "Spike C1"** (always with the word *Spike*) | the two **stages of Spike C** |

A bare `C1` always means readiness condition C1 (Spike D / GATE-DATA-01). This is flagged so the 30-day
plan does not conflate "Spike C1 complete" with "condition C1 closed" — they are different things, though
condition C1 happens to be Spike C1's prerequisite.

---

## 1. Review corrections applied

| # | Correction directed | Artifact(s) changed | Status |
|---|---|---|---|
| 1 | HIGH risk count is **7**, not 6; total remains 16 | `RISK_REGISTER_INITIAL.md` §2 | ✅ applied |
| 2 | Audit-raised Decision Requests are **DR-001 … DR-014**, not DR-013 | `OPEN_DECISIONS.md` §0 | ✅ applied |
| 3 | Replace "Spikes A–F are independent" with **"parallelisable after their prerequisite decisions are resolved"** | `TECHNICAL_SPIKES_REQUIRED.md` §0 and dependency graph; `IMPLEMENTATION_READINESS_STATUS.md` §6.2; `RISK_REGISTER_INITIAL.md` RISK-SEQ-01; `IMPLEMENTATION_READINESS_AUDIT.md` RA-M03 | ✅ applied |
| 4 | Split Spike C into **Spike C0** (synthetic, preliminary) and **Spike C1** (real validated subset, after Spike D); **GATE-ML-01 closes only after Spike C1** | `TECHNICAL_SPIKES_REQUIRED.md` Spike C section, summary table, dependency graph; `OPEN_DECISIONS.md` DR-G03 row + DR-007 | ✅ applied |
| 5 | Clarify DR-004 so **raw dataset/case ingestion** and **precomputed experiment-result ingestion** are **two distinct contracts**, even though both use offline CLI + versioned manifest | `OPEN_DECISIONS.md` DR-004 | ✅ applied |

### 1.1 Correction 1 — HIGH risk count

The summary table read `HIGH | 6` while listing seven IDs, with a footnote acknowledging the mismatch.
Corrected to **7**. The seven HIGH risks are: `RISK-DATA-01`, `RISK-3D-GEOMETRY`, `RISK-3DERR-01`,
`RISK-MOBILE-RENDER`, `RISK-INGEST-01`, `RISK-COMPUTE`, `RISK-SCOPE-01`. Register totals: **7 HIGH,
8 MEDIUM, 1 LOW = 16**.

### 1.2 Correction 3 — why "independent" was wrong

The original wording overstated parallelism. Prerequisites actually exist:

| Spike | Prerequisite |
|---|---|
| **A** | DR-006 (target device) |
| **B** | DR-006, DR-008a (axis/index convention) |
| **C0** | none |
| **C1** | **Spike D** — the only spike gated on another spike |
| **D** | none |
| **E** | DR-006 |
| **F** | DR-008a |

Two spikes (C0, D) have no prerequisites; the rest need one or two decisions, all of which are free leader
decisions except Spike C1's dependence on Spike D.

### 1.3 Correction 4 — Spike C split

| | **Spike C0** | **Spike C1** |
|---|---|---|
| **Data** | synthetic, representative shape/dtype | small representative **validated real** subset |
| **Prerequisite** | none — starts immediately | **Spike D** (readiness condition C1) |
| **Establishes** | hardware, memory, basic throughput, effective output stride, preliminary calendar arithmetic | real per-run wall-clock, real peak memory, output stride **vs observed LA boundary thickness**, convergence sanity, DR-011 normalization conformance, final calendar verdict |
| **Closes GATE-ML-01?** | **No** | **Yes — the gate may close only after Spike C1** |

Rationale recorded: `08` §2 requires one recipe held identical across `EXP-D-025/050/100`. A recipe frozen
on synthetic evidence could prove unusable on real volumes, and discovering that after GATE-ML-01
invalidates completed runs. Spike C1's subset must be drawn from the **training partition only** once
GATE-SPLIT-01 resolves, so it never touches validation or holdout data.

### 1.4 Correction 5 — two ingestion contracts

Shared mechanism (offline CLI + versioned manifest); **separate contracts**, because they carry different
payloads, provenance obligations, and validation gates:

| | **Contract 1 — raw dataset / case ingestion** | **Contract 2 — precomputed experiment-artifact ingestion** |
|---|---|---|
| **Ingests** | `MRICase`, `MRIVolume`, `GroundTruthMask` | `Experiment`, `AnalysisRun`, prediction masks, metric records, `Reconstruction3D` |
| **Runs** | once per validated package, before any training | once per experiment evaluation, repeatedly across the 7-experiment matrix |
| **Gated by** | **GATE-DATA-01** | **GATE-SPLIT-01 + GATE-ML-01** |
| **Failure mode** | an invalid dataset | broken provenance or a fabricated comparability claim |
| **Needs** | own manifest schema, validator, acceptance test | own manifest schema, validator, acceptance test |

Collapsing them would either apply dataset validation to model outputs or let experiment artifacts bypass
GATE-SPLIT-01/GATE-ML-01. **Two** acceptance tests are therefore required, not one.

---

## 2. Corrected counts of record

| Item | Value |
|---|---|
| Product requirements | **39** (28 MUST / 6 SHOULD / 5 COULD) |
| FR + NFR | **79** (75 MUST / 4 SHOULD) |
| Use cases | **17** |
| Screens | **9** |
| Acceptance tests | **69** |
| Audit findings | **38** — 1 BLOCKER, 15 HIGH, 16 MEDIUM, 6 LOW |
| Audit-raised Decision Requests | **DR-001 … DR-014** |
| Controlled gates | **DR-G01 … DR-G06** |
| Risk register | **16** — **7 HIGH**, 8 MEDIUM, 1 LOW |
| Spikes | **7 stages** — A, B, **C0**, **C1**, D, E, F |

The review confirmed the audit's structural-count corrections stand: `SPEC_AUDIT_REPORT_v1_0.md`'s
figures of 44 product requirements / 33 MUST / 70 tests are **incorrect**, and the mechanically verified
counts above are **authoritative** for all readiness and planning artifacts.

---

## 3. Findings closed by this review

| Finding | Was | Closed by | Now |
|---|---|---|---|
| **RA-M05** | MEDIUM — `05` §1 hierarchy contradicts §2/§6 | SCQ-01 | **RESOLVED** |
| **RA-M06** | MEDIUM — MetricSet cannot hold cohort/per-slice metrics | SCQ-02 | **RESOLVED** |
| **RA-M07** | MEDIUM — `05` Experiment omits `08` §10 fields | SCQ-03 | **RESOLVED** |
| **RA-M08** | MEDIUM — EXP-D-PP entity ambiguity | SCQ-04 | **RESOLVED** |
| **RA-M09** | MEDIUM — nested subsets preference vs rule | SCQ-05 | **RESOLVED** |
| **RA-H11** | HIGH — `TC-3D-004` tolerance undefined | SCQ-06 | **BOUNDED** — ceiling set; Spike B must measure within it |
| **RA-M15** | MEDIUM — metric semantics have no FR | SCQ-07 | **RESOLUTION PATH ACCEPTED** — next spec revision |
| **RA-L03** | LOW — CI gate timing ambiguous | SCQ-08 | **RESOLVED** |
| **RA-L06** | LOW — spike ownership conflict | SCQ-09 | **RESOLVED** |
| **RA-H16** | HIGH — normalization policy undefined | DR-011 ✅ | **RESOLVED** |
| **RA-M02** | MEDIUM — oblique geometry unhandled | DR-012 ✅ | **RESOLVED** — pending Spike D confirmation |
| **RA-M01** | MEDIUM — no uncertainty reporting | DR-014 ✅ | **RESOLVED** |
| **RA-H03** | HIGH — no ingestion contract | DR-004 ✅ | **DECIDED** — two contracts now scheduled work |
| **RA-H06** | HIGH — no ML compute spike | DR-007 ✅ | **DECIDED** — Spike C0/C1 approved |

**Still open:** RA-B01 (BLOCKER), RA-H01, RA-H02, RA-H04, RA-H05, RA-H07, RA-H08, RA-H09, RA-H10,
RA-H13, RA-H14, RA-H17, and MEDIUM findings RA-M03, RA-M04, RA-M10 … RA-M14, RA-M16, plus LOW findings
RA-L01, RA-L02, RA-L04, RA-L05.

**Net effect on the BLOCKER count: unchanged.** RA-B01 remains the single BLOCKER, still scoped to the
3D-error feature, still requiring Spike F and DR-005.

---

## 4. Specification owner clarifications recorded

All nine are **ANSWERED**. Recorded inline in `SPEC_CLARIFICATION_REQUESTS.md`; summarised here.

| ID | Answer | Resolves |
|---|---|---|
| **SCQ-01** | `Review`, `ReviewedMask` and `Finding` are **independent aggregates**. A Finding is **not required** for a correction. `05` §2/§6 govern; §1's diagram groups rather than contains. | RA-M05 |
| **SCQ-02** | Use three distinct entities: **`CaseMetricSet`**, **`SliceMetric`** (keyed `run_id` + `slice_index`), and Experiment-scoped **`CohortMetricSummary`** derived from persisted case metrics. | RA-M06 |
| **SCQ-03** | Persist **split**, **subset** and **evaluation-population** manifest IDs, plus **training** and **evaluation** code versions and the **metric version**. | RA-M07 |
| **SCQ-04** | `EXP-D-PP` is a **first-class derived Experiment** with derived `AnalysisRun`s that reference their source `EXP-D-100` run **and** its raw prediction. Raw-vs-processed is an **intentional valid ablation** when all other comparability fields match. | RA-M08 |
| **SCQ-05** | `25% ⊂ 50% ⊂ 100%` nesting is **mandatory for RQ-A**, with **deterministic patient-count rounding**. | RA-M09 |
| **SCQ-06** | Canonical fixtures require **exact** slice mapping. Decimated real-mesh picking tolerance is **at most ±1 source slice**. **Spike B must validate; must not be silently relaxed.** | RA-H11 (bounded) |
| **SCQ-07** | Add a dedicated **metric-semantics functional requirement in the next specification revision** and map `TC-EXP-009` to it. | RA-M15 (path) |
| **SCQ-08** | CI becomes a **hard merge gate from the first production-code merge after CI bootstrap is ACCEPTED**; governance/docs work before that may merge after manual review. | RA-L03 |
| **SCQ-09** | **Claude** prepares harnesses, instrumentation and analysis; **named human owners** execute physical-device and hardware measurements and supply evidence. | RA-L06 |

### 4.1 Downstream consequences worth flagging

- **SCQ-02** retires the `aggregation_level` enumeration in favour of three entities. This changes the
  metrics schema, `11` §5/§6 response models, and ingestion Contract 2's payload.
- **SCQ-04** requires the comparable-run validator to **permit** a declared cross-variant pair rather
  than reject it. Written naïvely against `08` §7 criterion 4, the validator would have failed the
  project's own required PR-EXP-04 ablation.
- **SCQ-06** resolves the RA-H11 ↔ RA-H14 circularity **in favour of accuracy**: a decimation level that
  pushes picking beyond ±1 slice is unacceptable regardless of its frame rate. This constrains DR-008c
  before Spike B runs, which is the correct ordering.
- **SCQ-07** is the one answer that does **not** take effect now. Until the next spec revision,
  `TC-EXP-009` remains an orphan in v1.0 and must be tracked explicitly so it is not lost.

---

## 5. Decision status of record — *Round 1; SUPERSEDED by §9.10*

> **⚠ Superseded.** Round 2 approved DR-001, DR-006, DR-008a, DR-009 and DR-010, so **no decision remains
> ⚠ NOT RULED ON**. Use **§9.10** for authoritative decision status.

### 5.1 Approved (5)

| DR | Approved outcome |
|---|---|
| **DR-004** ✅ | **Offline CLI + versioned manifests**, with **two separate contracts**: raw dataset/case ingestion, and experiment-artifact ingestion. Each needs its own manifest schema, validator, and acceptance test. |
| **DR-007** ✅ | **Spike C approved**, split into **Spike C0** (synthetic; preliminary) and **Spike C1** (validated real subset, after Spike D). **GATE-ML-01 may close only after Spike C1.** |
| **DR-011** ✅ | **No cohort-fitted normalization statistics** across data-fraction experiments. Documented **per-image / per-volume normalization** plus **fixed pretrained-model constants** where required, applied **identically across model families and fractions**. Recorded in `preprocessing_version`; Spike C1 confirms conformance. |
| **DR-012** ✅ | MVP supports **validated axis-aligned geometry only**; unsupported geometry **rejected with `GEOMETRY_NOT_VALIDATED`**. Enforced at the `06` §4 gate and in ingestion Contract 1. Spike D confirms the package falls inside the boundary. |
| **DR-014** ✅ | **95% confidence intervals** required for primary cohort metrics and paired differences, plus a limitations section. **No formal power-analysis gate.** |

### 5.2 Pending leader confirmation (1)

| DR | State |
|---|---|
| **DR-003** ⏸ | *(Round-1 state — **SUPERSEDED by §10.3**.)* The re-sequencing to before API freeze was accepted; a profile was proposed but not approved. **Round 3 approved `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS**, which is **not** a physical-LAN profile. See §10.3. |

### 5.3 Explicitly kept open (5 + gates)

Kept open because they require dataset, spike, device, or team evidence:

| DR | Needs | Note |
|---|---|---|
| **DR-002** | dataset evidence (Spike D) | Split path A vs B; resolves RA-H02 |
| **DR-005** | spike evidence (Spike F) | 3D error pipeline; the BLOCKER RA-B01 |
| **DR-006** | device decision (leader) | Free decision; unblocks Spikes A, B, E |
| **DR-008b / DR-008c** | spike evidence (Spike B) | **Now bounded by SCQ-06:** exact on fixtures, ≤ ±1 slice on decimated real mesh |
| **DR-013** | team evidence (leader) | Technical-block ownership matrix. **V1–V4 must be preserved** — this is an additional axis |

Controlled gates kept open: **DR-G01** (GATE-DATA-01), **DR-G02** (GATE-SPLIT-01),
**DR-G03** (GATE-ML-01 — now closes only after **Spike C1**), **DR-G04** (GATE-IMG-01),
**DR-G05** (GATE-MOB-01). **DR-G06** (GATE-DEPLOY-01) is pending via DR-003.

### 5.4 ⚠ Not ruled on by this review (4)

These were neither approved nor listed among those explicitly kept open. **Project Control has not
resolved them** — per `00` §13 and rule 7 of this engagement, they default to **OPEN** and are flagged so
they are not mistaken for settled:

| DR | Subject | Why it matters that it is unresolved |
|---|---|---|
| **DR-001** | Dataset acquisition contingency protocol | Sets the escalation trigger if the package cannot be obtained or validated. Without it, RA-H01 has no defined escalation point. |
| **DR-008a** | **Slice-axis and index-order convention** | **The highest-leverage free decision in the audit.** Blocks Spike B, Spike F, and all parallel backend/mobile geometry work, and gates readiness condition **C5**. SCQ-06 fixed the *tolerance* but not the *convention*. |
| **DR-009** | Review revision field, variant scope, session lifetime | SCQ-01 resolved the aggregate-independence question (RA-M05) but **not** these three. Blocks the V4 review/correction schema and API. |
| **DR-010** | Operational definitions of "outlier" and "worst slice" | Both are MUST behaviours on the demo hero path with no operational definition. |

**Recommended action:** rule on **DR-008a** next — it is a free declaration that unblocks two spikes and a
readiness condition, and it addresses `RISK-3D-GEOMETRY`, the only P0-class technical risk class.

---

## 6. Condition status C1–C8 — *Round 1; SUPERSEDED by §9.11*

> **⚠ Superseded.** This section records Round 1. **C5 and C8 have since closed, and C6 has been
> corrected from closed to OPEN (PARTIALLY_RESOLVED).** Use **§9.11** for authoritative condition status.

Conditions as defined in `IMPLEMENTATION_READINESS_STATUS.md` §6.

| # | Condition | Status after review | Basis |
|---|---|---|---|
| **C1** | Spike D completes; `DATASET_AUDIT.md` + manifest ACCEPTED, resolving GATE-DATA-01 and the Path A/B provenance question | **OPEN** | DR-G01 and DR-002 kept open; Spike D not executed. Now also gates **Spike C1**. |
| **C2** | Precomputed artifact ingestion contract approved | **✅ CLOSED (decision)** | **DR-004 approved.** Now **two** contracts to specify and test — that is scheduled work, no longer a gate. |
| **C3** | Deployment mode explicitly declared `LOCAL_DEMO` or `REMOTE_DEMO` before API freeze | **⏸ PENDING LEADER CONFIRMATION** | Re-sequencing accepted; `LOCAL_DEMO` **proposed only**. `LOCAL_DEMO` must **not** inherit remote-authentication or public-dataset-transport requirements. |
| **C4** | RA-B01 resolved — 3D error pipeline defined on Spike F evidence, or an explicit scope decision | **OPEN** | DR-005 kept open; Spike F not executed. RA-B01 remains the single BLOCKER. |
| **C5** | Slice-axis and index-order convention declared | **OPEN — ⚠ not ruled on** | DR-008a was not ruled on. Free decision; highest leverage remaining. |
| **C6** | Geometry support boundary declared, confirmed against the validated package | **✅ DECISION CLOSED / confirmation pending** | **DR-012 approved** (axis-aligned only, `GEOMETRY_NOT_VALIDATED` rejection). Confirmation against the package awaits Spike D (condition C1). |
| **C7** | Technical-block ownership/reviewer matrix added alongside V1–V4 | **OPEN** | DR-013 kept open; requires team evidence. **V1–V4 preserved.** |
| **C8** | Member availability declared so capacity is computed, not assumed | **OPEN** | No availability data collected. |

### 6.1 Summary

```
CLOSED                        : C2, C6 (decision; confirmation pending Spike D)
PENDING LEADER CONFIRMATION   : C3
OPEN                          : C1, C4, C5, C7, C8
```

**Two of eight conditions closed. One pending a single leader confirmation. Five open.**

### 6.2 Readiness verdict

The verdict is **unchanged: READY_WITH_CONDITIONS.**

The review resolved 14 findings and closed two conditions, but did not change the shape of the readiness
position: one feature-scoped BLOCKER remains, five conditions are open, and the dataset has still not been
obtained. Remediation and spike work remain authorised; the **30-day implementation baseline remains
unauthorised**.

---

## 7. What is authorised now — *Round 1; SUPERSEDED by §9.12*

> **⚠ Superseded.** Six of seven spike stages are now unblocked. Use **§9.12**.

**Authorised:**

- **Spike D** (P0, no prerequisites) and **Spike C0** (no prerequisites) may start immediately.
- Spikes **A**, **B**, **E**, **F** may start once their prerequisite decisions (DR-006, DR-008a) are
  declared — both free leader decisions.
- **Spike C1** may start once Spike D completes.
- Specifying the **two ingestion contracts** approved under DR-004, including their manifest schemas,
  validators, and the two acceptance tests.
- Ruling on the four ⚠ not-ruled-on decisions (DR-001, DR-008a, DR-009, DR-010) and the five kept-open
  ones.
- Confirming or rejecting the DR-003 `LOCAL_DEMO` proposal.

**Not authorised:**

- Executing any spike (this document records authorisation to *start*; **no spike has been run**).
- Creating `MASTER_PLAN_30_DAYS.md` or any daily plan.
- Selecting a technology stack.
- Any production repository module.
- Any edit to `docs/specs/v1.0/`.

---

## 8. Verification performed after applying corrections — *Round 1; see also §9.13*

| Check | Result |
|---|---|
| `sha256sum -c SPEC_MANIFEST_SHA256.txt` | **19/19 OK** — frozen specs untouched |
| `git status` | additions only under `management/readiness/` |
| Requirement IDs cited across all readiness artifacts | all resolve against the spec-derived sets (39 PR / 79 FR-NFR / 17 UC / 9 SCR / 69 TC) |
| `IMPLEMENTATION_READINESS_STATUS.md` final line | exactly one permitted verdict |
| Risk register totals | 7 HIGH + 8 MEDIUM + 1 LOW = 16 |
| SCQ entries answered | 9 / 9 |

---

## 9. Round 2 — leader/spec-owner decisions (2026-09-08)

**This section supersedes §5 and §6 wherever they differ, and is itself superseded by §10 (Round 3) on
decision status (§9.10 → §10.5), condition status (§9.11 → §10.6) and authorisation (§9.12 → §10.9).**

---

### 9.1 Status corrections directed by this round

#### Correction A — C6 is NOT fully closed

§6 recorded C6 as "decision closed / confirmation pending". **That was too strong.** Corrected state:

> **C6 — OPEN (PARTIALLY_RESOLVED).** The **axis-aligned-only policy is APPROVED** (DR-012). But C6 *also*
> requires **confirmation against the actual validated dataset package**, and that evidence is **pending
> Spike D**. A condition is not closed while part of what it requires is unevidenced.

Why the distinction matters: DR-012 decides what the MVP *will support*. It does not establish that the
obtained package *falls inside* that support boundary. If Spike D finds non-axis-aligned geometry, RA-M02
escalates and a new Decision Request is required. Marking C6 closed would have hidden a live dependency
behind an approved policy.

#### Correction B — DR-008c remains OPEN despite SCQ-06

SCQ-06 **freezes the accuracy constraint before Spike B**; it does **not** settle the mesh budget.

| Item | State |
|---|---|
| **DR-008b** — 3D→slice tolerance | **FROZEN by SCQ-06.** Exact on canonical fixtures; **≤ ±1 source slice** on decimated real meshes. Spike B **validates conformance**, it does not re-derive the value. |
| **DR-008c** — mesh / decimation budget | **OPEN.** Spike B must determine it **while respecting the fixed maximum real-mesh picking error of ±1 source slice**. |

**A decimation level that exceeds ±1 source slice is not acceptable regardless of its frame rate.** If no
level satisfies both `NFR-PERF-002` and the ±1-slice ceiling, that is a valid negative result to be
escalated — **not** grounds for relaxing the ceiling.

---

### 9.2 DR-001 ✅ APPROVED — dataset acquisition contingency

**Spike D is P0.**

> **Escalation trigger.** If, **by the end of the first execution day of Spike D**, the team does **not**
> have a usable official package **locally**, **or** package/provenance validation reveals a **blocking
> defect** preventing GATE-DATA-01 acceptance — then **RA-H01 escalates to BLOCKER** and the **dataset
> contingency process opens**.

**Do not silently substitute a dataset.** Substitution is a protocol change requiring the full `00` §13
sequence: Decision Request → impact analysis → leader/spec-owner approval → specification update.

**Planning consequence.** Because the trigger fires at the **end of day one**, Spike D's day-one scope must
be ordered so that acquisition and a first-pass provenance read happen **before** deeper validation —
otherwise the trigger cannot be evaluated on time. **Resolves the RA-H01 escalation gap; RA-H01 itself
stays HIGH until the package is validated.**

---

### 9.3 DR-008a ✅ APPROVED — canonical indexing convention frozen → **closes C5**

```text
canonical voxel coordinate = (x, y, z)

  x = source image COLUMN
  y = source image ROW
  z = source SLICE INDEX

  shape_xyz    = [Nx, Ny, Nz]
  spacing_xyz  = [Sx, Sy, Sz]

  API slice_index = z,  valid range 0 .. Nz-1

  a logical source slice has shape [Ny, Nx]      (rows × columns)

  source pixel (u, v)  →  voxel (x = u, y = v, z = slice_index)

  origin: top-left source pixel is (0, 0)
          +x points RIGHT
          +y points DOWN
```

**Library-specific memory order is NOT part of the contract.** Whatever axis order a NRRD reader, array
library or rendering API uses internally is an implementation detail. **Adapters must conform to this
canonical representation at every boundary** — API payloads, artifact metadata, geometry fixtures, and the
mobile client's model of a slice.

**Consequences.**

- `05` `shape_xyz` / `spacing_xyz` are read in canonical `(x, y, z)` order, not file order.
- `11` §4's slice endpoints traverse **z**; range validation is `0 ≤ slice_index ≤ Nz-1`, and out-of-range
  returns `SLICE_OUT_OF_RANGE`.
- `11` §4's geometry response states this convention as its "axis/slice convention".
- `07` §3's "source slice extraction axis" is now fixed: **z**.
- Brush mapping (`07` §9, FR-REV-011) inverts the display transform to `(u, v)` and writes voxel
  `(x=u, y=v, z=slice_index)`.
- The `09` §6 canonical fixture set must encode a worked example in these terms; `TC-MAINT-002` verifies
  backend and mobile both conform.

**Resolves RA-H07. Closes condition C5. Unblocks Spike B and Spike F**, and unblocks parallel
backend/mobile geometry work — subject to the fixture set existing (`09` §12).

---

### 9.4 DR-009 ✅ APPROVED — review scope, concurrency, edit-session semantics

**Scope and identity**

1. A **Review is scoped to the exact `source_mask_id` and an explicit prediction variant.** A run whose raw
   prediction is ACCEPTED and whose processed prediction is FLAGGED is representable — they are distinct
   Reviews.

**Concurrency**

2. Review carries a **monotonic `revision`**.
3. Stale writes supply **`expected_revision`** and are rejected with **`STALE_REVISION`**.

**Working buffer**

4. **Mobile maintains the immediate local brush working buffer.**
5. The **server may hold the asynchronously synced working draft.**
6. **Interactive brush feedback never waits for the network.**

**Restart and durability**

7. **Restart recovery is guaranteed only to the last successfully synced working draft. Unsynced strokes may
   be lost.**

**Edit-session operations**

8. **Undo/redo is scoped to the current local editing session.**
9. **Cancel** discards uncommitted draft state **without deleting prior immutable `ReviewedMask` versions**.
10. **Reset-to-source** restores the **exact declared source mask**.
11. **Commit** creates a **new immutable `ReviewedMask` version** and **never overwrites the source
    prediction**.

**Why items 6 and 7 belong together.** Item 6 is what makes `NFR-PERF-003`'s 100 ms stroke-feedback target
achievable — the `11` §8 working-mask `PUT` is an **async sync channel, not the interaction path**. Item 7
is the honest cost of that choice. `NFR-REL-002` protects *persisted* review artifacts from silent
corruption; it does not promise durability for an unsynced in-flight stroke. `TC-REL-002` must be written
against this boundary, and the UI should make sync state legible so a reviewer is never misled about what
is safe.

**Resolves RA-H08 and RA-M10.** Unblocks the V4 review/correction schema and its API surface.

---

### 9.5 DR-010 ✅ APPROVED — operational definitions

#### Outlier

> The **three successfully evaluated cases with the lowest case-level 3D Dice**, for the **explicitly
> selected experiment and prediction variant**.
>
> **Tie-break:** higher absolute **FP+FN voxel count**, then **stable `case_id`**.

- **"Successfully evaluated" only** — failed/excluded cases are not candidates, consistent with `08` §8.1.
  The outlier list must be read alongside intended-vs-successful N (`NFR-REP-003`).
- **Experiment and variant are explicit inputs, never defaults** — `11` §6's no-silent-substitution rule
  applies.
- **Fixed cardinality of three** is deterministic and always non-empty for ≥ 3 evaluated cases, which an IQR
  rule would not guarantee.

#### Worst slice

Among slices with **non-empty ground truth**, rank by:

| Order | Key | Direction |
|---:|---|---|
| 1 | per-slice Dice | **ascending** |
| 2 | FP+FN voxel count | **descending** |
| 3 | `slice_index` | **ascending** |

- **Both-empty `NOT_APPLICABLE` slices are excluded**, consistent with `07` §6.
- **FP-only background slices may be surfaced separately as problematic FP slices** but **do not define the
  primary "worst anatomical slice"**. This is the correctness point: under `07` §6 an FP-only slice scores
  Dice `0` and would otherwise tie with — and often outrank — genuine anatomical failures, sending the
  `16` §2 demo to an uninformative slice.
- Key 3 guarantees a stable, reproducible ordering across builds.

**Resolves RA-H09 and RA-M13.**

---

### 9.6 DR-006 ✅ APPROVED — target demo device

**Samsung Galaxy A17 5G**, a **physical device** — not an emulator, because `NFR-PERF-002`'s FPS target and
`NFR-PERF-003`'s touch latency are not meaningfully measurable on one.

**Before any Spike A/B measurement**, capture the profile **directly from the device**:

| Field | Value |
|---|---|
| Model identifier | *(to record)* |
| Android version / build | *(to record)* |
| RAM / device performance profile | *(to record)* |
| CPU information available from tooling | *(to record)* |
| GPU information available from tooling | *(to record)* |
| Resolution / refresh rate | *(to record)* |
| Exact test configuration | *(to record: build type, thermal state, battery/power mode, background load, screen brightness, throttling observed)* |

**Do not infer unverified hardware details.** These readiness artifacts deliberately state **no** RAM,
chipset, GPU, resolution or refresh-rate values for this model. Record the captured profile under
`management/spikes/`; `TECH_STACK_ADR.md` **restates** it rather than originating it, per `10` §9.1.

**Resolves RA-H05** — the device is now declared *before* the spikes, breaking the circularity.
**Unblocks Spikes A, B and E.**

---

### 9.7 C8 ✅ CLOSED — declared availability

**All four members declare 8 hours/day.**

> **This is gross availability, not guaranteed coding capacity.**

**The future baseline must explicitly reserve leader time** for Project Control, reviews, EOD processing,
Claude orchestration, and integration coordination. That reserved time is **subtracted from the leader's
8 hours before any implementation task is assigned**.

**This audit still makes no numeric claim about effective team capacity.** `15` §5 requires planning from
actual available hours; 8 h/day × 4 members is **not** 32 h/day of implementation throughput, and treating
it as such in the baseline would reproduce exactly the over-optimism `15` §5 forbids. The reserved-time
figure must be set by the leader and recorded. **RISK-CAP-01 stays MEDIUM.**

---

### 9.8 Conditions kept open by this round

| Condition | Kept open pending |
|---|---|
| **C3** | **explicit leader confirmation of `LOCAL_DEMO` vs `REMOTE_DEMO`.** Until confirmed, both profiles remain live, `REMOTE_DEMO` obligations stay in planning, and **RA-H04** and **RA-H17** stay open. `LOCAL_DEMO` must **not** inherit remote-authentication or public-dataset-transport requirements. |
| **C7** | **named technical ownership assignments** (DR-013). **V1–V4 must be preserved**; the matrix is an *additional* axis over the same four members. |

---

### 9.9 Findings closed by Round 2

| Finding | Was | Closed by | Now |
|---|---|---|---|
| **RA-H05** | HIGH — spike/device circularity | DR-006 ✅ | **RESOLVED** |
| **RA-H07** | HIGH — axis/index convention unfixed | DR-008a ✅ | **RESOLVED** |
| **RA-H08** | HIGH — Review lacks revision; no variant scope | DR-009 ✅ | **RESOLVED** |
| **RA-H09** | HIGH — "outlier" undefined | DR-010 ✅ | **RESOLVED** |
| **RA-M10** | MEDIUM — working-mask session semantics | DR-009 ✅ | **RESOLVED** |
| **RA-M13** | MEDIUM — "worst slice" undefined | DR-010 ✅ | **RESOLVED** |
| **RA-H01** | HIGH — no escalation trigger | DR-001 ✅ | **MITIGATED** — trigger defined; stays HIGH until the package is validated |
| **RA-H14** | HIGH — no mesh budget | DR-008c | **STILL OPEN**, bounded at ≤ ±1 slice |
| **RA-M02** | MEDIUM — oblique geometry | DR-012 ✅ | **POLICY RESOLVED; evidence pending Spike D** (see Correction A) |

**Remaining open HIGH findings (8):** RA-H01 (mitigated), RA-H02, RA-H04 *(conditional — REMOTE_DEMO)*,
RA-H10, RA-H11 *(bounded)*, RA-H13, RA-H14 *(bounded)*, RA-H17 *(conditional — REMOTE_DEMO)*.

**BLOCKER count unchanged: RA-B01** remains the single BLOCKER, still scoped to the 3D-error feature, still
requiring Spike F and DR-005.

---

### 9.10 Decision status of record — after Round 2 — *SUPERSEDED by §10.5*

| Status | Count | Decisions |
|---|---:|---|
| **✅ APPROVED** | **10** | DR-001, DR-004, DR-006, DR-007, **DR-008a**, DR-009, DR-010, DR-011, DR-012, DR-014 |
| **FROZEN by clarification** | 1 | **DR-008b** — tolerance fixed by SCQ-06; Spike B validates conformance |
| **⏸ PENDING LEADER CONFIRMATION** | 1 | DR-003 (`LOCAL_DEMO` proposed) |
| **OPEN** | 4 | DR-002, DR-005, **DR-008c**, DR-013 |
| **Controlled gates OPEN** | 5 | DR-G01, DR-G02, DR-G03 *(closes only after Spike C1)*, DR-G04, DR-G05 |
| **Controlled gate PENDING** | 1 | DR-G06 (via DR-003) |
| **⚠ NOT RULED ON** | **0** | — all four Round-1 gaps are now decided |

---

### 9.11 Condition status — after Round 2 — *SUPERSEDED by §10.6* (C3 and C7 have since CLOSED)

| # | Condition | Status | Basis |
|---|---|---|---|
| **C1** | Spike D completes; `DATASET_AUDIT.md` + manifest ACCEPTED | **OPEN** | Spike D not executed. DR-001 ✅ now defines the end-of-day-one escalation trigger. Also gates Spike C1 and C6's evidence. |
| **C2** | Precomputed artifact ingestion contract approved | **✅ CLOSED** | DR-004 ✅ — offline CLI + versioned manifests, **two** separate contracts. Specification of both is now scheduled work. |
| **C3** | Deployment mode declared before API freeze | **OPEN — ⏸ pending leader confirmation** | `LOCAL_DEMO` **proposed only**. RA-H04 and RA-H17 stay open. |
| **C4** | RA-B01 resolved — 3D error pipeline defined | **OPEN** | DR-005 OPEN; Spike F unblocked but not executed. The single BLOCKER. |
| **C5** | Canonical slice-axis / index-order convention declared | **✅ CLOSED** | **DR-008a ✅** — convention frozen (§9.3). |
| **C6** | Geometry support boundary declared **and confirmed against the validated package** | **OPEN — PARTIALLY_RESOLVED** | **Policy approved** (DR-012 ✅: axis-aligned only, `GEOMETRY_NOT_VALIDATED` rejection). **Evidence pending Spike D.** Corrected from §6. |
| **C7** | Technical-block ownership/reviewer matrix | **OPEN** | DR-013 OPEN — pending named assignments. V1–V4 preserved. |
| **C8** | Member availability declared so capacity is computed | **✅ CLOSED** | All four members declare **8 h/day gross**; baseline must reserve leader time (§9.7). |

```
CLOSED  : C2, C5, C8                     (3 of 8)
OPEN    : C1, C3, C4, C6*, C7            (5 of 8)
          C6* = PARTIALLY_RESOLVED — policy approved, evidence pending Spike D
          C3  = pending a single leader confirmation
```

**Verdict unchanged: `READY_WITH_CONDITIONS`.** Round 2 closed two conditions (C5, C8) and correctly
reopened one (C6), for a net of **+1 closed**. The 30-day implementation baseline remains **unauthorised**.

---

### 9.12 What is authorised after Round 2 — *SUPERSEDED by §10.9*

**Authorised — spikes now unblocked (six of seven stages):**

| Spike | Prerequisite | State |
|---|---|---|
| **Spike D** | none | **P0 — unblocked**, escalation trigger defined |
| **Spike C0** | none | **unblocked** (synthetic data) |
| **Spike A** | DR-006 ✅ | **unblocked** — capture device profile first |
| **Spike B** | DR-006 ✅, DR-008a ✅ | **unblocked** — validate exact fixtures; find mesh budget within ±1 slice |
| **Spike E** | DR-006 ✅ | **unblocked** |
| **Spike F** | DR-008a ✅ | **unblocked** — may start on synthetic mask pairs |
| **Spike C1** | **Spike D** | **still blocked** |

Also authorised: specifying the two DR-004 ingestion contracts; building the `09` §6 canonical geometry
fixture set against the frozen DR-008a convention; the V4 review schema against the DR-009 semantics;
outlier/worst-slice implementation against DR-010; confirming or rejecting DR-003.

**Not authorised — and not done:**

- **Executing any spike.** This document records authorisation to *start*; **no spike has been executed**,
  and no `management/spikes/` directory exists.
- Creating `MASTER_PLAN_30_DAYS.md` or any daily plan.
- Selecting a technology stack (GATE-MOB-01 awaits Spike A/B evidence).
- Any production repository module.
- Any edit to `docs/specs/v1.0/`.

---

## 10. Round 3 — final free readiness conditions (2026-09-08)

**This section is authoritative. It supersedes §5–§7 and §9.10–§9.12 wherever they differ.**

Round 3 closed the two conditions that were still **free leader decisions** rather than evidence-dependent:
**C7** (ownership) and **C3** (deployment profile). **All previously approved corrections, Specification
Owner clarifications, DR decisions, condition states and mechanical-count corrections are preserved
unchanged.**

---

### 10.1 Team composition of record

| # | Member | Role |
|---:|---|---|
| 1 | **Phạm Tuấn Anh** | Team Leader |
| 2 | **Vũ Hùng Anh** | Member |
| 3 | **Bế Quốc Khánh** | Member |
| 4 | **Nguyễn Gia Đức Trung** | Member |

All four have broadly similar exposure to the project domains. **Phạm Tuấn Anh** and **Vũ Hùng Anh** have
materially stronger overall experience and capability, and are **deliberately positioned as secondary
reviewers and safety nets** rather than as owners of every critical block.

**Declared availability: 8 hours/day per member — gross availability only.**

> The future implementation baseline **MUST NOT** treat `4 × 8h = 32h/day` as guaranteed feature-development
> capacity.

Phạm Tuấn Anh's time must later reserve explicit capacity for: **Project Control; integration coordination;
code/review work; EOD processing; Claude orchestration; blocker handling; cross-contract coordination.**

**No effective-capacity number is invented here.** `15` §5 requires planning from actual available hours; the
reserved-time figure is a leader decision to be recorded during baseline planning.

---

### 10.2 DR-013 ✅ APPROVED — two parallel ownership axes → **closes C7**

#### Axis A — Mobile vertical ownership (PRESERVED)

This axis **must remain**: every member must analyse, design, implement, test, demonstrate and defend at
least one mobile function end-to-end for the university course (`00` §3, PR-MOBILE-03, `16` §5.1 CLO3,
`TC-TEAM-001`).

| Vertical | Scope | Primary Owner | Secondary Reviewer |
|---|---|---|---|
| **V1** | Case Explorer / 2D MRI | **Phạm Tuấn Anh** | Vũ Hùng Anh |
| **V2** | 3D / Spatial Error Investigation | **Vũ Hùng Anh** | Phạm Tuấn Anh |
| **V3** | Experiment / Cohort Analysis | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **V4** | Review / Findings | **Nguyễn Gia Đức Trung** | Phạm Tuấn Anh |

#### Axis B — Technical-block ownership (NEW; additional, not a replacement)

| Block | Primary Owner | Secondary Reviewer |
|---|---|---|
| **Imaging / Geometry / canonical 2D↔3 contract** | **Vũ Hùng Anh** | Phạm Tuấn Anh |
| **ML Training / Evaluation Pipeline** | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **Backend / Persistence / Raw Dataset Ingestion / Experiment Artifact Ingestion** | **Nguyễn Gia Đức Trung** | Phạm Tuấn Anh |
| **Integration / CI / Cross-contract Coordination** | **Phạm Tuấn Anh** | Vũ Hùng Anh |

**Every member is a Primary Owner on both axes, and every block has a named Secondary Reviewer** — which is
what `14` §5–§6 require and exactly what RA-M04 flagged as missing.

The geometry contract — which `13` §12 classes as a P0-class defect area and which RA-H07 and
RISK-3D-GEOMETRY both demanded an owner for — is now owned by **Vũ Hùng Anh** with **Phạm Tuấn Anh** as
reviewer, coherently with V2.

#### Ownership governance

**A Primary Owner is accountable for:** understanding the block; implementation; tests; acceptance evidence;
debugging; technical handoff; block documentation; and being able to explain and defend the work.

**Primary ownership does NOT confer authority to silently change** any of: frozen product requirements,
dataset protocol, split protocol, ML protocol, metric semantics, geometry semantics, domain-model semantics,
API contracts, deployment policy, or acceptance criteria. Every such change remains governed by the existing
gate / Decision Request / specification change-control process (`00` §13, `17` §11).

**A Secondary Reviewer must be able to:** independently explain the block; review its design; review its PRs
and evidence; run or reproduce critical workflows where applicable; and help debug it when the Primary Owner
is blocked — the `14` §6 knowledge-handoff rule made concrete.

#### Anti-bottleneck rule — binding

> **Do not move ML ownership from Bế Quốc Khánh to Vũ Hùng Anh merely for short-term speed.**
> **Do not move Backend ownership from Nguyễn Gia Đức Trung to Phạm Tuấn Anh merely for short-term speed.**

Bế Quốc Khánh and Nguyễn Gia Đức Trung are **genuine Primary Owners, not assistants**. `15` §18 Levels 1
and 2 remain available under genuine recovery conditions, but reallocation is a **leader recovery decision
with recorded rationale**, never a default response to a slow day — and **pairing** preserves ownership where
**transferring** destroys it, along with the `TC-TEAM-001` evidence chain.

**Resolves RA-M04. Closes condition C7.**

---

### 10.3 DR-003 ✅ APPROVED — `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS → **closes C3**

> **Critical interpretation.** `LOCAL_DEMO` denotes the **trust / exposure profile**, **not** physical
> co-location. The backend is deliberately **physically remote** from the demo venue.

#### Canonical topology

```text
Samsung Galaxy A17 5G          (single authorised physical demo device)
        |
        |  4G / 5G cellular Internet
        v
Authenticated private overlay  (ZeroTier network)
        |
        v
Remote Mac mini M2, 24 GB RAM
        +-- Backend API
        +-- Database / persistence
        +-- MRI volumes and masks
        +-- Metrics
        +-- Reconstruction / experiment artifacts
```

#### Trust boundary

**Authorised private-overlay (ZeroTier network) device membership — NOT physical network membership.** Only explicitly
authorised overlay devices may reach the backend.

**The physical school/venue Wi-Fi is explicitly NOT required for the canonical demo, is NOT part of the
trusted boundary, and must NOT be treated as a trusted LAN.**

#### Components

| Component | Decision |
|---|---|
| **Mobile client** | **Samsung Galaxy A17 5G** — the canonical demo runs **only** on this single authorised physical device. Hardware profile still recorded **from the device** under DR-006; **no inferred hardware details.** |
| **Server** | **Mac mini M2, 24 GB RAM**, physically remote from the venue. May host backend API, persistence, MRI/mask artifacts, metrics, precomputed prediction artifacts, 3D reconstruction artifacts. |
| **Training** | **Not required to occur on the Mac mini.** ML training may run on separate compute hardware — Spike C0/C1 measure whatever hardware is actually used. |

#### Public exposure — what the MVP does NOT require

no public API endpoint · no public port forwarding · no public domain · no public unauthenticated server
exposure · no public dataset-serving endpoint.

**Public/consumer authentication is outside the MVP critical path. Do not introduce a public authentication
system merely because the Mac mini is physically remote** — the private authenticated overlay *is* the
network-access boundary.

#### Obligations explicitly RETAINED

This profile waives **only** the public-authentication and public-exposure obligations:

| Retained obligation | Source |
|---|---|
| Secrets protection; secrets never in source control | `12` §6, NFR-SEC-004, `TC-SEC-004` |
| No credentials embedded in the mobile binary | `12` §6, §8.1, `TC-SEC-004` |
| Safe logging — no raw image/mask payloads, no credentials | `12` §7, NFR-SEC-003, `TC-SEC-003` |
| Dataset metadata allowlist | `12` §2, NFR-SEC-005, `TC-SEC-005` |
| No open artifact-directory enumeration | `12` §5, §8.1 |
| Write attribution / reviewer identity where review provenance is stored | `12` §5, `05` Review, FR-REV-010 |
| Private-device access restriction — authorised overlay devices only | `12` §5, this decision |
| Exposure check — backend unreachable beyond the trusted boundary | `12` §8.1, `TC-SEC-002` |

**[NOTE on `TC-SEC-002`]** It reads "REMOTE_DEMO uses TLS; LOCAL_DEMO exposure matches its approved
trusted-network profile." The second clause is operative, and "approved trusted-network profile" means
**overlay membership** — so the test must verify the backend is unreachable from a **non-overlay** device,
including one sitting on the same physical Wi-Fi.

**[NOTE on `12` §3]** Dataset-governance duties — preserve license terms, do not redistribute outside
permitted terms, record source/acquisition/checksum — are **unaffected**. They bind how the team handles the
package regardless of deployment topology.

#### Demo connectivity fallback — required, and bounded

The plan **must preserve a MINIMAL connectivity-failure fallback for the canonical hero demo**. Valid
mechanisms include preloaded canonical demo artifacts, cached canonical case data, or cached/precomputed
results sufficient to demonstrate the critical hero flow.

> **Scope firewall.** This is a **demo-resilience measure only**. It **must not** silently become a full
> offline-mode product requirement, a second application architecture, or a requirement to run backend
> functionality on the phone. Any such expansion is a scope change under `00` §13 and `03` §5. Note
> `PR-CACHE-01` (offline-friendly caching) is a **SHOULD** — the fallback must not promote it into the MUST
> floor by the back door.

The exact mechanism is decided **later during planning, after Spike E** — it is **not** a readiness condition.

#### Consequences recorded

- **DR-003 = APPROVED.** Profile: **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS**.
- **DR-G06 / GATE-DEPLOY-01 = RESOLVED.**
- **C3 = CLOSED.**
- **RA-H04 = CLOSED / NOT APPLICABLE** — no `REMOTE_DEMO` public authentication surface is required, so the
  API contract needs no public auth surface and the RA-H04 sequencing hazard cannot arise.
- **RA-H17 = CLOSED / NOT APPLICABLE** — no public dataset-serving endpoint is part of the MVP.
- **Do not propagate `REMOTE_DEMO` authentication or public dataset-transport requirements into the critical
  path.**
- **Spike E is materially affected:** the transport path is **cellular + overlay**, not a LAN. Latency,
  jitter and variability must be measured on that path, and Spike E now also informs the fallback mechanism.

---

### 10.4 Findings closed by Round 3

| Finding | Was | Closed by | Now |
|---|---|---|---|
| **RA-M04** | MEDIUM — technical-block ownership missing | DR-013 ✅ | **RESOLVED** |
| **RA-H04** | HIGH *(conditional)* — GATE-DEPLOY-01 sequenced after API freeze | DR-003 ✅ | **CLOSED / NOT APPLICABLE** under the selected profile |
| **RA-H17** | HIGH *(conditional)* — dataset redistribution under `REMOTE_DEMO` | DR-003 ✅ | **CLOSED / NOT APPLICABLE** under the selected profile |

**Remaining open HIGH findings (6):** RA-H01 *(mitigated — trigger defined; awaits Spike D)*, RA-H02
*(awaits Spike D)*, RA-H10 *(MUST scope volume — shapes the baseline)*, RA-H11 *(bounded at ±1 slice; Spike
B validates)*, RA-H13 *(awaits Spike E)*, RA-H14 *(bounded; awaits Spike B)*.

**BLOCKER count unchanged: RA-B01** remains the single BLOCKER, scoped to the 3D-error feature, awaiting
Spike F and DR-005.

---

### 10.5 Decision status of record — authoritative, after Round 3

| Status | Count | Decisions |
|---|---:|---|
| **✅ APPROVED** | **12** | DR-001, **DR-003**, DR-004, DR-006, DR-007, DR-008a, DR-009, DR-010, DR-011, DR-012, **DR-013**, DR-014 |
| **FROZEN by clarification** | 1 | DR-008b — tolerance fixed by SCQ-06; Spike B validates conformance |
| **OPEN — evidence-driven** | 3 | DR-002 *(Spike D)*, DR-005 *(Spike F)*, DR-008c *(Spike B)* |
| **Controlled gates — spike-awaiting** | 5 | DR-G01, DR-G02, DR-G03 *(closes only after Spike C1)*, DR-G04, DR-G05 |
| **Controlled gates — RESOLVED** | 1 | **DR-G06 / GATE-DEPLOY-01** (via DR-003) |
| **⏸ PENDING LEADER CONFIRMATION** | **0** | — |
| **⚠ NOT RULED ON** | **0** | — |

> **No free leader decision remains open.** Every open item below is now classified by *what kind of
> evidence* unblocks it, per the classification in §10.7.

---

### 10.6 Condition status — authoritative, after Round 3

| # | Condition | Status | Basis |
|---|---|---|---|
| **C1** | Spike D completes; `DATASET_AUDIT.md` + manifest ACCEPTED, resolving GATE-DATA-01 and Path A/B provenance | **OPEN** | Waiting for **Spike D**: dataset acquisition + validation + GATE-DATA-01 evidence. DR-001 ✅ defines the end-of-day-one escalation trigger. |
| **C2** | Precomputed artifact ingestion contract approved | **✅ CLOSED** | DR-004 ✅ — ingestion policy/contracts approved (two separate contracts, offline CLI + versioned manifests). |
| **C3** | Deployment mode declared before API freeze | **✅ CLOSED** | **DR-003 ✅ — `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS approved.** |
| **C4** | RA-B01 resolved — 3D error pipeline defined | **OPEN** | Waiting for **Spike F** evidence and the DR-005 decision. The single BLOCKER. |
| **C5** | Canonical slice-axis / index-order convention declared | **✅ CLOSED** | DR-008a ✅ — canonical voxel/slice/index convention approved. |
| **C6** | Geometry support boundary declared **and confirmed against the validated package** | **OPEN / PARTIALLY_RESOLVED** | **Axis-aligned-only policy approved** (DR-012 ✅). **Still awaiting confirmation against the actual validated dataset from Spike D.** Must **not** be marked CLOSED before that evidence exists. |
| **C7** | Technical-block ownership/reviewer matrix added alongside V1–V4 | **✅ CLOSED** | **DR-013 ✅ — mobile vertical + technical-block ownership matrix approved.** |
| **C8** | Member availability declared so capacity is computed | **✅ CLOSED** | All four members declared **8 h/day gross** availability. |

```
CLOSED  : C2, C3, C5, C7, C8              (5 of 8)
OPEN    : C1, C4, C6*                     (3 of 8)
          C6* = PARTIALLY_RESOLVED - policy approved, evidence pending Spike D
```

**All three remaining open conditions are evidence-driven:**

```
C1  ->  Spike D
C4  ->  Spike F
C6  ->  Spike D confirmation
```

**No free ownership or deployment decision remains open.**

---

### 10.7 Classification of remaining open items

Per the Round-3 directive, remaining open items are classified so none is mistaken for an unresolved
readiness blocker:

| Item | Class | Unblocked by |
|---|---|---|
| **DR-002** — split path A vs B | **decision requiring dataset evidence** | Spike D |
| **DR-005** — 3D error pipeline (**RA-B01**, the only BLOCKER) | **decision requiring technical evidence** | Spike F |
| **DR-008c** — mesh / decimation budget | **decision requiring technical evidence**, bounded at ≤ ±1 source slice | Spike B |
| **DR-G01** — GATE-DATA-01 | **controlled gate awaiting a spike** | Spike D |
| **DR-G02** — GATE-SPLIT-01 | **controlled gate awaiting a spike** | Spike D, then DR-002 |
| **DR-G03** — GATE-ML-01 | **controlled gate awaiting a spike** | **Spike C1** (Spike C0 evidence is insufficient) |
| **DR-G04** — GATE-IMG-01 | **controlled gate awaiting a spike** | DR-G03, then imaging ablation setup |
| **DR-G05** — GATE-MOB-01 | **controlled gate awaiting a spike** | Spikes A + B |
| **DR-014** — 95% CI reporting | **APPROVED; report-only obligation** | nothing — applies when the report is written |
| **SCQ-07** — metric-semantics FR | **answered; future-spec-revision item** | the next specification revision; `TC-EXP-009` stays an orphan in v1.0 until then |
| **RA-H10** — MUST scope volume | **baseline-shaping finding**, not a gate | leader de-scope preparation during baseline authoring |
| Demo connectivity fallback mechanism | **later planning decision** | Spike E, then baseline planning |

**None of the above is a readiness blocker except DR-005 / RA-B01**, which is feature-scoped to the
3D-error capability.

---

### 10.8 Readiness verdict

Unchanged: **`READY_WITH_CONDITIONS`**.

Round 3 closed **C3** and **C7**, bringing the tally to **five of eight conditions closed**. The three that
remain are each waiting on a spike, not on a decision. The 30-day implementation baseline remains
**unauthorised** until they close or are explicitly scheduled.

---

### 10.9 What is authorised after Round 3

**Authorised.** Everything authorised after Round 2, plus:

- Building the two DR-004 ingestion contracts against the now-fixed deployment topology.
- Designing the API contract without a public authentication surface (`GATE-DEPLOY-01` resolved).
- Planning task allocation against the DR-013 ownership matrix.
- Spike E measuring the **cellular + private-overlay** transport path.

All seven spike stages have their prerequisites resolved **except Spike C1**, which waits on Spike D.

**Not authorised — and not done:**

- **Executing any technical spike.** No spike has been executed; **`management/spikes/` does not exist**.
- Creating `MASTER_PLAN_30_DAYS.md` or any daily plan.
- **Selecting or freezing a mobile framework** — `GATE-MOB-01` still awaits Spike A/B evidence.
- Creating any production repository module.
- Any edit to `docs/specs/v1.0/`.

---

## 11. Phase transition — Readiness Decision Phase CLOSED, Spike Phase OPEN

**Recorded 2026-09-08.**

The Team Leader accepted and **CLOSED the Readiness Decision Phase**, and **authorised the Technical Spike
Phase**. Project verdict remains **`READY_WITH_CONDITIONS`** with three evidence-driven conditions:

```
C1 -> Spike D            C4 -> Spike F            C6 -> Spike D confirmation
```

**All free leader/spec-owner decisions required before spike execution are resolved.** Twelve DRs approved;
DR-002, DR-005 and DR-008c remain open, each awaiting a spike.

### Spike Phase control artifacts

`management/spikes/SPIKE_PHASE_PLAN.md` · `management/spikes/SPIKE_PHASE_STATE.yaml` · and one
`TASK.md` + `EVIDENCE_TEMPLATE.md` per spike directory (`SPIKE_D_DATASET`, `SPIKE_A_2D`, `SPIKE_B_3D`,
`SPIKE_C_ML`, `SPIKE_E_TRANSPORT`, `SPIKE_F_3D_ERROR`).

**Corrected status semantics.** `ACTIVE` means **actual execution has started**. An authorised spike whose
owner has not started, and whose `started_at` is `null`, is **`PREPARED`** — never `ACTIVE`. On starting, the
owner sets `ACTIVE` and records the **real** `started_at`, never backdated.

**Current states:** Spike **D, A, B, E, C0, F = PREPARED** · Spike **C1 = BLOCKED** (`blocked_by: SPIKE_D`).

> **No spike is ACTIVE. Every `started_at` is `null`. No `RESULT.md` exists anywhere.**

**Intended first execution wave when the humans begin:** Bế Quốc Khánh → Spike D · Phạm Tuấn Anh → Spike A ·
Vũ Hùng Anh → Spike B · Nguyễn Gia Đức Trung → Spike E.

### Both WIP conflicts — RESOLVED

| ID | Resolution |
|---|---|
| **WIP-CONFLICT-01** | **`RESOLVED_BY_REVIEW_SERIALIZATION`.** Reviewer assignments are **not** changed. A member may hold at most **one** review in `REVIEWING` at a time; a second stays `QUEUED_FOR_REVIEW`. Priority: **Spike D → Spike A** for Vũ Hùng Anh (D is P0); **Spike B → Spike E** for Phạm Tuấn Anh (B is P1 and feeds `GATE-MOB-01` + DR-008c; E is P2). Pre-emption: the lower-priority spike may be reviewed while the higher one is not ready, but the higher one takes the **next** slot once it becomes `EVIDENCE_READY`. **Reviewer ownership must not be changed to dodge scheduling.** |
| **WIP-CONFLICT-02** | **`RESOLVED_BY_DEVICE_MEASUREMENT_SERIALIZATION`.** The project has **exactly ONE** authorised physical Galaxy A17 5G. Harness/code preparation for Spikes A, B, E proceeds **in parallel**; **physical-device measurement windows may not overlap**. Reserved measurement order: **Spike A → Spike B → Spike E** — measurement access only, not all implementation work. |

Details: `SPIKE_PHASE_PLAN.md` §4.2–§4.3. **No leader decision is outstanding for this wave.**

### Acceptance workflow — four required steps

`Owner executes → EVIDENCE_READY → Secondary Reviewer (APPROVE / NEEDS_FIX) → CHAT E QA Red Team
(PASS / REJECT) → CHAT A Project Control transition → ACCEPTED.`

**No spike becomes `ACCEPTED` merely because `RESULT.md` exists.** A QA REJECT blocks acceptance regardless
of owner or reviewer opinion, and for the evidence-driven gates — **Spike D, B and F** — QA must inspect the
**actual recorded evidence** relevant to the gate, not only the summary verdict.

### Still not authorised

`MASTER_PLAN_30_DAYS.md` · Day-1 production feature plan · final repository architecture · final mobile
stack (`GATE-MOB-01` needs Spikes A + B) · final DINOv2 recipe (`GATE-ML-01` needs Spike C1) · production
feature implementation · any edit to `docs/specs/v1.0/`.

---

### 9.13 Mechanical verification after Round 2

Re-run after every Round-2 edit:

| Check | Result |
|---|---|
| `sha256sum -c SPEC_MANIFEST_SHA256.txt` | **19/19 OK** — `docs/specs/v1.0/` untouched |
| `git status --porcelain` | additions only under `management/readiness/` |
| Requirement IDs cited across all readiness artifacts | all resolve against the spec-derived sets — PR, FR, NFR, UC, TC, SCR, GATE, EXP |
| Decisions still marked **⚠ NOT RULED ON** | **0** (was 4 after Round 1) |
| Frozen canonical convention present | `canonical voxel coordinate = (x, y, z)` recorded in `OPEN_DECISIONS.md` and here |
| ±1-source-slice ceiling propagated | present in 5 artifacts: `OPEN_DECISIONS`, `READINESS_REVIEW_RESOLUTION`, `RISK_REGISTER_INITIAL`, `SPEC_CLARIFICATION_REQUESTS`, `TECHNICAL_SPIKES_REQUIRED` |
| Declared device propagated | `Samsung Galaxy A17 5G` in 4 artifacts; **no inferred hardware values anywhere** |
| C6 recorded as PARTIALLY_RESOLVED | yes — §9.1 Correction A and §9.11 |
| `IMPLEMENTATION_READINESS_STATUS.md` final line | exactly one permitted verdict: `READY_WITH_CONDITIONS` |
| `management/spikes/` exists? | **no** — no spike executed |
| `MASTER_PLAN_30_DAYS.md` exists? | **no** — no plan created |

---

**Artifact set**

| File | Role after both rounds |
|---|---|
| `IMPLEMENTATION_READINESS_AUDIT.md` | as-of-audit finding record; corrections applied, findings not rewritten |
| `OPEN_DECISIONS.md` | per-DR status markers for both rounds; approved outcomes recorded inline for all ten approved decisions |
| `TECHNICAL_SPIKES_REQUIRED.md` | Spike C split into C0/C1; parallelism wording corrected; declared-device and prerequisite-status tables added; Spike B bounded at ±1 slice; Spike D escalation trigger recorded |
| `RISK_REGISTER_INITIAL.md` | HIGH count corrected to 7; residual-risk notes added after each Round-2 decision |
| `SPEC_CLARIFICATION_REQUESTS.md` | all nine answers recorded inline |
| `IMPLEMENTATION_READINESS_STATUS.md` | verdict unchanged (`READY_WITH_CONDITIONS`); superseded on condition status by §9.11 of this document |
| **`READINESS_REVIEW_RESOLUTION.md`** | **this document — authoritative on post-review state.** §1–§8 record Round 1; **§9 records Round 2 and supersedes §5–§7** |
