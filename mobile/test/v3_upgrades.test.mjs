// node --test mobile/test/  - V3 upgrades on SCR-01 and SCR-07: plain wording, paired differences, trend chart,
// overview tiles, metric legend and "About this data".
//
// Fixture-mode checks run the models over the GENERATED bundle (with its full_matrix and comparable scenarios);
// the paired and trend checks also use typed experiment_cases rows that differ per run, because the fixture serves
// the same rows for every experiment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createExperimentComparison, createStudyOverview } from '../src/screens/v3-study/models.mjs';
import {
  median, pairAt, pairDetail, pairedCards, pairedLayout, whyNoPairs,
} from '../src/screens/v3-study/paired.mjs';
import { createClient } from '../src/api/client.mjs';
import { validateRoute } from '../src/navigation/navigator.mjs';
import { trendLayout, trendNotes, trendSeries } from '../src/screens/v3-study/trend.mjs';
import { SIX_RUNS, v3Transport } from './_v3_server.mjs';
import { caseIntent, OUTLIER_RULE, readCaseCounts } from '../src/screens/v3-study/readers.mjs';
import { casesTile, diceTile, findingsTile } from '../src/screens/v3-study/tiles.mjs';
import {
  aboutData, DATASET_SOURCE_URL, LOCKED_METRICS, METRIC_LEGEND, metricLabel, runDetails, studyDetails,
} from '../src/screens/v3-study/about.mjs';
import {
  blockedText, caseTable, chooseOutlierGroup, comparisonView, experimentLabel, FAMILY_STYLE, OUTLIER_LABEL, overviewView, plainText,
  pointAt, pointDetail, routeForIntent, trianglePath,
} from '../src/screens/v3-study/view.mjs';
import { color, contrastRatio, family } from '../src/components/tokens.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import {
  MOBILE_ROOT, REPO_ROOT, generatedBundleJson, readContractJson,
} from './_helpers.mjs';

const contractJson = readContractJson();
const V3_DIR = join(MOBILE_ROOT, 'src', 'screens', 'v3-study');
const newRuntime = (scenarios = {}) => {
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: generatedBundleJson() });
  for (const [endpointId, name] of Object.entries(scenarios)) runtime.fixtureScenarios.set(endpointId, name);
  return runtime;
};
const FULL = { experiment_list: 'full_matrix', experiment_compare: 'comparable' };
const PROCESS_ID = /\bDR-\d|\bINT-\d|\bQA\b|\bTC-\d|08 §2/;

