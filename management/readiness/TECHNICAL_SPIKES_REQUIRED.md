# TECHNICAL SPIKES REQUIRED

**Companion to:** `IMPLEMENTATION_READINESS_AUDIT.md`
**Purpose:** enumerate every spike needed before architecture freeze, training, or the 30-day baseline
**Status:** proposed — awaiting leader authorisation

---

> **Reviewed and accepted with corrections by the specification owner, 2026-09-08.**
> Corrections have been applied to this file. For the authoritative post-review state — decision
> statuses, the nine answered clarifications, and condition status C1–C8 — see
> **`READINESS_REVIEW_RESOLUTION.md`**, which governs where it differs from this file.

## 0. Summary

| Spike | Subject | Source | Priority | Gate / ADR unblocked | Executable by |
|---|---|---|---:|---|---|
| **A** | 2D scientific viewer/editor | `00` §11, `07` §12 — **specified** | P1 | GATE-MOB-01 / `ADR-MOB-001` | Human, on device |
| **B** | 3D linked interaction | `00` §11, `07` §12 — **specified** | P1 | GATE-MOB-01 / `ADR-MOB-001`, DR-008b/c | Human, on device |
| **C0** | ML compute feasibility — *preliminary, synthetic data* | **not in spec** — required by GATE-ML-01 (RA-H06) | P1 | preliminary evidence for `ADR-ML-001`; **cannot close GATE-ML-01** | Human + Claude |
| **C1** | ML compute feasibility — *final, real validated subset* | **not in spec** — required by GATE-ML-01 (RA-H06) | P1 | **GATE-ML-01 / `ADR-ML-001` — closes only after C1** | Human + Claude |
| **D** | Dataset acquisition, validation, provenance | **not framed as a spike** — required by GATE-DATA-01 (RA-H01, RA-H02) | **P0** | GATE-DATA-01, GATE-SPLIT-01, DR-012 | Human + Claude |
| **E** | Artifact transport | **not in spec** — required by `ADR-ART-001` (RA-H13) | P2 | `ADR-ART-001` | Human, on device |
| **F** | 3D error representation | **not in spec** — required by FR-3D-007/008 (RA-B01) | P1 | DR-005, PR-ERR-03, PR-3D-05 | Human + Claude |

Spikes A, B, C0, C1, D, E and F are **parallelisable after their prerequisite decisions are
resolved** — they are not unconditionally independent. Prerequisites are listed per spike below and
collected in the dependency graph at the end of this document (see RA-M03).

### 0.0 Prerequisite decisions — status

| Prerequisite | Status | Effect |
|---|---|---|
| **DR-006** — target demo device | **✅ APPROVED: Samsung Galaxy A17 5G** | Spikes **A**, **B**, **E** unblocked |
| **DR-008a** — canonical indexing convention | **✅ APPROVED** (frozen; see `OPEN_DECISIONS.md` DR-008) | Spikes **B**, **F** unblocked |
| **Spike D** — validated package | **not executed** | Spike **C1** still blocked |

**All spikes except Spike C1 now have their prerequisites resolved and may start.** Spike C1 waits on
Spike D (readiness condition C1). **No spike has been executed.**

### 0.0.2 Named spike owners (DR-013 ✅)

Ownership follows the approved technical-block matrix. **Per SCQ-09, Claude prepares harnesses,
instrumentation and analysis; the named human owner executes physical-device and hardware measurements and
supplies the evidence.**

| Spike | Primary Owner | Secondary Reviewer | Basis |
|---|---|---|---|
| **A** — 2D viewer/editor | **Phạm Tuấn Anh** | Vũ Hùng Anh | V1 ownership |
| **B** — 3D linked interaction | **Vũ Hùng Anh** | Phạm Tuấn Anh | V2 + Imaging/Geometry ownership |
| **C0 / C1** — ML compute feasibility | **Bế Quốc Khánh** | Vũ Hùng Anh | ML Training/Evaluation ownership |
| **D** — dataset acquisition & validation | **Bế Quốc Khánh** | Nguyễn Gia Đức Trung | ML ownership; Backend owns ingestion of the validated package |
| **E** — artifact transport | **Nguyễn Gia Đức Trung** | Phạm Tuấn Anh | Backend/persistence ownership; integration reviews the network path |
| **F** — 3D error representation | **Vũ Hùng Anh** | Phạm Tuấn Anh | Imaging/Geometry ownership |

