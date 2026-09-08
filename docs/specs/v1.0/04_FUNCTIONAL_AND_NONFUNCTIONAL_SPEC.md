# 04 — FUNCTIONAL AND NON-FUNCTIONAL SPECIFICATION

**Status:** Frozen v1.0  
**Depends on:** `00`–`03`

---

## 0. Priority and verification rule

- Functional requirements are **MUST** unless explicitly marked `SHOULD` or `COULD`. All NFRs in this file are **MUST** unless explicitly stated otherwise.
- A functional requirement is not ACCEPTED until its mapped acceptance test(s) in `13` pass.
- Optional PRD items activated later require either an existing functional requirement or an approved Decision Request adding one before implementation.

## 1. Functional requirements

### Study / Case

**FR-STUDY-001** — The system shall return study metadata including dataset identity, available experiments, case counts, and capability status.  
**FR-CASE-001** — The system shall list de-identified cases.  
**FR-CASE-002** — Each case shall expose whether ground truth is available.  
**FR-CASE-003** — Case details shall expose volume metadata needed by the mobile client and geometry pipeline.

### MRI viewer

**FR-MRI-001** — The mobile client shall display a selected MRI slice from a 3D case volume.  
**FR-MRI-002** — The user shall navigate slices by slider.  
**FR-MRI-003** — The user shall navigate slices by swipe/gesture where it does not conflict with active editing gestures.  
**FR-MRI-004** — The viewer shall support pinch-to-zoom and pan.  
**FR-MRI-005** — The viewer shall preserve correct image-to-mask coordinate mapping after zoom/pan.  
**FR-MRI-006** — Slice index and total slice count shall be visible.  
**FR-MRI-007** — Viewer state shall remain synchronized with the active case and analysis run.

### Overlay / mask

**FR-MASK-001** — Prediction overlay can be toggled on/off.  
**FR-MASK-002** — Ground-truth overlay can be toggled only when ground truth exists.  
**FR-MASK-003** — Overlay opacity shall be adjustable.  
**FR-MASK-004** — Raw and processed prediction may be selected when both artifacts exist.  
**FR-MASK-005** — Overlays must use the validated geometry mapping and must not be stretched independently of MRI geometry.

### Error inspector

**FR-ERR-001** — When ground truth exists, the system shall derive pixel/voxel disagreement classes from prediction and ground truth.  
**FR-ERR-002** — The 2D viewer shall visualize at least overlap/correct region, false positive, and false negative or an equivalent clearly documented scheme.  
**FR-ERR-003** — The user shall jump to selected/worst/problematic slices from available per-slice metrics.  
**FR-ERR-004** — When ground truth is absent, error-specific controls and metrics shall be unavailable with an explanatory state rather than fabricated values.

### 3D reconstruction and linked navigation

**FR-3D-001** — The system shall generate a 3D surface/volume representation from a valid LA mask volume using a documented reconstruction method.  
**FR-3D-002** — Mobile 3D view shall support rotate, zoom, and pan.  
**FR-3D-003** — The active 2D slice shall map to a valid z/plane position in 3D using the shared coordinate transform.  
**FR-3D-004** — Changing the 2D slice shall update the 3D plane/indicator.  
**FR-3D-005** — A valid 3D selection shall resolve to an MRI slice index.  
**FR-3D-006** — After a 3D selection resolves to a slice, the 2D viewer shall navigate to that slice.  
**FR-3D-007** — When ground truth exists, the system shall generate a 3D error representation from prediction-vs-ground-truth disagreement.  
**FR-3D-008** — Selecting an error region shall provide navigation to one or more contributing slices.

### Review / brush correction

**FR-REV-001** — Review state shall support: NOT_REVIEWED, ACCEPTED, FLAGGED, CORRECTED.  
**FR-REV-002** — Correction mode shall support brush-add.  
**FR-REV-003** — Correction mode shall support brush-erase.  
**FR-REV-004** — Brush size shall be adjustable within a bounded useful range.  
**FR-REV-005** — Correction mode shall support undo.  
**FR-REV-006** — Correction mode shall support redo.  
**FR-REV-007** — Correction mode shall support reset-to-source-prediction for the current unsaved edit session.  
**FR-REV-008** — Saved correction shall create a new reviewed-mask artifact.  
**FR-REV-009** — Saving correction shall never mutate the original prediction artifact.  
**FR-REV-010** — Reviewed masks shall record provenance including source prediction, case, run, timestamp, and available reviewer identifier.  
**FR-REV-011** — Brush coordinates shall remain correct after zoom/pan.

### Findings

**FR-FIND-001** — User can create a finding from experiment/case/slice context.  
**FR-FIND-002** — Finding may reference an optional region/spatial coordinate.  
**FR-FIND-003** — Finding shall support a small segmentation-oriented type set such as under-segmentation, over-segmentation, boundary disagreement, disconnected artifact, other.  
**FR-FIND-004** — Finding shall preserve evidence references and note text without altering source artifacts.