test('V3U1 the screens say "lowest-Dice cases", never a process id; the code keeps the contract rule id', async () => {
  const pinned = contractJson.selection_rules.outlier_selection;
  assert.equal(OUTLIER_RULE.id, pinned.rule_id, 'the code still names the rule as the contract does');
  assert.equal(pinned.metric_name, 'dice');
  assert.equal(OUTLIER_LABEL, `${pinned.cardinality} lowest-Dice cases`);

  // A row's reason is the server's own sentence, shown as sent; only the app's words are checked.
  const servedReasons = generatedBundleJson().scenarios.experiment_cases.default.response.data.items
    .map((row) => row.reason).filter(Boolean);
  const appWords = (text) => servedReasons.reduce((t, reason) => t.split(reason).join(''), text);
  for (const scenarios of [{}, FULL]) {
    const runtime = newRuntime(scenarios);
    const overview = overviewView(await createStudyOverview(runtime.client).open({ studyId: runtime.config.studyId }));
    const model = createExperimentComparison(runtime.client);
    await model.open({});
    const comparison = comparisonView(model.selectMetric('dice'), { stat: 'median', selectedCellId: 'EXP-U-025' });
    for (const [name, text] of [['SCR-01', JSON.stringify(overview)], ['SCR-07', JSON.stringify(comparison)]]) {
      assert.doesNotMatch(appWords(text), PROCESS_ID, `${name} text names a process id`);
    }
  }
  for (const f of ['StudyOverviewScreen.js', 'ExperimentComparisonScreen.js']) {
    const code = readFileSync(join(V3_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, PROCESS_ID, `${f} has a process id in its screen copy`);
  }
});

test('V3U2 families differ by colour AND marker: UNet blue circle, DINOv2 orange triangle, from the design tokens', () => {
  assert.deepEqual({ ...FAMILY_STYLE.UNET }, { ...family.UNET });
  assert.deepEqual({ ...FAMILY_STYLE.DINOV2 }, { ...family.DINOV2 });
  assert.equal(FAMILY_STYLE.UNET.marker, 'circle');
  assert.equal(FAMILY_STYLE.DINOV2.marker, 'triangle');
  assert.ok(contrastRatio(FAMILY_STYLE.UNET.color, color.surface) >= 3 && contrastRatio(FAMILY_STYLE.DINOV2.color, color.surface) >= 3,
    'both markers are at least 3:1 on the card surface');
  // A closed triangle around its centre: apex above, base below.
  assert.equal(trianglePath(100, 50, 5), 'M100 44 L105.5 54 L94.5 54 Z');
});

// --- paired per-case differences (SCR-07) ------------------------------------

const assertNavigable = (route) => {
  assert.equal(route.ok, true, `route not ok: ${route.reason}`);
  assert.doesNotThrow(() => validateRoute(route.screenId, route.params), `${route.screenId} refuses ${JSON.stringify(route.params)}`);
};
// SCR-07 over the typed per-run server (_v3_server.mjs), opened for one pair.
async function typedComparison(options = {}, ids = ['EXP-U-025', 'EXP-D-025']) {
  const runtime = newRuntime();
  const client = createClient(runtime.contract, v3Transport(contractJson, runtime.bundle, options));
  const model = createExperimentComparison(client);
  await model.open({ experimentIds: ids });
  return model;
}

test('V3U3 a COMPARABLE pair: one dot per case with a Dice in both runs, lowest difference first, median line', async () => {
  const model = await typedComparison();
  const before = pairedCards(model.current);
  assert.equal(before.cards.length, 1);
  assert.equal(before.cards[0].available, false, 'no metric picked yet: nothing is drawn');
  assert.equal(before.cards[0].reason, 'pick a metric above to see the per-case differences');

  const { cards, emptyText } = pairedCards(model.selectMetric('dice'));
  assert.equal(emptyText, null);
  const card = cards[0];
  assert.equal(card.id, 'RQ-A-025');
  assert.equal(card.available, true, card.reason);
  // DINOv2 minus UNet: 0002 +0.04, 0003 -0.03, 0004 +0.09, 0005 +0.12; the withheld CASE_0001 has no value.
  assert.deepEqual(card.pairs.map((p) => p.caseId), ['CASE_0003', 'CASE_0002', 'CASE_0004', 'CASE_0005']);
  assert.deepEqual(card.pairs.map((p) => p.delta.toFixed(2)), ['-0.03', '0.04', '0.09', '0.12']);
  assert.equal(card.median.toFixed(3), '0.065', 'median of an even count: the mean of the two middle differences');
  assert.equal(card.summaryText, 'dice, DINOv2 25 % minus UNet 25 %: 4 cases, median difference +0.065');
  assert.equal(card.directionText, 'Above 0: DINOv2 25 % higher. Below 0: UNet 25 % higher.');
  assert.equal(card.unpairedText, '1 case of the common population without a value in both runs - not drawn');
  assert.equal(card.captionText, 'DINOv2 25 % − UNet 25 % · 4 cases · median +0.065', 'the one-line caption under the chart');
  assert.equal(card.unpairedShort, '1 case without a value in both runs is not drawn');

  const detail = pairDetail(card.pairs[0], card);
  assert.equal(detail.text, 'CASE_0003: UNet 25 % 0.610, DINOv2 25 % 0.580, difference -0.030');
  assert.deepEqual(detail.links.map((l) => l.label), ['Open in UNet 25 %', 'Open in DINOv2 25 %']);
  for (const l of detail.links) assertNavigable(l.route);
  assert.deepEqual(detail.links.map((l) => l.route.params.runId), ['RUN_U025_0003', 'RUN_D025_0003'], 'each button opens its own run');

  const layout = pairedLayout(card.pairs, card.median, { width: 360, height: 200 });
  assert.equal(layout.limit, 0.2, 'the axis is symmetric around 0 and just covers the largest difference');
  const xs = layout.points.map((p) => p.x);
  assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]), 'left to right in the given order');
  assert.ok(layout.points.every((p, i) => i === 0 || p.y <= layout.points[i - 1].y), 'a larger difference is drawn higher');
  assert.ok(layout.points[0].y > layout.zeroY && layout.points[1].y < layout.zeroY, 'below the zero line means UNet higher');
  assert.ok(layout.medianY < layout.zeroY, 'a positive median sits above the zero line');
  const p = layout.points[2];
  assert.equal(pairAt(layout, p.x + 3, p.y - 3).caseId, 'CASE_0004');
  assert.equal(pairAt(layout, 1, 1), null, 'a tap on empty space selects nothing');

  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('V3U4 no paired view unless the server says COMPARABLE: not comparable, undecided and withheld say why', async () => {
  const refused = pairedCards((await typedComparison({ compare: 'not_comparable' })).selectMetric('dice')).cards[0];
  assert.equal(refused.available, false);
  assert.deepEqual([...refused.pairs], []);
  assert.match(refused.reason, /^the server says these runs are not comparable: /);

  for (const [scenarios, why] of [
    [{}, /without a summary for EXP-U-100, EXP-D-100/],
    [{ experiment_compare: 'not_comparable' }, /^the server says these runs are not comparable: The experiments do not share a fair evaluation contract\.$/],
  ]) {
    const model = createExperimentComparison(newRuntime(scenarios).client);
    await model.open({ experimentIds: ['EXP-U-100', 'EXP-D-100'] });
    const card = pairedCards(model.selectMetric('dice')).cards[0];
    assert.equal(card.available, false);
    assert.match(card.reason, why);
  }

  // Numbers the model withholds (raw vs post-processed) are withheld here too, with the same reason.
  const ablation = { requested: true, kind: 'ABLATION', experimentIds: ['EXP-D-100', 'EXP-D-PP'], numbersWithheld: { reason: 'mixed variants' } };
  assert.equal(whyNoPairs(ablation), 'mixed variants');
});

