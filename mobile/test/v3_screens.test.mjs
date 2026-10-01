// node --test mobile/test/  - V3 SCR-01 / SCR-07: what the two screens say and where their links go
//
// The screens draw only what src/verticals/v3/v3View.mjs computes from the V3
// state models (app/verticals/v3_study_and_compare, PR #61), so these tests
// check the words and routes a user sees without a device.
//
// V3S1-V3S6 run the models over the GENERATED fixture bundle through a real
// fixture-mode runtime - the same one the app builds - including the FIXTURE
// panel's scenario overrides. V3S7-V3S8 feed typed inputs to the pure view
// functions (the path a typed server response will take); they are reader
// inputs, not fixtures, and no screen renders them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readComparability, presentation, success } from '../../app/core/index.mjs';
import {
  COMPARISONS, MATRIX, UNAVAILABLE, aggregationFor, buildCell, caseIntent, createExperimentComparison, createStudyOverview,
  matrixEntry, notListedCell, stripLayout, pointAt,
} from '../../app/verticals/v3_study_and_compare/index.mjs';
import { resolveConfig } from '../src/config.mjs';
import { validateRoute } from '../src/nav/navigator.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { TONE } from '../src/ui/stateCopy.mjs';
import {
  caseTable, comparisonView, outlierView, overviewView, pointDetail, reasonLabel, routeForIntent,
} from '../src/verticals/v3/v3View.mjs';
import { MOBILE_ROOT, generatedBundleJson, readContractJson } from './_helpers.mjs';

const contractJson = readContractJson();
const newRuntime = () => createRuntime({
  config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: generatedBundleJson(),
});

// A route the navigator would refuse throws here, exactly as nav.push would.
const assertNavigable = (route) => {
  assert.equal(route.ok, true, `route not ok: ${route.reason}`);
  assert.doesNotThrow(() => validateRoute(route.screenId, route.params), `${route.screenId} refuses ${JSON.stringify(route.params)}`);
};

test('V3S1 SCR-01 on the generated bundle: study, cases, experiments, outliers and findings as the server sent them', async () => {
  const runtime = newRuntime();
  const snap = await createStudyOverview(runtime.client).open({ studyId: runtime.config.studyId });
  const v = overviewView(snap);

  assert.equal(v.study.idText, 'Study STUDY_DEMO');
  assert.match(v.study.idWarning, /STUDY_ID_0043/, 'the served study id is shown, not relabelled');
  // contract 1.1.0 field_shapes: dataset object, case_counts by mode, experiment_summary.
  assert.equal(v.study.datasetText, 'fixture dataset · version fixture (DATASET_FIXTURE)');
  assert.deepEqual(v.study.counts.map((c) => [c.key, c.text]), [['total', '2'], ['EVALUATION', '1'], ['INFERENCE_REVIEW', '1']]);
  assert.equal(v.study.summaryText, 'experiment summary UNAVAILABLE: FIXTURE');

  assert.equal(v.experiments.text, '1 of 7 matrix experiments listed by the server');
  assert.ok(v.experiments.notes.some((n) => /outside the 08 §2 matrix: EXP_DEMO/.test(n)), v.experiments.notes.join(' | '));
  assert.deepEqual(v.experiments.rows.map((r) => [r.label, r.cells.length]), [['UNet', 3], ['DINOv2', 4]]);
  for (const row of v.experiments.rows) {
    for (const cell of row.cells) {
      const expected = cell.id === 'EXP-D-PP' ? 'variant mismatch - refused' : 'not listed by the server';
      assert.equal(cell.statusText, expected, cell.id);
      assert.equal(cell.nText, null, `${cell.id} shows no N rather than N 0`);
    }
  }

  assert.ok(v.headline.every((h) => h.verdictText === 'not requested' && h.route.ok === false && h.reason),
    'no comparison has all its members listed, so none is labelled comparable and none links');
  // DR-010: one group per listed matrix experiment, each with its own reason.
  assert.deepEqual(v.outliers.groups.map((g) => g.experimentId), ['EXP-D-PP']);
  assert.equal(v.outliers.groups[0].view.available, false);
  assert.equal(v.outliers.groups[0].view.text, 'no metrics loaded for this experiment');
  assert.equal(v.findings.text, '1 finding returned');
  assert.deepEqual([...v.findings.byStatus], ['OPEN 1']);

  assertNavigable(v.routes.cases);
  assert.equal(v.routes.cases.screenId, 'SCR-02');
  assertNavigable(v.routes.experiments);
  assertNavigable(v.routes.findings);
});

