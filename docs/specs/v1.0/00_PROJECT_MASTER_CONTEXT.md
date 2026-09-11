# 00 — PROJECT MASTER CONTEXT

**Project:** AI-assisted Cardiac MRI Research Workspace  
**Status:** Frozen v1.0 — authoritative implementation source of truth  
**Team:** 4 students  
**Execution window:** 30 days  
**Primary implementation target:** Mobile-first research workspace with supporting backend, ML/imaging pipeline, experiment pipeline, and data/artifact storage.

---


## 0. Version and freeze semantics

- **Version:** 1.0
- **Freeze state:** approved for implementation handoff and 30-day planning.
- **Mutable after freeze only through:** Decision Request → impact analysis → leader/spec-owner approval → versioned spec update.
- Package-specific facts (download checksums, exact geometry, final split manifest) are intentionally represented as validation gates rather than guessed values.

## 1. Purpose of this document

This is the first document every implementation/planning agent must read. It defines the project identity, source-of-truth order, non-negotiable product decisions, unresolved engineering decisions, terminology, academic constraints, and the boundaries within which implementation plans may be produced.

This file does **not** replace the detailed specifications in `01`–`17`. When a later specification provides more detail without contradicting this file, the later specification governs that detail.

---

## 2. Product statement

**AI-assisted Cardiac MRI Research Workspace** is an interactive research/education workspace for studying left-atrium (LA) segmentation from cardiac LGE MRI. It enables a researcher or research student to move from cohort-level model behavior down to an individual MRI case, slice, and pixel; inspect AI segmentation results; reconstruct the predicted LA in 3D; navigate between 2D and 3D; visualize segmentation errors when ground truth exists; and perform human review with brush-based correction while preserving complete result provenance.

The product is **not** a clinical diagnostic system and must not make diagnostic, treatment, or patient-care claims.

---

## 3. Academic context

The project is a multidisciplinary university group project and must visibly apply knowledge from four subjects:

1. **Machine Learning** — supervised baseline, transfer/foundation representation, training/inference, limited-label experiments, evaluation.
2. **Image Processing** — MRI normalization, mask processing, morphology, contour/mask operations, volumetric reconstruction, spatial mapping.
3. **Data Science** — cohort-level evaluation, distributions, outliers, per-slice behavior, experiment comparison, error analysis, reproducibility.
4. **Mobile Application Development** — mobile architecture, interaction design, 2D/3D inspection, gestures, state/error handling, API integration, privacy, individual feature ownership.

The Mobile course guidance requires the group to perform specification, analysis/design, and implementation; document functional and non-functional requirements; choose architecture/technology; build shared application structure; coordinate integration; and ensure every member analyzes, designs, implements, and defends at least one mobile application function.

The team must **not** split the product as “one member = one academic subject.” All members first learn the shared core, then take deeper primary ownership of technical/product blocks while retaining cross-understanding of the end-to-end system.

---

## 4. Research inspiration versus implementation dataset

### 4.1 Reference paper

Primary reference:

- Kundu et al. (2024), *Assessing the Performance of the DINOv2 Self-supervised Learning Vision Transformer Model for the Segmentation of the Left Atrium from MRI Images* (arXiv:2411.09598).

The paper motivates the use of DINOv2 for LA segmentation and reports experiments on LAScarQS 2022 Task 2. It is a **research reference and hypothesis source**, not the dataset/protocol the team is claiming to reproduce exactly.

### 4.2 MVP dataset source

The team will use the official **2018 Atria Segmentation Data (LASC 2018)** source from the Cardiac Atlas Project:

`https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/`

Expected core files:

- `lgemri.nrrd` — input LGE MRI volume.
- `laendo.nrrd` — LA cavity segmentation target/annotation.

Any additional file such as `lawall.nrrd` is outside the core MVP until its provenance and label semantics are explicitly verified.

The implementation must never claim that metrics produced on LASC 2018 reproduce the LAScarQS 2022 metrics from the paper.

---

## 5. Product principles

The project is governed by four product principles:

### P1 — Workspace-first
The system is organized as a coherent LA segmentation research study/workspace, not as disconnected ML, image-processing, analytics, and mobile modules.

### P2 — Case-centered
The MRI case is the deepest interactive object. Cohort metrics, experiments, findings, and 3D views must be able to link back to case-level evidence.