**[RECOMMENDATION]** These follow mechanically from the DR-013 matrix; the leader may reassign, but note the
anti-bottleneck rule — Spikes C0/C1 and D belong with Bế Quốc Khánh and Spike E with Nguyễn Gia Đức Trung,
not with the two stronger members.

### 0.0.3 Deployment topology affecting the spikes (DR-003 ✅)

Profile: **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR ACCESS.** The backend Mac mini M2 (24 GB RAM) is
**physically remote**; the phone reaches it over **4G/5G cellular → authenticated private overlay
(Tailscale)**. **Venue Wi-Fi is not trusted and not required.** Training need not run on the Mac mini.

**This materially changes Spike E** — see its section. It also means any spike measuring client–server
latency must use the real cellular + overlay path, not a LAN proxy.

### 0.0.1 Declared target demo device (DR-006 ✅)

**Samsung Galaxy A17 5G**, a physical device — not an emulator, because `NFR-PERF-002`'s FPS target and
`NFR-PERF-003`'s touch-latency target are not meaningfully measurable on one.

**Before any Spike A/B measurement**, capture the profile **from the device itself**. **[UNVERIFIED — to be
recorded]**: model identifier; Android version and build number; RAM and device performance profile; CPU
information available from tooling; GPU information available from tooling; screen resolution and refresh
rate; and the exact test configuration (build type, thermal state, battery/power mode, background load,
screen brightness, any throttling observed).

**Do not infer unverified hardware details.** This document deliberately states no RAM, chipset, GPU,
resolution or refresh-rate values for this model. Record the captured profile under `management/spikes/`
and have `TECH_STACK_ADR.md` **restate** it, per `10` §9.1 — this is what closes the RA-H05 circularity.

---

## 0.1 Who runs the spikes

**[SPEC]** `00` §11 states "Claude must run two technical spikes". **[SPEC]** `17` §5 Step 2 assigns
Spike A/B to "Technical Architect + Implementation". **[FINDING RA-L06]** These are in tension, and the
practical constraint settles it:

- **Claude cannot** install and run a mobile build on a physical handset, measure on-device frame rate
  or touch latency, or perform manual touch-accuracy testing. Spikes **A, B, E** and the interactive
  half of **F** therefore require a **named human owner on the declared target device**.
- **Claude can** build spike harnesses, generate fixtures, write measurement instrumentation, run
  headless numerical work (Spikes C0, C1, D, and the pipeline half of F), and analyse and write up results.

**[RECOMMENDATION]** Assign each spike a named human owner. Claude produces the harness and the
analysis; the owner produces the on-device evidence.

---

## 0.2 Common acceptance rule

**[SPEC]** `13` §6 DoD and `15` §12 apply to spikes as to any work: a spike is complete when its
evidence artifact exists in the repository, not when someone reports it worked. Every spike below must
produce a written result file under `management/spikes/` recording method, environment, measurements,
and an explicit pass/fail against its acceptance criteria — **including a negative result**, which is a
valid and useful spike outcome.

---

## Spike A — 2D scientific viewer / editor

**Source:** `00` §11 and `07` §12 — **specified in the frozen spec**. Restated here for completeness.

| Field | Content |
|---|---|
| **Priority** | P1 |
| **Unblocks** | GATE-MOB-01 / `ADR-MOB-001`; PR-MRI-01, PR-REV-02 estimation |
| **Owner** | Human, on the declared target device |
| **Blocked by** | **nothing — DR-006 ✅ resolved** (Samsung Galaxy A17 5G). Capture the §0.0.1 device profile before measuring. |

**Objective.** **[SPEC]** `07` §12: prove correct slice render; zoom/pan; brush add/erase; coordinate
accuracy after transforms; undo/redo; save/reload.

**Inputs.** One validated case (or a synthetic fixture volume if Spike D has not completed — the spike
does not require real data); the geometry fixture from DR-008a; the declared device.

**Acceptance evidence.**

