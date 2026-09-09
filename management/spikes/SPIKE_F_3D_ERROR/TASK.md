# SPIKE F — TASK

## Identity

| Field | Value |
|---|---|
| **Spike ID** | `SPIKE_F` |
| **Name** | 3D error representation and region → contributing-slice mapping |
| **Priority** | P1 |
| **Primary Owner** | **Vũ Hùng Anh** |
| **Secondary Reviewer** | **Phạm Tuấn Anh** |
| **Status** | **PREPARED** — queued behind Spike B as this owner's next primary spike |
| **Blocked by** | nothing formally (DR-008a ✅ resolved) — **but WIP-limited behind Spike B, see below** |
| **Lead Claude chat** | CHAT C — ML / Imaging Research (support: CHAT D for implementation, CHAT B for mobile picking compatibility) |

## WIP constraint — read before starting

**Spike B is this owner's ACTIVE primary task.** Spike F is his **next** primary spike.

> **Preparation may begin now** — synthetic TP/FP/FN fixture construction only. **Spike F must not become a
> second primary task while Spike B is ACTIVE** (`15` §7).

There is also a real technical reason to queue it: **acceptance criterion F7 requires the mobile picking
capability that Spike B proves.** Running F before B would mean evaluating region-picking against an
unproven picking substrate.

## Source requirement IDs

**PR-ERR-03** · **PR-3D-05** · **FR-3D-007** · **FR-3D-008** · UC-09 · SCR-05 · `07` §7 · `10` §7 ·
`11` §7 · `13` §12 (P0 class)
**Behaviour later asserted by:** `TC-3D-005`
**Decisions:** **DR-005 (OPEN — this spike supplies its evidence)** · DR-008a ✅ · DR-008b FROZEN (SCQ-06)
**Findings:** **RA-B01 — the project's single BLOCKER** · readiness condition **C4**

## Objective

Determine **empirically** which 3D error representation supports **FR-3D-008's region-to-contributing-slices
navigation** at acceptable mesh cost, so **DR-005 is decided on evidence rather than from first principles**.

**[SPEC]** `04` FR-3D-007 requires generating a 3D error representation from prediction-vs-ground-truth
disagreement; FR-3D-008 requires a selected error region to navigate to one or more contributing slices.
**[VERIFIED]** `07` §7 specifies reconstruction of a **single LA surface only**. Nothing in the frozen
specification defines error-mesh construction, region addressability, or region→slice resolution. **That
absence is RA-B01.**

## Hypotheses / questions to answer

| # | Question |
|---:|---|
| Q1 | For each candidate: triangle count, generation time, and **visual legibility** against `10` §7's requirement that error categories stay unambiguous? |
| Q2 | **[ASSUMPTION to be tested]** Do FN regions — thin shells between the prediction and reference boundaries — produce fragmented or near-degenerate geometry under isosurface extraction, and does that make them **unpickable**? |
| Q3 | For each candidate: can a user **select a region**, and does that selection **resolve to contributing slices deterministically**? *(This is FR-3D-008 and the discriminating criterion.)* |
| Q4 | Frame-rate impact on the declared device, combined with Spike B's mesh budget? |
| Q5 | Which candidate should DR-005 adopt — or is none viable in the project window? |

## Candidates to compare

| # | Representation | Expected trade-off **[ASSUMPTION]** |
|---:|---|---|
| 1 | **Three separate meshes** (TP / FP / FN) with independent visibility toggles | Maps cleanly to `10` §7's error legend; triples the mesh budget; FN meshes may be degenerate |
| 2 | **One LA surface with per-vertex error classification** | Single mesh, cheap to render, natural picking; represents error **on the surface only** — cannot show volumetric FP islands away from the surface |
| 3 | **Surface mesh + addressable FP/FN connected-component markers**, each carrying a precomputed slice range | Likely best fit for FR-3D-008 — "region → contributing slices" becomes a **stored property** of each component rather than a runtime computation |

**Do not pre-commit to a candidate.** The point of this spike is to replace the assumption with a
measurement.

