# QA review: PR #64 `feat(ml)`, evaluation metrics and Contract 2 export · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewer | **CHAT E, the independent QA.** I am an LLM session (Claude) running under the team leader's account, not a second human reviewer (RECOVERY_OVERRIDE_DAY22 §2.2). |
| Target | PR #64, branch `feat/ml-evaluate-contract2`. The head I reviewed is **`8dce862`**, which matched `origin/feat/ml-evaluate-contract2` when I fetched. I checked it out detached in an isolated worktree. |
| Scope | Only the delta `d5c04bc..8dce862`: commits `330be9f` and `8dce862`, 8 text files, +1726/−18. That covers `ml/evaluate.py`, `ml/export_contract2.py`, `ml/manifests.py`, the tests (`test_evaluate`, `test_export_contract2`, `runfixture`, `synth`) and `ml/README.md`. PR #60 (`ml/data.py`, `ml/models.py`) is not reviewed here. Where the delta depends on it, I say so. |
| Authorities read | 07 §6; 08 §5–§11; Contract 2 README, `schema.json` and `validate_contract2.py` on main; DR-010; DR-010a (option (b), decided in RECOVERY_OVERRIDE_DAY22 §4); DR-014; `OPEN_DECISIONS.md` |
| Environment | Windows 11, Python 3.12.6, numpy 2.2.6, pynrrd 1.1.3, jsonschema 4.26.0, pytest 8.3.4. torch 2.5.1+cu121 ran on **CPU only**: `CUDA_VISIBLE_DEVICES=-1`, and `torch.cuda.is_available()` returned False. |
| Data | **Synthetic only.** I used `synth.make_contract_package` and wrote everything to a scratch directory outside git. For every probe, `CARDIAC_PACKAGE_ROOT` pointed at a scratch path that does not exist, and a read-logger confirmed that no file under the real data root was opened. **0 bytes** of validation or final_holdout data were read. |
| Repository | Read-only throughout: no commit, push, approval or comment. The worktree was clean afterwards. |
| Time | About 45 of the 50 minutes |

> **Not testable in this PR.** No `train.py` or `infer.py` exists on any branch. The producers of `run_manifest.json`, `predictions_manifest.json` and `manifests/split_manifest.json` therefore exist only as the synthetic stand-in `ml/tests/runfixture.py`.

## 1. Checks