1. A named source slice renders correctly with a visible `n / total` index.
2. Pinch-zoom and pan operate without altering source mask geometry (`07` §8 invariant 2).
3. Brush add and erase modify the intended source-mask pixels.
4. **Coordinate accuracy after transforms:** drawing at known screen coordinates after zoom and pan
   changes the expected source-mask pixel region (`07` §8 invariant 3; the behaviour `TC-REV-003` will
   later assert).
5. Undo and redo reproduce edit history.
6. A saved correction reloads identically.
7. **[SPEC]** `07` §12: exercises `NFR-PERF-001` (200 ms p95 cached slice switching over a 30-step
   navigation test) and `NFR-PERF-003` (100 ms stroke feedback, no lost committed stroke samples).

**Fail condition.** Any candidate framework that cannot demonstrate item 4 or item 7 is not viable,
regardless of development velocity.

**Note — DR-009 ✅ now approved.** Spike A tests the interaction primitive, and the approved DR-009
semantics tell it what to prove: **interactive brush feedback never waits for the network**, and undo/redo
is scoped to the **current local editing session**. The spike's save/reload check (item 6) exercises the
local working buffer; the asynchronous server sync of the working draft is **not** required for the spike.

---

## Spike B — 3D linked interaction

**Source:** `00` §11 and `07` §12 — **specified in the frozen spec**. Extended below to close RA-H11 and
RA-H14.

| Field | Content |
|---|---|
| **Priority** | P1 |
| **Unblocks** | GATE-MOB-01 / `ADR-MOB-001`; **DR-008b** (tolerance), **DR-008c** (mesh budget) |
| **Owner** | Human, on the declared target device |
| **Blocked by** | **nothing — DR-006 ✅ and DR-008a ✅ both resolved.** Fixtures must use the frozen canonical `(x, y, z)` convention. |

**Objective.** **[SPEC]** `07` §12: render the canonical LA mesh; rotate/zoom/pan; show the active slice
plane/position; select a mesh point/region; resolve to the expected slice index; synchronise the 2D
viewer.

**Inputs.** A reconstruction from a validated or synthetic mask volume; the `09` §6 canonical geometry
fixture with known voxel↔world↔slice points; the declared device.

**Acceptance evidence.**

1. Mesh renders and supports rotate, zoom, pan.
2. The active 2D slice is represented by a visible plane or marker computed **from source geometry**,
   not a visual approximation (`07` §8 invariant 5).
3. Selecting a mesh point resolves to a slice index, **including after camera rotation and zoom**.
4. The 2D viewer navigates to the resolved slice.
5. Invalid or background selections produce no misleading navigation (`10` §6).
6. **[SPEC]** `07` §12: exercises `NFR-PERF-002` (≥20 FPS median, no stall >500 ms).

**Extended deliverables — required to close RA-H11 and RA-H14.**

> **The accuracy constraint is FROZEN before this spike (SCQ-06 / DR-008b).** Spike B **validates
> conformance**; it does **not** derive or negotiate the tolerance:
>
> | Context | Tolerance |
> |---|---|
> | Canonical geometry fixtures | **exact** slice mapping — zero tolerance |
> | Decimated real-mesh picking | **at most ±1 source slice** |
>
> It **must not be silently relaxed.** Widening it requires a Decision Request under `00` §13.

7. **Fixture conformance (exact).** For every canonical fixture test point, slice resolution must be
   **exact**. Report any deviation as a failure, not as a tolerance to widen. Separate *interior* points
   from *surface-tangent* points where the picking ray is near-parallel to the slice plane, and report
   each group's result.
8. **Mesh / decimation budget within the frozen constraint (DR-008c — OPEN).** Report triangle count
   versus median frame rate versus real-mesh slice-resolution error across at least three decimation
   levels, and **recommend the budget that maximises frame rate subject to real-mesh picking error ≤ ±1
   source slice**. **A decimation level that exceeds ±1 slice is not acceptable regardless of its frame
   rate.** **[ASSUMPTION]** A native-resolution isosurface from a binary LA mask will not meet
   NFR-PERF-002 on a handset, so decimation is on the critical path rather than an optimisation. If **no**
   decimation level satisfies both NFR-PERF-002 and the ±1-slice ceiling, that is a valid negative result
   and must be escalated rather than resolved by relaxing the ceiling.