test('V3U5 empty states: no pair loaded, a run with no rows, and the fixture whose runs share one set of rows', async () => {
  const model = createExperimentComparison(newRuntime().client);
  await model.open({});
  const none = pairedCards(model.selectMetric('dice'));
  assert.deepEqual([...none.cards], []);
  assert.match(none.emptyText, /both runs of a pair must be listed by the server/);
  assert.equal(none.notRequested.length, 3, 'each UNet vs DINOv2 pair says why it is missing');

  const noRows = pairedCards((await typedComparison({ noRows: ['EXP-D-025'] })).selectMetric('dice')).cards[0];
  assert.equal(noRows.available, false);
  assert.equal(noRows.reason, 'EXP-D-025 has no per-case dice value: no per-case result yet');

  // The generated rows are the same for every run, so every difference is 0 - drawn as such, not hidden.
  const fixture = createExperimentComparison(newRuntime(FULL).client);
  await fixture.open({});
  const flat = pairedCards(fixture.selectMetric('dice'));
  assert.deepEqual(flat.cards.map((c) => [c.id, c.available, c.pairs.length]), [
    ['RQ-A-025', true, 4], ['RQ-A-050', true, 4], ['RQ-A-100', true, 4],
  ]);
  assert.ok(flat.cards.every((c) => c.median === 0 && c.pairs.every((p) => p.delta === 0)));
});

// --- trend over 25 / 50 / 100 % (SCR-07) --------------------------------------

async function typedMatrix(options) {
  const runtime = newRuntime();
  const model = createExperimentComparison(createClient(runtime.contract, v3Transport(contractJson, runtime.bundle, options)));
  await model.open({});
  return model;
}

test('V3U7 trend: every case, the server median and q1-q3 per run; line and band only under COMPARABLE', async () => {
  const fair = (await typedMatrix({ dice: SIX_RUNS })).selectMetric('dice');
  assert.deepEqual([...trendSeries(fair.cells, fair.comparisons, null)], [], 'no metric picked, no chart');
  const series = trendSeries(fair.cells, fair.comparisons, 'dice');
  assert.deepEqual(series.map((s) => [s.family, s.joined, s.band, s.runs.map((r) => r.fractionPct).join('/')]), [
    ['UNET', true, true, '25/50/100'], ['DINOV2', true, true, '25/50/100'],
  ]);
  const u025 = series[0].runs[0];
  assert.deepEqual([...u025.values], [0.82, 0.61, 0.7, 0.4], 'every plotted case, as served');
  assert.equal(u025.median.toFixed(3), '0.655', 'the median is the server summary, not computed here');
  assert.ok(u025.q1 < u025.median && u025.median < u025.q3);
  assert.deepEqual([...trendNotes(series)], [
    'UNet: joined - the server judged the three runs comparable',
    'DINOv2: joined - the server judged the three runs comparable',
  ]);

  const layout = trendLayout(series, { width: 360, height: 220 });
  const [unet, dino] = layout.families;
  assert.equal(unet.line.split(' L').length, 3, 'one line through the three medians');
  assert.ok(unet.band.startsWith('M') && unet.band.endsWith('Z'), 'a closed q1-q3 band');
  assert.ok(unet.runs.every((r, i) => r.x < dino.runs[i].x), 'UNet left of DINOv2 at each fraction');
  for (const run of [...unet.runs, ...dino.runs]) {
    assert.ok(run.iqr.y <= run.medianY && run.medianY <= run.iqr.y + run.iqr.height, `${run.experimentId}: the median lies inside q1-q3`);
    assert.equal(run.dots.length, 4);
  }
  assert.ok(unet.runs[2].medianY < unet.runs[0].medianY, 'a higher median Dice is drawn higher');
  assert.equal(layout.offAxis, 0);

  const unfair = (await typedMatrix({ dice: SIX_RUNS, compare: 'not_comparable' })).selectMetric('dice');
  const apart = trendSeries(unfair.cells, unfair.comparisons, 'dice');
  assert.ok(apart.every((s) => !s.joined && !s.band));
  assert.match(trendNotes(apart)[0], /^UNet: not joined - /);
  const apartLayout = trendLayout(apart, { width: 360, height: 220 });
  assert.ok(apartLayout.families.every((f) => f.line === null && f.band === null), 'no line or band');
  assert.ok(apartLayout.families.every((f) => f.runs.every((r) => r.iqr && r.medianY !== null && r.dots.length === 4)),
    'each run still shows its cases, its q1-q3 bar and its median, side by side');

  const counts = (await typedMatrix({ dice: SIX_RUNS })).selectMetric('false_positives');
  const countSeries = trendSeries(counts.cells, counts.comparisons, 'false_positives');
  assert.equal(trendLayout(countSeries, { width: 360, height: 220 }).offAxis, 24, 'voxel counts are off a 0-1 axis: counted, not clipped');
  assert.match(trendNotes(countSeries).at(-1), /^24 value\(s\) outside 0 to 1 are not drawn/);
});

