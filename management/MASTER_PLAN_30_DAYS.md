# MASTER PLAN — 30 DAYS

> ### ⚠ CONDITIONAL BASELINE — NOT YET ACCEPTED
>
> This plan exists so the leader can accept or reject it. It becomes project truth **only** when the
> leader records acceptance in §14. Until then it carries no authority.
>
> **It is a trajectory, not a calendar** (`15` §2). Daily plans are generated from the actual project
> state in `PROJECT_STATE.yaml`, never from the nominal day number alone.

**Owner:** Project Control (leader-operated) · **Generated:** 2026-09-10 · **Authority:** below
`docs/specs/v1.0/**` and `management/readiness/READINESS_REVIEW_RESOLUTION.md` §10–§11 in every conflict.

---

## 1 · Calendar anchor — the only place dates are bound

```
Execution Day 1  =  2026-09-10        (the day the leader declares cutover)
Day 30           =  2026-10-09
Day 0            =  2026-09-09        Team Onboarding — NOT part of this 30-day window
```

Every other row in this document uses **relative `Day N`**. If the cutover slips, change these three
lines and nothing else.

**Execution Day 1 has not started yet.** No spike is `ACTIVE`, no `started_at` is written, and the
DR-001 clock has not begun. See `management/day01/DAY01_RUNBOOK.md` §2 for the `R1`–`R9` gate.

---

## 2 · Critical path

```text
PRIMARY (scientific) — every day of delay here moves Day 30

  SPIKE_D ──► GATE-DATA-01 ──► patient-level split ──► GATE-SPLIT-01
     |                                                      |
     |                                                      v
     +──────────────────────────────► SPIKE_C1 ──► GATE-ML-01 ──► training runs
                                          ^                            |
                                   blocked_by: SPIKE_D                 v
                                                              metrics ──► V3 cohort UI
                                                                      +─► report / defense

PARALLEL (product) — does not gate the science, but gates every mobile vertical

  SPIKE_A ─┐
           ├──► GATE-MOB-01 ──► TECH_STACK_ADR.md ──► V1 · V2 · V3 · V4
  SPIKE_B ─┘         |
                     +──► DR-008c (mesh budget, within the ±1-slice ceiling)

  SPIKE_E ──► ADR-ART-001 (transport) ──► ingestion + backend + demo path
  SPIKE_F ──► DR-005 (3D error representation) ──► V2 error view
```

**The longest chain is `SPIKE_D → GATE-DATA-01 → SPIKE_C1 → GATE-ML-01 → training → metrics`.**
Spike D is P0 for exactly this reason.

---

## 3 · Phases and milestones

Each milestone has an **exit criterion**, not only a target day (`15` §3).

| # | Days | Phase | Milestone | Exit criterion |
|---|---|---|---|---|
| **M0** | Day 0 | Shared-core onboarding *(outside the window)* | Team onboarded | `DAY0_SIGNOFF.md` complete 4/4 and signed; `DAY1_READINESS_CHECKLIST.md` passed; cutover recorded |
| **M1** | 1–4 | Spike wave 1 — D · A · B · E | First evidence from all four | Each spike `EVIDENCE_READY` with real measured evidence; **DR-001 trigger evaluated and reported on Day 1** |
| **M2** | 4–6 | Spike C0 · Spike F · decisions | Evidence-driven decisions taken | `GATE-MOB-01` closed on **Spike A *and* B** evidence → `TECH_STACK_ADR.md` exists; DR-002, DR-005, DR-008c each **decided, or explicitly deferred with a recorded reason** |
| **M3** | 6–9 | Contract freeze | Interfaces stable enough to build against | API contract (`11`) versioned; **both** DR-004 ingestion contracts specified with separate schemas and validators; geometry contract published; contract tests run |
| **M4** | 8–12 | Spike C1 → ML recipe | ML feasibility proven on real validated data | `SPIKE_C1` accepted; **`GATE-ML-01` closed — after C1, never after C0**; patient-level split (seed 2024) frozen and `GATE-SPLIT-01` closed |
| **M5** | 9–20 | Vertical development V1–V4 | Four mobile verticals functional | Each vertical passes its own acceptance tests; every member owns one vertical end-to-end (course requirement, `14`) |
| **M6** | 12–22 | Experiment matrix | RQ-A and RQ-B answerable | `EXP-U-025/050/100` + `EXP-D-025/050/100` complete with metrics; `EXP-D-PP` complete for RQ-B; **`GATE-IMG-01`** closed on development/validation evidence only |
| **M7** | 20–25 | Integration | System works end to end | `TC-E2E-001` green; canonical smoke stable across accepted merges; review/finding flow works |
| **M8** | 25–28 | Stabilization | No known blocking defect | Zero open P0/P1; all MUST acceptance tests green; `main` continuously integrable |
| **M9** | 28–30 | Demo · report · defense | Deliverable complete | Demo runs on the canonical path; report and `16` defense mapping complete; **≥2 calendar days of buffer still unspent** |

