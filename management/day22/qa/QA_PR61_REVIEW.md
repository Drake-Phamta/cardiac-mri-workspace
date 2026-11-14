# QA: PR #61, V3 Study Overview and Experiment Comparison models · **MERGE AFTER FIXES** · 2026-10-01

> **Record note.** This is CHAT E's QA report (an LLM QA under the leader's account, not a second human reviewer), as returned on 2026-10-01 under the Day 22 override. Local scratch and data paths are redacted (`<scratch>`, `<qa-scratch>`, `<data>`, …) and notes the reviewer marked local-only are removed; nothing else is edited.

| | |
|---|---|
| **Reviewer** | CHAT E. This is an LLM QA session (Claude Code, Claude Opus 5.5) running under the team leader's account. It is not a second human and not an independent person. |
| **Target** | PR #61 `feat/day22-v3-study-compare`, head `4c37250d6603378be727f9de915549e0625f83fb`. `git ls-remote` showed the same head at the end of the review. |
| **Scope** | #61's own delta `707916f..4c37250`: 3 commits (`2ab45d7`, `f5795a7`, `4c37250`), 9 files, +2193/−2. That is `app/verticals/v3_study_and_compare/**` (7 `.mjs` files and the README) plus one CI step in `.github/workflows/guardrails.yml`. Nothing else is in the delta. |
| **Stack** | #62 `7900fc1` → #68 `773c0ef` → #71 `1b505d4` (all OPEN). **#71 moved during the review.** #61 sits on #71's earlier head `707916f`. The change from `707916f` to `1b505d4` is in `backend/` only, and `contract.json` is the same blob `7095c5a9…` at `707916f`, `1b505d4` and `4c37250`. See N-1. |
| **Contract** | API contract 1.1.0 (`contracts/api/contract.json`, blob `7095c5a9…`). I checked it against `schema.json` and against the output of `generate_fixture.py`. |
| **Consumer** | PR #69 `feat/day22-v3-screens`, head `b712780`. Its copy of the V3 models is byte-identical to #61's; only the vertical README differs. |
| **Run** | 2026-10-01 12:35–12:52 (+07), inside the 40-minute timebox. |
| **Method** | Read-only throughout. In my own worktree (`<qa-worktree>`): `git fetch origin` and `git checkout --detach 4c37250`. The main checkout was not touched; it is still on `main` at `8a94172`. I read #69 with `git show`, `git grep` and `git archive` into `<qa-scratch>`. The probes are inline stubs in `<qa-scratch>/qa61_probe*.mjs`. Every run was a single node or python process, peak RSS about 40 MB. No Metro, Gradle or emulator. Nothing was committed, pushed, approved or commented. No real data was read: only the generated bundle and inline stubs. |

> **VERDICT: MERGE AFTER FIXES.** Tests, CI, contract field names, publication hygiene and the outlier API change all pass. Three blocking findings remain (B-1 to B-3). Each breaks one of the required rules under an adversarial probe, and each needs a small fix in a V3 reader plus new checks. Once those are fixed and #61 is rebased onto the final #71 head (N-1), merge it right after the contract stack.

---

## 1 · Commands run

| # | Command | Purpose |
|---|---|---|
| R1 | `git log/diff --stat 707916f..4c37250`, `gh pr view 61`, `gh pr checks 61`, `gh run view 36819967864 --job … --log` | Scope, PR state, CI result, and the V3 step's own output |
| R2 | `python contracts/api/generate_fixture.py --contract contracts/api/contract.json --output app/core/fixtures/.generated/api_bundle.json` | Bundle from contract 1.1.0 (the path is git-ignored) |
| R3 | `node app/verticals/v3_study_and_compare/test_study_and_compare.mjs` · `node app/core/tests/run_all.mjs` · `node app/verticals/v1_case_explorer/test_case_explorer.mjs` · `node app/verticals/v4_review_and_findings/test_review_correction.mjs` | Test suites, run one at a time |
| R4 | Python dump of `contract.json` sections (`domain_enums`, `enum_bindings`, `selection_rules`, `metric_rules`, `field_shapes`, `case_capability`, V3 endpoints), `schema.json` §selection_rules, and the bundle's V3 scenarios | Contract conformance |
| R5 | `node qa61_probes.mjs` (29 probes) · `qa61_probes2.mjs` · `qa61_probe_x6.mjs` · `qa61_probe_race.mjs` | Adversarial probes, including #69's `v3View.mjs` from `b712780` |
| R6 | `git grep` over all 58 `origin/*` and 97 local refs for `openOutlier(` and `.outliers` outside the vertical | The API-change check |
| R7 | Scan of the 2,193 added lines for IPv4 addresses, drive letters, home paths, URLs, `localhost`, `.local`, mail hosts, ports, `ssh` and secret words; plus a BOM/CRLF check | Publication hygiene |
| R8 | `gh pr view 62/68/71/69`, `git ls-remote`, `git range-diff 7c19a11..707916f 773c0ef..1b505d4`, file-overlap checks against `origin/main` (`e5ccd38`) | Stack state and merge path |

