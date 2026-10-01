# V3 — Study Overview (`SCR-01`) and Experiment Comparison (`SCR-07`)

**Owner: Bế Quốc Khánh** (`PROJECT_STATE.yaml`, `DEMO_STANDARD.md` §3). Secondary reviewer: Vũ Hùng Anh.

> **Day 22 skeleton.** The state models below and the two screens that render them
> (`mobile/src/verticals/v3/`, see [The screens](#the-screens--mobilesrcverticalsv3)) were built under the Day 22
> recovery override (PR-MOBILE-03: the core flow, cleanly, with what is left written down). Khánh reviews,
> completes and defends them from Day 23 — see [TODO for Khánh](#todo-for-khánh).

## What is here

| File | What it owns |
|---|---|
| `index.mjs` | the surface a screen imports |
| `studyOverview.mjs` | `createStudyOverview(client)` — the `SCR-01` state model |
| `experimentCompare.mjs` | `createExperimentComparison(client)` — the `SCR-07` state model |
| `cohort.mjs` | one matrix **cell** from the core states of `experiment_get` / `_metrics` / `_cases`; the server's comparability verdicts; trend and delta, gated by those verdicts; the D2 metric context |
| `readers.mjs` | pure readers: counts, N, variant, family, fraction, population, metric summary, per-case rows, the DR-010 outlier selection, navigation intents. `MATRIX` (`08` §2) and `COMPARISONS` |
| `strip.mjs` | strip-plot geometry and `pointAt` — a tap on any point resolves to its case |
| `test_study_and_compare.mjs` | 129 checks against the contract 1.1.0 bundle, the `empty` scenarios included (V3-14); CI step **V3 study and compare** |

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
overview.openOutlier('EXP-U-100', 0);             // -> { screen: 'SCR-03', caseId, runId, variant, enabled, reason }

const compare = createExperimentComparison(client);
await compare.open({});                           // MATRIX: the 7 cells of 08 §2, filled from experiment_list
await compare.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'] });   // EXPLICIT: e.g. one pair from SCR-01
compare.selectMetric('dice');                     // the per-case metric the strip plots - no default
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
| Failed, excluded and withheld (INFERENCE_REVIEW) cases stay visible with their reason; only `SUCCEEDED` rows with a value are points, and only when `experiment_cases` states the same variant as the metrics | `readCaseRows`, `buildCell` | V3-4, V3-9 |
| An empty list is a **legitimate absence**, said as such: no experiment listed → `SCR-07` is `EMPTY_UNAVAILABLE` / `NO_EXPERIMENTS_LISTED` with REFRESH; no case rows → the cell's strip says `NO_CASE_RESULTS`. An unknown row count is `null`, not 0 | `experimentCompare.mjs`, `buildCell` | V3-13, V3-14 |
| Outliers are the server's DR-010 `outlier_selection`, **in the order served**, never computed — refused if it cites another rule, names no experiment/variant, or belongs to another one | `readOutlierSelection` | V3-4, V3-9 |
| Nothing in this vertical sorts (`.sort(` is refused outside comments) and nothing imports outside `app/` | — | V3-12 |
| An intent to `SCR-03` is enabled only when the server named case, run **and** variant | `caseIntent` | V3-4, V3-9, V3-10 |
| A distribution is a **strip**, not a box: Tukey whiskers would be a second definition of "outlier" next to DR-010 | `strip.mjs` | V3-10 |
| Per-experiment metric values are **not** on `SCR-01`: two numbers side by side read as a comparison, and there they would carry no comparability label. `SCR-01` shows N and status per cell, and common-population numbers only under the server's `COMPARABLE` | `studyOverview.mjs` | V3-1 |

## The screens — `mobile/src/verticals/v3/`

The React Native screens of the Expo app (`TECH_STACK_ADR`) render these models; they decide nothing the
models have not already decided.

| File | What it does |
|---|---|
| `StudyOverviewScreen.js` | `SCR-01`: study, dataset, case counts by mode, capabilities, experiment summary; the matrix with **N and status only**; the server's comparability verdicts; each listed experiment's DR-010 outliers (one tap → `SCR-03`); findings; links to `SCR-02` / `SCR-07` / `SCR-08` |
| `ExperimentComparisonScreen.js` | `SCR-07`: metric and statistic chips (**no default**); the UNet / DINOv2 × 25 / 50 / 100 % cards with N, the server summary, the D2 context and the server's labels; the strip plot; comparisons with a difference only under `COMPARABLE`; the RQ-A trend; the per-case table of the tapped experiment, failed and excluded rows included. `params.experimentIds` opens one pair or group |
| `StripChart.js` | draws `stripLayout` with `react-native-svg`; a tap selects the nearest dot (`pointAt`) and the screen shows its case with an "Open case" link, so a dense strip cannot navigate by accident |
| `v3View.mjs` | **every** string, tone and route both screens show — pure, so `node --test` checks what the user reads |
| `V3Parts.js`, `useSnapshot.js` | shared cards, chips and links; the hook that shows LOADING on every request and drops a late answer to an older one |
| `mobile/test/v3_screens.test.mjs` | 9 tests: the copy and routes over the generated bundle through a real fixture runtime (including the FIXTURE panel's `not_comparable` and `error_case`), and the typed path |

```powershell
node --test mobile/test/*.test.mjs        # the mobile suite, V3 included
cd mobile; npm ci; npm run export:android # the JS bundle builds (no Gradle)
```

Every non-success state is drawn by the shell's `StateView`, so the `10` §8 states look the same as in
V1/V2/V4. In fixture mode, tap **FIXTURE** in the header to switch `experiment_compare` to `not_comparable`,
`experiment_metrics` / `experiment_list` / `study_get` to `error_case`, and watch the labels and states change
with no code edit.

## What today's generated bundle shows (contract 1.1.0)

Since contract 1.1.0 the generator gives the V3 endpoints **typed** values for one experiment, `EXP_DEMO`:
N intended 6 / successful 4, a `metric_summary` for the five case metrics, six case rows (four `SUCCEEDED`
with `metric_values`, one `FAILED`, one `WITHHELD` INFERENCE_REVIEW case) and a DR-010 `outlier_selection`.
The list also names `EXP-D-PP` as `PROCESSED`. The fixture transport answers the same body whatever id is
asked, so on the bundle:

- `SCR-01`: dataset object, case counts by mode, capabilities and `experiment_summary` (`UNAVAILABLE`, with
  its reason) as served; `EXP-D-PP` is the one listed matrix experiment; `EXP_DEMO` is listed outside the
  `08` §2 matrix and shown by id; findings `OPEN`;
- `SCR-07` for a matrix id (e.g. `EXP-U-100`): N 6 / 4, the summary, 4 plotted cases with working SCR-03
  links, the `FAILED` and `WITHHELD` rows listed with their reasons — and the identity mismatch (`EXP_DEMO`
  answered) **reported**, and the outlier selection (made for `EXP_DEMO`) **refused, not relabelled**;
- `EXP-D-PP` stays `VARIANT_MISMATCH`: the generator has a `PROCESSED` identity (`experiment_get`
  `processed_variant`) but serves its metrics as `RAW`, and identity does not launder a variant (V3-5).

The empty lists of #62 run end to end (V3-14: `NO_EXPERIMENTS_LISTED`, `NO_CASE_RESULTS`). The typed paths the
bundle cannot reach — outliers for a matrix id, trend and delta under `COMPARABLE` — are exercised by
V3-8…V3-11 and V3-13 with inline reader inputs in the contract's shapes, the way `app/core`'s
`test_readers.mjs` tests `selection.mjs` and `comparability.mjs`. No screen renders those inputs.

## The shapes are the contract's (API contract 1.1.0)

There is no V3-side assumption left; the `PROPOSED_SHAPES` of the first skeleton were adopted by contract
1.1.0 (#71) and removed here. What each reader follows:

| Field | Contract 1.1.0 | Reader |
|---|---|---|
| `study_get.dataset` / `case_counts` / `capabilities` / `experiment_summary` | `field_shapes` | `readDataset`, `readCaseCounts`, `readCapabilities`, `readExperimentSummary` |
| `experiment_list` rows | `row_fields`: `experiment_id`, `prediction_variant`; `evaluation_population` top-level (null when not shared) | `readExperimentRows` |
| `experiment_metrics.metric_summary` | `metric_rules.summary_rule`: every case metric → `summary_statistics` (`n`, `mean`, `std`, `median`, `q1`, `q3`, `min`, `max`, `ci95_low`, `ci95_high`), each a number or null | `readMetricSummary` |
| `experiment_compare.summary` | per compared `experiment_id`, a `metric_summary` over the common population | `requestComparisons`, `deltaFor` |
| `experiment_cases` rows | `row_fields` + `field_shapes.metric_values`; `status` ∈ `case_result_status` (`SUCCEEDED`, `FAILED`, `EXCLUDED`, `WITHHELD`); top-level `prediction_variant` | `readCaseRows`, `buildCell` |
| `experiment_cases.outlier_selection` | `selection_rules.outlier_selection` (DR-010, cardinality 3, served ranked) | `readOutlierSelection` |

`SCR-01` shows the outlier entry points **per listed matrix experiment**, from that experiment's
`experiment_cases.outlier_selection`: DR-010 makes the experiment and variant explicit inputs, so there is no
single study-wide outlier list (and contract 1.1.0 puts none in `experiment_summary`).

## Endpoints this vertical calls

| Screen | Endpoint id | Notes |
|---|---|---|
| `SCR-01` | `study_get` | `case_counts`, `capabilities`, `experiment_summary` |
| `SCR-01` | `case_list` | **not called by V3**: `openCases()` routes to `SCR-02`, which is V1's (DR-013a, Day 20 rebaseline) |
| `SCR-01` | `experiment_list`, `experiment_metrics`, `experiment_cases`, `experiment_compare`, `findings_list` | listed matrix cells (N and status only), each listed experiment's DR-010 `outlier_selection`, the server's verdicts, the findings summary |
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

1. **Switch to real Contract 2 artifacts once ingested** (DEP-07 → backend). No model or screen change is
   needed: the same `client.call()` reads the HTTP transport. Build a live app (`mobile/README.md`, "Live
   mode"), re-run both test suites, then check `SCR-01`/`SCR-07` show real N with the **LIVE** badge.
2. **Contract 1.1.0 is adopted** (the readers follow [its shapes](#the-shapes-are-the-contracts-api-contract-110)).
   Left with Trung: a generator scenario that serves `EXP-D-PP` metrics and cases as `PROCESSED`, so the
   ablation cell can be shown from the bundle (today it is correctly refused, V3-5).
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
7. **Device evidence — `NOT MEASURED`.** The screens were checked by `node --test` and by a JS bundle export
   only, never on the Galaxy A17. Owed: a release build on the A17 (portrait), the touch-target check
   (TC-USAB-004), the seven states via the FIXTURE panel (TC-MOBILE-STATE-001), and a short recording for the
   PR (D7). Landscape is not designed; `10` §9.1 and your design note allow chart and table side by side.
8. **Accessibility**: the strip's dots are not individually focusable; the per-case table of the tapped
   experiment is the accessible path to the same cases. Decide whether that is enough.
9. **UI vs design**: compare the screens with your design in `TC_TEAM_001_BE_QUOC_KHANH.md` §2 (the skeleton
   keeps its order: population and N before performance) and record the differences there.