## Inputs

- A prediction / ground-truth mask pair. **Synthetic with known TP/FP/FN structure is acceptable and
  preferred for preparation** — `13` §11 already requires "a small binary mask pair with known
  TP/FP/FN/Dice/IoU" in the canonical fixture set.
- The **canonical geometry fixture set** in the DR-008a ✅ convention — this owner's Spike B deliverable,
  reused here.
- Spike B's **mesh/decimation budget** and proven picking capability, once available.

## Prerequisites

| # | Prerequisite | Hard or soft |
|---:|---|---|
| 1 | Synthetic TP/FP/FN fixtures | **hard** — but may be built now during preparation |
| 2 | Canonical geometry fixture set (DR-008a) | **hard** |
| 3 | **Spike B accepted** — picking capability proven, mesh budget known | **hard for acceptance**, soft for preparation |
| 4 | DR-006 device profile captured | **hard for on-device measurement** |

## Exact environment

| Field | Value |
|---|---|
| Device | **Samsung Galaxy A17 5G**, physical — for Q3 and Q4 |
| Device profile | **[UNVERIFIED — capture]** all seven DR-006 fields |
| Pipeline environment | **[RECORD]** OS, Python/tooling, mesh library + exact version |
| Mask pair identity | **[RECORD]** fixture name, dimensions, known TP/FP/FN voxel counts |
| Mesh generation method + version | **[RECORD]** per candidate |
| Spike B budget in force | **[RECORD]** triangle budget and its measured picking error |

## Frozen constraints

**Canonical indexing (DR-008a ✅)** — voxel `(x, y, z)`, x = column, y = row, z = slice index;
`slice_index` = z over `0..Nz-1`; slice shape `[Ny, Nx]`; top-left origin, +x right, +y down; library memory
order outside the contract.

**Picking accuracy (SCQ-06 / DR-008b — FROZEN)**

| Context | Bound |
|---|---|
| Canonical fixtures | **EXACT** expected slice |
| Decimated real mesh | **≤ ±1 source slice** |

> **Region → contributing-slice mapping must respect the same bound. Do not relax it.**

**Geometry boundary (DR-012 ✅)** — validated axis-aligned geometry only.

## Implementation boundary

**Allowed:**

```text
spikes/spike_f_3d_error/**                     throwaway pipeline + harness - NOT production code
tests/fixtures/error_masks/**                  synthetic TP/FP/FN fixtures
management/spikes/SPIKE_F_3D_ERROR/RESULT.md   (only when real evidence exists)
```

**Forbidden:**

- Any edit to `docs/specs/v1.0/`.
- **Deciding DR-005** — this spike supplies evidence; the leader decides.
- **Silently simplifying the MUST feature** (see below).
- Production repository modules.
- Relaxing the ±1-slice bound.

## Acceptance criteria

| # | Criterion |
|---:|---|
| F1 | For **each** candidate: triangle count and generation time recorded |
| F2 | For **each** candidate: visual legibility assessed against `10` §7 — error categories unambiguous, with a compact legend |
| F3 | **FN-region geometry quality characterised** — fragmentation, degenerate faces, component count (answers Q2) |
| F4 | **Addressable error-region semantics defined** per candidate — what exactly is a selectable "region"? |
| F5 | **Deterministic region → contributing-slice mapping demonstrated** — the same selection yields the same slice set every time |
| F6 | Region→slice mapping respects the **≤ ±1 source slice** bound |
| F7 | **Compatibility with the mobile picking capability proven by Spike B** confirmed on device |
| F8 | Frame-rate impact measured on the declared device, combined with Spike B's budget |
| F9 | Mesh/artifact **cost** reported per candidate — bytes, and transport implication for Spike E |
| F10 | **Generation complexity** reported — pipeline steps, dependencies, determinism |
| F11 | A **recommendation for DR-005**, with evidence and stated trade-offs |
| F12 | If no candidate is viable: an explicit **`NEGATIVE_RESULT`** with the reasoning |

## Measurements required

