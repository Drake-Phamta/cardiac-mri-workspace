// node app/verticals/v3_study_and_compare/test_study_and_compare.mjs
//
// Two kinds of input, kept apart on purpose:
//
//   1. The GENERATED fixture bundle, through a real core client - every
//      screen-level check (V3-1..V3-7). Generate it first:
//
//        python contracts/api/generate_fixture.py --contract contracts/api/contract.json \
//               --output app/core/fixtures/.generated/api_bundle.json
//
//      Today the generator gives the V3 endpoints name-only placeholders
//      ("evaluation_n_fixture", one empty experiment_list row). So the
//      honest outcome on the bundle is "unavailable, and here is why" - which
//      is exactly what these checks assert.
//
//   2. Inline TYPED inputs to the pure readers (V3-8..V3-12), the way
//      app/core/tests/test_readers.mjs P3/P7 test selection.mjs and
//      comparability.mjs. They exercise the path a typed server response will
//      take. They are reader inputs, not fixtures: no screen renders them.
//
// Same harness shape as V1 and V4: a local check(), ids V3-n, exit 1 on any
// failure, nothing to install.

import { readFileSync, readdirSync } from 'node:fs';
import {
  createContract, createBundle, createClient, createFixtureTransport, getScenario,
  STATE, RECOVERY, VERDICT, success, readComparability, presentation,
} from '../../core/index.mjs';
import {
  createStudyOverview, createExperimentComparison, CELL_STATUS, MATRIX, MATRIX_IDS, COMPARISONS,
  buildCell, buildTrend, deltaFor, aggregationFor, stripLayout, pointAt, matrixEntry,
  readCount, readCohortN, readVariant, readFraction, readFamily, readMetricSummary, readOutlierSelection,
  readCaseRows, caseIntent, UNAVAILABLE, OUTLIER_RULE,
} from './index.mjs';

const ROOT = new URL('../../../', import.meta.url);
const HERE = new URL('./', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));

const contract = createContract(readJson('contracts/api/contract.json'));
const bundle = createBundle(contract, readJson('app/core/fixtures/.generated/api_bundle.json'));
const newClient = () => createClient(contract, createFixtureTransport(bundle));
const generated = (endpointId, name = 'default') => getScenario(bundle, endpointId, name);

// The generator's own request parameter, so the checks drive real scenarios.
const STUDY = generated('study_get').request.params.study_id;

