// node --test mobile/test/  - per-gesture network accounting (src/runtime/netLog.mjs) and
// the counted MRI image store (src/imaging/imageStore.mjs) behind L4 / NFR-PERF-001 limb 2
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { STATE } from '../../app/core/index.mjs';
import { resolveConfig } from '../src/config.mjs';
import { bytesToBase64, createImageStore } from '../src/imaging/imageStore.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { createNetLog, utf8Length } from '../src/runtime/netLog.mjs';
import { readContractJson } from './_helpers.mjs';

function capture() {
  const lines = [];
  let t = 1000;
  const log = createNetLog({ log: (l) => lines.push(l), now: () => (t += 5) });
  return { log, lines, parsed: () => lines.map((l) => JSON.parse(l.replace(/^CMW_GESTURE /, ''))) };
}

test('G1 a gesture lists every request it caused, with sizes, and is not a cache hit', () => {
  const { log, lines, parsed } = capture();
  log.begin({ caseId: 'CASE_0061', from: 44, to: 45 });
  log.record({ endpoint: 'mri_slice_get', bytes: 812, ms: 40.4, status: 200 });
  log.record({ endpoint: 'artifact:mri', bytes: 171234, ms: 120, status: 200 });
  const rec = log.end();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^CMW_GESTURE \{/);
  assert.deepEqual(parsed()[0], rec);
  assert.equal(rec.kind, 'slice');
  assert.equal(rec.case, 'CASE_0061');
  assert.deepEqual([rec.from, rec.to], [44, 45]);
  assert.equal(rec.cache_hit, false);
  assert.equal(rec.bytes_total, 812 + 171234);
  assert.equal(rec.max_request_bytes, 171234);
  assert.deepEqual(rec.requests[0], { endpoint: 'mri_slice_get', bytes: 812, ms: 40, status: 200 });
});

test('G2 a gesture that caused no request is a cache hit with 0 bytes', () => {
  const { log } = capture();
  log.begin({ caseId: 'C', from: 45, to: 44 });
  const rec = log.end();
  assert.equal(rec.cache_hit, true);
  assert.equal(rec.bytes_total, 0);
  assert.deepEqual(rec.requests, []);
});

test('G3 a new gesture closes the open one as superseded - never merged into it', () => {
  const { log, parsed } = capture();
  log.begin({ caseId: 'C', from: 1, to: 2 });
  log.record({ endpoint: 'mri_slice_get', bytes: 10 });
  log.begin({ caseId: 'C', from: 2, to: 3 });
  log.record({ endpoint: 'mri_slice_get', bytes: 20 });
  log.end();
  const [a, b] = parsed();
  assert.equal(a.outcome, 'superseded');
  assert.equal(a.bytes_total, 10);
  assert.equal(b.outcome, 'shown');
  assert.equal(b.bytes_total, 20);
  assert.equal(b.seq, a.seq + 1);
});

test('G3b #77 QA N-3: a request belongs to the gesture open when it STARTED - one that lands after gesture B opened is not B\'s', () => {
  const { log, parsed } = capture();
  const a = log.begin({ caseId: 'C', from: 1, to: 2 });
  const startedInA = log.openSeq; // read as the request is sent, as runtime.content and the transport do
  assert.equal(startedInA, a);
  log.record({ endpoint: 'mri_slice_get', bytes: 10, seq: startedInA }); // lands while A is open: A's
  log.begin({ caseId: 'C', from: 2, to: 3 }); // B supersedes A
  log.record({ endpoint: 'artifact:mri', bytes: 5000, seq: startedInA }); // A's slow artifact lands during B
  log.record({ endpoint: 'mri_slice_get', bytes: 20, seq: log.openSeq }); // B's own request
  log.end();
  const [ga, gb] = parsed();
  assert.equal(ga.outcome, 'superseded');
  assert.deepEqual(ga.requests.map((q) => q.endpoint), ['mri_slice_get']);
  assert.deepEqual(gb.requests.map((q) => [q.endpoint, q.bytes]), [['mri_slice_get', 20]], 'A\'s late artifact is not filed under B');
  assert.equal(gb.bytes_total, 20);
  assert.deepEqual(log.totals(), { gestures: 2, requests: 3, bytes: 5030, unattributed: 0, late: 1 }, 'counted as late, not lost');
  // A request sent with no gesture open stays unattributed even if one is open when it lands.
  log.begin({ caseId: 'C', from: 3, to: 4 });
  log.record({ endpoint: 'case_get', bytes: 7, seq: null });
  assert.deepEqual(log.end().requests, []);
  assert.equal(log.totals().unattributed, 1);
});

