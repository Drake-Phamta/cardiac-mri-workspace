# SPIKE C — TASK (two stages: **C0** then **C1**)

## Identity

| Field | Value |
|---|---|
| **Spike ID** | `SPIKE_C0` (preliminary) and `SPIKE_C1` (final) |
| **Name** | ML compute feasibility — DINOv2 + UNet baseline |
| **Priority** | P1 (both stages) |
| **Primary Owner** | **Bế Quốc Khánh** (both stages) |
| **Secondary Reviewer** | **Vũ Hùng Anh** (both stages) |
| **Status** | **C0 = PREPARED** (queued; bounded preparation only) · **C1 = BLOCKED** (`blocked_by: SPIKE_D`) |
| **Lead Claude chat** | CHAT C — ML / Imaging Research (support: CHAT A for calendar arithmetic) |

> **Naming.** Always write **"Spike C0"** and **"Spike C1"** with the word *Spike*. A bare `C1` means
> **readiness condition C1** (Spike D / GATE-DATA-01). Condition C1 happens to be Spike C1's prerequisite —
> they are not the same thing.

## Source requirement IDs

`GATE-ML-01` · `ADR-ML-001` · `07` §2 · `07` §3 · `07` §10 · `08` §2 · `08` §4 · PR-EXP-01 · PR-EXP-03 ·
NFR-REP-001 · RQ-A
**Decisions:** **DR-007 ✅** (Spike C approved and split) · **DR-011 ✅** (normalization policy) ·
DR-002 (OPEN — governs C1's subset) · DR-G03 (`GATE-ML-01`)
**Findings:** RA-H06 (this spike exists because of it) · RA-H16 (resolved by DR-011)

## Objective

Establish whether the `08` §2 experiment matrix — **six training runs plus one derived ablation** — is
achievable on the **actual available hardware** within the remaining project calendar, and produce the
compute/memory feasibility evidence `07` §2 requires for `ADR-ML-001`.

## The two-stage split and why it exists (DR-007 ✅)

| | **Spike C0** | **Spike C1** |
|---|---|---|
| **Data** | synthetic or shape-matched | small representative **validated real** subset |
| **Prerequisite** | none — starts now | **accepted Spike D** (condition C1) |
| **Closes `GATE-ML-01`?** | **NO — explicitly insufficient** | **YES — the gate may close only after C1** |

**Why the gate waits.** `08` §2 requires the recipe be held **identical** across `EXP-D-025/050/100`. A
recipe frozen on synthetic-data evidence could prove unusable on real volumes, and discovering that after
`GATE-ML-01` **invalidates completed runs**.

---

## WIP constraint — read before starting C0

**Spike D is this owner's ACTIVE primary task.** Spike C0 occupies the **"one very small preparation
activity"** slot of `15` §7.

> **Spike C0 may use otherwise-idle waiting time during the dataset download. It MUST NOT become a second
> primary task competing with Spike D.**

If C0 starts consuming focus that Spike D needs — especially on day one, when the **DR-001 escalation
trigger** must be evaluated — **pause C0**. Spike D is P0; C0 is not.

---

# STAGE C0 — preliminary feasibility (synthetic / shape-matched data)

## Hypotheses / questions

| # | Question |
|---:|---|
| Q1 | **What compute actually exists?** GPU model + VRAM, or is it CPU/Colab-class only? |
| Q2 | Peak memory for a DINOv2-based configuration and for the UNet baseline at the intended input size and batch size? |
| Q3 | If the intended batch size does not fit, what is the largest that does? |
| Q4 | Rough throughput — steps or slices per second per family? |
| Q5 | What is the decoder's **effective output stride**? |
| Q6 | Which DINOv2 variant / checkpoint source / decoder options are feasible, at what measured cost? |
| Q7 | **Preliminary** calendar arithmetic — do 6 runs + 1 ablation plausibly fit? |

## Inputs

- Synthetic volumes **matching the expected shape and dtype**. Real data is **not** required and C0 must
  **not** wait for Spike D.
- Candidate DINOv2 variants and decoder heads to trial.
- A UNet baseline implementation.

## Prerequisites

None — but see the WIP constraint above.

## Exact environment

| Field | Value |
|---|---|
| Compute | **[UNVERIFIED — Q1 is the first deliverable]** GPU model + VRAM, or explicit statement that only CPU/Colab-class resources exist |
| Framework + versions | **[RECORD]** DL framework, CUDA/driver where applicable, exact versions |
| DINOv2 variant + checkpoint source | **[RECORD]** per trial |
| Decoder / head | **[RECORD]** per trial |
| Input size, batch size, precision | **[RECORD]** per trial |

## Frozen constraint — normalization (DR-011 ✅)

> **No cohort-fitted normalization statistics** across data-fraction experiments. Use documented
> **per-image / per-volume normalization**, plus **fixed pretrained-model constants** where the backbone
> requires them, applied **identically across model families and across all data fractions**.

Recorded in `preprocessing_version` so it appears in every `08` §10 manifest. **C0 must configure this
policy from the start** — not retrofit it later.

## Acceptance criteria — C0

| # | Criterion |
|---:|---|
| C0-1 | **Available compute explicitly declared** with real values |
| C0-2 | Peak memory measured for DINOv2-based and UNet configurations at the intended input/batch size |
| C0-3 | Largest fitting batch size reported if the intended one does not fit |
| C0-4 | Basic throughput measured per family, with the measurement method stated |
| C0-5 | **Effective output stride** reported for the candidate decoder |
| C0-6 | Candidate variant / checkpoint / decoder options listed **with their measured costs** |
| C0-7 | **Preliminary** per-run wall-clock extrapolation, method shown, explicitly labelled *preliminary* |
| C0-8 | Preliminary calendar verdict on 6 runs + 1 ablation, arithmetic shown |
| C0-9 | DR-011 normalization policy configured and documented |
| C0-10 | **Explicit statement that C0 evidence does not close `GATE-ML-01`** |

## C0's explicit limitation — must be stated in the result

> Synthetic data **cannot** establish convergence behaviour, achievable segmentation quality, or the
> interaction between output stride and the **real** LA cavity boundary thickness. **C0 is a
> hardware-and-throughput probe only.**

---

# STAGE C1 — final feasibility (small representative validated real subset)

## Status

**BLOCKED_BY_SPIKE_D.** No C1 work while blocked.

## Prerequisites

1. **Spike D ACCEPTED** — validated package, `DATASET_AUDIT.md` + manifest accepted (condition **C1**).
2. A **small representative validated real subset**.
3. **Subset discipline:** drawn from the **training partition only** once `GATE-SPLIT-01` (DR-002)
   resolves. **Never** validation or holdout data — `06` §6 split invariants and `07` §10.

## Hypotheses / questions

| # | Question |
|---:|---|
| Q8 | Real-data memory behaviour — does C0's figure hold on real volumes? |
| Q9 | Real-data throughput and per-run calendar estimate — supersedes C0's preliminary number |
| Q10 | What is the **practical input resolution**? |
| Q11 | How does the decoder behave on **real LA anatomy**? |
| Q12 | **Effective output resolution measured against the observed LA cavity boundary thickness in voxels** |
| Q13 | Do both families **converge stably** on real data under the candidate recipe? |
| Q14 | **Final verdict:** do the six core runs plus the derived ablation fit the remaining project calendar? |

**[ASSUMPTION]** Q12 is the single most likely reason a DINOv2 segmentation underperforms on this task: a
ViT backbone produces dense features at a fraction of input resolution, and the LA cavity boundary is thin.
Better discovered here than after `GATE-ML-01`.

## Acceptance criteria — C1

| # | Criterion |
|---:|---|
| C1-1 | Real-data peak memory measured, confirming or correcting C0 |
| C1-2 | Real-data per-run wall-clock, extrapolated to the full training set, method stated |
| C1-3 | Practical input resolution determined |
| C1-4 | Decoder behaviour on real LA anatomy reported |
| C1-5 | **Effective output resolution vs observed LA boundary thickness in voxels** |
| C1-6 | **Convergence sanity** evidence for both families — loss decreasing, no divergence |
| C1-7 | **DR-011 normalization conformance confirmed** — no cohort-fitted statistics anywhere |
| C1-8 | Subset provenance recorded: which cases, from which partition, and proof it is training-only |
| C1-9 | **Final calendar verdict** on 6 runs + 1 ablation, arithmetic shown. **"No" is a valid result.** |
| C1-10 | Every `07` §2 `ADR-ML-001` field has supporting evidence |

## Fail conditions — both stages

| Condition | Consequence |
|---|---|
| Calendar verdict is "no" | **Valid, valuable result.** Reduce input resolution or model size **BEFORE** freezing the recipe, never mid-matrix; record the change as part of `GATE-ML-01`. |
| Memory does not fit at any usable batch size | Escalate; feeds the `ADR-ML-001` feasibility record |
| C1 subset drawn from validation or holdout | **Governance violation** — invalidates split discipline (`06` §6, NFR-REP-002) |
| Cohort-fitted normalization used | **Violates DR-011 ✅** — reconfigure, do not proceed |
| `GATE-ML-01` closed on C0 evidence alone | **Governance violation** — DR-007 ✅ forbids it |

**[SPEC]** `00` §9 and PR-SCI-03 permit a **smaller-but-honest** experiment. What they forbid is changing
the protocol **after seeing results**. A "no" here is exactly the kind of finding this spike exists to
surface early.

## Implementation boundary

**Allowed:**

```text
spikes/spike_c_ml/**                        throwaway feasibility harness - NOT the production pipeline
management/spikes/SPIKE_C_ML/RESULT.md      (only when real evidence exists)
```

**Forbidden:**

- Any edit to `docs/specs/v1.0/`.
- **Freezing the final DINOv2 recipe** — that is `GATE-ML-01` / `ADR-ML-001`, and it needs C1.
- Writing `ADR-ML-001`.
- Launching any of the six core matrix runs.
- Touching validation or holdout data.
- Building the production ML pipeline.

## Measurements required

| Measurement | Stage | Unit |
|---|---|---|
| GPU model, VRAM (or CPU-only statement) | C0 | text |
| Peak memory, per family and configuration | C0, C1 | MB/GB |
| Largest fitting batch size | C0 | count |
| Throughput | C0, C1 | steps/s or slices/s |
| Effective output stride | C0 | ratio |
| Effective output resolution vs LA boundary thickness | C1 | voxels |
| Per-run wall-clock, extrapolated | C0 (prelim), C1 (final) | hours |
| Total for 6 runs + 1 ablation | C0 (prelim), C1 (final) | hours/days |
| Convergence indicator | C1 | loss curve |

## Automated evidence required

- Re-runnable feasibility harness reporting memory, throughput and configuration in machine-readable form.
- Extrapolation script showing its arithmetic — **not a hand-typed estimate**.
- Loss/metric logs for C1 convergence sanity.

## Manual evidence required

- **Hardware declaration and all measured timings/memory — executed by Bế Quốc Khánh on the real compute.**
- Owner's written calendar verdict.
- C1 subset provenance statement.

## Expected deliverables

1. `management/spikes/SPIKE_C_ML/RESULT.md` — **both stages clearly separated**, C0 labelled preliminary.
2. Feasibility harness under `spikes/spike_c_ml/`.
3. Candidate-configuration cost table.
4. Calendar arithmetic (preliminary from C0, final from C1).
5. Evidence for every `07` §2 `ADR-ML-001` field.

## Estimated effort

**[ESTIMATE]** C0: bounded, opportunistic — it must fit the waiting time around Spike D without competing
with it. C1: depends on Spike D and on the compute declared in C0; genuinely unknowable until Q1 is
answered.

## Risk

`RISK-COMPUTE` (HIGH) · `RISK-CONFOUND-01` (MEDIUM, mitigated by DR-011 ✅) · `RISK-DATA-01` (HIGH — C1
inherits Spike D's dependency)

## Downstream unblocked

**C0:** preliminary `ADR-ML-001` evidence; early sizing input for the future baseline. **Explicitly cannot
close `GATE-ML-01`.**
**C1:** **`GATE-ML-01` (DR-G03)** · `ADR-ML-001` · sizing of the `08` §2 matrix

## What Claude may NOT fabricate

> **Claude must not invent, estimate-as-measured, or otherwise fabricate:** GPU or VRAM figures, peak
> memory, throughput, per-run wall-clock, convergence behaviour, loss values, output-stride measurements on
> real anatomy, LA boundary thickness, or any calendar figure derived from unmeasured timings.
>
> **All hardware and timing measurements are executed by Bế Quốc Khánh on the real compute.**
>
> Claude **may**: build the harness, write the extrapolation script, propose candidate variants and
> decoders, structure the result template, and analyse measurements the owner supplies.

**No `RESULT.md` exists in this directory.** Create it only when real measured evidence exists.
