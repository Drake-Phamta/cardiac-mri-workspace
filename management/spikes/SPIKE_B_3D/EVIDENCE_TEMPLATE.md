# SPIKE B — EVIDENCE TEMPLATE

**Spike:** `SPIKE_B` · **Primary Owner:** Vũ Hùng Anh · **Secondary Reviewer:** Phạm Tuấn Anh
**Status when filled:** `EVIDENCE_READY` — then reviewer sign-off → `ACCEPTED`

---

## How to use this template

1. Copy this file to **`RESULT.md`** in the same directory **only when you have real evidence**.
2. Replace every `[RECORD]` and `[UNVERIFIED]` marker with a real value. **Do not delete a marker you did
   not measure — leave it and say why.**
3. A field you could not measure is recorded as **`NOT MEASURED — <reason>`**. That is acceptable and
   honest. Inventing a plausible value is not.
4. When complete, set `evidence_present: true` and `status: EVIDENCE_READY` for this spike in
   `../SPIKE_PHASE_STATE.yaml`, and hand it to the reviewer.

> **Non-fabrication rule.** Every frame rate, stall duration, picking error, triangle-count relationship and memory figure below must be **measured on the physical Samsung Galaxy A17 5G** by the owner.
>
> Claude may build harnesses, fixtures, scripts and templates, and may analyse values you supply. Claude
> **must not** produce the measurements themselves.

---

## 1. Execution record

| Field | Value |
|---|---|
| Owner who executed | [RECORD] |
| Date(s) executed | [RECORD] |
| Actual start (matches `started_at` in state file) | [RECORD] |
| Repository commit tested | [RECORD] |
| Reviewer | Phạm Tuấn Anh |
| Reviewer verdict | [RECORD] `APPROVE` / `NEEDS_FIX` / `BLOCKED_DECISION_REQUIRED` |
| QA / Red-Team challenge (CHAT E) performed | [RECORD] yes/no + outcome |

---
## 2. Declared device profile (DR-006) — **prerequisite**

**Capture every field from the device itself. Do not infer any hardware detail.**

| Field | Value |
|---|---|
| Model declared by DR-006 | Samsung Galaxy A17 5G |
| Model identifier read from device | [UNVERIFIED] |
| Android version + build number | [UNVERIFIED] |
| RAM / device performance profile | [UNVERIFIED] |
| CPU information available from tooling | [UNVERIFIED] |
| GPU information available from tooling | [UNVERIFIED] |
| Screen resolution | [UNVERIFIED] |
| Refresh rate / profile | [UNVERIFIED] |
| Physical device or emulator | **must be physical** — [RECORD] |
| Unit identifier (if the team has more than one) | [RECORD] |

### Exact test configuration

| Field | Value |
|---|---|
| Build type (release required for timing) | [RECORD] |
| Thermal state at start / end | [RECORD] |
| Battery level and power mode | [RECORD] |
| Background load | [RECORD] |
| Screen brightness | [RECORD] |
| Throttling observed during the run | [RECORD] |

---
## 3. Candidate framework and 3D stack

| Field | Value |
|---|---|
| Framework name + exact version | [RECORD] |
| 3D rendering library + version | [RECORD] |
| Picking / ray-cast approach | [RECORD] |
| Mesh source mask volume | [RECORD] identity, synthetic or validated |
| Reconstruction method + version | [RECORD] |
| Canonical fixture set used | [RECORD] path + identity |

---

## 4. Functional criteria B1–B9

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| B1 | Mesh renders; rotate / zoom / pan work | [RECORD] | |
| B2 | Active slice plane computed **from source geometry** | [RECORD] | |
| B3 | 3D selection / picking functions reliably | [RECORD] | |
| B4 | **Fixture picking resolves to the EXACT expected slice** | [RECORD] | **zero tolerance** |
| B5 | **Real decimated-mesh picking error ≤ ±1 source slice** | [RECORD] | |
| B6 | B4 and B5 hold after camera rotate and zoom | [RECORD] | |
| B7 | 2D viewer navigates to the resolved slice | [RECORD] | |
| B8 | Geometry correct after arbitrary camera manipulation | [RECORD] | |
| B9 | Invalid / background selection: no misleading navigation | [RECORD] | |

---

## 5. Picking accuracy — interior vs surface-tangent (B14)

**Report the two groups separately.** A good interior result must not mask a tangent-point failure.

### Canonical fixtures — bound: **EXACT**