## 2 · Checks

| Check | Result | Evidence |
|---|---|---|
| V3 test | **PASS** | `PASS V3 study and compare — 129/129`. V3-14 ran 5/5; the `empty` scenarios exist, so nothing was skipped. |
| app/core | **PASS** | `ALL PASS — 10/10` suites: 11, 11, 16, 18, 18, 12, 18, 14, 14 and 14 checks |
| V1 model test | **PASS** | `PASS V1 case explorer — 73/73` |
| V4 tests | **PASS** | `PASS V4 review/correction — 4/4`. This is the only V4 test at this head. |
| CI (`gh pr checks 61`) | **PASS** | 9/9 green, run `36819967864` on `4c37250`. The new "V3 study and compare" step printed 129/129. |
| Contract conformance | **PASS with notes** | Every field V3 reads exists in 1.1.0 with the type V3 assumes (§2.1). Two values the contract defines are not enforced (B-1, B-2), and one field the contract serves is ignored (B-3). |
| No client-side ranking or sorting | **PASS** | V3-12 rejects `.sort(` and `.toSorted(` in all 6 source files. A grep also finds no `reduce(`, `Math.min/max`, `localeCompare` or `reverse(`. Outliers are kept in the order served (V3-9). |
| Missing or wrongly typed value is unavailable, never 0 | **PASS** | V3-4/7/8/9/11/13. Probes P1a–P1e all held. |
| Metric for another variant is refused, not relabelled | **FAIL** | Held for `experiment_metrics`, `experiment_cases` and `outlier_selection` (P4a–P4d). Broken on the `experiment_compare` path (P4e, P4f). See B-3. |
| Delta and trend only under a server COMPARABLE verdict | **PASS** | V3-6, V3-11. P5a–P5e all held. The verdict's identity is not checked (N-2). |
| N intended and N successful kept separate; failed and excluded rows visible | **PASS** | `readCohortN` gives two numbers and is never subtracted. Every row is kept in served order (V3-4, V3-9, V3-13). |
| WITHHELD rows show the reason and never a value | **FAIL** | V3-9 only checks `metric_values: null`. P2b–P2d broke. See B-1. |
| A tap opens SCR-03 only when case, run and variant are named | **PASS** | `caseIntent` (V3-4/7/9/10). The intent's variant is the confirmed lane only. One prototype-key nit (N-8). |
| Outliers read as served, including `selection_version` and tie-breaks | **FAIL** | These values are read (V3-9), but an unknown version, a missing `rule_id`, a non-Dice metric and more than 3 cases are all accepted (P3a–P3f). See B-2. |
| API change: `outliers` is now `[{experimentId, selection}]` and `openOutlier(experimentId, rank)` takes an id | **PASS** | The only consumer outside the vertical is #69 `b712780`, and it uses the new shape (`snap.outliers.map(o => … o.selection)`). Nothing calls `openOutlier` outside the vertical's README and test. No `origin/*` branch uses the old shape. A stale **local-only** branch `feat/day22-v3-screens` at `fb52c10`, superseded by `b712780` and on no remote, still has the old `outlierView(snap.outliers)`. Do not push it. |
| Publication hygiene | **PASS** | 0 hits in the 2,193 added lines. All 9 files are LF with no BOM. The commit messages are clean. |

### 2.1 Contract conformance, field by field