| # | Check | Command / probe | Result | Evidence |
|---|---|---|---|---|
| 1 | Test suite | `python -m pytest ml/tests -q -p no:cacheprovider --basetemp <scratch>\p`, with CUDA hidden | **PASS** | **67 passed, 0 skipped**, 47 s at `8dce862`. The DINOv2 tests ran on CPU. A first attempt with a deeper basetemp gave 2 failed and 6 errors. All were `FileNotFoundError` on a single path of exactly 260 characters (MAX_PATH, `LongPathsEnabled=0`), so that failure came from my environment, not the code (see N-8). |
| 2a | 3D Dice/IoU, FP/FN, RVE | `probe_metrics.py`, volume A with a hand-computed answer | **PASS** | TP 5, FP 8, FN 7 gives Dice 10/25 = 0.4, IoU 5/20 = 0.25 and RVE +8.333 %. RVE is in voxels, and over-segmentation is positive, as in the 07 §6 formula. FP and FN ratios are 8/12 and 7/12. |
| 2b | Per-slice empty-slice rule (07 §6) | same | **PASS** | When both slices are empty, `dice` is null and the status is `NOT_APPLICABLE`; the slice is left out of `mean_slice_dice`. **When GT is empty and the prediction is not, Dice is 0** (category `PRED_ONLY`), which is exactly what 07 §6 bullet 2 says. That 0 is counted in `mean_slice_dice`, kept out of the worst-slice ranking, and listed separately as "problematic FP slices", as DR-010 requires. |
| 2c | DR-010 worst slice, its tie-break, and the DR-010a shape | volumes A and B | **PASS** | Volume B ranks as [0, 2, 1, 3, 4, 5]: Dice ascending, then FP+FN descending, then slice_index ascending, with both tie levels exercised. The block contains `rule_id`, `selection_version` and `slices[{slice_index, dice, false_positives, false_negatives}]`, plus three extra keys. |
| 2d | DR-010 outlier selection | synthetic records | **PASS** | Returns the lowest three; ties go to higher FP+FN, then `case_id` ascending; FAILED cases are excluded. |
| 2e | Random cross-check | 300 random volumes against my own reference implementation, which uses sets of voxel coordinates and shares no code with `evaluate.py` | **PASS** | 0 disagreements across 3D metrics, per-slice metrics, worst-slice ranking and the empty-GT failure. The probe ran 37/37 checks, all PASS. |
| 2f | Confidence interval (DR-014) | bootstrap probes | **PASS** | Method: percentile bootstrap of the mean over cases, 10,000 resamples, `default_rng(2024)`, level 0.95, linear quantiles. Values {0, 1} give [0, 1], the exact answer. Values [.2, .5, .7, .9] give [0.325, 0.8], which equals the exact enumeration of all 4⁴ resamples and is bit-identical to my own replication. The seed is fixed and recorded in `metrics_summary.bootstrap`, and paired differences (b − a) get the same CI. DR-014 fixes the 95 % level but not the method; the method used here is declared in the output. |
| 2g | Distance metrics | grep | **PASS** | None are implemented (no HD95). That is consistent with 07 §6, which allows HD95 only after physical geometry validation, and with DR-012. |
| 3 | Scoring at native resolution | grep, plus probes P3 and P6 | **PASS** | `evaluate.py` and `export_contract2.py` contain no resize, interpolate, logits or threshold code. A prediction must match the native reference exactly in shape and geometry: an 8×8 prediction at model-input-like size is recorded **FAILED `SHAPE_MISMATCH`, never scored**, and a changed origin gives `GEOMETRY_MISMATCH`. The resize-back-then-threshold-at-0.5 step lives upstream in PR #60 (`resize_logits_back` → `logits_to_mask`, which I checked on a 2×2→4×6 answer). No producer calls it yet. |
| 4 | Failure handling | `probe_rundir.py` P1–P9 | **PASS** | Missing file → FAILED `EVALUATION_ERROR`. No record in the predictions manifest → `NO_PREDICTION_RECORD`. Mis-shaped → `SHAPE_MISMATCH`. NaN in a float NRRD → `NON_BINARY_MASK`. Values {0, 255} → `NON_BINARY_MASK`. An empty prediction is scored 0, which is correct because it is a valid prediction. Predictions covering only a subset make the whole run refuse, and nothing is written. The summary keeps intended / successful / failed N (2 / 1 / 1) and reports a mean with failures counted as 0 over the intended N. |
| 4b | Atomic writes ("commits atomically") | A1–A5 | **PASS** | A crash after 4 files leaves no `evaluation/validation`. A re-run commits a complete set whose hashes agree with the evaluation manifest. A recorded evaluation is never overwritten. The final rename refuses if the target appeared in the meantime (Windows). A crash does leave a stale `.validation.tmp-*` directory behind (N-8). |
| 5 | Holdout lock | H1–H9 through the API, C1–C4 through the CLI | **FAIL** | Every flag-based path refused: no flag (H1, C1); flag but no authorization record (H2, C2); `allow_holdout='yes'` (H3); a holdout id in validation predictions (H4); holdout entries in a validation predictions dir, which are ignored and never read (H5); a predictions manifest saying `final_holdout` (H6); the holdout population manifest (H7). **H9 was not refused (B-1).** The authorization record's content is never checked (C3, N-1), and a role relabel is accepted (H8, N-2). |
| 6a | Contract 2 export | `probe_contract2.py` E1–E6 | **PASS** | The `validate_contract2.py` CLI passes: 54 analysis runs, 111 artifacts. The variant is labelled `RAW_PREDICTION` and the masks `RAW_PREDICTION_MASK`, exactly. Raw checksums are re-hashed and equal the predictions record; all artifacts are `immutable: true`; a second export refuses to overwrite. Provenance carries the experiment id, a per-case `analysis_run_id`, checkpoint id and sha, training and evaluation code versions, split id and sha, training subset, population, preprocessing and postprocessing versions, and seed. |
| 6b | Validator mutation probes | M1–M17 | **FAIL** (the frozen validator on main, outside this delta) | Caught: a tampered checksum on a manifest entry, the checkpoint or the raw bytes (M1, M13, M15); `PROCESSED` with postprocessing `none` (M5); a raw mask relabelled as processed (M8); a metric set pointing at another case's mask (M9); open gates; a wrong case count; a changed checksum on re-ingestion. **Not caught:** a missing case (M2, M3, and M4, where all 54 runs point at one mask); a swapped `case_id` (M10); a `PROCESSED` label on RAW masks (M6, M7). See N-5. |
| 7 | Run manifest (`ml/manifests.py`) vs 08 §10 | code read, plus probe X3 | **PASS** for the exported record; **NOT RUN** for the producer | All 19 fields of 08 §10, plus `training_subset_manifest`, are present in the exported `experiment` record. The exporter assembles them from `run_manifest.json`, the predictions manifest and the evaluation manifest. `manifests.py` itself only defines `RUN_MANIFEST_FORMAT` and `RUN_LAYOUT`: it neither builds nor validates a run manifest, and no `train.py` exists to write one. A run manifest missing a field (X3: `decoder` removed) crashes the exporter with an uncaught `KeyError` (N-4). |
| 8 | Python and portability | grep, plus running on Windows | **PASS with notes** | Manifest paths are relative and use forward slashes. `--run-dir`, `--dataset-manifest` and `--package-root` are configurable. The diff contains no hostname, IP or username. Notes: N-6 (absolute paths in failure reasons), N-7 (absolute path in the README), N-8 (MAX_PATH). |
| 9 | Diff contents | `git diff --numstat d5c04bc..8dce862` | **PASS** | 8 text files, 0 binary. The fixture's "checkpoint" is a 41-byte literal written to a temporary directory at test time. |