| Test point | Group | Expected slice | Observed slice | Error |
|---|---|---|---|---|
| [RECORD] | interior / tangent | | | |

| Summary | Interior | Surface-tangent |
|---|---|---|
| Points tested | [RECORD] | [RECORD] |
| Exact matches | [RECORD] | [RECORD] |
| **Verdict (must be exact)** | [RECORD] | [RECORD] |

### Real decimated mesh — bound: **≤ ±1 source slice**

| Decimation level | Group | Points | Max error (slices) | Within ±1? |
|---|---|---|---|---|
| [RECORD] | interior | | | |
| [RECORD] | tangent | | | |

---

## 6. Performance B10–B11 — on-device (NFR-PERF-002)

| Measurement | Value | Bound |
|---|---|---|
| Interaction test description | [RECORD] | — |
| **Median frame rate** | [RECORD] FPS | **≥ 20** |
| p5 / worst frame rate | [RECORD] FPS | — |
| **Longest interaction stall** | [RECORD] ms | **≤ 500** |
| Device memory during 3D interaction | [RECORD] MB | — |
| **Verdict** | [RECORD] PASS / FAIL | |

---

## 7. Decimation frontier (B12) and DR-008c recommendation (B13)

**At least three levels required.**

| Level | Triangle count | Generation time | Median FPS | Longest stall (ms) | Max picking error (slices) | Meets BOTH bounds? |
|---|---|---|---|---|---|---|
| native / none | [RECORD] | | | | | |
| [RECORD] | | | | | | |
| [RECORD] | | | | | | |

### DR-008c recommendation

| Field | Value |
|---|---|
| **Recommended triangle budget** | [RECORD] |
| Median FPS at that budget | [RECORD] |
| Max picking error at that budget | [RECORD] slices — **must be ≤ 1** |
| Accuracy cost accepted | [RECORD] |
| **Is there ANY level meeting both NFR-PERF-002 and ≤±1 slice?** | [RECORD] **yes / NO** |

> **If NO:** record `NEGATIVE_RESULT` and escalate. **Do not widen the tolerance.** `13` §12 classes wrong
> 2D/3D mapping as **P0/Critical**, so accuracy wins over frame rate.

---

## 8. Development cost (B15)

| Field | Observation |
|---|---|
| Effort to reach working mesh rendering | [RECORD] |
| Effort to reach **reliable picking** | [RECORD] — the discriminating capability |
| Notable friction or blockers | [RECORD] |
| Assessment for `09` §7 | [RECORD] |

---

## 9. Frozen constraints — confirm each was respected

| Constraint | Respected? | Evidence |
|---|---|---|
| DR-008a canonical `(x, y, z)` convention used | [RECORD] | |
| **SCQ-06: fixtures EXACT** | [RECORD] | |
| **SCQ-06: decimated real mesh ≤ ±1 source slice** | [RECORD] | |
| **Tolerance NOT relaxed to obtain a pass** | [RECORD] must be **confirmed** | |
| DR-012 axis-aligned-only assumption honoured, not papered over | [RECORD] | |
| Measurement on **physical** device, release build | [RECORD] | |

> **If a frozen constraint was not met, the outcome is `NEGATIVE_RESULT` and an escalation — never a
> relaxed constraint.**

---

## 10. Verdict

| Field | Value |
|---|---|
| Overall result | [RECORD] `PASS` / `NEEDS_FIX` / `NEGATIVE_RESULT` |
| Acceptance criteria passed | [RECORD] e.g. 11 / 13 |
| Criteria failed, with reasons | [RECORD] |
| Constraints relaxed | **must be `NONE`** — [RECORD] |
| Escalation raised | [RECORD] none / which |
| Downstream unblocked | [RECORD] GATE-MOB-01 (jointly with Spike A), DR-008c, TECH_STACK_ADR.md evidence, picking substrate for Spike F |

### Open questions and follow-ups

[RECORD]

### Attachments

| Artifact | Path |
|---|---|
| Machine-readable measurement log | [RECORD] |
| Script / harness used | [RECORD] |
| Screenshots / recordings | [RECORD] |
| Canonical geometry fixture set | [RECORD] |
| Decimation frontier table (machine-readable) | [RECORD] |

---

**Related:** `TASK.md` · `../SPIKE_PHASE_PLAN.md` · `../SPIKE_PHASE_STATE.yaml` ·
`../../readiness/READINESS_REVIEW_RESOLUTION.md` §10