test('V3S2 SCR-01 never prints a per-experiment metric value - that belongs on SCR-07 with its labels', async () => {
  const runtime = newRuntime();
  const snap = await createStudyOverview(runtime.client).open({ studyId: runtime.config.studyId });
  for (const row of overviewView(snap).experiments.rows) {
    for (const cell of row.cells) {
      assert.equal(cell.summaryText, null, cell.id);
      assert.equal(cell.contextText, null, cell.id);
      assert.deepEqual(cell.labels, [], cell.id);
    }
  }
});

test('V3S3 SCR-07 on the generated bundle: typed values as served, identity and variant problems shown', async () => {
  const runtime = newRuntime();
  const model = createExperimentComparison(runtime.client);
  const snap = await model.open({ experimentIds: ['EXP-U-100', 'EXP-D-100', 'EXP-D-PP'] });
  const v = comparisonView(snap);
  const card = (id) => v.rows.flatMap((r) => r.cells).find((c) => c.id === id);

  const u = card('EXP-U-100');
  assert.equal(u.statusText, 'loaded - identity unconfirmed');
  assert.equal(u.tone, TONE.WARN);
  assert.equal(u.nText, 'N intended 6 · N successful 4');
  assert.equal(u.summaryText, 'summary has dice, iou, false_positives, false_negatives, relative_volume_error - pick one');
  assert.ok(u.warnings.some((w) => /EXP_DEMO/.test(w)), u.warnings.join(' | '));
  assert.deepEqual([...u.contextMissing], []);

  const pp = card('EXP-D-PP');
  assert.equal(pp.statusText, 'variant mismatch - refused');
  assert.equal(pp.tone, TONE.DANGER);
  assert.equal(pp.nText, null);
  assert.equal(pp.summaryText, null);

  // The chips are the server's metric names; none is pre-selected.
  assert.equal(v.metric.emptyText, null);
  assert.deepEqual([...v.metric.choices], ['dice', 'iou', 'false_positives', 'false_negatives', 'relative_volume_error']);
  assert.equal(v.metric.selected, null);
  assert.ok(v.stripNotes.length === 7 && v.stripNotes.every((n) => /: \S/.test(n)), 'every empty strip says why');

  const picked = comparisonView(model.selectMetric('dice'));
  const up = picked.rows[0].cells.find((c) => c.id === 'EXP-U-100');
  assert.equal(up.summaryText, 'dice: median 0.500 · mean 0.500 · std 0.500 · q1 0.500 · q3 0.500 (server summary)');
  assert.equal(up.pointsText, '4 cases plotted');

  // Main's model (#61 QA B-3) uses a compare body only when it is about THESE
  // runs. The generated body's summary covers the generator's own ids, so the
  // RQ-A-100 verdict is unconfirmed; RQ-B mixes RAW and PROCESSED, so its
  // verdict stands and its numbers are withheld.
  const row = (id) => v.comparisons.find((c) => c.id === id);
  assert.equal(row('RQ-A-100').verdictText, 'undecided - treated as not comparable');
  assert.equal(row('RQ-A-100').tone, TONE.WARN);
  assert.match(row('RQ-A-100').reason, /without a summary for EXP-U-100, EXP-D-100/);
  assert.match(row('RQ-A-100').deltaText, /^no difference shown: /);
  assert.equal(row('RQ-B').verdictText, 'comparable (server verdict)');
  assert.match(row('RQ-B').reason, /RAW with PROCESSED.*withheld/);
  assert.match(row('RQ-B').deltaText, /^no difference shown: .*withheld/, 'no "pick a metric" for numbers that are withheld');
  assert.equal(row('RQ-A-025').verdictText, 'not requested');
});