### 3.1 · Why the phases overlap

M5 overlaps M4 and M6 deliberately. Serialising vertical work behind the ML gates is exactly
**`RISK-SEQ-01`** — the baseline must not park three people while Spike C1 runs. Verticals build against
the frozen contracts from M3 using **synthetic fixtures**, and swap to real artifacts as they land.

---

## 4 · Technical spikes

| Spike | Owner | Reviewer | Priority | Feeds |
|---|---|---|---|---|
| **SPIKE_D** — dataset acquisition / validation / provenance | Bế Quốc Khánh | Vũ Hùng Anh | **P0** | `GATE-DATA-01`, `GATE-SPLIT-01`, C1, C6; unblocks `SPIKE_C1` |
| **SPIKE_A** — 2D viewer + brush | Phạm Tuấn Anh | Vũ Hùng Anh | P1 | `GATE-MOB-01`; brush-mapping tolerance proposal |
| **SPIKE_B** — linked 3D, picking, decimation frontier | Vũ Hùng Anh | Phạm Tuấn Anh | P1 | `GATE-MOB-01`, DR-008c |
| **SPIKE_E** — transport over cellular + overlay | Nguyễn Gia Đức Trung | Phạm Tuấn Anh | P2 | `ADR-ART-001`; first-load budget proposal |
| **SPIKE_C0** — ML feasibility, synthetic | Bế Quốc Khánh | Vũ Hùng Anh | P2 | preparation only — **does not close `GATE-ML-01`** |
| **SPIKE_C1** — ML feasibility, real validated subset | Bế Quốc Khánh | Vũ Hùng Anh | P1 | **`GATE-ML-01`** — currently `BLOCKED_BY_SPIKE_D` |
| **SPIKE_F** — 3D error representation | Vũ Hùng Anh | Phạm Tuấn Anh | P2 | DR-005, condition C4 |

**Serialisation rules stay in force from Day 1:** one review in `REVIEWING` per person
(`WIP-CONFLICT-01`), and one Galaxy A17 5G measured in sequence (`WIP-CONFLICT-02`, amended to
**`A → E → B`** — see `management/day01/DAY01_RUNBOOK.md` §4.3).

---

## 5 · Vertical development — V1 to V4

Two ownership axes, both preserved. Every member is Primary Owner on **both** a mobile vertical and a
technical block. The **anti-bottleneck rule is binding**: ML ownership does not move off Bế Quốc Khánh,
and Backend does not move off Nguyễn Gia Đức Trung, for short-term speed.

