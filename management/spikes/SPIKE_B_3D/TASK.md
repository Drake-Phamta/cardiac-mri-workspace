# SPIKE B — TASK

## Identity

| Field | Value |
|---|---|
| **Spike ID** | `SPIKE_B` |
| **Name** | 3D linked interaction |
| **Priority** | P1 |
| **Primary Owner** | **Vũ Hùng Anh** |
| **Secondary Reviewer** | **Phạm Tuấn Anh** |
| **Status** | **PREPARED** — authorised and assigned; **execution not started**. On starting: set `ACTIVE` and record the real `started_at` (never backdate). |
| **Blocked by** | nothing (DR-006 ✅ device, DR-008a ✅ convention both resolved) |
| **Lead Claude chat** | CHAT D — Implementation (support: CHAT B for `ADR-MOB-001` + DR-008c, CHAT C for geometry/mesh semantics) |
| **Device measurement slot** | **2 of 3** — harness and fixture work proceeds **while Spike A holds the phone**; measurement windows must not overlap |
| **Review** | Reviewed by Phạm Tuấn Anh, **priority 1** ahead of Spike E (P2). Serialized |

## Source requirement IDs

FR-3D-001 · FR-3D-002 · FR-3D-003 · FR-3D-004 · FR-3D-005 · FR-3D-006 · PR-3D-01 · PR-3D-02 · PR-3D-03 ·
PR-3D-04 · NFR-PERF-002 · NFR-MAINT-002 · NFR-REL-003 · `07` §7 · `07` §8 invariants 1, 4, 5 ·
`07` §12 Spike B · `09` §6 · `10` §6
**Behaviour later asserted by:** `TC-3D-001` · `TC-3D-002` · `TC-3D-003` · `TC-3D-004` · `TC-PERF-002` ·
`TC-MAINT-002`
**Decisions:** DR-006 ✅ · DR-008a ✅ · **DR-008b FROZEN (SCQ-06)** · **DR-008c OPEN — this spike decides it** ·
DR-G05
**Findings:** RA-H05, RA-H07 (resolved) · **RA-H11** (bounded) · **RA-H14** (this spike closes it)

## Objective

Prove a candidate framework can render the LA mesh interactively on the declared device **and** perform
**reliable picking that resolves to the correct source slice**, then determine the **DR-008c mesh /
decimation budget** that satisfies **both** the performance target **and** the frozen accuracy bound.

> **Picking, not rendering, is the discriminating capability.** FR-3D-005/006 require resolving a touch to
> a slice index. A framework that renders acceptably but cannot pick reliably has **failed**.

## FROZEN ACCURACY RULE — fixed before this spike (SCQ-06)

| Context | Bound |
|---|---|
| **Canonical synthetic geometry fixtures** | **EXACT** expected slice — zero tolerance |
| **Real decimated-mesh picking** | **maximum error = ±1 source slice** |

> **This threshold is fixed before Spike B. Spike B validates conformance; it does not derive or negotiate
> the value.**
>
> **DO NOT loosen the tolerance merely to obtain a passing framework.** Widening it requires a Decision
> Request under `00` §13. If no tested configuration satisfies both constraints, **record a
> `NEGATIVE_RESULT` and escalate.**

## Hypotheses / questions to answer

| # | Question |
|---:|---|
| Q1 | Can the framework render the canonical LA mesh and support rotate / zoom / pan? |
| Q2 | Is the active 2D slice represented by a plane or marker computed **from source geometry**, not a visual approximation (`07` §8 invariant 5)? |
| Q3 | Does 3D selection/picking work, and does the selected location **resolve to the correct source slice** — including after camera rotate and zoom? |
| Q4 | Does the 2D viewer synchronise to the resolved slice (FR-3D-006)? |
| Q5 | Does geometry remain correct after arbitrary camera manipulation (`07` §8 invariant 4)? |
| Q6 | Do invalid/background selections produce **no misleading navigation** (`10` §6)? |
| Q7 | Is **≥20 FPS median** achieved with **no interaction stall >500 ms** (NFR-PERF-002)? |
| Q8 | **What is the decimation frontier** — triangle count vs frame rate vs real-mesh picking error? |
| Q9 | **Is there any configuration satisfying BOTH NFR-PERF-002 and ≤±1 source slice?** |

