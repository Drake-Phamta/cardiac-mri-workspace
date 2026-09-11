# SPIKE PHASE PLAN

**Phase:** Technical Spike Phase
**Status:** **OPEN** (authorised 2026-09-08)
**Authorised by:** Team Leader, after the Readiness Decision Phase was accepted and CLOSED
**Governing artifacts:** `management/readiness/READINESS_REVIEW_RESOLUTION.md` §10 (authoritative),
`TECHNICAL_SPIKES_REQUIRED.md`, `OPEN_DECISIONS.md`
**Project state:** `READY_WITH_CONDITIONS`

---

## 0. Purpose and boundary

This phase exists **only to produce the evidence** required by the remaining gates, ADRs and architecture
decisions. It is not implementation.

### What this phase is authorised to do

- Create and maintain spike task/control artifacts.
- Prepare harnesses, instrumentation, fixture data, measurement scripts, result templates.
- Coordinate execution of the authorised spikes.

### What this phase is NOT authorised to do

| Not authorised | Why |
|---|---|
| `MASTER_PLAN_30_DAYS.md` | Explicitly withheld; three readiness conditions still open |
| Day-1 production feature plan | Same |
| Final repository architecture | Awaits ADR evidence from this phase |
| Final mobile stack choice | **`GATE-MOB-01` requires Spike A/B evidence first** |
| Final DINOv2 recipe | **`GATE-ML-01` may close only after Spike C1 evidence** |
| Production feature implementation | Not this phase |
| Any edit to `docs/specs/v1.0/` | Frozen; `00` §13 change control applies |

### The non-fabrication rule — binding on Claude

> **Claude (Project Control) coordinates this phase. Claude does NOT produce physical-device, dataset,
> GPU, network or interaction evidence.**

Claude **may** prepare: harnesses, instrumentation, fixture data, measurement scripts, validation code,
analysis of results supplied by an owner, and result templates.

Claude **must not** invent, estimate-and-present-as-measured, or otherwise fabricate: touch latency, frame
rates, on-device memory, cellular throughput, dataset file inventories, label provenance, GPU timings, or
any interaction outcome. Every such value is recorded **by the named human owner from the real
environment**, per **SCQ-09**.

**`RESULT.md` exists in a spike directory only when real evidence exists.** No `RESULT.md` file exists
anywhere at the time this plan is written.

---

## 1. Remaining readiness conditions this phase serves

| Condition | State | Unblocked by |
|---|---|---|
| **C1** | OPEN | **Spike D** — dataset acquisition + validation + GATE-DATA-01 evidence |
| **C4** | OPEN | **Spike F** — 3D error pipeline evidence, then DR-005 |
| **C6** | OPEN / PARTIALLY_RESOLVED | **Spike D** confirmation that the package is axis-aligned |

C2, C3, C5, C7, C8 are CLOSED. **No free leader decision remains open** — every remaining item is
evidence-driven.

---

## 2. Ownership and priority

| Spike | Scope | Priority | Primary Owner | Secondary Reviewer |
|---|---|:---:|---|---|
| **D** | Dataset acquisition / validation / provenance | **P0** | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **A** | 2D scientific viewer / brush interaction | P1 | **Phạm Tuấn Anh** | Vũ Hùng Anh |
| **B** | 3D linked interaction | P1 | **Vũ Hùng Anh** | Phạm Tuấn Anh |
| **C0** | Preliminary ML compute feasibility | P1 | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **C1** | Final real-data ML feasibility | P1 | **Bế Quốc Khánh** | Vũ Hùng Anh |
| **E** | Artifact transport over the canonical demo network | P2 | **Nguyễn Gia Đức Trung** | Phạm Tuấn Anh |
| **F** | 3D error representation | P1 | **Vũ Hùng Anh** | Phạm Tuấn Anh |

Assignments follow the DR-013 ✅ technical-block ownership matrix. The **anti-bottleneck rule remains
binding**: Spikes C0/C1 and D stay with Bế Quốc Khánh, and Spike E stays with Nguyễn Gia Đức Trung —
not moved to the two stronger members for short-term speed.

---

## 3. Status semantics and Wave 1

### 3.0 `ACTIVE` means execution has actually started

