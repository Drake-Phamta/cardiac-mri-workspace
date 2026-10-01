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
//      Since API contract 1.1.0 the generator gives the V3 endpoints TYPED
//      values (N 6 / 4, a metric_summary, six case rows including FAILED and
//      WITHHELD, a DR-010 outlier_selection) for one experiment, EXP_DEMO,
//      plus EXP-D-PP in the list. The fixture transport answers the same
//      body whatever id is asked, so for a matrix id the checks also prove
//      that a served identity that differs is REPORTED, and a selection made
//      for another experiment is REFUSED - not relabelled.
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
  createStudyOverview, createExperimentComparison, CELL_STATUS, CELL_UNAVAILABLE, MATRIX, MATRIX_IDS, COMPARISONS,
  buildCell, buildTrend, deltaFor, aggregationFor, stripLayout, pointAt, matrixEntry,
  readCount, readCohortN, readVariant, readFraction, readFamily, readMetricSummary, readOutlierSelection,
  readCaseRows, caseIntent, summaryStat, UNAVAILABLE, OUTLIER_RULE,
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
  const servedStudy = generated('study_get').response.data;
  // contract field_shapes.dataset: { dataset_id, name, version }, shown as served.
  check('V3-1', s.dataset.available && s.dataset.datasetId === servedStudy.dataset.dataset_id
    && s.dataset.name === servedStudy.dataset.name && s.dataset.label.includes(servedStudy.dataset.version),
    `dataset object read as served: ${s.dataset.label}`);
  // contract field_shapes.case_counts: total plus one count per case mode.
  check('V3-1', s.caseCounts.total.available && s.caseCounts.total.value === servedStudy.case_counts.total
    && s.caseCounts.counts.map((c) => c.key).join(',') === 'total,EVALUATION,INFERENCE_REVIEW',
    `case_counts.total ${s.caseCounts.total.value}, by mode: ${s.caseCounts.counts.map((c) => `${c.key} ${c.count.value}`).join(', ')}`);
  check('V3-1', s.capabilities.names.includes('ground_truth_evaluation') && !s.capabilities.names.includes('live_analysis'),
    `capabilities on only when === true: ${s.capabilities.names.join(', ')}`);
  check('V3-1', s.experimentSummary.status === 'UNAVAILABLE' && !s.experimentSummary.available
    && s.experimentSummary.reason === servedStudy.experiment_summary.reason,
    `experiment_summary ${s.experimentSummary.status} with its reason "${s.experimentSummary.reason}" - not an invented summary`);
  // The generator answers study_id STUDY_ID_0043 whatever is asked. Shown,
  // and flagged - not quietly relabelled with the requested id.
  check('V3-1', s.idConfirmed === false && s.servedStudyId === 'STUDY_ID_0043',
    `asked ${s.studyId}, served ${s.servedStudyId} -> idConfirmed ${s.idConfirmed}`);
  // contract 1.1.0: experiment_list rows carry experiment_id and their own variant.
  check('V3-1', s.experiments.listedIds.join(',') === 'EXP_DEMO,EXP-D-PP' && s.experiments.unreadableRows === 0
    && s.experiments.outsideMatrix.join(',') === 'EXP_DEMO' && s.experiments.variantProblems.length === 0,
    `listed ${s.experiments.listedIds.join(', ')}; outside the 08 section 2 matrix: ${s.experiments.outsideMatrix.join(', ')}`);
  const pp = s.experiments.matrix.find((r) => r.id === 'EXP-D-PP');
  check('V3-1', pp.status === CELL_STATUS.VARIANT_MISMATCH && pp.n === null,
    `EXP-D-PP is listed; its metrics are served as RAW -> ${pp.status}, no N`);
  check('V3-1', s.experiments.matrix.filter((r) => r.id !== 'EXP-D-PP')
    .every((r) => r.status === CELL_STATUS.NOT_LISTED && r.n === null),
    'the 6 unlisted cells are NOT_LISTED, with no N - not N 0');
  check('V3-1', s.headline.every((h) => !h.requested && h.verdict === VERDICT.UNDECIDED && h.summaries === null),
    'no comparison has all its members listed, so no headline metric and no "comparable" label');
  check('V3-1', s.outliers.length === 1 && s.outliers[0].experimentId === 'EXP-D-PP'
    && !s.outliers[0].selection.available && s.outliers[0].selection.reason === CELL_UNAVAILABLE.CELL_NOT_LOADED,
    `outlier entry points per listed experiment: EXP-D-PP -> ${s.outliers[0].selection.reason}`);
  check('V3-1', s.findings.returned === 1 && s.findings.byStatus[0]?.status === 'OPEN',
    `findings summary as returned: ${JSON.stringify(s.findings.byStatus)}`);
  const o = m.openOutlier('EXP-D-PP', 0);
  check('V3-1', o.enabled === false && o.reason === CELL_UNAVAILABLE.CELL_NOT_LOADED,
    'an outlier entry with no usable selection is a disabled intent with its reason');
  check('V3-1', m.openOutlier('EXP-U-025', 0).enabled === false,
    'an experiment that is not listed has no outlier entry');
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
    && s.cells.filter((c) => c.id !== 'EXP-D-PP').every((c) => c.status === CELL_STATUS.NOT_LISTED),
    'the list names EXP-D-PP only from the matrix -> the other 6 cells are NOT_LISTED');
  check('V3-3', s.cells.find((c) => c.id === 'EXP-D-PP').status === CELL_STATUS.VARIANT_MISMATCH
    && s.list.variants['EXP-D-PP'].lane === 'PROCESSED',
    'EXP-D-PP is listed as PROCESSED, but its metrics come back RAW -> refused');
  check('V3-3', s.outsideMatrix.join(',') === 'EXP_DEMO',
    'EXP_DEMO is listed but outside 08 section 2: shown by id, never dropped');
  check('V3-3', s.cells.map((c) => c.id).join(',') === MATRIX_IDS.join(','),
    'cell order is the spec\'s matrix order, never a ranking');
  check('V3-3', s.comparisons.every((c) => !c.requested), 'no comparison has every member listed, so none is requested');
  const cols = m.stripColumns();
  check('V3-3', cols.every((c) => c.points.length === 0 && c.withheld),
    `every strip column is empty AND says why (${[...new Set(cols.map((c) => c.withheld))].join(', ')})`);

  const e = await m.open({ scenarios: { experiment_list: 'error_case' } });
  check('V3-3', e.view.state === STATE.EMPTY_UNAVAILABLE && e.view.reason === 'ARTIFACT_NOT_FOUND',
    `experiment_list ARTIFACT_NOT_FOUND -> ${e.view.state}`);
}

