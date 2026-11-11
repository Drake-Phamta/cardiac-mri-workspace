# QA PR #96 `docs/day39-results` (Day 39)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.**

| Field | Value |
|---|---|
| PR | #96 results(day39): final-holdout results of the DINOv2 family and the PP-4 ablation (aggregates only) |
| Head SHA | `c08d19f5eb04ab0a9f4e6cdf7fba294d18ab21b7` |
| File | `management/day39/RESULTS_HOLDOUT_DINOV2.md` (only this file) |
| Reviewed | 2026-10-18 |
| **Verdict** | **MERGE** (no blocking items; 5 non-blocking edits recommended) |

## Checks

`gh pr checks 96`: 10 pass; `mobile render smoke + bundle (npm ci)` still pending at review time (unrelated to a docs-only change; `no dataset / checkpoint / secret bytes` and `frozen spec checksums` pass).

### Numbers verified against sources (read-only; script `d39/qa/verify96.py` in the scratchpad)
Sources: `EXP-D-{025,050,100,PP}/evaluation/final_holdout/metrics_summary.json`, `_holdout_d39/comparisons/*.json`, `EXP-D-*/run_state.json`, `EXP-D-*/checkpoints/best.pt`.

| Item in the document | Verified |
|---|---|
| Section 2 table: Dice mean, 95 % CI, median, Q1-Q3, SD, IoU mean and CI, mean slice Dice, RVE mean/median for all 4 runs (`cohort` and `holdout_slots.primary_all_holdout` are identical in every run) | all 4 rows match at the printed rounding (e.g. 0.5585 [0.5051, 0.6070]; 0.6590 [0.6117, 0.6995]; RVE +14.95 / +10.47; +1.43 / -4.98) |
| Sensitivity means (n = 53, CASE_0027 excluded) 0.5549, 0.6128, 0.6375, 0.6573 | match |
| Section 3: 4 paired comparisons, mean delta, CI, b-higher / a-higher | all match: +0.0572 [+0.0361, +0.0828] 43/11; +0.0806 [+0.0469, +0.1183] 41/13; +0.0234 [-0.0006, +0.0514] 28/26; +0.0199 [+0.0145, +0.0257] 45/9 (`n_equal` = 0 everywhere) |
| "same signs and CIs within +-0.003" | true. Largest sensitivity-minus-primary shift: mean 0.0020, CI low 0.0023, CI high 0.0026 (25 -> 100). All signs equal |
| Best epoch / best validation Dice | 32 / 0.5703, 13 / 0.5868, 6 / 0.5712 match `run_state.json` |
| `best.pt` sha256 | `8d97b8fd...68a28`, `63fcb7f9...800f2`, `58152720...51fc` match; the EXP-D-PP `best.pt` is the same file as EXP-D-100 (same sha256) |
| "54/54 succeeded, 0 failed" | `intended_n` 54, `successful_n` 54, `failed_n` 0, `failures` [] in all 4 runs |
| "lowest case-level Dice below 0.1 in every run" | true: minima 0.0299, 0.0697, 0.0477, 0.0281 (values not reproduced here) |
| Nested subsets 20 / 38 / 78, subset-of relation | `split_manifest.json` effective ids 20, 38, 78 and nested |
| Hashes: split `c5c65a09...396d`, authorisation `dea2327f...53d6c7`, PP config `c0a68cc7...4961e` | match (computed from the repo files and the run manifests) |
| Recipe (50 epochs, batch 8, lr 1e-4, 560, bf16, seed 2024, no augmentation, constant LR, BCE + soft Dice, AdamW) | `config.json` and `ADR_ML_001.md` agree |
| Window 07:22-07:36, code `f08968a`, 4 x `validate_contract2: PASS (54 analysis runs)` | prediction dir created 07:22:49, last export 07:36:29; `predictions_manifest.json` and `evaluation_manifest.json` carry `git:f08968ab...`; export logs show PASS (54) |
| PP-4 = 3D opening then largest connected component; +0.0218 on validation | `postprocess_config.frozen.json`, `SELECTION.md`, `GATE_IMG_01_DECISION.md` agree |
| Comparison labels | JSON labels are `COMPARABLE` for all four; for 100 -> PP `same_prediction_variant_required` is false (explicit variant) |

Not independently provable from files: "predicted and scored exactly once" (only one `final_holdout` predictions directory per run exists, created that morning; no earlier holdout directory found, which is consistent).

### Interpretation (Section 4)
Honest as written: the 50 -> 100 % CI touching zero is stated with "cannot claim"; the 25 -> 100 gain is stated with CI excluding zero; PP effect is reported with the validation-chosen configuration and the +0.0218 vs +0.0199 agreement; RQ-A is explicitly "Not answerable yet"; absolute level called modest; null/modest result noted as valid. No UNet claims. No overclaiming found.

### Per-case values
None published. No per-case Dice, IoU, FP/FN or case-level min/max. The statement "the lowest case-level Dice is below 0.1" is a bound on one case's value, not the value; acceptable. `CASE_0027` appears as the already-documented suspected-linkage exclusion (DR-002b), an identifier from the split manifest, not a result. No paths or IPs (only "run directories on the leader's PC").

## BLOCKING
None.

## NON-BLOCKING (recommended edits)
1. `management/day39/RESULTS_HOLDOUT_DINOV2.md:61` "both runs showed validation-Dice collapses, recorded on Day 22": the `train_log.jsonl` of all three trained runs shows collapses (EXP-D-100 epoch 13 = 0.000; EXP-D-050 several epochs at 0.000; EXP-D-025 epoch 37 = 0.000), not two. Fix: "all three trained runs". I also found no repo document recording this by the word "collapse"; cite `train_log.jsonl` (run directories, outside git) or the Day 22 note it comes from.
2. Section 4 data-scarcity bullet (`:52-54`): add that each fraction is one seed (2024) and that the best checkpoint comes from early, unstable training (best epoch 6 of 50 for EXP-D-100, 13 for EXP-D-050), so the CIs describe case sampling only, not training variance. Suggest softening "raises" to "is associated with" for the 25 -> 100 gain.
3. `:46` "COMPARABLE (raw vs processed, declared)": the hero-flow API and the app deliberately answer `comparable=false` for RAW vs PROCESSED (no delta drawn; PR #95 step H10.2 reproduced this), while this table calls the same pair COMPARABLE. Add one sentence that the ablation is a paired comparison of the same checkpoint with an explicitly declared variant (`ml.evaluate compare`), and that the app intentionally does not draw a delta for it.
4. `:36-37` "every conclusion below holds unchanged": the 50 -> 100 sensitivity CI is [-0.00003, +0.0521], still touching zero (printed as -0.0000 in the aggregate output); say so explicitly to avoid a reader seeing "-0.0000".
5. Four 95 % CIs are reported without multiplicity correction; one clause ("not corrected for multiple comparisons; four pairs") would complete the caveats.