test('V3S4 the FIXTURE panel\'s not_comparable scenario reaches SCR-07: labelled, reason shown, no difference', async () => {
  const runtime = newRuntime();
  runtime.fixtureScenarios.set('experiment_compare', 'not_comparable');
  try {
    const snap = await createExperimentComparison(runtime.client).open({ experimentIds: ['EXP-U-100', 'EXP-D-100'] });
    const row = comparisonView(snap, { stat: 'median' }).comparisons.find((c) => c.id === 'RQ-A-100');
    assert.equal(row.verdictText, 'NOT comparable (server verdict)');
    assert.equal(row.tone, TONE.WARN);
    assert.equal(row.reason, 'The experiments do not share a fair evaluation contract.');
    assert.match(row.deltaText, /^no difference shown: /);
    const card = comparisonView(snap).rows[0].cells.find((c) => c.id === 'EXP-U-100');
    assert.ok(card.labels.includes('NOT comparable with EXP-D-100 (server)'), card.labels.join(' | '));
  } finally {
    runtime.fixtureScenarios.clear();
  }
});

test('V3S5 absent metrics (generated error_case) are unavailable with a reason - no N, no number', async () => {
  const runtime = newRuntime();
  runtime.fixtureScenarios.set('experiment_metrics', 'error_case');
  try {
    const snap = await createExperimentComparison(runtime.client).open({ experimentIds: ['EXP-U-025'] });
    const card = comparisonView(snap).rows[0].cells.find((c) => c.id === 'EXP-U-025');
    assert.equal(card.statusText, 'unavailable: the server has no such artifact');
    assert.equal(card.nText, null);
    assert.equal(card.summaryText, null);
    assert.equal(card.contextText, null);
  } finally {
    runtime.fixtureScenarios.clear();
  }
});

test('V3S6 case links: every generated row is listed with a valid SCR-03 route; a missing run id disables one', async () => {
  const runtime = newRuntime();
  const snap = await createExperimentComparison(runtime.client).open({ experimentIds: ['EXP-U-100'], metricName: 'dice' });
  const table = caseTable(snap.cells.find((c) => c.id === 'EXP-U-100'));
  assert.equal(table.rows.length, 6, 'all six generated rows are listed, none dropped');
  assert.equal(table.text, '6 row(s) returned, 4 plotted');
  const failed = table.rows.find((r) => r.statusText === 'failed');
  const withheld = table.rows.find((r) => r.statusText.startsWith('withheld'));
  assert.ok(failed && failed.reason && failed.valueText === null, 'a FAILED row keeps its reason and has no value');
  assert.ok(withheld && /INT-12/.test(withheld.reason) && withheld.valueText === null, 'a WITHHELD row is listed, never with a value');
  for (const r of table.rows) assertNavigable(r.route);
  const noRun = routeForIntent(caseIntent({ caseId: 'CASE_0101', runId: null, variant: 'RAW', experimentId: 'EXP-U-100' }));
  assert.equal(noRun.ok, false);
  assert.match(noRun.reason, /analysis_run_id/);

  const route = routeForIntent(caseIntent({ caseId: 'CASE_0101', runId: 'RUN_0101', variant: 'RAW', experimentId: 'EXP-U-100' }));
  assertNavigable(route);
  assert.deepEqual({ ...route.params }, { caseId: 'CASE_0101', runId: 'RUN_0101', variant: 'RAW', experimentId: 'EXP-U-100' });
  assert.equal(routeForIntent(null).ok, false);
});

// --- typed inputs to the pure view functions --------------------------------

