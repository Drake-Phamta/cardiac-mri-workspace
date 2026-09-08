# 13 — TEST, ACCEPTANCE, AND TRACEABILITY

**Status:** Frozen v1.0  
**Depends on:** `00`–`12`

---

## 1. Principle

A feature is not complete because code exists. Formal progress counts only work that is **ACCEPTED** through requirement, test, review, functional, integration, and product-quality evidence appropriate to its risk.

The v1.0 audit closes the previous gap where `NFR-AUDIT-001` required test coverage for every MUST functional requirement but only a small critical-test subset had been enumerated.

---

## 2. Traceability chain

Preferred chain:

`Product Requirement → Functional/NFR → Use Case → UI/API/Module → Implementation Task → Acceptance Test → PR/Commit → Demo Evidence`

Example:

`PR-3D-04 → FR-3D-005/006 → UC-08 → SCR-05 + geometry contract → D12-T03 → TC-3D-004 → PR #... → demo evidence`

---

## 3. Execution RTM schema

Claude Project Control shall maintain `management/REQUIREMENTS_TRACEABILITY_MATRIX.md` (or equivalent machine-readable representation) with at least:

| Requirement | Priority | Child FR/NFR | Use Case | Owner | Implementation | Test | Status | Evidence |
|---|---|---|---|---|---|---|---|---|

Statuses:

- `NOT_STARTED`
- `READY`
- `IN_PROGRESS`
- `PR_OPEN`
- `IN_REVIEW`
- `NEEDS_FIX`
- `BLOCKED`
- `ACCEPTED`

Only `ACCEPTED` counts as complete.

---

## 4. Frozen product-requirement trace map

This is the baseline semantic map. Claude may add implementation links/owners but may not remove coverage silently.

| Product requirement | Priority | FR/NFR / governing spec | Use case / UI | Acceptance test family |
|---|---|---|---|---|
| PR-STUDY-01 | MUST | FR-STUDY-001 | UC-01 / SCR-01 | TC-STUDY-001 |
| PR-COHORT-01 | MUST | FR-EXP-002/003 | UC-01,10,11 / SCR-01,07 | TC-EXP-002/003 |
| PR-COHORT-02 | MUST | FR-EXP-006, FR-ERR-003 | UC-12 | TC-EXP-006, TC-ERR-003 |
| PR-CASE-01 | MUST | FR-CASE-001 | UC-02 / SCR-02 | TC-CASE-001 |
| PR-CASE-02 | MUST | FR-CASE-002 | UC-02,16 / SCR-02,03 | TC-CASE-002 |
| PR-MRI-01 | MUST | FR-MRI-001..007 | UC-03 / SCR-03 | TC-MRI-001..003 |
| PR-PRED-01 | MUST | FR-MASK-001/003/005 | UC-04 / SCR-03 | TC-MASK-001/003 |
| PR-IMG-01 | MUST | FR-MASK-004 | UC-04 | TC-MASK-004 |
| PR-ERR-01 | MUST | FR-ERR-001/002 | UC-05 / SCR-04 | TC-ERR-001/002 |
| PR-ERR-02 | MUST | FR-ERR-003, FR-EXP-006 | UC-05,12 | TC-ERR-003, TC-EXP-006 |
| PR-ERR-03 | MUST | FR-3D-007/008 | UC-09 / SCR-05 | TC-3D-005 |
| PR-3D-01 | MUST | FR-3D-001 | UC-06 | TC-3D-001 |
| PR-3D-02 | MUST | FR-3D-002 | UC-06 | TC-3D-002 |
| PR-3D-03 | MUST | FR-3D-003/004 | UC-07 | TC-3D-003 |
| PR-3D-04 | MUST | FR-3D-005/006 | UC-08 | TC-3D-004 |
| PR-3D-05 | MUST | FR-3D-007/008 | UC-09 | TC-3D-005 |
| PR-EXP-01 | MUST | FR-EXP-001/002 | UC-10 | TC-EXP-001/002 |
| PR-EXP-02 | MUST | FR-EXP-002/003/006, NFR-REP-004 | UC-10 | TC-EXP-003/006/007 |
| PR-EXP-03 | MUST | FR-EXP-004 | UC-11 | TC-EXP-004 |
| PR-EXP-04 | MUST | FR-EXP-005 | UC-11 | TC-EXP-005 |
| PR-AN-01 | SHOULD | FR-AN-001..004 | SCR-09 | TC-AN-001 (if activated) |
| PR-REV-01 | MUST | FR-REV-001 | UC-13 | TC-REV-001 |
| PR-REV-02 | MUST | FR-REV-002..008/011 | UC-14 / SCR-06 | TC-REV-002..005 |
| PR-PROV-01 | MUST | FR-REV-008..010, NFR-REL-001 | UC-14 | TC-REV-005/006 |
| PR-FIND-01 | MUST | FR-FIND-001..004 | UC-15 / SCR-08 | TC-FIND-001/002 |
| PR-MODE-01 | MUST | FR-MASK-002, FR-ERR-004 | UC-16 | TC-MODE-001 |
| PR-SCI-01 | MUST | 00,06,08,12 reporting boundary | — | TC-SCI-001 |
| PR-SCI-02 | MUST | 06 geometry gate, 07 metric semantics | — | TC-SCI-002 |
| PR-SCI-03 | MUST | 07/08 scientific protocol | — | TC-SCI-003 |
| PR-MOBILE-01 | MUST | NFR-USAB-001/002/005 + core FRs | canonical journey | TC-E2E-001 |
| PR-MOBILE-02 | MUST | 10 state model, NFR-REL-002 | all core screens | TC-MOBILE-STATE-001 |
| PR-MOBILE-03 | MUST | 14/16 team evidence | member-owned function | TC-TEAM-001 |
| PR-PRIV-01 | MUST | NFR-SEC-001/005, 12 | — | TC-SEC-001/005 |
| PR-PRIV-02 | MUST | NFR-SEC-003/005, 12 | — | TC-SEC-003/005 |
| PR-COMP-01 | SHOULD | activate by DR | UC-10 | add tests if activated |
| PR-METRIC-01 | SHOULD | 07/08 HD95 gate | — | TC-METRIC-001 if activated |
| PR-REVAN-01 | SHOULD | 08 human review metrics | — | add tests if activated |
| PR-FILTER-01 | SHOULD | API/UI extension | UC-02/15 | add tests if activated |
| PR-CACHE-01 | SHOULD | 10/12 caching | — | add tests if activated |
| PR-MODEL-EXTRA-01 | COULD | DR required | — | add tests if activated |
| PR-COLLAB-01 | COULD | DR required | — | add tests if activated |
| PR-ANN-ADV-01 | COULD | DR required | — | add tests if activated |
| PR-STUDY-CREATE-01 | COULD | DR required | — | add tests if activated |
| PR-EXP-SCHED-01 | COULD | DR required | — | add tests if activated |

