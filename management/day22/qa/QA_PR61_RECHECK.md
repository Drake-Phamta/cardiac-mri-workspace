# QA-61b: PR #61 (V3 study overview and experiment comparison), re-check after the B-1/B-2/B-3 fix · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. An LLM QA session (Claude Code, Claude Opus 5.5) under the leader's account; **not a second human reviewer**. It is the independent QA pass named in `RECOVERY_OVERRIDE_DAY22.md` §2 item 2. |
| **Target** | PR #61, branch `feat/day22-v3-study-compare`, head `478002ebaf4c4ff943d3d27602641e80370b1afe`. Four commits on base `a7b4950`. The fix commit is `478002e`. |
| **Previous QA** | The first CHAT E pass was at `4c37250` and returned MERGE AFTER FIXES (B-1, B-2, B-3). `34f30bd` is its rebased twin: `git range-diff` shows all three earlier commits as patch-identical (`=`). "Previous head" in this report means `34f30bd`. |
| **Baseline** | `origin/main` = `3c02fd2`, 9 commits ahead of the PR base. None of them touches `app/core`, `contracts/` or `.github/`; three V1 files changed. |
| **Rules applied** | API contract 1.1.0 (`contracts/api/contract.json`, the same on main and on the PR): `selection_rules.outlier_selection`, `case_capability` (INT-12), `domain_enums`, endpoint `row_fields`. DR-010 and DR-010a (`OPEN_DECISIONS.md` on main). The seven checks of the brief. |
| **Method** | Two detached worktrees in `<scratch>`: `qa61b_wt` at `478002e` and `qa61b_wt_prev` at `34f30bd`. The fixture bundle was generated in each with the PR's command. CPU only, one node process at a time, probe RSS about 40 MB. Read-only on GitHub (`gh pr view`, `gh pr checks`, `gh run view`). On `<repo>`, a `git fetch` refreshed the remote-tracking refs only; the branch and files are untouched and `git status` still shows only `?? .claude/`. No commit, push, comment or label. Mutations and the trial merge were made only in `qa61b_wt`, each reverted. That worktree ends byte-identical to `478002e`. |

> **VERDICT: MERGE AFTER FIXES.** B-1, B-2 and B-3 are fixed. Each is shown by probes that break on `34f30bd` and hold on `478002e`. Tests and CI are green, the PR merges cleanly onto `3c02fd2`, and 7 of 7 mutations are caught. **One new blocking finding, B-4:** an outlier entry that names a case which did not succeed still carries its number. This includes the WITHHELD INT-12 case. B-4 is not a regression: it is present at both heads, on a path the first pass did not probe. Five non-blocking findings follow (N-10 to N-14).

## 1 · Commands and scripts run

| # | Command (scripts in `<scratch>`) | Purpose |
|---|---|---|
| R1 | `git rev-parse`; `git log origin/main..origin/feat/day22-v3-study-compare`; `git range-diff a7b4950..34f30bd 4c37250~3..4c37250`; `git show 478002e` | Refs, rebase identity, the fix diff |
| R2 | `python contracts/api/generate_fixture.py …`; `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs`; `node app/core/tests/run_all.mjs` | Tests at the head |
| R3 | `gh pr view 61`; `gh pr checks 61`; `gh run view 36822498345` (with the job log) | CI on the head |
| R4 | `git merge-tree --write-tree origin/main HEAD`; trial `git merge --no-commit --no-ff origin/main`, then the V3, core, V1 and V4 suites, then `git merge --abort` | Merge onto current main |
| R5 | `node qa61b_probes.mjs <worktree>`, run on both heads | 40 probes: the first pass's P1–P5 and X1–X7 with the paths made parameters, and new P2e/P2f, P3g–P3i, P4g–P4i, Q1–Q6. P2d, P3f and P5e were dropped: they test #69's own vendored copy of the model, not #61. |
| R6 | `qa61b_mutate.ps1 <worktree> <log>` | 7 mutations, one at a time. Each was reverted with `git checkout --` and verified clean. |
| R7 | `git grep` over the vertical: module specifiers; the whole words react / react-native / expo | Framework neutrality |
| R8 | Scan of the 2,442 lines added by `git diff origin/main...HEAD`, and of the 4 commit messages | Publication hygiene |

