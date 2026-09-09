# SPIKE A — EVIDENCE TEMPLATE

**Spike:** `SPIKE_A` · **Primary Owner:** Phạm Tuấn Anh · **Secondary Reviewer:** Vũ Hùng Anh
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

> **Non-fabrication rule.** Every latency, frame, stroke-loss count and touch-accuracy figure below must be **measured on the physical Samsung Galaxy A17 5G** by the owner.
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
| Reviewer | Vũ Hùng Anh |
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
## 3. Candidate framework under test

| Field | Value |
|---|---|
| Framework name | [RECORD] |
| Exact version | [RECORD] |
| 2D rendering / canvas approach | [RECORD] |
| Fixture set used | [RECORD] path + identity |

*(Duplicate this whole result file per candidate, or add a column per candidate.)*

---

## 4. Functional criteria A1–A8, A11

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| A1 | Slice renders correctly with visible `n / total` | [RECORD] | |
| A2 | Zoom/pan do not alter source-mask geometry (checksum unchanged) | [RECORD] | |
| A3 | Brush **ADD** modifies only intended pixels | [RECORD] | |
| A4 | Brush **ERASE** modifies only intended pixels | [RECORD] | |
| A5 | **Pixel-correct brush mapping after zoom/pan** | [RECORD] | see table below |
| A6 | Undo reproduces prior state | [RECORD] | |
| A7 | Redo reproduces undone state | [RECORD] | |
| A8 | Save/reload reproduces edits | [RECORD] | |
| A11 | Edit vs navigation gestures — zero accidental edits | [RECORD] | |

### A5 brush-mapping error distribution

| Fixture triple | Zoom | Pan | Expected pixel | Observed pixel | Error (dx, dy) |
|---|---|---|---|---|---|
| [RECORD] | | | | | |

| Summary | Value |
|---|---|
| Triples tested | [RECORD] |
| Exact hits | [RECORD] |
| Max error | [RECORD] px |
| **Proposed brush-mapping tolerance** (spec sets none) | [RECORD] + rationale |

---

## 5. Performance criteria A9–A10 — on-device

### A9 — cached slice switching (NFR-PERF-001)

| Measurement | Value | Bound |
|---|---|---|
| Steps in navigation test | [RECORD] | 30 |
| p50 latency | [RECORD] ms | — |
| **p95 latency** | [RECORD] ms | **≤ 200** |
| Max latency | [RECORD] ms | — |
| Full-volume network transfer per gesture observed? | [RECORD] | **must be no** |
| **Verdict** | [RECORD] PASS / FAIL | |

### A10 — brush feedback (NFR-PERF-003)

| Measurement | Value | Bound |
|---|---|---|
| p50 first-visible-feedback | [RECORD] ms | — |
| Worst-case feedback | [RECORD] ms | **≤ 100** |
| **Committed stroke samples lost** | [RECORD] | **0** |
| **Verdict** | [RECORD] PASS / FAIL | |

### Stalls observed

| Interaction | Longest stall (ms) |
|---|---|
| [RECORD] | |

---

## 6. Development cost (A12)

| Field | Observation |
|---|---|
| Effort to reach a working brush primitive | [RECORD] |
| Notable friction or blockers | [RECORD] |
| Maturity of the coordinate/transform handling | [RECORD] |
| Assessment for `09` §7 (velocity within the 30-day constraint) | [RECORD] |

---

## 7. Frozen constraints — confirm each was respected

| Constraint | Respected? | Evidence |
|---|---|---|
| DR-008a canonical `(x, y, z)` convention used, no local variant | [RECORD] | |
| DR-009: interactive brush feedback did **not** wait on network | [RECORD] | |
| DR-009: undo/redo scoped to the local editing session | [RECORD] | |
| NFR-PERF-001 / NFR-PERF-003 **not** weakened to obtain a pass | [RECORD] must be **confirmed** | |
| Measurement on **physical** device, release build | [RECORD] | |

> **If a frozen constraint was not met, the outcome is `NEGATIVE_RESULT` and an escalation — never a
> relaxed constraint.**

---

## 8. Verdict

| Field | Value |
|---|---|
| Overall result | [RECORD] `PASS` / `NEEDS_FIX` / `NEGATIVE_RESULT` |
| Acceptance criteria passed | [RECORD] e.g. 11 / 13 |
| Criteria failed, with reasons | [RECORD] |
| Constraints relaxed | **must be `NONE`** — [RECORD] |
| Escalation raised | [RECORD] none / which |
| Downstream unblocked | [RECORD] GATE-MOB-01 (jointly with Spike B), TECH_STACK_ADR.md evidence, proposed brush-mapping tolerance |

### Open questions and follow-ups

[RECORD]

### Attachments

| Artifact | Path |
|---|---|
| Machine-readable measurement log | [RECORD] |
| Script / harness used | [RECORD] |
| Screenshots / recordings | [RECORD] |


---

**Related:** `TASK.md` · `../SPIKE_PHASE_PLAN.md` · `../SPIKE_PHASE_STATE.yaml` ·
`../../readiness/READINESS_REVIEW_RESOLUTION.md` §10