---

## 5. Definition of Ready (DoR)

A task is READY only when:

- requirement IDs are known;
- objective/output are clear;
- dependencies are satisfied or mocked through an **accepted versioned contract/fixture**;
- acceptance criteria exist;
- owner and reviewer are assigned;
- module/file boundary is known;
- test expectation is defined;
- no unresolved product/spec decision gate blocks the task;
- task is small enough to produce a reviewable same-day deliverable, or has an approved daily checkpoint if inherently multi-day.

---

## 6. Definition of Done (DoD)

A task can become ACCEPTED only when:

1. implementation completed;
2. relevant automated tests pass;
3. code review passes;
4. manual functional verification passes where required;
5. integration behavior passes;
6. requirement acceptance criteria pass;
7. no critical privacy/security/scientific-validity violation exists;
8. evidence/PR links are recorded;
9. `main` remains runnable/integrated;
10. any introduced technical debt is recorded and does not invalidate a MUST acceptance criterion.

---

## 7. Test layers

### Unit tests

High priority for:

- metric functions and empty-slice semantics;
- geometry transforms;
- mask/morphology operations;
- brush coordinate transforms;
- review state transitions/versioning;
- experiment config/split validation.

### Integration tests

High priority for:

- mobile ↔ API schemas;
- backend ↔ artifact store;
- backend ↔ inference worker when live analysis is enabled;
- common geometry fixtures across backend/mobile;
- saving/reloading reviewed masks;
- experiment comparison compatibility gate.

### End-to-end / smoke tests

Use `DEMO_CASE_001` and the frozen canonical flow.

### Manual UX/performance tests

Required for:

- touch navigation;
- zoom/pan;
- brush accuracy/usability;
- 3D interaction;
- error/loading/retry states;
- NFR performance on the declared demo device.