> **Corrected rule.** `ACTIVE` means **actual execution has started**. An authorised and assigned spike
> whose owner has **not** started, and whose `started_at` is `null`, is **`PREPARED`** — never `ACTIVE`.
>
> **When an owner actually starts work:** set that spike to `ACTIVE`, record the **real** `started_at`
> date/time, and **do not backdate it**.

This exists so Project Control state reflects **reality**, not authorisation intent.

### 3.1 Current spike states — nothing has started

| Spike | Status | Note |
|---|---|---|
| **D** | **PREPARED** | P0. Authorised and assigned; execution not started |
| **A** | **PREPARED** | Authorised and assigned; execution not started |
| **B** | **PREPARED** | Authorised and assigned; execution not started |
| **E** | **PREPARED** | Authorised and assigned; execution not started |
| **C0** | **PREPARED** | Queued; bounded preparation only — see §3.2 |
| **F** | **PREPARED** | Queued behind Spike B |
| **C1** | **BLOCKED** | `blocked_by: SPIKE_D` |

**No spike is `ACTIVE`. Every `started_at` is `null`. No `RESULT.md` exists.**

### 3.2 Intended first execution wave — when the humans begin

| Member | Primary task | Queued | Binding constraint |
|---|---|---|---|
| **Bế Quốc Khánh** | **Spike D** — Dataset (P0) | Spike C0 | Spike D is the **only** primary active task. Spike C0 stays PREPARED. During pure **download / I-O idle time**, only **small** C0 preparation is allowed — **never a competing primary implementation task**. |
| **Phạm Tuấn Anh** | **Spike A** — 2D viewer / brush | — | Also holds 2 review assignments (B, E), **serialized** — §4.2. Holds **device measurement slot 1**. |
| **Vũ Hùng Anh** | **Spike B** — 3D linked interaction | Spike F | Spike B is the **only** primary active task. Spike F stays PREPARED. **Synthetic fixture preparation is allowed**, but Spike F *implementation* must not become a second active primary task. Holds **device slot 2**. |
| **Nguyễn Gia Đức Trung** | **Spike E** — transport / backend preparation | — | **Must not wait idly for the phone** — see §4.3 for the allowed off-device work. Holds **device slot 3**. |

**WIP rules remain binding** (`15` §7).

---

## 4. WIP-limit compliance — both conflicts RESOLVED

**Frozen rule (`15` §7):** per member, maximum **1 primary implementation task**, optionally **1 review
task**, optionally **1 small auxiliary/non-blocking activity**.

### 4.1 Primary tasks — COMPLIANT ✅

Each member holds exactly **one** intended primary spike. The directive's explicit exclusions hold:

- **Spike D and Spike C0 are not both primary tasks** for Bế Quốc Khánh — C0 is the *small preparation
  activity* slot, permitted only during download / I-O idle time.
- **Spike B and Spike F are not both primary tasks** for Vũ Hùng Anh — F is PREPARED; synthetic fixture
  preparation only.

### 4.2 WIP-CONFLICT-01 — **RESOLVED_BY_REVIEW_SERIALIZATION** ✅

**Reviewer assignments are NOT changed.** Review *windows* are serialized instead.

> **Rule.** A member may have at most **one review in `REVIEWING` state at a time**. Any second review
> assignment remains **`QUEUED_FOR_REVIEW`**.
>
> **Reviewer ownership must not be changed merely to eliminate the scheduling conflict.**

| Reviewer | Reviews | Default priority | Rationale |
|---|---|---|---|
| **Vũ Hùng Anh** | Spike D, Spike A, **Spike E** *(plus C0/C1 later)* | **Spike D → Spike A → Spike E** | Spike D is **P0** |
| **Phạm Tuấn Anh** | Spike B *(plus F later)* | **Spike B** | Spike B is **P1** and feeds `GATE-MOB-01` and DR-008c directly |

