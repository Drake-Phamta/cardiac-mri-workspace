# QA-075: PR #75, backend metrics (backend PR 3) · **MERGE · REDEPLOY OK** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM session (Claude Code, Claude Opus 5.5) running under the team leader's account. **It is not a second human reviewer.** It is the independent QA pass that `RECOVERY_OVERRIDE_DAY22.md` requires in place of a second human review. |
| **Target** | PR #75, `feat/day22-backend-metrics`, head `6b610bdb4de75bb60ebd064d18538211401e53a3`. One commit, 6 files, +649/−103. Changed files: `backend/app/{experiments,metrics}.py`, `backend/tests/{conftest,synthetic,test_api}.py`, `backend/README.md`. |
| **Base** | The PR's merge base is `a7b4950`. `origin/main` was `3c02fd2` at the start and `254044a` at the end, because PR #63 merged during the review. Since `a7b4950`, main has not changed anything under `backend/` or `contracts/`. The only `.github` change touches the app/core job (the V4 steps), not the backend job. |
| **Run time** | 2026-10-01, 14:47–15:05 (+07:00), inside the 40-minute timebox |
| **Method** | Static review of the diff against contract 1.1.0, DR-010/DR-010a (`OPEN_DECISIONS.md` on main) and `validate_contract2.py`. The test suite ran in a detached worktree (`<scratch>/qa75b_wt`) as a single process. CI status and logs were read with `gh`. A probe built on synthetic data only drove the FastAPI app in-process (TestClient; no uvicorn, no network) and validated every JSON answer with `contracts/api/validate_api_contract.validate_response`. DR-010 was checked on crafted rows. Ingestion was tested with mutated synthetic packages. The added lines were scanned with regexes for hygiene. |
| **Data handling** | No real MRI or mask bytes were read and no `CARDIAC_*` variable was set. The Mac mini was not contacted. Everything ran CPU-only, one process at a time, well under 2 GB. Nothing was posted to GitHub. The main checkout is untouched: still on `main`, and `git status` shows only `?? .claude/`. |

> **VERDICT: MERGE · REDEPLOY OK.** No finding blocks the merge or the `-SkipData` redeploy. Eight findings are non-blocking (N-1 to N-8). **N-1 is a gate on data, not on code:** no real Contract 2 package may be put on the host until N-1 is decided and implemented.

---

## 1 · Commands and scripts run

