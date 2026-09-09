# IMPLEMENTATION READINESS AUDIT — Frozen Specification v1.0

**Auditor role:** Project Control (independent, second-pass)
**Audit date:** 2026-09-08
**Subject:** `docs/specs/v1.0/` — files `00`–`17`, `SPEC_AUDIT_REPORT_v1_0.md`, `SPEC_MANIFEST_SHA256.txt`
**Mandate:** `17_LEADER_CLAUDE_ORCHESTRATION_PROTOCOL.md` §5 Step 1
**Result:** see `IMPLEMENTATION_READINESS_STATUS.md`

---

> **Reviewed and accepted with corrections by the specification owner, 2026-09-08.**
> Corrections have been applied to this file. For the authoritative post-review state — decision
> statuses, the nine answered clarifications, and condition status C1–C8 — see
> **`READINESS_REVIEW_RESOLUTION.md`**, which governs where it differs from this file.

## 0. Scope and authority of this document

This audit was performed independently. The prior `SPEC_AUDIT_REPORT_v1_0.md` was **not** assumed
correct, and its structural counts were re-derived mechanically (§1). This document:

- does **not** modify, rewrite, normalize, or reinterpret any file under `docs/specs/v1.0/`;
- does **not** begin implementation, select a technology stack, or create a 30-day plan;
- does **not** silently resolve any ambiguity — every ambiguity becomes an entry in
  `OPEN_DECISIONS.md` or `SPEC_CLARIFICATION_REQUESTS.md`.

Per `00` §13 and `17` §11, findings are raised as Decision Requests, not as spec edits.

### Claim-type labelling

Every substantive claim below is one of:

| Label | Meaning |
|---|---|
| **[SPEC]** | Specification truth — quoted or cited with file and section |
| **[ASSUMPTION]** | Engineering assumption made by this auditor, stated as such |
| **[UNRESOLVED]** | A decision nobody has made yet |
| **[RECOMMENDATION]** | Advisory only; non-binding under `17` §15 |

### Severity model

| Severity | Meaning |
|---|---|
| **BLOCKER** | Cannot be planned around. Scoped to the specific feature it blocks. |
| **HIGH** | Must resolve before architecture freeze / API freeze / parallel work. Remediation and spike planning may proceed now. |
| **MEDIUM** | Resolve during execution with a named owner. |
| **LOW** | Housekeeping; no material execution impact. |

Conditional findings carry their triggering condition explicitly (e.g. *only if `REMOTE_DEMO`*).

---

## 1. Mechanical verification of the frozen specification set

All checks below are reproducible read-only commands run against `docs/specs/v1.0/`.

| Check | Method | Result |
|---|---|---|
| Spec integrity | `sha256sum -c SPEC_MANIFEST_SHA256.txt` | **19/19 OK** — set intact, unmodified |
| Product requirements defined in `03` | ID extraction, deduplicated | **39** (28 MUST / 6 SHOULD / 5 COULD) |
| Prior report's claim (`SPEC_AUDIT_REPORT_v1_0.md` §2) | — | **44** (33 MUST / 6 SHOULD / 5 COULD) |
| FR/NFR defined in `04` | ID extraction | **79** |
| FR/NFR in `13` §10 coverage map | ID extraction | **79** |
| FR/NFR coverage gaps | set difference, both directions | **zero** ✅ |
| Product requirements in `13` §4 trace map | ID extraction | **39 / 39** ✅ |
| Use cases defined in `02` | header extraction | **17** (UC-01..17), all references resolve ✅ |
| Screens defined in `10` | header extraction | **9** (SCR-01..09), all references resolve ✅ |
| Acceptance tests in `13` | header extraction vs all mentions | **69** defined, 69 referenced, **no dangling references** ✅ |
| Tests mapped to no requirement | set difference against §4 + §10 tables | **TC-EXP-009** — orphan |
| `01` §8 MUST items with no PR ID in `03` | manual cross-map of all 22 items | **exactly one** (see RA-H03) |

### 1.1 Authoritative counts

**[SPEC-DERIVED]** The following mechanically verified counts are **authoritative** for all readiness,
planning, and traceability artifacts, superseding the prior report:

```
Product requirements : 39   (MUST 28 / SHOULD 6 / COULD 5)
FR + NFR             : 79   (MUST 75 / SHOULD 4 — the FR-AN-* live-analysis family)
Use cases            : 17
Screens              : 9
Acceptance tests     : 69
```

### 1.2 What the prior audit got wrong

`SPEC_AUDIT_REPORT_v1_0.md` §2 reports **44** product requirements (33 MUST). The actual count is
**39** (28 MUST) — an overstatement of exactly 5 MUST requirements. The same section reports **70**
acceptance-test IDs while §AUD-03 of the same document reports **69**; the actual count is **69**.

Critically: **the frozen specification files themselves are correct.** `13` §4 maps all 39 product
requirements and `13` §10 covers all 79 FR/NFR with zero gaps in either direction. Only the *report's*
summary counts are wrong. The finding is therefore LOW severity as a defect (RA-L01) but material as a
process signal — the report's "automated consistency check" is not reproducible, which is precisely why
this second independent audit was mandated.

### 1.3 What is genuinely strong

**[SPEC]** Stated plainly so it is not weakened under schedule pressure:

- **Traceability spine.** 79/79 FR/NFR covered, 39/39 PR mapped, no undefined PR/UC/SCR/TC IDs. This is
  materially better than typical for a project of this size.
- **Provenance and immutability model** (`05` §3–§4, `07` §4, `11` §8). Raw-prediction immutability,
  versioned reviewed masks with parent chains, and explicit prediction-variant labelling are coherent
  and internally consistent across four files.
- **Scientific-honesty controls.** `PR-SCI-03` + `TC-SCI-003` (negative results acceptable), the
  comparable-run gate (`08` §7), the failed-case protocol (`08` §8.1), and the empty-slice rule
  (`07` §6) together close the most common ways a student project accidentally fabricates a result.
- **Mode gating.** The Evaluation vs Inference & Review separation (`00` §7, `02` §5, `PR-MODE-01`) is
  enforced consistently down to API error codes (`GROUND_TRUTH_UNAVAILABLE`).

**[RECOMMENDATION]** None of the above should be traded away during recovery (`15` §18).

---

## 2. Findings

Format for every finding: ID · severity · affected spec files · affected requirement IDs ·
description · why it matters · recommended resolution · may implementation proceed.

---

### BLOCKER

#### RA-B01 — The 3D error pipeline is a MUST requirement with no specification

| Field | Value |
|---|---|
| **Severity** | **BLOCKER** *(scoped to the 3D-error feature only)* |
| **Affected spec files** | `03`, `04`, `07`, `10`, `13` |
| **Affected requirement IDs** | PR-ERR-03, PR-3D-05, FR-3D-007, FR-3D-008, TC-3D-005, SCR-05 |

**Description.** **[SPEC]** `04` FR-3D-007 requires the system to "generate a 3D error representation
from prediction-vs-ground-truth disagreement", and FR-3D-008 requires that "selecting an error region
shall provide navigation to one or more contributing slices". `10` SCR-05 and `13` TC-3D-005 restate
this. **[SPEC]** `07` §7 "3D reconstruction" specifies only the reconstruction of a single LA surface
from "a validated 3D binary mask volume".

Nothing in the specification set defines:

1. how an error representation is constructed — three separate meshes (TP/FP/FN), one mesh with
   per-vertex classification, a voxel/point-cloud representation, or something else;
2. what constitutes an addressable "error region" — connected-component labelling, a spatial cluster,
   or a picked triangle's neighbourhood;
3. how a selected region resolves to its set of "contributing slices".

**Why it matters.** **[ASSUMPTION]** False-negative regions are thin shells between the prediction
boundary and the ground-truth boundary. Applying an isosurface method such as marching cubes directly
to an FN volume typically yields highly fragmented, near-degenerate geometry — visually noisy and
poorly suited to region picking. The chosen representation therefore materially determines whether
FR-3D-008 is achievable at all, and it changes the worker pipeline, the artifact schema
(`05` Reconstruction3D), the API response for
`GET /analysis-runs/{run_id}/error-reconstruction` (`11` §7), and the mobile picking implementation.
The requirement cannot be estimated, assigned, or acceptance-tested in its current form, and two
developers handed FR-3D-007 would build incompatible artifacts.

**Recommended resolution.** **[RECOMMENDATION]** Run **Spike F** (`TECHNICAL_SPIKES_REQUIRED.md`) on a
validated case to compare candidate representations against picking accuracy and mesh size, then raise
**DR-005** to add the pipeline definition to `07`. If Spike F shows the interaction is not achievable
within the window, the alternative is an explicit scope decision on PR-ERR-03/PR-3D-05 through the
`00` §13 change-control process — not a silent simplification.

**May implementation proceed before resolution?** **No, for this feature.** Work on FR-3D-001..006
(reconstruction and 2D↔3D linkage) may proceed independently — those have their own specification.
All other verticals are unaffected.

---

### HIGH

#### RA-H01 — GATE-DATA-01 is open: the dataset has not been downloaded or validated

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `00`, `06`, `08` |
| **Affected requirement IDs** | GATE-DATA-01, GATE-SPLIT-01, PR-EXP-01/02/03/04, NFR-REP-001/002, TC-EXP-004/008, TC-REP-001/002 |

**Description.** **[SPEC]** `06` §3 requires a machine-readable acquisition manifest before training
begins, and §9.1 states "Training tasks remain BLOCKED until this gate is ACCEPTED", requiring both
`management/DATASET_AUDIT.md` and `data/manifests/dataset_manifest.*`. **[VERIFIED]** As of this audit
neither the package nor the manifest exists; the workspace contains only `.git` and `docs/`.