| Vertical | Owner | Technical block | Depends on |
|---|---|---|---|
| **V1** — Case Explorer / 2D MRI | Phạm Tuấn Anh | Integration / CI / cross-contract | `GATE-MOB-01`, backend API, geometry fixtures |
| **V2** — 3D / spatial error | Vũ Hùng Anh | Imaging / Geometry / canonical 2D↔3D | `GATE-MOB-01`, DR-008c; DR-005 for the error view |
| **V3** — Experiment / cohort | Bế Quốc Khánh | ML training / evaluation | metrics from M6, `GATE-ML-01` |
| **V4** — Review / findings | Nguyễn Gia Đức Trung | Backend / persistence / ingestion | both DR-004 contracts, V1 brush primitive |

---

## 6 · Gates

| Gate | Closes on | Owner | Status today |
|---|---|---|---|
| **`GATE-DATA-01`** | Spike D evidence: `DATASET_AUDIT.md` + machine-readable manifest accepted | Leader | **OPEN** |
| **`GATE-SPLIT-01`** | Patient-level split, seed 2024, provenance resolved | Leader | **OPEN** |
| **`GATE-ML-01`** | **Spike C1** evidence — C0 is not sufficient | Leader | **OPEN** |
| **`GATE-IMG-01`** | Morphology configuration frozen on **development/validation evidence only**, then applied unchanged to holdout | Leader | **OPEN** |
| **`GATE-MOB-01`** | Mobile framework selected on **Spike A *and* Spike B** evidence, via `TECH_STACK_ADR.md` | Leader | **OPEN** |
| **`GATE-DEPLOY-01`** | Deployment / security profile | Leader / Architect | **✅ CLOSED** — DR-003, `LOCAL_DEMO — PRIVATE OVERLAY / CELLULAR ACCESS` |

**A gate resolution becomes project truth only when recorded in an approved ADR / Decision Log and linked
from the relevant specification** (`00` §14). No gate closes because a day number passed.

---

## 7 · Conditions C1, C4, C6 — inside the plan, not preconditions to it

`READINESS_REVIEW_RESOLUTION.md` §10 leaves **C1, C4, C6 OPEN** and evidence-driven. They do **not** block
this baseline from existing. They appear here in all five required forms
(`DAY1_READINESS_CHECKLIST.md` §B.1).

### C1 — Spike D completes; `DATASET_AUDIT.md` + manifest ACCEPTED

| Form | Where it lives in this plan |
|---|---|
| **Gate** | `GATE-DATA-01`, milestone **M1 → M2** |
| **Dependency** | `SPIKE_C1` is `blocked_by: SPIKE_D`; `GATE-SPLIT-01` and all training wait on it |
| **Uncertainty on the critical path** | The longest chain starts here. The package may be unusable, or provenance may be ambiguous — **this is not yet known** |
| **Decision point** | Leader closes `GATE-DATA-01` on Spike D evidence at **M2**. DR-002 (Path A/B) is decided by the leader on the same evidence — **this plan does not choose a path** |
| **Recovery trigger** | **DR-001**: if by the end of execution day 1 there is no usable official package locally, **or** validation exposes a defect blocking `GATE-DATA-01`, then `RA-H01` escalates to **BLOCKER** and the dataset contingency process opens. Substitution requires the full `00` §13 sequence — **never silent** |

### C4 — RA-B01 resolved: the 3D error pipeline defined

| Form | Where it lives |
|---|---|
| **Gate** | DR-005, gating the V2 error view in **M5** |
| **Dependency** | Spike F evidence (**M2**) → V2 error feature; Spike F itself is sequenced after Spike B |
| **Uncertainty** | **RA-B01 is the single BLOCKER finding.** The 3D error representation may prove infeasible as specified — `RISK-3DERR-01` |
| **Decision point** | Leader decides DR-005 at **M2**, on Spike F evidence |
| **Recovery trigger** | If Spike F shows the MUST feature is infeasible, escalate under `SPIKE_PHASE_PLAN.md` §9.3 — a formal scope Decision Request, **not** a silent scope drop |

### C6 — axis-alignment / geometry assumption validated

