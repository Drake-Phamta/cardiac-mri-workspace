# V3 — Study Overview (`SCR-01`) and Experiment Comparison (`SCR-07`)

**Owner: Bế Quốc Khánh** (`PROJECT_STATE.yaml`, `DEMO_STANDARD.md` §3). Secondary reviewer: Vũ Hùng Anh.

> **Day 22 skeleton.** The state models below were built under the Day 22 recovery override
> (PR-MOBILE-03: the core flow, cleanly, with what is left written down). Khánh reviews, completes and
> defends them from Day 23 — see [TODO for Khánh](#todo-for-khánh).

## What is here

| File | What it owns |
|---|---|
| `index.mjs` | the surface a screen imports |
| `studyOverview.mjs` | `createStudyOverview(client)` — the `SCR-01` state model |
| `experimentCompare.mjs` | `createExperimentComparison(client)` — the `SCR-07` state model |
| `cohort.mjs` | one matrix **cell** from the core states of `experiment_get` / `_metrics` / `_cases`; the server's comparability verdicts; trend and delta, gated by those verdicts; the D2 metric context |
| `readers.mjs` | pure readers: counts, N, variant, family, fraction, population, metric summary, per-case rows, the DR-010 outlier selection, navigation intents. `MATRIX` (`08` §2) and `COMPARISONS` |
| `strip.mjs` | strip-plot geometry and `pointAt` — a tap on any point resolves to its case |
| `test_study_and_compare.mjs` | 113 checks, plus V3-14, which prints `NOT RUN` until the bundle has `empty` scenarios; CI step **V3 study and compare** |

```bash
python contracts/api/generate_fixture.py --contract contracts/api/contract.json \
       --output app/core/fixtures/.generated/api_bundle.json
node app/verticals/v3_study_and_compare/test_study_and_compare.mjs
```

Both models follow V1/V4: a factory over a core client, every action returns the same frozen snapshot the
getter returns, and the snapshot **wraps** a core screen state (`view`) with the screen's own fields next to
it. `snapshot.source` is the transport kind — `'fixture'` means generated contract placeholders, and a
screen must say so.

```js
const overview = createStudyOverview(client);
await overview.open({ studyId });                 // no default study
overview.openOutlier(0);                          // -> { screen: 'SCR-03', caseId, runId, variant, enabled, reason }

const compare = createExperimentComparison(client);
await compare.open({});                           // MATRIX: the 7 cells of 08 §2, filled from experiment_list
await compare.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'] });   // EXPLICIT: e.g. one pair from SCR-01
compare.selectMetric('dice_3d');                  // the per-case metric the strip plots - no default
compare.labelsFor('EXP-U-100');                   // the server's verdicts that involve this cell
compare.trend({ stat: 'median' });                // joined into a line only under a COMPARABLE verdict
compare.delta('RQ-A-100', { stat: 'median' });    // only where core's presentation().mayShowDelta
stripLayout(compare.stripColumns(), { width, height });   // + pointAt(layout, x, y) -> point.intent
```

### The rules the code enforces, and the check that proves each

| Rule | Where | Check |
|---|---|---|
| A count or metric that is absent or mistyped is **unavailable with a reason and the served value** — never 0, never NaN | `readCount`, `readMetricSummary` | V3-4, V3-7, V3-8 |
| N intended and N successful are **two numbers**, always shown as two, never subtracted into a "failed" count | `readCohortN` | V3-4, V3-8, V3-9 |
| Every metric carries its D2 context — run/model, variant, aggregation level (quoted from `contract.json`), population, both N, metric version — and names what is missing | `metricContext` | V3-4, V3-9 |
| Comparability is the **server's** verdict; `NON_COMPARABLE_EXPERIMENTS` is an answer (labelled, no action), a failed call is `UNDECIDED` | `requestComparisons` | V3-6 |
| No delta and no trend line without a `COMPARABLE` verdict; a delta uses the server's **common-population** summaries | `deltaFor`, `buildTrend` | V3-6, V3-11 |
| A metric served for another variant than `08` §2 defines the experiment by is **refused, not relabelled** (`11` §6) | `buildCell` | V3-5, V3-9 |
| A served `experiment_id` / `study_id` that differs from the one asked is **reported**, not repaired | `readExperimentIdentity`, SCR-01 `idConfirmed` | V3-1, V3-4 |
| Failed and excluded cases stay visible with their reason; only `SUCCEEDED` rows with a value are points | `readCaseRows` | V3-9 |
| An empty list is a **legitimate absence**, said as such: no experiment listed → `SCR-07` is `EMPTY_UNAVAILABLE` / `NO_EXPERIMENTS_LISTED` with REFRESH; no case rows → the cell's strip says `NO_CASE_RESULTS`. An unknown row count is `null`, not 0 | `experimentCompare.mjs`, `buildCell` | V3-13, V3-14 |
| Outliers are the server's DR-010 selection, **in the order served** — refused if it cites another rule, names no experiment/variant, or belongs to another one | `readOutlierSelection` | V3-9 |
| Nothing in this vertical sorts (`.sort(` is refused outside comments) and nothing imports outside `app/` | — | V3-12 |
| An intent to `SCR-03` is enabled only when the server named case, run **and** variant | `caseIntent` | V3-4, V3-9, V3-10 |
| A distribution is a **strip**, not a box: Tukey whiskers would be a second definition of "outlier" next to DR-010 | `strip.mjs` | V3-10 |
| Per-experiment metric values are **not** on `SCR-01`: two numbers side by side read as a comparison, and there they would carry no comparability label. `SCR-01` shows N and status per cell, and common-population numbers only under the server's `COMPARABLE` | `studyOverview.mjs` | V3-1 |

## What today's generated bundle can and cannot show

`generate_fixture.py` derives values from **field names only**, so the V3 endpoints get placeholders:
`evaluation_n: "evaluation_n_fixture"`, `metric_summary: "metric_summary_fixture"`, one `experiment_list`
row with **no `experiment_id`**, one `experiment_cases` row with status `"IN_PROGRESS"` and no run id, and an
`experiment_get` that answers `EXPERIMENT_ID_0043` whatever is asked. On that bundle the honest screens are:

- `SCR-01`: study, dataset, case count and findings as served; **0 of 7** matrix experiments listed; no
  outlier selection;
- `SCR-07` in MATRIX mode: 7 `NOT_LISTED` cells; in EXPLICIT mode: N **unavailable** (not 0), summary
  unavailable, identity mismatch reported, `EXP-D-PP` refused because every experiment is served as `RAW`,
  and the comparability label exactly as the `default` / `not_comparable` scenario says.

That is correct behaviour, not a gap in the screens. The typed path — real N, points, outliers, intents,
trend, delta — is exercised by V3-8…V3-11 and V3-13 with inline reader inputs, the way `app/core`'s
`test_readers.mjs` tests `selection.mjs` and `comparability.mjs`. No screen renders those inputs.

**Pending dependency — empty lists.** `app/core/transport.mjs` currently refuses a list response with
`items: []` as `CONTRACT_DRIFT` when the endpoint has row fields (`experiment_cases`), so "this experiment has
no per-case result yet" would block the screen instead of saying so. The contract v1.0 PR (A3, Day 22) fixes
that in core (explicit `row_fields`, per-item checks) and adds generated `empty` scenarios for
`experiment_list` / `experiment_cases`. V3 already handles both (V3-13); V3-14 drives them end to end through
the transport and runs as soon as the regenerated bundle has them. V3 does not patch core.

## Where Contract 11 (DRAFT v0) stops — decisions needed

`contract.json` names the V3 fields but not what is inside four of them, and returns no outlier selection at
all (the same gap `app/core/selection.mjs` records for the worst slice). `readers.mjs` `PROPOSED_SHAPES` is
the **one** place this vertical assumes a shape; if the v1.0 freeze (INT-11) picks other names, that block
and the reader that uses it change, nothing else:

| Field | Proposed shape |
|---|---|
| `experiment_metrics.metric_summary` | `{ "<metric_name>": { mean, median, std, q1, q3, min, max, ci95_low, ci95_high } }` |
| `experiment_compare.summary` | `{ "<experiment_id>": <metric_summary shape> }` over the common population |
| `experiment_cases.items[*]` | `+ analysis_run_id`, `+ metrics: { "<metric_name>": number \| null }`; `status` ∈ `SUCCEEDED \| FAILED \| EXCLUDED` |
| `experiment_list.items[*]` | `+ experiment_id` |
| `experiment_cases.outlier_selection`, `study_get.experiment_summary.outlier_selection` | `{ rule_id: "DR-010", experiment_id, prediction_variant, metric_name, cases: [{ case_id, analysis_run_id, metric_value }] }`, server order |

Two generator notes for Trung, same class as the `slice_index` coincidence in the #50 review:
`param_value("experiment_id")` is `EXP_DEMO` but `field_value("experiment_id")` is `EXPERIMENT_ID_0043`, and
every V3 `prediction_variant` is `RAW`, so `EXP-D-PP` can never be shown from the bundle.

## Endpoints this vertical calls

| Screen | Endpoint id | Notes |
|---|---|---|
| `SCR-01` | `study_get` | `case_counts`, `capabilities`, `experiment_summary` |
| `SCR-01` | `case_list` | **not called by V3**: `openCases()` routes to `SCR-02`, which is V1's (DR-013a, Day 20 rebaseline) |
| `SCR-01` | `experiment_list`, `experiment_metrics`, `experiment_compare`, `findings_list` | listed matrix cells (N and status only), the server's verdicts, the findings summary |
| `SCR-07` | `experiment_list` | list endpoint |
| `SCR-07` | `experiment_get` | the full provenance row: split manifest, preprocessing/postprocessing, checkpoint, evaluation version |
| `SCR-07` | `experiment_metrics` | `evaluation_n` **and** `successful_n` — they are not the same number |
| `SCR-07` | `experiment_cases` | list endpoint; failed/excluded cases stay visible with `status` and `reason` |
| `SCR-07` | `experiment_compare` | `?ids={experiment_ids}` — **parameter is `ids`, token is `experiment_ids`** |

`experiment_compare` takes an array: `client.call('experiment_compare', { experiment_ids: ['EXP-U-100',
'EXP-D-100'] })` → `/api/v1/experiments/compare?ids=EXP-U-100,EXP-D-100`. Core joins and escapes; do not build
that string.

## List endpoints and the row rule

For `case_list`, `experiment_cases` (and `reviewed_masks_list`, `findings_list` in V4) the contract lists row
fields alongside top-level ones. Core accepts a field as present if it is at the top level **or** on **every**
element of `items` — a field on only some rows is refused. That is what stops a half-populated list from
rendering with blank cells.

## The one rule that makes or breaks `SCR-07`

`11` §5: **"The client must not label a comparison as fair/comparable when this contract says false."**

```js
import { readComparability, presentation } from '../../core/index.mjs';

const c = readComparability(view.data);
const p = presentation(c);
// p.mayShowSideBySide  always true  — the two sets of numbers are real either way
// p.mayShowDelta       only if fair — a difference between unlike populations is meaningless
// p.mayLabelFair       only if fair
// p.mustShowReason     when not fair — render p.reason, do not swallow it
```

Note the third case: a response whose `comparable` is **missing or not a boolean** is `UNDECIDED`, and
`UNDECIDED` is not comparable. Defaulting an absent flag to `true` is how an unfair comparison gets labelled
fair by a typo, and the chart looks perfect while it does it.

Never compute comparability yourself from `split_manifest_id` and friends, even though `experiment_get`
returns all of them. The server decides; this screen reports.

## Error codes you must handle

`ARTIFACT_NOT_FOUND` · `NON_COMPARABLE_EXPERIMENTS` · `GROUND_TRUTH_UNAVAILABLE` · `VALIDATION_ERROR` ·
`UNAUTHORIZED`

`NON_COMPARABLE_EXPERIMENTS` resolves to `EMPTY_UNAVAILABLE` with **no action** — there is nothing the user
can do about it, and offering a retry would suggest otherwise.

## TODO for Khánh

1. **Switch to real Contract 2 artifacts once ingested** (DEP-07 → backend). No model change is needed: the
   same `client.call()` reads the HTTP transport. Re-run this test, then check `SCR-01`/`SCR-07` show real N
   with `source !== 'fixture'`.
2. **Settle the shapes** in [the table above](#where-contract-11-draft-v0-stops--decisions-needed) with Trung
   in the contract v1.0 freeze, including where the DR-010 outlier selection lives; regenerate the bundle and
   adjust `PROPOSED_SHAPES` + its reader only.
3. **RQ-A / RQ-B views**: the data-scarcity trend (`trend()`), the head-to-head per fraction
   (`COMPARISONS` `RQ-A-025/050/100`) and the raw-vs-processed ablation (`RQ-B`, EXP-D-100 vs EXP-D-PP) are
   modelled; the report-ready views (`08` §9 winners/losers, paired case-level comparison, `08` §7) are not.
   Decide which primary metric/statistic the views open on once the contract names them (no default today).
4. **TC-EXP-\* evidence**: map V3-n checks to TC-EXP-003/004/005/006/007 and TC-REP-003 in the RTM, and add
   the real-data runs (TC-EXP-006 "outlier → case evidence" end-to-end through SCR-03).
5. **TC-TEAM-001**: update `management/evidence/TC_TEAM_001_BE_QUOC_KHANH.md` §4–§5 with these PRs, your own
   review of them, and the UI-vs-design comparison.
6. Deliberately left out of the skeleton: pagination of `experiment_cases` (54 holdout rows fit one page), a
   rendered `experiment_get` provenance panel (the model reads it: `cell.identity.provenance`), and the
   stale-version state (`STALE_MISMATCH`) for a cohort refreshed under a new `metric_version`.