let failures = 0;
let count = 0;
const check = (id, ok, detail) => {
  count += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(6)} ${detail}`);
};

// ---------------------------------------------------------------------------
// V3-1 - SCR-01 on the generated bundle: everything is read as served, and
// what cannot be read says so.
{
  const m = createStudyOverview(newClient());
  const s = await m.open({ studyId: STUDY });
  check('V3-1', s.view.state === STATE.SUCCESS && s.source === 'fixture',
    `open -> ${s.view.state}, source ${s.source} (the screen must say these are fixture values)`);
  check('V3-1', s.dataset.available && s.dataset.label === generated('study_get').response.data.dataset,
    `dataset as served: ${s.dataset.label}`);
  check('V3-1', s.caseCounts.total.available && s.caseCounts.total.value === 1,
    `case count read from case_counts.total: ${s.caseCounts.total.value}`);
  // The generator answers study_id STUDY_ID_0043 whatever is asked. Shown,
  // and flagged - not quietly relabelled with the requested id.
  check('V3-1', s.idConfirmed === false && s.servedStudyId === 'STUDY_ID_0043',
    `asked ${s.studyId}, served ${s.servedStudyId} -> idConfirmed ${s.idConfirmed}`);
  check('V3-1', s.experiments.listedIds.length === 0 && s.experiments.unreadableRows === 1,
    `experiment_list: ${s.experiments.totalRows} row, ${s.experiments.unreadableRows} without an experiment_id`);
  check('V3-1', s.experiments.matrix.length === 7
    && s.experiments.matrix.every((r) => r.status === CELL_STATUS.NOT_LISTED && r.n === null),
    'all 7 cells of the 08 section 2 matrix are NOT_LISTED, with no N - not N 0');
  check('V3-1', s.headline.every((h) => !h.requested && h.verdict === VERDICT.UNDECIDED && h.summaries === null),
    'no comparison requested, so no headline metric and no "comparable" label');
  check('V3-1', !s.outliers.available && s.outliers.reason === UNAVAILABLE.OUTLIERS_NOT_RETURNED,
    `outlier entry points -> ${s.outliers.reason} (DR-010 selection not in Contract 11 DRAFT v0)`);
  check('V3-1', s.findings.returned === 1 && s.findings.byStatus[0]?.status === 'IN_PROGRESS',
    `findings summary as returned: ${JSON.stringify(s.findings.byStatus)}`);
  const o = m.openOutlier(0);
  check('V3-1', o.enabled === false && o.reason === UNAVAILABLE.OUTLIERS_NOT_RETURNED,
    'an outlier entry with no selection is a disabled intent with its reason');
  check('V3-1', m.openCases().screen === 'SCR-02' && m.openExperiments().screen === 'SCR-07'
    && m.openFindings().screen === 'SCR-08', 'SCR-01 actions: open cases, experiments, findings');
}

// V3-2 - SCR-01 failure states. study_get is the screen; the other sections
// fail on their own.
{
  const m = createStudyOverview(newClient());
  const s = await m.open({ studyId: STUDY, scenarios: { study_get: 'error_case' } });
  check('V3-2', s.view.state === STATE.EMPTY_UNAVAILABLE && s.view.reason === 'ARTIFACT_NOT_FOUND'
    && s.view.data === null, `study ARTIFACT_NOT_FOUND -> ${s.view.state}, no data`);
  check('V3-2', s.view.actions.includes(RECOVERY.REFRESH) && !s.view.actions.includes(RECOVERY.RETRY),
    `offers ${s.view.actions.join('/')}`);

  const f = await m.open({ studyId: STUDY, scenarios: { findings_list: 'error_case' } });
  check('V3-2', f.view.state === STATE.SUCCESS && f.findings.view.state === STATE.RECOVERABLE_ERROR
    && f.findings.returned === null,
    `findings ${f.findings.view.reason} -> section ${f.findings.view.state}, returned null (not 0); study still shown`);

  const dead = createClient(contract, { kind: 'test', async send() { throw new Error('econnrefused'); } });
  const d = await createStudyOverview(dead).open({ studyId: STUDY });
  check('V3-2', d.view.state === STATE.RECOVERABLE_ERROR && d.view.actions.includes(RECOVERY.RETRY),
    `transport down -> ${d.view.state}, offers ${d.view.actions.join('/')}`);

  let threw = false;
  try { await createStudyOverview(newClient()).open({}); } catch { threw = true; }
  check('V3-2', threw, 'a missing studyId is refused, not defaulted');
}

// V3-3 - SCR-07 matrix mode on the generated bundle.
{
  const m = createExperimentComparison(newClient());
  const s = await m.open({});
  check('V3-3', s.view.state === STATE.SUCCESS && s.cells.length === 7
    && s.cells.every((c) => c.status === CELL_STATUS.NOT_LISTED),
    'nothing listed -> 7 NOT_LISTED cells, in 08 section 2 order');
  check('V3-3', s.cells.map((c) => c.id).join(',') === MATRIX_IDS.join(','),
    'cell order is the spec\'s matrix order, never a ranking');
  check('V3-3', s.comparisons.every((c) => !c.requested), 'no comparison is requested for unlisted runs');
  const cols = m.stripColumns();
  check('V3-3', cols.every((c) => c.points.length === 0 && c.withheld === CELL_STATUS.NOT_LISTED),
    'every strip column is empty AND says why');

  const e = await m.open({ scenarios: { experiment_list: 'error_case' } });
  check('V3-3', e.view.state === STATE.EMPTY_UNAVAILABLE && e.view.reason === 'ARTIFACT_NOT_FOUND',
    `experiment_list ARTIFACT_NOT_FOUND -> ${e.view.state}`);
}

// V3-4 - SCR-07 explicit pair on the generated bundle: placeholders are
// unavailable, never zero, and N intended and N successful stay two numbers.
{
  const m = createExperimentComparison(newClient());
  await m.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice_3d' });
  const u = m.cell('EXP-U-100');
  const served = generated('experiment_metrics').response.data;
  check('V3-4', u.status === CELL_STATUS.LOADED && u.servedVariant.declared === served.prediction_variant,
    `EXP-U-100 metrics served for ${u.servedVariant.declared} -> ${u.status}`);
  check('V3-4', !u.n.intended.available && u.n.intended.value === null && u.n.intended.served === served.evaluation_n,
    `N intended: unavailable (served "${u.n.intended.served}"), value null - not 0`);
  check('V3-4', !u.n.successful.available && u.n.successful.value === null
    && u.n.text === 'N intended unavailable · N successful unavailable',
    `both N shown separately: "${u.n.text}"`);
  check('V3-4', !u.summary.available && u.summary.reason === UNAVAILABLE.WRONG_TYPE,
    `metric_summary "${u.summary.served}" -> unavailable ${u.summary.reason}`);
  check('V3-4', u.context.complete === false && u.context.missing.includes('nIntended')
    && u.context.missing.includes('nSuccessful'),
    `D2 context names what is missing: ${u.context.missing.join(', ')}`);
  check('V3-4', u.identityConfirmed === false && u.identity.problems[0].includes('EXPERIMENT_ID_0043'),
    `identity mismatch reported: ${u.identity.problems[0]}`);
  check('V3-4', u.points.length === 0 && u.cases.rows.length === 1
    && u.cases.rows[0].plotState === 'UNKNOWN_STATUS',
    `the generated row (status "${u.cases.rows[0].status}") stays visible as UNKNOWN_STATUS and is not plotted`);
  check('V3-4', u.cases.rows[0].intent.enabled === false && u.cases.rows[0].intent.reason.includes('analysis_run_id'),
    `its intent is disabled: ${u.cases.rows[0].intent.reason}`);
  check('V3-4', !u.outliers.available && u.outliers.reason === UNAVAILABLE.OUTLIERS_NOT_RETURNED,
    `outliers -> ${u.outliers.reason}`);

  // Picking the plotted metric is a view change: it must not re-fetch.
  let sends = 0;
  const fixture = createFixtureTransport(bundle);
  const counting = createClient(contract, { kind: 'fixture', send: (r, o) => { sends += 1; return fixture.send(r, o); } });
  const cm = createExperimentComparison(counting);
  const opened = await cm.open({ experimentIds: ['EXP-U-100'] });
  const before = sends;
  const picked = cm.selectMetric('iou_3d');
  check('V3-4', opened.metricName === null
    && opened.cells.find((c) => c.id === 'EXP-U-100').pointsWithheld === 'NO_METRIC_SELECTED',
    'no metric is plotted until one is picked - there is no default metric');
  check('V3-4', sends === before && picked.metricName === 'iou_3d' && picked.cells.length === 7,
    `selectMetric re-reads the cached states: ${sends - before} extra calls`);
}

// V3-5 - the variant guard. The generated bundle serves RAW for every
// experiment; EXP-D-PP is defined on PROCESSED. Refused, not relabelled.
{
  const m = createExperimentComparison(newClient());
  await m.open({ experimentIds: ['EXP-D-100', 'EXP-D-PP'], metricName: 'dice_3d' });
  const pp = m.cell('EXP-D-PP');
  check('V3-5', pp.status === CELL_STATUS.VARIANT_MISMATCH && pp.n === null && pp.summary === null,
    `EXP-D-PP served RAW -> ${pp.status}, no N and no summary shown`);
  check('V3-5', pp.statusReason.includes('PROCESSED') && pp.statusReason.includes('RAW'),
    'the reason names both variants');
  check('V3-5', pp.points.length === 0 && pp.context === null && pp.confirmedLane === null,
    'no point, no metric context, no confirmed lane to hand to SCR-03');
  check('V3-5', m.cell('EXP-D-100').status === CELL_STATUS.LOADED,
    'EXP-D-100 (defined on RAW) is unaffected');
}

// V3-6 - non-comparable runs are labelled, from the server's answer.
{
  const m = createExperimentComparison(newClient());
  await m.open({
    experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice_3d',
    scenarios: { experiment_compare: 'not_comparable' },
  });
  const [label] = m.labelsFor('EXP-U-100');
  check('V3-6', label?.verdict === VERDICT.NOT_COMPARABLE && label.fair === false && label.with[0] === 'EXP-D-100',
    `NON_COMPARABLE_EXPERIMENTS -> EXP-U-100 labelled ${label?.verdict} with ${label?.with}`);
  check('V3-6', label.reason === contract.errorsByCode.get('NON_COMPARABLE_EXPERIMENTS').messageTemplate,
    `and the server's reason is shown: "${label.reason}"`);
  const c = m.comparison('RQ-A-100');
  check('V3-6', c.view.state === STATE.EMPTY_UNAVAILABLE && c.view.actions.length === 0,
    'the refusal offers no action - nothing the user can do changes it');
  check('V3-6', c.presentation.mayShowSideBySide && !c.presentation.mayShowDelta,
    'the numbers stay visible side by side; the delta does not');
  check('V3-6', m.delta('RQ-A-100', { stat: 'median' }).allowed === false, 'deltaFor refuses');

  await m.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice_3d' });
  const ok = m.comparison('RQ-A-100');
  check('V3-6', ok.comparability.verdict === VERDICT.COMPARABLE
    && ok.presentation.reason === generated('experiment_compare').response.data.compatibility_reason,
    `default scenario: the server says comparable:true -> ${ok.comparability.verdict}, reason as served`);
  check('V3-6', m.comparison('RQ-A-025').requested === false
    && m.comparison('RQ-A-025').comparability.verdict === VERDICT.UNDECIDED,
    'a comparison that was not asked is UNDECIDED, never comparable by default');

  await m.open({
    experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice_3d',
    scenarios: { experiment_compare: 'error_case' },
  });
  check('V3-6', m.comparison('RQ-A-100').comparability.verdict === VERDICT.UNDECIDED
    && !m.comparison('RQ-A-100').presentation.mayLabelFair,
    'a failed compare call is UNDECIDED - not comparable - with the failure kept');
}

