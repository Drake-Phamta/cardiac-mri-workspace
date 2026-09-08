# 07 — ML AND IMAGE PROCESSING SPECIFICATION

**Status:** Frozen v1.0  
**Depends on:** `00`–`06`

---

## 1. Pipeline overview

```text
NRRD MRI volume
→ dataset/geometry validation
→ intensity preprocessing
→ 2D slice preparation
→ segmentation model
→ raw prediction mask
→ optional deterministic post-processing
→ stacked 3D mask
→ metrics (when reference exists)
→ 3D reconstruction
→ mobile artifacts / linked geometry
```

The pipeline is 2D-model-oriented but volume-aware: individual slices may be segmented independently, while case-level evaluation/reconstruction must preserve patient and spatial structure.

---

## 2. Model scope

### ML-MODEL-01 — UNet baseline
A conventional supervised UNet baseline used for comparison.

### ML-MODEL-02 — DINOv2-based model
A segmentation model using a pretrained DINOv2 visual backbone/representation plus a documented segmentation decoder/head.

The exact DINOv2 variant and decoder implementation are controlled by `GATE-ML-01`. Before the six core 25/50/100% runs are launched, one configuration must be frozen in an approved research ADR (`ADR-ML-001`) and then held constant across data fractions. The ADR must record:

- DINOv2 variant and pretrained checkpoint source;
- whether the backbone is frozen, partially fine-tuned, or fully fine-tuned;
- decoder/head architecture;
- input size/channel conversion;
- loss, optimizer, learning-rate policy, batch size, epoch/early-stopping policy;
- threshold/binarization rule;
- compute/memory feasibility evidence;
- rationale for scientific fairness against UNet.

No extra model family is required on the MVP critical path.

---

## 3. Slice preparation

The model pipeline must define and version:

- source slice extraction axis;
- intensity normalization method;
- spatial resize/crop/pad behavior;
- interpolation mode for MRI;
- interpolation mode for masks (must preserve label semantics);
- conversion from monochrome MRI to model channel format when required;
- any augmentation used during training.

Mask interpolation must not introduce non-label values unless explicitly handled and binarized by documented logic.

Any normalization statistic learned from data must be fit on the training partition only. Per-image/per-volume normalization that uses only the current image is allowed if documented consistently.

---

## 4. Model output contract

For each slice/case, the model pipeline must distinguish:

1. **logits/probability output** (if retained);
2. **raw binary prediction mask** produced by a documented threshold/rule;
3. **processed prediction mask** produced only by the optional deterministic image-processing stage.

The raw binary prediction is immutable once recorded as an experiment artifact.

---

## 5. Image-processing ablation

The MVP shall test a documented morphological refinement configuration on DINOv2 raw predictions.

Candidate operations may include operations such as opening/closing and connected-component cleanup, but the final configuration must be frozen before final test evaluation.
The selected configuration is resolved through `GATE-IMG-01` and may use training/validation evidence only. The same frozen operation is then applied to all final holdout predictions without case-specific manual tuning.

Rules:

- do not tune post-processing using final holdout outcomes;
- record kernel/structuring-element details;
- record operation order;
- produce both raw and processed artifacts;
- report whether metrics improve, worsen, or remain unchanged;
- do not assume image processing must improve the model.

---

## 6. Metric computation semantics

When ground truth exists, the **primary segmentation metrics are case-level 3D Dice and 3D IoU**, computed over the full binary LA cavity volume for each case. Cohort summaries are calculated from these per-case values; they are not obtained by pooling all voxels across all patients into one giant mask.

Secondary metrics may include:

- per-slice 2D Dice;
- false-positive (FP) / false-negative (FN) voxel counts and ratios;
- relative volume error;
- optional HD95 after physical geometry validation.

### Empty-slice rule

For per-slice Dice:

