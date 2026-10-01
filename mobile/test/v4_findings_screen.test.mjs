// node --test mobile/test/  - SCR-08 Findings controller (src/verticals/v4/findingsController.mjs)
//
// Fixture runtime over the GENERATED bundle; scenarios are switched with the
// runtime's own override API, never a hand-written body.
import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE } from '../../app/core/index.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { validateRoute } from '../src/nav/navigator.mjs';
import { createFindingsScreen, contextFrom, routeFor, reviewRouteFor } from '../src/verticals/v4/findingsController.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';

const contractJson = readContractJson();
const ROW = generatedBundleJson().scenarios.findings_list.default.response.data.items[0];

function fixtureRuntime() {
  return createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: generatedBundleJson() });
}

test('FS1 the tab lists findings with their evidence, and each opens exactly there (TC-FIND-001)', async () => {
  const ctl = createFindingsScreen({ runtime: fixtureRuntime(), params: {} });
  const s = await ctl.load();
  assert.equal(s.view.state, STATE.SUCCESS);
  assert.equal(s.form, null, 'opened bare, SCR-08 is a list: a finding is created from a case/slice context');
  assert.equal(s.items.length, 1);
  const id = s.items[0].finding.findingId;
  const route = ctl.routeTo(id);
  assert.deepEqual({ ...route, params: { ...route.params } }, {
    screenId: 'SCR-03',
    params: {
      caseId: ROW.evidence.case_id, sliceIndex: ROW.evidence.slice_index, runId: ROW.evidence.analysis_run_id,
      variant: ROW.evidence.prediction_variant, experimentId: ROW.evidence.experiment_id,
    },
  });
  validateRoute(route.screenId, route.params); // the navigator accepts it
  const review = ctl.reviewRouteTo(id);
  assert.equal(review.screenId, 'SCR-06');
  assert.equal(review.params.runId, ROW.evidence.analysis_run_id);
  assert.equal(review.params.variant, ROW.evidence.prediction_variant, 'the recorded variant goes along (contract 1.1.0), so SCR-06 opens without asking');
  validateRoute(review.screenId, review.params);
});

test('FS2 an empty list is an empty list, not drift (contract v1.0 row_fields, generated `empty`)', async () => {
  const runtime = fixtureRuntime();
  runtime.fixtureScenarios.set('findings_list', 'empty');
  const s = await createFindingsScreen({ runtime, params: {} }).load();
  assert.equal(s.view.state, STATE.SUCCESS);
  assert.deepEqual([...s.items], []);
});

test('FS3 create from a case/slice context: the form, its validation, and the finding opening back there', async () => {
  const params = { caseId: 'CASE_0043', sliceIndex: 44, runId: 'RUN_0043', variant: 'RAW', experimentId: 'EXP_DEMO' };
  const ctl = createFindingsScreen({ runtime: fixtureRuntime(), params });
  await ctl.load();
  let s = ctl.getState();
  assert.deepEqual({ ...s.context }, { ...params, region: null });
  assert.equal(s.canSubmit, false, 'a type is required first');
  ctl.setType('NOT_A_TYPE');
  assert.equal(ctl.getState().form.type, null, 'an unknown type is not accepted by the form');
  ctl.setType('UNDER_SEGMENTATION');
  ctl.setNote('Prediction misses the inferior wall here.');
  s = await ctl.submit();
  assert.equal(s.notice.kind, 'created', JSON.stringify(s.notice));
  assert.equal(s.items.length, 2);
  const created = s.items[0].finding;
  assert.equal(created.caseId, 'CASE_0043');
  assert.equal(created.sliceIndex, 44);
  assert.equal(created.type, 'UNDER_SEGMENTATION');
  assert.equal(created.revision, 1);
  assert.equal(created.variant, 'RAW', 'the variant SCR-06 passed is recorded with the run');
  const route = ctl.routeTo(created.findingId);
  assert.equal(route.screenId, 'SCR-03');
  assert.equal(route.params.caseId, 'CASE_0043');
  assert.equal(route.params.sliceIndex, 44);
  assert.equal(s.form.type, null, 'the form is cleared for the next finding');
});

test('FS4 a server refusal is a state, and the list survives it', async () => {
  const runtime = fixtureRuntime();
  const ctl = createFindingsScreen({ runtime, params: { caseId: 'CASE_0043', sliceIndex: 44 } });
  await ctl.load();
  runtime.fixtureScenarios.set('finding_create', 'error_case');
  ctl.setType('OTHER');
  const s = await ctl.submit();
  assert.ok(s.actionView && s.actionView.state !== STATE.SUCCESS, 'the failed create is its own state');
  assert.equal(s.view.state, STATE.SUCCESS, 'the list it failed over is still valid and still shown');
  assert.equal(s.items.length, 1);
});

test('FS5 routes are built only from what a finding holds', () => {
  assert.equal(contextFrom({ caseId: 'CASE_1' }), null, 'no slice, no create context');
  assert.equal(contextFrom({ caseId: '', sliceIndex: 3 }), null);
  assert.equal(routeFor({ available: false }), null);
  const exp = routeFor({ available: true, screen: 'SCR-07', experimentId: 'EXP-D-100' });
  assert.deepEqual({ ...exp, params: { ...exp.params } }, { screenId: 'SCR-07', params: { experimentId: 'EXP-D-100' } });
  const noRun = { available: true, screen: 'SCR-03', caseId: 'CASE_1', sliceIndex: 2, runId: null, experimentId: null, region: null };
  assert.deepEqual({ ...routeFor(noRun).params }, { caseId: 'CASE_1', sliceIndex: 2 });
  assert.equal(reviewRouteFor(noRun), null, 'no run, no review: SCR-06 is scoped to a run');
});

test('FS6 Resolve / Reopen goes through finding_patch with the finding\'s revision', async () => {
  const ctl = createFindingsScreen({ runtime: fixtureRuntime(), params: {} });
  await ctl.load();
  const id = ctl.getState().items[0].finding.findingId;
  let s = await ctl.setStatus(id, 'RESOLVED');
  assert.equal(s.notice.kind, 'status', JSON.stringify(s.notice));
  assert.equal(s.items[0].finding.status, 'RESOLVED');
  assert.equal(s.view.state, STATE.SUCCESS, 'the list stays');
  s = await ctl.setStatus(id, 'CLOSED');
  assert.equal(s.notice.kind, 'refused', 'only OPEN / RESOLVED');
});

test('FS7 a route with a run but no variant makes the form ask for it before creating', async () => {
  const ctl = createFindingsScreen({ runtime: fixtureRuntime(), params: { caseId: 'CASE_0043', sliceIndex: 44, runId: 'RUN_0043' } });
  await ctl.load();
  ctl.setType('OTHER');
  let s = ctl.getState();
  assert.equal(s.needsVariant, true);
  assert.equal(s.canSubmit, false, 'no variant yet');
  ctl.setVariant('PROCESSED');
  s = ctl.getState();
  assert.equal(s.canSubmit, true);
  s = await ctl.submit();
  assert.equal(s.notice.kind, 'created', JSON.stringify(s.notice));
  assert.equal(s.items[0].finding.variant, 'PROCESSED');
});