## 2 · Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | **B-1** fixed: no value on a row that did not succeed | **PASS** | P2b (WITHHELD row served `dice 0.83`), P2c (FAILED row, `0`), P2e (EXCLUDED, `0.7`) and P2f (all 5 case metrics) **break at `34f30bd`**: `row.value` is 0.83, 0 and 0.7. **They hold at `478002e`:** the value is null, the row is not plotted, and it is flagged `servedValueIgnored`. V3-9 has the drift rows. Mutation M1 fails 3 checks. |
| 1b | **B-2** fixed: DR-010 selection pinned to the contract | **PASS** | P3a (`dr010-outlier/v9`), P3b (no version), P3c (no `rule_id`), P3d (`iou`), P3e (5 cases) and P3g (the worst-slice version) are all `available=true` **at `34f30bd`**. **At `478002e`** each is refused with `OUTLIERS_UNDER_ANOTHER_VERSION`, `_UNDER_ANOTHER_RULE`, `_FOR_ANOTHER_METRIC` or `_OVER_CARDINALITY`. Control P3i (the pinned block) is accepted in served order at both heads. V3-9 asserts `OUTLIER_RULE` against `contract.json`. M3, M4 and M7 are caught. |
| 1c | **B-3** fixed: a comparison answer is used only for its own variant | **PASS** | **At `34f30bd`**, a PROCESSED answer for the RAW pair RQ-A-100 gives COMPARABLE, `fair: true` and a delta of +0.05 (P4e, P4g). The SCR-01 headline shows its numbers (P4f), and a `prediction_variant: null` answer is COMPARABLE (P4h). **At `478002e`** all four are UNDECIDED, the reason names both variants, and the numbers are withheld. Control P4i (a RAW answer covering both runs) gives delta 0.05 at both heads. V3-15 covers this; M2 is caught. The first pass's N-2 (X1), N-4 (X7) and N-8 (X2, X3) also break at `34f30bd` and hold at `478002e`. |
| 2a | Vertical and core tests | **PASS** | At `478002e`: V3 `PASS 149/149`; `app/core` `ALL PASS — 10/10` |
| 2b | `gh pr checks 61` | **PASS** | 9 of 9 pass. Guardrails run 36822498345 has headSha `478002e`. Its log shows `PASS V3 study and compare — 149/149`, `ALL PASS — 10/10`, `PASS V1 73/73` and `PASS V4 4/4`. That run started at 13:00 +07, before #70, #80 and #79 merged; 2c covers the newer base. |
| 2c | Clean merge onto current main | **PASS** | GitHub reports MERGEABLE / CLEAN. `git merge-tree` exits 0 (tree `8703437`), and the trial merge produces the same tree. On the trial merge with `3c02fd2`: V3 149/149, core 10/10, V1 88/88, V4 4/4. |
| 3a | No value read from non-SUCCEEDED rows, anywhere | **FAIL → B-4** | The rows are fixed (1a). The outlier path is not: an `outlier_selection` entry naming a WITHHELD or FAILED case keeps its `metric_value` (Q1, Q2, Q4), at both heads. |
| 3b | DR-010 pinned and matching DR-010 / DR-010a | **PASS** | `OUTLIER_RULE` = {`DR-010`, `dr010-outlier/v1`, `dice`, 3}, which equals `selection_rules.outlier_selection`. Its text matches DR-010's approved outcome: the three lowest case-level 3D Dice among successfully evaluated cases, for an explicit experiment and variant, ties broken by FP+FN descending then `case_id`. DR-010a concerns the worst-slice transport (`dr010-worst-slice/v1` on `analysis_run_metrics`). V3 does not read that block and refuses its version as an outlier selection (P3g). DR-010's "successfully evaluated only" clause is not enforced on the client; that gap is B-4. |
| 3c | Comparisons only between runs of the same variant | **PASS** (one note) | Head-to-head and trend answers served for another variant, or none, are UNDECIDED with numbers withheld (P4e–P4h, V3-15). Metrics served for another variant are refused (P4a/b, M5). Rows for another variant are listed but not drawn or linked (P4c). Outliers for another variant are refused (P4d). RQ-B keeps its served verdict label: see N-10. |
| 3d | An empty experiment or case list is a legitimate absence | **PASS** | V3-13 and V3-14 (V3-14 is now mandatory). Q6a: SCR-07 with empty cases gives a LOADED cell with `NO_CASE_RESULTS` and outliers `NO_ELIGIBLE_CASES`. Q6b: SCR-01 shows the study as SUCCESS with outliers `NO_ELIGIBLE_CASES`. Q6d: an empty MATRIX list gives `EMPTY_UNAVAILABLE` / `NO_EXPERIMENTS_LISTED`. |
| 4 | Contract 1.1.0 conformance, WITHHELD included | **FAIL → B-4** | Every field read is a 1.1.0 field: <br>• `study_get`: `study_id`, `dataset`, `case_counts`, `capabilities`, `experiment_summary` <br>• `experiment_list`: `items[].experiment_id` and `.prediction_variant`, `evaluation_population` <br>• `experiment_get`: its 10 response fields <br>• `experiment_metrics`: `evaluation_n`, `successful_n`, `metric_summary` (by `summary_statistics`), `prediction_variant`, `metric_version` <br>• `experiment_cases`: the `row_fields`, `metric_version`, `prediction_variant`, and `outlier_selection` (its `block_fields` and `case_fields`) <br>• `experiment_compare`: `comparable`, `compatibility_reason`, `common_evaluation_population`, `prediction_variant`, `summary` <br>• `findings_list`: `finding_id`, `status` <br>Status is read against `case_result_status` using own keys only. **WITHHELD rows produce no value and no point:** P2a/P2b, V3-4 on the generated CASE_0001 row, and V3-9. **The INT-12 case still gets a number through `outlier_selection`:** Q1 shows rank 0, Dice 0.42, FP 31, FN 12, with an enabled intent. Leniencies are covered in N-13. |
| 5 | Framework neutrality | **PASS** | The only specifiers are `../../core/index.mjs`, `./cohort.mjs`, `./experimentCompare.mjs`, `./index.mjs`, `./readers.mjs`, `./strip.mjs` and `./studyOverview.mjs`, plus `node:fs` in the test file only. The whole words react, react-native and expo appear nowhere in the vertical. V3-12 and CI's framework-neutral job pass. |
| 6 | Test strength | **PASS** | All 7 mutations caught: <br>• M1 (value read from a FAILED row): 3 V3-9 checks fail <br>• M2 (variant check dropped in `readComparison`): 3 V3-15 checks fail <br>• M3 (version pin removed): 2 fail <br>• M4 (cardinality pin removed): 1 fails <br>• M5 (metrics-variant guard removed): V3-1, V3-3 and V3-5 fail, then a TypeError in V3-5; exit 1 <br>• M6 (stale guard removed): V3-16 fails <br>• M7 (absent `rule_id` accepted): 1 fails <br>Every revert was verified: `git status --porcelain` is empty and the files hash-equal to the backups. **Gap:** no test covers outlier eligibility (B-4). |
| 7 | Publication hygiene of the added lines | **PASS** | 2,442 added lines and 4 commit messages, 0 hits for: drive or home paths, AppData/temp, user or host names, IPv4, e-mail, secret-like tokens, scratch/worktree. The only non-ASCII characters are `§ · á —`. The only decimals with 3+ digits are the golden-ratio constant and a synthetic mean (0.6933). |

