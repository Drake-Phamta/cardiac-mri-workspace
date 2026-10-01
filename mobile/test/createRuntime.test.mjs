// node --test mobile/test/  - runtime assembly, fixture and live (src/runtime/createRuntime.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE, listScenarios } from '../../app/core/index.mjs';
import { MODE, resolveConfig } from '../src/config.mjs';
import { RuntimeError, createRuntime } from '../src/runtime/createRuntime.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';

const contractJson = readContractJson();

test('R1 fixture mode builds a client over the GENERATED bundle and answers through app/core', async () => {
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: generatedBundleJson() });
  assert.equal(runtime.mode, MODE.FIXTURE);
  assert.equal(runtime.client.transportKind, 'fixture');
  const view = await runtime.client.call('case_get', { case_id: 'CASE_0043' });
  // Whatever the generator currently produces, the answer is a valid app/core
  // state: SUCCESS once it emits scenarios, EMPTY_UNAVAILABLE
  // (FIXTURE_SCENARIO_MISSING) before then. Never a raw response.
  assert.ok([STATE.SUCCESS, STATE.EMPTY_UNAVAILABLE].includes(view.state), view.state);
  if (view.state === STATE.EMPTY_UNAVAILABLE) assert.equal(view.reason, 'FIXTURE_SCENARIO_MISSING');
});

test('R2 fixture mode without a bundle refuses to start rather than guessing', () => {
  assert.throws(
    () => createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: null }),
    (e) => e instanceof RuntimeError && e.code === 'NO_FIXTURE_BUNDLE',
  );
});

test('R3 a drifted contract is refused by app/core before any screen exists', () => {
  const drifted = { ...contractJson, contract_version: 'SOMETHING ELSE' };
  assert.throws(() => createRuntime({ config: resolveConfig({ mode: 'live' }), contractJson: drifted }), /CONTRACT_INVALID/);
});

test('R4 a bundle generated from another contract revision is refused', () => {
  const bundle = { ...generatedBundleJson(), contract_version: 'DRAFT v-1' };
  assert.throws(
    () => createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: bundle }),
    /BUNDLE_INVALID/,
  );
});

test('R5 live mode sends to the configured backend and has no fixture panel', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: { code: 'UNAUTHORIZED' } }) };
  };
  const runtime = createRuntime({
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }), contractJson, fetchImpl,
  });
  assert.equal(runtime.mode, MODE.LIVE);
  assert.equal(runtime.fixtureScenarios, null);
  assert.equal(runtime.bundle, null);
  const view = await runtime.client.call('study_get', { study_id: 'STUDY_DEMO' });
  assert.deepEqual(urls, ['http://backend.invalid:8000/api/v1/studies/STUDY_DEMO']);
  assert.equal(view.state, STATE.RECOVERABLE_ERROR);
  assert.equal(view.reason, 'UNAUTHORIZED');
});

test('R6 live mode never falls back to fixtures when the backend is down', async () => {
  const fetchImpl = async () => { throw new TypeError('Network request failed'); };
  const runtime = createRuntime({
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }),
    contractJson,
    bundleJson: generatedBundleJson(),
    fetchImpl,
  });
  const view = await runtime.client.call('case_get', { case_id: 'CASE_0043' });
  assert.equal(view.state, STATE.RECOVERABLE_ERROR);
  assert.equal(view.reason, 'TRANSPORT_UNREACHABLE');
});

test('R7 fixture scenario overrides apply only to unnamed requests, and only with real scenario names', async () => {
  const bundleJson = generatedBundleJson();
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson });
  const o = runtime.fixtureScenarios;
  assert.throws(() => o.set('case_get', 'invented_by_hand'), (e) => e.code === 'UNKNOWN_SCENARIO');
  assert.equal(o.pick('case_get', undefined), 'default');

  const names = listScenarios(runtime.bundle, 'analysis_run_get');
  if (names.includes('run_running')) {
    let notified = 0;
    const off = o.subscribe(() => { notified += 1; });
    o.set('analysis_run_get', 'run_running');
    assert.equal(o.pick('analysis_run_get', 'default'), 'run_running');
    assert.equal(o.pick('analysis_run_get', 'run_failed'), 'run_failed', 'an explicit name wins');
    const view = await runtime.client.call('analysis_run_get', { run_id: 'RUN_0043' });
    assert.equal(view.state, STATE.SUCCESS);
    assert.equal(view.data.status, 'RUNNING');
    o.clear();
    assert.equal(o.get('analysis_run_get'), 'default');
    off();
    assert.equal(notified, 2);
  } else {
    // The generator on this branch emits no scenarios yet (before PR #50).
    assert.deepEqual(o.endpoints(), []);
  }
});

test('R8 createRuntime needs a resolved config', () => {
  assert.throws(() => createRuntime({ contractJson }), (e) => e.code === 'NO_CONFIG');
});

test('R9 live mode with no backend URL is a configuration error, and nothing is requested', () => {
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return null; };
  assert.throws(
    () => createRuntime({ config: resolveConfig({ mode: 'live' }), contractJson, fetchImpl }),
    (e) => e instanceof RuntimeError && e.code === 'CONFIG_LIVE_URL_MISSING' && /EXPO_PUBLIC_API_BASE_URL/.test(e.message),
  );
  assert.equal(requests, 0);
});
