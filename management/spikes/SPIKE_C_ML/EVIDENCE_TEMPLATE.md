# SPIKE C (stages C0 and C1) — EVIDENCE TEMPLATE

**Spike:** `SPIKE_C0 / SPIKE_C1` · **Primary Owner:** Bế Quốc Khánh · **Secondary Reviewer:** Vũ Hùng Anh
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

> **Non-fabrication rule.** Every GPU/VRAM figure, memory measurement, throughput, wall-clock, loss value and derived calendar figure below must be **measured on the real compute** by the owner.
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
## 2. Which stage does this result cover?

| Field | Value |
|---|---|
| Stage | [RECORD] **C0 (preliminary, synthetic)** / **C1 (final, real validated subset)** |
| If C1: Spike D accepted? | [RECORD] — **C1 requires it** |
| **Does this evidence close `GATE-ML-01`?** | C0 → **NO, never**. C1 → [RECORD] |

---

## 3. Compute environment — C0 deliverable Q1

| Field | Value |
|---|---|
| **GPU model** | [UNVERIFIED] or **explicit statement that only CPU/Colab-class exists** |
| **VRAM** | [UNVERIFIED] |
| Host CPU / RAM | [UNVERIFIED] |
| DL framework + exact version | [RECORD] |
| CUDA / driver version where applicable | [RECORD] |
| Precision used (fp32 / fp16 / bf16) | [RECORD] |
| Is this the hardware the real matrix will run on? | [RECORD] |

*(DR-003: training need **not** run on the Mac mini.)*

---

## 4. Configurations trialled

| # | Family | Variant / checkpoint source | Decoder / head | Input size | Batch size |
|---:|---|---|---|---|---|
| 1 | DINOv2 | [RECORD] | [RECORD] | [RECORD] | [RECORD] |
| 2 | UNet baseline | — | [RECORD] | [RECORD] | [RECORD] |

---

## 5. Memory and throughput (C0-2 … C0-5 / C1-1 … C1-3)

| Measurement | DINOv2 config | UNet config |
|---|---|---|
| Peak memory at intended batch size | [RECORD] | [RECORD] |
| Intended batch size fits? | [RECORD] | [RECORD] |
| Largest fitting batch size | [RECORD] | [RECORD] |
| Throughput (state the unit and method) | [RECORD] | [RECORD] |
| Effective output stride | [RECORD] | [RECORD] |
| Practical input resolution *(C1)* | [RECORD] | [RECORD] |

---

## 6. Calendar feasibility (C0-7/8, C1-2/9)

| Field | Value |
|---|---|
| Per-run wall-clock, extrapolated | [RECORD] hours |
| **Extrapolation method (show the arithmetic)** | [RECORD] |
| Preliminary or final? | [RECORD] — C0 output must be labelled **preliminary** |
| Total for 6 core runs | [RECORD] |
| Plus `EXP-D-PP` derived ablation | [RECORD] |
| **Fits the remaining project calendar?** | [RECORD] **yes / NO** |

> **"No" is a valid and valuable result.** Reduce input resolution or model size **BEFORE** freezing the
> recipe, never mid-matrix — `08` §2 requires the recipe identical across `EXP-D-025/050/100`.

---

## 7. C1 only — real-data behaviour

| Field | Value |
|---|---|
| Subset case IDs used | [RECORD] |
| **Partition drawn from** | [RECORD] — **must be TRAINING only** |
| Proof it is not validation or holdout | [RECORD] |
| Observed LA cavity boundary thickness | [RECORD] voxels |
| **Effective output resolution vs that thickness** | [RECORD] |
| Decoder behaviour on real LA anatomy | [RECORD] |
| **Convergence sanity** — loss decreasing, no divergence, both families | [RECORD] + attach curves |

---

## 8. DR-011 normalization conformance

| Check | Result |
|---|---|
| **Cohort-fitted statistics used anywhere?** | [RECORD] — **must be NO** |
| Per-image / per-volume normalization documented | [RECORD] |
| Fixed pretrained-model constants used where required | [RECORD] |
| Applied **identically** across model families | [RECORD] |
| Applied **identically** across data fractions | [RECORD] |
| Recorded in `preprocessing_version` as | [RECORD] |

---

## 9. `ADR-ML-001` field coverage (`07` §2)

| Required ADR field | Evidence available? |
|---|---|
| DINOv2 variant + pretrained checkpoint source | [RECORD] |
| Backbone frozen / partially / fully fine-tuned | [RECORD] |
| Decoder / head architecture | [RECORD] |
| Input size / channel conversion | [RECORD] |
| Loss, optimizer, LR policy, batch size, epoch/early-stopping | [RECORD] |
| Threshold / binarization rule | [RECORD] |
| **Compute / memory feasibility evidence** | [RECORD] — this spike's core purpose |
| Rationale for scientific fairness against UNet | [RECORD] |

---

## 10. Frozen constraints — confirm each was respected

| Constraint | Respected? | Evidence |
|---|---|---|
| **DR-011: no cohort-fitted normalization statistics** | [RECORD] must be **confirmed** | |
| C1 subset from the **training partition only** | [RECORD] | |
| **`GATE-ML-01` not closed on C0 evidence** | [RECORD] must be **confirmed** | |
| Final DINOv2 recipe **not** frozen by this spike | [RECORD] | |
| No matrix run launched | [RECORD] | |
| C0 did not compete with Spike D as a primary task | [RECORD] | |

> **If a frozen constraint was not met, the outcome is `NEGATIVE_RESULT` and an escalation — never a
> relaxed constraint.**

---

## 11. Verdict

| Field | Value |
|---|---|
| Overall result | [RECORD] `PASS` / `NEEDS_FIX` / `NEGATIVE_RESULT` |
| Acceptance criteria passed | [RECORD] e.g. 11 / 13 |
| Criteria failed, with reasons | [RECORD] |
| Constraints relaxed | **must be `NONE`** — [RECORD] |
| Escalation raised | [RECORD] none / which |
| Downstream unblocked | [RECORD] C0: preliminary ADR-ML-001 evidence only. C1: GATE-ML-01 (DR-G03), ADR-ML-001, matrix sizing |

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
