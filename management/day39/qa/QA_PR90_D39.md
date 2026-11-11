# QA review of PR #90 (Day 39 override)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.** It replaces the human second review only under the leader's one-day recovery override, together with green CI.

- PR: #90 `fix(day23): complete Khanh owner revalidation` (author Be Quoc Khanh)
- Head reviewed: `b1529dc9e108ffc33d9e03b3f095810705be1c7f` (base `main` at `6eecb5e`; `main` has since moved to `e3417ba`)
- Diff reviewed: `git diff 6eecb5e b1529dc` (8 files, +83/-27). `docs/specs/v1.0/**` is not touched.

## VERDICT: MERGE

Blocking findings: 0.

## Conflict note

`git merge-tree --write-tree origin/main b1529dc` (run at `e3417ba`) printed a single tree id with no conflict section, so the merge is clean. `management/day22/POST_RECOVERY_REVALIDATION_DAY23.md` was edited by both sides, in different regions. I diffed the merged tree against `origin/main` for that file: only the K1-K11 rows (the owner's section) change. The leader's #85 rows (P1-P7 results, the "Da xu ly 02/10" cleanup paragraph) are all preserved. So the PR does not overwrite the leader's rows when merged.

Environment note: I ran the JS and Python tests on a `git archive` export of the merged tree (`merge-tree` output) and on the prepared PR checkout (head only, no modification; the fixture bundle was generated there, which is gitignored and allowed). Two things that depend on a real git history behave differently in a plain export: `test_preflight.py` (43/43 in the real checkout, 42/43 in a history-less export) and `ml/tests/test_train_infer.py::test_one_epoch_end_to_end` (needs a git HEAD, 207 pass in the real checkout). Both are artefacts of the export, not defects.

## Checks run

| Check | Result |
|---|---|
| `gh pr checks 90` | all 10 jobs pass (this base predates the mobile render job) |
| `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs` (head checkout) | `PASS V3 study and compare - 158/158` |
| same on the merged tree | `PASS V3 study and compare - 158/158` |
| `python contracts/ingestion/contract2_experiment_artifact/test_contract2.py` (head and merged) | `schema_errors=0`, `contract2_checks=PASS cases=9` |
| `python spikes/spike_c_ml/c1/test_preflight.py` (head checkout) | `SELF-TEST SUMMARY: 43/43 assertions passed, 0 failed` |
| `CUDA_VISIBLE_DEVICES=-1 pytest ml/tests -q -p no:cacheprovider` (head checkout) | `207 passed in 90.54s` |
| mobile `npm test` on the merged tree (with fast-png installed) | `tests 181 / pass 181 / fail 0 / skipped 0` |
| `node app/verticals/v1_case_explorer/test_case_explorer.mjs` and `node app/core/tests/run_all.mjs` on the merged tree | `91/91` and `ALL PASS - 10/10` |
| `git diff --check origin/main...b1529dc` | clean |
| Validator UTF-8 fix, run by hand with `PYTHONIOENCODING=cp1252` and a Vietnamese character in the failing path | stdout bytes are UTF-8 (`e1 bb 87` for the character), exit 2 as before |
| IPv4 scanner from #87 on `origin/main...b1529dc` | `0 private address(es)`, 255 added lines |
| Added lines grepped for local absolute paths, drive letters, adb serials | none |
| `docs/specs/v1.0/**` in the diff | none |
| Generated contract 1.1.0 enum for `prediction_variant` | exactly `["RAW", "PROCESSED"]`, so the exact-enum `readVariant` matches the contract |
| Backend variant output | `backend/app/main.py` maps Contract 2 names through `C2_VARIANT` to RAW/PROCESSED, so no live response relied on the removed aliases |

## Code review of the three fixes

- **N-11 (delta only for HEAD_TO_HEAD)**, `app/verticals/v3_study_and_compare/cohort.mjs`. The guard sits right after the "requested" check and before the withheld/comparable checks. It requires `kind === 'HEAD_TO_HEAD'` and two experiment ids. The new test (V3-15) proves TREND is refused even when the server says comparable, and the existing HEAD_TO_HEAD case still yields the 0.05 delta. Correct.
- **N-13 (exact enum)**, `readers.mjs`. `VARIANT_SPELLINGS` is now `LANE` (`{RAW, PROCESSED}`), no upper-casing. `has()` is an own-key check, so `constructor` and similar cannot match. The test now asserts `RAW_PREDICTION` and `processed` give `lane === null`. Correct. No other caller depended on the aliases.
- **N-15 (duplicate case_id)**, `readers.mjs`. Duplicate ids in `experiment_cases` give every involved row `plotState: DUPLICATE_CASE_ID`, `value: null`, a disabled intent, and `duplicateCaseIds` is exposed. Duplicate ids in an outlier selection refuse the whole selection (`OUTLIERS_DUPLICATE_CASE_ID`). Both are tested (V3-9 and the refusal table). The duplicate check runs before the cardinality-ok path and does not re-derive DR-010 on the client. Correct.
- **Contract 2 validator UTF-8**: `reconfigure(encoding="utf-8", errors="strict")` is applied in `__main__` only, so imports (the tests) are unaffected. It uses `getattr` so it is safe on streams without `reconfigure`. Verified by hand (above). The change itself has no automated test (see N-2).

## Owner revalidation rows: factual consistency

| Row claim | Verified against the repo |
|---|---|
| K1: preflight 43/43 | reproduced, 43/43 |
| K2, K9: ML 206 pass, 1 skip; K9 doc expects 207 | head checkout gives 207 passed, 0 skipped. The skip in the owner's run is environment-dependent. Consistent with the 207 the row quotes |
| K8: V3 158/158, N-11/N-13/N-15 fixed | reproduced, and the three fixes exist as described |
| K11: mobile 170 pass, 0 fail, 7 skip (fast-png not installed) | plausible for a checkout without fast-png. With fast-png installed the merged tree gives 181/0 skipped |
| K7: split sha256 `c5c65a09...396d` still pinned | matches `PINNED_SPLIT_SHA256` in `backend/app/ingest.py` and the backend README |
| K3: validator CLI did not force UTF-8, fixed in this PR | true, the fix is in the diff |
| RESULT_C1.md interpretation: DINOv2 Dice peak 0.429 at step 750 falling to 0.349; empty-slice false positives 147/148 versus 104/148; large and median groups UNet 0/4 and 0/4 below 0.5, DINOv2 1/4 and 2/4; small group 3/4 versus 4/4 | all match the existing numbers in section 2 of `management/spikes/SPIKE_C_ML/RESULT_C1.md` (aggregates only, no per-case values) |
| Commit SHAs in the rows (`0c3f847`, `b606295`, `440dab1`, ...) | not edited by this PR; they are the leader's text |

No private address, device serial, local path, or per-case metric value is added.

## BLOCKING findings

None.

## NON-BLOCKING findings

1. **N-1, the new plot state has no readable label on the phone** (`mobile/src/verticals/v3/v3View.mjs`, `rowStatusText`). The PR adds a reason string for the duplicate outlier selection (`REASON.OUTLIERS_DUPLICATE_CASE_ID`) but not for the per-case row state, so a duplicate row falls to `default: return String(row.plotState)` and the table shows the raw word `DUPLICATE_CASE_ID`. It is safe (no number is shown, the row is not linked) but not "readable screen copy". Smallest fix: `case 'DUPLICATE_CASE_ID': return 'duplicate case id - not plotted';` plus one assertion in `mobile/test/v3_screens.test.mjs`.
2. **N-2, no test for the UTF-8 fix** (`contracts/ingestion/contract2_experiment_artifact/validate_contract2.py`). A subprocess test with `PYTHONIOENCODING=cp1252` and a non-ASCII path would pin it. Verified by hand only.
3. **N-3, no test for the mobile reason string** for `OUTLIERS_DUPLICATE_CASE_ID` (the V3 model test covers the refusal, the screen copy is unchecked).
4. **N-4, document structure** (`management/spikes/SPIKE_C_ML/RESULT_C1.md`). The new `### Owner interpretation - C1-4` heading is inserted in the middle of a bullet list in section 2, so the following bullet ("The calendar fits (C1-9)...") now reads as part of the owner interpretation. Smallest fix: move the heading block to the end of section 2, after the last bullet.
5. **N-5, evidence still owed (not a defect).** K6 (DINOv2 queue logs and checkpoint hashes on the leader PC), A17 device evidence for V3, UNet queue and tripwire, and NB-2(a) remain open, as the PR body says. This PR does not claim otherwise.
