# 03 — PRODUCT REQUIREMENTS / PRD

**Status:** Frozen v1.0  
**Depends on:** `00`–`02`

---

## 1. Objective

Deliver a 30-day MVP of a mobile-first cardiac MRI segmentation research workspace that supports scientifically honest model evaluation, multi-scale investigation, 2D↔3D evidence linkage, and human review.

---

## 2. Requirement priority model

- **MUST** — required for accepted MVP / critical demo.
- **SHOULD** — high value but may be deferred only through explicit scope decision.
- **COULD** — stretch work after MUSTs are stable.
- **OUT** — explicitly not part of current project.

---

## 3. Product requirements

### Study / Cohort

**PR-STUDY-01 — MUST**  
The product shall expose a single coherent LA segmentation research study/workspace containing dataset, cases, experiments, analysis runs, and findings.

**PR-COHORT-01 — MUST**  
The user shall be able to view cohort-level performance summaries for comparable evaluation runs.

**PR-COHORT-02 — MUST**  
The user shall be able to identify and open outlier/low-performing cases from cohort analysis.

### Cases / MRI

**PR-CASE-01 — MUST**  
The user shall be able to browse and open MRI cases using de-identified case identifiers.

**PR-CASE-02 — MUST**  
The system shall clearly indicate whether a case supports Evaluation Mode or only Inference & Review Mode.

**PR-MRI-01 — MUST**  
The user shall be able to inspect an MRI volume slice-by-slice on mobile with usable navigation and zoom/pan interaction.

### Prediction / Image Processing

**PR-PRED-01 — MUST**  
The user shall be able to inspect model prediction masks aligned with the source MRI.

**PR-IMG-01 — MUST**  
The user shall be able to compare relevant pipeline outputs such as raw prediction and documented post-processed prediction when those artifacts exist.

### Error / Evidence

**PR-ERR-01 — MUST**  
For cases with ground truth, the system shall visualize segmentation disagreement at the slice/pixel level.

**PR-ERR-02 — MUST**  
Aggregate or case-level errors shall be drillable to relevant MRI slice evidence.

**PR-ERR-03 — MUST**  
For cases with compatible 3D masks, the system shall support a 3D representation of segmentation disagreement linked to 2D evidence.

### 3D / Spatial Navigation

**PR-3D-01 — MUST**  
The system shall reconstruct a 3D LA representation from validated segmentation masks.

**PR-3D-02 — MUST**  
The user shall be able to rotate, zoom, and pan the 3D representation on mobile.

**PR-3D-03 — MUST**  
Changing the active MRI slice shall update the corresponding 3D slice plane/position.

**PR-3D-04 — MUST**  
Selecting a valid location/region in the 3D representation shall navigate to the corresponding MRI slice.

**PR-3D-05 — MUST**  
When ground truth exists, the 3D view shall support error visualization linked to contributing slices.

### Experiments / ML / Data Science

**PR-EXP-01 — MUST**  
The product shall represent UNet and DINOv2-based experiment results as comparable, reproducible analysis artifacts.

**PR-EXP-02 — MUST**  
The user shall be able to compare compatible runs at cohort and case level.

For a comparison to be labeled scientifically comparable, runs must use the same evaluation population/split, compatible metric/evaluation version, declared prediction variant (raw vs processed), and compatible reference/geometry policy.

**PR-EXP-03 — MUST**  
The product shall expose results for the documented labeled-data fractions (25%, 50%, 100%) for UNet and DINOv2-based models.

**PR-EXP-04 — MUST**  
The product shall expose the documented raw-vs-post-processed DINOv2 ablation result.

### Analysis execution

**PR-AN-01 — SHOULD**  
The user should be able to initiate an analysis run for a compatible case using at least one deployed frozen model configuration and observe asynchronous run state. Precomputed experiment results remain acceptable for the canonical demo fallback when live compute is unavailable, but the UI must label precomputed vs newly executed runs accurately.

### Human Review

**PR-REV-01 — MUST**  
The user shall be able to record review state as not reviewed, accepted, flagged, or corrected.