## Inputs

- **Canonical geometry fixture set** — *this owner's deliverable* (DR-013 ✅ gives him the geometry
  contract). Must encode known **voxel ↔ world ↔ slice** points in the DR-008a convention, per `09` §6.
- A mesh generated from a validated or **synthetic** binary mask volume. Synthetic is acceptable — this
  spike must not wait for Spike D.
- At least **three decimation levels** to trace the frontier.

## Prerequisites

1. **DR-006 device profile captured** from the Galaxy A17 5G.
2. **Canonical fixture set built** against DR-008a — the input to both this spike and Spike F, and to
   `TC-MAINT-002`.

## Exact environment

| Field | Value |
|---|---|
| Device | **Samsung Galaxy A17 5G**, physical — **emulator unacceptable** for Q7 |
| Device profile | **[UNVERIFIED — capture]** all seven DR-006 fields |
| Candidate framework(s) + 3D stack | **[RECORD]** name + exact version, including the rendering/picking library |
| Build type | **[RECORD]** release-mode measurement required |
| Test conditions | **[RECORD]** thermal state, power mode, background load, brightness, throttling |
| Mesh source | **[RECORD]** mask volume identity, reconstruction method + version, triangle count per level |

## Frozen constraint — canonical indexing (DR-008a ✅)

```text
voxel (x, y, z):  x = COLUMN,  y = ROW,  z = SLICE INDEX
shape_xyz = [Nx, Ny, Nz]        slice_index = z, valid 0..Nz-1
slice shape = [Ny, Nx]          (u,v) -> (x=u, y=v, z=slice_index)
top-left origin;  +x RIGHT,  +y DOWN
library memory order is NOT part of the contract
```

Also binding: **DR-012 ✅** — the MVP supports **validated axis-aligned geometry only**; unsupported
geometry is rejected with `GEOMETRY_NOT_VALIDATED`. The fixture set may therefore assume axis-aligned
volumes, and must **not** silently paper over an oblique case.

## Implementation boundary

**Allowed:**

```text
spikes/spike_b_3d/**                        throwaway spike app / harness - NOT production code
tests/fixtures/geometry/**                  canonical fixture set - THIS OWNER'S deliverable
management/spikes/SPIKE_B_3D/RESULT.md      (only when real evidence exists)
```

**Forbidden:**

- Any edit to `docs/specs/v1.0/`.
- **Selecting or freezing the mobile framework** — `GATE-MOB-01` needs Spike A **and** B.
- Writing `TECH_STACK_ADR.md`.
- Production repository modules.
- **Relaxing the ±1-slice bound.**

> **Integration-sensitive coordination (`15` §9).** `tests/fixtures/geometry/**` is consumed by Spike A and
> Spike F. Only one active owner at a time; this owner holds it. Publish the fixture format to
> Phạm Tuấn Anh before Spike A depends on it.

## Acceptance criteria

| # | Criterion | Bound |
|---:|---|---|
| B1 | Canonical mesh renders; rotate, zoom, pan all work | qualitative + no stalls |
| B2 | Active slice plane/marker computed from source geometry | matches fixture expectation |
| B3 | 3D selection/picking functions | works reliably, not intermittently |
| B4 | **Fixture picking: selected location resolves to the EXACT expected slice** | **exact — zero tolerance** |
| B5 | **Real decimated-mesh picking error** | **≤ ±1 source slice** |
| B6 | B4 and B5 hold **after camera rotate and zoom** | same bounds |
| B7 | 2D viewer navigates to the resolved slice | exact |
| B8 | Geometry correct after arbitrary camera manipulation | fixture re-check passes |
| B9 | Invalid/background selection produces no misleading navigation | zero false navigations |
| B10 | **≥20 FPS median** during the defined interaction test | **≥20 FPS median** |
| B11 | **No interaction stall >500 ms** attributable to normal rendering | **zero** |
| B12 | **Decimation frontier reported** — ≥3 levels, each with triangle count, median FPS, picking error | table required |
| B13 | **DR-008c recommendation:** the budget maximising frame rate **subject to picking error ≤ ±1 slice** | explicit recommendation |
| B14 | Interior vs surface-tangent picking points reported **separately** | both groups reported |
| B15 | Development-cost observation per candidate | qualitative, for `09` §7 |

