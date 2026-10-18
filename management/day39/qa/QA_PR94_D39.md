# QA review: PR #94 (DR-017, DR-018 validator, QA-075 N-7, DR-022)

> **Record note.** LLM QA report (CHAT E role, an agent under the leader's account, not a human reviewer), returned on 2026-10-18 under the Day 39 override. Local paths are redacted (`<scratch>`, `<repo>`, `<data>`, `<runs>`); nothing else is edited.

**LLM QA (CHAT E role), not a human review.**

- Branch: `feat/dr017-dr018-backend-holdout`
- Head SHA: `c625083a9a23a3ccc4ca1283062351077e8baa8b` (merge of main `f08968a` is in; merge-base = origin/main)
- Date: 2026-10-18
- Reviewer stance: adversarial; read-only on the checkout.

## Verdict: MERGE

**BLOCKING: 0.** Eight non-blocking items, none of which changes what numbers or which cases the app serves today.
Real exported packages (EXP-D-025/050/100/PP) pass the new validator and load into the real backend code.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `case_level_scope` matches DR-017 item 3 | PASS | `contracts/api/contract.json`: sentence 2 reads "No per-case value of an INFERENCE_REVIEW case is served; the cohort statistics include it, so its values can be derived from them (DR-017 ...)". Same meaning as the decision (generalised from "the case" to "an INFERENCE_REVIEW case"). `summary_rule`, `experiment_metrics`/`cases`/`compare` notes and `withheld_ground_truth_rule` agree. |
| 1b | Generator deterministic, 5/5 | PASS | Three generations (two by me, one the committed-path regeneration) have identical sha256. `evaluation_n` = `successful_n` = 5, every summary `n` = 5, compare population `CASE_0001..CASE_0005`, CASE_0001 row `WITHHELD` with `metric_values` null; outlier = 0005, 0003, 0004 (the 0.6 tie broken by FP+FN descending). `with_failure` scenarios give 6/5 and a FAILED row. |
| 1c | No per-case value of CASE_0001 served, any path | PASS | Walked every route in `backend/app/main.py`. `analysis_run_metrics`, `analysis_slice_metrics`, `analysis_slice_error`, `error_reconstruction_get`, `ground_truth_slice_get` all call `require_ground_truth`. `CaseStore` refuses to start if an inference-only case has `ground_truth_available`, GT slices, `reference_mask_id` or `mask_sha256`. `experiment_cases` checks `withheld()` first. Outlier candidates are SUCCEEDED rows only. `compare`/`experiment_metrics` expose only aggregates (by DR-017 design the aggregates include it, so the value is derivable). Prediction, review and reconstruction routes carry masks, not metric values. I found no leak. |
| 1d | Real-data check of 1c | PASS | Copied EXP-D-100 and EXP-D-PP (read-only source) into the scratchpad, loaded them with the real `ExperimentStore`/`MetricsService`: 54/54 and 54/54, CASE_0001 `WITHHELD` with null values, 53 SUCCEEDED rows, outliers `CASE_0029, CASE_0011, CASE_0045` (no CASE_0001), CASE_0001 in the compare population. Both packages accepted by the loader (`rejected == []`). |
| 2a | QA-075 N-7 precedence | PASS | `backend/app/metrics.py` checks `withheld()` before FAILED and EXCLUDED; the row carries the backend's own reason (the ML's failure text never reaches it). `test_withheld_case_wins_over_a_recorded_failure_or_nothing` covers a failure, no record, and a record; an ordinary case in the same position stays FAILED. |
| 2b | N-c outlier validator | PASS | `_check_outliers` now requires exactly the three lowest-Dice SUCCEEDED rows, using the same key as the backend ((dice, -(FP+FN), case_id)), values and run ids equal to the row, no case twice, variant equal to the page's. Ties: the full-key sort resolves them identically in the backend and the validator (fixture has a real 0.6 tie). Empty rows require empty `cases`. 6 new mutation cases in `test_api_contract.py` are refused. Gap: `experiment_id` only non-empty (NB-6). |
| 3a | DR-018 four checks + FAILED refusal | PASS | `validate_contract2._check_completeness`: runs + listed failures = `num_test_cases`; each population case exactly once (run xor failure, no repeats, none outside); population of the metrics artifact = population manifest; artifacts owned by one run, case and run ids match, URI under the run; mask kind vs variant (metric sets, reconstructions, PROCESSED must have processed mask). `status != SUCCEEDED` refused. |
| 3b | Real packages pass | PASS | Ran `validate_contract2.py --manifest ... --root <run dir>` on `<runs>\EXP-D-025`, `-050`, `-100` (111 artifacts each) and `EXP-D-PP` (165 artifacts): all `PASS`, 54 runs + 0 listed failures. Their export records carry `holdout_authorization_record_sha256` `dea2327f...`, equal to the sha256 of the committed record. |
| 3c | Mutation probes on real manifests (my own script) | PASS | On EXP-D-100 and EXP-D-PP, in memory: dropped run, FAILED run, swapped case_id, duplicate case, one mask shared by all runs, flipped metric `prediction_mask_kind`, `num_test_cases` 53, flipped variant: 8/8 refused with a sensible code; baseline accepted. |
| 3d | Failed-case and PROCESSED exports | PASS | `ml/tests/test_export_contract2.py` (inside the 263-test ml run) exports a failed case without a run and listed in the failures, and validates it with this validator: PASS. EXP-D-PP is covered by 3b. |
| 4a | Ingest refuses without a valid CLOSED record | PASS | `load_holdout_authorization` runs before anything is written; needs file, strict JSON (no duplicate keys, no NaN), `format`, `gate`, `gate_status == CLOSED`, `split_sha256 ==` pinned. Flag/record mismatch refused (`HOLDOUT_AUTHORIZATION_UNUSED`/`_REQUIRED`). Real committed record (`management/day39/gate_img_01/holdout_authorization.json`) accepted. Weakness: only these four fields are checked (NB-1). |
| 4b | `CaseStore` startup refusals | PASS | No record: old rule (at most one holdout case, no GT, INFERENCE_REVIEW). With record: format/gate/status/split-sha/record-sha shape checked; `inference_only_case_ids` required and non-empty; any designated or INFERENCE_REVIEW case with GT or a non-INFERENCE mode refuses; non-designated holdout cases must be EVALUATION. Tests cover each. Gap: designation comes from the cache index, not hard-wired to CASE_0001 (NB-2). |
| 4c | CASE_0001 always INFERENCE_REVIEW without GT | PASS | `rule_based_selection` lists it once, INFERENCE_REVIEW, never in the `FINAL_HOLDOUT` additions; ingest does not open its GT; test asserts `mask_sha256` None and no `gt` directory. |
| 4d | No `ml/` import; Python 3.9 | PASS | No `ml` import in `backend/`. `ast.parse(feature_version=(3,9))` clean on all 11 changed `.py` files; all have `from __future__ import annotations`; no `match`, `X | Y` at runtime, `strict=`, etc. in the diff. CI job "backend tests (Python 3.9 ...)" passes at this head. |
| 4e | Record path handling | PASS with note | Absolute path: only the file name is recorded (tested); relative path recorded as given. A relative path with `..` is recorded verbatim (NB-3). |
| 5 | Tests | PASS | `test_api_contract.py`: PASS cases=34. `test_contract2.py`: PASS cases=9, dr018_checks=PASS. `pytest backend/tests`: 74 passed. V3 study and compare: 160/160. `app/core/tests/run_all.mjs` (fixture regenerated first): 10/10. Mobile `npm test`: 194/194; `npm run test:render`: 113 checks PASS. `pytest ml/tests` (CUDA off): 263 passed. `gh pr checks 94`: 11/11 pass. |
| 6 | Hygiene | PASS | No IPs, serials, absolute paths, drive letters or per-case values in the diff (grep). The fixture values are synthetic. No file under `docs/` touched; "frozen spec checksums (19/19)" and "no PR touches docs/specs/v1.0" pass. `OPEN_DECISIONS.md` is append-only (63 insertions, 0 deletions). API version stays 1.1.0, argued in the contract README and consistent with DR-020. |