> **Amended 2026-09-12 — Spike E moved from Phạm Tuấn Anh to Vũ Hùng Anh.** Not a scheduling change.
> DR-006a makes the leader the device **operator** for Spike E, and someone who produced the
> measurements cannot also be the independent reviewer of them. See `OPEN_DECISIONS.md` DR-006a
> constraint (a) and the `reassignments` block in `SPIKE_PHASE_STATE.yaml`.
>
> ⚠ **Cost, recorded rather than hidden:** Vũ Hùng Anh now holds **five** review assignments while
> owning Spike B and Spike F. `WIP-CONFLICT-01` caps him at one `REVIEWING` slot, so the queue gets
> longer — the work does not vanish. If Spike D and Spike E are ready the same day, **Spike D wins on
> P0** and Spike E waits. This is a deliberate trade of throughput for independence.

**Pre-emption rule — both reviewers.** If the lower-priority spike becomes `EVIDENCE_READY` while the
higher-priority one is not ready, the reviewer **may** review the lower one. **But once the
higher-priority spike becomes `EVIDENCE_READY`, it receives priority for the next available review slot.**

Worked example: if Spike A is ready and Spike D is not, Vũ Hùng Anh may review Spike A. If Spike D then
becomes ready while Spike A's review is in progress, Spike D takes the **next** slot — the in-progress
review is not interrupted, but Spike D does not queue behind anything else.

### 4.3 WIP-CONFLICT-02 — **RESOLVED_BY_DEVICE_MEASUREMENT_SERIALIZATION** ✅

**The project has exactly ONE authorised physical Samsung Galaxy A17 5G** for canonical device
measurements.

| What | Rule |
|---|---|
| **Harness / code preparation** for Spikes A, B, E | **may proceed in parallel** |
| **Physical-device measurement windows** | **may NOT overlap** |

**Reserved measurement order — measurement access only, not all implementation work:**

```text
slot 1  ->  SPIKE_A   (Phạm Tuấn Anh)
slot 2  ->  SPIKE_B   (Vũ Hùng Anh)
slot 3  ->  SPIKE_E   (Nguyễn Gia Đức Trung)
```

**Explicit parallelism permitted while the phone is held by someone else:**

- **Spike B** harness and canonical-fixture work proceeds while Spike A is being prepared **or measured**.
- **Spike E** backend / network / instrumentation work proceeds while A and B are using the phone. The
  owner **must not wait idly**. Allowed before the Spike E device slot:
  Mac mini backend stub · ZeroTier / private-overlay connectivity verification · representative artifact
  payloads · transport instrumentation · latency-distribution logging · retry/reconnect harness ·
  measurement scripts and templates.

**Spike E's final acceptance measurements must still be taken on:**

```text
Galaxy A17 5G -> actual 4G/5G cellular network -> authenticated ZeroTier overlay
              -> remote Mac mini M2, 24 GB
```

**LAN results remain diagnostic only.**

**Note.** Spike F also needs the device, but it is queued behind Spike B as Vũ Hùng Anh's next primary
spike, so it adds no contention in this wave.

### 4.4 Load note — Phạm Tuấn Anh

Beyond Spike A (primary) and two serialized reviews, he simultaneously carries Team Leader duties, all of
`17` (five Claude chats, EOD packets), Integration/CI Primary Ownership, and V1 mobile ownership.
`RISK-CAP-01` remains **MEDIUM** for exactly this reason. Availability is **8 h/day gross**, and
**`4 × 8h = 32h/day` is not feature-development capacity**. No effective-capacity number is invented here.

## 5. Device and environment declarations

### 5.1 Mobile — required before any Spike A/B/E measurement

**Samsung Galaxy A17 5G** (DR-006 ✅), physical device — not an emulator, because `NFR-PERF-002`'s FPS
target and `NFR-PERF-003`'s touch latency are not meaningfully measurable on one.

**Authorised units: exactly ONE.** Measurement access is therefore serialized — see §4.3.

**Every field below is [UNVERIFIED] and must be captured from the device itself.** No hardware value has
been inferred anywhere in this project's artifacts, and none may be:

model identifier · Android version + build · RAM and device performance profile · CPU information
available from tooling · GPU information available from tooling · actual resolution and refresh profile ·
exact test configuration (build type, thermal state, battery/power mode, background load, screen
brightness, throttling observed).

Recorded in each spike's `EVIDENCE_TEMPLATE.md` device block.

### 5.2 Canonical demo network (DR-003 ✅) — binding on Spike E