// V3-7 - absent metrics: experiment_metrics ARTIFACT_NOT_FOUND.
{
  const m = createExperimentComparison(newClient());
  await m.open({ experimentIds: ['EXP-U-025'], scenarios: { experiment_metrics: 'error_case' } });
  const c = m.cell('EXP-U-025');
  check('V3-7', c.status === CELL_STATUS.UNAVAILABLE && c.statusReason === 'ARTIFACT_NOT_FOUND',
    `metrics ARTIFACT_NOT_FOUND -> cell ${c.status} (${c.statusReason})`);
  check('V3-7', c.n === null && c.summary === null && c.points.length === 0 && c.context === null,
    'no N, no summary, no point - nothing drawn that could read as 0');
  check('V3-7', c.cases?.rows.length === 1 && c.cases.rows[0].intent.enabled === false,
    'the per-case rows that did arrive stay visible, with disabled intents (variant unconfirmed)');

  const dead = createClient(contract, { kind: 'test', async send() { throw new Error('econnrefused'); } });
  const d = await createExperimentComparison(dead).open({});
  check('V3-7', d.view.state === STATE.RECOVERABLE_ERROR && d.view.actions.includes(RECOVERY.RETRY),
    `transport down -> ${d.view.state}, offers ${d.view.actions.join('/')}`);
}