// --- SCR-01 tiles and outlier bars --------------------------------------------

test('V3U8 SCR-01 tiles: case counts, findings open / resolved, median Dice only under COMPARABLE', async () => {
  const plain = newRuntime();
  const snap = await createStudyOverview(plain.client).open({ studyId: plain.config.studyId });
  assert.deepEqual({ ...casesTile(snap.caseCounts), lines: [...casesTile(snap.caseCounts).lines] },
    { value: '2', text: 'cases in the study', lines: ['1 evaluation', '1 inference & review'] });
  assert.deepEqual({ ...findingsTile(snap.findings) }, { open: 1, resolved: 0 });
  const none = diceTile(snap.headline);
  assert.equal(none.emptyText, 'No UNet vs DINOv2 pair is judged comparable yet.');
  assert.deepEqual(none.rows.map((r) => [r.label, r.chip, r.unetText]), [
    ['25 % data', 'Not compared', null], ['50 % data', 'Not compared', null], ['100 % data', 'Not compared', null],
  ]);
  assert.match(none.rows[0].note, /EXP-U-025.* not available to compare/);

  const full = newRuntime(FULL);
  const fixtureDice = diceTile((await createStudyOverview(full.client).open({ studyId: full.config.studyId })).headline);
  assert.equal(fixtureDice.emptyText, null);
  assert.deepEqual(fixtureDice.rows.map((r) => [r.chip, r.unetText, r.dinoText, r.note]), [
    ['Comparable', 'UNet 0.500', 'DINOv2 0.500', 'common population 5 cases'],
    ['Comparable', 'UNet 0.500', 'DINOv2 0.500', 'common population 5 cases'],
    ['Comparable', 'UNet 0.500', 'DINOv2 0.500', 'common population 5 cases'],
  ]);
  for (const r of fixtureDice.rows) assertNavigable(r.route);
  assert.deepEqual([...fixtureDice.rows[2].route.params.experimentIds], ['EXP-U-100', 'EXP-D-100'], 'a row opens SCR-07 on its pair');

  const typed = async (options) => {
    const runtime = newRuntime();
    const client = createClient(runtime.contract, v3Transport(contractJson, runtime.bundle, options));
    return createStudyOverview(client).open({ studyId: runtime.config.studyId });
  };
  const fair = await typed({ dice: SIX_RUNS });
  assert.deepEqual(diceTile(fair.headline).rows[0].unetText, 'UNet 0.655', "the server's median over the common population");
  assert.deepEqual(diceTile(fair.headline).rows[0].dinoText, 'DINOv2 0.685');
  assert.deepEqual([diceTile(fair.headline).rows[0].unet, diceTile(fair.headline).rows[0].dino], [0.655, 0.685], 'the markers use the numbers');
  assert.deepEqual([none.rows[0].unet, none.rows[0].dino], [null, null], 'no pair, no number to place on the track');
  const refused = diceTile((await typed({ dice: SIX_RUNS, compare: 'not_comparable' })).headline);
  assert.ok(refused.rows.every((r) => r.chip === 'Not comparable' && r.unetText === null
    && r.note === 'The experiments do not share a fair evaluation contract.'), JSON.stringify(refused.rows.map((r) => r.note)));

  // The outlier rows carry a bar as long as their Dice, in the server's order.
  const group = overviewView(fair).outliers.groups.find((g) => g.experimentId === 'EXP-U-025');
  assert.equal(group.family, 'UNET');
  assert.deepEqual(group.view.rows.map((r) => [r.caseId, r.bar]), [['CASE_0005', 0.4], ['CASE_0003', 0.61], ['CASE_0004', 0.7]]);
  assert.deepEqual(group.view.rows.map((r) => r.scoreText), ['0.400', '0.610', '0.700'], 'the row shows the bare Dice');
  assert.equal(group.view.variantText, 'Raw');

  const failed = await createStudyOverview(newRuntime({ findings_list: 'error_case' }).client).open({ studyId: plain.config.studyId });
  assert.deepEqual({ ...findingsTile(failed.findings) }, { open: null, resolved: null }, 'a failed list is not "0 open"');
  assert.deepEqual({ ...casesTile(null), lines: [] }, { value: null, text: 'case counts unavailable', lines: [] });
  const noTotal = casesTile(readCaseCounts({ EVALUATION: 3 }));
  assert.deepEqual([noTotal.value, noTotal.text, [...noTotal.lines]], [null, 'total unavailable', ['3 evaluation']]);
});

