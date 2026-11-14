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
import { OUTLIER_RULE, readCaseCounts } from '../src/screens/v3-study/readers.mjs';
import { casesTile, diceTile, findingsTile } from '../src/screens/v3-study/tiles.mjs';
import {
  comparisonView, FAMILY_STYLE, OUTLIER_LABEL, overviewView, trianglePath,
} from '../src/screens/v3-study/view.mjs';
import { color, contrastRatio, family } from '../src/components/tokens.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import { MOBILE_ROOT, generatedBundleJson, readContractJson } from './_helpers.mjs';

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
  assert.deepEqual({ ...FAMILY_STYLE.UNET }, { ...family[0] });
  assert.deepEqual({ ...FAMILY_STYLE.DINOV2 }, { ...family[1] });
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
  assert.equal(none.emptyText, 'No UNet vs DINOv2 pair is judged comparable by the server yet.');
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
  const refused = diceTile((await typed({ dice: SIX_RUNS, compare: 'not_comparable' })).headline);
  assert.ok(refused.rows.every((r) => r.chip === 'Not comparable' && r.unetText === null
    && r.note === 'The experiments do not share a fair evaluation contract.'), JSON.stringify(refused.rows.map((r) => r.note)));

  // The outlier rows carry a bar as long as their Dice, in the server's order.
  const group = overviewView(fair).outliers.groups.find((g) => g.experimentId === 'EXP-U-025');
  assert.equal(group.family, 'UNET');
  assert.deepEqual(group.view.rows.map((r) => [r.caseId, r.bar]), [['CASE_0005', 0.4], ['CASE_0003', 0.61], ['CASE_0004', 0.7]]);

  const failed = await createStudyOverview(newRuntime({ findings_list: 'error_case' }).client).open({ studyId: plain.config.studyId });
  assert.deepEqual({ ...findingsTile(failed.findings) }, { open: null, resolved: null }, 'a failed list is not "0 open"');
  assert.deepEqual({ ...casesTile(null), lines: [] }, { value: null, text: 'case counts unavailable', lines: [] });
  const noTotal = casesTile(readCaseCounts({ EVALUATION: 3 }));
  assert.deepEqual([noTotal.value, noTotal.text, [...noTotal.lines]], [null, 'total unavailable', ['3 evaluation']]);
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