```text
Samsung Galaxy A17 5G
        |
        |  real 4G / 5G cellular Internet
        v
Authenticated ZeroTier private overlay
        |
        v
Remote Mac mini M2, 24 GB RAM   (physically remote from the demo venue)
```

**Same-LAN measurements MUST NOT be used as Spike E acceptance evidence.** They may appear only as
labelled diagnostic/control measurements. Venue Wi-Fi is **not** trusted and **not** required.

### 5.3 ML compute — Spike C0 / C1

**[UNVERIFIED]** The available training hardware has not been declared. Spike C0's first deliverable is to
state exactly what compute exists (GPU/VRAM, or CPU/Colab-class only). Training need not run on the Mac
mini (DR-003 ✅).

---

## 6. Frozen constraints the spikes must respect

These were fixed **before** this phase and **must not be relaxed to obtain a passing result**.

| Constraint | Value | Source | Applies to |
|---|---|---|---|
| **Canonical indexing** | voxel `(x, y, z)`; x = column, y = row, z = slice index; `slice_index` = z over `0..Nz-1`; slice shape `[Ny, Nx]`; top-left origin, +x right, +y down; library memory order **outside** the contract | DR-008a ✅ | A, B, F |
| **Fixture picking accuracy** | **EXACT** expected slice — zero tolerance | SCQ-06 | B, F |
| **Real decimated-mesh picking** | **maximum error ±1 source slice** | SCQ-06 | B, F |
| **Geometry support boundary** | validated **axis-aligned only**; otherwise reject with `GEOMETRY_NOT_VALIDATED` | DR-012 ✅ | D, B, F |
| **Normalization policy** | **no cohort-fitted statistics**; per-image/per-volume + fixed pretrained constants, identical across families and fractions | DR-011 ✅ | C0, C1 |
| **Split discipline** | patient-level only; Spike C1's subset drawn from the **training partition only** once GATE-SPLIT-01 resolves | `06` §6, `07` §10 | C1 |
| **Dataset substitution** | **prohibited** without the full `00` §13 process | DR-001 ✅ | D |

> **If a spike cannot satisfy its frozen constraint, the correct output is a NEGATIVE_RESULT and an
> escalation — never a relaxed constraint.** This applies most sharply to Spike B: *do not loosen the
> ±1-slice tolerance merely to obtain a passing framework.*

---

## 7. Claude chat routing (`17` §3–§4)

| Spike | Lead chat | Supporting chats |
|---|---|---|
| **D** — dataset | **CHAT C — ML / Imaging Research** (dataset validation is its stated purpose, `17` §3) | CHAT D for validation/manifest scripts; CHAT A for the DR-001 escalation trigger |
| **A** — 2D viewer/brush | **CHAT D — Implementation** (harness, instrumentation, fixtures) | CHAT B for framework decision criteria feeding `TECH_STACK_ADR.md`; CHAT C for geometry fixture semantics |
| **B** — 3D linkage | **CHAT D — Implementation** | CHAT B for `ADR-MOB-001` criteria and the DR-008c budget; CHAT C for geometry/mesh semantics |
| **C0 / C1** — ML compute | **CHAT C — ML / Imaging Research** | CHAT A for calendar feasibility arithmetic |
| **E** — transport | **CHAT B — Technical Architect** (feeds `ADR-ART-001`) | CHAT D for the backend stub and instrumentation |
| **F** — 3D error | **CHAT C — ML / Imaging Research** (imaging pipeline) | CHAT D for implementation; CHAT B for mobile picking compatibility |
| **All acceptance** | **CHAT E — QA / Red Team** — challenge every acceptance claim **before** a spike moves to ACCEPTED | — |
| **Phase state** | **CHAT A — PROJECT CONTROL** — owns `SPIKE_PHASE_STATE.yaml`, blockers, EOD | — |

**Context-hygiene rules (`17` §12) that matter here:** keep CHAT A free of long debugging transcripts;
keep CHAT C free of mobile/UI detail; start a fresh implementation thread when a debugging thread
accumulates failed approaches. Bootstrap every fresh thread from repository artifacts, never from a vague
summary.

