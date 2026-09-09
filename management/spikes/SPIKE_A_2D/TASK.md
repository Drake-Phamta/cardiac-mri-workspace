# SPIKE A — TASK

## Identity

| Field | Value |
|---|---|
| **Spike ID** | `SPIKE_A` |
| **Name** | 2D scientific viewer / brush interaction |
| **Priority** | P1 |
| **Primary Owner** | **Phạm Tuấn Anh** |
| **Secondary Reviewer** | **Vũ Hùng Anh** |
| **Status** | **PREPARED** — authorised and assigned; **execution not started**. On starting: set `ACTIVE` and record the real `started_at` (never backdate). |
| **Blocked by** | nothing (DR-006 ✅ resolved the device) |
| **Lead Claude chat** | CHAT D — Implementation (support: CHAT B for framework criteria, CHAT C for geometry fixture semantics) |
| **Device measurement slot** | **1 of 3** — the project has **exactly one** authorised Galaxy A17 5G; measurement windows must not overlap |
| **Review** | Reviewed by Vũ Hùng Anh, **priority 2** behind Spike D (P0). Serialized — one review in `REVIEWING` at a time |

## Source requirement IDs

FR-MRI-001 · FR-MRI-002 · FR-MRI-004 · FR-MRI-005 · FR-MRI-006 · FR-REV-002 · FR-REV-003 · FR-REV-004 ·
FR-REV-005 · FR-REV-006 · FR-REV-007 · FR-REV-011 · PR-MRI-01 · PR-REV-02 · NFR-PERF-001 · NFR-PERF-003 ·
NFR-USAB-001 · NFR-USAB-002 · `07` §8 invariants 2–3 · `07` §9 · `07` §12 Spike A · `10` §5
**Behaviour that will later be asserted by:** `TC-MRI-001` · `TC-MRI-002` · `TC-REV-002` · `TC-REV-003` ·
`TC-REV-004` · `TC-PERF-001` · `TC-PERF-003`
**Decisions:** DR-006 ✅ · DR-008a ✅ · DR-009 ✅ · DR-G05 (`GATE-MOB-01`)
**Findings:** RA-H05 (resolved by DR-006) · RA-H07 (resolved by DR-008a)

## Objective

Prove that a candidate mobile framework can deliver the **actual product primitive** — a scientific 2D MRI
viewer with **pixel-correct brush editing under zoom and pan** — on the declared physical device, at the
declared performance targets.

> **This is not a decorative viewer test.** A framework that renders slices beautifully but cannot map a
> touch back to the correct source-mask pixel after a transform has **failed**, regardless of development
> velocity.

## Hypotheses / questions to answer

| # | Question |
|---:|---|
| Q1 | Can the framework render a source MRI slice correctly, with a visible `n / total` index? |
| Q2 | Do pinch-zoom and pan modify **only** the display transform, leaving source-mask geometry untouched (`07` §8 invariant 2)? |
| Q3 | **After zoom and pan, does drawing at known screen coordinates change the expected source-mask pixel region?** (`07` §8 invariant 3 — the discriminating question) |
| Q4 | Do brush add and erase modify only the intended working-mask pixels? |
| Q5 | Does undo/redo reproduce edit history within the local editing session (DR-009 ✅ item 8)? |
| Q6 | Does a save/reload primitive reproduce the edits exactly? |
| Q7 | Does cached slice switching meet **NFR-PERF-001**: 200 ms p95 over a 30-step navigation test, with no full-volume network transfer per gesture? |
| Q8 | Does brush feedback meet **NFR-PERF-003**: visible stroke feedback within 100 ms, with no committed stroke samples lost? |
| Q9 | Can edit gestures and navigation gestures be separated without accidental edits (`10` §5, NFR-USAB-002)? |

## Inputs

- **Synthetic fixture data is permitted and preferred** — this spike does not need the real dataset and
  must not wait for Spike D.
- A fixture volume in the **DR-008a ✅ canonical convention** (see below), with a known slice whose pixel
  pattern makes coordinate errors visually obvious (e.g. a per-slice corner marker plus a known small
  rectangle).
