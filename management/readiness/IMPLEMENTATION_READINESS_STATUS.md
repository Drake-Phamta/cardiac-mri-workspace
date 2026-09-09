# IMPLEMENTATION READINESS STATUS

**Project:** AI-assisted Cardiac MRI Research Workspace
**Subject:** Frozen Specification v1.0 (`docs/specs/v1.0/`, files `00`–`17`)
**Audit:** independent second-pass implementation-readiness audit per `17` §5 Step 1
**Date:** 2026-09-08
**Prepared by:** Project Control

---

> **Reviewed and accepted with corrections by the specification owner, 2026-09-08.**
> Corrections have been applied to this file. For the authoritative post-review state — decision
> statuses, the nine answered clarifications, and condition status C1–C8 — see
> **`READINESS_REVIEW_RESOLUTION.md`**, which governs where it differs from this file.

## 1. Executive summary

Frozen Specification v1.0 is a **strong specification set**. Its traceability spine is mechanically
complete, its provenance and scientific-honesty controls are unusually rigorous for a project of this
scale, and its team-execution rules are more disciplined than typical. This audit recommends **no
weakening of any of it**.

The audit found **38 findings**: **1 BLOCKER**, **15 HIGH**, **16 MEDIUM**, **6 LOW**. The single
BLOCKER is scoped to one feature. Most HIGH findings are **absences that require a decision**, not
defects requiring rework — and every one of them has a bounded resolution path.

The audit also found that the **prior audit report's structural counts are wrong**, which is material
because that report's self-certification was the basis for the freeze.

**Recommendation:** proceed with remediation and spike work now; do not author the 30-day implementation
baseline until the eight conditions in §6 are closed.

---

## 2. Specification integrity and corrected counts

### 2.1 Integrity

```
sha256sum -c SPEC_MANIFEST_SHA256.txt   →   19/19 OK
```

Verified before the audit and again after these artifacts were written. **No file under
`docs/specs/v1.0/` was modified.**

### 2.2 Authoritative requirement inventory

These counts were derived mechanically and are **authoritative** for all planning, traceability, and
reporting artifacts:

| Item | Verified count |
|---|---:|
| Product requirements (`03`) | **39** |
| — MUST | **28** |
| — SHOULD | **6** |
| — COULD | **5** |
| Functional + non-functional requirements (`04`) | **79** |
| — MUST | **75** |
| — SHOULD (`FR-AN-*`, live analysis) | **4** |
| Use cases (`02`) | **17** |
| Screens (`10`) | **9** |
| Acceptance tests (`13`) | **69** |

### 2.3 Correction to `SPEC_AUDIT_REPORT_v1_0.md`

| Metric | Prior report claims | Verified actual |
|---|---:|---:|
| Product requirements | 44 | **39** |
| — MUST | 33 | **28** |
| Acceptance test IDs | 70 (§2) / 69 (AUD-03) | **69** |

**The frozen specification files themselves are correct.** `13` §4 maps all 39 product requirements and
`13` §10 covers all 79 FR/NFR with zero gaps in either direction. Only the *report's* summary counts are
wrong.

This matters as a process signal rather than as a defect: the report describes an "automated consistency
check" whose results are not reproducible. It is the reason `17` §5 Step 1 mandates an independent
second audit, and that mandate was justified.

---

## 2.4 Declared execution context (Round 3)

| Item | Decision |
|---|---|
| **Team** | Phạm Tuấn Anh (Leader) · Vũ Hùng Anh · Bế Quốc Khánh · Nguyễn Gia Đức Trung |
| **Availability** | 8 h/day/member — **gross**, not guaranteed feature-development capacity |
| **Ownership** | Two axes: mobile verticals V1–V4 (preserved) **+** technical blocks. Every member is a Primary Owner on both; every block has a named Secondary Reviewer. |
| **Deployment profile** | **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS.** Trust boundary is authorised private-overlay device membership, **not** physical network membership. Backend is **physically remote**; venue Wi-Fi is **not** trusted and **not** required. |
| **Demo device** | Samsung Galaxy A17 5G — single authorised physical device; hardware profile recorded from the device, never inferred |
| **Server** | Mac mini M2, 24 GB RAM, physically remote. Training may run on separate hardware. |
| **Public exposure** | **None required** — no public endpoint, port forwarding, domain, or dataset-serving endpoint. Public authentication is outside the MVP critical path. |

Full detail and retained security obligations: `READINESS_REVIEW_RESOLUTION.md` §10.

---