## 3 · Findings

### BLOCKING

**B-4 · BLOCKING (medium; INT-12 and contract eligibility). An outlier entry naming a case that did not succeed passes with its number.**
- **What happens.** `buildCell` reads the server's block through `readOutlierSelection`. That function checks rule, version, metric, experiment, variant and cardinality. It never compares the named cases with the rows of the same `experiment_cases` response.
- **Evidence.** Identical at `34f30bd` and `478002e`.
  - **Q1.** The rows hold CASE_0001 as WITHHELD (INT-12) with `metric_values: null`. The selection names it at rank 0 with `metric_value 0.42`. Result: `outliers.available` is true, the entry's value is `{available: true, value: 0.42}`, FP is 31, FN is 12, and the intent is enabled. The row itself correctly has no value and no point, so the chart and the outlier list disagree.
  - **Q4.** SCR-01 end to end: the outlier entry list for EXP-U-100 reads `CASE_0001:0.42, CASE_0003:0.55, CASE_0004:0.6`.
  - **Q2.** A FAILED case named with `metric_value 0` is shown as 0. That is the "failed reads as 0" that B-1 removed from the rows.
  - **Q3 (info).** A case that is absent from the rows is accepted too.
- **Why blocking.**
  - **The brief and the contract.** It fails check 4 as briefed: a WITHHELD row must never produce a number. It breaks INT-12 (`case_level_scope`: "no per-case value of an INFERENCE_REVIEW case is served"). It silently accepts a selection that violates `outlier_selection.eligibility` ("FAILED, EXCLUDED and WITHHELD rows are never candidates").
  - **Consistency.** It is the harm B-1 was blocked for, reached through a second path. It also contradicts the vertical's own README rule: "a per-case value exists only on a SUCCEEDED row".
  - **The path is realistic.**
    - `ml/evaluate.py` on main ranks outliers over every SUCCEEDED record and has no INT-12 handling.
    - The backend's `experiment_cases` still answers `ARTIFACT_NOT_FOUND` (`METRICS_NOT_INGESTED`), so the ingestion that will map the ML block into the API does not exist yet.