// --- metric legend and "About this data" ----------------------------------------

test('V3U9 the legend covers every case metric of the contract and locks the ones it blocks', () => {
  assert.deepEqual(METRIC_LEGEND.map((m) => m.name), contractJson.metric_rules.case_metric_fields);
  assert.deepEqual(LOCKED_METRICS.map((m) => m.name), contractJson.metric_rules.physical_metrics_blocked_while_geometry_not_validated);
  assert.equal(METRIC_LEGEND[0].text, 'overlap of prediction and reference, 0 to 1; higher is better');
  assert.match(LOCKED_METRICS[0].label, /^HD95$/);
  assert.match(LOCKED_METRICS[0].text, /^locked: .*geometry/);
});

test('V3U10 "About this data": source and terms, pseudonymous case IDs, counts and scores only, research use', () => {
  const sheet = aboutData({ datasetName: 'fixture dataset', fixture: true });
  assert.deepEqual(sheet.map((s) => s.title), [
    'Where the data comes from', 'Terms of use', 'Case IDs', 'What these screens show', 'Lowest-Dice list', 'Use', 'This build',
  ]);
  const text = sheet.flatMap((s) => s.lines).join('\n');
  // The source the sheet names is the one the dataset audit recorded when the data was downloaded.
  const audit = readFileSync(join(REPO_ROOT, 'data', 'DATASET_AUDIT.md'), 'utf8');
  assert.ok(audit.includes(DATASET_SOURCE_URL) && text.includes(DATASET_SOURCE_URL), 'the source is the one the dataset audit names');
  assert.match(audit, /154 unique CASE_NNNN IDs/, 'the case ID range shown matches the dataset audit');
  assert.match(text, /CASE_0001 to CASE_0154/);
  assert.match(text, /This is the LASC 2018 challenge data, not the later LAScarQS 2022 data\./);
  assert.match(text, /no name, birth date or hospital record number/);
  assert.match(text, /Counts and scores only/);
  assert.match(text, /Not for diagnosis or treatment decisions/);
  assert.match(text, /In this study the dataset is named "fixture dataset"\./);
  assert.match(text, /generated placeholder, not a result/);
  assert.match(text, /The lowest-Dice list shows the few cases where an experiment's prediction overlaps the reference outline least/);
  assert.doesNotMatch(text, PROCESS_ID);
  const live = aboutData();
  assert.equal(live.length, 6, 'a live build has no fixture section');
  assert.ok(!live.flatMap((s) => s.lines).some((l) => /dataset is named/.test(l)), 'no dataset line when the server named none');
});

// P2 (device round 2): the sheet is plain language. No checksum, capability name, experiment id, field name or tie-break.
test('V3U10b "About this data" holds no developer text, even for a live dataset with a manifest version', async () => {
  const runtime = newRuntime(FULL);
  const snap = await createStudyOverview(runtime.client).open({ studyId: runtime.config.studyId });
  const v = overviewView(snap);
  const live = aboutData({ datasetName: 'LASC 2018 left-atrium segmentation (official Cardiac Atlas source)' });
  const text = live.flatMap((s) => s.lines).join('\n');
  assert.doesNotMatch(text, /sha256|manifest|version|ground_truth_evaluation|inference_review|reconstruction_3d|EXP-|case_id|ties|FP\+FN/i);
  assert.match(text, /named "LASC 2018 left-atrium segmentation/);
  // What the sheet no longer says is still in the view for the Details sheet.
  assert.match(v.study.datasetText, /version /);
  assert.match(v.outliers.rule, /case_id/);
});

test('V3U11 the technical lines SCR-01 leaves off its surface go to the Details sheet; the dataset name stands alone', async () => {
  const details = studyDetails({
    datasetText: 'LASC 2018 · version dataset-manifest-sha256:f64d461f (LASC2018)',
    summaryText: 'experiment summary: 4 experiment(s) available',
    capabilities: ['ground_truth_evaluation', 'review'],
    outlierRule: 'the rule',
    pairLines: ['25 % data: EXP-U-025, EXP-D-025 not available to compare'],
  });
  assert.deepEqual(details.map((d) => [d.title, [...d.lines]]), [
    ['Server details', [
      'Dataset: LASC 2018 · version dataset-manifest-sha256:f64d461f (LASC2018)',
      'experiment summary: 4 experiment(s) available',
      'Capabilities: ground_truth_evaluation, review',
    ]],
    ['Median Dice pairs', ['25 % data: EXP-U-025, EXP-D-025 not available to compare']],
    ['Lowest-Dice lists', ['the rule']],
  ]);
  assert.deepEqual(studyDetails(), [], 'no lines, no section');
  assert.deepEqual(runDetails(['EXP-U-025 · model unet']).map((d) => [d.title, [...d.lines]]), [['Run details', ['EXP-U-025 · model unet']]]);
  assert.deepEqual(runDetails([]), []);
  assert.equal(metricLabel('dice'), 'Dice');
  assert.equal(metricLabel('some_new_metric'), 'some_new_metric', 'a name the legend does not know is shown as sent');

  const runtime = newRuntime();
  const snap = await createStudyOverview(runtime.client).open({ studyId: runtime.config.studyId });
  const study = overviewView(snap).study;
  assert.equal(study.datasetName, 'fixture dataset');
  assert.match(study.datasetText, /DATASET_FIXTURE/, 'the version and id stay in datasetText, for the sheet');
  assert.doesNotMatch(study.datasetName, /DATASET_FIXTURE|version/);
});

test('V3U12 SCR-07 rows: one value per experiment, status only when not normal, numbers per comparison, names not ids', async () => {
  assert.equal(experimentLabel('EXP-U-025'), 'UNet 25 %');
  assert.equal(experimentLabel('EXP-D-PP'), 'DINOv2 100 % post-processed');
  assert.equal(experimentLabel('EXP_DEMO'), 'EXP_DEMO', 'an id the matrix does not know is shown as sent');
  assert.equal(plainText('EXP-U-025, EXP-D-025 not available to compare'), 'UNet 25 %, DINOv2 25 % not available to compare');

  const runtime = newRuntime();
  const client = createClient(runtime.contract, v3Transport(contractJson, runtime.bundle, { dice: SIX_RUNS }));
  const model = createExperimentComparison(client);
  await model.open({});
  const snap = model.selectMetric('dice');
  const v = comparisonView(snap, { stat: 'median', selectedCellId: null });
  const cell = (id) => v.rows.flatMap((r) => r.cells).find((c) => c.id === id);
  assert.deepEqual([cell('EXP-U-025').valueText, cell('EXP-U-025').bar, cell('EXP-U-025').casesText, cell('EXP-U-025').statusWord],
    ['0.655', 0.655, '5 of 5 cases', null], 'a loaded run: the median, its bar, its case count, and no status word');
  assert.match(cell('EXP-D-PP').statusWord, /^Not listed by the server$/, 'a run that is not simply loaded says so in words');
  assert.equal(cell('EXP-D-PP').valueText, null, 'and has no number');
  assert.equal(v.explicit, false);
  const first = v.comparisons.find((c) => c.id === 'RQ-A-025');
  assert.equal(first.rowLabel, 'UNet vs DINOv2 · 25 %');
  assert.equal(first.deltaValueText, '+0.030', 'the median difference is the value of the row');
  assert.equal(v.comparisons.find((c) => c.kind === 'TREND' && c.family === 'UNET').rowLabel, 'UNet 25 → 50 → 100 %');
  assert.equal(v.trend[0].rowLabel, 'UNet 25 → 50 → 100 %');

  const fresh = createExperimentComparison(client);
  const none = comparisonView(await fresh.open({}), { stat: 'median' });
  assert.equal(none.comparisons.find((c) => c.id === 'RQ-A-025').deltaValueText, null, 'no metric picked: no number');
  assert.ok(v.plotNotes.every((n) => !/EXP-/.test(n)), 'the plot notes name runs, not ids');

  const pair = await typedComparison({ dice: SIX_RUNS });
  assert.equal(comparisonView(pair.selectMetric('dice'), { stat: 'median' }).explicit, true, 'opened with explicit ids');
  const strip = pair.stripColumns();
  const hit = pointDetail({ caseId: 'CASE_0003', value: 0.61, column: 'EXP-U-025', outlier: true, intent: null }, 'dice');
  assert.equal(strip.length > 0, true);
  assert.equal(hit.title, 'CASE_0003 · 0.610');
  assert.equal(hit.caption, `Dice · UNet 25 % · one of the ${OUTLIER_LABEL}`);
  assert.match(hit.text, /\(server\)$/, 'the full sentence stays for the record');
});

test('V3U13 SCR-01 lists the lowest-Dice cases of one experiment: DINOv2 at the largest fraction unless one is picked', async () => {
  const runtime = newRuntime();
  const client = createClient(runtime.contract, v3Transport(contractJson, runtime.bundle, { dice: SIX_RUNS }));
  const groups = overviewView(await createStudyOverview(client).open({ studyId: runtime.config.studyId })).outliers.groups;
  assert.equal(groups.length, 6);
  assert.equal(chooseOutlierGroup(groups).experimentId, 'EXP-D-100', 'DINOv2 at the largest data fraction');
  assert.equal(chooseOutlierGroup(groups, 'EXP-U-025').experimentId, 'EXP-U-025', 'a picked experiment wins');
  assert.equal(chooseOutlierGroup(groups, 'EXP-NONE').experimentId, 'EXP-D-100', 'a pick that is not listed falls back');
  const unetOnly = groups.filter((g) => g.family === 'UNET');
  assert.equal(chooseOutlierGroup(unetOnly).experimentId, 'EXP-U-025', 'no DINOv2 list: the first experiment with values');
  const empty = groups.map((g) => ({ ...g, view: { ...g.view, available: false, rows: [] } }));
  assert.equal(chooseOutlierGroup(empty).experimentId, groups[0].experimentId, 'no list at all: the first group says why');
  assert.equal(chooseOutlierGroup([]), null);
  assert.deepEqual(groups.find((g) => g.experimentId === 'EXP-D-100').view.rows.map((r) => r.scoreText), ['0.660', '0.720', '0.840'].sort(), 'the three lowest of the run');
});

// The "Cannot open:" line of both screens goes through blockedText, so a reason never shows an experiment id, a rule id,
// a pointer into the spec or a field name. The models keep their exact sentences for the Details sheets.
test('V3U16 a link that cannot open says why in words: no experiment id, rule id, spec pointer or field name', async () => {
  assert.equal(blockedText('EXP-U-025, EXP-D-025 not available to compare'), 'UNet 25 %, DINOv2 25 % not available to compare');
  assert.equal(blockedText('ARTIFACT_NOT_FOUND'), 'the server has no such artifact', 'a bare code becomes words');
  assert.equal(blockedText('the server did not return analysis_run_id for this case'), 'the server did not return analysis run id for this case');
  assert.equal(blockedText('08 section 2 defines EXP-D-PP on PROCESSED; the metrics were served for RAW - refused, not relabelled (11 section 6)'),
    'the study plan defines DINOv2 100 % post-processed on PROCESSED; the metrics were served for RAW - refused, not relabelled');
  assert.equal(blockedText(`the selection follows ${OUTLIER_RULE.id}`), 'the selection follows the lowest-Dice rule');
  assert.equal(blockedText(null), null);
  assert.equal(blockedText(''), null);

  // Every reason a link of the two screens can give, from the models over the generated bundle (the default
  // scenarios, and the full matrix where every pair is asked for) and from a case link that lacks its run.
  const technical = /\bEXP-|\bDR-\d|\bINT-\d|\d section \d|[a-z]+_[a-z]+/;
  const reasons = new Set([routeForIntent(caseIntent({ caseId: 'CASE_0101', runId: null, variant: 'RAW', experimentId: 'EXP-U-100' })).reason]);
  for (const scenarios of [{}, FULL]) {
    const runtime = newRuntime(scenarios);
    const overview = overviewView(await createStudyOverview(runtime.client).open({ studyId: runtime.config.studyId }));
    for (const h of overview.headline) if (!h.route.ok) reasons.add(h.route.reason);
    for (const g of overview.outliers.groups) for (const r of g.view.rows) if (!r.route.ok) reasons.add(r.route.reason);
    const model = createExperimentComparison(runtime.client);
    await model.open({ experimentIds: ['EXP-U-100', 'EXP-D-100', 'EXP-D-PP'] });
    const snap = model.selectMetric('dice');
    for (const c of comparisonView(snap, { stat: 'median' }).comparisons) if (!c.route.ok) reasons.add(c.route.reason);
    for (const cell of snap.cells) for (const r of caseTable(cell).rows) if (!r.route.ok) reasons.add(r.route.reason);
  }
  assert.ok(reasons.size >= 4, `reasons found: ${[...reasons].join(' | ')}`);
  assert.ok([...reasons].some((r) => technical.test(r)), 'the models do use ids and field names, so this check has something to clean');
  for (const reason of reasons) {
    const words = blockedText(reason);
    assert.ok(words && !technical.test(words), `not plain: "${words}" (from "${reason}")`);
  }
});

// Raw vs post-processed: the server's verdict stands but the app has no summary to subtract, so the row used to show its
// title alone. A fair row without a number says "Not shown" and why; a row that is not fair still says "Not compared".
test('V3U17 a comparison judged fair whose numbers are withheld says why on its row, not only its title', async () => {
  const model = createExperimentComparison(newRuntime().client);
  await model.open({ experimentIds: ['EXP-U-100', 'EXP-D-100', 'EXP-D-PP'] });
  const row = (view, id) => view.comparisons.find((c) => c.id === id);
  const view = comparisonView(model.selectMetric('dice'), { stat: 'median' });
  const ablation = row(view, 'RQ-B');
  assert.equal(ablation.fair, true, "the server's verdict on raw vs post-processed stands");
  assert.equal(ablation.deltaValueText, null, 'and the app has no number for it');
  assert.equal(ablation.mutedText, 'Not shown');
  assert.equal(ablation.whyText, 'Raw and post-processed runs are not summarised together yet, so no difference is shown');
  assert.doesNotMatch(ablation.whyText, /EXP-|contract|HEAD_TO_HEAD/, 'the row names no id and no contract');
  assert.equal(ablation.rowLabel, 'DINOv2 100 % · raw vs post-processed');
  assert.deepEqual([row(view, 'RQ-A-100').mutedText, row(view, 'RQ-A-100').whyText], ['Not compared', null],
    'a pair that is not judged comparable keeps its word and has no note');
  // Numbers that are withheld are withheld whichever metric is picked, or none.
  const none = comparisonView(model.selectMetric(null), { stat: 'median' });
  assert.equal(row(none, 'RQ-B').mutedText, 'Not shown');

  // A comparable pair with numbers shows the number and neither word nor note.
  const pair = comparisonView((await typedComparison({ dice: SIX_RUNS })).selectMetric('dice'), { stat: 'median' });
  assert.deepEqual([row(pair, 'RQ-A-025').deltaValueText, row(pair, 'RQ-A-025').mutedText, row(pair, 'RQ-A-025').whyText], ['+0.030', null, null]);
  const refused = comparisonView((await typedComparison({ dice: SIX_RUNS, compare: 'not_comparable' })).selectMetric('dice'), { stat: 'median' });
  assert.deepEqual([row(refused, 'RQ-A-025').mutedText, row(refused, 'RQ-A-025').whyText], ['Not compared', null]);
});

test('V3U6 only paired.mjs orders values, and the server\'s lowest-Dice order is kept on the same screen', async () => {
  const sorting = readdirSync(V3_DIR).filter((f) => /\.m?js$/.test(f)).filter((f) => {
    const code = readFileSync(join(V3_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return code.includes('.sort(') || code.includes('.toSorted(');
  });
  assert.deepEqual(sorting, ['paired.mjs']);
  const model = await typedComparison();
  const snap = model.selectMetric('dice');
  pairedCards(snap);
  const u = snap.cells.find((c) => c.id === 'EXP-U-025');
  assert.deepEqual(u.outliers.cases.map((c) => c.caseId), ['CASE_0005', 'CASE_0003', 'CASE_0004'], 'as the server ranked them');
});

// Default metric (device round 2): SCR-07 opened with no metric chosen and every row looked empty. A screen may pass
// defaultMetric; the model applies it only when the server's summaries name that metric, and never picks one by itself.
test('V3U14 SCR-07 opens on the screen\'s default metric when the server names it; the model picks none by itself', async () => {
  const runtime = newRuntime();
  const client = createClient(runtime.contract, v3Transport(contractJson, runtime.bundle, {}));
  const ids = ['EXP-U-025', 'EXP-D-025'];

  const model = createExperimentComparison(client);
  assert.equal((await model.open({ experimentIds: ids })).metricName, null, 'no defaultMetric: nothing is chosen');
  const dice = await model.open({ experimentIds: ids, defaultMetric: 'dice' });
  assert.equal(dice.metricName, 'dice');
  assert.deepEqual([...dice.metricNames], ['dice', 'iou', 'false_positives', 'false_negatives', 'relative_volume_error']);
  const unet = dice.cells.find((c) => c.id === 'EXP-U-025');
  assert.equal(unet.points.length, 4, 'the per-case Dice of the run is plotted from the first render');
  assert.equal(unet.pointsWithheld, null);
  const view = comparisonView(dice, { stat: 'median' });
  assert.equal(view.metric.selected, 'dice');
  assert.equal(view.rows.flatMap((r) => r.cells).find((c) => c.id === 'EXP-U-025').valueText, '0.655', 'and the row has its median');

  assert.equal((await model.open({ experimentIds: ids, defaultMetric: 'not_a_metric' })).metricName, null, 'a metric the server does not name is not chosen');
  assert.equal((await model.open({ experimentIds: ids, metricName: 'iou', defaultMetric: 'dice' })).metricName, 'iou', 'an explicit metric wins');

  await model.open({ experimentIds: ids, defaultMetric: 'dice' });
  assert.equal(model.selectMetric('iou').metricName, 'iou', 'the user can pick another');
  assert.equal((await model.refresh()).metricName, 'dice', 'a refresh opens the same way again');
});

// Touch targets (device round 2): a chart dot is 5 dp across, but a tap within 24 dp of it must pick it, so the hit
// area is at least 48 dp across. The nearest dot still wins, so crowded dots stay separable.
test('V3U15 a chart dot has a hit area of at least 48 dp, in the strip plot and in the paired chart', () => {
  const strip = { columns: [{ points: [{ x: 100, y: 100, r: 5, id: 'a' }, { x: 112, y: 100, r: 5, id: 'b' }] }] };
  const pairs = { points: [{ x: 100, y: 100, r: 5, id: 'a' }, { x: 112, y: 100, r: 5, id: 'b' }] };
  for (const [name, at, layout] of [['strip', pointAt, strip], ['paired', pairAt, pairs]]) {
    assert.equal(at(layout, 100, 100 - 23).id, 'a', `${name}: 23 dp above a dot still picks it`);
    assert.equal(at(layout, 100 - 23, 100).id, 'a', `${name}: 23 dp to its left still picks it`);
    assert.equal(at(layout, 100 - 25, 100), null, `${name}: 25 dp away is empty space`);
    assert.equal(at(layout, 109, 100).id, 'b', `${name}: between two dots the nearer one wins`);
  }
});