- A brush-transform fixture: a list of `(screen point, zoom, pan) → expected source pixel` triples.

## Prerequisites

1. **DR-006 device profile captured** from the Galaxy A17 5G — a hard prerequisite for any measurement
   (see `EVIDENCE_TEMPLATE.md`).
2. Fixture set built against the canonical convention.

## Exact environment

| Field | Value |
|---|---|
| Device | **Samsung Galaxy A17 5G**, physical — **emulators are not acceptable** for Q7/Q8 |
| Device profile | **[UNVERIFIED — capture from the device]** all seven DR-006 fields |
| Candidate framework(s) | **[RECORD]** name + exact version per candidate |
| Build type | **[RECORD]** release-mode measurement required; debug builds distort timings |
| Test conditions | **[RECORD]** thermal state, battery/power mode, background load, brightness, throttling observed |

## Frozen constraint — canonical indexing (DR-008a ✅)

```text
voxel (x, y, z):  x = source image COLUMN,  y = source image ROW,  z = source SLICE INDEX
shape_xyz = [Nx, Ny, Nz]          slice_index = z, valid 0..Nz-1
a logical source slice has shape [Ny, Nx]
source pixel (u, v) -> voxel (x = u, y = v, z = slice_index)
origin: top-left source pixel is (0,0);  +x RIGHT,  +y DOWN
library memory order is NOT part of the contract - adapters conform at boundaries
```

**Use this convention. Do not invent a local variant for the spike** — the whole point of DR-008a is that
backend and mobile share one convention.

## DR-009 ✅ semantics this spike must respect

- **Interactive brush feedback never waits for the network** — this is what makes NFR-PERF-003 reachable.
- **Undo/redo is scoped to the current local editing session.**
- **Reset-to-source** restores the exact declared source mask.
- The spike exercises the **local working buffer**. The asynchronous server sync of a working draft is
  **out of scope here**; the save/reload check (Q6) may be local.

## Implementation boundary

**Allowed:**

```text
spikes/spike_a_2d/**            throwaway spike app / harness - NOT production code
management/spikes/SPIKE_A_2D/RESULT.md    (only when real evidence exists)
tests/fixtures/geometry/**      shared canonical fixtures (coordinate with Vũ Hùng Anh - Spike B uses these)
```

**Forbidden:**

- Any edit to `docs/specs/v1.0/`.
- **Selecting or freezing the mobile framework** — `GATE-MOB-01` needs Spike A **and** B evidence.
- Creating production repository modules (`mobile/`, `backend/`, …).
- Writing `TECH_STACK_ADR.md`.

> **Coordination note.** `tests/fixtures/geometry/**` is shared with Spike B. Per `15` §9 it is an
> **integration-sensitive area** — only one active owner at a time. Vũ Hùng Anh owns the geometry contract
> (DR-013 ✅), so **the fixture set is his deliverable**; Spike A consumes it. Agree this before either
> spike writes fixture files.

## Acceptance criteria

| # | Criterion | Bound |
|---:|---|---|
| A1 | A named source slice renders correctly, with visible `n / total` | exact match to fixture |
| A2 | Pinch-zoom and pan work, and provably do not alter source-mask geometry | checksum of source mask unchanged |
| A3 | Brush **ADD** modifies only the intended working-mask pixels | exact against fixture |
| A4 | Brush **ERASE** modifies only the intended working-mask pixels | exact against fixture |
| A5 | **Pixel-correct brush mapping after zoom and pan** — every brush-transform fixture triple resolves to its expected source pixel region | **stated tolerance required**; report exact hit rate |
| A6 | **Undo** reproduces prior state | exact |
| A7 | **Redo** reproduces the undone state | exact |
| A8 | Save/reload primitive reproduces edits | exact |
| A9 | **Cached slice-switching performance** — 30-step navigation test | **p95 ≤ 200 ms**; no full-volume transfer per gesture |
| A10 | **Brush feedback performance** | **visible feedback ≤ 100 ms**; zero committed stroke samples lost |
| A11 | Edit vs navigation gesture separation causes no accidental edits in a scripted pass | zero accidental edits |
| A12 | Development-cost observation recorded per candidate framework | qualitative, for `09` §7 |