## 3. What is genuinely ready

Stated explicitly so it is not traded away under schedule pressure (`15` §18 recovery, `13` §12 P0/P1
override):

| Area | Assessment |
|---|---|
| **Traceability (`13`)** | 79/79 FR/NFR test-covered; 39/39 PRs mapped; no undefined PR/UC/SCR/TC IDs; one orphan test (`TC-EXP-009`). Verified independently. |
| **Provenance model (`05` §3–§4, `07` §4, `11` §8)** | Raw-prediction immutability, versioned reviewed masks with parent chains, explicit prediction-variant labelling — coherent across four files. |
| **Scientific honesty (`03`, `07`, `08`, `12`)** | `PR-SCI-03` + `TC-SCI-003` (null results acceptable), the comparable-run gate (`08` §7), the failed-case protocol (`08` §8.1), and the empty-slice rule (`07` §6) close the common ways a project accidentally fabricates a result. |
| **Mode gating (`00` §7, `02` §5, `11` §10)** | Evaluation vs Inference & Review separation is enforced consistently down to API error codes. |
| **Privacy (`12`)** | Proportionate and testable: metadata allowlist, two deployment profiles, log rules, cache versioning, an explicit acceptance gate. |
| **Team execution (`15` §8–§11)** | Protected `main`, one branch owner, squash default, sync rule, collision detection, WIP limits, review windows. Needs no change. |
| **Course alignment (`14`, `16`)** | V1–V4 verticals, per-member evidence package, CLO1/CLO2/CLO3 trace, `TC-TEAM-001`. Sound; must be preserved. |
| **NFR measurability (`04` §2)** | Device-anchored, numeric performance targets — a genuine improvement over typical specifications at this scale. |

---

## 4. Findings

### 4.1 By severity

| Severity | Count | IDs |
|---|---:|---|
| **BLOCKER** | 1 | RA-B01 |
| **HIGH** | 15 | RA-H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H13, H14, H16, H17 |
| **MEDIUM** | 16 | RA-M01 … RA-M16 |
| **LOW** | 6 | RA-L01 … RA-L06 |
| **Total** | **38** | |

### 4.2 The BLOCKER

**RA-B01 — the 3D error pipeline is a MUST requirement with no specification.**
`FR-3D-007`/`FR-3D-008` require generating a 3D error representation and resolving a selected error
region to contributing slices. `07` §7 specifies reconstruction of a single LA surface only. Nothing
defines error-mesh construction, region addressability, or region→slice resolution.

**Scope of the block:** this feature only (PR-ERR-03, PR-3D-05). `FR-3D-001`–`006` (reconstruction and
2D↔3D linkage) have their own specification and proceed independently. All other verticals are
unaffected.

**Path out:** Spike F → DR-005.

### 4.3 The HIGH findings, grouped

| Group | Findings | Nature |
|---|---|---|
| **Dataset — open unknowns** | RA-H01 (package not obtained), RA-H02 (label provenance unresolved) | Not specification defects. `06`'s acquisition and geometry gates are correctly designed; the answers simply require running Spike D. |
| **Missing contracts** | RA-H03 (precomputed ingestion), RA-H04 (deploy gate sequencing) | Absences that must be closed before architecture and API freeze. RA-H04 is conditional on `REMOTE_DEMO`. |
| **Geometry** | RA-H07 (axis/index convention), RA-H11 (undefined tolerance), RA-H14 (no mesh budget) | The project's only P0-class defect class (`13` §12). RA-H07 is closed by a free declaration; the other two by Spike B evidence. |
| **Missing spikes** | RA-H05 (device circularity), RA-H06 (no ML compute spike), RA-H13 (no transport budget) | The specification demands evidence it defines no procedure to produce. |
| **Under-modelled entities** | RA-H08 (Review lacks `revision`; no variant scope) | `05` cannot represent what `11` requires. |
| **Undefined behaviour** | RA-H09 ("outlier" never defined), RA-H16 (normalization policy across fractions) | Two developers would build different things; RA-H16 additionally confounds RQ-A. |
| **Scale** | RA-H10 (28 MUST PRs / 75 MUST FR-NFR / 69 tests in 30 days) | Shapes the baseline; raise now, not at day 20. |
| **Governance** | RA-H17 (dataset redistribution under `REMOTE_DEMO`) | Conditional; closed entirely by choosing `LOCAL_DEMO`. |

### 4.4 Conditional and escalation-dependent findings