### Experiments / analytics

**FR-EXP-001** — System shall represent each experiment configuration with model, data fraction, preprocessing, post-processing, split/version, and evaluation metadata.  
**FR-EXP-002** — System shall store/serve per-case metrics for compatible evaluation runs.  
**FR-EXP-003** — System shall calculate/serve aggregate cohort statistics from per-case results.  
**FR-EXP-004** — System shall expose experiment comparison for UNet vs DINOv2 under 25%, 50%, 100% labeled-data configurations.  
**FR-EXP-005** — System shall expose raw-vs-post-processing DINOv2 ablation results.  
**FR-EXP-006** — User shall be able to open case evidence from experiment/cohort results.

### Inference / analysis execution

**FR-AN-001 — SHOULD** — User or system shall be able to create an analysis run for a compatible case/model configuration as defined by implementation architecture.  
**FR-AN-002 — SHOULD** — Long-running analysis shall expose state: QUEUED/RUNNING/SUCCEEDED/FAILED (or equivalent).  
**FR-AN-003 — SHOULD** — Failure shall provide retry-safe error information without exposing secrets/PII.  
**FR-AN-004 — SHOULD** — Completed run shall reference immutable prediction artifacts and derived artifacts.

---

## 2. Non-functional requirements

### NFR-PERF — Performance

**NFR-PERF-001** — On the target demo device, switching among already available/cached slices shall update the visible slice within **200 ms p95** during a 30-step navigation test; normal slice gestures shall not trigger a full-volume network transfer.  
**NFR-PERF-002** — On the target demo device and canonical mesh, rotate/zoom/pan shall remain responsive with a target of **≥20 FPS median** during the defined interaction test and no interaction stall longer than **500 ms** attributable to normal rendering.  
**NFR-PERF-003** — Brush input shall provide visible stroke feedback within **100 ms** for normal touch events on the target demo device and shall not lose committed stroke samples in the canonical brush test.  
**NFR-PERF-004** — Expensive inference/reconstruction may be asynchronous. The client shall receive an accepted/queued response or recoverable error within **2 s** on the demo network for request creation and shall expose processing state without freezing the UI.

### NFR-REL — Reliability

**NFR-REL-001** — Raw MRI, ground truth, and raw model predictions are immutable after ingestion/generation.  
**NFR-REL-002** — A failed network request or app restart shall not silently corrupt persisted review artifacts.  
**NFR-REL-003** — Geometry metadata used for coordinate transforms must be versioned/validated with the artifact.

### NFR-USAB — Usability

**NFR-USAB-001** — Core interactions must be usable on a mobile touch screen.  
**NFR-USAB-002** — Edit gestures must not ambiguously trigger navigation gestures.  
**NFR-USAB-003** — Ground-truth-dependent functionality must clearly communicate when unavailable.

**NFR-USAB-004** — Interactive controls used for primary mobile actions shall meet the selected platform's recommended minimum touch-target size; any exception must be justified by the UX review.  
**NFR-USAB-005** — The canonical end-to-end flow shall complete successfully in **5 consecutive smoke runs** on the target demo device before final acceptance.

### NFR-SEC — Security / Privacy

**NFR-SEC-001** — MVP shall not require patient-identifiable information.  
**NFR-SEC-002** — Transport between mobile and backend shall use secure transport in deployed environments.  
**NFR-SEC-003** — Logs shall exclude raw medical-image payloads and unnecessary sensitive metadata unless explicitly required for a controlled local debugging mode.  
**NFR-SEC-004** — Secrets/config credentials shall not be committed to the repository.

**NFR-SEC-005** — Dataset ingestion shall use a metadata allowlist: only technical fields required for geometry, reproducibility, and case identity may enter application metadata; unexpected direct identifiers must be rejected/removed from the MVP metadata path.

### NFR-REP — Reproducibility

**NFR-REP-001** — Experiment results shall be traceable to model configuration, dataset/split version, preprocessing, post-processing, seed where applicable, and checkpoint identity.  
**NFR-REP-002** — Evaluation shall be patient-level and shall prevent train/test leakage.  
**NFR-REP-003** — A reported metric shall indicate its aggregation level and compatible evaluation population.

**NFR-REP-004** — A run comparison labeled comparable shall verify the same evaluation population/split, compatible evaluation version, explicit prediction variant, and compatible reference/geometry policy before aggregate differences are shown as scientific comparisons.

### NFR-MAINT — Maintainability

**NFR-MAINT-001** — Feature/module boundaries shall minimize parallel code collisions.  
**NFR-MAINT-002** — Shared geometry and API contracts shall not be reimplemented independently in multiple layers without tests.  
**NFR-MAINT-003** — Critical modules shall have automated tests appropriate to their risk.

### NFR-AUDIT — Traceability

**NFR-AUDIT-001** — Every MUST functional requirement shall map to at least one acceptance test and implementation task before being counted complete.  
**NFR-AUDIT-002** — Only ACCEPTED work counts toward formal project progress.

