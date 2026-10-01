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
  COMPARISONS, MATRIX, aggregationFor, buildCell, caseIntent, createExperimentComparison, createStudyOverview,
  matrixEntry, notListedCell, stripLayout, pointAt,
} from '../../app/verticals/v3_study_and_compare/index.mjs';
import { resolveConfig } from '../src/config.mjs';
import { validateRoute } from '../src/nav/navigator.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { TONE } from '../src/ui/stateCopy.mjs';
import {
  caseTable, comparisonView, overviewView, pointDetail, routeForIntent,
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
  assert.equal(v.study.datasetText, 'dataset_fixture');
  assert.deepEqual(v.study.counts.map((c) => [c.key, c.text]), [['total', '1']]);

  assert.equal(v.experiments.text, '0 of 7 matrix experiments listed by the server');
  assert.ok(v.experiments.notes.some((n) => /carry no experiment_id/.test(n)), v.experiments.notes.join(' | '));
  assert.deepEqual(v.experiments.rows.map((r) => [r.label, r.cells.length]), [['UNet', 3], ['DINOv2', 4]]);
  for (const row of v.experiments.rows) {
    for (const cell of row.cells) {
      assert.equal(cell.statusText, 'not listed by the server', cell.id);
      assert.equal(cell.nText, null, `${cell.id} shows no N rather than N 0`);
    }
  }

  assert.ok(v.headline.every((h) => h.verdictText === 'not requested' && h.route.ok === false && h.reason),
    'no comparison was requested, so none is labelled comparable and none links');
  assert.equal(v.outliers.available, false);
  assert.match(v.outliers.text, /no DR-010 outlier selection/);
  assert.equal(v.findings.text, '1 finding returned');

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

test('V3S3 SCR-07 on the generated bundle: placeholders read as unavailable, identity and variant problems are shown', async () => {
  const runtime = newRuntime();
  const model = createExperimentComparison(runtime.client);
  const snap = await model.open({ experimentIds: ['EXP-U-100', 'EXP-D-100', 'EXP-D-PP'] });
  const v = comparisonView(snap);
  const card = (id) => v.rows.flatMap((r) => r.cells).find((c) => c.id === id);

  const u = card('EXP-U-100');
  assert.equal(u.statusText, 'loaded - identity unconfirmed');
  assert.equal(u.tone, TONE.WARN);
  assert.equal(u.nText, 'N intended unavailable · N successful unavailable');
  assert.match(u.summaryText, /^summary unavailable: .*"metric_summary_fixture"/);
  assert.ok(u.warnings.some((w) => /EXPERIMENT_ID_0043/.test(w)), u.warnings.join(' | '));
  assert.ok(u.contextMissing.includes('nIntended') && u.contextMissing.includes('nSuccessful'));

  const pp = card('EXP-D-PP');
  assert.equal(pp.statusText, 'variant mismatch - refused');
  assert.equal(pp.tone, TONE.DANGER);
  assert.equal(pp.nText, null);
  assert.equal(pp.summaryText, null);

  assert.ok(v.metric.emptyText, 'no metric chip is invented when the summaries name none');
  assert.equal(v.metric.selected, null);
  assert.ok(v.stripNotes.length === 7 && v.stripNotes.every((n) => /: \S/.test(n)), 'every empty strip says why');

  const verdict = (id) => v.comparisons.find((c) => c.id === id).verdictText;
  assert.equal(verdict('RQ-A-100'), 'comparable (server verdict)');
  assert.equal(verdict('RQ-B'), 'comparable (server verdict)');
  assert.equal(verdict('RQ-A-025'), 'not requested');
  assert.match(v.comparisons.find((c) => c.id === 'RQ-A-100').deltaText, /pick a metric and a statistic/);
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

test('V3S6 case links: a row without a run id is disabled with its reason; a complete intent is a valid SCR-03 route', async () => {
  const runtime = newRuntime();
  const snap = await createExperimentComparison(runtime.client).open({ experimentIds: ['EXP-U-100'] });
  const table = caseTable(snap.cells.find((c) => c.id === 'EXP-U-100'));
  assert.equal(table.rows.length, 1, 'the one generated row is listed, not dropped');
  assert.equal(table.rows[0].statusText, 'status "IN_PROGRESS" not recognised');
  assert.equal(table.rows[0].route.ok, false);
  assert.match(table.rows[0].route.reason, /analysis_run_id/);

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
  { case_id: 'CASE_0101', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_0101', metrics: { dice_3d: 0.91 } },
  { case_id: 'CASE_0102', status: 'FAILED', reason: 'INFERENCE_OOM', analysis_run_id: 'RUN_0102', metrics: {} },
];
const typedCell = (expected, median) => buildCell(expected, {
  identityView: success({
    experiment_id: expected.id, model_family: expected.family === 'UNET' ? 'unet' : 'dinov2',
    training_fraction: expected.fractionPct / 100, prediction_variant: 'RAW_PREDICTION',
  }),
  metricsView: success({
    evaluation_n: 6, successful_n: 4, prediction_variant: 'RAW_PREDICTION', metric_version: 'mv1',
    metric_summary: { dice_3d: { median, mean: 0.6933, std: 0.15 } },
  }),
  casesView: success({
    items: ROWS, metric_version: 'mv1',
    outlier_selection: {
      rule_id: 'DR-010', experiment_id: expected.id, prediction_variant: 'RAW', metric_name: 'dice_3d',
      cases: [{ case_id: 'CASE_0101', analysis_run_id: 'RUN_0101', metric_value: 0.91 }],
    },
  }),
  population: { available: true, label: 'FINAL_HOLDOUT', n: 54 },
  metricName: 'dice_3d',
  aggregation,
});
const verdicts = (body) => COMPARISONS.map((c) => {
  const comparability = readComparability(body);
  return {
    ...c, requested: true, notRequestedReason: null, comparability, presentation: presentation(comparability),
    population: { available: true, label: 'FINAL_HOLDOUT · N 54', n: 54 },
    summaries: Object.fromEntries(c.experimentIds.map((id) => [id, {
      available: true, metrics: [{ name: 'dice_3d', available: true, stats: { median: id.startsWith('EXP-D') ? 0.85 : 0.8 } }],
    }])),
  };
});
const typedSnapshot = (body) => {
  const cells = MATRIX.map((e) => (e.question === 'RQ-A' ? typedCell(e, e.family === 'UNET' ? 0.8 : 0.85) : notListedCell(e)));
  return {
    mode: 'MATRIX', requested: cells.filter((c) => c.status === 'LOADED').map((c) => c.id), outsideMatrix: [],
    metricName: 'dice_3d', metricNames: ['dice_3d'], list: null, cells, comparisons: verdicts(body),
  };
};

test('V3S7 typed path: D2 context, server summary, and a difference / trend line only under COMPARABLE', () => {
  const fair = comparisonView(typedSnapshot({ comparable: true, compatibility_reason: 'same holdout, mv1' }), { stat: 'median', selectedCellId: 'EXP-U-025' });
  const u = fair.rows[0].cells.find((c) => c.id === 'EXP-U-025');
  assert.equal(u.statusText, 'loaded');
  assert.equal(u.summaryText, 'dice_3d: median 0.800 · mean 0.693 · std 0.150 (server summary)');
  assert.match(u.contextText, /EXP-U-025 · model unet · variant RAW_PREDICTION · COHORT level · population FINAL_HOLDOUT · N intended 6 · N successful 4/);
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
});

test('V3S8 a tapped strip point names its case and opens SCR-03 with case, run and variant', () => {
  const cell = typedCell(matrixEntry('EXP-D-050'), 0.85);
  const layout = stripLayout([{
    key: cell.id, label: '50 %', group: 'DINOV2', points: cell.points, highlight: cell.outliers.cases.map((c) => c.caseId),
  }], { width: 360, height: 240 });
  const p = layout.columns[0].points[0];
  const hit = pointAt(layout, p.x + 1, p.y + 1);
  const d = pointDetail(hit, 'dice_3d');
  assert.equal(d.text, 'CASE_0101 · dice_3d 0.910 · EXP-D-050 · DR-010 outlier (server)');
  assertNavigable(d.route);
  assert.deepEqual({ ...d.route.params }, { caseId: 'CASE_0101', runId: 'RUN_0101', variant: 'RAW', experimentId: 'EXP-D-050' });
  assert.equal(pointDetail(null, 'dice_3d'), null);
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