---

## 8. Functional acceptance test catalog

### Study / case

**TC-STUDY-001 — Study overview contract**  
Study Overview loads dataset identity, case/experiment capability summary and navigates to cases/experiments without fabricated metrics.

**TC-CASE-001 — De-identified case list**  
Only internal de-identified IDs/allowed technical fields are shown; selecting a case opens the correct case.

**TC-CASE-002 — Mode capability**  
A case's `ground_truth_available`/mode capability is reflected consistently in case list, case detail and enabled UI capabilities.

### MRI viewer

**TC-MRI-001 — Slice correctness**  
Known source slice `k` displays the expected MRI data and correct `k / total` index.

**TC-MRI-002 — Navigation/gesture synchronization**  
Slider/swipe changes active slice deterministically; edit mode does not accidentally trigger conflicting navigation.

**TC-MRI-003 — Viewer run/case synchronization**  
Changing case/run cannot leave an overlay/metric from the previous case/run visible as current evidence.

### Mask/overlay

**TC-MASK-001 — Overlay alignment**  
Prediction/ground-truth/reviewed overlay remains spatially aligned through zoom/pan and uses the shared geometry mapping.

**TC-MASK-002 — Ground-truth availability**  
Ground-truth layer cannot be requested/displayed when unavailable.

**TC-MASK-003 — Overlay controls**  
Prediction toggle and opacity behave predictably without changing underlying mask geometry.

**TC-MASK-004 — Raw/processed provenance**  
Switching raw vs processed displays the requested exact mask variant; UI/API identifiers and metrics do not silently substitute one for the other.

### Error investigation

**TC-ERR-001 — Error-class derivation**  
On a synthetic known mask pair, overlap/FP/FN classification matches expected boolean mask operations.

**TC-ERR-002 — 2D error visualization semantics**  
Legend and rendered classes correspond to the computed error data and reference/prediction IDs.

**TC-ERR-003 — Error → evidence navigation**  
A known problematic/worst slice entry opens the correct case/run/slice and preserves context.

**TC-MODE-001 — Ground-truth gating**  
Inference-only case cannot show Dice/IoU/FP/FN/2D-or-3D GT error controls; UI shows a truthful unavailable state.

### 3D / geometry

**TC-3D-001 — Reconstruction provenance**  
Mesh/reconstruction is generated from the declared exact source mask and retains geometry/version metadata.

**TC-3D-002 — Mobile 3D interaction**  
Canonical mesh supports rotate/zoom/pan without changing source mapping; performance also passes `TC-PERF-002`.

**TC-3D-003 — 2D→3D linkage**  
Known slice `k` moves plane/indicator to the expected location from the shared geometry fixture.

**TC-3D-004 — 3D→2D linkage**  
Known mesh/world test points resolve to the expected slice index within the fixture's defined tolerance, including after camera rotate/zoom.

**TC-3D-005 — 3D error → contributing slice**  
Known error-region fixture identifies the correct error semantics and navigates to one or more expected source slices.

### Review / brush

**TC-REV-001 — Review state transitions**  
Valid transitions succeed; invalid/stale transitions fail without losing state/audit history.

**TC-REV-002 — Brush add/erase**  
Add/erase modify only the intended working-mask pixels; ground truth is not an implicit editable source.

**TC-REV-003 — Brush transform**  
After zoom/pan, drawing at known screen coordinates changes the expected source-mask pixel region.

**TC-REV-004 — Undo/redo/reset**  
Undo/redo reproduce edit history; reset returns working mask to the exact declared source mask for the unsaved session.

**TC-REV-005 — Save/reload version**  
Save creates a new ReviewedMask version; reloading reproduces saved edits and identifies its exact source mask.

**TC-REV-006 — Prediction immutability**  
Raw/processed source mask checksums remain unchanged after correction saves; prior reviewed-mask versions remain immutable.

### Findings

**TC-FIND-001 — Evidence-linked create/open**  
Created finding preserves study/case/run/slice/optional region references and opening it returns to the strongest available evidence context.

**TC-FIND-002 — Finding integrity**  
Finding note/type/status updates do not alter source MRI/prediction/metric artifacts; invalid type/status is rejected.

### Experiments / analytics

**TC-EXP-001 — Experiment provenance**  
Experiment manifest contains model/config, split/subset, preprocessing/post-processing, seed/checkpoint/code/evaluation identities required by `08`.