| # | Command (scripts are in `<scratch>`) | Purpose |
|---|---|---|
| R1 | `git worktree add --detach <scratch>/qa75b_wt 6b610bd` · `git diff a7b4950 6b610bd` · `git diff --quiet a7b4950 6b610bd -- backend/app/{storage,ingest,cases,main,config}.py backend/scripts backend/requirements*.txt .github` (exit 0) · `git diff --stat a7b4950 origin/main -- backend contracts` (empty) | Isolate the diff; establish that it lands unchanged on the moved main |
| R2 | `python -m pytest backend/tests -q -p no:cacheprovider --basetemp <scratch>/qa75b_pytest_tmp1` | The backend suite |
| R3 | `gh pr checks 75` · `gh api …/actions/runs/36822374838` · `gh run view … --log` (backend job) | CI status, the SHA it tested, the Python 3.9 result |
| R4 | `python qa75b_probe.py` | Contract sweep, INT-12, DR-010 crafted rows, ingestion negative cases, immutability and restart |
| R5 | `python qa75b_where.py` | Where the withheld case's values appear in experiment-level answers |
| R6 | `python qa75b_nocase.py` | Every run-scoped endpoint for runs whose case is not in the data cache |
| R7 | `python qa75b_hygiene.py` | Hygiene regexes over the added lines; Python 3.9 grammar parse of the changed modules |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Local test suite, single process | **PASS** | 50 passed, 0 skipped, 0 failed, 14.7 s. Python 3.12.6 with FastAPI 0.140, pydantic 2.13 and numpy 2.2, which are newer than the pins. The 31 warnings are all deprecations (httpx/TestClient, pynrrd `utcnow`). |
| 1b | Python 3.9 locally | **NOT RUN** | This PC has no `py` launcher and no 3.9 interpreter. Substitutes: the CI Python 3.9 job (pinned `requirements-dev.txt`) ran on `6b610bd` with "50 passed", and an `ast.parse(feature_version=(3, 9))` parse of the 5 changed `.py` files succeeds. |
| 1c | `gh pr checks 75` | **PASS** | 9/9 pass. Guardrails run 36822374838, event `pull_request`, head `6b610bd`. The backend job includes the offline wheel-closure step. GitHub showed mergeability `UNKNOWN` at the end, still recomputing after #63 merged (see §4). |
| 1d | Tests that need real data | **NOT RUN (none exist)** | `backend/tests` has no `CARDIAC_DATA_ROOT` test. The only guarded test reads the committed split manifest, which holds case IDs only. |
| 2a | Response validation covers the new endpoints | **PASS (at test time)** | At runtime the backend checks only that an error code is listed for its endpoint: the `endpoint()` decorator turns an unlisted code into a 500. Body validation happens in tests: every `api.call` runs `validate_response`, and the suite sends `analysis_run_metrics`, `analysis_slice_metrics`, `analysis_slice_error`, `experiment_metrics`, `experiment_cases` and `experiment_compare` through it. |
| 2b | Synthetic sweep against contract 1.1.0 | **PASS** | 374 requests with **0 contract problems** (200×30, 404×257, 422×87). Coverage: 10 runs × 4 variant values (RAW, PROCESSED, invalid, missing); slice indices in range, out of range, negative and non-numeric; the error and error-reconstruction routes; get/metrics/cases for accepted, blocked and unknown experiments; 6 compare permutations; plus the ingestion scenarios. Every error code seen is listed for its endpoint: ARTIFACT_NOT_FOUND, GROUND_TRUTH_UNAVAILABLE, ANALYSIS_FAILED, SLICE_OUT_OF_RANGE, VALIDATION_ERROR. There is one field map (`METRIC_SOURCES`) and it equals `metric_rules.case_metric_fields`. Variants are served with the API spelling (RAW/PROCESSED). PROCESSED never falls back to RAW numbers (`NO_METRICS_FOR_VARIANT`). One malformed-artifact path is the exception: see N-3. |
| 3a | Contract 2 packages use the validator, all or nothing | **PASS** | `_load()` runs `validate_contract2.validate_manifest` on every manifest before registering anything. A rejected package appears by code in `/health` and serves 0 experiments and 0 runs. **There is no SQLite ingestion:** packages are discovered at startup and served in place, and no tables are added. |
| 3b | Malformed or partial bundles are refused | **PASS** | Each case below served 0 experiments and 0 runs: checksum mismatch → `CHECKSUM_MISMATCH`; a run's raw mask ID pointing at a METRIC_SET → `PROVENANCE_INVALID`; an invalid metric reference kind → `SCHEMA_INVALID`; an artifact file missing → `ARTIFACT_UNREADABLE`. |
| 3c | No path traversal | **PASS** | `../x`, `predictions/../../x`, an absolute path and a backslash path are all rejected with `SCHEMA_INVALID`. `_safe_path` resolves the path and requires it to stay under the root, which by reading the code also stops symlink escapes. The root itself can be widened, though: see N-2. |
| 3d | A run already present; re-ingestion | **PASS** | The same package copied twice: the second copy is rejected `DUPLICATE_ARTIFACT`, the first is still served (RUN_9001 metrics 200), and its files are unchanged. The same run IDs under another experiment: `DUPLICATE_ARTIFACT`. The backend never writes into the experiments tree or the data cache (both hash-identical before and after the sweep and a restart), and after a restart the answers are identical. RawPrediction and GT bytes are never written. Immutability across restarts is not enforced; this is pre-existing (N-5). |
| 3e | Missing case | **PASS (deliberate change)** | Runs whose case is not ingested are now registered. `analysis_run_get` answers 200. Metrics, slice metrics, prediction, reconstruction and review answer `ARTIFACT_NOT_FOUND`; `finding_create` and `case_get` answer `CASE_NOT_FOUND`. All of these are valid under the contract. A population case with no per-case record becomes an `EXCLUDED` row. |
| 3f | A FAILED case (known open item) | **REPORTED** | Contract 2 cannot hold a run without a raw mask, because `raw_prediction_mask_id` is required and checksum-verified. What the code does: (i) an entry in the ML failures list with no C2 run becomes an `experiment_cases` row with status `FAILED`, reason `"<reason_code>: <reason>"`, `analysis_run_id` null and `metric_values` null. It validates, counts in `evaluation_n` but not in `successful_n`, and is never an outlier. (ii) A C2 run with status FAILED (which still carries a raw mask) gives `analysis_run_get` status FAILED with `failure_code` ANALYSIS_FAILED, and the metric endpoints answer 422 `ANALYSIS_FAILED` before reading any artifact. |
| 4a | DR-010 worst-slice ranking | **PASS** | Eligible slices are those with `ref_voxels > 0` (non-empty GT). Sort keys: Dice ascending, then FP+FN descending, then `slice_index` ascending. Every eligible slice is served; with none eligible the answer is `[]`, never padded. A crafted 9-slice input (both-empty, two FP-only, REF_ONLY, a no-overlap slice, an exact tie on (Dice, FP+FN), and a Dice tie with a smaller FP+FN), fed in reverse order, came back as `[3, 2, 4, 6, 5, 7]`, exactly as expected. FP-only and both-empty slices were excluded. |
| 4b | The `worst_slice_selection` block | **PASS** | The block has exactly `{rule_id, selection_version, slices}` with values `DR-010` and `dr010-worst-slice/v1`. Each slice has exactly `{slice_index, dice, false_positives, false_negatives}`, with counts in pixels of the slice, and the exporter's extra keys never leak. The server ranks from the stored per-slice rows and cross-checks the saved order; a mismatch fails closed with `SELECTION_INCONSISTENT`. `ml/evaluate.py` on main uses the same rule and the same literal. |
| 4c | DR-010 outlier selection | **PASS** | Ranked over SUCCEEDED rows only (WITHHELD, FAILED and EXCLUDED rows are never candidates) by Dice ascending, FP+FN descending, `case_id` ascending, top 3. The ML's saved outlier list is not used. |
| 5a | INT-12, case-scoped endpoints | **PASS** | For both INT-12 runs, `analysis_run_metrics`, `analysis_slice_metrics` (every slice, both variants), `analysis_slice_error` and `error_reconstruction_get` answer `GROUND_TRUTH_UNAVAILABLE`. `require_ground_truth` runs before any artifact is read. The only other answer is `ARTIFACT_NOT_FOUND`, for invalid variant strings. |
| 5b | INT-12, `experiment_cases` | **PASS** | The INT-12 row is `WITHHELD` with `metric_values` null and an INT-12 reason. It never appears in `outlier_selection`. |
| 5c | INT-12 GT is never opened or served | **PASS** | `open()` was instrumented over app start-up and all 374 requests: the INT-12 GT file was never accessed, and the data cache has no `gt/` directory for that case. The only files opened during requests were the three metric JSONs, one metric set and the request log. The run-level provenance check compares the mask sha256 stored at ingest and reads no file. |
| 5d | N-a: does the cohort n count the WITHHELD case? | **REPORTED: yes, it is counted.** See N-1. | `successful_n` = 4 against 3 SUCCEEDED rows plus 1 WITHHELD; `metric_summary.dice.n` = 4; `experiment_compare.common_evaluation_population` includes the INT-12 case. This matches sentence 1 of `case_capability.case_level_scope` ("whole evaluation population"). It contradicts the generated fixture: there `successful_n` equals the SUCCEEDED rows (6/4 against 4 SUCCEEDED + 1 FAILED + 1 WITHHELD), and the compare population leaves out CASE_0001. In effect it also contradicts sentence 2 ("no per-case value … is served"). |
| 6 | Deploy safety (`-SkipData` onto the `a7b4950` database) | **PASS: REDEPLOY OK** | Under `backend/app` only `experiments.py` and `metrics.py` change. `storage.py`, `ingest.py`, `cases.py`, `main.py`, `config.py`, the scripts and the requirements are byte-identical to `a7b4950`. **The schema is unchanged** (`CREATE TABLE IF NOT EXISTS` plus the same ALTER list), so the deployed database opens as it is, with no migration and no rebuild. `-SkipData` unpacks the code tar in place: two modules are overwritten and nothing is added or removed. The data cache and the `var/` database are reused, the requirements are unchanged so the install step has nothing new to install, and uvicorn restarts. The host has no Contract 2 package, so expect 0 experiments, 0 runs and the same 21 cases. `__version__` is unchanged, so `/health` cannot tell the builds apart (see §4). |
| 7 | Wheel closure | **PASS (no change)** | `requirements*.txt` are unchanged. The CI closure step (CPython 3.9.6, darwin arm64) passed on `6b610bd`, and `deploy_macmini.ps1` runs it again unless `-NoWheels` or `-SkipInstall` is passed. |
| 8 | Publication hygiene of the added lines | **PASS** | Across 649 added lines: no absolute paths, IPs, emails, hostnames, usernames or URLs. The README uses `$CARDIAC_BACKEND_DATA` and `<overlay-address>`. |