- GT non-empty, prediction empty → Dice `0`;
- GT empty, prediction non-empty → Dice `0`;
- both empty → `NOT_APPLICABLE`/`NaN` for the error-profile mean and distribution, rather than `1`, so large numbers of background-only slices do not inflate per-slice performance.

Case-level 3D metrics are still computed normally over the full case volume.

### Relative volume error

Use:

`RVE = (V_pred - V_gt) / V_gt × 100%`

where volume may initially be voxel count when physical spacing is not validated. When geometry passes the physical-volume gate, the same formula may use physical volume and be labeled accordingly.

### Prediction variant rule

Every MetricSet must state whether it evaluates `RAW_PREDICTION` or `PROCESSED_PREDICTION`. The primary UNet-vs-DINOv2 scarcity comparison uses the declared raw-primary variants; post-processing is reported as a separate ablation and must not be silently substituted into the primary comparison.

## 7. 3D reconstruction

### Input
A validated 3D binary mask volume plus geometry metadata.

### Output
A 3D surface/mesh or equivalent renderable artifact.

### Requirements

- reconstruction method/version recorded;
- mesh retains mapping to source voxel/world coordinates;
- no arbitrary independent scaling that breaks 2D↔3D mapping;
- mesh may be simplified for mobile performance only if mapping remains valid or an explicit transform is preserved.

A marching-cubes-style approach is acceptable if it satisfies these requirements, but the specification does not force one library.

---

## 8. Shared coordinate transform

The project must define a tested transform chain:

`voxel(i,j,k) ↔ image-pixel(x,y,slice) ↔ display coordinate ↔ world coordinate ↔ mesh coordinate`

### Required invariants

1. A known voxel/slice test point maps consistently across backend and mobile.
2. Zoom/pan modifies display transform only, not source-mask geometry.
3. Brush edits convert touch coordinates back to correct mask pixel coordinates.
4. 3D selection resolves to a valid source slice using the same geometry contract.
5. Active 2D slice plane in 3D is computed from source geometry, not a visual guess.

This is a high-risk module and must have dedicated automated regression tests.

---

## 9. Brush correction data flow

```text
touch point on transformed mobile canvas
→ inverse display transform
→ source slice pixel
→ edit working mask buffer
→ undo/redo history
→ save reviewed mask artifact
```

The working edit session may begin from raw or processed prediction according to the UI selection, but the saved reviewed artifact must record the exact source mask.

---

## 10. Training and checkpoint discipline

- Fixed split/subset manifest.
- Training configuration persisted.
- Best-checkpoint selection criterion defined before final evaluation.
- No final-test-driven hyperparameter iteration.
- Each experiment result references exact checkpoint/code/config.
- Random seeds recorded where applicable.
- UNet and DINOv2 use the same split/subset membership for each paired data fraction.
- Each model family may use an appropriate frozen training recipe, but tuning budget and model-selection procedure must be documented; the report must not claim architectural superiority solely from an unfairly optimized comparison.
- Threshold/model selection uses training/validation evidence only.

---

## 11. Inference artifact contract

Each successful case inference should produce/reference:

- raw prediction 3D mask;
- optional processed mask;
- per-slice access artifacts as needed by client architecture;
- 3D reconstruction artifact or reconstruction-ready mask;
- metrics only when ground truth exists;
- geometry metadata required by mobile linkage.

---

## 12. Technical spike acceptance

### Spike A — 2D viewer/editor
Must prove:

- correct slice render;
- zoom/pan;
- brush add/erase;
- coordinate accuracy after transforms;
- undo/redo;
- save/reload.

### Spike B — 3D linkage
Must prove:

- render canonical LA mesh;
- rotate/zoom/pan;
- show active slice plane/position;
- select mesh point/region;
- resolve to expected slice index;
- synchronize 2D viewer.

These spikes are prerequisites to freezing the mobile framework ADR.
They must also exercise the performance targets in `NFR-PERF-001`–`004` on the declared target demo device where applicable.