**TC-EXP-002 — Per-case metrics persisted**  
Saved per-case values reference exact prediction/reference masks and match recomputation on a fixture/sample.

**TC-EXP-003 — Cohort aggregation**  
Mean/median/std/count/outlier summary is recomputed from persisted per-case values and reports intended/successful N.

**TC-EXP-004 — Data-scarcity matrix**  
25/50/100 UNet/DINOv2 runs exist with same frozen subset membership for corresponding fractions and same fixed evaluation population.

**TC-EXP-005 — Post-processing ablation**  
Raw-vs-processed DINOv2 comparison uses the exact same raw predictions/checkpoint and one frozen deterministic post-processing configuration.

**TC-EXP-006 — Analytics → case evidence**  
Selecting a case/outlier from experiment/cohort analytics opens the corresponding run/case evidence rather than a disconnected static chart.

**TC-EXP-007 — Comparison compatibility gate**  
Runs with mismatched split/population/evaluation version/prediction variant/reference policy are labeled non-comparable; compatible runs pass all checks.

**TC-EXP-008 — No split leakage**  
No case appears across train/validation/test partitions; subset manifests satisfy nested/paired rules.

**TC-EXP-009 — Empty-slice metric semantics**  
Synthetic cases verify the exact empty/non-empty per-slice Dice rules from `07` and case-level 3D primary metric behavior.

### Optional live analysis

**TC-AN-001 — Analysis-run lifecycle (SHOULD)**  
If `PR-AN-01` is activated, compatible run creation yields a traceable `QUEUED/RUNNING/SUCCEEDED|FAILED` lifecycle, retry auditability, immutable output reference and truthful UI state.

---

## 9. Non-functional acceptance test catalog

### Performance

**TC-PERF-001** — 30-step cached slice navigation meets `NFR-PERF-001` p95 ≤ 200 ms and avoids full-volume request per gesture.  
**TC-PERF-002** — Canonical 3D interaction meets `NFR-PERF-002` target on declared demo device.  
**TC-PERF-003** — Brush feedback/stroke integrity meets `NFR-PERF-003`.  
**TC-PERF-004** — Async run/reconstruction request creation and non-freezing state behavior meets `NFR-PERF-004` when applicable.

### Reliability

**TC-REL-001** — Checksums prove MRI/GT/raw prediction immutability through ordinary app workflows.  
**TC-REL-002** — Simulated network/app interruption during review save cannot silently corrupt a persisted reviewed artifact; retry is safe.  
**TC-REL-003** — Geometry-version mismatch is rejected/marked unavailable rather than rendered as aligned data.

### Usability

**TC-USAB-001** — Core flow is operable with touch controls on declared target device.  
**TC-USAB-002** — Brush vs navigation gesture modes do not cause accidental edits/navigation in the scripted UX test.  
**TC-USAB-003** — Ground-truth-unavailable state is understandable and not visually equivalent to zero error.  
**TC-USAB-004** — Primary controls satisfy selected platform touch-target guidance or approved exceptions.  
**TC-USAB-005** — Canonical end-to-end flow succeeds 5 consecutive times on target demo device/build.

### Security / privacy

**TC-SEC-001** — App/database UI model can operate without direct patient identity and test fixture contains only allowed de-identified IDs.  
**TC-SEC-002** — REMOTE_DEMO uses TLS; LOCAL_DEMO exposure matches its approved trusted-network profile.  
**TC-SEC-003** — Log inspection verifies no raw image/mask payloads, credentials or unnecessary sensitive metadata in ordinary logs.  
**TC-SEC-004** — Repository/mobile bundle secret scan passes; no committed privileged credentials.  
**TC-SEC-005** — Dataset metadata allowlist rejects/removes unexpected direct-identifier fixture fields from app-visible metadata.

### Reproducibility

**TC-REP-001** — Reported experiment can resolve exact config/checkpoint/split/subset/pre/postprocess/code/evaluation versions.  
**TC-REP-002** — Patient-level split + leakage test passes.  
**TC-REP-003** — Metric response/report declares aggregation level/evaluation population and intended/successful N.  
**TC-REP-004** — Comparable-run validator enforces all compatibility conditions.

### Maintainability / auditability