**`17` §16 reminder:** chat routing is the **leader's** control system. Team members are not expected to
maintain Claude contexts — the leader translates accepted outputs into member task packages.

---

## 8. Spike lifecycle and acceptance workflow

### 8.1 Execution states

```text
NOT_STARTED -> PREPARED -> ACTIVE -> EVIDENCE_READY -> ACCEPTED
                             |              |
                             |              +-> NEEDS_FIX -> ACTIVE
                             |              +-> NEGATIVE_RESULT -> escalation / DR
     any state -> BLOCKED (records blocked_by)
```

| Status | Meaning |
|---|---|
| `NOT_STARTED` | Not yet prepared |
| `PREPARED` | **Authorised and assigned**; task + evidence template exist; harness/prep work may proceed; **execution has not started**; `started_at` is `null` |
| `ACTIVE` | **The owner has actually started work**; `started_at` records the **real** date/time |
| `BLOCKED` | Cannot proceed; `blocked_by` names the dependency |
| `EVIDENCE_READY` | `RESULT.md` exists with real measurements; awaiting the Secondary Reviewer |
| `NEEDS_FIX` | Reviewer or QA rejected the evidence |
| `ACCEPTED` | Reviewer APPROVE **+** QA Red Team PASS **+** Project Control transition |
| `NEGATIVE_RESULT` | The spike ran correctly and the answer is "no". A valid, valuable outcome. |

### 8.2 Review states — a separate field

`review.state` tracks the **review workflow** and is **independent** of the execution `status`:

| Review state | Meaning |
|---|---|
| `NOT_REQUESTED` | No evidence submitted yet |
| `QUEUED_FOR_REVIEW` | Evidence ready, but the reviewer's single slot is occupied |
| `REVIEWING` | Occupying the reviewer's **one** active review slot |
| `APPROVED` | Reviewer approved; proceeds to the QA Red Team challenge |
| `NEEDS_FIX` | Reviewer rejected; returns to the owner |

### 8.3 Acceptance workflow — four steps, all required

> **No spike becomes `ACCEPTED` merely because `RESULT.md` exists.**

```text
1. Owner executes                  -> EVIDENCE_READY
2. Secondary Reviewer reviews       -> APPROVE  or  NEEDS_FIX
3. CHAT E / QA Red Team challenges  -> PASS     or  REJECT
4. CHAT A / Project Control         -> ACCEPTED
```

| Step | Actor | Outcome and rule |
|---:|---|---|
| **1** | Primary Owner | Executes and records **real** evidence in `RESULT.md` → `EVIDENCE_READY` |
| **2** | Secondary Reviewer | Technical / evidence review, occupying their single `REVIEWING` slot. **If `NEEDS_FIX`:** the spike returns to `NEEDS_FIX`; the owner corrects or gathers additional evidence. **A known-invalid claim must not be forwarded to final acceptance.** |
| **3** | **CHAT E — QA / Red Team** | Independently challenges the evidence. **If REJECT: the spike is NOT `ACCEPTED`, regardless of owner or reviewer opinion.** |
| **4** | **CHAT A — Project Control** | Performs the final state transition to `ACCEPTED` |

**For the evidence-driven gates — Spike D, Spike B and Spike F — QA must inspect the actual recorded
evidence relevant to the gate**, not only the summary verdict. These are the spikes whose results close
`GATE-DATA-01`, `GATE-MOB-01`/DR-008c, and DR-005/RA-B01 respectively.

**Acceptance additionally requires:** the environment/device profile filled in with no `[UNVERIFIED]`
placeholders in fields the result depends on; every `TASK.md` acceptance criterion answered pass/fail; and
the frozen constraints in §6 respected rather than relaxed.

**A `NEGATIVE_RESULT` is never converted into a pass by weakening a constraint.** It triggers a Decision
Request under `00` §13.

## 9. Escalation rules active in this phase

### 9.1 Spike D — DR-001 ✅ trigger (P0)

> **If, by the end of the first execution day of Spike D**, there is no usable official package
> **locally**, **or** validation exposes a **blocking defect** preventing GATE-DATA-01 acceptance — then
> **RA-H01 escalates to BLOCKER** and the **dataset contingency process opens**.

