# 02 — USER AND USE CASE MODEL

**Status:** Frozen v1.0  
**Depends on:** `00`, `01`

---

## 1. Primary actor

### ACT-01 — Researcher / Research Student
A user performing medical-imaging AI research or training who needs to inspect LA segmentation behavior, compare experiments, review predictions, and preserve findings/evidence.

The actor is not assumed to be a licensed clinician. The system must avoid clinical decision-making claims.

---

## 2. Jobs to be done

### JTBD-01
When I see an aggregate model score, I want to know **where the score comes from**, so I can inspect the MRI evidence rather than trust a single number.

### JTBD-02
When two models have similar aggregate performance, I want to compare them on the **same cases and slices**, so I can understand practical differences.

### JTBD-03
When I reduce labeled training data, I want to see how model performance changes across the cohort, so I can test whether DINOv2 transfers more robustly than a conventional baseline.

### JTBD-04
When a prediction is wrong, I want to flag or correct it without destroying the raw prediction, so the original experiment remains reproducible.

### JTBD-05
When I inspect a 3D reconstruction, I want to navigate back to the contributing MRI slices, so the 3D visualization remains evidence-linked rather than decorative.

---

## 3. Core use cases

### UC-01 — Open Study Overview
**Actor:** ACT-01  
**Precondition:** Study metadata exists.  
**Main flow:** User opens the study; system shows dataset summary, experiment summary, aggregate performance, outliers, and recent findings.  
**Output:** Navigable overview with links to cases/experiments/findings.  
**Linked product requirements:** PR-STUDY-01, PR-COHORT-01.

### UC-02 — Browse MRI Cases
**Actor:** ACT-01  
**Main flow:** User opens case list; searches/filters/sorts as available; selects a case.  
**Alternative:** Case has no ground truth; UI marks it inference/review-only.  
**Output:** Selected case opens in Case Explorer.  
**Linked requirements:** PR-CASE-01, PR-CASE-02.

### UC-03 — Inspect MRI Volume Slice-by-Slice
**Actor:** ACT-01  
**Precondition:** Valid MRI volume loaded.  
**Main flow:** User navigates slices by slider/swipe; zooms/pans; sees slice index and volume context.  
**Failure:** Invalid/missing volume produces recoverable error state.  
**Linked requirements:** PR-MRI-01, PR-MOBILE-01.

### UC-04 — Inspect AI Prediction Overlay
**Actor:** ACT-01  
**Precondition:** Analysis run prediction exists.  
**Main flow:** User toggles prediction overlay, ground truth if available, and opacity; switches between raw and processed prediction if supported.  
**Linked requirements:** PR-PRED-01, PR-IMG-01.

### UC-05 — Investigate Segmentation Error
**Actor:** ACT-01  
**Precondition:** Ground truth and prediction exist.  
**Main flow:** User enables error inspector; system shows overlap/FP/FN regions and relevant slice/case metrics; user jumps to problematic slices.  
**Alternative:** No ground truth → error inspector disabled with explanation.  
**Linked requirements:** PR-ERR-01, PR-ERR-02.

### UC-06 — Explore 3D Reconstruction
**Actor:** ACT-01  
**Precondition:** Valid predicted or ground-truth mask volume exists.  
**Main flow:** User opens 3D view; rotates/zooms/pans reconstructed LA; active 2D slice is represented by a linked plane/position.  
**Linked requirements:** PR-3D-01, PR-3D-02.

### UC-07 — Navigate 2D to 3D
**Actor:** ACT-01  
**Main flow:** User changes MRI slice; 3D view updates the corresponding slice plane/position.  
**Acceptance intent:** Mapping uses the validated shared geometry contract.  
**Linked requirements:** PR-3D-03.

### UC-08 — Navigate 3D to 2D
**Actor:** ACT-01  
**Main flow:** User selects/taps a valid point/region on 3D representation; system resolves corresponding slice index and opens/highlights that slice in 2D.  
**Linked requirements:** PR-3D-04.