// ---------------------------------------------------------------------------
// Typed inputs from here on. Field names are the contract's; the inner
// shapes are PROPOSED_SHAPES (README section "Where Contract 11 stops").

// V3-8 - counts and N.
{
  check('V3-8', readCount(54).available && readCount(54).value === 54, 'an integer count is read');
  for (const bad of ['54', -1, 1.5, null, undefined, 'evaluation_n_fixture', {}]) {
    const r = readCount(bad);
    check('V3-8', !r.available && r.value === null && r.value !== 0,
      `${JSON.stringify(bad) ?? 'undefined'} -> unavailable (${r.reason}), value null`);
  }
  const n = readCohortN({ evaluation_n: 54, successful_n: 52 });
  check('V3-8', n.text === 'N intended 54 · N successful 52' && n.consistency === 'CONSISTENT',
    `"${n.text}"`);
  check('V3-8', readCohortN({ evaluation_n: 50, successful_n: 54 }).consistency === 'SUCCESSFUL_EXCEEDS_INTENDED',
    'successful > intended is flagged, not clipped');
  const fromBundle = readCohortN(generated('experiment_metrics').response.data);
  check('V3-8', !fromBundle.intended.available && !fromBundle.successful.available,
    'the generated experiment_metrics default reads as unavailable on both counts');
  check('V3-8', readVariant('RAW_PREDICTION').lane === 'RAW' && readVariant('processed').lane === 'PROCESSED'
    && readVariant('BEST').lane === null && readVariant(undefined).lane === null,
    'variant spellings map to two lanes; anything else is undeclared');
  check('V3-8', readFraction(0.5).pct === 50 && readFraction(50).pct === null && readFraction('0.5').pct === null,
    'training_fraction: only Contract 2\'s 0.25 / 0.5 / 1.0');
  check('V3-8', readFamily('dinov2').family === 'DINOV2' && readFamily('UNet2D').family === 'UNET'
    && readFamily('model_family_fixture').family === null, 'model family read, placeholder not guessed');
}