**TC-MAINT-001** — Repository/module ownership map identifies boundaries and integration-sensitive files; parallel task collision check can use it.  
**TC-MAINT-002** — Backend/mobile geometry implementations pass the same canonical fixture set; no untested duplicate semantics.  
**TC-MAINT-003** — Risk-critical modules have automated tests registered in CI.  
**TC-AUDIT-001** — Every MUST FR/NFR appears in the FR/NFR coverage map below and in execution RTM before acceptance.  
**TC-AUDIT-002** — Project progress calculation includes only `ACCEPTED` items; implemented/in-review work is not counted as completed.

### Scientific/report/course gates

**TC-SCI-001** — Report/demo wording explicitly states LASC 2018 implementation dataset/protocol and does not label metrics as direct LAScarQS reproduction.  
**TC-SCI-002** — Any absolute mL/physical-distance metric is blocked until geometry validation status permits it.  
**TC-SCI-003** — Final report/result tables are generated from the frozen evaluation artifacts and preserve observed model ordering; no selective case removal/tuning is used to force DINOv2 superiority.  
**TC-TEAM-001** — Four member evidence packages each contain analysis/design/UI/implementation/test/privacy/defense proof for at least one mobile function plus shared-core readiness.  
**TC-MOBILE-STATE-001** — Core screens exercise loading, legitimate unavailable/empty, processing where applicable, recoverable failure, retry and invalid-data blocking behavior.  
**TC-E2E-001** — Canonical mobile investigation flow reaches MRI → prediction → evidence/error → 3D → linked navigation → review/brush → persisted reviewed artifact on current `main`.

**TC-METRIC-001 — HD95 (SHOULD)**  
If `PR-METRIC-01` is activated, validate the chosen HD95 implementation against a known surface-distance fixture under validated physical spacing.

---

## 10. FR/NFR coverage map

Every functional/non-functional requirement is listed explicitly. `FR-AN-*` is SHOULD; all other entries inherit MUST unless otherwise stated in `04`.

| Requirement | Acceptance test(s) |
|---|---|
| FR-STUDY-001 | TC-STUDY-001 |
| FR-CASE-001 | TC-CASE-001 |
| FR-CASE-002 | TC-CASE-002, TC-MODE-001 |
| FR-CASE-003 | TC-CASE-002, TC-REL-003 |
| FR-MRI-001 | TC-MRI-001 |
| FR-MRI-002 | TC-MRI-002 |
| FR-MRI-003 | TC-MRI-002 |
| FR-MRI-004 | TC-MRI-002, TC-PERF-001 |
| FR-MRI-005 | TC-MASK-001, TC-REV-003 |
| FR-MRI-006 | TC-MRI-001 |
| FR-MRI-007 | TC-MRI-003 |
| FR-MASK-001 | TC-MASK-003 |
| FR-MASK-002 | TC-MASK-002, TC-MODE-001 |
| FR-MASK-003 | TC-MASK-003 |
| FR-MASK-004 | TC-MASK-004 |
| FR-MASK-005 | TC-MASK-001 |
| FR-ERR-001 | TC-ERR-001 |
| FR-ERR-002 | TC-ERR-002 |
| FR-ERR-003 | TC-ERR-003 |
| FR-ERR-004 | TC-MODE-001 |
| FR-3D-001 | TC-3D-001 |
| FR-3D-002 | TC-3D-002, TC-PERF-002 |
| FR-3D-003 | TC-3D-003 |
| FR-3D-004 | TC-3D-003 |
| FR-3D-005 | TC-3D-004 |
| FR-3D-006 | TC-3D-004 |
| FR-3D-007 | TC-3D-005 |
| FR-3D-008 | TC-3D-005 |
| FR-REV-001 | TC-REV-001 |
| FR-REV-002 | TC-REV-002 |
| FR-REV-003 | TC-REV-002 |
| FR-REV-004 | TC-REV-002 |
| FR-REV-005 | TC-REV-004 |
| FR-REV-006 | TC-REV-004 |
| FR-REV-007 | TC-REV-004 |
| FR-REV-008 | TC-REV-005 |
| FR-REV-009 | TC-REV-006, TC-REL-001 |
| FR-REV-010 | TC-REV-005, TC-REV-006 |
| FR-REV-011 | TC-REV-003 |
| FR-FIND-001 | TC-FIND-001 |
| FR-FIND-002 | TC-FIND-001 |
| FR-FIND-003 | TC-FIND-002 |
| FR-FIND-004 | TC-FIND-002 |
| FR-EXP-001 | TC-EXP-001 |
| FR-EXP-002 | TC-EXP-002 |
| FR-EXP-003 | TC-EXP-003 |
| FR-EXP-004 | TC-EXP-004, TC-EXP-008 |
| FR-EXP-005 | TC-EXP-005 |
| FR-EXP-006 | TC-EXP-006 |
| FR-AN-001 | TC-AN-001 (SHOULD) |
| FR-AN-002 | TC-AN-001 (SHOULD) |
| FR-AN-003 | TC-AN-001 (SHOULD) |
| FR-AN-004 | TC-AN-001 (SHOULD) |
| NFR-PERF-001 | TC-PERF-001 |
| NFR-PERF-002 | TC-PERF-002 |
| NFR-PERF-003 | TC-PERF-003 |
| NFR-PERF-004 | TC-PERF-004 |
| NFR-REL-001 | TC-REL-001, TC-REV-006 |
| NFR-REL-002 | TC-REL-002 |
| NFR-REL-003 | TC-REL-003 |
| NFR-USAB-001 | TC-USAB-001, TC-E2E-001 |
| NFR-USAB-002 | TC-USAB-002 |
| NFR-USAB-003 | TC-USAB-003, TC-MODE-001 |
| NFR-USAB-004 | TC-USAB-004 |
| NFR-USAB-005 | TC-USAB-005 |
| NFR-SEC-001 | TC-SEC-001 |
| NFR-SEC-002 | TC-SEC-002 |
| NFR-SEC-003 | TC-SEC-003 |
| NFR-SEC-004 | TC-SEC-004 |
| NFR-SEC-005 | TC-SEC-005 |
| NFR-REP-001 | TC-REP-001 |
| NFR-REP-002 | TC-REP-002, TC-EXP-008 |
| NFR-REP-003 | TC-REP-003 |
| NFR-REP-004 | TC-REP-004, TC-EXP-007 |
| NFR-MAINT-001 | TC-MAINT-001 |
| NFR-MAINT-002 | TC-MAINT-002 |
| NFR-MAINT-003 | TC-MAINT-003 |
| NFR-AUDIT-001 | TC-AUDIT-001 |
| NFR-AUDIT-002 | TC-AUDIT-002 |