### UC-09 — View 3D Error Map
**Actor:** ACT-01  
**Precondition:** Prediction and ground truth exist.  
**Main flow:** User enables 3D error view; system distinguishes overlap/FP/FN or equivalent error regions; selecting an error region links to contributing slice(s).  
**Linked requirements:** PR-3D-05, PR-ERR-03.

### UC-10 — Compare Analysis Runs
**Actor:** ACT-01  
**Main flow:** User chooses two or more compatible runs; system compares aggregate/case metrics; user selects a case to inspect run-specific overlays on the same MRI.  
**Linked requirements:** PR-EXP-01, PR-EXP-02.

### UC-11 — Explore Data-Scarcity Experiment
**Actor:** ACT-01  
**Main flow:** User compares 25%, 50%, 100% labeled-data configurations for UNet and DINOv2; system shows performance trends and links to case evidence.  
**Linked requirements:** PR-EXP-03.

### UC-12 — Investigate Cohort Outlier
**Actor:** ACT-01  
**Main flow:** User identifies an outlier in distribution/list; opens the case; system preserves the analytical context and enables drill-down to worst slices/errors.  
**Linked requirements:** PR-COHORT-02, PR-ERR-02.

### UC-13 — Review Prediction
**Actor:** ACT-01  
**Main flow:** User marks prediction not-reviewed / accepted / flagged; optionally creates a finding.  
**Linked requirements:** PR-REV-01.

### UC-14 — Brush Correct Prediction
**Actor:** ACT-01  
**Precondition:** Review/correction permitted for the case/run.  
**Main flow:** User enters correction mode; adds/erases mask pixels; uses brush size, undo/redo/reset; saves reviewed mask.  
**Critical rule:** Raw prediction remains immutable.  
**Linked requirements:** PR-REV-02, PR-PROV-01.

### UC-15 — Create Evidence-Linked Finding
**Actor:** ACT-01  
**Main flow:** User creates a finding from cohort/experiment/case/slice/region context; selects error/finding type; adds concise note; saves evidence references.  
**Linked requirements:** PR-FIND-01.

### UC-16 — Open Inference-Only Case
**Actor:** ACT-01  
**Precondition:** No ground truth.  
**Main flow:** User inspects prediction/3D/review features; validation metrics/error maps requiring ground truth are not displayed.  
**Linked requirements:** PR-MODE-01, PR-REV-01.

---

### UC-17 — Initiate Analysis Run (SHOULD)
**Actor:** ACT-01  
**Precondition:** `PR-AN-01` is activated; a deployable frozen model configuration is available.  
**Main flow:** User selects the allowed configuration; system creates a traceable analysis run; UI shows queued/running/succeeded/failed state; successful output becomes an AnalysisRun with immutable prediction provenance.  
**Alternative:** Live compute unavailable → user continues with clearly labeled precomputed experiment/run artifacts.  
**Linked requirements:** PR-AN-01.

## 4. Use-case relationship map

`UC-01 → UC-02 → UC-03 → UC-04 → {UC-05, UC-06, UC-13}`

`UC-06 ↔ UC-07 ↔ UC-08 ↔ UC-09`

`UC-10 / UC-11 / UC-12 → UC-02/UC-03/UC-04/UC-05`

`UC-13 → UC-14 → UC-15`

`UC-03/04 → UC-17 (SHOULD) → UC-04/06/13`

---

## 5. Mode rules

| Capability | Evaluation Mode | Inference & Review Mode |
|---|---:|---:|
| MRI inspection | Yes | Yes |
| Prediction overlay | Yes | Yes |
| Ground truth overlay | Yes | No |
| Dice/IoU | Yes | No |
| FP/FN error maps | Yes | No |
| 3D reconstruction | Yes | Yes |
| Brush correction | Yes | Yes |
| Review/finding | Yes | Yes |
| Cohort accuracy ranking | Yes when comparable | Not as validated accuracy |

---

## 6. UX/use-case constraint

No use case may terminate in an unexplained aggregate metric when lower-level evidence exists. Where practical, metric cards/charts must provide navigation to case/slice evidence.

