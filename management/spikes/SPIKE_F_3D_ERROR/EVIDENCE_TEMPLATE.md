# SPIKE F — EVIDENCE TEMPLATE

**Spike:** `SPIKE_F` · **Primary Owner:** Vũ Hùng Anh · **Secondary Reviewer:** Phạm Tuấn Anh
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

> **Non-fabrication rule.** Every region-selection success rate, on-device frame rate, picking outcome and visual-legibility judgement below must be **produced by the owner** on the real device.
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
## 3. Prerequisite state

| Field | Value |
|---|---|
| **Spike B accepted?** | [RECORD] — F7 depends on the picking capability it proves |
| Spike B triangle budget in force | [RECORD] |
| Spike B measured picking error at that budget | [RECORD] slices |
| Canonical geometry fixture set used | [RECORD] |
| Mask pair used | [RECORD] identity, dimensions, **known** TP/FP/FN voxel counts |
| Was Spike B still ACTIVE when this began? | [RECORD] — **must be no** (WIP limit) |

---

## 4. Candidate comparison (F1–F4, F9–F10)

| Metric | 1: three meshes | 2: per-vertex classified surface | 3: surface + component markers |
|---|---|---|---|
| Triangle count | [RECORD] | | |
| Generation time | [RECORD] | | |
| Artifact size (MB) | [RECORD] | | |
| Pipeline steps / dependencies | [RECORD] | | |
| Deterministic generation? | [RECORD] | | |
| **Visual legibility** vs `10` §7 (categories unambiguous, legend workable) | [RECORD] | | |
| **What is a selectable "region"?** | [RECORD] | | |

---

## 5. FN geometry quality (F3) — tests the core assumption

**[ASSUMPTION under test]** FN regions are thin shells between prediction and reference boundaries and may
fragment badly under isosurface extraction, potentially making them unpickable.

| Measurement | Value |
|---|---|
| FN connected-component count | [RECORD] |
| Component size distribution (voxels) | [RECORD] |
| Degenerate / near-zero-area faces observed | [RECORD] |
| **Are FN regions pickable in practice?** | [RECORD] |
| Assumption confirmed or refuted? | [RECORD] |

---

## 6. Region → contributing-slice mapping (F5–F6) — the discriminating criterion

| Candidate | Selection → slice set resolves? | Deterministic across repeats? | Max mapping error (slices) | ≤ ±1? |
|---|---|---|---|---|
| 1 | [RECORD] | | | |
| 2 | [RECORD] | | | |
| 3 | [RECORD] | | | |

### Determinism test

| Field | Value |
|---|---|
| Repeats per selection | [RECORD] |
| Identical slice sets returned every time? | [RECORD] |
| Any nondeterminism source identified | [RECORD] |

---

## 7. On-device behaviour (F7–F8)

| Measurement | Candidate 1 | 2 | 3 | Bound |
|---|---|---|---|---|
| Region-selection success rate (% attempts) | [RECORD] | | | — |
| **Median frame rate with error view active** | [RECORD] | | | **≥ 20 FPS** |
| Longest stall | [RECORD] | | | ≤ 500 ms |
| Device memory | [RECORD] | | | — |
| Compatible with Spike B picking substrate? | [RECORD] | | | must be yes |

---

## 8. DR-005 recommendation (F11–F12)

| Field | Value |
|---|---|
| **Recommended candidate** | [RECORD] 1 / 2 / 3 / **NONE VIABLE** |
| Evidence basis | [RECORD] |
| Trade-offs accepted | [RECORD] |
| Transport implication for Spike E | [RECORD] |
| Effort estimate to productionise | [RECORD] |

### If NONE VIABLE — negative-result escalation

| Field | Value |
|---|---|
| Which criterion could not be met | [RECORD] |
| Why, with evidence | [RECORD] |
| **Escalated to leader as a DR-005 scope decision?** | [RECORD] |

> **Do NOT silently simplify the MUST feature.** `03` §4 lists *"3D is decorative only and cannot link back
> to MRI slices"* as an **MVP rejection condition** — a decorative fallback would fail acceptance while
> appearing to pass. This is a **leader decision under `00` §13**, and RA-B01 / condition **C4** depend on it.

---

## 9. Frozen constraints — confirm each was respected

| Constraint | Respected? | Evidence |
|---|---|---|
| DR-008a canonical `(x, y, z)` convention used | [RECORD] | |
| **SCQ-06 ±1-source-slice bound respected for region→slice mapping** | [RECORD] | |
| **Bound NOT relaxed to obtain a pass** | [RECORD] must be **confirmed** | |
| DR-012 axis-aligned-only honoured | [RECORD] | |
| **MUST feature not silently simplified** | [RECORD] must be **confirmed** | |
| Spike B was not ACTIVE concurrently (WIP limit) | [RECORD] | |

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
| Downstream unblocked | [RECORD] DR-005, condition C4, RA-B01 (the single BLOCKER), PR-ERR-03, PR-3D-05, TC-3D-005 design |

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