// V3-4 - SCR-07 explicit pair on the generated bundle: the typed contract
// 1.1.0 values come through as served - N intended and N successful as two
// numbers, every row kept, points only for SUCCEEDED rows with a value.
{
  const m = createExperimentComparison(newClient());
  await m.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice' });
  const u = m.cell('EXP-U-100');
  const served = generated('experiment_metrics').response.data;
  const servedRows = generated('experiment_cases').response.data.items;
  check('V3-4', u.status === CELL_STATUS.LOADED && u.servedVariant.declared === served.prediction_variant,
    `EXP-U-100 metrics served for ${u.servedVariant.declared} -> ${u.status}`);
  check('V3-4', u.n.intended.value === served.evaluation_n && u.n.successful.value === served.successful_n
    && u.n.text === `N intended ${served.evaluation_n} · N successful ${served.successful_n}` && u.n.consistency === 'CONSISTENT',
    `both N shown separately, as served: "${u.n.text}"`);
  check('V3-4', u.summary.available && summaryStat(u.summary, 'dice', 'median') === served.metric_summary.dice.median
    && summaryStat(u.summary, 'dice', 'n') === served.metric_summary.dice.n,
    `metric_summary read per statistic (metric_rules.summary_statistics): dice median ${summaryStat(u.summary, 'dice', 'median')}, n ${summaryStat(u.summary, 'dice', 'n')}`);
  check('V3-4', u.context.complete && u.context.text.includes(`N intended ${served.evaluation_n}`),
    `D2 context: ${u.context.text}`);
  check('V3-4', u.identityConfirmed === false && u.identity.problems[0].includes('EXP_DEMO'),
    `identity mismatch reported, not repaired: ${u.identity.problems[0]}`);
  const plotted = servedRows.filter((r) => r.status === 'SUCCEEDED' && r.metric_values && typeof r.metric_values.dice === 'number');
  check('V3-4', u.cases.rows.length === servedRows.length && u.points.length === plotted.length
    && u.points.map((p) => p.caseId).join(',') === plotted.map((r) => r.case_id).join(','),
    `${u.cases.rows.length} rows kept, ${u.points.length} plotted (SUCCEEDED with a dice value), in served order`);
  const failed = u.cases.rows.find((r) => r.status === 'FAILED');
  const withheld = u.cases.rows.find((r) => r.status === 'WITHHELD');
  check('V3-4', failed.plotState === 'FAILED' && failed.value === null && failed.reason
    && withheld.plotState === 'WITHHELD' && withheld.value === null && /INT-12/.test(withheld.reason),
    `FAILED and WITHHELD rows stay visible with their reason, value null - "${withheld.reason}"`);
  check('V3-4', u.points.every((p) => p.intent.enabled && p.intent.variant === 'RAW' && p.intent.runId),
    `every point opens SCR-03 with case, run and variant: ${u.points[0].intent.text}`);
  check('V3-4', !u.outliers.available && u.outliers.reason === UNAVAILABLE.OUTLIERS_FOR_ANOTHER_EXPERIMENT
    && u.outliers.served === 'EXP_DEMO',
    `the served DR-010 selection is for ${u.outliers.served} -> refused for EXP-U-100, not relabelled`);

  // Picking the plotted metric is a view change: it must not re-fetch.
  let sends = 0;
  const fixture = createFixtureTransport(bundle);
  const counting = createClient(contract, { kind: 'fixture', send: (r, o) => { sends += 1; return fixture.send(r, o); } });
  const cm = createExperimentComparison(counting);
  const opened = await cm.open({ experimentIds: ['EXP-U-100'] });
  const before = sends;
  const picked = cm.selectMetric('iou');
  check('V3-4', opened.metricName === null
    && opened.cells.find((c) => c.id === 'EXP-U-100').pointsWithheld === 'NO_METRIC_SELECTED',
    'no metric is plotted until one is picked - there is no default metric');
  check('V3-4', sends === before && picked.metricName === 'iou' && picked.cells.length === 7
    && picked.cells.find((c) => c.id === 'EXP-U-100').points.length === plotted.length,
    `selectMetric re-reads the cached states: ${sends - before} extra calls`);
  check('V3-4', opened.metricNames.join(',') === 'dice,iou,false_positives,false_negatives,relative_volume_error',
    `the chips are the server's metric names (metric_rules.case_metric_fields): ${opened.metricNames.join(', ')}`);
}