**Fail condition.** A framework that renders acceptably but cannot perform reliable picking fails —
picking, not rendering, is what FR-3D-005/006 require.

---

## Spike C — ML compute / DINOv2 feasibility (two stages: **C0** then **C1**)

**Source:** **not defined in the specification.** Required because `07` §2 obliges `ADR-ML-001` to record
"compute/memory feasibility evidence" and **[VERIFIED]** no procedure anywhere produces it (RA-H06).

**Approved** by the specification owner's readiness review (DR-007), and **split into two stages** by the
same review so that hardware feasibility can be probed immediately without waiting for the dataset, while
the gate-closing evidence still rests on real validated data.

> **Naming note.** The two stages are always written **"Spike C0"** and **"Spike C1"**. They are *not* the
> readiness conditions `C1`–`C8` in `IMPLEMENTATION_READINESS_STATUS.md` §6. A bare `C1` in these
> artifacts always means readiness condition C1 (Spike D / GATE-DATA-01); the spike stage is always
> written with the word "Spike".

---

### Spike C0 — preliminary feasibility on synthetic data

| Field | Content |
|---|---|
| **Priority** | P1 |
| **Unblocks** | preliminary evidence toward `ADR-ML-001`; early sizing input for the 30-day baseline |
| **Closes GATE-ML-01?** | **No.** C0 evidence alone may not close GATE-ML-01. |
| **Owner** | ML owner + Claude |
| **Blocked by** | **nothing** — runs on synthetic volumes, before Spike D completes |

**Objective.** Establish hardware/memory/basic-throughput feasibility on the **actual available
hardware**, using synthetic data of representative shape and dtype.

**Inputs.** Available compute (specify GPU/VRAM, or state that only CPU/Colab-class resources exist);
synthetic volumes matching the expected shape and dtype.

**Acceptance evidence.**

1. **Peak memory** for a DINOv2-based configuration and for the UNet baseline at the intended input size
   and batch size; if the intended batch size does not fit, report the largest that does.
2. **Basic throughput** — steps or slices per second for each family, with the measurement method stated.
3. **Effective output resolution.** **[ASSUMPTION]** A ViT backbone produces dense features at a fraction
   of input resolution, so report the decoder's effective output stride. On synthetic data this is a
   property of the architecture and is measurable without real anatomy.
4. **Preliminary calendar arithmetic** — an extrapolated per-run wall-clock and a first statement of
   whether 6 runs + 1 ablation plausibly fit, with the extrapolation method shown and explicitly
   labelled **preliminary**.
5. Candidate DINOv2 variant, checkpoint source, and decoder options with their measured costs.

**Explicit limitation.** Synthetic data cannot establish convergence behaviour, achievable segmentation
quality, or the interaction between output stride and the real LA cavity boundary thickness. C0 is a
hardware-and-throughput probe only.

---

### Spike C1 — final feasibility on a small representative validated real subset

| Field | Content |
|---|---|
| **Priority** | P1 |
| **Unblocks** | **GATE-ML-01 / `ADR-ML-001` — the gate may close only after Spike C1** |
| **Owner** | ML owner + Claude |
| **Blocked by** | **Spike D** (readiness condition C1 — validated package + `DATASET_AUDIT.md` ACCEPTED) |

**Objective.** Confirm feasibility on a **small representative subset of the validated real dataset**,
and produce the evidence that GATE-ML-01 requires.

**Inputs.** A small representative subset drawn from the **validated** package after Spike D. The subset
must be drawn from the **training partition only** once DR-002/GATE-SPLIT-01 resolves, so that Spike C1
never touches validation or holdout data (`06` §6 split invariants, `07` §10).

**Acceptance evidence.**

1. **Per-run wall-clock** measured on real data for one DINOv2-based run and one UNet run, extrapolated
   to the full training set, with the extrapolation method stated. Supersedes C0's preliminary figure.
2. **Peak memory on real volumes** at the intended batch size, confirming or correcting C0.
3. **Effective output resolution against the observed LA cavity boundary thickness in voxels** — the
   check C0 cannot perform. This is the single most likely reason a DINOv2 segmentation underperforms on
   this task, and it is better discovered now than after GATE-ML-01.
