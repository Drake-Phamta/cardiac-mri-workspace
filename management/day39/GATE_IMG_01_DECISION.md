# GATE-IMG-01 — CLOSED 2026-10-18

| Field | Value |
|---|---|
| **Gate** | `GATE-IMG-01` (`00` §11.1, DR-G04): freeze the morphology configuration on development/validation evidence only |
| **Status** | **CLOSED** 2026-10-18, under the rule pre-declared in `management/day39/RECOVERY_OVERRIDE_DAY39.md` §4 |
| **Decided by** | Phạm Tuấn Anh — Team Leader (gate opened and authorised in session at 06:40; the rule was merged to `main` in #91 before any candidate was evaluated) |
| **Evidence** | `management/day39/gate_img_01/SELECTION.md` (#92); independent LLM QA `QA_PR92_D39` |
| **Frozen config** | `management/day39/gate_img_01/postprocess_config.frozen.json`, **PP-4**: 3D opening (3×3×3 cube, 1 iteration), then the largest 26-connected component |
| **postprocessing_config_sha256** | `c0a68cc76b598e742c474a845580dba8b8afb9eb073b2588404f11845014961e` |
| **Holdout authorization** | `management/day39/gate_img_01/holdout_authorization.json` (`ml-holdout-authorization/1`) |
| **Owner to revalidate** | Bế Quốc Khánh (ML/imaging block) on 2026-10-19 |

## What the rule produced

On the RAW validation predictions of EXP-D-100 (20 cases, `best.pt`, epoch 6), mean 3D Dice:

| Candidate | Mean 3D Dice |
|---|---|
| PP-0 raw (reference, not eligible) | 0.5712 |
| PP-1 largest component | 0.5855 |
| PP-2 hole fill → PP-1 | 0.5858 |
| PP-3 closing → PP-1 | 0.5859 |
| **PP-4 opening → PP-1 (winner)** | **0.5930** |
| PP-5 closing → hole fill → PP-1 | 0.5858 |

Against the raw masks the frozen configuration **improves** the validation mean by +0.0218 (`07` §5 asks for
improve / worsen / unchanged; image processing was not assumed to help). These are validation numbers used to
choose a configuration. They are **not** results.

## What is now authorised, once

Under `management/day39/gate_img_01/holdout_authorization.json`:

| Run | Holdout use | Checkpoint |
|---|---|---|
| EXP-D-025 | RAW inference + evaluation | its `best.pt` |
| EXP-D-050 | RAW inference + evaluation | its `best.pt` |
| EXP-D-100 | RAW inference + evaluation | its `best.pt` |
| EXP-D-PP | the frozen PP-4 applied to EXP-D-100's RAW holdout predictions, then evaluation | EXP-D-100's `best.pt` |

Each run is predicted and scored once. A crash may be rerun with the identical command, and the rerun is recorded.
No holdout number changes a configuration, a threshold, a checkpoint or a rule. The UNet family (EXP-U-*) is not
in this record; Bế Quốc Khánh trains it, and a later record authorises it under the same frozen configuration
for comparability (UNet post-processing, if any, is declared separately, `08` §2).

## What it does not claim

- That the configuration is optimal: the candidate set was closed and small on purpose.
- Physical units: spacing is an identity placeholder (GATE-DATA-01, F2); RVE stays in voxels.
- Generalisation of the +0.0218: it is measured on 20 validation cases that also selected the checkpoint.