### P3 — Evidence-driven
Every metric or finding should be traceable to supporting MRI/model evidence. Every model prediction must be inspectable. Every human correction must be traceable.

### P4 — Mobile-first interaction
The mobile app is not a passive viewer. It must support meaningful scientific interaction including slice navigation, overlays, zoom/pan, brush correction, 3D exploration, 2D↔3D linkage, and error investigation.

---

## 6. Core loops

The product is designed around three connected loops.

### Loop A — Analyze
`MRI → preprocessing → model → prediction → derived mask/3D → metrics`

### Loop B — Investigate
`cohort anomaly → case → slice → pixel/region → error type → finding`

### Loop C — Review / Improve
`prediction → human review → accept/flag/correct → reviewed artifact → future experiment input (manual, explicit; no automatic retraining)`

---

## 7. Operating modes

### 7.1 Evaluation Mode
Used when a case has ground truth.

Available: Dice, IoU, per-slice evaluation, FP/FN maps, 2D and 3D error visualization, experiment comparison, outlier analysis, human review, brush correction, findings.

### 7.2 Inference & Review Mode
Used when ground truth is unavailable.

Available: prediction, 2D inspection, 3D reconstruction, review, flagging, brush correction, findings.

Unavailable: Dice, IoU, ground-truth FP/FN maps, or any other metric that requires an unavailable reference mask.

The UI and API must not fabricate validation metrics for inference-only cases.

---

## 8. Signature interactions that define the MVP

The following interactions are product-defining and are **MUST** unless formally changed through the decision protocol:

1. **MRI slice ↔ AI prediction inspection** with overlay toggles and opacity.
2. **Brush-based 2D mask correction** while preserving the original prediction as immutable.
3. **2D → 3D linked navigation**: active slice corresponds to a plane/position in the 3D reconstruction.
4. **3D → 2D linked navigation**: selection on the 3D representation navigates to the corresponding MRI slice.
5. **2D/3D segmentation error visualization** when ground truth exists.
6. **Cohort → case → slice → pixel drill-down** for model investigation.
7. **Experiment comparison** for UNet vs DINOv2 under different labeled-data fractions.

---

## 9. MVP experiment thesis

The MVP scientific story is intentionally small and defensible.

### RQ-A — Labeled-data scarcity
**Does a DINOv2-based segmentation model degrade less than a conventional UNet baseline as the amount of labeled training data is reduced?**

Minimum planned matrix:

- UNet at 25%, 50%, 100% training data.
- DINOv2-based model at 25%, 50%, 100% training data.

### RQ-B — Image-processing ablation
**Does classical mask post-processing improve or harm DINOv2 segmentation quality on this dataset?**

Compare raw DINOv2 predictions with a documented morphological refinement configuration without retraining the model.

No additional model family is required for the critical path. Extra baselines are stretch work only.

---

## 10. Data/geometry caution

Before any physical-volume metric (e.g., mL) is treated as authoritative, dataset geometry must pass a validation gate. The locally observed headers and published dataset descriptions may differ in voxel spacing depending on the obtained package or resampling history.

Until geometry is verified:

- Dice/IoU and voxel/relative volume measures may be computed when masks are valid.
- 3D reconstruction may use the geometry actually stored in the validated files.
- Absolute physical-volume claims must be disabled or clearly marked unverified.

---

## 11. Technology decision status

The product requirements are technology-neutral. The mobile framework is **not frozen in the core specification**.

Before production repository architecture is frozen, Claude must run two technical spikes and produce an ADR:

### Spike A — 2D scientific viewer/editor
Load an MRI slice; zoom/pan; draw and erase a mask with coordinate accuracy; undo/redo; persist/reload the correction.

### Spike B — 3D linked interaction
Render an LA mesh; rotate/zoom; tap/select a point or region; map the interaction to a valid MRI slice; update a corresponding 2D view/plane.

The chosen framework must demonstrate these critical interactions with acceptable stability and development cost.

---


## 11.1 Controlled decision gates

Freezing this specification does **not** mean every implementation value is already known. The following items are controlled gates: they may be resolved after evidence is collected, but Claude/team members may not choose them silently.

