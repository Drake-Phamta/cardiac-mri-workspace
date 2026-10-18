# Final-holdout results — DINOv2 family and the post-processing ablation (2026-10-18)

| Field | Value |
|---|---|
| **Status** | FINAL for the four runs below. The UNet family (EXP-U-025/050/100) is not trained yet (Bế Quốc Khánh, DR-016a); RQ-A's model comparison is therefore **open** |
| **Population** | `final_holdout`, 54 cases, frozen split `path_a_seed2024_dr002b_v1` (split sha256 `c5c65a09…396d`) |
| **Authorisation** | GATE-IMG-01 closed 2026-10-18 (`management/day39/GATE_IMG_01_DECISION.md`); record `management/day39/gate_img_01/holdout_authorization.json` (sha256 `dea2327f…53d6c7`) |
| **Once** | Each run was predicted and scored exactly once, 07:22–07:36, from `main` at `f08968a`; 54/54 cases succeeded in every run, 0 failed |
| **Metric code** | `ml/evaluate.py`, `ml-eval-1.0.0`; case-level 3D metrics, voxels never pooled across cases; 95 % CI = percentile bootstrap of the mean, 10 000 resamples, seed 2024 |
| **Geometry** | voxel units: spacing is an identity placeholder (GATE-DATA-01 F2); RVE is relative to the ground-truth voxel count |
| **Per-case values** | outside git (run directories on the leader's PC). This file holds aggregates only |
| **Contract 2** | four packages exported and validated (`validate_contract2: PASS (54 analysis runs)` each) |

## 1 · The runs

All share one recipe (`ADR-ML-001`): `DinoSeg(dinov2-small, progressive decoder, full fine-tuning)`, 560×560,
BCE + soft Dice, AdamW 1e-4 constant, bf16, seed 2024, 50 epochs, batch 8, threshold 0.5, checkpoint = best mean
validation 3D Dice. They differ only in training-case membership (nested subsets, effective 20 ⊂ 38 ⊂ 78 cases).

| Run | Training fraction | Best epoch | Best validation Dice (selection only) |
|---|---|---|---|
| EXP-D-025 | 25 % (20 cases) | 32 | 0.5703 |
| EXP-D-050 | 50 % (38 cases) | 13 | 0.5868 |
| EXP-D-100 | 100 % (78 cases) | 6 | 0.5712 |
| EXP-D-PP | EXP-D-100's raw holdout predictions + the frozen PP-4 morphology | — | — |

## 2 · Results on the final holdout (primary population, n = 54)

| Run | Variant | Dice 3D mean [95 % CI] | Median (Q1–Q3) | SD | IoU mean [95 % CI] | Mean slice Dice | RVE % mean / median |
|---|---|---|---|---|---|---|---|
| EXP-D-025 | RAW | 0.5585 [0.5051, 0.6070] | 0.6040 (0.5231–0.6881) | 0.1945 | 0.4090 [0.3647, 0.4506] | 0.3940 | +19.21 / +18.77 |
| EXP-D-050 | RAW | 0.6156 [0.5671, 0.6595] | 0.6675 (0.5813–0.7256) | 0.1743 | 0.4639 [0.4211, 0.5045] | 0.4213 | +12.47 / +12.18 |
| EXP-D-100 | RAW | 0.6390 [0.5945, 0.6769] | 0.6788 (0.5786–0.7397) | 0.1541 | 0.4854 [0.4448, 0.5219] | 0.4264 | +14.95 / +10.47 |
| EXP-D-PP | PROCESSED | **0.6590** [0.6117, 0.6995] | 0.7013 (0.5814–0.7664) | 0.1639 | 0.5099 [0.4660, 0.5499] | 0.4816 | +1.43 / −4.98 |

**Sensitivity population** (DR-002b, without the suspected-linkage case CASE_0027, n = 53): Dice means 0.5549,
0.6128, 0.6375, 0.6573 — every conclusion below holds unchanged.

## 3 · Paired comparisons (per case, Dice 3D, run B − run A)

| A → B | Question | Mean Δ [95 % CI] | Cases B higher / A higher | Label |
|---|---|---|---|---|
| EXP-D-025 → EXP-D-050 | data scarcity, 25 → 50 % | **+0.0572** [+0.0361, +0.0828] | 43 / 11 | COMPARABLE |
| EXP-D-025 → EXP-D-100 | data scarcity, 25 → 100 % | **+0.0806** [+0.0469, +0.1183] | 41 / 13 | COMPARABLE |
| EXP-D-050 → EXP-D-100 | data scarcity, 50 → 100 % | +0.0234 [−0.0006, +0.0514] | 28 / 26 | COMPARABLE |
| EXP-D-100 → EXP-D-PP | post-processing ablation (RQ-B) | **+0.0199** [+0.0145, +0.0257] | 45 / 9 | COMPARABLE under `ml.evaluate compare --allow-variant-mismatch` (the declared RAW vs PROCESSED ablation) |

The sensitivity population gives the same signs and CIs within ±0.003; its 50 → 100 % CI is [−0.00003, +0.0521], which
still touches zero. The four CIs carry **no multiplicity correction**.

The API and the app deliberately answer `comparable: false` for EXP-D-100 vs EXP-D-PP (different prediction
variants, `experiment_compare`): the app never labels a RAW-vs-PROCESSED pair "comparable". The ablation above is
the offline paired analysis that `08` §2 defines for EXP-D-PP, not an app comparison.

## 4 · What the results say — and do not say

- **Data scarcity (DINOv2 family).** Quadrupling the training set (20 → 78 cases) is associated with a 0.081 higher
  mean holdout Dice, with a CI that excludes zero. Each fraction is a **single training run (seed 2024)**, and the
  selected checkpoints come from early, unstable training (best epoch 6 for EXP-D-100, 13 for EXP-D-050), so the
  between-fraction differences include run-to-run variance this design cannot separate. Most of the gain comes from 25 → 50 %; the 50 → 100 % step is small and its
  CI touches zero, so this experiment **cannot claim** a gain from the last doubling.
- **Post-processing (RQ-B).** The frozen PP-4 (3D opening, then the largest connected component) improves mean
  holdout Dice by 0.020 (CI excludes zero; 45 of 54 cases improve) and almost removes the volume bias of the raw
  masks (mean RVE +14.95 % → +1.43 %). The configuration was chosen on validation only (+0.0218 there); the holdout
  confirms the direction and size.
- **Model comparison (RQ-A, UNet vs DINOv2).** **Not answerable yet**: the UNet family has not been trained.
- **Absolute level.** A mean Dice around 0.64–0.66 is modest for left-atrium segmentation. The recorded limitations
  apply: no augmentation, constant learning rate (all three trained runs show episodes where validation Dice drops sharply and recovers, in
  their `train_log.jsonl`; first noted on Day 22),
  2D slice training, identity spacing. A null or modest result is valid (`PR-SCI-03`).
- **Low-Dice cases exist** (the lowest case-level Dice is below 0.1 in every run): the app's outlier drill-down
  (H2 → SCR-03/04) is where these are examined. Per-case values are not published here.

## 5 · Provenance

| Item | Value |
|---|---|
| Code | `main` at `f08968a` (inference, derivation, evaluation, export) |
| Checkpoints (`best.pt` sha256) | EXP-D-025 `8d97b8fd…68a28` · EXP-D-050 `63fcb7f9…800f2` · EXP-D-100 `58152720…51fc` |
| Frozen post-processing config | `management/day39/gate_img_01/postprocess_config.frozen.json`, sha256 `c0a68cc7…4961e` |
| Contract 2 manifests | `exp-d-025-raw-holdout`, `exp-d-050-raw-holdout`, `exp-d-100-raw-holdout`, `exp-d-pp-processed-holdout` |
| Commands | `python -m ml.infer --population holdout --holdout-authorization <record>` · `python -m ml.postprocess derive --population holdout` · `python -m ml.evaluate run --population final_holdout --allow-holdout --holdout-authorization <record>` · `python -m ml.evaluate compare` · `python -m ml.export_contract2 --validate` |
| Owner to revalidate | Bế Quốc Khánh (ML block) |
