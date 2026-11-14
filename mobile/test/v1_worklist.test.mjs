// node --test mobile/test/  - V1 SCR-02 as a worklist: per-case Dice chips of one experiment, "worst first", and
// "no GT" never shown as 0 (src/screens/v1-cases/cases.mjs). Fed with the generated fixture's experiment_cases.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  forgetWorklist, pinnedOutlierSelection, readCaseRows, readExperimentCases, readExperimentChoices, rememberedWorklist,
  rememberWorklist, WORKLIST_SORT, worklistChip, worklistRows,
} from '../src/screens/v1-cases/cases.mjs';
import { generatedBundleJson, loadContract } from './_helpers.mjs';

const contract = loadContract();
const bundle = generatedBundleJson();
const scenario = (endpoint, name) => bundle.scenarios[endpoint][name].response.data;
const pinned = pinnedOutlierSelection(contract);

// The study's case list for the fixture's experiment rows: CASE_0001 has no ground truth (INFERENCE_REVIEW).
const caseRows = readCaseRows({
  next_page: null,
  items: ['CASE_0001', 'CASE_0002', 'CASE_0003', 'CASE_0004', 'CASE_0005', 'CASE_0006', 'CASE_0007'].map((id) => ({
    case_id: id, mode_capability: id === 'CASE_0001' ? 'INFERENCE_REVIEW' : 'EVALUATION', ground_truth_available: id !== 'CASE_0001',
  })),
}).rows;
// with_failure has no outlier block of its own; the default scenario's pick is for the same rows.
const withFailure = { ...scenario('experiment_cases', 'with_failure'), outlier_selection: scenario('experiment_cases', 'default').outlier_selection };

test('VW1 the experiments to pick come from experiment_list, each with its variant', () => {
  const choices = readExperimentChoices(scenario('experiment_list', 'default'));
  assert.deepEqual(choices.map((c) => `${c.experimentId}:${c.variant}`), ['EXP_DEMO:RAW', 'EXP-D-PP:PROCESSED']);
  assert.deepEqual([...readExperimentChoices({ items: [{ experiment_id: '' }, null, { experiment_id: 'X' }] })].map((c) => c.variant), [null]);
  assert.deepEqual({ ...pinned }, { ruleId: 'DR-010', selectionVersion: 'dr010-outlier/v1' });
});

test('VW2 chips: Dice from the server, "no GT", "run failed", "not in" - a missing value is never 0', () => {
  const cases = readExperimentCases(withFailure, { experimentId: 'EXP_DEMO', variant: 'RAW', pinned });
  assert.equal(cases.ok, true);
  const rows = worklistRows(caseRows, cases, { experimentId: 'EXP_DEMO' });
  const chip = Object.fromEntries(rows.map((r) => [r.caseId, r.chip.text]));
  assert.deepEqual(chip, {
    CASE_0001: 'no GT', CASE_0002: 'Dice 0.900', CASE_0003: 'Dice 0.600', CASE_0004: 'Dice 0.600',
    CASE_0005: 'Dice 0.400', CASE_0006: 'run failed', CASE_0007: 'not in EXP_DEMO',
  });
  assert.ok(rows.every((r) => !/\b0(\.0+)?$/.test(r.chip.text)), 'no chip reads 0');
  assert.deepEqual(rows.map((r) => r.runId), ['RUN_0001', 'RUN_0002', 'RUN_0003', 'RUN_0004', 'RUN_0005', 'RUN_0006', null],
    'each row opens the experiment\'s run (a WITHHELD row still has its prediction to look at)');
  // An INFERENCE_REVIEW case is "no GT" even if a server row carried a value for it.
  const odd = { caseId: 'X', capability: caseRows[0].capability };
  assert.equal(worklistChip(odd, { status: 'SUCCEEDED', dice: 0.8 }, 'E').text, 'no GT');
  assert.equal(worklistChip(caseRows[1], { status: 'SUCCEEDED', dice: null }, 'E').text, 'Dice not stated');
  assert.equal(worklistChip(caseRows[1], { status: 'EXCLUDED' }, 'E').text, 'excluded');
  assert.equal(worklistChip(caseRows[1], { status: 'SOMETHING' }, 'E').text, 'status SOMETHING');
});