**[NOTE on B14]** Surface-tangent points — where the picking ray is near-parallel to the slice plane — are
the hard case. Report them as their own group so a good interior-point result cannot mask a tangent-point
failure.

## Measurements required

| Measurement | Unit | Bound |
|---|---|---|
| Median frame rate during the interaction test | FPS | **≥ 20** |
| Longest interaction stall | ms | **≤ 500** |
| Fixture picking error | slices | **0 (exact)** |
| Real decimated-mesh picking error, interior points | slices | **≤ 1** |
| Real decimated-mesh picking error, surface-tangent points | slices | **≤ 1** |
| Triangle count per decimation level | count | report |
| Mesh generation time per level | ms/s | report |
| Device memory during 3D interaction | MB | report |

## Automated evidence required

- Fixture conformance test: known voxel↔world↔slice points, machine-comparable, re-runnable. **This is the
  same test `TC-MAINT-002` will later use across backend and mobile** — build it to be reusable.
- Picking-error harness producing a per-point error table for every decimation level.
- Frame-rate instrumentation producing a distribution, not a single number.

## Manual evidence required

- **On-device measurements for B10, B11 and the real-mesh picking error — executed by Vũ Hùng Anh.**
- Screen recording of picking after camera rotation.
- Completed device-profile block.
- Per-candidate development-cost note.

## Fail conditions

| Condition | Consequence |
|---|---|
| Picking unreliable | **Candidate not viable** — picking is the requirement, not rendering |
| B4 fails (fixture not exact) | Geometry implementation is wrong; fix before continuing |
| B5 fails (>±1 slice) at every decimation level meeting B10 | **`NEGATIVE_RESULT` → escalate.** Do **not** widen the tolerance. |
| B10/B11 fail at every level meeting B5 | **`NEGATIVE_RESULT` → escalate** |
| Q9 answered "no" for all candidates | **`NEGATIVE_RESULT` → escalate**; accuracy-vs-performance deadlock (`SPIKE_PHASE_PLAN.md` §9.2) |

> **The deadlock case is the one to watch.** `13` §12 classes wrong 2D/3D mapping as **P0/Critical**, so
> accuracy wins over frame rate. If both cannot be had, that is a real finding requiring a leader decision
> — not a number to soften.

## Expected deliverables

1. `management/spikes/SPIKE_B_3D/RESULT.md` — per-candidate pass/fail against B1–B15.
2. **Canonical geometry fixture set** under `tests/fixtures/geometry/` (reusable by Spike A, Spike F, and
   `TC-MAINT-002`).
3. Spike harness under `spikes/spike_b_3d/`.
4. **Decimation frontier table** and the **DR-008c budget recommendation**.
5. Completed device-profile block.

## Estimated effort

**[ESTIMATE]** The largest spike in the phase: fixture set + mesh pipeline + 3D harness + picking
instrumentation, then contended on-device measurement across ≥3 decimation levels × candidate frameworks.
See the device-contention conflict in `SPIKE_PHASE_PLAN.md` §4.3.

## Risk

`RISK-3D-GEOMETRY` (**HIGH, P0-class**) · `RISK-MOBILE-RENDER` (HIGH). This spike carries the project's
highest technical risk.

## Downstream unblocked

`GATE-MOB-01` (DR-G05, jointly with Spike A) · **DR-008c** · `TECH_STACK_ADR.md` evidence ·
`TC-3D-003`/`TC-3D-004` test basis · the mobile picking capability **Spike F depends on**

## What Claude may NOT fabricate

> **Claude must not invent, estimate-as-measured, or otherwise fabricate:** frame rates, stall durations,
> picking error, triangle-count-vs-FPS relationships, mesh generation times, on-device memory, thermal
> behaviour, or any device hardware value.
>
> **All on-device measurements are executed by Vũ Hùng Anh.**
>
> Claude **may**: build the harness and fixture generator, write the conformance and picking-error tests,
> write frame-rate instrumentation, prepare the result template, and analyse measurements the owner
> supplies.

**No `RESULT.md` exists in this directory.** Create it only when real on-device evidence exists.
