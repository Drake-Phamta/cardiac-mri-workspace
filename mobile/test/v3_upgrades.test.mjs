// node --test mobile/test/  - V3 upgrades on SCR-01 and SCR-07: plain wording, paired differences, trend chart,
// overview tiles, metric legend and "About this data".
//
// Fixture-mode checks run the models over the GENERATED bundle (with its full_matrix and comparable scenarios);
// the paired and trend checks also use typed experiment_cases rows that differ per run, because the fixture serves
// the same rows for every experiment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createExperimentComparison, createStudyOverview } from '../src/screens/v3-study/models.mjs';
import { OUTLIER_RULE } from '../src/screens/v3-study/readers.mjs';
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