| What V3 reads | Contract 1.1.0 | Generated bundle | Verdict |
|---|---|---|---|
| `study_get.study_id`; `dataset{dataset_id,name,version}`; `case_counts{total,EVALUATION,INFERENCE_REVIEW}`; `capabilities{5 flags}`; `experiment_summary{status,experiment_ids,reason}` | `response_fields`, `field_shapes`, `shape_bindings` | Typed objects, boolean flags, `UNAVAILABLE`/`FIXTURE` | ✅ V3 also accepts a list for `capabilities`; that is lenient and harmless. |
| `experiment_list.items[].{experiment_id, prediction_variant}`; top-level `evaluation_population` | `row_fields`; `enum_bindings` (RAW\|PROCESSED) | `EXP_DEMO` RAW, `EXP-D-PP` PROCESSED; population is a string | ✅ `readPopulation` also reads `n`, `case_count`, `manifest_id` and `id`, which the contract never defines (N-7). |
| `experiment_get` identity: the id, the 6 provenance fields, `prediction_variant` | `response_fields` (untyped) | Placeholder strings | ✅ |
| `experiment_metrics.{evaluation_n, successful_n, metric_summary, prediction_variant, metric_version}` | `metric_rules.summary_statistics` and `summary_rule` | 6/4; 5 metrics × 10 statistics | ✅ |
| `experiment_cases.items[].{case_id,status,reason,analysis_run_id,metric_values}`; top-level `metric_version`, `prediction_variant`, `outlier_selection` | `row_fields`, `field_shapes.metric_values`, `case_result_status`; the notes say metric values are null for WITHHELD rows | 4 SUCCEEDED, 1 FAILED, 1 WITHHELD with null values | Names ✅. The WITHHELD and FAILED value rule is not enforced (B-1). |
| `outlier_selection.{rule_id, selection_version, experiment_id, prediction_variant, metric_name, cases[{case_id, analysis_run_id, metric_value, false_positives, false_negatives}]}` | `block_fields`, `case_fields`; `schema.json` pins `selection_version` to `dr010-outlier/v1`, `metric_name` to `dice` and `cardinality` to 3 | Exact | Names ✅. None of the three pinned values is checked (B-2). |
| `experiment_compare.{comparable, compatibility_reason, common_evaluation_population, summary[id]}`; core also reads `metric_version` and `prediction_variant` | `response_fields`, `summary_rule` | `comparable:true`, RAW, `summary` keyed by `EXP_DEMO_A`/`EXP_DEMO_B` | Names ✅. `prediction_variant` is ignored (B-3). The response does not echo the ids asked (N-2). |
| `findings_list.items[].{finding_id, status}` | `row_fields` | 1 row, OPEN | ✅ |

### 2.2 Probes (inline stubs; "#69" means `v3View.mjs` at `b712780`)

| ID | Input | Must | Observed | |
|---|---|---|---|---|
| P1a–e | Dice `"0.83"` on a row · summary median `"0.83"` · outlier `metric_value "0.40"`, FP `"9"` · `evaluation_n "6"` · compare median `"0.80"` | Unavailable, never 0 | Not plotted; null; `WRONG_TYPE` with the served value shown; "N intended unavailable · N successful 4"; no delta | HELD |
| P2a | WITHHELD row with `dice: 0.83` | Not plotted | Not plotted | HELD |
| **P2b** | Same row | No value | **`row.value = 0.83`** | BROKE |
| **P2c** | FAILED row with `dice: 0` | No value | **`row.value = 0`** | BROKE |
| **P2d** | #69 `caseTable` on that cell | No value shown | **`"withheld - inference-review case, no value (INT-12)"` with `valueText "0.830"`; the FAILED row shows `"0.000"`** | BROKE |
| **P3a** | `selection_version: "dr010-outlier/v9"` | Refused or unavailable | **Available, 3 cases** | BROKE |
| **P3b–e** | No `selection_version` · no `rule_id` · `metric_name: "iou"` · 5 cases | Refused or unavailable | **All accepted** (`ruleCited: false`; `metricName: iou`; 5 cases) | BROKE |
| **P3f** | #69 `outlierView` for P3a | Marked | **"DR-010 outliers for EXP-U-100 (RAW), in the order the server sent", with 3 links and no version shown** | BROKE |
| P4a–d | Metrics PROCESSED on RAW `EXP-U-100` · `processed_prediction` spelling · cases served PROCESSED · outlier selection PROCESSED | Refused | `VARIANT_MISMATCH` with no N, summary or points · same · rows listed, 0 intents · `OUTLIERS_FOR_ANOTHER_VARIANT` | HELD |
| **P4e** | `experiment_compare` with `prediction_variant: "PROCESSED"` and `comparable: true` for RQ-A-100 (both RAW per `08` §2) | No delta | **`delta("RQ-A-100")` allowed, +0.05** | BROKE |
| **P4f** | SCR-01 with the same body | No numbers | **Headline `fair: true` with both summaries shown** | BROKE |
| P5a–e | `comparable:false` plus a served `delta` · `comparable:"true"` as a string · #69 view | No delta | Refused with the reason "different split"; NOT_COMPARABLE; no SCR-01 numbers; UNDECIDED; #69 prints "no difference shown: different split" | HELD |