**Planning consequence:** Spike D's day-one work must be **ordered** so acquisition and a first-pass
provenance read happen **before** deeper validation — otherwise the trigger cannot be evaluated on time.
See `SPIKE_D_DATASET/TASK.md` §Day-one ordering.

**No silent dataset substitution.** Substitution requires the full `00` §13 sequence.

### 9.2 Spike B — accuracy-vs-performance deadlock

If **no** tested configuration satisfies **both** `NFR-PERF-002` (≥20 FPS median, no stall >500 ms) **and**
the **±1 source-slice** bound, record `NEGATIVE_RESULT` and escalate. Do **not** widen the tolerance.

### 9.3 Spike F — MUST-feature infeasibility

If the 3D error feature (PR-ERR-03 / PR-3D-05, the RA-B01 BLOCKER) is not achievable in the project
window, **report the negative result and trigger the formal scope decision** via DR-005. `03` §4 lists "3D
is decorative only and cannot link back to MRI slices" as an MVP rejection condition, so this must be an
explicit leader decision — never a silent simplification.

### 9.4 Gates that may NOT close early

- **`GATE-MOB-01`** — no mobile framework may be selected or frozen before Spike A **and** Spike B
  evidence is ACCEPTED.
- **`GATE-ML-01`** — may close **only after Spike C1**. Spike C0 evidence is explicitly insufficient.

---

## 10. Directory layout

```text
management/spikes/
├── SPIKE_PHASE_PLAN.md          this document
├── SPIKE_PHASE_STATE.yaml       machine-readable phase state
├── SPIKE_D_DATASET/    TASK.md  EVIDENCE_TEMPLATE.md
├── SPIKE_A_2D/         TASK.md  EVIDENCE_TEMPLATE.md
├── SPIKE_B_3D/         TASK.md  EVIDENCE_TEMPLATE.md
├── SPIKE_C_ML/         TASK.md  EVIDENCE_TEMPLATE.md      (covers stages C0 and C1)
├── SPIKE_E_TRANSPORT/  TASK.md  EVIDENCE_TEMPLATE.md
└── SPIKE_F_3D_ERROR/   TASK.md  EVIDENCE_TEMPLATE.md
```

**`RESULT.md` appears in a directory only when real evidence exists. None exists now.**

Spike D additionally produces, outside this tree:

- `management/DATASET_AUDIT.md`
- `data/manifests/dataset_manifest.*`

---

## 11. Immediate next actions

| Owner | Exact first task | On starting |
|---|---|---|
| **Bế Quốc Khánh** | **Spike D** — begin acquisition from the documented official source. Read `SPIKE_D_DATASET/TASK.md` §Day-one ordering **first**: the DR-001 trigger is measured from the **first execution day**, so acquisition and the first-pass provenance read must precede deep validation. | Set Spike D → `ACTIVE`, record the real `started_at` |
| **Phạm Tuấn Anh** | **Spike A** — capture the DR-006 device profile from the Galaxy A17 5G (a prerequisite for **all three** device spikes), then build the Spike A harness with synthetic fixtures. Holds **device slot 1**. | Set Spike A → `ACTIVE`, record `started_at` |
| **Vũ Hùng Anh** | **Spike B** — build the `09` §6 canonical geometry fixture set against the DR-008a convention. It is the input to Spike B, Spike F **and** `TC-MAINT-002`. Off-device work proceeds while Spike A holds the phone. Holds **device slot 2**. | Set Spike B → `ACTIVE`, record `started_at` |
| **Nguyễn Gia Đức Trung** | **Spike E** — stand up the Mac mini backend stub and verify the phone reaches it over cellular + ZeroTier. **Do not wait idly for the phone**: build instrumentation, payloads, latency logging, retry/reconnect harness and scripts meanwhile. Holds **device slot 3**. | Set Spike E → `ACTIVE`, record `started_at` |

**Both §4 conflicts are now RESOLVED** — no leader decision is outstanding for this wave.

---

**Related:** `management/readiness/READINESS_REVIEW_RESOLUTION.md` §10 ·
`management/readiness/TECHNICAL_SPIKES_REQUIRED.md` · `management/readiness/OPEN_DECISIONS.md` ·
`SPIKE_PHASE_STATE.yaml`