## 2. Findings

### BLOCKING

**B-1. The holdout lock trusts the run directory's own copy of the split.**
- **What happens.** `evaluate_run` builds its allowlist from `<run>/manifests/split_manifest.json`. That file's sha256 is checked only against the predictions manifest in the same directory. Commit `330be9f` checked it against `run_manifest.json` in the same directory, and the fix commit `8dce862` kept that design. Nothing compares the copy with the frozen `data/manifests/split_manifest_path_a_seed2024.json`.
- **Probe H9.** I made a structurally valid split copy that moves one holdout case into `validation` and updated its sha. Then `evaluate_run(run, "validation")`, with no flag at all, **scored CASE_0101 and opened its reference mask**. The exporter has the same gap: in X2 the exported split sha differs from the frozen sha, and the export is not refused.
- **Why it blocks.** It defeats "unreachable without an explicit flag" through a path that needs no flag. Nothing in the repository writes the split copy yet, so nothing guarantees it is the frozen file. Tonight's 20-case validation population is defined by that copy.
- **Fix.**
  - In `load_run_split` and in `build_manifest`, require sha256(run's split copy) == sha256(frozen split), and refuse otherwise.
  - Read the frozen split from `D.DEFAULT_SPLIT_MANIFEST`, or from an explicit `--split-manifest` argument that defaults to it.
  - Make the tests pass the synthetic split explicitly, and add H9 as a regression test.
  - About 10 lines plus one test.
- **Owner:** A1 / Bế Quốc Khánh.

### NON-BLOCKING

**N-0. Scope expectation for tonight.** The exporter only handles `final_holdout`: `PARTITION` is hard-wired, and Contract 2 DRAFT v0 requires the 54-case `FINAL_HOLDOUT` with both gates ACCEPTED, while GATE-ML-01 is still open. **Tonight's validation evaluation cannot be exported to Contract 2 and cannot reach the backend through this path.** That is correct by design. If the app needs validation-run metrics, it needs a contract decision, not a workaround. Owner: leader.

**N-1. `holdout_authorization` is checked for presence only.**
- Any truthy value passes once `--allow-holdout` is given. In C3 the value `"yes"` gave exit 0 and wrote the holdout evaluation; the fixture's record of 64 zeros passes too.
- Fix this before the first holdout evaluation, that is, before GATE-IMG-01 closes. Require a structured record, for example `confirm_frozen_morphology_sha256` equal to the sha of the committed GATE-IMG-01 configuration and verified against that file, and fail closed otherwise.
- Owner: A1 / Khánh.

**N-2. The population role is not checked against the partition.** A population manifest relabelled `FINAL_HOLDOUT` but carrying the validation ids is accepted, and the evaluation is recorded with role `FINAL_HOLDOUT` (H8). Fix: require `pop["role"] == MF.ROLES[partition]` and `pop["partition"] == partition`. Owner: A1 / Khánh.

**N-3. The exporter accepts code versions that cannot be reproduced.**
- An evaluation run from a dirty tree is exported as `git:<sha>+dirty` and passes the validator (X1). Likewise `UNKNOWN`, and likewise for `training_code_version`.
- 08 §11 says a result is not "final" unless its evaluation can be reproduced from the code.
- Fix: refuse `+dirty` and `UNKNOWN` in `build_manifest`, or require an explicit flag whose use is recorded in the manifest.
- Owner: A1 / Khánh.

**N-4. No declared schema for `run_manifest.json` or `predictions_manifest.json`.**
- Their required keys exist only implicitly, in `runfixture.py` and in the code that reads them. X3 crashes with an uncaught `KeyError` instead of "EXPORT REFUSED".
- `training_fraction` is not cross-checked against the training-subset manifest.
- Fix: put required-key lists and a `validate_*()` function in `manifests.py`, shared by train, infer, evaluate and export.
- Owner: A1 / Khánh, together with `train.py` and `infer.py`.

**N-5. Gaps in the Contract 2 validator** (frozen on main, outside this delta).
- The validator does not:
  - count analysis runs against `num_test_cases`;
  - tie a run's `case_id` to its artifacts;
  - check `prediction_mask_kind` or `experiment.prediction_variant` against the kind of the referenced mask.
- Today the exporter is the only completeness guarantee, and it does enforce one: predictions-manifest cases = intended cases = metric sets, and any failure refuses the export.
- Fix: a contract amendment, which is the leader's decision. Until then the backend must not rely on the validator for completeness.
- Owner: the Contract 2 owner, raised through A1 / Khánh.

**N-6. Integration with the unmerged backend and API-contract branches.**
- **Manifest location.** The exporter writes `<run>/contract2/<id>.json` with every path relative to `<run>`. The backend's discovery looks at `*.json` and `*/*.json` and uses the manifest's own folder as the root. That gives `ARTIFACT_UNREADABLE` (M14), or the manifest is not found at all because it sits at depth 3.
- **Names.** Here `selection_version` is `dr010-worst-slice/1.0.0`; the API contract branch pins `dr010-worst-slice/v1`. The worst-slice block also carries three keys beyond `block_fields`. Metric names differ: `dice_3d`, `iou_3d`, `fp_voxels`, `fn_voxels`, `relative_volume_error_percent` here, versus `dice`, `iou`, `false_positives`, `false_negatives`, `relative_volume_error` there.
- Fix, before ingestion: agree on one manifest location and one `selection_version` literal, and write a field map.
- Owner: A1 / Khánh, with A3 (backend, Nguyễn Gia Đức Trung).

**N-7. Non-finite logits at the inference boundary** (PR #60, cross-reference).
- `logits_to_mask` turns NaN into 0: `[[nan, 5], [inf, -inf]]` becomes `[[0, 1], [1, 0]]`. A model that diverges to NaN would be scored as an empty mask with Dice 0 instead of being recorded FAILED.
- The evaluation side already handles a non-finite NRRD correctly (P4).
- Fix: the check belongs in `infer.py`, which should refuse non-finite logits and record the case FAILED. Please flag this to PR #60's QA.
- Owner: A1 / Khánh.

**N-8. Small items.** Owner: A1 / Khánh.
- **(a)** Failure reasons record absolute machine paths (P1: `FileNotFoundError: … '<home-path>'`). Record paths relative to the run directory instead.
- **(b)** README line 94 promises a "default root" `<runs>\<experiment_id>\` that no code implements (`--run-dir` is required), and puts an absolute machine path in the public repo. Its note that the two real-split tests are skipped is stale: the split is on the branch and both tests ran.
- **(c)** The commit's temporary directory name `.{partition}.tmp-<pid>-<12hex>`, plus `metric_sets/CASE_xxxx.json`, needs roughly len(run_dir) + 75 characters within MAX_PATH. It fails safe, but leaves the temporary directory behind, as any crash does (A2). Shorten the name and remove the directory on failure.
- **(d)** `compare` loads `per_case_metrics.json` without checking its sha against `evaluation_manifest.json`. JSON manifests are hashed and parsed in two separate reads (unlike `read_nrrd_zyx`).

## 3. Verdict

**MERGE AFTER FIXES: one blocking fix, B-1.**

The metric code is correct:
- every known-answer value matches, as do both tie-break rules and the bootstrap CI, each checked against an independent computation;
- predictions are scored only at native resolution;
- failures are recorded with a reason and counted in intended vs successful N, never dropped and never scored as 0;
- the evaluation commits atomically;
- the Contract 2 export passes the repository's validator, with exact RAW labels and re-hashed, immutable checksums.

For tonight's EXP-D-025 validation scoring, the numbers can be trusted provided the run's split copy is the frozen Path A split. B-1 makes the code enforce that instead of assuming it. N-1 must be done before any holdout evaluation, and N-6 before the backend ingests a package.

| Step | Who | What |
|---|---|---|
| 1 | A1 / Bế Quốc Khánh | B-1 plus the H9 regression test. N-2 and N-3 are cheap to add in the same change. |
| 2 | CHAT E | Re-run H9, H1–H8 and the test suite on the new head |
| 3 | Phạm Tuấn Anh | Merge after QA (CP-07 / override §4) |

**Process note.** During this session the main checkout `<repo>` changed from `feat/day22-backend-hero-flow` (the snapshot at session start) to `main`. This session did not do that: every git command targeted the isolated worktree, plus one read-only `branch --show-current`.

---