Of the 26 probes in the classes you asked for, 15 held and 11 broke. The extra probes X1–X7 support N-2, N-4, N-5, N-6 and N-8.

## 3 · Findings

### BLOCKING

**B-1. WITHHELD, FAILED and EXCLUDED rows pass a served value through to the screen.** In `readers.mjs` `readCaseRows`, the value is read from `metric_values[metricName]` whatever the row's status. Only plotting depends on the status. The contract forbids this in the `experiment_cases` notes ("metric_values … null otherwise; an INFERENCE_REVIEW case is a WITHHELD row with null values") and in `case_capability.case_level_scope` (INT-12: "no per-case value of an INFERENCE_REVIEW case is served"). Core only checks that fields are present, so V3 is the last line of defence, and #69 already renders the value: `ExperimentComparisonScreen.js:194` shows "… withheld - inference-review case, no value (INT-12) · 0.830". The V3-9 check named "never with a value" cannot fail, because its input is `metric_values: null`.
- **Fix:** set `value` only when `status === 'SUCCEEDED'`; otherwise make it null and keep a drift flag (for example `servedValueIgnored: true`) so the anomaly stays visible. Add V3-9 checks for a WITHHELD row with `{dice: 0.83}` and a FAILED row with `{dice: 0}`.
- **Owner:** A6 / Bế Quốc Khánh.

**B-2. The DR-010 outlier selection is not checked against the values the contract pins.** `readOutlierSelection` accepts any `selection_version`, an absent `selection_version`, an absent `rule_id` (both are required `block_fields`), a `metric_name` other than `dice`, and more than `cardinality` 3 cases. #69 then labels the result "DR-010 outliers … in the order the server sent" and does not show the version.
- **Fix:** add `selectionVersion: 'dr010-outlier/v1'`, `metricName: 'dice'` and `cardinality: 3` to `OUTLIER_RULE`. Add a check that these equal `contract.json` `selection_rules.outlier_selection`, so a contract bump fails loudly instead of silently. Require `rule_id === 'DR-010'`; an absent one is refused. Refuse with new reasons (`OUTLIERS_UNDER_ANOTHER_VERSION`, `OUTLIERS_FOR_ANOTHER_METRIC`, `OUTLIERS_OVER_CARDINALITY`) and add them to the V3-9 refusal table. #69 then needs labels for the new codes; until then it shows the raw code.
- **Owner:** A6 / Bế Quốc Khánh.

**B-3. The comparison path relabels the variant.** `requestComparisons` takes `experiment_compare.summary` without checking the response's `prediction_variant`. The variant guard exists for metrics, cases and outliers but not here. With a contract-valid body that says PROCESSED for the RAW pair RQ-A-100, SCR-07 shows a +0.05 delta and SCR-01 shows the common-population numbers under "comparable".
- **Fix:** for comparisons whose members share one lane (HEAD_TO_HEAD and TREND), require `readVariant(view.data.prediction_variant).lane === lane`. Otherwise mark the summaries unavailable (`COMPARE_FOR_ANOTHER_VARIANT`) and treat the verdict as UNDECIDED for this pair, with the reason naming both variants. RQ-B (ABLATION) mixes RAW and PROCESSED by definition, so withhold its numbers until the contract defines a mixed compare (N-7). Add checks for both cases.
- **Owner:** A6 / Bế Quốc Khánh.

### NON-BLOCKING