// A LOADED cell from typed inputs, used by V3-9..V3-11.
const aggregation = aggregationFor(contract);
const ROWS = [
  { case_id: 'CASE_0101', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0101', metrics: { dice_3d: 0.91 } },
  { case_id: 'CASE_0102', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0102', metrics: { dice_3d: 0.62 } },
  { case_id: 'CASE_0103', status: 'FAILED', reason: 'INFERENCE_OOM', analysis_run_id: 'RUN_U100_0103', metrics: { dice_3d: null } },
  { case_id: 'CASE_0104', status: 'EXCLUDED', reason: 'DR-002b correlated group', analysis_run_id: null, metrics: {} },
  { case_id: 'CASE_0105', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0105', metrics: {} },
  { case_id: 'CASE_0106', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0106', metrics: { dice_3d: 0.55 } },
];
const typedCell = (expected, { variant = 'RAW_PREDICTION', outlierSelection, summary } = {}) => buildCell(expected, {
  identityView: success({
    experiment_id: expected.id,
    model_family: expected.family === 'UNET' ? 'unet' : 'dinov2',
    training_fraction: expected.fractionPct / 100,
    prediction_variant: expected.lane === 'RAW' ? 'RAW_PREDICTION' : 'PROCESSED_PREDICTION',
    split_manifest_id: 'split-pathA', subset_manifest_id: 'subset', preprocessing_version: 'pre-v1',
    postprocessing_version: 'none', checkpoint: 'ckpt', evaluation_version: 'eval-v1',
  }),
  metricsView: success({
    evaluation_n: 6, successful_n: 4, prediction_variant: variant, metric_version: 'mv1',
    metric_summary: summary ?? { dice_3d: { mean: 0.6933, median: 0.62, std: 0.15 } },
  }),
  casesView: success({ items: ROWS, metric_version: 'mv1', outlier_selection: outlierSelection }),
  population: { available: true, label: 'FINAL_HOLDOUT', n: 54 },
  metricName: 'dice_3d',
  aggregation,
});

// V3-9 - the lit path: N, rows, points, D2 context, intents, outliers.
{
  const expected = matrixEntry('EXP-U-100');
  const cell = typedCell(expected, {
    // Deliberately NOT in value order: the server's order is the order.
    outlierSelection: {
      rule_id: 'DR-010', experiment_id: 'EXP-U-100', prediction_variant: 'RAW_PREDICTION', metric_name: 'dice_3d',
      cases: [
        { case_id: 'CASE_0102', analysis_run_id: 'RUN_U100_0102', metric_value: 0.62 },
        { case_id: 'CASE_0106', analysis_run_id: 'RUN_U100_0106', metric_value: 0.55 },
        { case_id: 'CASE_0101', analysis_run_id: 'RUN_U100_0101', metric_value: 0.91 },
      ],
    },
  });
  check('V3-9', cell.status === CELL_STATUS.LOADED && cell.identityConfirmed === true,
    `${cell.id} -> ${cell.status}, identity confirmed`);
  check('V3-9', cell.n.text === 'N intended 6 · N successful 4', `"${cell.n.text}"`);
  check('V3-9', cell.points.map((p) => p.caseId).join(',') === 'CASE_0101,CASE_0102,CASE_0106',
    'only SUCCEEDED rows with a value are points, in served order');
  const byCase = Object.fromEntries(cell.cases.rows.map((r) => [r.caseId, r]));
  check('V3-9', byCase.CASE_0103.plotState === 'FAILED' && byCase.CASE_0103.reason === 'INFERENCE_OOM'
    && byCase.CASE_0104.plotState === 'EXCLUDED',
    'FAILED and EXCLUDED rows stay visible with their reason (08 section 8.1)');
  check('V3-9', byCase.CASE_0105.plotState === 'VALUE_NOT_RETURNED' && byCase.CASE_0105.value === null,
    'a SUCCEEDED row with no value is VALUE_NOT_RETURNED, not a point at 0');
  check('V3-9', cell.context.complete && cell.context.text.includes('N intended 6')
    && cell.context.text.includes('population FINAL_HOLDOUT') && cell.context.text.includes('COHORT level'),
    `D2 context complete: ${cell.context.text}`);
  check('V3-9', cell.context.aggregationSource.startsWith('contract: experiment_metrics'),
    'the aggregation level is quoted from contract.json, not typed');
  const it = cell.points[0].intent;
  check('V3-9', it.enabled && it.screen === 'SCR-03' && it.caseId === 'CASE_0101'
    && it.runId === 'RUN_U100_0101' && it.variant === 'RAW' && it.experimentId === 'EXP-U-100',
    `point -> ${it.text}`);
  check('V3-9', byCase.CASE_0104.intent.enabled === false, 'a row with no run id cannot open SCR-03');
  check('V3-9', cell.outliers.available && cell.outliers.ruleCited
    && cell.outliers.cases.map((c) => c.caseId).join(',') === 'CASE_0102,CASE_0106,CASE_0101',
    'DR-010 outliers kept in the SERVER\'s order - not re-ranked by value');
  check('V3-9', cell.outliers.cases[1].intent.enabled && cell.outliers.cases[1].intent.runId === 'RUN_U100_0106',
    'one tap from an outlier to its case: the intent is complete');

  // Refusals. Each would put a selection on screen that is not DR-010's for
  // THIS experiment and variant.
  const base = { rule_id: 'DR-010', experiment_id: 'EXP-U-100', prediction_variant: 'RAW', cases: [{ case_id: 'CASE_0102' }] };
  const refused = [
    [{ ...base, rule_id: 'TUKEY_1.5_IQR' }, UNAVAILABLE.OUTLIERS_UNDER_ANOTHER_RULE],
    [{ ...base, experiment_id: undefined }, UNAVAILABLE.OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT],
    [{ ...base, prediction_variant: undefined }, UNAVAILABLE.OUTLIERS_WITHOUT_EXPERIMENT_OR_VARIANT],
    [{ ...base, experiment_id: 'EXP-D-100' }, UNAVAILABLE.OUTLIERS_FOR_ANOTHER_EXPERIMENT],
    [{ ...base, prediction_variant: 'PROCESSED' }, UNAVAILABLE.OUTLIERS_FOR_ANOTHER_VARIANT],
    [{ ...base, cases: [] }, UNAVAILABLE.NO_ELIGIBLE_CASES],
    ['outliers_fixture', UNAVAILABLE.OUTLIERS_UNREADABLE],
  ];
  for (const [block, reason] of refused) {
    const r = readOutlierSelection(block, { experimentId: 'EXP-U-100', variant: 'RAW' });
    check('V3-9', !r.available && r.reason === reason && r.cases.length === 0, `outlier selection refused: ${reason}`);
  }
  check('V3-9', OUTLIER_RULE.id === 'DR-010', `the cited rule is ${OUTLIER_RULE.id}`);

  const mismatch = typedCell(expected, { variant: 'PROCESSED_PREDICTION' });
  check('V3-9', mismatch.status === CELL_STATUS.VARIANT_MISMATCH && mismatch.points.length === 0,
    'the same rows served for PROCESSED on a RAW experiment draw nothing');

  const intent = caseIntent({ caseId: 'CASE_0101', runId: 'RUN_1', variant: undefined, experimentId: 'EXP-U-100' });
  check('V3-9', !intent.enabled && intent.reason.includes('prediction_variant'),
    'an intent never defaults the variant');
  const rowsNoMetric = readCaseRows({ items: ROWS }, { variant: 'RAW' });
  check('V3-9', rowsNoMetric.counts.plotted === 0 && rowsNoMetric.rows[0].plotState === 'NO_METRIC_SELECTED',
    'without an explicit metric nothing is plotted - the metric is not defaulted either');
}

// V3-10 - distribution geometry: every point is tappable, and a tap opens it.
{
  const cell = typedCell(matrixEntry('EXP-U-025'));
  const columns = [{ key: cell.id, label: '25 %', group: 'UNET', points: [
    ...cell.points,
    { caseId: 'CASE_OFF', value: 1.7, intent: null },
  ] }];
  const layout = stripLayout(columns, { width: 360, height: 240 });
  const pts = layout.columns[0].points;
  check('V3-10', pts.length === 3 && layout.columns[0].offAxis.length === 1,
    '3 points drawn; an off-axis value is listed, not clipped onto the edge');
  check('V3-10', pts.every((p) => p.x >= layout.columns[0].x0 && p.x <= layout.columns[0].x1
    && p.y >= layout.plot.y0 && p.y <= layout.plot.y1), 'every point lies inside its column and the plot');
  const higher = pts.find((p) => p.caseId === 'CASE_0101');
  const lower = pts.find((p) => p.caseId === 'CASE_0106');
  check('V3-10', higher.y < lower.y, 'a higher Dice is drawn higher');
  const hit = pointAt(layout, higher.x + 2, higher.y - 2);
  check('V3-10', hit?.caseId === 'CASE_0101' && hit.intent.enabled && hit.intent.runId === 'RUN_U100_0101',
    `a tap next to a point opens ${hit?.intent.text}`);
  check('V3-10', pointAt(layout, 1, 1) === null, 'a tap on empty space opens nothing');
  const again = stripLayout(columns, { width: 360, height: 240 });
  check('V3-10', JSON.stringify(again) === JSON.stringify(layout), 'deterministic: same data, same picture');
}

// V3-11 - trend and delta are gated by the server's verdicts.
{
  const unet = MATRIX.filter((e) => e.family === 'UNET').map((e) => typedCell(e));
  const comparableOf = (verdictBody) => COMPARISONS.map((c) => {
    const comparability = readComparability(verdictBody);
    return { ...c, requested: true, notRequestedReason: null, comparability, presentation: presentation(comparability) };
  });
  const fair = buildTrend(unet, comparableOf({ comparable: true, compatibility_reason: 'same holdout, mv1' }),
    { metricName: 'dice_3d', stat: 'median' });
  const u = fair.find((t) => t.family === 'UNET');
  check('V3-11', u.connected && u.points.map((p) => p.fractionPct).join(',') === '25,50,100'
    && u.points.every((p) => p.value === 0.62),
    'UNet 25 -> 50 -> 100 joined into a line under a COMPARABLE verdict');
  const unfair = buildTrend(unet, comparableOf({ comparable: false, compatibility_reason: 'different metric_version' }),
    { metricName: 'dice_3d', stat: 'median' });
  check('V3-11', !unfair.find((t) => t.family === 'UNET').connected
    && unfair.find((t) => t.family === 'UNET').reason === 'different metric_version',
    'the same points stay unjoined under NOT_COMPARABLE, with the server\'s reason');
  check('V3-11', !fair.find((t) => t.family === 'DINOV2').connected,
    'a family with no loaded cell draws no line');

  const pairOf = (body, summary) => {
    const comparability = readComparability(body);
    return {
      ...COMPARISONS[2], requested: true, comparability, presentation: presentation(comparability),
      summaries: { 'EXP-U-100': readMetricSummary(summary['EXP-U-100']), 'EXP-D-100': readMetricSummary(summary['EXP-D-100']) },
    };
  };
  const common = { 'EXP-U-100': { dice_3d: { median: 0.80 } }, 'EXP-D-100': { dice_3d: { median: 0.85 } } };
  const d = deltaFor(pairOf({ comparable: true }, common), { metricName: 'dice_3d', stat: 'median' });
  check('V3-11', d.allowed && Math.abs(d.delta - 0.05) < 1e-12,
    `comparable pair: delta ${d.delta?.toFixed(2)} from the server's common-population summaries`);
  const nd = deltaFor(pairOf({ comparable: false, compatibility_reason: 'different split' }, common),
    { metricName: 'dice_3d', stat: 'median' });
  check('V3-11', !nd.allowed && nd.reason === 'different split', 'non-comparable pair: no delta, the reason instead');
  const ud = deltaFor(pairOf({}, common), { metricName: 'dice_3d', stat: 'median' });
  check('V3-11', !ud.allowed, 'undecided pair: no delta');
  const sparse = deltaFor(pairOf({ comparable: true }, { 'EXP-U-100': { dice_3d: { mean: 0.8 } }, 'EXP-D-100': {} }),
    { metricName: 'dice_3d', stat: 'median' });
  check('V3-11', !sparse.allowed, 'a missing statistic is not a delta of 0');
  const ms = readMetricSummary({ dice_3d: { mean: 0.8, median: 'n/a' }, note: 'x' });
  check('V3-11', ms.metrics[0].stats.median === null && ms.metrics[0].stats.mean === 0.8 && ms.ignored[0] === 'note',
    'one unreadable statistic does not hide the others, and nothing is dropped silently');
}

// V3-12 - nothing in this vertical ranks or sorts, and nothing a device
// bundle cannot load. CI's app-framework-neutral job checks bare imports for
// all of app/; these two are specific to V3.
{
  const sources = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.startsWith('test_'));
  for (const f of sources) {
    const src = readFileSync(new URL(f, HERE), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('V3-12', !code.includes('.sort(') && !code.includes('.toSorted('), `${f}: no .sort( outside comments (DR-010)`);
    check('V3-12', !/from\s+['"](?!\.)/.test(code), `${f}: relative imports only - no node:, no npm`);
  }
}

console.log(failures === 0
  ? `PASS V3 study and compare — ${count}/${count}`
  : `FAIL V3 study and compare — ${failures} of ${count} failing`);
process.exit(failures === 0 ? 0 : 1);