4. **Convergence sanity** — evidence that both families train stably on real data under the candidate
   recipe (loss decreasing, no divergence), sufficient to justify freezing one recipe.
5. **Normalization conformance** — confirmation that the configuration uses the **DR-011-approved**
   policy: no cohort-fitted statistics, documented per-image/per-volume normalization plus fixed
   pretrained-model constants where required, applied identically across families and fractions.
6. **Final calendar verdict:** an explicit statement of whether 6 runs + 1 ablation fit, with the
   arithmetic shown. A "no" is a valid and valuable result.

**Why the gate waits for C1.** **[SPEC]** `08` §2 requires the recipe be identical across
`EXP-D-025/050/100`. A recipe frozen on synthetic-data evidence could prove unusable on real volumes,
and discovering that after GATE-ML-01 invalidates completed runs. **GATE-ML-01 (DR-G03) may close only
after Spike C1.**

**Fallback if the verdict is "no".** **[RECOMMENDATION]** Reduce input resolution or model size **before**
freezing the recipe, not mid-matrix; record the change as part of GATE-ML-01. `00` §9 and `03` PR-SCI-03
already permit a smaller-but-honest experiment — what they forbid is changing the protocol after seeing
results.

---

## Spike D — Dataset acquisition, validation, and provenance audit

**Source:** **not framed as a spike in the specification**, but `06` §3 and §9.1 define its contents
exhaustively. Elevated to a spike here because it is the longest-lead item and gates the most work
(RA-H01, RA-H02).

| Field | Content |
|---|---|
| **Priority** | **P0 — start immediately; no prerequisite decisions** |
| **Unblocks** | GATE-DATA-01, GATE-SPLIT-01, DR-002, DR-012; all training; precomputed-artifact sizing |
| **Owner** | ML/Imaging owner + Claude |
| **Blocked by** | nothing |

**Objective.** Obtain the official package and produce the acceptance artifacts `06` §9.1 requires:
`management/DATASET_AUDIT.md` and `data/manifests/dataset_manifest.*`.

**[VERIFIED]** Current state: package **not yet downloaded**. **No access failure has been observed**;
the official source exposes a public download link. This spike makes no assumption about access
difficulty in either direction.

**Acceptance evidence — the full `06` §3 list.**

1. Download date, source URL, package/file names, checksums where practical.
2. Extracted case count; per-case presence of required files (`lgemri.nrrd`, `laendo.nrrd`).
3. File format and dtype; NRRD loads successfully; MRI is 3D; mask is 3D.
4. **Volume shape distribution across the cohort** — explicitly including whether in-plane dimensions
   vary between cases (RA-M14b), since this drives the `07` §3 resize policy, the viewer's layout
   assumptions, and fixture construction.
5. Spacing, orientation, origin from headers; MRI/mask shape and spacing compatibility; whether masks
   are already spatially aligned; whether any resampling is required (`06` §4).
6. **Mask unique-value check and the exact foreground/background mapping — recorded, not assumed**
   (`06` §9).
7. **Explicit verification that `laendo.nrrd` is the LA cavity target for this package** (`06` §3).
8. **Whether official test labels are present, and their provenance** — the deliverable that resolves
   **RA-H02 / DR-002**. **[UNRESOLVED]** The official source is internally inconsistent here; this spike
   is the only way to settle it. Record file-level evidence: which files exist per test-partition case,
   their value distributions, and whether they are plausibly LA cavity annotations.
9. **Direction matrix check** — is every volume axis-aligned? Confirms or refutes the axis-aligned
   support boundary proposed in **DR-012** (RA-M02).
10. Corruption or read errors; case-ID uniqueness; any exclusions.
11. Presence of unexpected direct identifiers in headers or sidecar metadata, per the `04` NFR-SEC-005
    and `12` §2 metadata allowlist.

**Explicit non-goal.** This spike does **not** select the split. It produces the evidence; DR-002
(GATE-SPLIT-01) selects the path.

**Escalation trigger — DR-001 ✅ APPROVED.** The trigger is now a decision, not a recommendation:

> **If, by the end of the first execution day of Spike D**, the team does **not** have a usable official
> package **locally**, **or** package/provenance validation reveals a **blocking defect** preventing
> GATE-DATA-01 acceptance — then **RA-H01 escalates to BLOCKER** and the **dataset contingency process
> opens**.