// V3-5 - the variant guard. The generated bundle serves RAW for every
// experiment; EXP-D-PP is defined on PROCESSED. Refused, not relabelled.
{
  const m = createExperimentComparison(newClient());
  await m.open({ experimentIds: ['EXP-D-100', 'EXP-D-PP'], metricName: 'dice' });
  const pp = m.cell('EXP-D-PP');
  check('V3-5', pp.status === CELL_STATUS.VARIANT_MISMATCH && pp.n === null && pp.summary === null,
    `EXP-D-PP served RAW -> ${pp.status}, no N and no summary shown`);
  check('V3-5', pp.statusReason.includes('PROCESSED') && pp.statusReason.includes('RAW'),
    'the reason names both variants');
  check('V3-5', pp.points.length === 0 && pp.context === null && pp.confirmedLane === null,
    'no point, no metric context, no confirmed lane to hand to SCR-03');
  check('V3-5', m.cell('EXP-D-100').status === CELL_STATUS.LOADED,
    'EXP-D-100 (defined on RAW) is unaffected');

  // The generator's PROCESSED identity for EXP-D-PP confirms the id; the
  // metrics are still RAW, so the cell stays refused. Identity does not
  // launder a variant.
  await m.open({ experimentIds: ['EXP-D-PP'], scenarios: { experiment_get: 'processed_variant' } });
  const pp2 = m.cell('EXP-D-PP');
  check('V3-5', pp2.identity.idConfirmed && pp2.identity.variant.lane === 'PROCESSED'
    && pp2.status === CELL_STATUS.VARIANT_MISMATCH,
    `processed_variant: id ${pp2.identity.servedId} confirmed, metrics still RAW -> ${pp2.status}`);
}

