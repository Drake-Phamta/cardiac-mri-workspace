# ADR-ML-001 — frozen research configuration for the six core runs

| Field | Value |
|---|---|
| **Status** | PROPOSED — frozen when the CHAT E QA of Spike C1 passes, under the GATE-ML-01 rule of `management/day22/RECOVERY_OVERRIDE_DAY22.md` §4 |
| **Resolves** | `GATE-ML-01` (spec `07` §2; `06` §4) |
| **Decided by** | Phạm Tuấn Anh — Team Leader, under the rule written in `management/day22/RECOVERY_OVERRIDE_DAY22.md` §4 **before any C1 result existed**; QA by CHAT E (an LLM red-team session, not a second human) |
| **Evidence** | Spike C1 — `management/spikes/SPIKE_C_ML/RESULT_C1.md`; aggregate machine evidence in `management/spikes/SPIKE_C_ML/c1_evidence/` (`c1_summary_20261001T121428.json`, `c1_calendar_20261001T121428.json`, `c1_result_table.md`); raw measurements, loss logs and checkpoints are kept outside the repository |
| **Owner from Day 23** | Bế Quốc Khánh (V3 / ML) |
| **Scope** | The six core runs EXP-U-025/050/100 and EXP-D-025/050/100, plus the derived ablation EXP-D-PP (post-processing of EXP-D-100's predictions; no training). Held constant across data fractions (`07` §2) |

## 1 · The configuration (one row per `07` §2 field)

| `07` §2 field | Frozen value | Evidence pointer |
|---|---|---|
| DINOv2 variant and pretrained checkpoint source | `facebook/dinov2-small`, revision `ed25f3a31f01632728cabb09d1542f84ab7b0056` (Hugging Face), resolved from the local cache only (`local_files_only=True`); a revision that does not resolve to itself raises. Weights sha256 recorded in each run's model card | `ml/models.py` `PINNED_REVISIONS`, `model_card()`; measurements JSON `convergence_C1_6.*.model_card` |
| Frozen / partially / fully fine-tuned | **Fully fine-tuned**: every backbone and decoder parameter trainable (`dinov2_s14_full_progressive`) | `model_card.trainable_parameters` = `total_parameters` |
| Decoder / head architecture | Progressive decoder from the Spike C0 harness (`probe.py` @ `896c11a`, copied unchanged into `ml/models.py`): 40×40 patch tokens decoded to 320×320, then interpolated to the input size; effective output stride 1.75 | `ml/models.py` `DinoSeg`; C1-5 stride comparison |
| UNet baseline | `UNet2D(in_ch=1, base=32, depth=4)`, output stride 1, trained from scratch | `ml/models.py` `UNet2D` |
| Input size / channel conversion | 560×560, every slice of every case (88 per case), axis `[z, y, x]`. DR-011 per-volume clip to p0.5/p99.5 and scale to [0, 1]. DINOv2 only: replicate to 3 channels, then the checkpoint's fixed image mean/std inside `DinoSeg.forward`. Image resize bilinear + antialias; mask nearest-exact. No augmentation | `ml/data.py` `PREPROCESSING` (`ml-preproc-1.0.0`); C1-3, C1-7 |
| Loss | 0.5 · BCE-with-logits + 0.5 · soft Dice (smooth 1.0), on logits at the model input resolution | `spikes/spike_c_ml/c1/run_feasibility.py` `loss_fn`; `ml/train.py` |
| Optimizer and learning-rate policy | AdamW, lr 1e-4, constant (no schedule); default betas and weight decay | same |
| Batch size | **8** — the largest of {8, 4, 2} at which **both** families fit on the 4 GiB host (C1-3) | measurements JSON `practical_point` |
| Epoch / early-stopping policy | **E = 50 epochs** for all six runs, from the pre-declared rule E = min(50, the largest E for which the queues on the two DR-016 hosts finish by 2026-10-03 12:00). No early stopping: validation Dice is computed every epoch and the checkpoint with the best validation Dice is kept | calendar JSON `epochs_E`; `ml/train.py` |
| Threshold / binarization | Logits resized back to the native slice size (bilinear), then sigmoid ≥ 0.5. Scoring only at native resolution | `ml/data.py` `resize_logits_back`, `logits_to_mask`; `ml/evaluate.py` |
| Precision and seed | bf16 autocast on CUDA; seed 2024 (weights, loader order) | run manifests |
| Compute / memory feasibility | Both families fit 560 / batch 8 on the 4 GiB card (peak 3,387 MiB UNet, 3,159 MiB DINOv2); measured 1,010.67 / 485.95 ms per training step. The UNet figure is inflated by driver memory spill at this card's limit (RESULT_C1 §3.1), so the UNet family runs on the 6 GiB RTX 4050. Calendar: E = 50 fits, about 12.4 h for the DINOv2 queue and 24.3 h for the UNet queue, both before 2026-10-03 12:00 | C1-1, C1-2, C1-3, C1-9 |
| Scientific fairness against UNet | Same data and subsets, same preprocessing, same loss, optimizer, learning rate, batch, epochs, seed, threshold and checkpoint rule; both families fully trained (`PR-SCI-03`). A `NEGATIVE_RESULT` for either family is a valid result; nothing is tuned after seeing results | this table |

## 2 · Measured basis (generated from the C1 JSON; not typed)

| Criterion | What | Evidence (generated from JSON) |
|---|---|---|
| `C1-1` | Peak memory, both families, practical point | unet_base32_depth4 560/b8: 3387.3 MiB; dinov2_s14_full_progressive 560/b8: 3159.4 MiB |
| `C1-2` | Train / validation step time (real data, loading included) | unet_base32_depth4: 1010.67 / 121.84 ms; dinov2_s14_full_progressive: 485.95 / 123.08 ms |
| `C1-3` | Practical input resolution and batch | 560×560, batch 8 (first grid point where both fit) |
| `C1-4` | Decoder behaviour on real anatomy (fixed panel) | unet_base32_depth4: 3 small-area panel slices below Dice 0.5; dinov2_s14_full_progressive: 4 small-area panel slices below Dice 0.5 |
| `C1-5` | Thinnest structures vs decoder stride (voxels) | p5 thickness at model input 7.215 px; fraction thinner than stride: unet_full_resolution 0.0, dinov2_progressive 0.0, dinov2_linear 0.19786 |
| `C1-6` | Equal-budget convergence | unet_base32_depth4: CONVERGING (loss 0.74391 → 0.47806, fold-val Dice 0.78807); dinov2_s14_full_progressive: CONVERGING (loss 0.78194 → 0.49896, fold-val Dice 0.34948) |
| `C1-7` | DR-011 at runtime | per-volume statistics only; cohort statistics used: False |
| `C1-8` | Subset provenance | 20 ids from $.training_subsets.25_percent.effective_case_ids; split sha256 c5c65a0913b0…; validation and holdout never loaded |
| `C1-9` | Calendar verdict | E = 50 → FITS |
| `C1-10` | ADR-ML-001 fields evidenced | see the coverage table in ADR-ML-001 |

## 3 · What is fixed and what is not

- **Fixed now** for all six runs: every row of §1.
- **Not part of this ADR:** the morphology post-processing used by EXP-D-PP (`GATE-IMG-01`, decided later on validation evidence only), and anything about the locked holdout, which stays unreachable until `GATE-IMG-01` freezes.
- **Changing any row** after the first core run starts needs a new ADR revision and invalidates the runs already made under this one.

## 4 · Gate effect

`GATE-ML-01` → **CLOSED once the CHAT E QA of Spike C1 passes (this ADR then reads ACCEPTED)**. The six core runs may start on the DR-016 hosts: DINOv2 family on the leader's PC (RTX 3050 Ti) from today, UNet family on the RTX 4050 from Day 23.