**Do not silently substitute a dataset.** Substitution is a protocol change requiring the full `00` §13
sequence: Decision Request → impact analysis → leader/spec-owner approval → specification update.

Because the trigger fires at the **end of the first execution day**, Spike D's day-one scope must be
explicitly ordered so acquisition and a first-pass provenance read happen before deeper validation —
otherwise the trigger cannot be evaluated on time.

---

## Spike E — Artifact transport

**Source:** **not defined in the specification.** Required because `09` §4 defers artifact strategy to
`ADR-ART-001` and **[VERIFIED]** no requirement provides a criterion to justify that ADR against
(RA-H13).

| Field | Content |
|---|---|
| **Priority** | P2 |
| **Unblocks** | `ADR-ART-001`; the missing first-load NFR |
| **Owner** | Human, on the declared target device + backend owner |
| **Blocked by** | **nothing — DR-006 ✅ resolved** (Samsung Galaxy A17 5G) |

**Objective.** Measure candidate strategies for getting slices and meshes to the device, and produce the
first-load/transport budget that `04` currently lacks.

**Context.** **[SPEC]** `04` NFR-PERF-001 bounds only *already-cached* slice switching (200 ms p95) and
prohibits per-gesture full-volume transfer. NFR-PERF-004 bounds only asynchronous *request creation*
(2 s). **[VERIFIED]** Nothing bounds first load of a case, an uncached slice fetch, or mesh delivery.

**Inputs.** One validated or synthetic volume at realistic dimensions and dtype; the declared device
(Samsung Galaxy A17 5G); **the real demo network path — 4G/5G cellular → authenticated private overlay →
remote Mac mini M2** (DR-003 ✅), **not** a LAN proxy; a backend stub on the Mac mini.

> **Topology note (DR-003 ✅).** The backend is **physically remote** and reached over cellular plus a
> private overlay. Measurements taken on a local network would understate latency, jitter and variability
> and would invalidate the resulting budget. Venue Wi-Fi is **not** part of the trusted boundary and must
> not be used as the measurement path.

**Acceptance evidence.**

1. Time-to-first-usable-slice when opening a case cold, for each candidate strategy.
2. Uncached slice fetch latency, and whether a prefetch window keeps NFR-PERF-001 satisfiable during
   continuous navigation.
3. Mesh delivery time at the decimation levels Spike B identifies.
4. Encoding comparison — **[ASSUMPTION]** candidate options include per-slice image encoding,
   packed-binary mask transfer, and whole-volume download with client-side slicing; the trade-off is
   between first-load cost and per-gesture cost.
5. Device memory footprint under each strategy.
6. **A proposed first-load budget** with a measurable target, suitable to become an NFR and an
   acceptance test through the `00` §13 process — stated for the **cellular + overlay** path.
7. **Path variability.** Report latency spread, not just a median: a demo venue is a contended-cellular
   environment, so the budget must hold under realistic degradation, and any overlay relay fallback should
   be identified as a distinct case.
8. **Input to the demo connectivity fallback (DR-003 ✅).** DR-003 requires the plan to preserve a
   **minimal** connectivity-failure fallback for the canonical hero demo — preloaded canonical artifacts,
   cached case data, or cached/precomputed results sufficient for the critical flow. Spike E must report
   **what minimum artifact set** would have to be preloaded, and its size on device.
   **Scope firewall:** this informs a demo-resilience measure only. It must **not** become a full offline
   mode, a second architecture, or backend-on-phone. `PR-CACHE-01` stays a SHOULD.

**Linked risk.** `RISK-DEMO-NET-01` — the canonical demo now depends on cellular + overlay connectivity.

**Why it matters for the demo.** The very first action in the `16` §2 hero narrative is opening a case.
It currently has no performance requirement at all — and under DR-003 that first load now crosses a
cellular link and a private overlay to a remote host.

---

## Spike F — 3D error representation and region → slice resolution

**Source:** **not defined in the specification.** Required because FR-3D-007/008 mandate behaviour that
`07` §7 does not specify — the audit's only BLOCKER (RA-B01).