// V3-6 - non-comparable runs are labelled, from the server's answer.
{
  const m = createExperimentComparison(newClient());
  await m.open({
    experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice',
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

  await m.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice' });
  const ok = m.comparison('RQ-A-100');
  check('V3-6', ok.comparability.verdict === VERDICT.COMPARABLE
    && ok.presentation.reason === generated('experiment_compare').response.data.compatibility_reason,
    `default scenario: the server says comparable:true -> ${ok.comparability.verdict}, reason as served`);
  check('V3-6', m.comparison('RQ-A-025').requested === false
    && m.comparison('RQ-A-025').comparability.verdict === VERDICT.UNDECIDED,
    'a comparison that was not asked is UNDECIDED, never comparable by default');

  await m.open({
    experimentIds: ['EXP-U-100', 'EXP-D-100'], metricName: 'dice',
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
  check('V3-7', c.cases?.rows.length === generated('experiment_cases').response.data.items.length
    && c.cases.rows.every((r) => r.intent.enabled === false),
    `the ${c.cases?.rows.length} per-case rows that did arrive stay visible, with disabled intents (variant unconfirmed)`);

  const dead = createClient(contract, { kind: 'test', async send() { throw new Error('econnrefused'); } });
  const d = await createExperimentComparison(dead).open({});
  check('V3-7', d.view.state === STATE.RECOVERABLE_ERROR && d.view.actions.includes(RECOVERY.RETRY),
    `transport down -> ${d.view.state}, offers ${d.view.actions.join('/')}`);
}

// ---------------------------------------------------------------------------
// Typed inputs from here on, in the contract 1.1.0 shapes (metric_values,
// case_result_status, selection_rules.outlier_selection, summary_statistics).

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
  const servedMetrics = generated('experiment_metrics').response.data;
  const fromBundle = readCohortN(servedMetrics);
  check('V3-8', fromBundle.intended.value === servedMetrics.evaluation_n && fromBundle.successful.value === servedMetrics.successful_n,
    `the generated experiment_metrics default (typed since 1.1.0) reads as "${fromBundle.text}"`);
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
  { case_id: 'CASE_0101', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0101', metric_values: { dice: 0.91 } },
  { case_id: 'CASE_0102', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0102', metric_values: { dice: 0.62 } },
  { case_id: 'CASE_0103', status: 'FAILED', reason: 'INFERENCE_OOM', analysis_run_id: 'RUN_U100_0103', metric_values: null },
  { case_id: 'CASE_0104', status: 'EXCLUDED', reason: 'DR-002b correlated group', analysis_run_id: null, metric_values: null },
  { case_id: 'CASE_0105', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0105', metric_values: {} },
  { case_id: 'CASE_0106', status: 'SUCCEEDED', reason: null, analysis_run_id: 'RUN_U100_0106', metric_values: { dice: 0.55 } },
  { case_id: 'CASE_0107', status: 'WITHHELD', reason: 'INFERENCE_REVIEW case (INT-12)', analysis_run_id: 'RUN_U100_0107', metric_values: null },
];
const typedCell = (expected, {
  variant = 'RAW', casesVariant = expected.lane, outlierSelection, summary,
} = {}) => buildCell(expected, {
  identityView: success({
    experiment_id: expected.id,
    model_family: expected.family === 'UNET' ? 'unet' : 'dinov2',
    training_fraction: expected.fractionPct / 100,
    prediction_variant: expected.lane,
    split_manifest_id: 'split-pathA', subset_manifest_id: 'subset', preprocessing_version: 'pre-v1',
    postprocessing_version: 'none', checkpoint: 'ckpt', evaluation_version: 'eval-v1',
  }),
  metricsView: success({
    evaluation_n: 6, successful_n: 4, prediction_variant: variant, metric_version: 'mv1',
    metric_summary: summary ?? { dice: { mean: 0.6933, median: 0.62, std: 0.15 } },
  }),
  casesView: success({ items: ROWS, metric_version: 'mv1', prediction_variant: casesVariant, outlier_selection: outlierSelection }),
  population: { available: true, label: 'FINAL_HOLDOUT', n: 54 },
  metricName: 'dice',
  aggregation,
});

// V3-9 - the lit path: N, rows, points, D2 context, intents, outliers.
const base0 = () => ({
  rule_id: 'DR-010', selection_version: 'dr010-outlier/v1', experiment_id: 'EXP-U-100',
  prediction_variant: 'RAW', metric_name: 'dice', cases: [{ case_id: 'CASE_0102' }],
});
{
  const expected = matrixEntry('EXP-U-100');
  const cell = typedCell(expected, {
    // Deliberately NOT in value order: the server's order is the order.
    outlierSelection: {
      rule_id: 'DR-010', selection_version: 'dr010-outlier/v1', experiment_id: 'EXP-U-100',
      prediction_variant: 'RAW', metric_name: 'dice',
      cases: [
        { case_id: 'CASE_0102', analysis_run_id: 'RUN_U100_0102', metric_value: 0.62, false_positives: 40, false_negatives: 10 },
        { case_id: 'CASE_0106', analysis_run_id: 'RUN_U100_0106', metric_value: 0.55, false_positives: 5, false_negatives: 5 },
        { case_id: 'CASE_0101', analysis_run_id: 'RUN_U100_0101', metric_value: 0.91, false_positives: 1, false_negatives: 2 },
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
  check('V3-9', byCase.CASE_0107.plotState === 'WITHHELD' && byCase.CASE_0107.value === null
    && byCase.CASE_0107.reason.includes('INT-12'),
    'a WITHHELD row (INFERENCE_REVIEW, INT-12) stays visible, never with a value');
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
  check('V3-9', cell.outliers.selectionVersion === 'dr010-outlier/v1'
    && cell.outliers.cases[0].falsePositives.value === 40 && cell.outliers.cases[0].falseNegatives.value === 10,
    'the selection version and the FP/FN tie-break values are read as served');

  // contract 1.1.0: experiment_cases states its own prediction_variant. Rows
  // for another variant than the metrics stay listed but are not drawn,
  // linked or used for outliers.
  const otherRows = typedCell(expected, { casesVariant: 'PROCESSED', outlierSelection: { ...base0() } });
  check('V3-9', otherRows.status === CELL_STATUS.LOADED && otherRows.points.length === 0
    && otherRows.pointsWithheld === CELL_UNAVAILABLE.CASES_FOR_ANOTHER_VARIANT
    && otherRows.cases.rows.length === ROWS.length && otherRows.cases.rows.every((r) => !r.intent.enabled)
    && !otherRows.outliers.available,
    `rows served for PROCESSED under RAW metrics -> ${otherRows.pointsWithheld}: listed, not drawn, not linked`);

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

  const mismatch = typedCell(expected, { variant: 'PROCESSED' });
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
    { metricName: 'dice', stat: 'median' });
  const u = fair.find((t) => t.family === 'UNET');
  check('V3-11', u.connected && u.points.map((p) => p.fractionPct).join(',') === '25,50,100'
    && u.points.every((p) => p.value === 0.62),
    'UNet 25 -> 50 -> 100 joined into a line under a COMPARABLE verdict');
  const unfair = buildTrend(unet, comparableOf({ comparable: false, compatibility_reason: 'different metric_version' }),
    { metricName: 'dice', stat: 'median' });
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
  const common = { 'EXP-U-100': { dice: { median: 0.80 } }, 'EXP-D-100': { dice: { median: 0.85 } } };
  const d = deltaFor(pairOf({ comparable: true }, common), { metricName: 'dice', stat: 'median' });
  check('V3-11', d.allowed && Math.abs(d.delta - 0.05) < 1e-12,
    `comparable pair: delta ${d.delta?.toFixed(2)} from the server's common-population summaries`);
  const nd = deltaFor(pairOf({ comparable: false, compatibility_reason: 'different split' }, common),
    { metricName: 'dice', stat: 'median' });
  check('V3-11', !nd.allowed && nd.reason === 'different split', 'non-comparable pair: no delta, the reason instead');
  const ud = deltaFor(pairOf({}, common), { metricName: 'dice', stat: 'median' });
  check('V3-11', !ud.allowed, 'undecided pair: no delta');
  const sparse = deltaFor(pairOf({ comparable: true }, { 'EXP-U-100': { dice: { mean: 0.8 } }, 'EXP-D-100': {} }),
    { metricName: 'dice', stat: 'median' });
  check('V3-11', !sparse.allowed, 'a missing statistic is not a delta of 0');
  const ms = readMetricSummary({ dice: { mean: 0.8, median: 'n/a' }, note: 'x' });
  check('V3-11', ms.metrics[0].stats.median === null && ms.metrics[0].stats.mean === 0.8 && ms.ignored[0] === 'note',
    'one unreadable statistic does not hide the others, and nothing is dropped silently');
}

// V3-13 - an experiment with no per-case result yet: the server answers with
// an empty list. Legitimately unavailable, said as such - not an empty strip
// that reads as "nothing failed", and no metric of 0.
{
  const cell = buildCell(matrixEntry('EXP-D-025'), {
    metricsView: success({
      evaluation_n: 54, successful_n: 0, prediction_variant: 'RAW_PREDICTION', metric_version: 'mv1', metric_summary: {},
    }),
    casesView: success({ items: [], metric_version: 'mv1', prediction_variant: 'RAW' }),
    population: { available: true, label: 'FINAL_HOLDOUT', n: 54 },
    metricName: 'dice',
    aggregation,
  });
  check('V3-13', cell.status === CELL_STATUS.LOADED && cell.points.length === 0
    && cell.pointsWithheld === CELL_UNAVAILABLE.NO_CASE_RESULTS,
    `no case rows -> no point, withheld as ${cell.pointsWithheld}`);
  check('V3-13', cell.n.text === 'N intended 54 · N successful 0',
    `the server's own counts are shown as served: "${cell.n.text}"`);
  check('V3-13', !cell.summary.available && cell.summary.reason === UNAVAILABLE.NO_READABLE_STATISTIC
    && summaryStat(cell.summary, 'dice', 'median') === null,
    'an empty summary has no statistic - not a median of 0');
}

// V3-14 - the same, end to end through the generated `empty` scenarios. They
// arrive with the contract v1.0 PR (A3), together with the core fix that
// accepts `items: []`. Until the bundle has them this prints NOT RUN and
// counts nothing - a missing scenario is not a pass.
{
  const notRun = (what) => console.log(`  skip V3-14  NOT RUN - this bundle has no \`empty\` scenario for ${what}`);
  if (generated('experiment_list', 'empty')) {
    const m = createExperimentComparison(newClient());
    const s = await m.open({ scenarios: { experiment_list: 'empty' } });
    check('V3-14', s.view.state === STATE.EMPTY_UNAVAILABLE && s.view.reason === UNAVAILABLE.NO_EXPERIMENTS_LISTED
      && s.view.actions.includes(RECOVERY.REFRESH),
      `SCR-07, no experiment listed -> ${s.view.state} / ${s.view.reason}, offers ${s.view.actions.join('/')}`);
    check('V3-14', s.cells.every((c) => c.status === CELL_STATUS.NOT_LISTED && c.n === null && c.points.length === 0),
      'every cell NOT_LISTED, no N, no point');
    const o = await createStudyOverview(newClient()).open({ studyId: STUDY, scenarios: { experiment_list: 'empty' } });
    check('V3-14', o.view.state === STATE.SUCCESS && o.experiments.reason === UNAVAILABLE.NO_EXPERIMENTS_LISTED
      && o.experiments.totalRows === 0 && o.experiments.matrix.every((r) => r.n === null),
      `SCR-01 keeps the study and says ${o.experiments.reason}`);
  } else {
    notRun('experiment_list');
  }
  if (generated('experiment_cases', 'empty')) {
    const m = createExperimentComparison(newClient());
    await m.open({ experimentIds: ['EXP-U-025'], metricName: 'dice', scenarios: { experiment_cases: 'empty' } });
    const c = m.cell('EXP-U-025');
    check('V3-14', c.casesView.state === STATE.SUCCESS && c.cases.rows.length === 0,
      `experiment_cases with no rows -> ${c.casesView.state}, not CONTRACT_DRIFT`);
    check('V3-14', c.points.length === 0 && c.pointsWithheld === CELL_UNAVAILABLE.NO_CASE_RESULTS,
      `the strip says ${c.pointsWithheld}, and draws nothing`);
  } else {
    notRun('experiment_cases');
  }
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
