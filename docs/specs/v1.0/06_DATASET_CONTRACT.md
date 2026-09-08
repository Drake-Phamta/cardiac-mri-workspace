# 06 — DATASET CONTRACT

**Status:** Frozen v1.0 contract — package-specific values remain gated by acquisition validation  
**Depends on:** `00`–`05`

---

## 1. Authoritative source

The MVP dataset source is the official Cardiac Atlas Project page for the **2018 Atria Segmentation Challenge / Atria Segmentation Data**:

`https://www.cardiacatlas.org/atriaseg2018-challenge/atria-seg-data/`

This dataset replaces the LAScarQS 2022 Task 2 dataset used in the reference DINOv2 paper because the team does not currently have access to LAScarQS.

The project must report results as **LASC 2018 / obtained official package results**, not as direct reproduction of the paper's LAScarQS metrics.

---

## 2. Expected core artifacts per case

### MRI input

`lgemri.nrrd`

Interpretation: LGE MRI input volume.

### LA cavity target

`laendo.nrrd`

Interpretation: left-atrium cavity segmentation annotation/reference.

### Additional files

Any file not required by the official LA cavity task, including `lawall.nrrd` if present in a local package, shall not be used as a core target until provenance, semantics, and intended use are explicitly verified.

---

## 3. Dataset acquisition gate

Before training begins, the team must create a machine-readable acquisition manifest containing:

- download date;
- source URL;
- package/file names;
- package checksums where practical;
- extracted case count;
- per-case required-file presence;
- file format/dtype;
- volume shape distribution;
- spacing/orientation/origin information available in headers;
- mask unique-value checks;
- explicit verification that `laendo.nrrd` represents the LA cavity target for the obtained package;
- whether official test labels are present and their provenance;
- corruption/read errors.

No training pipeline is accepted until this validation report passes.

---

## 4. Geometry validation gate

Published descriptions and obtained file headers may differ due to release/resampling history. Therefore the pipeline must treat the **validated obtained package** as the immediate geometry source while preserving a note about published values.

The validation report must determine:

1. MRI and target mask shape equality/compatibility.
2. Spacing compatibility.
3. Origin compatibility when available.
4. Orientation/direction compatibility when available.
5. Whether masks are already spatially aligned with MRI.
6. Whether any resampling is required.

### Physical-volume rule

Absolute physical-volume metrics (e.g., mL) remain disabled/unverified until geometry is validated. Relative/voxel-space measures may be used when scientifically appropriate and clearly labeled.

---

## 5. Case identity and privacy

- Use de-identified internal IDs such as `CASE_0001`.
- Do not import/store unnecessary patient name, date of birth, hospital identifier, or other direct identifier into the MVP application.
- Preserve only technical metadata required for imaging/analysis.

---

## 6. Split policy decision tree

`GATE-SPLIT-01` must be resolved **before training** and may not change after test results are observed. The default seed for patient-level randomization is **2024** unless package provenance supplies an official split manifest that is used directly. Exact case IDs must be persisted in versioned manifests.

### Path A — official 54-case test labels are available in the obtained package and provenance is verified

Use the challenge partition as the outer holdout boundary:

- Official Training Set (100 labeled cases): development only.
  - **80 cases train**
  - **20 cases validation**
  - deterministic patient-level split, seed `2024`.
- Official Testing Set (54 cases): **locked final holdout**.
- Testing labels, if supplied, are used only for final evaluation and must not influence preprocessing choice, post-processing choice, threshold selection, model selection, early stopping, or hyperparameter tuning.

### Path B — official test labels are unavailable or provenance cannot be verified

Use only the verified 100 labeled official-training cases:

- **70 train**
- **15 validation**
- **15 locked internal test**
- patient-level deterministic split, seed `2024`.

The 54 official testing MRIs may still be used for **Inference & Review Mode** demonstration if permitted by the obtained package, but no ground-truth-dependent accuracy may be shown for them.

### Split invariants

- No slice-level random split.
- No patient/case may cross partitions.
- The same frozen validation/test populations are used for all comparable UNet/DINOv2 experiments.
- Once `GATE-SPLIT-01` is approved, changing split membership requires a Decision Request and invalidates previously labeled “final/comparable” metrics unless they are explicitly versioned as a different protocol.

## 7. Data-scarcity subset policy

25% and 50% labeled-data subsets must be sampled **only from the training partition**.

Requirements:

- patient-level sampling;
- deterministic seed;
- preferably nested subsets (25% ⊂ 50% ⊂ 100%) unless a different design is explicitly documented;
- validation/test sets remain fixed;
- same subset membership used for comparable UNet and DINOv2 experiments.

---

## 8. Preprocessing contract inputs

Dataset loader must expose at least:

- case ID;
- MRI 3D array;
- ground-truth 3D mask when available;
- shape;
- spacing;
- origin/orientation if available;
- source checksum/version.

Preprocessing must never silently discard geometry metadata required by 3D reconstruction or 2D↔3D navigation.

---

## 9. Validation checks

Minimum automated checks:

- required files exist;
- NRRD loads successfully;
- MRI is 3D;
- mask is 3D;
- MRI/mask shapes align or have an explicitly supported transform;
- mask values conform to documented LA-cavity label semantics; the exact foreground/background value mapping is recorded rather than assumed;
- no NaN/invalid values after preprocessing;
- case IDs are unique;
- patient-level split contains no overlap;
- 25/50/100 training subsets obey subset contract;
- geometry metadata is present/handled consistently.

---

## 9.1 Dataset acceptance artifact

The dataset is considered READY only when `management/DATASET_AUDIT.md` and a machine-readable `data/manifests/dataset_manifest.*` exist and record:

- source URL and acquisition timestamp;
- package checksum(s) where practical;
- case counts by released partition;
- label availability/provenance;
- geometry summary and anomalies;
- foreground label mapping;
- selected split path and exact manifest IDs;
- exclusions/corruptions, if any.

Training tasks remain BLOCKED until this gate is ACCEPTED.

## 10. Dataset report wording

Allowed:

> We use the LASC 2018/Cardiac Atlas Atria Segmentation dataset obtained from the official Cardiac Atlas source and evaluate our models under the split protocol documented in this project.

Not allowed:

> We reproduce Kundu et al.'s LAScarQS 2022 result.

unless the team actually obtains and uses the same dataset/protocol.