**[VERIFIED]** No access failure has been observed. The official Cardiac Atlas source exposes a public
download link. **This audit makes no claim about registration, approval, or access lead time.** The
only verified state is: *not yet obtained*.

**Why it matters.** Every experiment in the `08` §2 matrix, both research questions, GATE-SPLIT-01,
GATE-ML-01, GATE-IMG-01, and the entire ML/Data-Science evidence package sit behind this gate. It is
also the input to RA-H02 (label provenance), RA-M02 (geometry support boundary), and the cohort shape
question (RA-M14). Nothing downstream of it can be scheduled with confidence until the package is in
hand and audited.

**Recommended resolution.** **[RECOMMENDATION]** Execute **Spike D** as **P0**, starting immediately
and independently of every other workstream. Produce `DATASET_AUDIT.md` plus the machine-readable
manifest covering every item in `06` §3 and §9.1. **Escalate this finding to BLOCKER only if an actual
download or access failure is recorded** — at which point a fallback protocol becomes a Decision
Request under `00` §13, since substituting a dataset is a protocol change.

**May implementation proceed before resolution?** **Partially.** No training, no split freeze, no
final evaluation. Mobile spikes, geometry fixtures, API contract work, backend scaffolding, and UX
design all proceed independently.

---

#### RA-H02 — Official package label provenance is unresolved; Path A vs Path B undetermined

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `06`, `08`, `00` |
| **Affected requirement IDs** | GATE-SPLIT-01, GATE-DATA-01, PR-EXP-03, NFR-REP-002, TC-EXP-008 |

**Description.** **[SPEC]** `06` §6 defines a split decision tree with two mutually exclusive branches
selected by whether "official 54-case test labels are available in the obtained package and provenance
is verified". Path A yields 80 train / 20 validation with a locked 54-case final holdout; Path B yields
70 / 15 / 15 from the 100 development cases.

**[UNRESOLVED]** The official source is internally inconsistent on this point: its historical challenge
description indicates test labels were withheld, while its current file-description section indicates
the Test Set contains 54 MRIs together with LA cavity labels. **This audit deliberately records the
question as open and asserts neither reading.** It cannot be settled from documentation — only by
auditing the downloaded package, exactly as `06` §3 requires ("explicit verification that
`laendo.nrrd` represents the LA cavity target for the obtained package; whether official test labels
are present and their provenance").

**Why it matters.** The two paths produce holdout populations of **54** and **15** cases respectively —
a factor of 3.6 difference in evaluation population. This changes the statistical interpretability of
the RQ-A comparison (see RA-M01), the wall-clock cost of every evaluation run, the size of the
precomputed-artifact set the backend must serve, and how many cases are available for
Inference & Review Mode demonstration. `06` §6 also states GATE-SPLIT-01 "may not change after test
results are observed", so guessing early and correcting later is not permitted.

**Recommended resolution.** **[RECOMMENDATION]** Resolve as the first deliverable of **Spike D**.
Record the finding in `DATASET_AUDIT.md` with file-level evidence (which files exist per case in the
test partition, their value distributions, and whether they are plausibly LA cavity annotations), then
resolve GATE-SPLIT-01 via **DR-002** before any training starts. Until then, plan both branches.

**May implementation proceed before resolution?** **No for training and split freeze.** Yes for
everything else.

---

#### RA-H03 — The declared critical path (precomputed artifacts) has no ingestion contract

| Field | Value |
|---|---|
| **Severity** | **HIGH** *(required before architecture freeze and API freeze)* |
| **Affected spec files** | `01`, `02`, `03`, `05`, `09`, `11`, `13` |
| **Affected requirement IDs** | PR-AN-01, PR-EXP-01/02/03/04, PR-COHORT-01/02, FR-EXP-001..006, UC-17, `01` §8 MUST scope |

**Description.** **[SPEC]** `03` PR-AN-01 (live analysis initiation) is **SHOULD**. `01` §8 SHOULD list,
`02` UC-17 alternative flow, and `03` PR-AN-01 all state that precomputed experiment results are "the
critical-path fallback" / "acceptable for the canonical demo fallback". It follows that **ingestion of
precomputed analysis runs, prediction masks, per-case and per-slice metrics, and reconstruction
artifacts into the backend is itself on the MUST path.**

**[VERIFIED]** `11` defines 28 endpoints. The only write path that creates an analysis run is
`POST /api/v1/cases/{case_id}/analysis-runs`, explicitly marked SHOULD (`11` §6, PR-AN-01). A
full-text search across all 18 spec files shows "precomputed" appears **only** as a UI *labelling*
concern (`10` SCR-03, SCR-09; `11` §6 "precomputed vs newly executed provenance") — never as an
ingestion mechanism.

**[VERIFIED]** Corroborating signal: of the 22 MUST scope items in `01` §8, exactly one has no
corresponding product requirement ID in `03` — *"3D NRRD MRI volume ingestion/validated access"*.

**Why it matters.** The mechanism that populates the backend with everything the demo displays is
unspecified: no product requirement, no functional requirement, no API operation, no acceptance test.
It is not covered by `NFR-AUDIT-001` because it has no requirement ID to cover. Concretely, the
`08` §2 matrix over a 15- or 54-case holdout implies on the order of **105–378 AnalysisRun records**
plus their masks, metrics, and meshes, each of which must satisfy the `05` §4 provenance invariants.
Two developers would build incompatible loaders, and neither could be acceptance-tested.

**Recommended resolution.** **[RECOMMENDATION]** Raise **DR-004** defining the precomputed artifact
ingestion contract: artifact directory/manifest layout produced by the ML worker, the ingestion
operation (offline CLI, admin endpoint, or migration — an ADR-level choice), how `05` provenance
invariants and checksums are enforced at ingest, idempotency and re-ingestion semantics, and the
acceptance test that proves an ingested run is indistinguishable in provenance from a live one.
Resolve **before** architecture freeze and before API freeze, since it may add operations to `11`.

**May implementation proceed before resolution?** **No for backend/ML integration and API freeze.**
Mobile spikes and UI work against fixtures may proceed.

---

#### RA-H04 — GATE-DEPLOY-01 is sequenced after the API freeze it would invalidate

> **✅ CLOSED / NOT APPLICABLE (Round 3).** DR-003 ✅ selected **`LOCAL_DEMO` — PRIVATE OVERLAY / CELLULAR
> ACCESS** and resolved GATE-DEPLOY-01 **before** API freeze. No `REMOTE_DEMO` public authentication surface
> is required, so the API contract needs none and the sequencing hazard cannot arise. The finding text below
> is retained as the as-of-audit record. See `READINESS_REVIEW_RESOLUTION.md` §10.3.

| Field | Value |
|---|---|
| **Severity** | **HIGH** — *conditional: material only if `REMOTE_DEMO` is selected* |
| **Affected spec files** | `00`, `09`, `11`, `12` |
| **Affected requirement IDs** | GATE-DEPLOY-01, NFR-SEC-002, TC-SEC-002, `11` §11.2/§11.4 |

**Description.** **[SPEC]** `11` §11.4: "API contract/schema must be frozen before parallel
frontend/backend implementation on that interface." **[SPEC]** `09` §10 and `12` §5 `REMOTE_DEMO`:
"project-level authentication/authorization is mandatory for write operations". **[VERIFIED]** `11`
declares **zero** authentication or authorization surface — no auth endpoints, no token/header
semantics, no per-operation authorization rules. The only trace is the `UNAUTHORIZED` error code in
`11` §10. **[SPEC]** `00` §11.1 requires GATE-DEPLOY-01 only "before remote demo deployment" — i.e.
late in the schedule.

**Why it matters.** If `REMOTE_DEMO` is chosen after the API is frozen, adding an authorization surface
is a breaking schema change, which `11` §11.2 requires be handled through a versioned ADR/Decision
Request with integration-test updates — precisely the churn `11` §11.4 exists to prevent.

**[SPEC]** This is **not** a blocker on a `LOCAL_DEMO` path. `09` §10 and `12` §5 permit authentication
to be omitted when the backend is bound to localhost or a trusted private network, subject to the other
`LOCAL_DEMO` obligations (no public unauthenticated writes, no open directory listings, write actions
attributable to the configured reviewer alias).

**[APPROVED INTERPRETATION, Round 3]** The approved profile satisfies "trusted private network" through
**authenticated private-overlay (tailnet) membership** — which is **not** physical LAN co-location. The
backend is deliberately physically remote, and the venue Wi-Fi is explicitly untrusted and not required.

**Recommended resolution.** **[RECOMMENDATION]** Re-sequence GATE-DEPLOY-01 to resolve **before API
freeze** rather than before deployment (**DR-003**). The decision is a one-line declaration of intent
and costs nothing to make early. `LOCAL_DEMO` must **not** inherit remote-authentication or
public-dataset-transport obligations. If `REMOTE_DEMO` is selected, both the authorization surface
(this finding) and dataset-redistribution constraints (RA-H17) must be resolved before the freeze.

**May implementation proceed before resolution?** **Yes**, up to but not including API freeze.

---

#### RA-H05 — Circular dependency between the mobile spikes and the target demo device

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `00`, `07`, `09`, `10` |
| **Affected requirement IDs** | GATE-MOB-01, NFR-PERF-001..004, NFR-USAB-005, TC-PERF-001..004, TC-USAB-005 |

**Description.** **[SPEC]** `07` §12: the spikes "must also exercise the performance targets in
`NFR-PERF-001`–`004` on the declared target demo device where applicable." **[SPEC]** `10` §9.1:
"`TECH_STACK_ADR.md` must declare at least one target demo device/emulator profile (OS/version, screen
class, relevant GPU/CPU class). NFR performance and the 5-run canonical smoke test are evaluated
against this declared target." **[SPEC]** `09` §7 and `00` §11.1: `TECH_STACK_ADR.md` is the artifact
*produced from* Spike A/B evidence and resolves GATE-MOB-01.