| Gate | Decision required before | Required artifact | Decision owner |
|---|---|---|---|
| `GATE-DATA-01` | any training/final evaluation | validate official downloaded package, label availability, geometry, checksums, case counts | Leader + ML/Imaging review |
| `GATE-SPLIT-01` | training starts | select Path A or Path B split protocol from `06`; freeze exact patient manifest and seed | Leader/spec owner |
| `GATE-ML-01` | final experiment matrix training | freeze one DINOv2 variant, decoder/head, threshold/loss/training policy used across 25/50/100% runs | Leader after research/compute spike |
| `GATE-IMG-01` | holdout post-processing evaluation | freeze morphology configuration using development/validation evidence only | Leader after imaging ablation setup |
| `GATE-MOB-01` | production mobile architecture | select mobile framework using Spike A/B evidence | Leader via `TECH_STACK_ADR.md` |
| `GATE-DEPLOY-01` | remote demo deployment | select LOCAL_DEMO or REMOTE_DEMO security profile and artifact transport strategy | Leader/Architect |

A gate resolution becomes part of project truth only when recorded in an approved ADR/Decision Log and linked from the relevant specification.

## 12. Source-of-truth hierarchy

1. `00_PROJECT_MASTER_CONTEXT.md`
2. `01_PRODUCT_VISION_AND_SCOPE.md`
3. `02_USER_AND_USE_CASE_MODEL.md`
4. `03_PRODUCT_REQUIREMENTS_PRD.md`
5. `04_FUNCTIONAL_AND_NONFUNCTIONAL_SPEC.md`
6. `05_DOMAIN_AND_DATA_MODEL.md`
7. `06_DATASET_CONTRACT.md`
8. `07_ML_AND_IMAGE_PROCESSING_SPEC.md`
9. `08_EXPERIMENT_AND_EVALUATION_SPEC.md`
10. `09_SYSTEM_ARCHITECTURE_SPEC.md`
11. `10_MOBILE_UX_AND_INTERACTION_SPEC.md`
12. `11_API_CONTRACT.md`
13. `12_PRIVACY_SECURITY_AND_DATA_GOVERNANCE.md`
14. `13_TEST_ACCEPTANCE_AND_TRACEABILITY.md`
15. `14_TEAM_SHARED_CORE_AND_OWNERSHIP.md`
16. `15_TEAM_EXECUTION_AND_PROJECT_CONTROL.md`
17. `16_DEMO_REPORT_AND_DEFENSE_MAPPING.md`
18. `17_LEADER_CLAUDE_ORCHESTRATION_PROTOCOL.md`

Execution artifacts generated later by Claude (30-day plan, daily plans, repo structure, ADRs, project state, risk register, backlog) do **not** override these specifications.

### Specification conflict rule

- `00` contains non-negotiable project identity and governance constraints.
- Later files intentionally provide greater detail for their domain.
- If two frozen files appear contradictory, **stop and raise a Decision Request**; do not guess which one “wins” and do not modify code/spec to hide the contradiction.
- An approved ADR may resolve an explicitly open technical gate, but it may not weaken a MUST requirement without the formal change-control process.

---

## 13. Change-control rule

Claude, developers, and reviewers may identify specification issues but must not silently change product scope, dataset protocol, scientific meaning, domain semantics, or acceptance criteria.

Required process:

`Problem → Decision Request → impact analysis → leader/spec-owner approval → specification update → implementation`

Code must never be used to retroactively redefine the specification merely because the code already exists.

---

## 14. Definition of project success

The project succeeds only when all of the following are true:

- The integrated mobile-first workspace demonstrates the defined end-to-end MRI investigation flow.
- Core MUST requirements pass acceptance and integration tests.
- Scientific results are reproducible and reported under the actual LASC 2018 protocol used by the team.
- Scientific success means a valid answer to the research questions, **not** a predetermined requirement that DINOv2 beat UNet. Negative/null results remain acceptable when protocol and evidence are sound.
- 2D/3D linked interaction and brush review are functional, not mock-only demo screens.
- Every academic subject can be defended using real project evidence without changing the underlying product.
- Every team member can explain the shared end-to-end core and can defend at least one mobile function they personally analyzed, designed, and implemented.
- The repository remains continuously integrable; progress is tracked using accepted evidence rather than subjective percentages.


<!-- CI negative test. This branch is never merged. -->
