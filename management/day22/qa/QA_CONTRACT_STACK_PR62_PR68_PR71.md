# QA: contract stack #62 → #68 → #71 (contract 1.1.0) · verdict on the contract: **MERGE**

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewed | **#71 @ `707916f9cf51…`** (`0df8cab` + `707916f`), as its delta over **#68 @ `7c19a11`**. Also #62's new commit **`7900fc1`** (V1 tests only). |
| Identity with what I first reviewed | `git range-diff 21d22dc..f54eed0 7c19a11..707916f`: both commits `=` (`a45be66=0df8cab`, `f54eed0=707916f`). Also checked: #62 `ac4b355=02b03ad`, `a1b0b40=7c77411`; #68 all 3 `=`. `git diff f54eed0 707916f -- contracts backend app/core` is **empty**. |
| Main | the stack is based on `6b52628`; main is now **`440dab1`** (#64 added `ml/` only). No conflicts. |
| Where | my own worktree, detached, merges with `--no-commit` then `--abort`. It ends clean at `707916f`. **One test process at a time.** I did not touch the GPU job (the spike C1 python process). |
| Reviewer | **CHAT E**: an LLM QA session under the team leader's account. **Not a human reviewer, not a GitHub approval.** Nothing was committed, pushed, approved or commented. |
| CI | #71 @ `707916f` **9/9 SUCCESS**, including "backend tests (Python 3.9)". #62 @ `7900fc1` **8/8**. |

## 1. Checks

| # | Check | Result |
|---|---|---|
| 1 | Tests at `707916f` | **PASS** |
| 2 | Tests merged with main `440dab1` | **PASS**, identical results |
| 3 | Generator determinism | **PASS**: 4 runs, same SHA |
| 4 | Python 3.9 | **PASS**, runtime evidence from CI |
| 5 | Publication hygiene | **PASS** |
| 6 | Version discipline | **PASS** (stale labels only, N-h) |
| 7 | Validator probes (`probe_v11.py`) | 51/62 as expected; the 11 misses are coverage gaps N-c, N-d and N-e, none blocking |
| 8 | app/core transport and loader probes | 41/46; the 5 misses are the unchanged N7 |

Detail:

- **Tests at `707916f`:**
  - `test_api_contract.py`: PASS, cases=34, 77 scenarios.
  - Validator CLI: `PASS: API Contract 11 1.1.0; 28 endpoints (23 hero-flow), 15 errors`.
  - Contract 1 and Contract 2: PASS.
  - app/core: 10/10. V4 on main: 4/4. **V1: 73/73.**
  - Backend: `pytest backend/tests` **44 passed** (local Python 3.12).
- **Merged with `440dab1`:** same results. `ml/tests` 90 passed as a sanity check.
- **Determinism:** the bundle SHA was `C15E9001…` on all 4 runs, on the head and on the merge.
- **Python 3.9:** the CI backend job runs on Python 3.9 and imports `validate_api_contract.validate_response` through `backend/tests/conftest.py`. My static scan (grammar and runtime constructs) of `contracts/**` and `backend/**` is clean; its one hit was a false positive (a set union).
- **Hygiene:** the added lines contain no IPs, hosts, users or absolute paths. The only matches are the placeholder `.local` schema `$id` and the existing "ZeroTier" wording.
- **Version pins:** all 1.1.0 and consistent — `contract.json`, the schema `const`, the validator `EXPECTED_VERSION`, `app/core` `EXPECTED`, the `FORMAT.md` example, the backend `EXPECTED_VERSION`, the tests (which read the version from the contract) and the generated bundle.
- **app/core probes:** 1.1.0 empty pages and missing row/top-level fields behave correctly. Enum enforcement is still absent (N7, unchanged).

## 2. `7900fc1` (V1 tests only)

**PASS.**
- It changes one file, `test_case_explorer.mjs`, by 11 lines added and 11 removed. The `index.mjs` blob is identical to main's, so the **model is untouched**.
- Every new expectation is derived from the bundle or the contract:
  - V1-3 and V1-20 use the `case_get` scenario `inference_review`;
  - V1-19 reads `runData.attempt_no` and `caseData.mode`;
  - V1-21 reads `content_url` and `media_type` from `mri_slice_get`.
- V1 is 73/73 against the 1.0.0 bundle (at `7900fc1`), the 1.1.0 bundle (at `707916f`), and merged with `440dab1`.
- Nits (owner: the leader, as V1 owner):
  - the V1-21 header comment still says "DRAFT v0 does not";
  - `predictionRef.contentUrl` is only checked with `typeof`; it could compare with `prediction_slice_get`'s `content_url`.

## 3. #62 QA items, as claimed

| Item | Verified |
|---|---|
| **B1** | ✓ `experiment_list.row_fields` = `[experiment_id, prediction_variant]` with an enum binding. `evaluation_population` is top-level, "shared or null", stated in the notes; the backend emits it that way. A row missing its variant is drift; `RAW_PREDICTION` is rejected. Both the generator and the backend serve a mixed list (RAW plus EXP-D-PP as PROCESSED). Negative test present. *Gap:* the contract check does not pin the row placement (N-e). |
| **B2** | ✓ Every point is in place: |
| | • `review_rules.corrected_only_via = review_commit` and `commit_atomicity`, plus the notes and the endpoint notes. |
| | • `review_patch` → CORRECTED is always INVALID_REVIEW_TRANSITION (backend `patch_review`). |
| | • The commit dropped INVALID_REVIEW_TRANSITION from its errors and returns `status: CORRECTED` (bound, and checked by the validator). |
| | • `review_status_transitions` still equals 05 §6 (schema `const`; mutations rejected). |
| | • The backend commit runs in one `BEGIN IMMEDIATE` transaction: insert the version and its slices, set CORRECTED with revision+1, write history, clear working slices. The id is new per commit (`RM_<rid>_V<n>`). |
| | • `test_commit_is_atomic`: a failed build leaves status, revision and versions untouched, and the retry succeeds. *Only a failure before any write is injected* (N-f). |
| N1 | ✓ The validator checks `mode` against `ground_truth_available` on `case_get` and on `case_list` rows (both directions probed). The backend table test covers all 7 endpoints. The 5 case-scoped ones answer GROUND_TRUTH_UNAVAILABLE. The 2 experiment-level ones are **vacuous today**, because every metric endpoint answers ARTIFACT_NOT_FOUND until PR 3. |
| N2 | ✓ `review_source_mask_kind` = RAW/PROCESSED_PREDICTION is enforced on the commit's `source_mask_kind`, on commit provenance, and on `reviewed_masks_list` row provenance. GROUND_TRUTH and REVIEWED are rejected. |
| N3 | ✓ README deviations table. *But* it says the metric-name map is "`METRIC_SOURCES` … tested", and **no `METRIC_SOURCES` exists in `backend/`** (N-g). The names it cites do match `ml/evaluate.py` on main. |
| N5 | ✓ "Known gaps after 1.1.0". The outlier transport gap from #62 is now closed by 1.1.0 (b). |
| N9 | ✓ 16 parametrized (from, to) PATCH pairs, each asserting "nothing moved" on refusal, plus a commit from each of the 4 states. All pass. |

## 4. The 1.1.0 additions

"✓ all" means present and consistent in `contract.json`, `schema.json`, the validator, the generator, app/core and the README.

| | Consistency across artefacts | Specs (11, 05, 07, 08) |
|---|---|---|
| **(a)** metric summary `{n, mean, std, median, q1, q3, min, max, ci95_low, ci95_high}`; compare summary per id; `experiment_cases` rows gain `analysis_run_id` and `metric_values` (null unless SUCCEEDED); status SUCCEEDED/FAILED/EXCLUDED/WITHHELD | ✓ all. app/core checks only the generic row fields. *Gaps:* the top-level `experiment_cases.prediction_variant` is unbound (N-d); compare-summary keys are not checked against the requested ids. | ✓ 08 (mean/SD/median/distribution; failed and excluded cases stay visible). It now meets 11 §5's "per-case metrics". **The INT-12 meaning of N is unpinned (N-a).** |
| **(b)** `outlier_selection` on `experiment_cases` | ✓ contract, schema `const`, generator ranking (exercises the tie-break) and README. The validator checks order, eligibility and at most 3 cases, but **not** cardinality, truth or consistency (N-c). | **Matches DR-010 as written** (OPEN_DECISIONS §DR-010): the 3 lowest case-level 3D Dice values, ties by higher FP+FN then case_id, FAILED and EXCLUDED never qualify, experiment and variant explicit. **Added: WITHHELD is excluded**, which INT-12 requires but DR-010 does not say (N-b). |
| **(c)** `experiment_get` echoes the id; the `processed_variant` scenario (EXP-D-PP as PROCESSED) | ✓ generator and tests; the scenario validates. The "echo" is fixture-internal: a client asking another id still gets `EXP_DEMO`. | ✓ 08 §2 |
| **(e)** finding `prediction_variant`, required with a run and null otherwise | ✓ request binding and `evidence` shape, validator rule, generator. The backend validates it (422 without a variant, with a variant but no run, or for a variant the run lacks), has a column migration and an immutability trigger, and tests all of it. | Additive to the 05 Finding; supports 11 §9. Minor: there is no REVIEWED variant, so a finding on the reviewed layer cannot be anchored (10, active variant raw/processed/reviewed). |
| **(f)** commit semantics, a new id per commit, the fixture | ✓ the fixture commit is `REVIEWED_MASK_0043_R2` with parent `R1`, never a listed id; the backend uses `RM_<rid>_V<n>` | ✓ 05 §6 persistence rules and "each save creates a new version"; 11 §8 |

## 5. Compatibility, each merged with `707916f` + main `440dab1`

| PR | Result | Must change |
|---|---|---|
| **#53 V1** (on main) | 73/73, fixed by `7900fc1` | Nothing more. |
| **#61 V3** `7645892` | **Conflicts with main itself** in `.github/workflows/guardrails.yml`; this is not caused by the stack. On a two-way merge with #71: **17 of 118 fail**. | Rebase. Then update the fixture expectations: |
| | | • V3-1: typed `dataset`, `case_counts.total`, and OPEN findings. |
| | | • V3-1 and V3-3: **EXP-D-PP is now listed**, so its 08 §2 cell is LISTED. |
| | | • V3-4 and V3-8: N is typed 6/4, `metric_summary` uses the adopted shape (V3's `readMetricSummary` already parses it), and SUCCEEDED is a known row status. |
| | | • V3-4: the outlier block's `experiment_id` is the fixture's `EXP_DEMO`, so asking for EXP-U-100 gives `OUTLIERS_FOR_ANOTHER_EXPERIMENT`. |
| | | • V3-7. |
| | | Also update `PROPOSED_SHAPES`: `metrics`→`metric_values`, plus `selection_version` and FP/FN per outlier case; no `study_get` carrier. **Owner A6 (Bế Quốc Khánh).** |
| **#63 V4** `9743801` | review 29/29, brush 22/22, findings 20/20, app/core 10/10, V1 73/73. Commit→CORRECTED, the DR-009 scope and echoing the geometry status are now right. | **(1) `findings.mjs` `createRequestBody` omits `prediction_variant`.** A live 1.1.0 backend answers **422 VALIDATION_ERROR** for every run-anchored finding; fixture tests cannot see this. Add it, and read `evidence.prediction_variant`. (2) Remove CORRECTED from the PATCH targets in `transitionsFrom` (`corrected_only_via`); it is unreachable in practice. **Owner A5 (Nguyễn Gia Đức Trung).** |
| **#65 mobile** `8170183` | 64 pass, 1 skipped, 0 fail, alone and merged | None. |

## 6. Findings

**BLOCKING (contract): none.**

**NON-BLOCKING.** Owner is **A3 / Nguyễn Gia Đức Trung** unless stated. N-a, N-b and N-c should land **before PR 3 serves real metrics**.

1. **N-a. INT-12 and cohort N.**
   - `case_level_scope` says the cohort summaries use the *whole* population, which includes the WITHHELD case. But the fixture serves `evaluation_n` 6 / `successful_n` 4 / summary n 4 next to a WITHHELD row, which is the opposite reading.
   - Also, per-case values for every other case, together with the mean and n, give the withheld case exactly: n·mean − Σ(others).
   - Fix:
     - state that `successful_n` and the summary n include an evaluated WITHHELD case;
     - set the fixture to 5/5;
     - record that INT-12 hides the case in the app but does not blind it.
2. **N-b. DR-010 amendment not recorded.** WITHHELD is excluded from outlier candidates. Record it in the README deviations and have the leader note it on DR-010.
   - `ml/evaluate.py` (#64, on main) uses `rule_id "DR-010-outlier"`, `selection_version "dr010-outlier/1.0.0"` and the keys `dice_3d`/`fp_fn_voxels`, and has no notion of WITHHELD. PR 3 must re-derive the selection rather than pass it through, and the literals should be aligned.
   - Owner A3 with A1 (Khánh).
3. **N-c. `validate_response` outlier checks are incomplete.** It accepts:
   - 0–2 cases although 4 rows are SUCCEEDED;
   - a selection that is not the true bottom three;
   - `metric_value`/FP/FN that differ from the row;
   - `experiment_id` or variant that differ from the page.
   All of these can be checked from the same response body.
4. **N-d. Unbound variant fields.** `prediction_variant` on `experiment_cases` (new), `experiment_get`, `experiment_metrics` and `experiment_compare` accepts any string (BOGUS and RAW_PREDICTION were accepted). Add them to `enum_bindings`.
5. **N-e. Two structural gaps.**
   - `validate_contract` accepts `experiment_list.row_fields` reverted to `[experiment_id]`; the B1 negative test also removes the binding, so it does not catch this.
   - `validate_response` accepts a `review_patch` 200 with `status: CORRECTED`, which 1.1.0 makes impossible.
   - Each is a one-line rule.
6. **N-f.** The atomicity test injects its failure only in `build()`, before any write. Add a failure in the middle of the transaction (for example on the second slice insert) to prove rollback.
7. **N-g. README accuracy.**
   - The `METRIC_SOURCES` claim is false today; it should say "planned in PR 3".
   - "Every change is additive" is not quite true. `experiment_list.prediction_variant` moved from the top level into rows, and a run-anchored `finding_create` now requires a variant. This is harmless because 1.0.0 and 1.1.0 land together, but it is exactly what #63 must act on.
8. **N-h. Stale "v1.0.0" labels.**
   - CI job name "backend tests (Python 3.9, Contract 11 v1.0.0)" and its comment;
   - `backend/tests/conftest.py`, `backend/app/__init__.py` and `main.py` docstrings;
   - the `validate_api_contract.py` docstring and `--help` text.
   - Rename the CI job only if it is not a required-check name.
9. **Carried from #62, unchanged:**
   - N6: `analysis_run_create.status` is unbound and the fixture still says IN_PROGRESS;
   - N7: app/core does not enforce enums (APPROVED, IN_PROGRESS and EVAL all give SUCCESS);
   - N8: `metric_values.hd95` is accepted while geometry is not validated.

## 7. Verdict

**MERGE the stack #62 (`7900fc1`) → #68 (`7c19a11`, re-checked by the other QA) → #71 (`707916f`), as far as the contract is concerned.**

- Both #62 blockers are fixed and verified by tests and probes.
- N1, N2, N3, N5 and N9 are in place, with the caveats above.
- The 1.1.0 additions are consistent, and the DR-010 outlier rule matches DR-010, apart from the WITHHELD exclusion which still has to be recorded.
- All tests are green on the head and on current main, and CI is green.

Merge-order note: if #68 is squash-merged, a plain merge of #71 brings #68's three original commits back into main's history (same content, so no conflict, but duplicated history). Rebase #71 onto main after the squash and re-check `range-diff` (expect `=`), or squash #71 too.

Downstream before their CI goes green:
- **#61**: rebase plus the 17 V3 expectation updates;
- **#63**: `prediction_variant` on `finding_create`, which is a live-backend break;
- **#65**: nothing.

---
*Local note for the caller, not for publishing: the probe and run scripts are in this session's scratchpad `qa62/` (`probe_v11.py`, `suite2.ps1`, `compat3.ps1`, `lib.ps1`, `cdiff.py`). The worktree `.claude/worktrees/agent-ae2edec90821db32a` is detached at `707916f` and clean.*