## 3 · Findings

### BLOCKING
**None for the merge or the redeploy.**

### NON-BLOCKING

**N-1 · High (INT-12 / contract). The cohort aggregates include the WITHHELD case, so its per-case values are served in effect. Gate: close this before any real Contract 2 package goes on the host.**
- **Evidence (synthetic).**
  - The INT-12 case's exact 3D Dice and IoU appear verbatim as `metric_summary.dice.max` and `iou.max` in `experiment_metrics`, and in both `experiment_compare` summaries. In the synthetic data it is the best of the 4 cases.
  - n·mean − Σ(the SUCCEEDED rows that are served) gives back its Dice to within 2.2e-16, and its FP/FN voxel counts exactly.
  - With a real FINAL_HOLDOUT package the same would hold for CASE_0001.
- **Not exposed today.** The host has 0 runs, and real packages come after D24.
- **Cause.** The code serves the ML summary as it is, and the contract's two sentences cannot both hold.
- **Fix.** The leader decides N-a and amends the contract. QA recommends the fixture's arithmetic:
  - A WITHHELD case counts in `evaluation_n` but is excluded from `successful_n`, from `metric_summary`, and from the compare population and summary.
  - The backend recomputes these statistics from the per-case records, leaving the WITHHELD case out. CIs stay null unless they are recomputed.
  - Add a validator or fixture check that `successful_n` equals the number of SUCCEEDED rows.
  - Nulling min/max alone is not enough, because subtraction still recovers the values.