Status: **PARTIALLY_RESOLVED** — the axis-aligned policy is approved (DR-012), but the **evidence is
pending Spike D**. It must never be marked CLOSED before that.

| Form | Where it lives |
|---|---|
| **Gate** | Spike D acceptance criterion **A14** — the axis-alignment verdict |
| **Dependency** | The geometry contract (**M3**) and Spike B picking both assume it |
| **Uncertainty** | Whether every volume in the real cohort is axis-aligned is **not yet known** |
| **Decision point** | Leader confirms at **M2** on Spike D's A14 verdict |
| **Recovery trigger** | If oblique volumes are found, the geometry contract needs a Decision Request **before** M3 freezes it; V2 and Spike B re-plan |

---

## 8 · NOT FROZEN — this plan decides none of these

Scheduling a decision is not making it. If any line below reads as settled, **return this baseline for
correction** (`DAY1_READINESS_CHECKLIST.md` §B.1).

| Evidence-dependent item | Decided only by | Earliest |
|---|---|---|
| **Path A vs Path B** | Spike D → DR-002 / `GATE-SPLIT-01` | M2 |
| **Mobile framework** | Spike A **and** Spike B → `GATE-MOB-01` → `TECH_STACK_ADR.md` | M2 |
| **Final DINOv2 recipe** | **Spike C1** → `GATE-ML-01` — C0 is not sufficient | M4 |
| **Mesh decimation budget** | Spike B → DR-008c, **within the ±1 source slice ceiling** | M2 |
| **3D error representation** | Spike F → DR-005 | M2 |
| **Artifact transport strategy** | Spike E → `ADR-ART-001` | M2 |
| **Morphology configuration** | `GATE-IMG-01`, development/validation evidence only | M6 |
| Any other evidence-dependent decision | its own gate / DR | — |

**Invariants this plan does not touch:** patient-level split is invariant, never slice-level · the
real-mesh picking error ceiling is **±1 source slice** and is never relaxed to make a level pass ·
canonical geometry DR-008a is frozen · `NFR-PERF-001/002/003` targets are frozen ·
`docs/specs/v1.0/**` is frozen.

---

## 9 · Buffer and recovery capacity

| Item | Value |
|---|---|
| **Stabilization / recovery buffer** | **Days 28–30 — ≥2 calendar days**, per `15` §3 |
| Buffer policy | **Not pre-spent on COULD work.** COULD items are cut before buffer is touched |
| Capacity basis | Four members declare 8 h/day **gross**, which is not coding capacity. The baseline reserves leader time for Project Control — `RISK-CAP-01` |
| Scope firewall | MUST > SHOULD > COULD. `RISK-SCOPE-01` is HIGH: brush + linked 3D + six training configs is ambitious for 30 days |

### Recovery protocol — `15` §18

Recovery triggers **before** Day 30 becomes impossible, not after. Trigger when **any** is true:

1. forecast exceeds Day 30;
2. remaining buffer drops below the planned safety threshold;
3. a critical-path blocker survives **two** EOD cycles without credible resolution;
4. canonical smoke repeatedly fails after accepted merges;
5. a required scientific gate is still unresolved at the latest safe start date.

Then apply in order: **Level 1 — reallocate** · **Level 2 — pair** · **Level 3 — parallelize safely**.
Reallocation must not violate the anti-bottleneck rule without a recorded reason.

---

## 10 · Risks carried into this baseline

From `management/readiness/RISK_REGISTER_INITIAL.md`.

| Severity | Risks |
|---|---|
| **HIGH (7)** | `RISK-DATA-01` · `RISK-3D-GEOMETRY` · `RISK-3DERR-01` · `RISK-MOBILE-RENDER` · `RISK-INGEST-01` · `RISK-COMPUTE` · `RISK-SCOPE-01` |
| **MEDIUM (7)** | `RISK-SPLIT-01` · `RISK-CONFOUND-01` · `RISK-STATS-01` · `RISK-CAP-01` · `RISK-INTEGRATION` · `RISK-SEQ-01` · `RISK-DEMO-NET-01` |
| **CLOSED (2)** | `RISK-DEPLOY-01` (DR-003) · `RISK-OWNER-01` (DR-013) |

