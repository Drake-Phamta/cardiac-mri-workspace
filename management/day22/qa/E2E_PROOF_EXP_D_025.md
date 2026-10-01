## E2E Phase 2 (EXP-D-025): done, exit 0

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

I ran the command exactly as given, with `CUDA_VISIBLE_DEVICES=-1` and one process. It read only from `<runs>\EXP-D-025` and wrote only to `<data>\e2e_20261001\`.

**Verdict:**
- The product chain stops where Phase 1 predicted: the exporter refuses a validation run, and `validate_contract2` rejects the package with `SCHEMA_INVALID`.
- Everything else about the real run checks out. In the probe, the backend served the package and all 7 endpoints returned 200 with valid contract answers. `analysis_run_metrics` was `COMPUTED` for all 20 runs.
- In the probe only the population rule was relaxed, in memory; gates, checksums and provenance were still checked.

### Run outputs
- **Status:** `run_manifest` is COMPLETE. Only the validation partition was evaluated (role VALIDATION, 20 cases).
- **Predictions:** 20 SUCCEEDED, 0 FAILED, 20 of 20 files present.
- **Evaluation:** `intended_n`, `successful_n` 20, `failed_n` 0. All 3 output files and 20 of 20 metric sets are present (`ml-eval-1.0.0`).
- **Code and split:** training, inference and evaluation code versions are all clean commits. The run's split copy is the pinned frozen split, and the predictions were made with the run's recorded checkpoint.

### Population checks (both must be 0)
- **INT-12 cases in the population: 0**
- **Population cases in the frozen holdout: 0**
- All 20 population cases are ingested in the real cache.
- QA-075 N-1 does not affect this run: 0 WITHHELD rows, and the cohort's `evaluation_n` is 20.

### Exporter
- **Product exporter:** REFUSED, `missing manifest: predictions_manifest.json`. It only handles final_holdout.
- **Fallback:** a copy of `build_manifest` that takes the partition as a parameter built `exp-d-025-raw-validation-e2e`, marked NON-CONTRACT. It has 43 artifacts (20 raw masks, 20 metric sets, plus the summary, per-case and per-slice files) and 20 analysis runs. In the Phase 1 dry run this copy's output matched the product exporter's exactly.

### validate_contract2
- **Strict:** FAIL `[SCHEMA_INVALID]`, "experiment.evaluation_population_manifest.case_count: 54 was expected". This is expected: Contract 2 accepts only the 54-case FINAL_HOLDOUT.
- **Probe** (only the three population claims replaced, in memory): PASS, 20 runs, 43 of 43 artifacts NEW.

### Endpoints (every JSON answer checked against API contract 1.1.0)

| Endpoint | Unmodified backend | Probe |
|---|---|---|
| `/health` (not a contract endpoint) | 200; 21 cases (20 EVALUATION, 1 INFERENCE_REVIEW); 0 experiments; package rejected `SCHEMA_INVALID` | 200; 1 experiment, 20 runs, nothing rejected |
| `experiment_list` | 200, 0 items, valid | 200, 1 item, valid; population shows as validation |
| `experiment_get` | 404 `ARTIFACT_NOT_FOUND`, valid | 200 RAW, valid |
| `experiment_metrics` | 404, valid | 200, valid; `evaluation_n` and `successful_n` 20; 5 metrics, all with CI; n=20 each |
| `experiment_cases` | 404, valid | 200, valid; 20 SUCCEEDED rows; outlier rule pinned, 3 outlier cases |
| `analysis_run_get` | 404, valid | 200 SUCCEEDED, valid |
| `analysis_run_metrics` (RAW) | 404, valid | 200, valid; `COMPUTED`, `CASE_3D`, `ml-eval-1.0.0` |
| `analysis_slice_metrics` (top worst slice) | 404, valid | 200, valid; `COMPUTED` |
| `analysis_run_metrics` on all 20 runs | 20 × 404, 20 of 20 valid | 20 × 200 `COMPUTED`, 20 of 20 valid; no provenance mismatch |
| Contract checks | 7/7 valid | 7/7 valid |

- **Worst-slice pin:** `worst_slice_selection` is present and not empty, and uses the pinned `DR-010` / `dr010-worst-slice/v1` on every 200 answer.
- **Provenance:** all 20 runs returning 200 means the evaluation's ground-truth checksums match the backend cache, and the per-slice rows cover every volume.

### Package size
- `<work>\package` is 50 copied files, 86.8 MB. **`best.pt` is 85.1 MB** of that; everything else is 1.7 MB.
- With the 2 manifest files the runner wrote, the package holds 52 files. They are installed under `<work>\experiments\EXP-D-025\` as hard links inside the work dir.

### Read-only and runtime
- The EXP-D-025 run dir and the real data cache are unchanged (fingerprint before and after).
- 4.9 s, peak about 405 MB. torch was imported; **`cuda_initialized`: false**.

### Files
The work dir holds `package\`, `experiments\`, `backend_var\`, `backend_var_probe\` and `e2e_summary.json`. It contains patient-derived predictions and must never go into git. Nothing was committed, pushed or deleted.

### Still open for Day 25 (unchanged from Phase 1)
1. A real package needs holdout predictions and evaluation after GATE-IMG-01.
2. The exporter writes into the run dir, so decide where exports go.
3. Every package copy carries the 85 MB `best.pt`.
4. A holdout package with the current cache serves no run-level metrics: holdout cases are not ingested, and INT-12 has its ground truth withheld.
5. QA-075 N-1 remains open for holdout packages.