| Measurement | Unit |
|---|---|
| Triangle count, per candidate | count |
| Mesh generation time, per candidate | ms/s |
| FN component count and size distribution | count / voxels |
| Region-selection success rate on device | % of attempted selections |
| Region → slice mapping error | slices (bound: ≤ 1) |
| Mapping determinism across repeats | pass/fail |
| Median frame rate with the error representation active | FPS (bound: ≥ 20, NFR-PERF-002) |
| Artifact size, per candidate | MB |

## Automated evidence required

- Error-classification pipeline producing TP/FP/FN volumes from a mask pair, verified against the
  fixture's **known** counts.
- Connected-component labelling with per-component slice ranges (for candidate 3).
- Region→slice determinism test: repeat the same selection N times, compare outputs.
- Machine-readable per-candidate cost table.

## Manual evidence required

- **On-device region-selection and frame-rate measurements — executed by Vũ Hùng Anh.**
- Screenshots or recording of each candidate's error visualisation, for the F2 legibility judgement.
- Completed device-profile block.
- Owner's written DR-005 recommendation.

## Fail conditions — and the escalation rule

| Condition | Consequence |
|---|---|
| No candidate supports deterministic region → slice resolution | **`NEGATIVE_RESULT`** → DR-005 escalation |
| FN regions prove unpickable at every candidate | **`NEGATIVE_RESULT`** → DR-005 escalation |
| Only configurations exceeding ±1 slice work | **`NEGATIVE_RESULT`** — do **not** widen the bound |
| Frame rate unachievable with any viable representation | **`NEGATIVE_RESULT`** → escalation |

### The escalation rule — explicit

> **If the MUST feature is not achievable within the project window, DO NOT silently simplify it.**
>
> **Report the negative result and trigger the formal scope decision.**

**[SPEC]** `03` §4 lists *"3D is decorative only and cannot link back to MRI slices"* as an **MVP rejection
condition**. Quietly shipping a decorative 3D error view would therefore fail acceptance while appearing to
pass. A negative result here is the honest outcome and requires a **leader decision under `00` §13** —
DR-005 option 4 — not an implementation shortcut.

## Expected deliverables

1. `management/spikes/SPIKE_F_3D_ERROR/RESULT.md` — per-candidate comparison against F1–F12.
2. Error-classification + component-labelling pipeline under `spikes/spike_f_3d_error/`.
3. Synthetic TP/FP/FN fixtures under `tests/fixtures/error_masks/`.
4. **DR-005 recommendation** — or an explicit `NEGATIVE_RESULT`.
5. Completed device-profile block.

## Estimated effort

**[ESTIMATE]** Preparation (fixtures + classification pipeline) is off-device and may start now. The
comparative evaluation is the substantial part and requires Spike B's picking substrate plus contended
device access (`SPIKE_PHASE_PLAN.md` §4.3). This is the spike whose scope is least predictable, because the
specification provides no pipeline to implement.

## Risk

**`RISK-3DERR-01`** (HIGH) · `RISK-3D-GEOMETRY` (HIGH, shared with Spike B) · `RISK-SCOPE-01` (HIGH — a
negative result triggers a MUST-scope decision)

## Downstream unblocked

**DR-005** · **readiness condition C4** · **RA-B01 — the single BLOCKER** · PR-ERR-03 · PR-3D-05 ·
`TC-3D-005` test basis

## What Claude may NOT fabricate

> **Claude must not invent, estimate-as-measured, or otherwise fabricate:** region-selection success rates,
> on-device frame rates, picking behaviour, visual-legibility judgements, mesh generation timings measured
> on real hardware, or any device hardware value.
>
> **All on-device measurements and all legibility judgements are made by Vũ Hùng Anh.**
>
> Claude **may**: build the error-classification and component-labelling pipeline, generate synthetic
> fixtures, write the determinism tests, compute triangle counts and artifact sizes from generated meshes,
> prepare the result template, and analyse evidence the owner supplies.

**No `RESULT.md` exists in this directory.** Create it only when real evidence exists.