- **Owner.** Leader session for the decision and the contract; Nguyễn Gia Đức Trung for the implementation.

**N-2 · Low (containment; introduced here). `package_root()` can move a package's root above `experiments_root`.**
- **What happens.** The parent-directory fallback applies to every layout, not only `<run>/contract2/`. A top-level manifest whose paths resolve against the parent of the experiments root was accepted, its root was outside `experiments_root`, and its run was served (RUN_9001 metrics 200). On the host, that parent is the backend data directory.
- **Fix.** Use the fallback only when the manifest's directory is named `contract2`, and assert that the chosen root is inside `experiments_root`.
- **Owner.** Trung.

**N-3 · Low (robustness; introduced here). A malformed producer file returns a non-JSON 500.**
- **What happens.** A per-slice row without `fp` (with its checksum updated so the package still validates) made `analysis_run_metrics` answer HTTP 500 with no contract envelope.
- **Fix.** Catch `KeyError`, `TypeError` and `ValueError` in `PackageMetrics`, `metric_set` and `worst_slice_selection`, and answer `ARTIFACT_NOT_FOUND` with reason `METRICS_FORMAT_UNSUPPORTED`.
- **Owner.** Trung.

**N-4 · Low (integrity; introduced here). Metric JSON files are hashed at start-up but read later without a re-check.**
- **What happens.** They are read on the first request without re-hashing; prediction volumes, by contrast, are re-hashed.
- **Fix.** Check the bytes actually read against the manifest checksum.
- **Owner.** Trung.