**PR-REV-02 — MUST**  
The user shall be able to correct a 2D prediction mask with add/erase brush interaction and save a reviewed mask.

**PR-PROV-01 — MUST**  
The raw model prediction shall remain immutable; any human correction shall create a separate traceable artifact.

### Findings

**PR-FIND-01 — MUST**  
The user shall be able to create a finding anchored to available evidence such as experiment, case, slice, and optional region.

### Scientific honesty

**PR-MODE-01 — MUST**  
The system shall not display ground-truth-dependent accuracy/error metrics when ground truth is unavailable.

**PR-SCI-01 — MUST**  
The product/report shall distinguish the LASC 2018 implementation protocol from the LAScarQS 2022 protocol of the reference paper.

**PR-SCI-02 — MUST**  
Physical-volume claims shall be gated by validated geometry/spacing.

**PR-SCI-03 — MUST**  
Project success and reporting shall not require DINOv2 to outperform UNet. The team shall report the observed result under the frozen protocol, including a null/negative result, rather than tuning or filtering evidence to force the reference-paper direction.

### Mobile / Course constraints

**PR-MOBILE-01 — MUST**  
The mobile app shall be a primary interactive client, not a static results viewer.

**PR-MOBILE-02 — MUST**  
The application shall implement loading, processing, empty, failure, and retry states for core workflows.

**PR-MOBILE-03 — MUST**  
Each team member shall be able to own, analyze, design, implement, and defend at least one mobile function while still understanding the shared project core.

### Privacy

**PR-PRIV-01 — MUST**  
The project shall use de-identified research data and shall not require real patient identity for MVP operation.

**PR-PRIV-02 — MUST**  
Logs, analytics, and UI shall avoid unnecessary patient-identifiable information.

---

## 3.1 Formally tracked SHOULD / COULD requirements

The following scope items have IDs so Claude may schedule them only when priority rules permit. They are **not** part of the critical-path acceptance floor unless promoted through Decision Request.

**PR-COMP-01 — SHOULD**  
Provide synchronized/side-by-side comparison of multiple compatible analysis runs on the same case beyond simple run switching.

**PR-METRIC-01 — SHOULD**  
Provide a validated surface-distance metric such as HD95 after physical geometry is confirmed.

**PR-REVAN-01 — SHOULD**  
Provide review-burden analytics derived from review/correction evidence and clearly separate them from ground-truth accuracy metrics.

**PR-FILTER-01 — SHOULD**  
Provide richer filtering/sorting of cases/findings when it improves investigation without delaying critical workflows.

**PR-CACHE-01 — SHOULD**  
Provide safe offline-friendly caching of already opened slices/artifacts subject to privacy and version invalidation rules.

**PR-MODEL-EXTRA-01 — COULD**  
Add another model family only after the required UNet/DINOv2 matrix is stable.

**PR-COLLAB-01 — COULD**  
Support multi-user collaboration/comments.

**PR-ANN-ADV-01 — COULD**  
Add advanced annotation tools beyond the defined 2D add/erase brush workflow.

**PR-STUDY-CREATE-01 — COULD**  
Support arbitrary study creation rather than the predefined LA study.

**PR-EXP-SCHED-01 — COULD**  
Support automatic experiment scheduling from mobile.

## 4. Product-level acceptance outcomes

The MVP shall be rejected if any of the following is true:

- 3D is decorative only and cannot link back to MRI slices.
- Brush correction overwrites the original prediction.
- Ground-truth-dependent metrics are shown for cases without ground truth.
- Experiment results are not traceable to documented model/data configuration.
- Mobile app cannot execute the canonical investigation flow end-to-end.
- Critical features exist only as static mocks.
- Run provenance or comparison compatibility is ambiguous/misrepresented.
- Requirements completed in code cannot be traced to tests/evidence.

---

## 5. Scope firewall

No COULD feature may enter active development while a critical MUST requirement is blocked or failing unless the leader explicitly authorizes the trade-off through the decision process.

