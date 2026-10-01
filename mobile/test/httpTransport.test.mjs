// node --test mobile/test/  - the live transport plugged into app/core (src/runtime/httpTransport.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { createClient, STATE, RECOVERY } from '../../app/core/index.mjs';
import { TransportError, createHttpTransport, joinUrl } from '../src/runtime/httpTransport.mjs';
import { loadContract } from './_helpers.mjs';

const BASE = 'http://backend.invalid:8000';

// A fetch stand-in: records every request, answers from a table.
function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  fn.calls = calls;
  return fn;
}

function json(status, body, headers = {}) {
  const h = new Map(Object.entries({ 'content-type': 'application/json', ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    json: async () => body,
  };
}

const contract = loadContract();

function caseGetData() {
  return {
    case_id: 'CASE_0043', mode: 'EVALUATION', ground_truth_available: true, available_run_ids: ['RUN_1'],
    geometry_contract_version: contract.geometryContractVersion, geometry_validation_status: 'VALIDATED',
    shape: [576, 576, 88], index_convention: 'x=column,y=row,z=slice', spacing: [1.25, 1.25, 2.5],
    origin: [0, 0, 0], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}

test('T1 the URL is base + the contract-resolved path; nothing is concatenated twice', async () => {
  assert.equal(joinUrl(BASE, '/api/v1/cases/C'), `${BASE}/api/v1/cases/C`);
  assert.equal(joinUrl(`${BASE}/`, '/api/v1/cases/C'), `${BASE}/api/v1/cases/C`);
  assert.throws(() => joinUrl(BASE, 'api/v1/cases'), TransportError);

  const fetchImpl = fakeFetch(() => json(200, caseGetData()));
  const client = createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }));
  const view = await client.call('case_get', { case_id: 'CASE_0043' });
  assert.equal(view.state, STATE.SUCCESS);
  assert.equal(fetchImpl.calls[0].url, `${BASE}/api/v1/cases/CASE_0043`);
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.calls[0].init.headers.Accept, 'application/json');
  assert.equal(view.data.case_id, 'CASE_0043');
});

test('T2 query parameters keep the contract name, not the token name (prediction_variant={variant})', async () => {
  const fetchImpl = fakeFetch(() => json(200, {
    slice_index: 44, metric_state: 'VALID', metric_value: 0.9, reference_mask_id: 'R', prediction_mask_id: 'P', metric_version: 'm1',
  }));
  const client = createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }));
  const view = await client.call('analysis_slice_metrics', { run_id: 'RUN_1', slice_index: 44, variant: 'PROCESSED' });
  assert.equal(view.state, STATE.SUCCESS);
  assert.equal(fetchImpl.calls[0].url, `${BASE}/api/v1/analysis-runs/RUN_1/slices/44/metrics?prediction_variant=PROCESSED`);
});

test('T3 a contract error envelope becomes the app/core state for that code', async () => {
  const fetchImpl = fakeFetch(() => json(404, {
    error: { code: 'GROUND_TRUTH_UNAVAILABLE', message: 'no GT', request_id: 'req_42', details: null },
  }));
  const client = createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }));
  const view = await client.call('ground_truth_slice_get', { case_id: 'C', slice_index: 1 });
  assert.equal(view.state, STATE.EMPTY_UNAVAILABLE);
  assert.equal(view.reason, 'GROUND_TRUTH_UNAVAILABLE');
  assert.equal(view.data, null);
});

test('T4 a network failure is TRANSPORT_UNREACHABLE with RETRY - never an empty screen', async () => {
  const fetchImpl = async () => { throw new TypeError('Network request failed'); };
  const client = createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }));
  const view = await client.call('case_get', { case_id: 'C' });
  assert.equal(view.state, STATE.RECOVERABLE_ERROR);
  assert.equal(view.reason, 'TRANSPORT_UNREACHABLE');
  assert.ok(view.actions.includes(RECOVERY.RETRY));
});

test('T5 a timeout aborts the request and is TRANSPORT_UNREACHABLE', async () => {
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  });
  const transport = createHttpTransport({ baseUrl: BASE, fetchImpl, timeoutMs: 30 });
  await assert.rejects(transport.send({ endpointId: 'case_get', method: 'GET', url: '/api/v1/cases/C' }), (e) => e.code === 'TIMEOUT');
  const view = await createClient(contract, transport).call('case_get', { case_id: 'C' });
  assert.equal(view.reason, 'TRANSPORT_UNREACHABLE');
});

test('T6 a 5xx with no contract code is retryable, not a contract drift', async () => {
  const fetchImpl = fakeFetch(() => json(500, { detail: 'Internal Server Error' }));
  const view = await createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl })).call('case_get', { case_id: 'C' });
  assert.equal(view.state, STATE.RECOVERABLE_ERROR);
  assert.ok(view.actions.includes(RECOVERY.RETRY));
});

