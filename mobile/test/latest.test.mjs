// node --test mobile/test/  - latest-wins requests (src/runtime/latest.mjs) and the
// caller's AbortSignal through the HTTP transport (N-6)
import test from 'node:test';
import assert from 'node:assert/strict';

import { createClient, STATE } from '../../app/core/index.mjs';
import { TransportError, createHttpTransport } from '../src/runtime/httpTransport.mjs';
import { createLatest, runLatest } from '../src/runtime/latest.mjs';
import { loadContract } from './_helpers.mjs';

const contract = loadContract();
const BASE = 'http://backend.invalid:8000';

test('Q1 a newer start aborts the older request and marks it stale', async () => {
  const latest = createLatest();
  const a = latest.start();
  const b = latest.start();
  assert.equal(a.signal.aborted, true, 'the older request was aborted');
  assert.equal(a.isLatest(), false);
  assert.equal(b.isLatest(), true);
  latest.abort();
  assert.equal(b.signal.aborted, true, 'unmount aborts what is in flight');
  assert.equal(b.isLatest(), false);
});

test('Q2 runLatest: the slow old answer is stale, the new one is not', async () => {
  const latest = createLatest();
  const slow = runLatest(latest, () => new Promise((r) => setTimeout(() => r('old'), 30)));
  const fast = runLatest(latest, async () => 'new');
  const [s, f] = await Promise.all([slow, fast]);
  assert.deepEqual(s, { view: 'old', stale: true });
  assert.deepEqual(f, { view: 'new', stale: false });
});

test('Q3 the transport honours the caller\'s signal: an aborted request never lands', async () => {
  const controller = new AbortController();
  const fetchImpl = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const transport = createHttpTransport({ baseUrl: BASE, fetchImpl, timeoutMs: 5000 });
  const p = transport.send({ endpointId: 'case_get', method: 'GET', url: '/api/v1/cases/C' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(p, (e) => e instanceof TransportError && e.code === 'ABORTED');
  await assert.rejects(
    transport.send({ endpointId: 'case_get', method: 'GET', url: '/api/v1/cases/C' }, { signal: controller.signal }),
    (e) => e.code === 'ABORTED',
    'an already-aborted signal never sends',
  );
  // Through app/core, an aborted call is a recoverable state - and useCall drops it as stale anyway.
  const view = await createClient(contract, transport).call('case_get', { case_id: 'C' }, { signal: controller.signal });
  assert.equal(view.state, STATE.RECOVERABLE_ERROR);
});

test('Q4 a timeout is still a timeout when the caller also passed a signal', async () => {
  const controller = new AbortController();
  const fetchImpl = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const transport = createHttpTransport({ baseUrl: BASE, fetchImpl, timeoutMs: 20 });
  await assert.rejects(
    transport.send({ endpointId: 'case_get', method: 'GET', url: '/api/v1/cases/C' }, { signal: controller.signal }),
    (e) => e.code === 'TIMEOUT',
  );
});