Two shape the schedule directly. **`RISK-SEQ-01`** is why M5 overlaps M4 rather than queuing behind it.
**`RISK-STATS-01`** is why M6's exit criterion is *answerable* — an inconclusive result reported honestly
as inconclusive is a valid outcome, and RQ-A is an **interaction** question, not a "which model wins"
question.

---

## 11 · Scientific integrity constraints on the schedule

Not schedule items — constraints on what any schedule may claim.

- **Patient-level split, seed 2024. Slice-level split is never acceptable** — it leaks between train and
  test and voids RQ-A entirely.
- **RQ-A asks whether DINOv2 degrades *less* than UNet as labelled data is reduced.** It is an
  interaction question. The plan must not be written as if a winner is expected.
- **RQ-B** is the deterministic morphology ablation, `EXP-D-PP`.
- **Raw predictions are immutable.** A human-edited mask is a **new** artifact, never an overwrite.
- **Empty-slice rule** (`07` §6) applies to every metric: both-empty is `NOT_APPLICABLE`/NaN and is
  **excluded** from per-slice means.
- **No fabricated measurement, ever.** Unmeasurable fields are recorded as `NOT MEASURED — <reason>`.

---

## 12 · How this plan is used day to day

```text
PROJECT_STATE.yaml  (actual state)  ──►  DAY_N_PLAN.md  ──►  execution
        ^                                                        |
        +──────────  DAY_N_REVIEW.md  ◄─────────────────────────-+
```

The next daily plan is generated from **`management/PROJECT_STATE.yaml`**, not from this document's day
numbers (`15` §4). When reality and this baseline disagree, **reality wins and the baseline is
re-forecast** — `15` §1: *"Plan follows reality. Never mark reality as complete just to match the
schedule."*

---

## 13 · What this plan is not authorised to do

Freeze any item in §8 · modify `docs/specs/v1.0/**` · close any gate · start any spike · set any
`started_at` · declare Execution Day 1 · substitute the dataset · relax a frozen NFR or the ±1-slice
ceiling · move ML ownership off Bế Quốc Khánh or Backend off Nguyễn Gia Đức Trung for speed.

---

## 14 · Leader acceptance

Required by `DAY1_READINESS_CHECKLIST.md` **B7** and **D5**. This baseline has **no authority** until
this block is completed by the leader.

Before accepting, confirm §B.1:

- [ ] C1, C4, C6 appear as gate · dependency · uncertainty · decision point · recovery trigger — §7
- [ ] Nothing in §8 is presented as decided
- [ ] Every milestone in §3 has an exit criterion
- [ ] ≥2 calendar days of buffer survive in §9, unspent on COULD work

```
Tôi, Phạm Tuấn Anh — Team Leader,   ☐ CHẤP NHẬN   ☐ TRẢ LẠI ĐỂ SỬA   baseline này.

Lý do trả lại (nếu có): ______________________________________________

Chữ ký: ______________________     Ngày: ______________     Giờ: ________
```

---

**Related:** [`day01/DAY01_RUNBOOK.md`](day01/DAY01_RUNBOOK.md) ·
[`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) ·
[`onboarding/DAY1_READINESS_CHECKLIST.md`](onboarding/DAY1_READINESS_CHECKLIST.md) ·
[`spikes/SPIKE_PHASE_PLAN.md`](spikes/SPIKE_PHASE_PLAN.md) ·
[`readiness/READINESS_REVIEW_RESOLUTION.md`](readiness/READINESS_REVIEW_RESOLUTION.md) §10–§11 ·
[`readiness/RISK_REGISTER_INITIAL.md`](readiness/RISK_REGISTER_INITIAL.md)