The spikes therefore require a declaration that only exists in the document the spikes produce.

**Why it matters.** Without a device declared up front, Spike A and Spike B produce performance numbers
that are not comparable between candidate frameworks and cannot be evaluated against
NFR-PERF-001..004. GATE-MOB-01 would then be resolved on qualitative impressions — exactly what
`09` §7 forbids ("justified by spike evidence rather than familiarity alone").

**Recommended resolution.** **[RECOMMENDATION]** Declare the target demo device profile **before** the
spikes, as a standalone leader decision recorded in the Decision Log, and have `TECH_STACK_ADR.md`
subsequently *restate* it rather than originate it. Both spikes then run on the same declared hardware.
Raised as **DR-006**.

**May implementation proceed before resolution?** **No for Spike A/B execution.** Spike preparation
(harness, fixtures, test scripts) may proceed.

---

#### RA-H06 — No ML compute feasibility spike exists, though GATE-ML-01 demands its evidence

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `00`, `07`, `08` |
| **Affected requirement IDs** | GATE-ML-01, ADR-ML-001, PR-EXP-01/03, `08` §2 experiment matrix |

**Description.** **[SPEC]** `07` §2 requires `ADR-ML-001` to record, among other things,
"compute/memory feasibility evidence" before the six core runs are launched. **[VERIFIED]** A full-text
search for "Spike" across all 18 spec files returns only **Spike A** (2D viewer/editor) and **Spike B**
(3D linkage), both defined in `00` §11 and `07` §12, and both mobile. No spike, task, or procedure
anywhere in the specification produces the compute/memory evidence GATE-ML-01 requires.

**Why it matters.** The `08` §2 matrix is six training runs plus one derived ablation, all on a DINOv2
backbone plus a UNet baseline, inside a 30-day window shared with a full mobile application.
**[ASSUMPTION]** A ViT-based DINOv2 backbone with a segmentation decoder has materially different
memory and wall-clock characteristics from a conventional UNet at the same input resolution, and the
patch-grid resolution of the backbone interacts directly with boundary quality on a structure as thin
as the LA cavity wall. If the recipe frozen by GATE-ML-01 turns out not to fit the available hardware
or calendar, the discovery happens *after* the gate — and `08` §2 requires the recipe be held identical
across all three data fractions, so a mid-matrix change invalidates completed runs.

**Recommended resolution.** **[RECOMMENDATION]** Add **Spike C — ML compute / DINOv2 feasibility**
(`TECHNICAL_SPIKES_REQUIRED.md`) as a prerequisite to GATE-ML-01, producing: per-run wall-clock on the
actual available hardware, peak memory, effective output resolution versus LA boundary thickness, and
an explicit statement of whether 6 runs + 1 ablation fit the remaining calendar. Raised as **DR-007**.

**May implementation proceed before resolution?** **No for the experiment matrix.** Data pipeline,
evaluation code, and the UNet baseline may proceed.

---

#### RA-H07 — The slice-axis and index-order convention is never fixed

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `05`, `07`, `09`, `11` |
| **Affected requirement IDs** | FR-MRI-001, FR-3D-003, FR-3D-005, FR-3D-006, NFR-MAINT-002, NFR-REL-003, TC-3D-003, TC-3D-004, TC-MAINT-002 |

**Description.** **[SPEC]** `05` MRIVolume declares `shape_xyz` and `spacing_xyz`. **[SPEC]** `07` §3
requires the pipeline to "define and version" the *source slice extraction axis* but never states what
it is. **[SPEC]** `11` §4 exposes a single flat `GET /cases/{case_id}/slices/{slice_index}/mri` with no
axis parameter, and `11` §4 geometry requires the response to expose "axis/slice convention" —
acknowledging the convention exists without fixing it. **[ASSUMPTION]** NRRD readers and NumPy
conventionally present volumes in an index order that does not match a literal `x, y, z` reading of
`shape_xyz`, so the mapping between `shape_xyz`, the in-memory array index order, and `slice_index` is
a genuine choice with at least two plausible answers.

**Why it matters.** **[SPEC]** `09` §6 forbids independently hand-written incompatible transforms and
mandates canonical fixtures — but fixtures test *conformance to a convention*, they do not *choose*
one. If backend and mobile each pick a defensible reading, both pass their own unit tests and disagree
only at integration, producing transposed or reversed slice indexing. `13` §12 classifies "2D/3D
mapping wrong in accepted build" as **P0/Critical**. This is the single highest-probability integration
defect in the project.

**Recommended resolution.** **[RECOMMENDATION]** Fix the convention explicitly before any parallel
backend/mobile work: declare the canonical array index order, which axis `slice_index` traverses,
the origin corner and direction of the in-plane axes, and whether `shape_xyz` is reported in that order
or in file order. Encode it in the geometry fixture set (`09` §6) with a worked example. Raised as
**DR-008**.

**May implementation proceed before resolution?** **No for cross-boundary geometry work.** Single-side
work behind a fixture may proceed once the fixture exists.

---

#### RA-H08 — The Review entity is under-modelled against its own API contract

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `05`, `10`, `11` |
| **Affected requirement IDs** | PR-REV-01, PR-REV-02, PR-PROV-01, FR-REV-001, FR-REV-008..010, TC-REV-001, TC-REV-005 |

**Description.** Two distinct defects in the same entity.

**(a) Missing revision field.** **[SPEC]** `11` §2: "Stale client writes must be rejected through a
version/ETag/revision mechanism chosen by implementation; silent last-write-wins on reviewed masks is
prohibited." `11` §8 shows `PATCH /reviews/{review_id}` carrying `"expected_revision": 3`, and `11` §10
defines a `STALE_REVISION` error code. **[VERIFIED]** `05` Review has no `revision`, `version`, or
`etag` field — a full-text search for "revision" and "etag" in `05` returns nothing. The domain model
cannot represent the concurrency token its own API requires.

**(b) No prediction-variant scope.** **[SPEC]** `05` Review is keyed to `analysis_run_id` with a single
`status` and a single `latest_reviewed_mask_id`. **[SPEC]** `05` AnalysisRun may hold both
`raw_prediction_mask_id` and `processed_prediction_mask_id`, and `10` SCR-03 requires the UI to show
the active variant with "no silent switching". A run whose raw prediction is ACCEPTED but whose
processed prediction is FLAGGED cannot be represented. **[SPEC]** `11` §8 `POST
/analysis-runs/{run_id}/reviews` accepts no variant parameter, while the working-mask `PUT` requires
"exact source mask ID" — so the *artifact* is variant-aware but the *review state* is not.