- **N-1. Stack drift.** #61 (and #69, which merges `4c37250`) is based on #71's pre-rebase head `707916f`. #71 is now `1b505d4`, rebased onto #68's `773c0ef`. `range-diff` shows the two contract commits are equivalent, and the change is backend-only, so this delta and these results carry over. Main's new commits (#64, #66 up to `e5ccd38`) do not touch any #61 file. Before merging, run `git rebase --onto <final #71 head or main> 707916f`, confirm with `git range-diff` that only the fix commits were added, and re-run CI. Otherwise the merge brings back the twin commits `0df8cab` and `707916f`. **Owner:** A6 / Bế Quốc Khánh, with the leader as merge operator.
- **N-2. The verdict's identity is never checked.** The `experiment_compare` response does not echo the ids asked, and V3 does not check the `summary` keys either. On the bundle, an explicit open of the three UNet ids draws a joined trend under a verdict whose summary names `EXP_DEMO_A` and `EXP_DEMO_B` (X1). V3-6 also accepts this. The app flow cannot reach it on the bundle. **Fix:** treat a verdict whose `summary` does not cover every id asked as unconfirmed, meaning no join, no delta and no fair label, the same discipline as `idConfirmed` for `experiment_get`. Ask the contract owner to echo `experiment_ids`. **Owner:** A6 / Bế Quốc Khánh.
- **N-3. The trend line joins per-experiment summaries.** These are `experiment_metrics` summaries, each over that run's own successful cases. The README's own argument for deltas ("would compare populations, not models") applies to a joined line too. The trend comparison already returns common-population summaries for each id. **Fix:** draw the line from those, or document why it does not. **Owner:** A6 / Bế Quốc Khánh.
- **N-4. Out-of-order responses.** Neither `open()` guards against a slower earlier call finishing last. In X7, `open(EXP-U-100)` (slow) followed by `open(EXP-D-100)` (fast) left the snapshot on EXP-U-100. While the slower call is still in flight, `selectMetric` can also rebuild the cells from the other call's data under this call's header. V1 already handles this with its `seq` guard. **Fix:** adopt the same pattern. **Owner:** A6 / Bế Quốc Khánh.
- **N-5. Metric units versus the strip axis.** `metricNames` offers FP and FN (voxels) and `relative_volume_error` (percent), but `stripLayout` defaults to the [0, 1] axis. For those metrics, 4 points are kept, none are drawn, all 4 are off-axis, and `pointsWithheld` is null (X4). #69 uses the default axis and does not show off-axis points. **Fix:** give each metric its own axis from the contract's units, or restrict the strip to [0, 1] metrics and say why. **Owner:** A6 / Bế Quốc Khánh.
- **N-6. Population attached to unlisted experiments.** In EXPLICIT mode, an experiment the list does not contain still gets the list's shared `evaluation_population`, and its D2 context reads `complete` (X5). **Fix:** attach the population only to listed ids. **Owner:** A6 / Bế Quốc Khánh.
- **N-7. Contract gaps for the contract owner to resolve.** (a) The contract leaves the shape of `evaluation_population` and `common_evaluation_population` undefined (the generator emits a string and an array), so `readPopulation` guesses keys. (b) `experiment_compare.prediction_variant` is a single value and is not bound to an enum, so it cannot describe RQ-B. (c) Only `experiment_list.prediction_variant` is enum-bound, so the extra spellings `readVariant` accepts (`RAW_PREDICTION`, lowercase) go unnoticed. **Owner:** A6 / Bế Quốc Khánh, to raise with the #71 contract owner.
- **N-8. Small code nits.** `ROW_STATUS[status]` and `LANE[variant]` accept prototype keys: X2 gives `plotState "constructor"` and a junk count, and in X3 `caseIntent` is enabled for `variant: "toString"`, though only for an external caller. Use `Object.hasOwn` or a Set. `deltaFor` on a 3-id TREND silently returns the 025→050 difference (X6). The V3-14 NOT RUN skip branch can silently drop 5 checks; make it mandatory. Two comments are stale: `readers.mjs:279` "PROPOSED_SHAPES" and `experimentCompare.mjs:25` "contract does not name the metrics yet". The V3-6 text "the server's reason" actually shows the contract's `message_template`. **Owner:** A6 / Bế Quốc Khánh.
- **N-9. For #69's own QA (not this PR).** `outlierView` shows neither `selection_version` nor the FP and FN tie-breaks. `caseTable` renders `row.value` for every row; the B-1 fix corrects that from the model. `StripChart` ignores `offAxis`. **Owner:** A6 / Bế Quốc Khánh.

## 4 · VERDICT

**MERGE AFTER FIXES.** The models are well built. They are pure, use no sort, keep the server's order, keep N intended and N successful as two numbers, gate deltas and trends on comparability, and refuse a mismatched variant on three of the four paths. Tests, CI, contract field names, the API change and hygiene all pass.

Conditions to merge right after the contract stack:
1. Fix B-1, B-2 and B-3, each with the new V3 checks described above. Rerun P2, P3 and P4e/P4f; they should all hold.
2. Rebase onto the final #71 head (N-1). `range-diff` should show only the fix commits added, and CI should be green.
3. Rebase #69 onto the fixed #61.

N-1 is a merge-time condition, covered in item 2. The other non-blocking findings can follow in Khánh's Day 23 completion pass.

Files left behind, for the leader to clean up: `<qa-scratch>/qa61_*` (probes, outputs, and a `qa61_pr69_tree/` extract of `b712780`); a git-ignored bundle in `<qa-worktree>/app/core/fixtures/.generated/`; and one log copy `qa61_v3_test.txt` in the system temp directory. `<qa-worktree>` is still detached at `4c37250` and has no tracked-file changes.