- **Fix** (leader's session today, A6 lane; Khánh adopts on D23).
  - **Code.** In `buildCell`, only when `casesMatch`: if any outlier `case_id` is not a SUCCEEDED row of the same response, refuse the **whole** selection with a new `UNAVAILABLE` reason, and report the offending ids in `served`. Do not drop the entry: an edited selection is a client re-derivation, which DR-010 forbids.
    ```js
    if (outliers.available) {
      const ok = new Set(cases.rows.filter((r) => r.status === ROW_STATUS.SUCCEEDED).map((r) => r.caseId));
      const bad = outliers.cases.filter((c) => !ok.has(c.caseId)).map((c) => c.caseId ?? '?');
      if (bad.length) outliers = Object.freeze({ available: false, reason: UNAVAILABLE.OUTLIERS_NAME_INELIGIBLE_CASE,
        ruleId: OUTLIER_RULE.id, cases: Object.freeze([]), served: bad.join(', ') });
    }
    ```
  - **Tests.** Add V3-9 checks through `buildCell` that refuse the WITHHELD CASE_0001 with 0.42 and a FAILED case with 0. Add one SCR-01 check that the outlier entry is unavailable with this reason.
  - **README.** Add a row to the rules table.
  - **Pagination caveat.** Once `experiment_cases` is paged (README TODO 6), the test "not a SUCCEEDED row of this response" must become "not a non-SUCCEEDED row of this response", or the check must move to the server.
- **Re-verification.**
  - Run `qa61b_probes.mjs` on the new head: Q1, Q2 and Q4 must hold, and the other 37 must stay held.
  - The V3 suite must be green.
  - CI must be green on the new head. That push also re-runs CI against the current main.

### NON-BLOCKING

**N-10 · NON-BLOCKING (medium, labelling). RQ-B keeps a "fair" label from an answer that cannot describe it.**
- `readComparison` withholds RQ-B's numbers (`MIXED_VARIANT_COMPARE_UNDEFINED`) but keeps the served verdict.
  - A `comparable: true` answer for RAW gives COMPARABLE, `fair: true`, on EXP-D-100 / EXP-D-PP, and so does one for PROCESSED (Q5).
  - The same happens when EXP-D-PP's own metrics were refused as VARIANT_MISMATCH (Q5b).
- Contract 1.1.0 gives a compare a single `prediction_variant`. By the fix's own B-3 reasoning, neither answer describes "RAW vs PROCESSED". No number is shown, so the risk is a "comparable" badge on the ablation in SCR-01's headline.
- **Fix (Khánh, D23):** in the `lane === null` branch, return UNDECIDED with the mixed-variant reason until the contract defines a mixed compare. The contract side is already routed to Trung (README N-7).

**N-11 · NON-BLOCKING (low). `delta()` on a three-run TREND answers for the first two runs only.**
- `deltaFor` takes `experimentIds[0]` and `[1]`. For a COMPARABLE RQ-A-TREND-UNET that covers all three runs, it returns `allowed: true`, 025 → 050, +0.05, and silently ignores 100 % (X6, both heads).
- **Fix (Khánh, D23):** allow `deltaFor` only for HEAD_TO_HEAD comparisons, or only for exactly two ids. A trend is drawn by `buildTrend`.

**N-12 · NON-BLOCKING (medium, cross-lane; not a #61 defect). The ML outlier block on main does not match the contract block V3 pins.**
- `ml/evaluate.py` emits `rule_id "DR-010-outlier"` and `selection_version "dr010-outlier/1.0.0"`, uses the case fields `dice_3d` and `fp_fn_voxels`, and has no `experiment_id`, `prediction_variant` or `metric_name`. The worst-slice block in the same file already uses the contract's literal values.
- V3 refuses the ML ids (P3h: `OUTLIERS_UNDER_ANOTHER_RULE`). That is correct, but it means outliers stay unavailable on SCR-01 and SCR-07 until ingestion maps the block.
- **Fix:**
  - Khánh (`ml/`): emit `selection_rules.outlier_selection` literally.
  - Trung (backend ingestion): serve the block per experiment and variant, selecting only over SUCCEEDED rows that are not the INT-12 case. Otherwise B-4's case occurs on the server side.

**N-13 · NON-BLOCKING (low, conformance leniency; info).**
- `readVariant` maps `RAW_PREDICTION`, `PROCESSED_PREDICTION` and any letter case onto the two lanes. The contract enum is `RAW | PROCESSED`. It never maps a variant to the wrong lane.
- `readPopulation` reads `manifest_id`, `id`, `n` and `case_count` from a population object. The contract defines no shape for `evaluation_population` or `common_evaluation_population`.
- **Fix:** Khánh (D23) accepts only the enum, or flags any other spelling as drift. Trung defines the population shape in the contract along with the README N-7 gaps.

**N-14 · NON-BLOCKING (info).** Still open, as documented for D23 in README TODO 7. These are not regressions.
- **N-5:** count metrics fall off Dice's [0, 1] axis (X4: `false_positives` and `relative_volume_error` put all 4 points off-axis).
- **N-6:** the list's population is attached to an id the list does not contain (Q6c: EXPLICIT mode with an empty list still shows FINAL_HOLDOUT).

## 4 · Housekeeping

- **Left in place, nothing deleted:**
  - two detached worktrees registered in `<repo>`: `<scratch>/qa61b_wt` (at `478002e`) and `<scratch>/qa61b_wt_prev` (at `34f30bd`), each with a generated, gitignored fixture bundle;
  - the `qa61b_*` scratch files: probes and their outputs, the mutation script and its log, `qa61b_bak/` (copies of three source files), and exported copies of main's decision documents.
- The leader can run `git worktree remove` on the two worktrees when done.
- The first-pass `qa61_*` files were only read.
- `qa61b_probes.mjs` and `qa61b_mutate.ps1` take the worktree path as an argument and contain no machine paths, so they can be archived as they are.

**VERDICT: MERGE AFTER FIXES**
1. Fix B-4 as above: refuse the selection when it names a non-SUCCEEDED case, and add the tests and the README row.
2. Get CI green on the new head.
3. Re-run `qa61b_probes.mjs` on the new head; all 40 probes must hold.

N-10, N-11, N-13 and N-14 go to Khánh's D23 packet. N-12 goes to Khánh (`ml/`) and Trung (ingestion).