**Why it matters.** (a) makes `TC-REV-001` ("invalid/stale transitions fail without losing
state/audit history") unimplementable as specified. (b) forces an arbitrary implementation choice —
one Review per run, or one per run+variant — that changes the database schema, the API resource shape,
and the SCR-03/SCR-06 UI. Two developers will choose differently.

**Recommended resolution.** **[RECOMMENDATION]** Raise **DR-009** to (a) add an explicit revision field
to the Review entity in `05`, and (b) decide whether Review is scoped per run or per run+prediction
variant, propagating the answer to `11` §8 and `10` SCR-06.

**May implementation proceed before resolution?** **No for the review/correction vertical (V4).**

---

#### RA-H09 — "Outlier" is never defined, yet it is a MUST and the demo's second step

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `01`, `02`, `03`, `10`, `11`, `16` |
| **Affected requirement IDs** | PR-COHORT-02, FR-EXP-006, FR-ERR-003, UC-12, SCR-01, TC-EXP-006 |

**Description.** **[SPEC]** `03` PR-COHORT-02 (MUST): "The user shall be able to identify and open
outlier/low-performing cases from cohort analysis." `10` SCR-01 lists "outlier entry points" as
displayed content. `11` §3 requires the study response to include "high-level comparable metric
summary/outlier entry points when available". `02` UC-12 is an entire use case built on it. `16` §2
makes "Identify an outlier case" step 2 of the hero demo narrative. **[VERIFIED]** No file defines what
an outlier *is*: no IQR rule, no standard-deviation threshold, no bottom-N ranking, no absolute Dice
cut-off.

**Why it matters.** The definition determines the backend aggregation query, the API response shape,
the SCR-01 UI, and what `TC-EXP-006` asserts. `08` §5 provides "mean/median/std/distribution/outliers"
as an evaluation level without an operational rule. Two developers will implement different selectors
and the demo's headline interaction becomes non-reproducible between builds.

**Recommended resolution.** **[RECOMMENDATION]** Raise **DR-010** to fix one operational definition
(**[RECOMMENDATION]** a documented rule such as bottom-N by case-level 3D Dice, or below
`Q1 − 1.5·IQR`, stated with its metric and prediction variant), state it in the API response so the
client does not re-derive it, and make `TC-EXP-006` assert against it.

**May implementation proceed before resolution?** **No for SCR-01 outlier entry points and UC-12.**
The rest of the cohort analytics vertical may proceed.

---

#### RA-H10 — MUST scope volume versus a 30-day window

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `01`, `03`, `04`, `13`, `15` |
| **Affected requirement IDs** | all 28 MUST product requirements; 75 MUST FR/NFR; 69 acceptance tests; `03` §5 scope firewall |

**Description.** **[VERIFIED]** The accepted MVP floor is **28 MUST product requirements**, **75 MUST
functional/non-functional requirements**, and **69 acceptance tests**, for **4 students in 30 days**.
**[SPEC]** `13` §6 DoD requires nine conditions per task including code review, integration behaviour,
and recorded evidence; `13` §13 requires all un-de-scoped MUST requirements ACCEPTED, zero open P0, and
`TC-USAB-005` (five consecutive canonical smoke runs on the target device), `TC-E2E-001`, `TC-TEAM-001`,
`TC-SCI-001/002/003` all passing. **[SPEC]** `03` §5 declares the MUST floor protected, and
`15` §18 Level 5 permits de-scoping COULD then SHOULD, with MUST changes requiring a formal Decision
Request and spec update.

**[ASSUMPTION]** Several acceptance tests are manual and device-bound (`13` §7 "Manual UX/performance
tests"; TC-USAB-001..005; TC-PERF-001..004), and `NFR-USAB-005` requires five *consecutive* successful
end-to-end runs, which is a stabilisation activity rather than a check. Combined with `15` §3's
requirement to preserve at least two calendar days of stabilisation buffer, the effective build window
is shorter than 30 days.

**Why it matters.** The specification correctly forbids silently shrinking MUST scope. That means the
only legal responses to schedule pressure are `15` §18 Level 4 (simplify implementation while
preserving the requirement) and Level 5 (formal DR to change MUST scope). Both are far cheaper to
exercise on day 3 than on day 22. Raising this now is the difference between a planned trade-off and a
crisis.

**Recommended resolution.** **[RECOMMENDATION]** Before the 30-day baseline is authored: (1) classify
every MUST requirement by whether a Level-4 simplification exists and pre-document it; (2) identify the
MUST requirements whose removal would be least damaging to the four academic lenses in `16` §4, as a
prepared Level-5 DR that is *not* filed unless needed; (3) size the manual/device test load explicitly
so it appears in the calendar rather than as an end-of-project surprise. No de-scoping is proposed by
this audit — this is preparation, not a scope change.

**May implementation proceed before resolution?** **Yes.** This shapes the baseline, it does not gate
technical work.

---

#### RA-H11 — TC-3D-004's tolerance is undefined, making the acceptance criterion untestable

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `07`, `09`, `13` |
| **Affected requirement IDs** | TC-3D-004, FR-3D-005, FR-3D-006, PR-3D-04, NFR-MAINT-002 |

**Description.** **[SPEC]** `13` TC-3D-004: "Known mesh/world test points resolve to the expected slice
index within **the fixture's defined tolerance**, including after camera rotate/zoom." **[VERIFIED]**
The word *tolerance* appears **exactly once** in the entire 18-file specification set — in that
sentence. No fixture, no numeric value, and no derivation rule for it exists anywhere.

**Why it matters.** TC-3D-004 is the acceptance test for PR-3D-04 (MUST) and FR-3D-005/006. As written
it cannot pass or fail deterministically: any result can be declared within an undefined tolerance.
`13` §12 lists "2D/3D mapping wrong in accepted build" as **P0/Critical**, so this is the acceptance
gate for a P0-class defect class. It also interacts directly with RA-H14: mesh decimation trades
picking accuracy against frame rate, and without a tolerance there is no criterion for how much
decimation is acceptable.

**Recommended resolution.** **[RECOMMENDATION]** Define the tolerance as part of the canonical geometry
fixture set (`09` §6) — **[RECOMMENDATION]** expressed in source slices (e.g. exact index for interior
points, ±1 slice at surface-tangent points where the ray is near-parallel to the slice plane), with the
rationale recorded. Must be fixed before Spike B acceptance so the spike has a pass criterion. Folded
into **DR-008** (geometry contract).

**May implementation proceed before resolution?** **Yes for implementation; no for acceptance.**
FR-3D-005/006 cannot be moved to ACCEPTED without it.

---

#### RA-H13 — No transport or first-load performance budget exists

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `04`, `09`, `11`, `13` |
| **Affected requirement IDs** | NFR-PERF-001, NFR-PERF-004, ADR-ART-001, PR-MRI-01, TC-PERF-001, TC-PERF-004 |

**Description.** **[SPEC]** `04` NFR-PERF-001 bounds only "switching among **already available/cached**
slices" at 200 ms p95, and adds that "normal slice gestures shall not trigger a full-volume network
transfer". NFR-PERF-004 bounds only *request creation* for asynchronous work at 2 s. **[VERIFIED]**
No requirement bounds the first load of a case, the transfer of a slice not yet cached, the transfer of
a reconstruction mesh, or total volume transfer.

**Why it matters.** **[SPEC]** `09` §4 defers artifact strategy to `ADR-ART-001`, and `11` §2 permits
large payloads "directly, by chunk/slice endpoint, or by versioned artifact URL according to
`ADR-ART-001`". An ADR must be justified against a criterion; there is none. **[ASSUMPTION]** For a
volume on the order of 640×640×88, the difference between per-slice fetch, prefetch windows, and
whole-volume download is the difference between a usable and an unusable demo — and it is precisely the
kind of decision that is expensive to reverse after the client is built. The gap also means the very
first action in the `16` §2 hero demo (opening a case) has no performance requirement at all.

**Recommended resolution.** **[RECOMMENDATION]** Run **Spike E — artifact transport** to measure
candidate strategies on the declared demo device and network, and produce a first-load/transport budget
as an input to `ADR-ART-001`. **[RECOMMENDATION]** Raise a DR to add a first-load NFR with a measurable
target and a matching acceptance test, so the budget is enforceable rather than advisory.

**May implementation proceed before resolution?** **Yes**, but `ADR-ART-001` should not be frozen
without the measurement.

---

#### RA-H14 — No mesh size or decimation budget

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `04`, `07`, `13` |
| **Affected requirement IDs** | NFR-PERF-002, FR-3D-001, FR-3D-002, FR-3D-005, TC-3D-002, TC-PERF-002, TC-3D-004 |

**Description.** **[SPEC]** `07` §7 permits a mesh to "be simplified for mobile performance only if
mapping remains valid or an explicit transform is preserved", and forbids "arbitrary independent
scaling that breaks 2D↔3D mapping". **[SPEC]** `04` NFR-PERF-002 targets ≥20 FPS median with no
interaction stall beyond 500 ms. **[VERIFIED]** No triangle-count budget, no decimation ratio, no
error-metric bound on simplification, and no definition of how "mapping remains valid" is measured.

**Why it matters.** **[ASSUMPTION]** An isosurface extracted from a binary LA cavity mask at native
resolution produces a mesh far larger than a mobile device will render at 20 FPS, so decimation is not
optional — it is on the critical path. Decimation moves vertices, which directly degrades the 3D→slice
resolution accuracy that RA-H11's undefined tolerance is supposed to bound. The two findings form a
pair: without a tolerance there is no criterion for how much decimation is acceptable, and without a
decimation budget there is no way to know whether NFR-PERF-002 is reachable.

**Recommended resolution.** **[RECOMMENDATION]** Have **Spike B** (extended) or **Spike F** produce the
frontier: triangle count versus frame rate versus 3D→slice accuracy on the declared device. Record the
selected budget and the accuracy cost in `TECH_STACK_ADR.md`, and set the TC-3D-004 tolerance
consistently with it. Folded into **DR-008**.

**May implementation proceed before resolution?** **Yes for reconstruction; no for acceptance of
FR-3D-002/005 or TC-PERF-002.**

---

#### RA-H16 — Normalization-statistic policy across data fractions is undefined and confounds RQ-A

| Field | Value |
|---|---|
| **Severity** | **HIGH** |
| **Affected spec files** | `06`, `07`, `08` |
| **Affected requirement IDs** | RQ-A, PR-EXP-03, FR-EXP-001, FR-EXP-004, NFR-REP-001, GATE-ML-01, TC-EXP-004 |

**Description.** **[SPEC]** `07` §3: "Any normalization statistic learned from data must be fit on the
training partition only. Per-image/per-volume normalization that uses only the current image is allowed
if documented consistently." **[SPEC]** `06` §7 and `08` §4: the 25% and 50% subsets are drawn from the
training partition, so **the training partition differs by data fraction**.

**[UNRESOLVED]** Therefore "fit on the training partition only" has two valid readings:

1. **Refit per fraction** — the 25% run uses statistics from its 17-ish cases, the 100% run from all
   of them. Faithful to the scarcity scenario, but the normalization changes between conditions.
2. **Frozen once** — statistics computed from the full training partition and reused for all fractions.
   Isolates the labelled-data variable, but leaks full-cohort intensity statistics into the 25%
   condition.

**Why it matters.** RQ-A asks whether DINOv2 degrades *less* than UNet as labelled data is reduced.
Under reading 1, part of any measured degradation is normalization drift rather than label scarcity;
under reading 2, the scarcity condition is partly idealised. The two readings can produce different
answers to the project's primary research question. **[SPEC]** `08` §2 requires the recipe be identical
across `EXP-D-025/050/100` except for training-case membership — which arguably favours reading 2 — but
`07` §3's wording does not settle it, and `07` §3 also permits per-image normalization, which sidesteps
the issue entirely. Two developers will choose differently and neither will be violating the spec.

**Recommended resolution.** **[RECOMMENDATION]** Raise **DR-011** to fix one policy before GATE-ML-01,
apply it identically to UNet and DINOv2, and record it in `preprocessing_version` so the choice is
visible in every experiment manifest per `08` §10. **[RECOMMENDATION]** Per-image normalization is the
simplest way to remove the confound entirely and is already permitted by `07` §3 — but this is the
leader's decision, not the auditor's.

**May implementation proceed before resolution?** **No for the experiment matrix.** Data loading and
evaluation code may proceed.

---

#### RA-H17 — Dataset redistribution under REMOTE_DEMO is ungated

> **✅ CLOSED / NOT APPLICABLE (Round 3).** DR-003 ✅ selected a profile with **no public dataset-serving
> endpoint**; access is restricted to authorised private-overlay devices. `12` §3's dataset-governance duties
> — preserve license terms, no redistribution outside permitted terms, record source/acquisition/checksum —
> remain **unaffected** and still bind how the team handles the package. Finding text retained as the
> as-of-audit record. See `READINESS_REVIEW_RESOLUTION.md` §10.3.

| Field | Value |
|---|---|
| **Severity** | **HIGH** — *conditional: material only if `REMOTE_DEMO` is selected* |
| **Affected spec files** | `09`, `12` |
| **Affected requirement IDs** | GATE-DEPLOY-01, NFR-SEC-002, `12` §3, `12` §8.1, TC-SEC-002 |

**Description.** **[SPEC]** `12` §3: "Do not redistribute the dataset outside permitted terms."
**[SPEC]** `09` §10 `REMOTE_DEMO`: "read access must comply with dataset terms." **[VERIFIED]** The
`12` §8.1 privacy/security acceptance gate checks directory enumerability, write authorization, secrets,
logs, mobile bundle secrets, and metadata identifiers — but contains **no check that serving MRI
imagery to a remote client complies with the dataset's use terms**, and `TC-SEC-002` tests only TLS and
exposure profile.

**Why it matters.** **[ASSUMPTION]** Serving MRI slice imagery from a publicly reachable backend to an
app is plausibly a form of redistribution under a research data-use agreement. The specification states
the obligation but provides no mechanism to discharge it, so a team following the letter of `12` §8.1
could pass the privacy gate while breaching `12` §3. This is a governance exposure for the university,
not merely a technical defect.

**Recommended resolution.** **[RECOMMENDATION]** If `REMOTE_DEMO` is selected, add to the `12` §8.1
gate an explicit review of the obtained package's data-use terms against the deployment topology, with
the reviewed terms archived alongside `DATASET_AUDIT.md`. **[RECOMMENDATION]** `LOCAL_DEMO` avoids the
question entirely and is the lower-risk default for a university demo. Tied to **DR-003**.

**May implementation proceed before resolution?** **Yes**, until `REMOTE_DEMO` deployment is attempted.

---

### MEDIUM

#### RA-M01 — Statistical uncertainty reporting is not required

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `08`, `03`, `16` |
| **Affected requirement IDs** | RQ-A, PR-SCI-03, TC-SCI-003, `08` §7 |

**Description.** **[SPEC]** `08` §7 requires number of evaluated cases, mean and standard deviation,
median, distribution visualisation, paired case-level comparison, and explicit identification of
excluded cases. Significance testing is "optional". **[VERIFIED]** Confidence intervals are not
required anywhere. **[ASSUMPTION]** Under either split path the holdout is small relative to the effect
being measured — RQ-A is an *interaction* question (does degradation differ between families across
three fractions), which is inherently harder to resolve than a single-condition difference.

**Why it matters.** `PR-SCI-03` correctly protects against forcing a positive result, but nothing
protects against the mirror-image error: reporting a null result as if it were evidence of no
difference, when the evaluation may simply not be able to distinguish the two. A defensible report
should state the uncertainty around each estimate.

**Recommended resolution.** **[RECOMMENDATION]** Require the final report to present uncertainty on the
primary comparison — **preferably confidence intervals** on per-case metric means and on paired
differences — plus an explicit limitations section covering evaluation size. **A formal power analysis
is explicitly NOT proposed as a planning gate** for a university MVP. This strengthens `PR-SCI-03`
rather than adding scope.

**May implementation proceed before resolution?** **Yes.** Affects reporting only.

---

#### RA-M02 — Oblique / non-identity geometry: a dataset-validation question, not a design gap

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `05`, `06`, `07`, `11` |
| **Affected requirement IDs** | GATE-DATA-01, FR-CASE-003, FR-3D-003, NFR-REL-003, PR-SCI-02, TC-REL-003 |

**Description.** **[SPEC]** `05` MRIVolume lists `origin_xyz` and `direction_or_orientation` as
"if available". `06` §4 requires the validation report to determine orientation/direction
compatibility. `11` §3's case-detail example shows `"origin": null, "direction": null`, marked
illustrative. **[UNRESOLVED]** Whether the obtained package contains a non-identity direction matrix is
unknown until Spike D runs.

**Why it matters.** **[ASSUMPTION]** A non-axis-aligned direction matrix means the "slice plane" in
world space is not perpendicular to a coordinate axis, which complicates FR-3D-003 (2D slice → 3D
plane), FR-3D-005 (3D point → slice index), and the mesh-to-world transform. Implementing general
oblique support is substantially more work than the axis-aligned case.

**Recommended resolution.** **[RECOMMENDATION]** Treat this as a **scope boundary** rather than a
feature: declare that the MVP supports axis-aligned volumes and **rejects** unsupported geometry using
the `GEOMETRY_NOT_VALIDATED` code that `11` §10 already defines, with `06` §4's validation gate as the
enforcement point. Confirm the boundary against the validated package in Spike D. Escalate only if the
package actually contains unsupported geometry. Raised as **DR-012**.

**May implementation proceed before resolution?** **Yes**, under the declared axis-aligned assumption,
provided the assumption is recorded and the rejection path exists.

---

#### RA-M03 — Contract front-load is a sequencing risk, not an architecture blocker

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `09`, `11`, `15` |
| **Affected requirement IDs** | ADR-MOB-001, ADR-ART-001, ADR-DEPLOY-001, `09` §12, `11` §11.4, NFR-MAINT-001 |

**Description.** **[SPEC]** `09` §12 requires the relevant contract to be versioned and accepted before
two members work in parallel across an interface, and `11` §11.4 requires the API contract frozen before
parallel frontend/backend implementation on that interface. Three ADRs (`ADR-MOB-001`, `ADR-ART-001`,
`ADR-DEPLOY-001`) plus the API freeze therefore gate cross-interface parallel work.

**Why it matters — and what it does not mean.** This constrains **planning order**, not readiness.
**[SPEC]** `09` §1.1 explicitly permits scaffolding for "technology-neutral docs/contracts/spikes"
before ADRs are final. Dataset validation (Spike D), ML compute feasibility (Spike C), mobile Spikes A
and B, 3D work (Spike F), geometry fixture construction, and UX design are all **parallelisable after
their prerequisite decisions are resolved**, before API freeze. The risk is that a naïve baseline
serialises them behind the ADRs and wastes the first week.

**Recommended resolution.** **[RECOMMENDATION]** Handle in 30-day sequencing: front-load the spikes in
parallel, schedule the ADRs as their outputs, and use `09` §12's fixture/mock provision so downstream
members work against accepted contracts rather than waiting. No gate is proposed.

**May implementation proceed before resolution?** **Yes.**

---

#### RA-M04 — Technical-block ownership matrix is missing

> **✅ RESOLVED (Round 3).** DR-013 ✅ approved two parallel ownership axes — mobile verticals V1–V4
> (preserved) plus technical blocks for Imaging/Geometry, ML Training/Evaluation, Backend/Persistence/
> Ingestion, and Integration/CI. Every member is a Primary Owner on both axes and every block has a named
> Secondary Reviewer. See `READINESS_REVIEW_RESOLUTION.md` §10.2.

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `14`, `15`, `16` |
| **Affected requirement IDs** | PR-MOBILE-03, NFR-MAINT-001, TC-TEAM-001, TC-MAINT-001, `14` §3, `14` §5 |

**Description.** **[SPEC]** `14` §3 defines four vertical capability groups — V1 (2D MRI interaction),
V2 (3D/spatial error), V3 (experiment/cohort analysis), V4 (review/findings) — each with a Primary
Owner and Secondary Reviewer. **[VERIFIED]** All four are mobile-facing. Backend API, ML training, the
imaging pipeline, and integration have **no named owner or reviewer** in the ownership model, while
`14` §5–§6 forbid a block where only one person can explain, run, or debug it.

**Why it matters — and what must not change.** **[SPEC]** V1–V4 exist partly to satisfy the mobile
course's requirement that every member analyse, design, implement, and defend at least one mobile
function (`00` §3, `PR-MOBILE-03`, `16` §5.1 CLO3). **The V1–V4 structure must be preserved.** The gap
is that the non-mobile technical blocks — which carry RA-B01, RA-H07, RA-H16 and most of the P0 risk —
sit outside the ownership and secondary-review model entirely.

**Recommended resolution.** **[RECOMMENDATION]** Add an **additional** technical-block
ownership/reviewer matrix alongside V1–V4, covering ML training, imaging/geometry pipeline, backend
API/persistence, and integration/CI — each with a primary owner and a secondary reviewer drawn from the
same four members. This is a second axis over the same people, not a replacement for the verticals.
Required **before task allocation and the 30-day baseline**; it does **not** block readiness
remediation or technical architecture work. Raised as **DR-013**.

**May implementation proceed before resolution?** **Yes** for spikes and architecture; **no** for
30-day task allocation.

---

#### RA-M05 — `05` §1 domain hierarchy contradicts `05` §2 and `05` §6

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `05` |
| **Affected requirement IDs** | PR-REV-01, PR-PROV-01, PR-FIND-01, FR-REV-008/010, FR-FIND-001..004 |

**Description.** **[SPEC]** `05` §1 draws the hierarchy with `Review` and `ReviewedMask` as children of
`Finding`. **[SPEC]** `05` §2 defines Review keyed to `analysis_run_id` with no `finding_id`, defines
ReviewedMask keyed to `source_mask_id` + `review_id` with no `finding_id`, and defines Finding with no
`review_id`. **[SPEC]** `05` §6 states outright: "A finding may be created without correction, and a
correction may exist without a finding."

The diagram and the entity definitions describe different schemas.

**Why it matters.** A developer implementing from §1 nests reviews under findings; a developer
implementing from §2/§6 makes them independent aggregates joined only through the analysis run. These
produce incompatible database schemas and incompatible API resource nesting. §2 and §6 are mutually
consistent and clearly the intended model, so the diagram is most likely the defect — but `00` §12's
conflict rule forbids guessing which frozen text wins.

**Recommended resolution.** **[RECOMMENDATION]** Spec clarification request **SCQ-01** asking the spec
owner to confirm that §2/§6 govern and that §1 is an illustrative grouping, not a containment
relationship.

**May implementation proceed before resolution?** **No for the review/finding schema.**

---

#### RA-M06 — MetricSet cannot represent a cohort summary or a per-slice metric

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `05`, `08`, `11` |
| **Affected requirement IDs** | PR-COHORT-01, FR-EXP-002, FR-EXP-003, NFR-REP-003, TC-EXP-003 |

**Description.** Two related modelling defects. **[SPEC]** `05` MetricSet is keyed to
`analysis_run_id` (one run = one case, per `05` AnalysisRun) yet declares
`aggregation_level = CASE_3D / SLICE_2D / COHORT_SUMMARY`.

**(a)** A `COHORT_SUMMARY` spans many runs and many cases; it cannot belong to a single
`analysis_run_id`. **[SPEC]** `11` §5 `GET /experiments/{experiment_id}/metrics` returns exactly such a
summary, at experiment scope, with no analysis run in the path.

**(b)** A `SLICE_2D` MetricSet has no `slice_index` field, so a per-slice metric cannot identify its
slice. `05` provides only a `per_slice_metrics_uri` pointing at an external artifact — which conflicts
with `SLICE_2D` being an enumerated aggregation level of the entity itself.

**Why it matters.** `TC-EXP-003` requires cohort summaries be recomputed from persisted per-case values
and report intended and successful N — the persistence model must be able to hold both. As written the
implementer must invent a representation, and `11` §6's per-slice metrics endpoint has no defined
backing entity.

**Recommended resolution.** **[RECOMMENDATION]** Spec clarification request **SCQ-02**: either relax
MetricSet's key so cohort summaries attach to an experiment, or remove `COHORT_SUMMARY` from the
enumeration and model cohort aggregates as a distinct derived entity; and either add `slice_index` or
remove `SLICE_2D` in favour of the per-slice artifact.

**May implementation proceed before resolution?** **No for the metrics persistence schema.**

---

#### RA-M07 — `05` Experiment omits fields that `08` and `11` require

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `05`, `08`, `11` |
| **Affected requirement IDs** | PR-EXP-01, FR-EXP-001, NFR-REP-001, NFR-REP-004, TC-EXP-001, TC-REP-001 |

**Description.** **[SPEC]** `08` §10's experiment result manifest requires
`evaluation_population_manifest`, `evaluation_metric_version`, and `evaluation_code_version` as fields
distinct from `split_manifest` and `training_code_version`. **[SPEC]** `11` §5 requires experiment
detail to expose "split/subset manifest IDs" (plural) and "checkpoint/evaluation version".
**[VERIFIED]** `05` Experiment carries `split_protocol_id`, `preprocessing_version`,
`postprocessing_version`, `training_code_version`, `checkpoint_id` — but **no** evaluation population
manifest, **no** evaluation code version, and **no** separate subset manifest identifier.

**Why it matters.** `TC-EXP-001` asserts the experiment manifest contains everything `08` requires, and
`NFR-REP-004`'s comparable-run gate must verify "same evaluation-code/metric semantics version" — which
cannot be checked against a field the domain model does not carry. The domain model is the schema the
backend will be built from.

**Recommended resolution.** **[RECOMMENDATION]** Spec clarification request **SCQ-03** to align `05`
Experiment with `08` §10's manifest and `11` §5's response.

**May implementation proceed before resolution?** **No for the experiment schema.**

---

#### RA-M08 — EXP-D-PP is an Experiment in `08` but a mask variant in `05`

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `05`, `07`, `08`, `11` |
| **Affected requirement IDs** | PR-EXP-04, FR-EXP-005, TC-EXP-005, `08` §2, `08` §9 |

**Description.** **[SPEC]** `08` §2 lists `EXP-D-PP` as a row in the experiment matrix with its own
experiment ID, model, fraction, and post-processing column, and `08` §2 states it is "derived from the
**same raw predictions produced by `EXP-D-100`**". **[SPEC]** `05` models post-processing as a
`ProcessedPredictionMask` hanging off a `RawPredictionMask`, and `05` AnalysisRun carries both
`raw_prediction_mask_id` and `processed_prediction_mask_id` on the *same run*.

So EXP-D-PP is simultaneously (a) a separate Experiment with its own AnalysisRuns, and (b) merely the
processed variant of EXP-D-100's existing runs. Under (a) the provenance invariant `05` §4.1 ("every
derived mask references exactly one source mask/version") is satisfiable but the runs are duplicated;
under (b) EXP-D-PP has no runs of its own and cannot appear in `11` §5's experiment endpoints.

**Why it matters.** It determines whether `GET /experiments/EXP-D-PP/metrics` exists, how
`GET /experiments/compare?ids=EXP-D-100,EXP-D-PP` behaves against the `08` §7 comparable-run gate
(criterion 4 requires an "explicit raw/processed prediction variant" — a cross-variant comparison is
arguably its own case), and what `TC-EXP-005` asserts.

**Recommended resolution.** **[RECOMMENDATION]** Spec clarification request **SCQ-04** to state whether
EXP-D-PP is a first-class Experiment or a declared prediction-variant view over EXP-D-100, and how the
comparable-run gate treats a deliberate cross-variant comparison.

**May implementation proceed before resolution?** **No for the ablation's representation.**

---

#### RA-M09 — Nested subsets are a preference in `06`/`08` but a rule in `13`

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `06`, `08`, `13` |
| **Affected requirement IDs** | GATE-SPLIT-01, FR-EXP-004, TC-EXP-004, TC-EXP-008 |

**Description.** **[SPEC]** `06` §7: subsets are "**preferably** nested subsets (25% ⊂ 50% ⊂ 100%)
unless a different design is explicitly documented". **[SPEC]** `08` §4: "**Preferred** design: 25%
subset nested inside 50%". **[SPEC]** `13` TC-EXP-008: "subset manifests satisfy **nested/paired
rules**" — stated as an assertion the test must check.

**Why it matters.** A test cannot assert a preference. As written, TC-EXP-008 either fails on a
legitimately documented non-nested design or is silently weakened to a no-op. This is the same class of
defect as RA-H11: an acceptance criterion whose pass condition is not determinate.

**Recommended resolution.** **[RECOMMENDATION]** Spec clarification request **SCQ-05** to either make
nesting a MUST (and delete the escape clause) or make TC-EXP-008 conditional on the documented design
recorded in the split manifest.

**May implementation proceed before resolution?** **Yes**, provided the chosen design is documented in
the split manifest before training.

---

#### RA-M10 — Working-mask session semantics are undefined

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `04`, `07`, `09`, `10`, `11` |
| **Affected requirement IDs** | PR-REV-02, FR-REV-005/006/007, NFR-REL-002, TC-REV-004, TC-REL-002 |

**Description.** **[SPEC]** `04` FR-REV-007 requires "reset-to-source-prediction for the current
**unsaved edit session**". **[SPEC]** `09` §3 assigns the "local working edit buffer" to mobile, while
`11` §8 defines a server-side `PUT /reviews/{review_id}/working-mask/slices/{slice_index}`.
**[VERIFIED]** Nothing defines: the lifetime of an edit session; whether uncommitted working state must
survive app restart; whether `NFR-REL-002`'s protection of "persisted review artifacts" extends to an
uncommitted working mask; what happens to working state on cancel; or what happens if the user switches
prediction variant mid-session while `10` §5 requires reset to restore "the exact declared source mask".

**Why it matters.** It determines whether the working mask is client-only with periodic sync or
server-authoritative, which changes the API usage pattern, the offline behaviour, and what `TC-REL-002`
(interruption during review save) actually simulates. It also determines the undo/redo scope — per
slice or per session across slices — which `FR-REV-005/006` do not state.

**Recommended resolution.** **[RECOMMENDATION]** Fold into **DR-009** (review semantics): define
session lifetime, restart behaviour, cancel semantics, variant-switch behaviour, and undo/redo scope.

**May implementation proceed before resolution?** **No for V4 (review/correction).**

---

#### RA-M11 — Reviewed-mask storage growth and the unimplementable deletion rule

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `05`, `11`, `12` |
| **Affected requirement IDs** | PR-PROV-01, FR-REV-008, NFR-REL-001, `12` §4 |

**Description.** **[SPEC]** `05` §6: "Each save creates a new immutable `ReviewedMask` version".
`05` ReviewedMask carries a single `artifact_uri` and `checksum`, implying a complete mask artifact per
save rather than a delta. **[ASSUMPTION]** For a volume on the order of 640×640×88, a full-volume mask
per save is non-trivial storage even packed, and a demo involving repeated corrections multiplies it.
**[VERIFIED]** No retention, pruning, or compaction policy exists. **[SPEC]** `12` §4 states that if an
artifact is deleted, "dependent records should be marked invalid/unavailable rather than silently
pointing to a different artifact" — but **[VERIFIED]** no deletion API, functional requirement, or
acceptance test exists anywhere, so the rule cannot be implemented or tested.

**Why it matters.** Minor for a 30-day demo, but the `11` §8 commit contract and the artifact store
layout are decided early and are expensive to change. And `12` §4's deletion rule is currently
aspirational text that no test covers.

**Recommended resolution.** **[RECOMMENDATION]** Either state explicitly that the MVP performs no
artifact deletion (making `12` §4 vacuously satisfied and testable as such), or add a deletion path with
its FR and test. Separately, decide full-artifact versus delta persistence for ReviewedMask as part of
`ADR-ART-001`.

**May implementation proceed before resolution?** **Yes**, with the choice recorded.

---

#### RA-M12 — Missing API operations the UI requires

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `04`, `10`, `11` |
| **Affected requirement IDs** | FR-REV-001, FR-FIND-001, FR-ERR-003, NFR-PERF-001, SCR-03, SCR-06, SCR-08, TC-REV-001, TC-FIND-001, TC-ERR-003 |

**Description.** **[VERIFIED]** `11` declares 28 operations. Three gaps materially affect MUST screens:

1. **No `GET /reviews/{review_id}`.** `11` §8 defines POST (create), PATCH (update), and
   `GET /reviews/{review_id}/reviewed-masks` — but no way to read the review's own state. `10` SCR-03
   must display review state and SCR-06 must display it alongside the working mask; `TC-REV-001` must
   verify transitions.
2. **No `GET /findings/{finding_id}`.** Only the list endpoint exists. `11` §9 requires that "opening a
   finding requires enough evidence identifiers for the mobile client to navigate" — implying a
   single-finding read.
3. **No ranked or batched per-slice metric endpoint.** `04` FR-ERR-003 requires jumping to
   "selected/worst/problematic slices from available per-slice metrics", but `11` §6 offers only
   `GET /analysis-runs/{run_id}/slices/{slice_index}/metrics`. **[ASSUMPTION]** For a volume with ~88
   slices this implies ~88 round-trips to find the worst slice, which collides directly with
   `NFR-PERF-001`'s prohibition on per-gesture full-volume traffic and with the demo's responsiveness.
   `11` §6 permits "equivalent batched endpoints" but does not require one.

**Why it matters.** Each gap forces the implementer to invent an operation, which `11` §11.4 and
`09` §12 exist to prevent, and gap 3 has a direct performance consequence.

**Recommended resolution.** **[RECOMMENDATION]** Add the three operations during API contract
elaboration — this is filling in the frozen contract's required semantics, not changing them — and
record the additions in the API ADR.

**May implementation proceed before resolution?** **Yes**, but the operations must exist before API
freeze.

---

#### RA-M13 — "Worst slice" is undefined under the empty-slice rule

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `04`, `07`, `10`, `13` |
| **Affected requirement IDs** | FR-ERR-003, PR-ERR-02, SCR-04, TC-ERR-003 |

**Description.** **[SPEC]** `04` FR-ERR-003 and `10` SCR-04 require a "jump-to-worst/problematic slice"
action. **[SPEC]** `07` §6's empty-slice rule assigns per-slice Dice `0` when exactly one of GT and
prediction is empty, and `NOT_APPLICABLE`/`NaN` when both are empty. **[VERIFIED]** "Worst" is never
operationalised.

**Why it matters.** Ranking by raw per-slice Dice makes every slice where the model predicted a few
stray voxels on a background slice tie at 0 with genuine anatomical failures — so a naïve "worst slice"
selector will land the user on uninformative slices, undermining the `16` §2 demo narrative. The
`NOT_APPLICABLE` slices must also be excluded from ranking, which the spec implies for the *mean* but
does not state for *ranking*.

**Recommended resolution.** **[RECOMMENDATION]** Define the ranking rule explicitly — for example, rank
only slices where the reference is non-empty, ordered by per-slice Dice ascending, with FP-voxel count
as a documented tiebreak — and have `TC-ERR-003` assert against it. Bundle with **DR-010** (outlier
definition), since both are "which case/slice do we jump to" rules.

**May implementation proceed before resolution?** **No for the jump-to-worst action.**

---

#### RA-M14 — DEMO_CASE_001 / INTEGRATION_CASE_001 promotion rule undefined; cohort shape heterogeneity unaddressed

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `06`, `13`, `14`, `15` |
| **Affected requirement IDs** | TC-E2E-001, TC-USAB-005, `13` §11, `14` §2.1, `15` §21 |

**Description.** Two related fixture problems.

**(a) Case promotion.** **[SPEC]** `13` §11 requires `DEMO_CASE_001` be selected "without choosing it
because it makes the model look artificially best", preferring a representative/median-quality case
*after* the evaluation protocol is available, and says that if selected earlier it must be labelled
`INTEGRATION_CASE_001`. **[SPEC]** `15` §21 and `13` §7 use `DEMO_CASE_001` as the continuously
evolving smoke-test subject from early on, and `14` §2.1 uses `INTEGRATION_CASE_001` for the shared-core
gate. **[VERIFIED]** No rule states when or how `INTEGRATION_CASE_001` is promoted or replaced, or
whether `TC-E2E-001` must be re-run on `DEMO_CASE_001` after promotion.

**(b) Cohort shape heterogeneity.** **[SPEC]** `06` §9 validates that MRI and mask shapes align
*per case* and that the manifest records a "volume shape distribution", but no requirement addresses the
case where **different cases have different in-plane dimensions**. **[ASSUMPTION]** If in-plane size
varies across the cohort, it affects the `07` §3 resize/crop/pad policy, the viewer's layout
assumptions, fixture construction, and whether `TC-MRI-001` generalises beyond one case.

**Why it matters.** (a) risks the final acceptance evidence being produced on a technically convenient
case rather than a representative one — the exact bias `13` §11 exists to prevent. (b) risks a viewer
built against one case's dimensions failing on others late in integration.

**Recommended resolution.** **[RECOMMENDATION]** Define the promotion rule (selection criterion,
trigger point, and whether `TC-E2E-001`/`TC-USAB-005` re-run on the promoted case) as part of the
30-day baseline. Have Spike D report the in-plane shape distribution explicitly so the resize policy and
fixtures are sized correctly.

**May implementation proceed before resolution?** **Yes** using `INTEGRATION_CASE_001`.

---

#### RA-M15 — Metric semantics have tests and prose but no requirement ID; TC-EXP-009 is orphaned

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `04`, `07`, `08`, `13` |
| **Affected requirement IDs** | TC-EXP-009, NFR-AUDIT-001, `07` §6, `08` §5 |

**Description.** **[VERIFIED]** `TC-EXP-009` ("Synthetic cases verify the exact empty/non-empty
per-slice Dice rules from `07` and case-level 3D primary metric behavior") is defined in `13` §8 but
appears in **neither** the `13` §4 product trace map **nor** the `13` §10 FR/NFR coverage map. It is the
only test in the set that maps to no requirement. **[VERIFIED]** Correspondingly, no functional
requirement in `04` states the metric semantics — the case-level-3D-primary rule and the empty-slice
rule live only as prose in `07` §6 and `08` §5.

**Why it matters.** `13` §3's execution RTM tracks work by requirement, and `NFR-AUDIT-002` counts only
ACCEPTED requirements as progress. Metric semantics — which `SPEC_AUDIT_REPORT_v1_0.md` AUD-05 called
out as a v0.1 defect and which underpin every number in the final report — have no requirement row to
be tracked, owned, or accepted against. The test exists but hangs off nothing.

**Recommended resolution.** **[RECOMMENDATION]** Spec clarification request **SCQ-06** to add a
functional requirement for metric computation semantics in `04` and map `TC-EXP-009` to it in `13` §10,
restoring the traceability chain.

**May implementation proceed before resolution?** **Yes**; affects tracking, not behaviour.

---

#### RA-M16 — No HTTP status mapping for the error codes

| Field | Value |
|---|---|
| **Severity** | **MEDIUM** |
| **Affected spec files** | `11` |
| **Affected requirement IDs** | `11` §10, PR-MOBILE-02, FR-AN-003, NFR-USAB-003, TC-MOBILE-STATE-001 |

**Description.** **[SPEC]** `11` §10 defines 15 machine-readable error codes and a standard body shape,
but **[VERIFIED]** does not map them to HTTP status codes. **[ASSUMPTION]** The client's retry logic,
error-state selection (`10` §8 distinguishes recoverable error, legitimate empty/unavailable, and
fatal/invalid data), and caching behaviour all depend on the status class. `GROUND_TRUTH_UNAVAILABLE` in
particular is semantically a *legitimate absence* (`10` §8 "empty/unavailable"), not a failure — and
whether it arrives as 404, 409, or 200-with-availability-flag changes the entire client state machine.

**Why it matters.** `TC-MOBILE-STATE-001` requires core screens to exercise loading, legitimate
unavailable/empty, processing, recoverable failure, retry, and invalid-data blocking. Without a status
mapping, backend and mobile will disagree on which codes mean which state.

**Recommended resolution.** **[RECOMMENDATION]** Add the status mapping during API contract
elaboration, before freeze; explicitly classify each code as recoverable, legitimate-absence, or fatal
so it maps onto `10` §8's state model.

**May implementation proceed before resolution?** **Yes**, but must exist before API freeze.

---

### LOW

All six are **severity LOW**: housekeeping or process-hygiene items with no material execution impact.
Each is listed with the same eight fields as the findings above, in compact form.

| ID | Affected spec file(s) | Affected requirement IDs | Description | Why it matters | Recommended resolution | Proceed? |
|---|---|---|---|---|---|---|
| **RA-L01** | `SPEC_AUDIT_REPORT_v1_0.md` §2, AUD-03 | none directly (bears on all 39 PRs and 69 TCs as reported figures) | §2 reports 44 PRs / 33 MUST (actual **39 / 28**) and 70 TC IDs in §2 vs 69 in AUD-03 (actual **69**). The frozen spec files are correct; only the report's summary counts are wrong. | The report describes an "automated consistency check" whose results are not reproducible. It was the basis of the freeze self-certification, which is why `17` §5 mandates this independent second audit. | Use the §1.1 verified counts as authoritative in every artifact; notify the spec owner of the discrepancy. | **Yes** |
| **RA-L02** | `03`, `13` §4 | PR-SCI-01, PR-SCI-02, PR-SCI-03, PR-MOBILE-03; NFR-AUDIT-001 | These four MUST product requirements map in `13` §4 to governing spec files rather than to FR IDs, so the `13` §2 chain `PR → FR → UC → task → test` breaks for them. | Legal under NFR-AUDIT-001, which covers MUST *FRs* — but these four cannot be tracked in the execution RTM the same way as the other 24 MUST PRs. | Either add FR IDs, or document them explicitly as policy requirements tracked directly by their TCs (`TC-SCI-001/002/003`, `TC-TEAM-001`). | **Yes** |
| **RA-L03** | `15` §8, `15` §20 | `13` §6 DoD item 2, NFR-MAINT-003, TC-MAINT-003 | §8 states "CI required" as an unconditional merge rule; §20 softens it to "Minimum CI before merge **once infrastructure exists**". | Ambiguous during week 1, before a stack is selected and lint/build tooling can be configured — the two readings differ on whether merges are permitted at all. | Declare in `DEVELOPMENT_WORKFLOW.md` the point from which CI is a hard gate. Raised as **SCQ-08**. | **Yes** |
| **RA-L04** | `10` §9, `10` §9.1 | NFR-USAB-001, PR-MOBILE-01 | §9 says landscape "may be supported"; §9.1 requires portrait/landscape designs "where the implemented scientific interaction depends on orientation" — a conditional MUST with a subjective trigger. | Two developers could reach different conclusions about whether a given screen owes a landscape design, affecting the `16` §5.1 CLO1 design-artifact evidence. | Decide per screen during UX design and record the decision with its rationale. | **Yes** |
| **RA-L05** | `11` §3 | FR-STUDY-001, PR-STUDY-01 | No `GET /api/v1/studies` list operation exists; only `GET /studies/{study_id}`. | Harmless while the study is a singleton (`01` §8 places arbitrary study creation OUT of scope), but the client must obtain `study_id` from somewhere and nothing says where. | State how the client learns `study_id`; a configuration constant is acceptable and needs no new endpoint. | **Yes** |
| **RA-L06** | `00` §11, `07` §12, `17` §5 Step 2 | GATE-MOB-01, NFR-PERF-001..004, NFR-USAB-005 | `00` §11 says "**Claude** must run two technical spikes"; `17` §5 Step 2 assigns them to "Technical Architect + Implementation". Claude cannot run a build on a handset, measure on-device FPS or touch latency, or perform manual touch testing. | Spikes A/B/E/F cannot be assigned to a named owner in the 30-day plan without appearing to contradict one of the two files. | Assign Spikes A/B/E/F to named human owners on the declared device; Claude builds harnesses, fixtures and instrumentation and analyses results. Raised as **SCQ-09**. | **Yes** |

---

## 3. Audit-area coverage (A–Q)

Every mandated area has an explicit entry. Where the specification is sound, that is stated.

| # | Area | Findings | Assessment |
|---|---|---|---|
| **A** | Product consistency | RA-L01 | **Sound.** `00` §8's seven signature interactions, `01` §8's MUST list, and `03`'s requirements agree. All 22 `01` §8 MUST items map to a PR except the one caught by RA-H03. Mode rules (`00` §7, `02` §5) are consistent across all files. |
| **B** | Functional requirement completeness | RA-H03, RA-H09, RA-M12, RA-M13, RA-M15 | Structurally complete (79 FR/NFR, 100% test-covered), with five behavioural gaps where a required *behaviour* has no operational definition. |
| **C** | Non-functional completeness | RA-H13, RA-H14, RA-M16 | **Largely sound** — `04`'s NFRs are measurable and device-anchored, a genuine improvement over typical student specs. Gaps are the unbudgeted first-load/transport path and mesh size. |
| **D** | Domain/data-model consistency | RA-H08, RA-M05, RA-M06, RA-M07, RA-M08, RA-M11 | Weakest area. The provenance *invariants* (`05` §4) are excellent; the *entity definitions* have six defects, several of which are internal contradictions within `05` itself. |
| **E** | Dataset assumptions and provenance | RA-H01, RA-H02, RA-M02, RA-M14(b) | **Procedurally sound** — `06`'s acquisition and geometry gates are exactly right. All findings are *open unknowns pending Spike D*, not specification defects. |
| **F** | ML feasibility and scientific validity | RA-H06, RA-H16, RA-M01, RA-M09 | Protocol design is strong (nested subsets, frozen recipes, `EXP-D-PP` derived from `EXP-D-100`, failed-case protocol, PR-SCI-03). Gaps: no compute spike, one unspecified confound, no uncertainty reporting. |
| **G** | Image processing / 2D-3D coordinates | **RA-B01**, RA-H07, RA-H11, RA-H14, RA-M02 | Highest technical risk. `07` §8's invariants and `09` §6's conformance-fixture mandate are the right controls, but the underlying conventions and tolerances are not fixed, and the 3D-error pipeline is absent. |
| **H** | Mobile interaction feasibility | RA-H05, RA-L04 | **Sound.** `10` is specific about gesture-mode separation, coordinate rules, and state model. The one structural defect is the device-declaration circularity. |
| **I** | Brush correction feasibility | RA-H08, RA-M10, RA-M11 | The immutability/versioning model is correct and well-specified. Session-lifetime and variant-scope semantics are the gaps. |
| **J** | API completeness | RA-H03, RA-H04, RA-M12, RA-M16, RA-L05 | 28 operations covering most semantics. Gaps: ingestion, auth surface, three UI-required reads, status mapping. |
| **K** | Backend/mobile/ML integration contracts | RA-H03, RA-H07, RA-M03, RA-M12 | `09` §12 and `11` §11 are the right governance. The contracts they govern have the gaps above. |
| **L** | Privacy and data governance | RA-H17, RA-M11 | **Strong.** `12` is proportionate: metadata allowlist, two deployment profiles, log rules, cache versioning, an acceptance gate. Only the redistribution question and the untestable deletion rule are open. |
| **M** | Requirement → acceptance-test traceability | RA-L01, RA-L02, RA-M15 | **Verified complete**: 79/79 FR/NFR covered, 39/39 PRs mapped, no dangling IDs. Only defects are one orphan test and four policy PRs without FRs. |
| **N** | Individual mobile-function requirements | RA-M04 | **Sound and course-aligned.** `14` §3's V1–V4, `14` §4's evidence package, `16` §5.1's CLO trace, and `TC-TEAM-001` cover the rubric. Gap is the *additional* non-mobile ownership axis. |
| **O** | Git/team execution rules | RA-L03 | **Sound.** `15` §8–§11 (protected main, one branch owner, squash default, sync rule, collision detection, WIP limit, review windows) is more disciplined than typical and needs no change. |
| **P** | 30-day feasibility risks | RA-H10, RA-M03, RA-M04, plus RISK-CAP-01 | The binding constraints are MUST scope volume and sequencing, not team capability. See `RISK_REGISTER_INITIAL.md`. |
| **Q** | Decisions requiring spikes before architecture freeze | RA-H01, RA-H05, RA-H06, RA-H13, **RA-B01** | Two spikes are specified; four more are required by gates the spec sets. See `TECHNICAL_SPIKES_REQUIRED.md`. |

---

## 4. Finding summary

| Severity | Count | IDs |
|---|---:|---|
| **BLOCKER** | 1 | RA-B01 |
| **HIGH** | 15 | RA-H01, H02, H03, H04, H05, H06, H07, H08, H09, H10, H11, H13, H14, H16, H17 |
| **MEDIUM** | 16 | RA-M01 … RA-M16 |
| **LOW** | 6 | RA-L01 … RA-L06 |
| **Total** | **38** | |

Conditional findings: **RA-H04** and **RA-H17** are material only if `REMOTE_DEMO` is selected.
**RA-H01** escalates to BLOCKER only if an actual dataset download/access failure is recorded.
**RA-M02** escalates only if Spike D finds unsupported geometry in the obtained package.

---

## 5. What this audit did not do

- It did not modify any file under `docs/specs/v1.0/`. Integrity re-verified after writing: 19/19 OK.
- It did not create a 30-day plan, a daily plan, a repository structure, or an ADR.
- It did not select a technology stack.
- It did not resolve any controlled gate from `00` §11.1.
- It did not assert any fact about the dataset package beyond the verified state "not yet obtained" —
  specifically, no claim about access lead time and no claim about whether the 54 test labels exist.

**Related documents:** `OPEN_DECISIONS.md` · `TECHNICAL_SPIKES_REQUIRED.md` ·
`RISK_REGISTER_INITIAL.md` · `SPEC_CLARIFICATION_REQUESTS.md` · `IMPLEMENTATION_READINESS_STATUS.md`
