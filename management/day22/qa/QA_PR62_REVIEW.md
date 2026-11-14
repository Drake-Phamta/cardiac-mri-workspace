# QA: PR #62, API Contract v1.0 · verdict **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| Item | Value |
|---|---|
| Reviewed | PR #62 `feat/day22-api-contract-v1`, head **`a1b0b40592989537890a925207666e2eeafcde76`** (2 commits, `ac4b355` and `a1b0b40`, on base `771ddb3`) |
| Merged state | head + `origin/main`. Main was `f5aa763` at the first fetch. It moved during the review to **`8a94172`** (#41 and #44 merged). The merged-state run used `8a94172`. Main changed nothing under `contracts/`, `app/` or `.github/` since the base. No conflicts (`merge-tree` gives `f4f3654`). |
| Run in | my own worktree `.claude/worktrees/agent-ae2edec90821db32a`, detached HEAD. I used `git merge --no-commit` and then `--abort`. It ended clean at `a1b0b40`. The main clone was not touched. |
| Run at | 11:29 to about 11:55 (+07). The timebox was 45 minutes. |
| Reviewer | **CHAT E.** This is an LLM QA session (Claude) running under the team leader's account. It is **not a human reviewer** and not a GitHub approval (RECOVERY_OVERRIDE_DAY22 §2.2). Nothing was committed, pushed, approved or commented. |
| Tooling | Python 3.12.6, jsonschema 4.26.0, parso 0.8.7, Node v24.14.0, git 2.51.2. There is **no Python 3.9 interpreter** on this host. |
| CI on head | guardrails **8/8 SUCCESS** (run 36814084249) |

> The specs `docs/specs/v1.0/**` were read and not edited. Scratch probes live outside git, in this session's scratchpad `qa62/`: `probe_validator.py`, `probe_transport.mjs`, `py39scan.py`, `int12.py`, `compat.ps1`.

## 1. Checks

| # | Check | Command / method | Result |
|---|---|---|---|
| 1a | API contract tests | `python contracts/api/test_api_contract.py` | **PASS** on head and on the merge: `api_contract_checks=PASS cases=27`, 76 generated scenarios validated, 8 violations rejected, empty pages valid on all 5 list endpoints |
| 1b | Contract CLI | `python contracts/api/validate_api_contract.py --contract contracts/api/contract.json` | **PASS**: `API Contract 11 1.0.0; 28 endpoints (23 hero-flow), 15 errors` |
| 1c | Contract 1 | `python contracts/ingestion/contract1_raw_dataset/test_contract1.py` | **PASS** on both, 7 PASS lines including "INT-12 withheld ground truth" |
| 1d | Contract 2 | `python contracts/ingestion/contract2_experiment_artifact/test_contract2.py` | **PASS** on both, `contract2_checks=PASS cases=9` |
| 1e | Generator | `python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output app/core/fixtures/.generated/api_bundle.json` (directory created first) | **PASS**: exit 0. sha256 `5F4B0897…AAED590` on head and on the merge |
| 1f | app/core | `node app/core/tests/run_all.mjs` | **PASS** on both: `ALL PASS — 10/10`, including the new T8b and F3c |
| 1g | V4 on main | `node app/verticals/v4_review_and_findings/test_review_correction.mjs` | **PASS** on both, 4/4 |
| 1h | V1 test on main | n/a | **NOT RUN**: main has no V1 test, only a README. #53's test is covered in §5. |
| 2 | Day 22 decisions present and consistent | read contract, schema, validator, generator, app/core, README | **FAIL (1 gap)**: all present and consistent except that commit atomicity is not stated and the PATCH→CORRECTED rule can never succeed (**B2**). Detail in §2. |
| 3 | Validator and transport probes | `probe_validator.py`, `probe_transport.mjs` | **PASS for every required probe.** The probes also found gaps: N1, N2, N6, N7, N8, and **B1** (a wrong `row_fields` split). Detail in §3. |
| 4 | Spec conformance (11, 05) | read both specs against the contract | **FAIL**: the 05 §6 transitions match exactly, but `experiment_list` has one top-level `prediction_variant` (**B1**) and the `prediction_variant` values differ from the specs without being recorded (**N3**). Detail in §4. |
| 5 | Python 3.9 | static only: `ast.parse(feature_version=(3,9))`, the parso 3.9 grammar, and an AST scan for runtime constructs (PEP 604 `X\|Y` evaluated at runtime, `zip(strict=)`, `match`, newer typing/itertools names, regex 3.11 syntax) | **PASS (static; no 3.9 interpreter).** All 7 `contracts/**/*.py` files are clean. All have `from __future__ import annotations`, so `dict[str, str] \| None` in `validate_contract1.py:270` and `validate_contract2.py:170` is never evaluated. `str.removeprefix` (`validate_contract2.py:149`) is fine on 3.9. The Mac mini needs `jsonschema>=4.0` (`Draft202012Validator`). |
| 6 | Determinism | generator run 3× on head, 1× on the merge; `Get-FileHash` on the written files | **PASS**: byte-identical (`5F4B0897…`) |
| 7 | Publication hygiene | regex over the added lines of `git diff 771ddb3 a1b0b40` for paths, IPs, hosts, users and emails | **PASS**: the only hit is the schema `$id` `https://cardiac-mri-workspace.local/...`, a placeholder that was already used (v0 and Contracts 1/2) |
| 8 | Compatibility with waiting PRs | merged each PR head with `a1b0b40` and ran its tests (`compat.ps1`) | **FAIL**: #61 and #63 need changes, #53 needs its documented change, #65 needs none. Detail in §5. |

## 2. Each decision, artefact by artefact

| Decision | contract.json | schema.json | validator | generator | app/core | README |
|---|---|---|---|---|---|---|
| DR-010a (b) `worst_slice_selection` on `analysis_run_metrics` | ✓ `selection_rules`. The ranking matches DR-010 exactly. | ✓ const | ✓ exactly one carrier; order, duplicates and range checked | ✓ ranked slices, plus `no_eligible_slices` | ✓ `selection.mjs` note, P2 | ✓ |
| Review enum + transitions | ✓ **identical to 05 §6** | ✓ const | ✓ | ✓ create NOT_REVIEWED, patch FLAGGED | n/a (V4) | ✓ |
| `finding_status` OPEN/RESOLVED in top-level `domain_enums` | ✓ | ✓ const | ✓ bound on create, list, patch and the patch request | ✓ OPEN/OPEN/RESOLVED, request RESOLVED | n/a | ✓ |
| INT-12 (`case_mode`, `case_capability`, Contract 1 `ground_truth_withheld`) | ✓ | ✓ | ✓ the 7 ground-truth-dependent endpoints all expose GROUND_TRUTH_UNAVAILABLE | ✓ `case_get.inference_review`, one INFERENCE_REVIEW row in `case_list` | ✓ | ✓ |
| INT-12 = CASE_0001 | the rule is in the contract text; the id is in the READMEs | — | — | — | — | ✓ Checked against `split_manifest_path_a_seed2024.json` on main (`path_a_seed2024_dr002b_v1`): `final_holdout` has n=54, the lowest is **CASE_0001**, CASE_0027 is the suspected holdout case. Contract 2 README keeps the 54-case population. |
| Hero set | ✓ 23/28 | ✓ required boolean | ✓ `REQUIRED_HERO_ENDPOINTS` | — | — | ✓ (see N4) |
| `row_fields` + empty page | ✓ on all 5 list endpoints | ✓ if/then/else: required exactly when `items` is present | ✓ | ✓ `empty` scenario on 5/5 | ✓ transport and loader fixed (the old rule needed `items.length > 0`) | ✓ |
| `commit_result_state = CORRECTED` | ✓ present. **"Atomic" is not stated, and "PATCH to CORRECTED needs a ReviewedMask" can never succeed (B2).** | ✓ const | ✓ CORRECTED has no outgoing transition | n/a (`review_commit` has no `status`) | n/a | ✓ ("a commit leaves the review CORRECTED") |

**Against 05 §6:** no mismatch. The contract adds three rules:
- a repeat of the current state is invalid;
- a review may be created directly in ACCEPTED or FLAGGED;
- a commit moves the review to CORRECTED.

These refine 05's persistence rules ("NOT_REVIEWED may be absence"; "CORRECTED requires a persisted ReviewedMask") and contradict nothing in 05.

## 3. Probe results

**Python `validate_response`:** 79/84 matched the expectation.
- **Empty pages** pass on all 5 list endpoints with only the top-level fields.
- **A row missing any row field** is rejected: 18/18.
- **A missing top-level field** is rejected on both empty and non-empty pages: 10/10, plus 4 non-list endpoints and a missing `items`.
- **Unknown enum values** are rejected: 13/13 (review, finding, finding_type, case_mode, run_status, prediction_variant, metric_state, geometry status, source_mask_kind).
- **Row fields are not required at top level:** 5/5.
- **Forbidden transitions** are enforced at contract level. Each of these mutations is rejected by the schema `const` or a semantic rule: CORRECTED→ACCEPTED, FLAGGED→ACCEPTED, dropping ACCEPTED→FLAGGED, a different `commit_result_state`, CORRECTED in `create_allowed_states`, a 5th state, `hero_flow` false on a hero endpoint, a second selection carrier, wrong or missing `row_fields`.
- **Error envelopes:** INVALID_REVIEW_TRANSITION is valid at 409. It is rejected on `finding_patch` and rejected at a wrong HTTP status.

What `validate_response` lets through:
- `case_get` INFERENCE_REVIEW with `ground_truth_available: true` (N1);
- the same contradiction on a `case_list` row (N1);
- `review_commit.source_mask_kind = GROUND_TRUTH` (N2);
- `analysis_run_create.status = "IN_PROGRESS"` (N6);
- `metric_values.hd95` while GEOMETRY_NOT_VALIDATED (N8).

It also **rejects** an `experiment_list` that carries `prediction_variant` per row, because the field is pinned to the top level (**B1**). A forbidden transition answered with 200 is not detectable from one response; the backend has to test it (N9).

**app/core transport and loader:** 39/44 matched the expectation.
- Empty pages: transport → SUCCESS, loader → accepted, 5/5.
- The real generated bundle loads, with 5/5 `empty` scenarios.
- A missing row field and a missing top-level field are both CONTRACT_DRIFT.
- Row fields are not required at top level.

Where app/core differs from `validate_response`:
- it **does not check enums**: `review_patch` APPROVED, a findings row IN_PROGRESS and `case_get` mode EVAL all give SUCCESS, and the loader accepts APPROVED;
- the transport accepts a known code at the wrong HTTP status (N7).

**`row_fields` hunt:** `experiment_list` is wrong. Its rows carry only `experiment_id`, while `prediction_variant` is a single top-level value. 08 §2 lists EXP-D-PP (PROCESSED) next to six RAW experiments, and 05 gives every Experiment its own `prediction_variant_policy`. One top-level variant cannot describe that list, and it is not enum-bound either (**B1**). The other four splits are sound:
- `case_list`: `next_page` and the `mode` echo stay top-level;
- `experiment_cases`: `metric_version` stays top-level;
- `reviewed_masks_list` and `findings_list` are all rows.

## 4. Deviations from spec 11 / 05 (and 07/08 where they bear on it)

| # | Deviation | Recorded? |
|---|---|---|
| D1 | `experiment_list.prediction_variant` is one top-level value for a mixed RAW/PROCESSED list (05 Experiment `prediction_variant_policy`; 08 §2 EXP-D-PP) | No → **B1** |
| D2 | `domain_enums.prediction_variant` = `RAW`/`PROCESSED`. Spec 11 §6/§7 use `prediction_variant=RAW_PREDICTION` and `variant=raw\|processed`; 07 §6 and 08 use RAW_PREDICTION/PROCESSED_PREDICTION; Contract 2, frozen in the same PR, uses `RAW_PREDICTION`/`PROCESSED_PREDICTION` (schema lines 108, 172); this same contract uses RAW_PREDICTION in `source_mask_kind`. This is a serialization choice, which 11 allows "only by ADR". | No → **N3** |
| D3 | `experiment_cases` rows carry no per-case metric. 11 §5 asks for "per-case metrics/status suitable for outlier drill-down". The DR-010 outlier selection has no transport (11 §3 "outlier entry points"; DEMO H1/H2). | Only in the PR body ("Decisions needed 2"). README just says "deliberately unchanged". → **N5** |
| D4 | 11 §8 says ground truth must never be a review source. The contract text says so, but the binding lets `review_commit.source_mask_kind` be GROUND_TRUTH. | Text yes, enforcement no → **N2** |
| D5 | 11 §3's example nests `volume` and `geometry_status`; the contract uses flat fields with `geometry_validation_status`. | Pre-existing since v0 (DR-008a/DR-012). Not this PR. |

## 5. Compatibility (check 8)

| PR | Alone | Merged with #62 | What breaks / what must change |
|---|---|---|---|
| **#61 V3** `7645892` | 113/113 | **4 of 118 fail**, all in V3-1 | Test expectations only; the readers already handle the typed values. The four changes: (1) `study_get.dataset` is now an object, so the test should compare the label, not the raw value; (2) `case_counts.total` is now 2; (3) `experiment_list` rows now carry `experiment_id` (expects 1 listed, 0 unreadable); (4) findings status is OPEN, not IN_PROGRESS. Also a stale comment "DR-010 selection not in Contract 11 DRAFT v0". V3 reads `experiment_list.evaluation_population` at top level (`studyOverview.mjs:116`, `experimentCompare.mjs:112`), so the B1 fix must leave that field top-level. **Owner A6 (Bế Quốc Khánh).** |
| **#63 V4** `346a9ba` | **fails on its own** (review 5/29, findings 16/20): it was built for v1.0 | review 29/29, brush 21/21, **findings 19/20** (F4) | **F4**: `findings_list` rows now carry typed `evidence` identifiers, so the row can be opened; update the expectation. Three more breaks that fixture tests cannot see: **(a)** `index.mjs:260` and `README.md:134` say "Saving does not change the status; CORRECTED is chosen by the user", but the contract says a commit leaves the review CORRECTED, so a live server answers the later PATCH→CORRECTED with **409 INVALID_REVIEW_TRANSITION**; **(b)** `index.mjs:149`: `review_create` sends only `status`, without the DR-009 `source_mask_id` and `prediction_variant`; **(c)** `index.mjs:219`: `working_mask_put` sends `geometry_validation_status: 'VALIDATED'`, which is not in the enum; it must echo the case's value (GEOMETRY_NOT_VALIDATED). (b) and (c) also exist in **main's** V4 (`index.mjs:57`, `:97`). **Owner A5 (Nguyễn Gia Đức Trung).** |
| #53 V1 `ea5bf32` | all pass | **2 fail** (V1-3) | As the PR body says: `ground_truth_available` is now typed `true`. Fix: use the `case_get: 'inference_review'` scenario. **Owner A2 (Tuấn).** |
| #65 mobile `ca3447b` | 60/60 | **60/60** | None. Its `'VALIDATED'` test payload would only fail against N7-style enum checks. |

#61 and #63 each add their tests to `guardrails.yml`, so their CI goes red as soon as they take main after #62 merges.

## 6. Findings: BLOCKING

**B1. `experiment_list` freezes a single top-level `prediction_variant`.** Contract line 155 has `row_fields: ["experiment_id"]`.
- **Why it blocks:** the list must hold six RAW experiments and EXP-D-PP (PROCESSED) (08 §2). A single top-level value is either wrong or meaningless, and it is not enum-bound. After the freeze, moving it costs a version bump, and every consumer pins the exact version string.
- **Fix:**
  - `row_fields: ["experiment_id", "prediction_variant"]`;
  - add `experiment_list.prediction_variant` to `enum_bindings.prediction_variant`;
  - keep `evaluation_population` top-level (V3 reads it there) and define it in the endpoint notes as the population every listed experiment shares;
  - update the README line ("rows gain experiment_id");
  - add one negative test (a row without `prediction_variant` is drift).
- Generator and app/core follow automatically. #61's tests are unaffected.
- **Owner: A3 / Nguyễn Gia Đức Trung.**

**B2. The CORRECTED path is not stated unambiguously, and "atomic" is missing.** The relevant text is `review_rules.notes` (line 55), the `review_patch` notes ("Allowed transitions are domain_enums.review_status_transitions") and the `review_commit` notes.
- **Why it blocks:**
  - A commit is the only way a ReviewedMask comes to exist, a commit always ends CORRECTED, and CORRECTED is terminal. So "PATCH to CORRECTED needs a persisted ReviewedMask" can never succeed.
  - `review_commit` also lists INVALID_REVIEW_TRANSITION, which no transition can produce.
  - #63 has already built the opposite flow.
  - The backend is being written from this text now, and after the freeze even a text change needs a new version.
- **Fix:** add to the notes that `review_commit` is **atomic**: the new version, the move to CORRECTED (if not already CORRECTED) and one revision step persist together or not at all. Say that the →CORRECTED transitions of 05 §6 are performed by `review_commit`, so `review_patch` with CORRECTED always answers INVALID_REVIEW_TRANSITION. Say when, if ever, a commit answers INVALID_REVIEW_TRANSITION.
- **Keep** `review_status_transitions` as it is, because it must equal 05 §6.
- **Optional, and cheapest now:** add `status` to the `review_commit` response, with the binding `review_commit.status` and generator `STATUS_BY_ENDPOINT["review_commit"]="CORRECTED"`.
- **Owner: A3 / Nguyễn Gia Đức Trung.**

## 7. Findings: NON-BLOCKING (each with its owner)

Items marked † change `contract.json`. They are cheapest to fold into the B1/B2 fix commit; later they need a version bump.

1. **N1. INT-12 safety net (validator).** `validate_response` accepts `mode: INFERENCE_REVIEW` with `ground_truth_available: true` on `case_get` and on `case_list` rows.
   - Fix: check both against `case_capability.modes` and add negative tests.
   - The backend PR should also test, table-driven, that the configured case (CASE_0001) gets 404 GROUND_TRUTH_UNAVAILABLE from all 7 `ground_truth_dependent_endpoints`.
   - Owner: A3 / Trung.
2. **N2† Ground truth as a review source.** `review_commit` and `reviewed_masks_list` provenance accept `source_mask_kind = GROUND_TRUTH` (11 §8).
   - Fix: add a review-specific allowed set (RAW_PREDICTION, PROCESSED_PREDICTION, REVIEWED) and check it.
   - Owner: A3 / Trung.
3. **N3. `prediction_variant` values (D2).**
   - Fix: add a "Deviations from frozen specs" table to the README with the mapping (API `RAW` ≡ 07/08/Contract 2 `RAW_PREDICTION`, `PROCESSED` ≡ `PROCESSED_PREDICTION`).
   - The backend translates at the Contract 2 boundary; `validate_response` already rejects `RAW_PREDICTION` on the API.
   - Owner: A3 / Trung.
4. **N4. Hero set vs DEMO_STANDARD.** `hero_flow.decision` cites H1–H10, but some endpoints those steps need are `hero_flow: false`:
   - `experiment_compare`: H10 needs "non-comparable runs labelled";
   - `experiment_list`: the H1/H10 matrix;
   - `analysis_slice_error`: H5 error classes, unless the overlays are computed from the ground-truth and prediction slices.
   - Fix: the leader confirms the 23-endpoint subset or flips those endpoints to hero.
   - Owner: leader (Phạm Tuấn Anh) with A3.
5. **N5. DR-010 outlier half and per-case metrics (D3).**
   - Fix: record it in the README as a known gap at 1.0.0, with the open decision, before V3 relies on it.
   - Owner: A3, plus the leader's decision.
6. **N6† Unbound statuses.** `analysis_run_create.status` is not bound to `run_status`; the generator emits `IN_PROGRESS`, which is not a 05 §5 state. `experiment_cases` row `status` has no enum either.
   - These were agreed "unchanged"; bind them in the next version or now.
   - Owner: A3 / Trung.
7. **N7. app/core vs `validate_response`.** The transport and loader do not check `domain_enums`, and the transport does not check an error's HTTP status against the catalog. So "valid" means two things.
   - Fix (follow-up): mirror `enum_bindings` in `validateResponse`.
   - Owner: A3 / Trung, with the app/core maintainer.
8. **N8. Physical-unit guard.** `metric_values.hd95` passes while GEOMETRY_NOT_VALIDATED. `PHYSICAL_KEY` does not cover `metric_rules.physical_metrics_blocked_while_geometry_not_validated`, and `field_shapes` objects accept unknown keys.
   - Fix: check that list, and reject unknown keys in `metric_values`.
   - Owner: A3 / Trung.
9. **N9. Transition enforcement is server-only.**
   - The backend PR needs a table-driven test over all (from, to) pairs, including repeats and CORRECTED→*.
   - Owner: A3 / Trung.
10. **N10. Contract 1/2 version string.** They say "frozen v1.0" but keep the wire literal `"DRAFT v0"`. This is documented, and the leader's call is pending (PR body, "Decisions needed 1").
    - Owner: leader.

## 8. Verdict

**`MERGE AFTER FIXES`: B1 and B2.**

What already holds:
- Tests pass on the head and on the merge with current main, and CI is 8/8.
- Every Day 22 decision is present.
- The 05 §6 transitions are exact.
- INT-12 resolves to CASE_0001 under the split on main.
- Empty pages are valid end to end.
- The generator is deterministic and the diff is clean.
- The Python files are 3.9-safe by static analysis (no 3.9 interpreter here).

Both blocking fixes are a few lines in contract text and structure, owned by A3 / Nguyễn Gia Đức Trung. They must land before the freeze, because every consumer pins `1.0.0` exactly and any later change costs a version bump across app/core and all verticals. The fix commit should re-run checks 1a–1g plus the `experiment_list` and review-commit probes.

After merge, these must follow before their CI is green against main:
- #61: four V3-1 test expectations;
- #63: F4, the commit→CORRECTED flow, the DR-009 `review_create` body and the `working_mask_put` geometry status (the last two also on main's V4);
- #53: V1-3.

---
