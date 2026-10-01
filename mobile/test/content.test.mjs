// node --test mobile/test/  - runtime.content, the one binary path (src/runtime/content.mjs, sha256.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { RECOVERY, STATE } from '../../app/core/index.mjs';
import { CONTENT_REASON, bytesOrThrow, createContent } from '../src/runtime/content.mjs';
import { createNetLog } from '../src/runtime/netLog.mjs';
import { sha256Hex } from '../src/runtime/sha256.mjs';
import { loadContract } from './_helpers.mjs';

const contract = loadContract();
const BASE = 'http://backend.invalid:8000';
const PATH = '/api/v1/artifacts/abc.png';
const BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const SUM = `sha256:${createHash('sha256').update(BYTES).digest('hex')}`;

function answer(status, bytes = BYTES, headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (k) => h[k.toLowerCase()] ?? null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => JSON.parse(h['x-body'] || 'null'),
  };
}

function live(fetchImpl, extra = {}) {
  return createContent({ contract, mode: 'live', baseUrl: BASE, fetchImpl, timeoutMs: 50, ...extra });
}

test('B1 sha256Hex (Spike A provenance copy) matches node:crypto', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 70001]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
    assert.equal(sha256Hex(b), createHash('sha256').update(b).digest('hex'), `length ${n}`);
  }
});

test('B2 fixture mode: no URI and an explicit EMPTY_UNAVAILABLE reason, nothing fetched', async () => {
  let calls = 0;
  const c = createContent({ contract, mode: 'fixture', fetchImpl: async () => { calls += 1; } });
  assert.equal(c.uri(PATH), null);
  const v = await c.bytes(PATH, { checksum: SUM });
  assert.equal(v.state, STATE.EMPTY_UNAVAILABLE);
  assert.equal(v.reason, CONTENT_REASON.FIXTURE_NO_BYTES);
  assert.equal(calls, 0);
});

test('B3 only artifact paths of the configured backend resolve', () => {
  const c = live(async () => answer(200));
  assert.equal(c.uri(PATH), `${BASE}${PATH}`);
  assert.equal(c.uri(`${BASE}${PATH}`), `${BASE}${PATH}`);
  assert.equal(c.uri('/api/v1/cases/CASE_0061'), null, 'not the artifact route');
  assert.equal(c.uri('https://elsewhere.invalid/api/v1/artifacts/abc.png'), null, 'another host is never fetched');
  assert.equal(c.uri('content_url_fixture'), null);
  assert.equal(c.uri(null), null);
});

test('B4 bytes that hash to the checksum, with a matching ETag, are SUCCESS and verified', async () => {
  const lines = [];
  const netLog = createNetLog({ log: (l) => lines.push(l) });
  netLog.begin({ caseId: 'C', from: 1, to: 2 });
  const urls = [];
  const c = live(async (url) => { urls.push(url); return answer(200, BYTES, { etag: `"${SUM}"` }); }, { netLog });
  const v = await c.bytes(PATH, { checksum: SUM, kind: 'mri' });
  assert.equal(v.state, STATE.SUCCESS);
  assert.deepEqual([...v.data.bytes], [...BYTES]);
  assert.equal(v.data.verified, true);
  assert.equal(v.data.size, BYTES.length);
  assert.deepEqual(urls, [`${BASE}${PATH}`]);
  const g = netLog.end();
  assert.deepEqual(g.requests.map((q) => [q.endpoint, q.bytes]), [['artifact:mri', BYTES.length]]);
});

test('B5 bytes that do not hash to the checksum are CONTRACT_DRIFT and block', async () => {
  const c = live(async () => answer(200, Uint8Array.from([1, 2, 3])));
  const v = await c.bytes(PATH, { checksum: SUM });
  assert.equal(v.state, STATE.FATAL_INVALID);
  assert.equal(v.reason, 'CONTRACT_DRIFT');
  assert.ok(v.error.detail.problems.some((p) => p.startsWith('received sha256:')));
  assert.ok(!v.actions.includes(RECOVERY.RETRY));
});

test('B6 an ETag that disagrees, or a malformed checksum, is CONTRACT_DRIFT', async () => {
  const c = live(async () => answer(200, BYTES, { etag: '"sha256:0000"' }));
  assert.equal((await c.bytes(PATH, { checksum: SUM })).reason, 'CONTRACT_DRIFT');
  assert.equal((await c.bytes(PATH, { checksum: 'sha256:fixture-derived-not-clinical' })).reason, 'CONTRACT_DRIFT');
  const off = live(async () => answer(200, Uint8Array.from([9])));
  assert.equal((await off.bytes('/api/v1/cases/X')).reason, 'CONTRACT_DRIFT', 'a non-artifact path is never fetched');
});

test('B7 network failure, timeout and 5xx-without-code are TRANSPORT_UNREACHABLE with RETRY', async () => {
  const down = live(async () => { throw new TypeError('Network request failed'); });
  const a = await down.bytes(PATH);
  assert.equal(a.reason, 'TRANSPORT_UNREACHABLE');
  assert.ok(a.actions.includes(RECOVERY.RETRY));
  const hang = live((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  }));
  assert.equal((await hang.bytes(PATH)).reason, 'TRANSPORT_UNREACHABLE', 'the transport timeout applies');
  const crash = live(async () => answer(500, new Uint8Array(0), { 'content-type': 'application/json', 'x-body': '{"detail":"boom"}' }));
  assert.equal((await crash.bytes(PATH)).reason, 'TRANSPORT_UNREACHABLE');
});

test('B8 a contract error envelope maps through app/core; a bare 4xx is drift', async () => {
  const gone = live(async () => answer(404, new Uint8Array(0), {
    'content-type': 'application/json', 'x-body': '{"error":{"code":"ARTIFACT_NOT_FOUND","message":"x"}}',
  }));
  const v = await gone.bytes(PATH);
  assert.equal(v.state, STATE.EMPTY_UNAVAILABLE);
  assert.equal(v.reason, 'ARTIFACT_NOT_FOUND');
  const bare = live(async () => answer(403, new Uint8Array(0)));
  assert.equal((await bare.bytes(PATH)).reason, 'CONTRACT_DRIFT');
});

test('B9 the caller\'s signal aborts the request and the answer says so', async () => {
  const controller = new AbortController();
  const c = live((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  }), { timeoutMs: 5000 });
  const pending = c.bytes(PATH, { signal: controller.signal });
  controller.abort();
  const v = await pending;
  assert.equal(v.state, STATE.EMPTY_UNAVAILABLE);
  assert.equal(v.reason, CONTENT_REASON.REQUEST_ABORTED);
  const already = await c.bytes(PATH, { signal: controller.signal });
  assert.equal(already.reason, CONTENT_REASON.REQUEST_ABORTED, 'an aborted signal never starts a request');
});

test('B10 bytesOrThrow: bytes on SUCCESS, an Error carrying the state otherwise', async () => {
  const ok = live(async () => answer(200));
  assert.deepEqual([...await bytesOrThrow(ok, PATH, { checksum: SUM })], [...BYTES]);
  const fixture = createContent({ contract, mode: 'fixture' });
  await assert.rejects(bytesOrThrow(fixture, PATH), (e) => e.code === CONTENT_REASON.FIXTURE_NO_BYTES && e.view.state === STATE.EMPTY_UNAVAILABLE);
});