| Finding | Condition |
|---|---|
| **RA-H01** | Escalates HIGH → **BLOCKER** only if an actual dataset download or access failure is recorded. No such failure has been observed. |
| **RA-H04** | Material only if `REMOTE_DEMO` is selected. Not a blocker on a `LOCAL_DEMO` path. |
| **RA-H17** | Material only if `REMOTE_DEMO` is selected. |
| **RA-M02** | Escalates only if Spike D finds non-axis-aligned geometry in the obtained package. |

### 4.5 Audit-area coverage

All seventeen mandated areas (A–Q) carry an explicit entry in
`IMPLEMENTATION_READINESS_AUDIT.md` §3, including areas assessed as sound. Areas with **no material
finding**: **A** (product consistency, beyond the count correction), **O** (Git/team execution, beyond
one LOW ambiguity). Areas assessed **strong**: **C** (NFR measurability), **E** (dataset procedure),
**L** (privacy), **M** (traceability), **N** (course alignment).

---

## 5. What this audit did not do

- Did **not** modify any file under `docs/specs/v1.0/`. Integrity re-verified: **19/19 OK**.
- Did **not** create a 30-day plan, a daily plan, a repository structure, or any ADR.
- Did **not** select a technology stack.
- Did **not** resolve any controlled gate from `00` §11.1.
- Did **not** silently resolve any ambiguity — all 14 audit-raised decisions are in `OPEN_DECISIONS.md`
  and all 9 interpretation questions are in `SPEC_CLARIFICATION_REQUESTS.md`.
- Did **not** assert any fact about the dataset beyond the verified state *"not yet obtained"*.
  Specifically: **no** claim about access or approval lead time, and **no** claim in either direction
  about whether the 54 official test labels exist. That question is recorded as unresolved (RA-H02) and
  is answerable only by auditing the downloaded package.

---

## 6. Conditions

Remediation and spike planning are **authorised now**. The full 30-day implementation baseline is
**not**, until these eight conditions close.

> **Post-review status after three decision rounds (2026-09-08):**
> **CLOSED — C2** (DR-004 ✅), **C3** (DR-003 ✅ — `LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS),
> **C5** (DR-008a ✅), **C7** (DR-013 ✅ — two-axis ownership matrix), **C8** (8 h/day gross declared).
> **OPEN — C1** (Spike D), **C4** (Spike F / DR-005), **C6** (*partially resolved* — axis-aligned-only
> **policy approved** via DR-012, **evidence against the actual validated package still pending Spike D**;
> must **not** be marked CLOSED before that evidence exists).
>
> **All three remaining conditions are evidence-driven — no free leader decision remains open.**
> The table below states each condition **as originally written**. For authoritative status see
> `READINESS_REVIEW_RESOLUTION.md` **§10.6**.

| # | Condition | Gates | Path | Owner |
|---|---|---|---|---|
| **C1** | Spike D completes; `DATASET_AUDIT.md` + machine-readable manifest ACCEPTED, resolving GATE-DATA-01 and the Path A/B label-provenance question | All training, GATE-SPLIT-01, final baseline | Spike D (**P0**) → DR-G01, DR-002 | ML/Imaging owner |
| **C2** | Precomputed artifact ingestion contract approved | Architecture freeze, API freeze | DR-004 | Architect + backend owner |
| **C3** | Deployment mode explicitly declared as `LOCAL_DEMO` **or** `REMOTE_DEMO`, **before API freeze**. `LOCAL_DEMO` **must not** inherit remote-authentication or public-dataset-transport requirements. If `REMOTE_DEMO`: authorization surface (RA-H04) and dataset-redistribution constraints (RA-H17) both resolved before freeze | API freeze, cross-interface parallel work | DR-003 | Leader + Architect |
| **C4** | RA-B01 resolved — 3D error pipeline defined on Spike F evidence, **or** an explicit scope decision under `00` §13 | The 3D-error feature only | Spike F → DR-005 | Imaging owner |
| **C5** | Slice-axis and index-order convention declared | Parallel backend/mobile geometry work | DR-008a (free decision) | Architect + Imaging owner |
| **C6** | Geometry support boundary declared (axis-aligned only; reject unsupported via `GEOMETRY_NOT_VALIDATED`), confirmed against the validated package | Geometry contract freeze | DR-012, confirmed by Spike D | Imaging owner |
| **C7** | Technical-block ownership/reviewer matrix added **alongside** V1–V4 (not replacing them), covering ML, imaging/geometry, backend, integration | 30-day task allocation | DR-013 | Leader |
| **C8** | Member availability declared so capacity is **computed**, not assumed (`15` §5) | The 30-day baseline | Leader collects | Leader |

### 6.1 Immediately available — no prerequisites

Four of the eight conditions can be started or closed today:

- ~~**C5** and the target-device declaration (**DR-006**)~~ — **both APPROVED.** DR-006 declared the
  **Samsung Galaxy A17 5G**; DR-008a froze the canonical `(x, y, z)` convention and **closed C5**.
- ~~**C8**~~ — **CLOSED**: all four members declared **8 h/day gross** availability.
- ~~**C3** and **C7**~~ — **both CLOSED in Round 3**: DR-003 ✅ (`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR
  ACCESS) and DR-013 ✅ (mobile vertical + technical-block ownership).