| Field | Content |
|---|---|
| **Priority** | P1 |
| **Unblocks** | **DR-005**; PR-ERR-03, PR-3D-05, FR-3D-007, FR-3D-008, TC-3D-005 |
| **Owner** | Imaging owner + Claude (pipeline); human on device (picking) |
| **Blocked by** | **nothing — DR-008a ✅ resolved** (frozen canonical `(x, y, z)` convention); benefits from Spike D but can start on synthetic masks |

**Objective.** Determine empirically which 3D error representation supports FR-3D-008's
region-to-contributing-slices navigation at acceptable mesh cost, so DR-005 is decided on evidence
rather than from first principles.

**Inputs.** A prediction/ground-truth mask pair — real if available, otherwise synthetic with known
TP/FP/FN structure (the `13` §11 fixture set already requires "a small binary mask pair with known
TP/FP/FN/Dice/IoU"); the geometry fixture.

**Candidates to compare.**

1. **Three separate meshes** (TP / FP / FN) with independent visibility.
2. **One LA surface with per-vertex error classification.**
3. **Surface mesh plus addressable FP/FN connected-component markers**, each carrying a precomputed
   slice range.

**Acceptance evidence.**

1. For each candidate: triangle count, generation time, and visual legibility against `10` §7's
   requirement that error categories remain unambiguous.
2. **[ASSUMPTION to be tested]** whether FN regions — thin shells between prediction and reference
   boundaries — produce fragmented or near-degenerate geometry under isosurface extraction, and whether
   that makes them unpickable.
3. For each candidate: can a user **select a region** and can that selection **resolve to contributing
   slices** deterministically? This is FR-3D-008 and is the discriminating criterion.
4. Frame-rate impact on the declared device, combined with Spike B's mesh budget.
5. A recommendation with evidence, feeding DR-005.

**Valid negative outcome.** If no candidate supports FR-3D-008 within the window, that is a legitimate
result and triggers DR-005 option 4 — a formal MUST scope change under `00` §13, with the leader
deciding. **[SPEC]** `03` §4 lists "3D is decorative only and cannot link back to MRI slices" as an MVP
rejection condition, so this is a decision the leader must make explicitly, not one to be absorbed
silently.

---

## Spike dependency graph

```
DR-006 ✅ APPROVED (Samsung Galaxy A17 5G)
   ├──> Spike A ──┐   [UNBLOCKED]
   ├──> Spike B ──┼──> GATE-MOB-01 / ADR-MOB-001
   └──> Spike E ──┴──> ADR-ART-001

DR-008a ✅ APPROVED (canonical (x,y,z); z = slice index)   → closes condition C5
   ├──> Spike B (validate exact fixtures + find mesh budget within ±1 slice) ──> DR-008c [OPEN]
   │        └── DR-008b tolerance = FROZEN by SCQ-06 (validated, not derived)
   └──> Spike F ──> DR-005 [OPEN] ──> PR-ERR-03 / PR-3D-05

Spike D  (P0, no blockers)
   ├──> GATE-DATA-01
   ├──> DR-002 / GATE-SPLIT-01   [resolves RA-H02 label provenance]
   ├──> DR-012 (geometry boundary)
   └──> real data for Spikes C and F

Spike C0 (preliminary, synthetic — no prerequisites)
   └──> preliminary ADR-ML-001 evidence  [CANNOT close GATE-ML-01]
           │
 Spike D ──┘
   └──> Spike C1 (final, real validated subset)
           └──> GATE-ML-01 / ADR-ML-001  [with DR-011 normalization policy — APPROVED]
```

The spikes are **parallelisable after their prerequisite decisions are resolved** — they are not
unconditionally independent. **DR-006 and DR-008a are now both APPROVED**, so Spikes A, B, E and F are
unblocked, and Spikes C0 and D never had prerequisites. **Spike C1 remains the one spike gated on another
spike** (Spike D). This is the point of RA-M03: contract front-load constrains *cross-interface
implementation*, not spike work.

**Six of seven spike stages are unblocked. None has been executed.**

---

**Related documents:** `IMPLEMENTATION_READINESS_AUDIT.md` · `OPEN_DECISIONS.md` ·
`RISK_REGISTER_INITIAL.md` · `SPEC_CLARIFICATION_REQUESTS.md` · `IMPLEMENTATION_READINESS_STATUS.md`