test('T7 a 4xx with no contract code is CONTRACT_DRIFT and blocks the view', async () => {
  const fetchImpl = fakeFetch(() => json(404, { detail: 'Not Found' }));
  const view = await createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl })).call('case_get', { case_id: 'C' });
  assert.equal(view.state, STATE.FATAL_INVALID);
  assert.equal(view.reason, 'CONTRACT_DRIFT');
  assert.ok(!view.actions.includes(RECOVERY.RETRY));
});

test('T8 a 200 that misses a response field is CONTRACT_DRIFT naming the field', async () => {
  const data = caseGetData();
  delete data.ground_truth_available;
  const fetchImpl = fakeFetch(() => json(200, data));
  const view = await createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl })).call('case_get', { case_id: 'C' });
  assert.equal(view.state, STATE.FATAL_INVALID);
  assert.ok(view.error.detail.problems.some((p) => p.includes('ground_truth_available')));
});

test('T9 a non-JSON 200 (raw bytes) is not silently accepted', async () => {
  const fetchImpl = fakeFetch(() => ({ status: 200, headers: { get: () => 'image/png' }, json: async () => { throw new Error('binary'); } }));
  const view = await createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }))
    .call('mri_slice_get', { case_id: 'C', slice_index: 0 });
  assert.equal(view.state, STATE.FATAL_INVALID);
  assert.equal(view.reason, 'CONTRACT_DRIFT');
});

test('T10 a write sends JSON with expected_revision; a missing one never leaves the phone', async () => {
  const fetchImpl = fakeFetch(() => json(200, { review_id: 'R', status: 'IN_REVIEW', revision: 2, etag: 'W/"2"' }));
  const client = createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }));
  const ok = await client.call('review_patch', { review_id: 'R' }, { body: { status: 'IN_REVIEW', expected_revision: 1 } });
  assert.equal(ok.state, STATE.SUCCESS);
  assert.equal(fetchImpl.calls[0].init.method, 'PATCH');
  assert.equal(fetchImpl.calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { status: 'IN_REVIEW', expected_revision: 1 });

  const refused = await client.call('review_patch', { review_id: 'R' }, { body: { status: 'IN_REVIEW' } });
  assert.equal(refused.state, STATE.FATAL_INVALID);
  assert.equal(fetchImpl.calls.length, 1, 'the stale-unsafe write was never sent');
});

test('T11 STALE_REVISION from the server is STALE_MISMATCH with REFRESH and no RETRY', async () => {
  const fetchImpl = fakeFetch(() => json(409, { error: { code: 'STALE_REVISION', message: 'stale' } }));
  const view = await createClient(contract, createHttpTransport({ baseUrl: BASE, fetchImpl }))
    .call('review_patch', { review_id: 'R' }, { body: { status: 'X', expected_revision: 1 } });
  assert.equal(view.state, STATE.STALE_MISMATCH);
  assert.deepEqual([...view.actions], [RECOVERY.REFRESH]);
});

test('T12 the timing hook sees endpoint, status, ms and size - never the payload', async () => {
  const seen = [];
  const fetchImpl = fakeFetch(() => json(200, caseGetData()));
  let t = 1000;
  const transport = createHttpTransport({ baseUrl: BASE, fetchImpl, onTiming: (x) => seen.push(x), now: () => (t += 7) });
  await createClient(contract, transport).call('case_get', { case_id: 'CASE_0043' });
  // This fake has neither Content-Length nor text(): the size is unknown, and says so.
  assert.deepEqual(seen, [{ endpointId: 'case_get', url: '/api/v1/cases/CASE_0043', status: 200, ms: 7, bytes: null }]);
});

test('T14 the body size is Content-Length when sent, else the counted UTF-8 body', async () => {
  const body = caseGetData();
  const text = JSON.stringify(body);
  const make = (headers) => async () => ({
    status: 200,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => text,
  });
  for (const [name, headers, expected] of [
    ['declared', { 'content-type': 'application/json', 'content-length': '4321' }, 4321],
    ['counted', { 'content-type': 'application/json; charset=utf-8' }, Buffer.byteLength(text)],
  ]) {
    const seen = [];
    const transport = createHttpTransport({ baseUrl: BASE, fetchImpl: make(headers), onTiming: (x) => seen.push(x) });
    const view = await createClient(contract, transport).call('case_get', { case_id: 'CASE_0043' });
    assert.equal(view.state, STATE.SUCCESS, name);
    assert.equal(view.data.case_id, 'CASE_0043', `${name}: the body still parses`);
    assert.equal(seen[0].bytes, expected, name);
  }
});

test('T13 construction refuses a missing base URL or fetch', () => {
  assert.throws(() => createHttpTransport({ fetchImpl: async () => null }), (e) => e.code === 'NO_BASE_URL');
  assert.throws(() => createHttpTransport({ baseUrl: BASE, fetchImpl: 'nope' }), (e) => e.code === 'NO_FETCH');
});