- Spike D and Spike C0 need no decision at all; **Spike C1** is gated on Spike D rather than on any
  decision. **Six of seven spike stages are unblocked; none has been executed.**
- **C1** — Spike D has no blockers and is **P0**.
- **C8** — collecting declared availability requires no decision.

**[RECOMMENDATION]** Closing C5 + DR-006 first has the highest leverage in the audit: it unblocks four
device-bound spikes simultaneously and directly attacks RISK-3D-GEOMETRY, the project's only P0-class
technical risk class.

### 6.2 Authorised now, without waiting

Per `09` §1.1 ("Repository scaffolding may begin before all ADRs are final only for technology-neutral
docs/contracts/spikes"), and per finding RA-M03 (contract front-load is a *sequencing* risk, not a
readiness gate):

- The spikes — **A, B, C0, C1, D, E, F** — are **parallelisable after their prerequisite decisions are
  resolved**, not unconditionally independent. DR-006 and DR-008a are free leader decisions that unblock
  the device-bound and geometry-bound spikes; **Spike C1 additionally requires Spike D**.
- Dataset validation, ML compute evaluation, geometry fixture construction, UX design, and
  technology-neutral contract work all proceed independently of the ADRs.
- Decision Requests DR-001 … DR-014 may be raised, reviewed, and approved.
- Spec clarification requests SCQ-01 … SCQ-09 may be sent to the specification owner.

**Not authorised:** the 30-day implementation baseline, production feature implementation, technology
stack selection, and any repository module that locks an architecture ahead of its dependent ADR.

---

## 7. Next step and artifact set

**Next step per `17` §5:** the leader reviews this audit. On acceptance, Step 2 begins — dataset
validation (Spike D) and the mobile spikes proceed in parallel, and the required ADRs follow from their
evidence. **No 30-day plan is to be authored until this audit is explicitly approved and the §6
conditions are closed or scheduled.**

**Audit artifact set**

| File | Contents |
|---|---|
| `IMPLEMENTATION_READINESS_AUDIT.md` | 38 findings across audit areas A–Q, with mechanical verification |
| `OPEN_DECISIONS.md` | 6 controlled gates + 14 audit-raised Decision Requests, with dependency order |
| `TECHNICAL_SPIKES_REQUIRED.md` | Spikes A–F: 2 specified, 4 required but undefined in the spec |
| `RISK_REGISTER_INITIAL.md` | 16 risks, including all 7 carried forward from the prior audit |
| `SPEC_CLARIFICATION_REQUESTS.md` | 9 interpretation questions (`SCQ-01`…`SCQ-09`) for the specification owner |
| `IMPLEMENTATION_READINESS_STATUS.md` | This document |
| `READINESS_REVIEW_RESOLUTION.md` | **Authoritative post-review record**: corrections, 9 answered clarifications, 5 approved decisions, condition status C1–C8 |

---

## 8. Recommendation

The distinction that determines this verdict:

- **Remediation and spike planning are authorised now.** Nothing in this audit prevents the team from
  starting the six spikes, raising the decision requests, and closing the free decisions today.
- **The full 30-day implementation baseline is not yet authorised.** It would be a forecast built on
  eight open conditions, four of which materially change the shape of the work.

With the corrected severity set there is **exactly one BLOCKER**, and it is **feature-scoped**. A
blanket `NOT_READY_FOR_PLANNING` would misdescribe a specification set whose traceability, provenance,
and scientific-honesty controls are genuinely sound, and would wrongly stop work that is ready to start.
Equally, `READY_FOR_PLANNING` would understate eight real conditions — including a MUST requirement with
no specification and a critical-path contract that does not exist.

The accurate verdict, with the eight conditions in §6 attached, is:

---

> ## READY_WITH_CONDITIONS