**N-5 · Low (pre-existing). Immutability across restarts is not enforced.**
- **What happens.** `validate_manifest` is called without `existing`, so `CHECKSUM_CONFLICT` can never fire. A run directory replaced in place with new bytes under the same artifact URIs would be accepted on restart. The render cache notices and answers `ARTIFACT_NOT_FOUND`, but reviews would then refer to other bytes.
- **Fix.** Record `{artifact_uri: sha256}` when a package is first accepted, in a JSON file under `var/` (which needs no migration), and pass it as `existing`.
- **Owner.** Trung.

**N-6 · Low (tests).**
- **Gap.** No API test exercises DR-010's second key (FP+FN under a Dice tie) or the FP-only exclusion. The test oracle `_dr010_slices` repeats the implementation's own expression, and the synthetic per-slice data has only one kind of tie.
- **Fix.** Add a crafted per-slice case with a hard-coded expected order, like QA's `[3, 2, 4, 6, 5, 7]`.
- **Owner.** Trung.

**N-7 · Nit (INT-12 status precedence).**
- **What happens.** If the ML marks the INT-12 case FAILED, or has no record for it, its row comes back FAILED or EXCLUDED, carrying the ML's reason text. The contract's `experiment_cases` note says that row is WITHHELD. No values leak either way.
- **Fix.** Check `withheld()` first.
- **Owner.** Trung, together with N-1.

**N-8 · Nit (operability).**
- **What happens.**
  - `__version__` is still `0.1.0`.
  - The CI job name and two docstrings say "Contract 11 v1.0.0", but the service enforces 1.1.0.
  - The comment in `main.py`'s `run_case` ("experiments only serve runs of ingested cases") is out of date.
- **Fix.** Bump the version and update the labels.
- **Owner.** Trung.

## 4 · Verdict

**MERGE · REDEPLOY OK.** Conditions for the leader session:
1. **Merge.** Before merging, confirm that GitHub shows #75 as mergeable/CLEAN against the current main. It showed `UNKNOWN` right after #63 merged. Nothing under `backend/` or `contracts/` has changed on main since `a7b4950`, so the green checks still apply. If a re-run starts, wait for it to pass.
2. **Redeploy.** Run `deploy_macmini.ps1 … -SkipData` from a checkout at the merge commit, because the script packs the working tree it runs from. The local main checkout on this PC was behind `origin/main` during this review.
3. **Verify.** `/health` should show contract 1.1.0, 21 cases (20 EVALUATION, 1 INFERENCE_REVIEW), 0 experiments, 0 runs and no rejected packages. The version string does not change, so confirm the new code by its content on the host: `grep -c "dr010-worst-slice/v1" ~/<RemoteDir>/backend/app/metrics.py` should be at least 1. A result of 0 means the old stub is still running.
4. **Data gate.** Do not copy any real Contract 2 package to the host until N-1 is decided and implemented.

Trung's Day 23 revalidation should cover N-1 to N-8.

*Left in `<scratch>` (nothing deleted): the worktree `qa75b_wt` (detached at `6b610bd`), the synthetic environment `qa75b_env`, the pytest basetemp `qa75b_pytest_tmp1`, the `qa75b_*.py` scripts and their outputs. No uvicorn was started and none of these processes are still running.*