**[NOTE on A5]** `TC-REV-003` will later assert this behaviour. The frozen spec sets **no** pixel tolerance
for brush mapping (unlike SCQ-06's ±1-slice rule for 3D picking). **This spike must therefore report the
observed error distribution and propose a tolerance**, which becomes an input to the geometry contract.
Do not silently assume "close enough".

## Measurements required

| Measurement | Unit | Bound |
|---|---|---|
| Slice-switch latency, 30 steps, cached | ms — report p50 **and p95** | p95 ≤ 200 |
| Brush first-visible-feedback latency | ms — p50 and worst case | ≤ 100 |
| Committed stroke samples lost | count | 0 |
| Brush-mapping error, per fixture triple | pixels (dx, dy) | report distribution |
| Frame behaviour during zoom/pan | subjective + any stall > 500 ms | record stalls |

## Automated evidence required

- Brush-transform conformance test: fixture triples in → resolved source pixels out, machine-comparable,
  re-runnable by the reviewer.
- Source-mask checksum before/after zoom/pan (proves A2).
- Undo/redo/save/reload state comparison.

## Manual evidence required

- **On-device measurements for A9, A10, A11 — executed by Phạm Tuấn Anh.**
- Screen recording or timestamped screenshots of the brush-after-zoom case.
- Completed device-profile block.
- Per-candidate development-cost note.

## Fail conditions

| Condition | Consequence |
|---|---|
| A5 fails — brush mapping wrong after transform | **Candidate framework is not viable.** `13` §12 rates wrong 2D/3D mapping **P0/Critical**. |
| A9 or A10 fails on the declared device | Candidate not viable at the frozen NFR targets |
| Committed stroke samples lost | Candidate not viable (NFR-PERF-003 explicitly forbids it) |
| No candidate passes | `NEGATIVE_RESULT` → escalate. Do **not** weaken NFR-PERF-001/003 to obtain a pass. |

## Expected deliverables

1. `management/spikes/SPIKE_A_2D/RESULT.md` — per-candidate pass/fail against A1–A12, with measurements.
2. Spike harness under `spikes/spike_a_2d/`.
3. Brush-transform conformance test + fixture triples.
4. Completed device-profile block.
5. A proposed brush-mapping pixel tolerance, with its evidence.

## Estimated effort

**[ESTIMATE]** Harness + fixtures: off-device work, parallelisable. On-device measurement: short but
**contended** — see the device-contention conflict in `SPIKE_PHASE_PLAN.md` §4.3. If more than one
candidate framework is evaluated, effort scales roughly linearly.

## Risk

`RISK-MOBILE-RENDER` (HIGH) · `RISK-3D-GEOMETRY` (HIGH, shared with Spike B). Also `RISK-CAP-01` — this
owner simultaneously carries Team Leader duties, Integration/CI ownership and two review assignments.

## Downstream unblocked

`GATE-MOB-01` (DR-G05, **jointly with Spike B**) · `TECH_STACK_ADR.md` evidence · sizing for PR-MRI-01 and
PR-REV-02 · a proposed brush-mapping tolerance for the geometry contract

## What Claude may NOT fabricate

> **Claude must not invent, estimate-as-measured, or otherwise fabricate:** slice-switch latency, brush
> feedback latency, frame rates, stroke-loss counts, on-device memory, thermal behaviour, touch accuracy,
> gesture-conflict outcomes, or any device hardware value.
>
> **All on-device measurements are executed by Phạm Tuấn Anh.**
>
> Claude **may**: build the harness, generate fixture data, write the conformance tests and measurement
> instrumentation, prepare the result template, and analyse measurements the owner supplies.

**No `RESULT.md` exists in this directory.** Create it only when real on-device evidence exists.