## BLOCKING

None.

## NON-BLOCKING

1. **NB-1. The backend's check of the authorization record is only four fields.** `backend/app/ingest.py:134` and the `cases.py:106-110` copy. A hand-written JSON with `format`, `gate`, `gate_status: CLOSED` and the (public) split sha256 opens the holdout lock; `ml/holdout.py` would refuse it (no `authorized_runs`, `decision_ref`, `closed_at`, `authorized_by`). This is what DR-022 item 2 says, so it is not a defect of the PR. Smallest hardening, if the leader wants it: also require a non-empty `authorized_runs` list and a repo-relative `decision_ref`, or pin the record's sha256 in the ingest and compare. The cache already stores `record_sha256`, and I confirmed the real record's sha256 equals what the exporter recorded.
2. **NB-2. INT-12 identity in `CaseStore` comes from the index.** `backend/app/cases.py:113-125`. A hand-edited cache whose `inference_only_case_ids` names another case, with CASE_0001 as EVALUATION with GT, is not refused. `ingest.py` cannot produce such an index. DR-022 item 4 names CASE_0001; a one-line "if CASE_0001 is in the cache it must be INFERENCE_REVIEW without GT" in the authorized branch would make the refusal match the decision text literally.
3. **NB-3. `record_path` is not confined to the repository.** `ingest.py:138`: `../x/record.json` is accepted and recorded as is; harmless, but the "repository-relative" promise is not enforced. Fix: reject a relative path with a `..` part, or record only `given.name`.
4. **NB-4. Two statements are stale on this head.** `contracts/ingestion/contract2_experiment_artifact/README.md:96` says the exporter "still refuses an export that has failed cases"; `ml/export_contract2.py` (docstring, `failed_case_ids`, tests) now exports them under DR-018 rule 1. `backend/README.md:230` says "no holdout has been predicted" and that the record and exporter are still needed; the record is on main and four holdout exports exist (07:36 today).
5. **NB-5. `successful_n` and an INT-12 case that the ML listed as failed.** The contract note says `successful_n` = SUCCEEDED rows + 1 for the WITHHELD row "when that case was evaluated". `backend/app/metrics.py` takes `successful_n` from the metrics artifact, so a failed INT-12 case shows a WITHHELD row while the counts treat it as failed. No value leaks and the real packages have 54/54; just note it for the day a case fails.
6. **NB-6. N-c is half closed for `experiment_id`.** `validate_api_contract.py:516` checks only that `outlier_selection.experiment_id` is a non-empty string; the response body has no `experiment_id` to compare with. The validator would need the request path to close it.
7. **NB-7. Cosmetic.** `validate_api_contract.py:554` has a long run of spaces inside one `if` line (valid Python; reflow it).
8. **NB-8. Heads-up, not this PR.** With the real packages, `MetricsService.compare([EXP-D-100, EXP-D-PP])` returns `comparable: false`, "not same prediction variant" (RAW vs PROCESSED). That rule predates this PR. If the H10 delta is meant to come from the compare endpoint, the leader should decide before the real packages go on the host; otherwise the SCR-07 compare of those two will show "not comparable".

## What I did not do

- No Python 3.9 interpreter on this machine; 3.9 compatibility rests on the AST check at `feature_version=(3,9)` and the passing CI 3.9 job.
- No device or browser check; no comment, approval, push or merge.
- Scratch copies of EXP-D-100 and EXP-D-PP (checkpoints included, ~540 MB) are in the scratchpad `d39\realroot`; the sources were only read. Nothing was deleted.