test('G3c the live runtime tags JSON calls and artifact bytes with the gesture open when they were sent', async () => {
  const png = Uint8Array.from([137, 80, 78, 71, 1, 2, 3]);
  const sum = `sha256:${createHash('sha256').update(png).digest('hex')}`;
  const held = [];
  const fetchImpl = (url) => new Promise((resolve) => {
    held.push(() => resolve(url.includes('/artifacts/')
      ? { status: 200, headers: { get: () => null }, arrayBuffer: async () => png.buffer.slice(0) }
      : { status: 404, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) }, text: async () => '{"error":{"code":"CASE_NOT_FOUND","message":"x"}}' }));
  });
  const lines = [];
  const runtime = createRuntime({
    config: resolveConfig({ mode: 'live', apiBaseUrl: 'http://backend.invalid:8000' }),
    contractJson: readContractJson(), fetchImpl, log: (l) => lines.push(l),
  });
  runtime.netLog.begin({ caseId: 'C', from: 0, to: 1 });
  const json = runtime.client.call('case_get', { case_id: 'C' });
  const bytes = runtime.content.bytes('/api/v1/artifacts/x.png', { checksum: sum, kind: 'mri' });
  runtime.netLog.begin({ caseId: 'C', from: 1, to: 2 }); // the first gesture is superseded before either answers
  while (held.length < 2) await new Promise((r) => setTimeout(r, 1));
  held.forEach((release) => release());
  await json;
  assert.equal((await bytes).state, STATE.SUCCESS);
  const second = runtime.netLog.end();
  assert.deepEqual(second.requests, [], 'neither late answer is filed under the gesture open when it landed');
  assert.equal(runtime.netLog.totals().late, 2);
});

test('G4 requests outside any gesture are counted as unattributed, not lost or misfiled', () => {
  const { log } = capture();
  log.record({ endpoint: 'artifact:mask', bytes: 300 });
  assert.deepEqual(log.totals(), { gestures: 0, requests: 1, bytes: 300, unattributed: 1, late: 0 });
  assert.equal(log.end(), null, 'ending with nothing open is a no-op');
  assert.equal(log.openSeq, null);
});

test('G5 the line names endpoints and sizes only - no URL, no host, no payload', () => {
  const { log, lines } = capture();
  log.begin({ caseId: 'C', from: 0, to: 1, kind: 'variant' });
  log.record({ endpoint: 'prediction_slice_get', bytes: 99, ms: 3, status: 200 });
  log.end();
  assert.doesNotMatch(lines[0], /http|\/api\/|backend|\d+\.\d+\.\d+\.\d+/);
  assert.match(lines[0], /"kind":"variant"/);
});

test('G6 utf8Length counts bytes, not characters', () => {
  assert.equal(utf8Length('{"a":1}'), 7);
  assert.equal(utf8Length('Phạm'), Buffer.byteLength('Phạm'));
  assert.equal(utf8Length('😀'), 4);
  assert.equal(utf8Length(''), 0);
});

test('G7 bytesToBase64 matches Buffer for every remainder and a large buffer', () => {
  for (let n = 0; n < 12; n += 1) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
    assert.equal(bytesToBase64(b), Buffer.from(b).toString('base64'), `length ${n}`);
  }
  const big = Uint8Array.from({ length: 200001 }, (_, i) => (i * 7919) & 0xff);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString('base64'));
});

test('G8 image store: fetch once, data URI with the byte count, revisit free, failure not cached', async () => {
  let fetched = 0;
  let fail = true;
  const store = createImageStore({
    fetchBytes: async (url) => {
      fetched += 1;
      if (url.includes('broken') && fail) throw new Error('HTTP 404');
      return Uint8Array.from([137, 80, 78, 71]);
    },
  });
  const [a, b] = await Promise.all([store.load('u1'), store.load('u1')]);
  assert.equal(a, b);
  assert.equal(fetched, 1);
  assert.equal(a.uri, 'data:image/png;base64,iVBORw==');
  assert.equal(a.bytes, 4);
  assert.equal(store.peek('u1'), a);
  await store.load('u1');
  assert.equal(fetched, 1, 'a revisit costs no request');
  await assert.rejects(store.load('broken'), /404/);
  fail = false;
  assert.equal((await store.load('broken')).bytes, 4);
  assert.deepEqual({ ...store.stats() }, { hits: 1, loads: 2, failures: 1, cached: 2, inFlight: 0 });
});

test('G9 image store is bounded per slice, never the volume', async () => {
  const store = createImageStore({ fetchBytes: async () => Uint8Array.from([1]), maxEntries: 3 });
  for (const u of ['a', 'b', 'c', 'd']) await store.load(u);
  assert.equal(store.has('a'), false);
  assert.equal(store.has('d'), true);
  assert.equal(store.stats().cached, 3);
});
