# 05 — DOMAIN AND DATA MODEL

**Status:** Frozen v1.0  
**Depends on:** `00`–`04`

---

## 1. Domain hierarchy

```text
ResearchStudy
├── Dataset
│   └── MRICase
│       ├── MRIVolume
│       └── GroundTruthMask (optional)
├── Experiment
│   └── AnalysisRun
│       ├── RawPredictionMask
│       ├── ProcessedPredictionMask (optional)
│       ├── Reconstruction3D (derived)
│       └── MetricSet (conditional on reference availability)
└── Finding
    ├── Review
    └── ReviewedMask (optional)
```

---

## 2. Entity definitions

### ResearchStudy
Represents the coherent MVP research workspace.

Suggested fields:

- `study_id`
- `name`
- `description`
- `dataset_id`
- `created_at`
- `status`

### Dataset
Represents the validated dataset release/package used by the project.

Fields:

- `dataset_id`
- `name` = LASC 2018 / official Cardiac Atlas source
- `source_url`
- `dataset_version_or_acquisition_tag`
- `license_usage_notes`
- `geometry_validation_status`
- `split_protocol_id`

### MRICase
A de-identified case.

Fields:

- `case_id` (internal de-identified identifier)
- `dataset_id`
- `source_case_key` (if needed, non-PII)
- `mode_capability` = EVALUATION or INFERENCE_REVIEW
- `volume_id`
- `ground_truth_mask_id` nullable
- `metadata_json` limited to required non-PII technical metadata

### MRIVolume
Immutable raw/validated MRI artifact.

Fields:

- `volume_id`
- `case_id`
- `artifact_uri`
- `format` = NRRD
- `shape_xyz`
- `spacing_xyz`
- `origin_xyz` if available
- `direction_or_orientation` if available
- `dtype`
- `checksum`
- `geometry_validation_status`

### GroundTruthMask
Immutable dataset-provided target/reference mask when available.

Fields parallel to MRIVolume plus:

- `mask_id`
- `case_id`
- `label_semantics` = LA cavity
- `source` = dataset annotation

### Experiment
Defines a reproducible scientific configuration across cases.

Fields:

- `experiment_id`
- `name`
- `model_family`
- `model_config`
- `training_data_fraction`
- `split_protocol_id`
- `seed`
- `preprocessing_version`
- `postprocessing_version`
- `training_code_version`
- `checkpoint_id`
- `status` = PLANNED / TRAINING / EVALUATED / FAILED / FROZEN
- `prediction_variant_policy` = RAW_PRIMARY / PROCESSED_ABLATION / other approved value

### AnalysisRun
Represents one experiment/model analysis on one case.

Fields:

- `analysis_run_id`
- `experiment_id`
- `case_id`
- `status`
- `started_at`
- `completed_at`
- `raw_prediction_mask_id`
- `processed_prediction_mask_id` nullable
- `metric_set_ids` zero or more, each tied to an explicit prediction/reference pair
- `reconstruction_ids` zero or more, each tied to an explicit source mask version
- `attempt_no` or equivalent retry identity
- `failure_reason` nullable

### RawPredictionMask
Immutable direct model output after the explicitly defined prediction-to-binary-mask rule.

Minimum metadata:

- `raw_prediction_mask_id`
- `analysis_run_id`
- `artifact_uri`
- `threshold_or_binarization_version`
- `geometry_contract_version`
- `checksum`

Key rule: **never overwritten by review or post-processing**.

### ProcessedPredictionMask
Derived from a raw prediction through a documented deterministic post-processing configuration.

Fields:

- `processed_mask_id`
- `source_prediction_mask_id`
- `postprocessing_version`
- `artifact_uri`
- `checksum`

### Reconstruction3D
Derived artifact generated from a specific mask version.

Fields:

- `reconstruction_id`
- `source_mask_id`
- `source_mask_kind` = RAW_PREDICTION / PROCESSED_PREDICTION / GROUND_TRUTH / REVIEWED
- `method_version`
- `geometry_contract_version`
- `artifact_uri`