const aggregation = aggregationFor((() => {
  const r = newRuntime();
  return r.contract;
})());
const ROWS = [
  { case_id: 'CASE_0101', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_0101', metric_values: { dice: 0.91 } },
  { case_id: 'CASE_0102', status: 'FAILED', reason: 'INFERENCE_OOM', analysis_run_id: 'RUN_0102', metric_values: null },
];
// `items` and `selection` replace the per-case rows and patch the DR-010 block.
const typedCell = (expected, median, { items = ROWS, selection = {} } = {}) => buildCell(expected, {
  identityView: success({
    experiment_id: expected.id, model_family: expected.family === 'UNET' ? 'unet' : 'dinov2',
    training_fraction: expected.fractionPct / 100, prediction_variant: 'RAW',
  }),
  metricsView: success({
    evaluation_n: 6, successful_n: 4, prediction_variant: 'RAW', metric_version: 'mv1',
    metric_summary: { dice: { median, mean: 0.6933, std: 0.15 } },
  }),
  casesView: success({
    items, metric_version: 'mv1', prediction_variant: 'RAW',
    outlier_selection: {
      rule_id: 'DR-010', selection_version: 'dr010-outlier/v1', experiment_id: expected.id,
      prediction_variant: 'RAW', metric_name: 'dice',
      cases: [{ case_id: 'CASE_0101', analysis_run_id: 'RUN_0101', metric_value: 0.91, false_positives: 3, false_negatives: 4 }],
      ...selection,
    },
  }),
  population: { available: true, label: 'FINAL_HOLDOUT', n: 54 },
  metricName: 'dice',
  aggregation,
});
const verdicts = (body) => COMPARISONS.map((c) => {
  const comparability = readComparability(body);
  return {
    ...c, requested: true, notRequestedReason: null, comparability, presentation: presentation(comparability),
    population: { available: true, label: 'FINAL_HOLDOUT · N 54', n: 54 },
    summaries: Object.fromEntries(c.experimentIds.map((id) => [id, {
      available: true, metrics: [{ name: 'dice', available: true, stats: { median: id.startsWith('EXP-D') ? 0.85 : 0.8 } }],
    }])),
  };
});
const typedSnapshot = (body) => {
  const cells = MATRIX.map((e) => (e.question === 'RQ-A' ? typedCell(e, e.family === 'UNET' ? 0.8 : 0.85) : notListedCell(e)));
  return {
    mode: 'MATRIX', requested: cells.filter((c) => c.status === 'LOADED').map((c) => c.id), outsideMatrix: [],
    metricName: 'dice', metricNames: ['dice'], list: null, cells, comparisons: verdicts(body),
  };
};

test('V3S7 typed path: D2 context, server summary, and a difference / trend line only under COMPARABLE', () => {
  const fair = comparisonView(typedSnapshot({ comparable: true, compatibility_reason: 'same holdout, mv1' }), { stat: 'median', selectedCellId: 'EXP-U-025' });
  const u = fair.rows[0].cells.find((c) => c.id === 'EXP-U-025');
  assert.equal(u.statusText, 'loaded');
  assert.equal(u.summaryText, 'dice: median 0.800 · mean 0.693 · std 0.150 (server summary)');
  assert.match(u.contextText, /EXP-U-025 · model unet · variant RAW · COHORT level · population FINAL_HOLDOUT · N intended 6 · N successful 4/);
  assert.deepEqual([...u.contextMissing], []);
  assert.equal(u.pointsText, '1 case plotted');

  const h2h = fair.comparisons.find((c) => c.id === 'RQ-A-025');
  assert.match(h2h.deltaText, /difference \+0\.050 \(server common-population summaries\)/);
  assert.equal(fair.trend.length, 2, 'one trend row per family');
  assert.ok(fair.trend.every((t) => t.connected && t.text.startsWith('joined')), JSON.stringify(fair.trend));

  const unfair = comparisonView(typedSnapshot({ comparable: false, compatibility_reason: 'different metric_version' }), { stat: 'median' });
  assert.equal(unfair.comparisons.find((c) => c.id === 'RQ-A-025').deltaText, 'no difference shown: different metric_version');
  assert.equal(unfair.trend.length, 2);
  assert.ok(unfair.trend.every((t) => !t.connected && t.text === 'not joined: different metric_version'));

  const table = fair.selected;
  assert.equal(table.text, '2 row(s) returned, 1 plotted');
  assert.equal(table.rows[1].statusText, 'failed');
  assert.equal(table.rows[1].reason, 'INFERENCE_OOM');
  assert.equal(fair.selectedOutliers.available, true);
  assertNavigable(fair.selectedOutliers.rows[0].route);

  const noStat = comparisonView(typedSnapshot({ comparable: true }));
  assert.deepEqual([...noStat.trend], [], 'no statistic picked, no trend drawn');
  assert.ok(noStat.trendText);
  assert.equal(noStat.comparisons.find((c) => c.id === 'RQ-A-025').deltaText, 'pick a metric and a statistic to see the difference');
});

test('V3S8 a tapped strip point names its case and opens SCR-03 with case, run and variant', () => {
  const cell = typedCell(matrixEntry('EXP-D-050'), 0.85);
  const layout = stripLayout([{
    key: cell.id, label: '50 %', group: 'DINOV2', points: cell.points, highlight: cell.outliers.cases.map((c) => c.caseId),
  }], { width: 360, height: 240 });
  const p = layout.columns[0].points[0];
  const hit = pointAt(layout, p.x + 1, p.y + 1);
  const d = pointDetail(hit, 'dice');
  assert.equal(d.text, 'CASE_0101 · dice 0.910 · EXP-D-050 · DR-010 outlier (server)');
  assertNavigable(d.route);
  assert.deepEqual({ ...d.route.params }, { caseId: 'CASE_0101', runId: 'RUN_0101', variant: 'RAW', experimentId: 'EXP-D-050' });
  assert.equal(pointDetail(null, 'dice'), null);
});

test('V3S9 the V3 screens use the shared models and rank nothing; React stays out of the .mjs logic', () => {
  const dir = join(MOBILE_ROOT, 'src', 'verticals', 'v3');
  const files = readdirSync(dir).filter((f) => /\.m?js$/.test(f));
  for (const f of files) {
    const code = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!code.includes('.sort(') && !code.includes('.toSorted('), `${f} sorts something (DR-010: the client never ranks)`);
    if (f.endsWith('.mjs')) assert.ok(!/from\s+['"]react/.test(code), `${f} imports React - keep RN in .js files`);
  }
  for (const f of ['StudyOverviewScreen.js', 'ExperimentComparisonScreen.js']) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.match(src, /app\/verticals\/v3_study_and_compare\/index\.mjs/, `${f} must render the shared V3 model, not re-implement it`);
    assert.match(src, /import StateView from '\.\.\/\.\.\/ui\/StateView'/, `${f} renders its states with the shared StateView`);
  }
});

// --- the #61 QA fixes of the model on main (B-1 ... B-4) ---------------------

test('V3S10 the #61 QA refusals reach the screen as words: pinned DR-010, ineligible outlier cases, values off failed rows', () => {
  for (const code of Object.keys(UNAVAILABLE).filter((k) => k.startsWith('OUTLIERS_'))) {
    assert.notEqual(reasonLabel(code), code, `${code} is shown as a code, not in words`);
  }
  // B-2: DR-010 is pinned to the contract's selection version.
  const v0 = outlierView(typedCell(matrixEntry('EXP-U-025'), 0.8, { selection: { selection_version: 'dr010-outlier/v0' } }).outliers);
  assert.equal(v0.available, false);
  assert.equal(v0.text, 'the selection was made under another DR-010 selection version - not shown (server sent "dr010-outlier/v0")');
  // B-4: a selection that names the FAILED case is refused whole, and the case is named.
  const failedPick = outlierView(typedCell(matrixEntry('EXP-U-025'), 0.8, {
    selection: { cases: [{ case_id: 'CASE_0102', analysis_run_id: 'RUN_0102', metric_value: 0.12, false_positives: 9, false_negatives: 9 }] },
  }).outliers);
  assert.equal(failedPick.available, false);
  assert.match(failedPick.text, /not successfully evaluated - the whole selection is refused \(server sent "CASE_0102"\)$/);
  assert.deepEqual([...failedPick.rows], [], 'no outlier link is left to follow');
  // B-1: a value served on a FAILED row is never shown, and the table says it was ignored.
  const drift = caseTable(typedCell(matrixEntry('EXP-U-050'), 0.8, { items: [ROWS[0], { ...ROWS[1], metric_values: { dice: 0.2 } }] }));
  assert.equal(drift.rows[1].valueText, null);
  assert.equal(drift.rows[1].statusText, 'failed - its served value is ignored');
  assert.equal(drift.text, '2 row(s) returned, 1 plotted; 1 value(s) served on rows that did not succeed - ignored');
});

test('V3S12 a cell whose variant was refused lists its rows with no number, calls none plotted, and links none (#69 QA B-1)', async () => {
  // The generated EXP-D-PP: its metrics are served as RAW for a PROCESSED experiment.
  const runtime = newRuntime();
  const model = createExperimentComparison(runtime.client);
  await model.open({ experimentIds: ['EXP-U-100', 'EXP-D-100', 'EXP-D-PP'] });
  const snap = model.selectMetric('dice');
  const pp = caseTable(snap.cells.find((c) => c.id === 'EXP-D-PP'));
  assert.ok(pp.rows.length > 0, 'the rows stay listed');
  assert.ok(pp.rows.every((r) => r.valueText === null), `no value under a refused variant: ${pp.rows.map((r) => r.valueText).join(',')}`);
  assert.ok(pp.rows.every((r) => !/^plotted/.test(r.statusText)), pp.rows.map((r) => r.statusText).join(' | '));
  assert.ok(pp.rows.every((r) => r.route.ok === false), 'no row of a refused cell opens SCR-03');
  assert.match(pp.text, /served for another variant - listed, not drawn, not linked$/);
  assert.doesNotMatch(pp.text, /plotted/);

  // Typed: metrics RAW, but experiment_cases served for PROCESSED.
  const cell = buildCell(matrixEntry('EXP-U-100'), {
    metricsView: success({ evaluation_n: 2, successful_n: 2, prediction_variant: 'RAW', metric_version: 'mv1', metric_summary: { dice: { median: 0.8 } } }),
    casesView: success({ items: ROWS, metric_version: 'mv1', prediction_variant: 'PROCESSED' }),
    metricName: 'dice',
    aggregation,
  });
  const t = caseTable(cell);
  assert.equal(cell.status, 'LOADED');
  assert.ok(t.rows.every((r) => r.valueText === null && r.route.ok === false), JSON.stringify(t.rows));
  assert.equal(t.text, `${ROWS.length} row(s) returned - ${reasonLabel('CASES_FOR_ANOTHER_VARIANT')}`);

  // Control: the same rows under a matching variant are drawn, valued and linked.
  const ok = caseTable(typedCell(matrixEntry('EXP-U-100'), 0.8));
  assert.equal(ok.rows[0].valueText, '0.910');
  assert.equal(ok.rows[0].statusText, 'plotted');
  assertNavigable(ok.rows[0].route);
  assert.equal(ok.text, '2 row(s) returned, 1 plotted');
});

test('V3S11 SCR-01 with all seven matrix experiments listed: requested comparisons show the server verdict and link to SCR-07', async () => {
  const runtime = newRuntime();
  // The generated list names one matrix experiment. A live server that lists
  // all seven makes every SCR-01 comparison a requested one - the headline row
  // shape the generated bundle alone never reaches.
  const listAll = success({
    evaluation_population: 'evaluation_population_fixture',
    items: MATRIX.map((e) => ({ experiment_id: e.id, prediction_variant: e.lane })),
  });
  const client = {
    ...runtime.client,
    call: (id, params, options) => (id === 'experiment_list' ? Promise.resolve(listAll) : runtime.client.call(id, params, options)),
  };
  const v = overviewView(await createStudyOverview(client).open({ studyId: runtime.config.studyId }));
  assert.equal(v.experiments.text, '7 of 7 matrix experiments listed by the server');
  assert.equal(v.headline.length, COMPARISONS.length);
  const h = (id) => v.headline.find((x) => x.id === id);
  assert.equal(h('RQ-A-100').verdictText, 'undecided - treated as not comparable');
  assert.match(h('RQ-A-100').reason, /without a summary for EXP-U-100, EXP-D-100/);
  assert.equal(h('RQ-B').verdictText, 'comparable (server verdict)');
  assert.match(h('RQ-B').reason, /RAW with PROCESSED.*withheld/);
  for (const x of v.headline) {
    assert.notEqual(x.verdictText, 'not requested', x.id);
    assertNavigable(x.route);
    assert.equal(x.route.screenId, 'SCR-07');
  }
  assert.deepEqual([...h('RQ-B').route.params.experimentIds], [...COMPARISONS.find((c) => c.id === 'RQ-B').experimentIds]);
});
