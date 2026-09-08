# 08 — EXPERIMENT AND EVALUATION SPECIFICATION

**Status:** Frozen v1.0  
**Depends on:** `00`, `06`, `07`

---

## 1. Scientific objectives

### RQ-A — Data scarcity
Does a DINOv2-based segmentation model retain performance better than a conventional UNet baseline as labeled training data is reduced?

### RQ-B — Image-processing ablation
Does a documented morphological post-processing stage improve or harm DINOv2 LA segmentation results?

The project is not required to invent a new neural-network architecture.

---

## 2. Minimum experiment matrix

| Experiment ID family | Model | Training fraction | Post-processing |
|---|---|---:|---|
| EXP-U-025 | UNet | 25% | raw primary; any UNet post-processing must be declared separately |
| EXP-U-050 | UNet | 50% | raw primary; any UNet post-processing must be declared separately |
| EXP-U-100 | UNet | 100% | raw primary; any UNet post-processing must be declared separately |
| EXP-D-025 | DINOv2-based | 25% | raw primary |
| EXP-D-050 | DINOv2-based | 50% | raw primary |
| EXP-D-100 | DINOv2-based | 100% | raw primary |
| EXP-D-PP | DINOv2-based | 100% (derived from `EXP-D-100` raw predictions) | documented morphology |

Additional experiments are stretch work and must not delay the matrix above.

Before these experiments are labeled FINAL/COMPARABLE, `GATE-DATA-01`, `GATE-SPLIT-01`, and `GATE-ML-01` must be accepted. `EXP-D-PP` additionally requires `GATE-IMG-01` and is derived from the **same raw predictions produced by `EXP-D-100`**, so the post-processing ablation does not introduce a training-data confound.

The DINOv2 architecture/training recipe is identical across `EXP-D-025/050/100` except for training-case membership. The UNet architecture/training recipe is likewise identical across `EXP-U-025/050/100` except for training-case membership.

---

## 3. Split discipline

Use the decision tree in `06_DATASET_CONTRACT.md`.

Hard rules:

- patient-level split only;
- one frozen split manifest;
- same validation/test population across comparable experiments;
- training fractions are subsets of training cases only;
- no test leakage;
- final holdout not used for model selection.

---

## 4. Data-scarcity subset construction

Preferred design:

- 25% subset nested inside 50%;
- 50% subset nested inside 100%;
- deterministic seed;
- same subset membership for UNet and DINOv2 comparisons.

If exact percentage rounding is required, record resulting patient counts.

---

## 5. Core metrics

### Primary

- **Case-level 3D Dice** over the full LA cavity volume.
- **Case-level 3D IoU/Jaccard** over the full LA cavity volume.

Cohort mean/median/std are calculated from per-case primary metrics. Exact metric/empty-slice semantics follow `07` and are versioned in the evaluation code.

### Secondary product/data-science metrics

- per-slice Dice;
- false-positive/false-negative amount;
- relative volume error;
- standard deviation / distribution summaries across cases;
- optional HD95 after geometry validation.

### Human review metrics (optional/SHOULD)

- percentage of reviewed slices/cases requiring correction;
- finding/error-type distribution;
- correction burden proxy.

These must be clearly separated from ground-truth accuracy metrics.

---

## 6. Evaluation levels

### Pixel/voxel level
Segmentation disagreement.

### Slice level
Per-slice metric/error profile.

### Case level
Case Dice/IoU, volume error, worst slices.

### Cohort level
Mean/median/std/distribution/outliers and model comparison.

The product should support navigation across these levels.

---

## 7. Statistical reporting rules

At minimum, final report should include:

- number of evaluated cases;
- mean and standard deviation for primary metrics;
- median where useful;
- distribution visualization;
- case-level paired comparison when comparing models on the same test cases;
- explicit identification of any excluded/failed cases.

Any formal significance test is optional but, if used, must be selected based on the paired data structure and reported with assumptions.

### Comparable-run gate

A pair/group of runs may be labeled **comparable** only if all are true:

1. same frozen validation/test population;
2. same evaluation-code/metric semantics version;
3. same reference-mask semantics;
4. explicit raw/processed prediction variant;
5. compatible geometry policy;
6. no failed/excluded cases hidden from one model without being reported and handled consistently.

If any criterion fails, the UI/report may still show runs descriptively but must label them **non-comparable** and must not present metric deltas as a fair head-to-head result.

---

## 8. Per-slice analysis

The project should compute per-slice metrics where reference masks exist to investigate whether errors concentrate near certain volume positions.

Rules:

- define handling for slices with empty reference/prediction;
- report normalized slice position if comparing different slice counts in future datasets;
- avoid overclaiming anatomical causes unless evidence exists.

---

## 8.1 Failed-case and exclusion protocol

- Inference/evaluation failures are never silently dropped.
- Each failed case is recorded with reason.
- Primary aggregate results report both the intended evaluation N and successfully evaluated N.
- For head-to-head comparisons, the preferred analysis uses the same paired case set; any exclusion changes must be shown explicitly.
- A model that systematically fails on cases cannot appear superior merely because failed cases disappeared from its denominator.

## 9. Post-processing ablation

The comparison must use the **same raw DINOv2 predictions** before/after deterministic morphology.
The morphology configuration is selected/frozen on development/validation data only, then applied unchanged to the locked test/holdout.

Report:

- aggregate metric delta;
- case-level winners/losers;
- representative visual examples;
- whether artifacts/boundaries improve or degrade;
- exact operation configuration.

---

## 10. Experiment result schema

Each experiment result manifest must include:

```yaml
experiment_id: EXP-D-050
model_family: dinov2
model_variant: <frozen value>
decoder: <frozen value>
training_fraction: 0.50
split_manifest: <id/path>
seed: <value>
preprocessing_version: <value>
postprocessing_version: none
prediction_variant: RAW_PREDICTION
evaluation_population_manifest: <id/path>
evaluation_metric_version: <value>
training_code_version: <commit>
checkpoint: <id/path/checksum>
evaluation_code_version: <commit>
num_test_cases: <count>
metrics_summary: <artifact>
per_case_metrics: <artifact>
per_slice_metrics: <artifact>
```

---

## 11. Reproducibility gate

An experiment is not “final” unless another team member or automated procedure can reproduce its evaluation from:

- frozen dataset/split manifest;
- config;
- checkpoint;
- evaluation code;
- documented environment/dependencies.

---

## 11.1 Minimum final scientific evidence package

Before the ML/Data Science block is ACCEPTED, preserve:

- approved dataset/split/subset manifests;
- six core experiment manifests and checkpoints;
- `EXP-D-PP` ablation manifest;
- per-case primary metrics;
- per-slice secondary metrics where valid;
- cohort summary tables/plots generated from saved metrics, not manually typed values;
- failed/excluded case report;
- representative evidence cases chosen by documented criteria (e.g., median, best, worst), not only cherry-picked visuals.

## 12. Reporting boundary relative to reference paper

The paper motivates DINOv2 and reports LAScarQS 2022 results. This project reports LASC 2018 results under its own documented protocol. Comparisons to paper numbers may be contextual only and must not be phrased as direct protocol-equivalent reproduction.