---
## 11. Canonical demo case and fixtures

Before broad integration, select one validated case as `DEMO_CASE_001` **without choosing it because it makes the model look artificially best**. Prefer a representative/median-quality case after the evaluation protocol is available; if selected earlier for technical integration, label it `INTEGRATION_CASE_001` until its representativeness is known.

Maintain synthetic canonical fixtures in addition to real MRI data for deterministic tests:

- geometry fixture with known voxel↔world↔slice points;
- small binary mask pair with known TP/FP/FN/Dice/IoU;
- brush transform fixture;
- experiment-compatibility fixture.

Daily evolving smoke flow:

`load case → browse slices → prediction overlay → metrics/error → 3D → linked navigation → review/brush → saved reviewed artifact`

---

## 12. Quality gate severity

### P0 / Critical

- data leakage;
- corrupted/misaligned masks/geometry;
- raw prediction overwritten;
- 2D/3D mapping wrong in accepted build;
- app cannot run integrated MUST path;
- privacy/secrets incident;
- falsified/misrepresented scientific metric/comparison.

### P1 / High

- core MUST workflow broken;
- major performance/UX failure in canonical demo;
- missing validation/provenance gating;
- repeatable reviewed-mask corruption/save failure.

### P2 / Medium

- non-critical usability/visual defect;
- SHOULD feature defect;
- documented workaround exists without corrupting evidence.

### P3 / Low

- polish/stretch issue.

P0/P1 issues on critical path override planned SHOULD/COULD work.

---

## 13. Milestone acceptance

No milestone is accepted based only on task count. It must pass its defined integrated acceptance scenario and requirement coverage threshold.

Minimum final MVP acceptance requires:

- all un-de-scoped MUST product requirements ACCEPTED;
- all mapped MUST FR/NFR tests passing or explicitly accepted with documented non-material exception through Decision Request;
- zero open P0;
- zero open P1 that breaks the canonical demo or scientific validity;
- `TC-USAB-005`, `TC-E2E-001`, `TC-TEAM-001`, `TC-SCI-001`, `TC-SCI-002`, and `TC-SCI-003` passing;
- main branch reproducibly builds/runs from documented setup.