### MetricSet
Evaluation metrics associated with a run and a declared reference.

Fields:

- `metric_set_id`
- `analysis_run_id`
- `reference_mask_id`
- `prediction_mask_id`
- `prediction_mask_kind`
- `aggregation_level` = CASE_3D / SLICE_2D / COHORT_SUMMARY
- `dice`
- `iou`
- `relative_volume_error` nullable
- `hd95` nullable
- `per_slice_metrics_uri`
- `evaluation_version`

MetricSet must not exist as validated accuracy metrics without an available reference mask.

### Review
Human review record.

Fields:

- `review_id`
- `analysis_run_id`
- `status` = NOT_REVIEWED / ACCEPTED / FLAGGED / CORRECTED
- `reviewer_id_or_alias`
- `latest_reviewed_mask_id` nullable
- `created_at`
- `updated_at`
- `state_history` or equivalent immutable audit trail

### ReviewedMask
Human-derived artifact created from a prediction (or processed prediction) by explicit review edits.

Fields:

- `reviewed_mask_id`
- `source_mask_id`
- `review_id`
- `artifact_uri`
- `version` (monotonic within a review/source chain)
- `parent_reviewed_mask_id` nullable
- `checksum`
- `created_at`

### Finding
Evidence-linked observation.

Fields:

- `finding_id`
- `study_id`
- `experiment_id` nullable
- `analysis_run_id` nullable
- `case_id` nullable
- `slice_index` nullable
- `region_reference` nullable
- `finding_type` = UNDER_SEGMENTATION / OVER_SEGMENTATION / BOUNDARY_DISAGREEMENT / DISCONNECTED_ARTIFACT / OTHER
- `note`
- `status` = OPEN / RESOLVED
- `created_at`

---

## 3. Artifact classification

### Immutable source artifacts

- MRIVolume
- GroundTruthMask
- RawPredictionMask

### Deterministic/derived artifacts

- ProcessedPredictionMask
- Reconstruction3D
- MetricSet

### Human-derived artifacts

- Review
- ReviewedMask
- Finding

---

## 4. Provenance invariants

1. Every derived mask references exactly one source mask/version.
2. Every reconstruction references the exact mask used to generate it.
3. Every MetricSet references exact prediction and reference masks.
4. Every ReviewedMask references its source mask and review.
5. A raw prediction is immutable.
6. A reviewed mask must never be mislabeled as dataset ground truth.
7. A “verified by expert” status cannot be used unless an actual qualified expert verification process exists.

---

## 5. Analysis run state machine

`QUEUED → RUNNING → SUCCEEDED`

Failure path:

`QUEUED/RUNNING → FAILED`

Retry must create either a new attempt record or otherwise preserve auditability; implementation shall not silently rewrite failure history.

---

## 6. Review state model

Initial:

`NOT_REVIEWED`

Transitions:

- `NOT_REVIEWED → ACCEPTED`
- `NOT_REVIEWED → FLAGGED`
- `NOT_REVIEWED → CORRECTED`
- `FLAGGED → CORRECTED`
- `ACCEPTED → FLAGGED/CORRECTED` only if audit history is preserved

---

### Review persistence rules

- Logical `NOT_REVIEWED` may be represented by absence of a persisted Review record until the first user action.
- `CORRECTED` requires at least one successfully persisted `ReviewedMask`.
- Each save creates a new immutable `ReviewedMask` version; it never mutates a previous reviewed mask or source prediction.
- `ACCEPTED` does not mean clinically verified; it means accepted by the project reviewer/user for this research workflow.
- A finding may be created without correction, and a correction may exist without a finding.

## 7. Coordinate/geometry contract as a shared domain concept

The system must define one shared geometry contract for:

`voxel index ↔ slice pixel ↔ image display coordinate ↔ world/physical coordinate ↔ 3D mesh coordinate`

The detailed implementation belongs in `07` and `09`, but the contract itself is a cross-layer domain invariant. Duplicate independent transform logic is prohibited unless verified by conformance tests.