test('VW3 worst first: lowest Dice first, ties by FP + FN then case id - the top three equal the server\'s outlier pick', () => {
  const cases = readExperimentCases(withFailure, { experimentId: 'EXP_DEMO', variant: 'RAW', pinned });
  const rows = worklistRows(caseRows, cases, { experimentId: 'EXP_DEMO', sort: WORKLIST_SORT.WORST_FIRST });
  assert.deepEqual(rows.map((r) => r.caseId), ['CASE_0005', 'CASE_0003', 'CASE_0004', 'CASE_0002', 'CASE_0001', 'CASE_0006', 'CASE_0007'],
    'Dice 0.4, then the two 0.6 with more FP + FN first (120 before 40), then 0.9; no-value rows after, in server order');
  const server = withFailure.outlier_selection.cases.map((c) => c.case_id);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.caseId), server);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.outlierRank), [1, 2, 3], 'the server\'s own ranks are marked');
  assert.deepEqual(worklistRows(caseRows, cases, { experimentId: 'EXP_DEMO' }).map((r) => r.caseId), caseRows.map((r) => r.caseId),
    'server order keeps the list as served');
  assert.deepEqual(worklistRows(caseRows, null, { sort: WORKLIST_SORT.WORST_FIRST }).map((r) => r.caseId), caseRows.map((r) => r.caseId),
    'without per-case results nothing is sorted');
});

test('VW4 values for another variant than the experiment states are not shown', () => {
  const cases = readExperimentCases(scenario('experiment_cases', 'default'), { experimentId: 'EXP-D-PP', variant: 'PROCESSED', pinned });
  assert.equal(cases.ok, false);
  assert.match(cases.problem, /^Asked for EXP-D-PP \(PROCESSED\); the server answered with RAW values, so no Dice is shown\.$/);
  const rows = worklistRows(caseRows, cases, { experimentId: 'EXP-D-PP', sort: WORKLIST_SORT.WORST_FIRST });
  assert.ok(rows.every((r) => r.chip === null && r.outlierRank === null));
});

test('VW5 the outlier pick is marked only under the pinned rule and version, for this experiment and variant', () => {
  const base = scenario('experiment_cases', 'default');
  const marked = (data, experimentId = 'EXP_DEMO') => readExperimentCases(data, { experimentId, variant: 'RAW', pinned });
  assert.equal(marked(base).outliers.get('CASE_0005'), 1);
  for (const patch of [{ rule_id: 'DR-999' }, { selection_version: 'dr010-outlier/v2' }, { experiment_id: 'EXP_OTHER' }, { prediction_variant: 'PROCESSED' }]) {
    const c = marked({ ...base, outlier_selection: { ...base.outlier_selection, ...patch } });
    assert.equal(c.outliers.size, 0, JSON.stringify(patch));
    assert.match(c.outlierNote, /not marked/);
  }
  assert.equal(marked({ ...base, outlier_selection: undefined }).outlierNote, null, 'no block: nothing to say');
  assert.equal(readExperimentCases(null, { experimentId: 'E' }).ok, false);
});

test('VW6 the chosen experiment and order are kept for the session', () => {
  forgetWorklist();
  assert.deepEqual({ ...rememberedWorklist() }, { experimentId: null, sort: WORKLIST_SORT.SERVER });
  rememberWorklist({ experimentId: 'EXP_DEMO' });
  rememberWorklist({ sort: WORKLIST_SORT.WORST_FIRST });
  assert.deepEqual({ ...rememberedWorklist() }, { experimentId: 'EXP_DEMO', sort: WORKLIST_SORT.WORST_FIRST });
  forgetWorklist();
});
