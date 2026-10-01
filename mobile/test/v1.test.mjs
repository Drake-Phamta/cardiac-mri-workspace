// node --test mobile/test/  - V1 screen logic: SCR-02 rows and capability, SCR-03 helpers,
// the slice cache and the mask store (src/verticals/v1/*.mjs, src/runtime/sliceCache.mjs,
// src/imaging/maskStore.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE, createBundle, createClient, createFixtureTransport } from '../../app/core/index.mjs';
import { createCaseExplorer, LAYER } from '../../app/verticals/v1_case_explorer/index.mjs';
import { createMaskStore } from '../src/imaging/maskStore.mjs';
import { createSliceCache } from '../src/runtime/sliceCache.mjs';
import { CAPABILITY, capabilityOf, filterRows, readCaseRows } from '../src/verticals/v1/capability.mjs';
import {
  buildNavSequence, chooseRun, clampSlice, metricsText, runText, scrubIndex,
  scrubPosition, sliceLabel, variantOptions,
} from '../src/verticals/v1/explorer.mjs';
import { ellipseMask, encodePng, importMaskPngOrSkip } from './_png.mjs';
import { generatedBundleJson, loadContract } from './_helpers.mjs';

const contract = loadContract();
const bundle = createBundle(contract, generatedBundleJson());
const fixtureClient = () => createClient(contract, createFixtureTransport(bundle));

test('V1a capability: EVALUATION needs ground truth, INFERENCE_REVIEW must not have it', () => {
  const e = capabilityOf('EVALUATION', true);
  assert.equal(e.label, 'Evaluation');
  assert.equal(e.groundTruthUsable, true);
  assert.equal(e.consistent, true);
  const i = capabilityOf('INFERENCE_REVIEW', false);
  assert.equal(i.label, 'Inference & review');
  assert.equal(i.groundTruthUsable, false);
  assert.equal(i.consistent, true);
});

test('V1b capability: disagreeing fields are flagged, never resolved silently', () => {
  const bad = capabilityOf('EVALUATION', false);
  assert.equal(bad.consistent, false);
  assert.equal(bad.groundTruthUsable, false, 'ground-truth UI stays off unless both fields agree');
  assert.match(bad.problem, /EVALUATION but ground_truth_available is false/);
  assert.equal(capabilityOf('INFERENCE_REVIEW', true).consistent, false);
  // The generated fixture's placeholder strings are "not stated", not truthy.
  const placeholder = capabilityOf('mode_fixture', 'ground_truth_available_fixture');
  assert.equal(placeholder.key, 'UNKNOWN');
  assert.equal(placeholder.groundTruthAvailable, null);
  assert.equal(placeholder.groundTruthUsable, false);
  assert.equal(capabilityOf('UNKNOWN', true).key, 'UNKNOWN');
});

test('V1c case rows: rows without case_id are listed as invalid, never given an id', () => {
  const r = readCaseRows({
    items: [
      { case_id: 'CASE_0061', mode: 'EVALUATION', ground_truth_available: true },
      { mode: 'EVALUATION', ground_truth_available: true },
      { case_id: 'CASE_0001', mode: 'INFERENCE_REVIEW', ground_truth_available: false },
      { case_id: '  ', mode: 'EVALUATION', ground_truth_available: true },
    ],
    next_page: 'p2',
  });
  assert.deepEqual(r.rows.map((x) => x.caseId), ['CASE_0061', 'CASE_0001']);
  assert.deepEqual(r.invalid.map((x) => x.position), [2, 4]);
  assert.deepEqual({ ...r.counts }, { total: 2, EVALUATION: 1, INFERENCE_REVIEW: 1, UNKNOWN: 0 });
  assert.equal(r.hasMore, true);
  assert.equal(readCaseRows({ items: [], next_page: null }).hasMore, false);
});

test('V1d case rows from the GENERATED case_list scenario read without throwing', async () => {
  const view = await fixtureClient().call('case_list', { study_id: 'STUDY_DEMO' });
  assert.ok([STATE.SUCCESS, STATE.FATAL_INVALID, STATE.EMPTY_UNAVAILABLE].includes(view.state), view.state);
  if (view.state === STATE.SUCCESS) {
    const r = readCaseRows(view.data);
    assert.equal(r.rows.length + r.invalid.length, view.data.items.length);
  }
});

test('V1e filter: id substring (case-insensitive) and mode, server order kept', () => {
  const { rows } = readCaseRows({
    items: [
      { case_id: 'CASE_0061', mode: 'EVALUATION', ground_truth_available: true },
      { case_id: 'CASE_0001', mode: 'INFERENCE_REVIEW', ground_truth_available: false },
      { case_id: 'CASE_0010', mode: 'EVALUATION', ground_truth_available: true },
    ],
  });
  assert.deepEqual(filterRows(rows, { query: 'case_000' }).map((r) => r.caseId), ['CASE_0001']);
  assert.deepEqual(filterRows(rows, { query: '0' }).map((r) => r.caseId), ['CASE_0061', 'CASE_0001', 'CASE_0010']);
  assert.deepEqual(filterRows(rows, { mode: 'EVALUATION' }).map((r) => r.caseId), ['CASE_0061', 'CASE_0010']);
  assert.deepEqual(filterRows(rows, { mode: 'INFERENCE_REVIEW', query: '61' }).map((r) => r.caseId), []);
  assert.equal(filterRows(rows).length, 3);
});

test('V1f variants come from the contract and there is no default', () => {
  const opts = variantOptions(contract);
  assert.ok(opts.includes('RAW') && opts.includes('PROCESSED'));
  assert.ok(!opts.includes('REVIEWED'), 'prediction_slice_get never serves a reviewed mask');
  assert.deepEqual([...variantOptions({ raw: { domain_enums: { prediction_variant: ['PROCESSED', 'RAW'] } } })], ['PROCESSED', 'RAW']);
});

test('V1g run choice: requested must be listed; one run opens; several runs ask', () => {
  assert.deepEqual({ ...chooseRun(['R1']) }, { runId: 'R1', reason: 'only-run', choices: ['R1'] });
  assert.equal(chooseRun(['R1', 'R2']).runId, null);
  assert.equal(chooseRun(['R1', 'R2']).reason, 'choose');
  assert.equal(chooseRun(['R1', 'R2'], 'R2').runId, 'R2');
  assert.equal(chooseRun(['R1', 'R2'], 'R9').reason, 'requested-run-not-listed');
  assert.equal(chooseRun([]).reason, 'no-runs');
});

test('V1i slice label is n / total, 1-based, with the 0-based z', () => {
  assert.equal(sliceLabel(44, 88), 'slice 45 / 88  (z = 44)');
  assert.equal(sliceLabel(0, 88), 'slice 1 / 88  (z = 0)');
  assert.equal(sliceLabel(null, 88), 'slice - / -');
  assert.equal(clampSlice(-3, 88), 0);
  assert.equal(clampSlice(200, 88), 87);
});

test('V1j the slider maps position to slice deterministically and reaches both ends (TC-MRI-002)', () => {
  const W = 300; const N = 88;
  assert.equal(scrubIndex(0, W, N), 0);
  assert.equal(scrubIndex(W - 0.001, W, N), 87);
  assert.equal(scrubIndex(W + 50, W, N), 87);
  assert.equal(scrubIndex(-20, W, N), 0);
  for (let i = 0; i < N; i += 1) {
    assert.equal(scrubIndex(scrubPosition(i, W, N), W, N), i, `round trip at ${i}`);
  }
  assert.equal(scrubIndex(123.4, W, N), scrubIndex(123.4, W, N));
  assert.equal(scrubIndex(10, 0, N), null);
});

test('V1k metric text: NOT_APPLICABLE in words, never 0 or 1; unavailable says why', () => {
  assert.match(metricsText({ state: 'COMPUTED', value: 0.8734, version: 'm1' }, 'RAW').text, /Slice Dice \(RAW\): 0\.873 · metric m1/);
  const na = metricsText({ state: 'NOT_APPLICABLE', value: null }, 'PROCESSED').text;
  assert.match(na, /not applicable/);
  assert.doesNotMatch(na, /\b[01](\.0+)?\b/);
  assert.match(metricsText({ state: 'UNAVAILABLE', reason: 'GROUND_TRUTH_UNAVAILABLE' }, 'RAW').text, /GROUND_TRUTH_UNAVAILABLE/);
  assert.match(metricsText({ state: 'COMPUTED', value: 'x' }, 'RAW').text, /not shown/);
});

test('V1l run text names run, model, experiment and the precomputed flag', () => {
  assert.equal(runText({ runId: 'R1', experimentId: 'EXP_A', precomputed: true, status: 'SUCCEEDED' }, 'UNet2D'),
    'Run R1 · UNet2D · EXP_A · precomputed');
  assert.match(runText({ runId: 'R1', experimentId: null, precomputed: null, status: 'FAILED' }), /precomputed: not stated · FAILED/);
});

test('V1m the 30-step sequence is Spike A\'s: 30 steps, +/-1 moves kept, all in range', () => {
  const s16 = buildNavSequence(16);
  assert.deepEqual(s16, [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0, 8, 0, 15, 4, 11, 2, 13, 6, 7, 8, 9, 10, 11, 12]);
  const s88 = buildNavSequence(88);
  assert.equal(s88.length, 30);
  assert.ok(s88.every((z) => z >= 0 && z < 88));
  assert.deepEqual(s88.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8], 'the forward run stays one slice at a time');
});

test('V1n slice cache: a revisit is answered from memory; variants never share; errors never cached', async () => {
  let sent = 0;
  const base = createClient(contract, {
    kind: 'count',
    async send(resolved, options) {
      sent += 1;
      return createFixtureTransport(bundle).send(resolved, options);
    },
  });
  const cached = createSliceCache(base);
  const p = { run_id: 'RUN_0043', slice_index: 5, variant: 'RAW' };
  const a = await cached.call('prediction_slice_get', p);
  const b = await cached.call('prediction_slice_get', p);
  assert.equal(a, b);
  assert.equal(sent, 1);
  await cached.call('prediction_slice_get', { ...p, variant: 'PROCESSED' });
  assert.equal(sent, 2, 'PROCESSED is a different entry from RAW');
  await cached.call('case_get', { case_id: 'CASE_0043' });
  await cached.call('case_get', { case_id: 'CASE_0043' });
  assert.equal(sent, 4, 'non-slice endpoints are never cached');
  const e1 = await cached.call('ground_truth_slice_get', { case_id: 'C', slice_index: 1 }, { scenario: 'ground_truth_unavailable' });
  await cached.call('ground_truth_slice_get', { case_id: 'C', slice_index: 1 }, { scenario: 'ground_truth_unavailable' });
  assert.equal(e1.state, STATE.EMPTY_UNAVAILABLE);
  assert.equal(sent, 6, 'an unavailable answer is asked again next time');
  assert.equal(cached.stats().hits, 1);
});

test('V1o2 slice cache: an unnamed read finds what the model fetched with scenario "default"', async () => {
  const cached = createSliceCache(fixtureClient());
  const p = { case_id: 'C', slice_index: 7 };
  const v = await cached.call('mri_slice_get', p, { scenario: 'default' });
  assert.equal(cached.peek('mri_slice_get', p), v);
  assert.equal(cached.peek('mri_slice_get', p, { scenario: 'default' }), v);
  assert.equal(cached.peek('mri_slice_get', p, { scenario: 'other' }), null, 'a named scenario is a different answer');
  assert.equal(cached.peek('case_get', { case_id: 'C' }), null, 'non-slice endpoints are never cached');
});

test('V1o slice cache is bounded and keeps the most recently used', async () => {
  const cached = createSliceCache(fixtureClient(), { maxEntries: 3 });
  for (let z = 0; z < 5; z += 1) await cached.call('mri_slice_get', { case_id: 'C', slice_index: z });
  assert.equal(cached.size, 3);
  assert.equal(cached.has('mri_slice_get', { case_id: 'C', slice_index: 0 }), false);
  assert.equal(cached.has('mri_slice_get', { case_id: 'C', slice_index: 4 }), true);
  assert.equal(cached.stats().evictions, 2);
});

test('V1p the V1 model over the slice cache: switching back to a slice sends nothing', async () => {
  let sent = 0;
  const base = createClient(contract, {
    kind: 'count',
    async send(resolved, options) { sent += 1; return createFixtureTransport(bundle).send(resolved, options); },
  });
  const m = createCaseExplorer(createSliceCache(base), { variant: 'RAW' });
  await m.open({ caseId: 'CASE_0043', runId: 'RUN_0043', sliceIndex: 10 });
  await m.goToSlice(11);
  const before = sent;
  const back = await m.goToSlice(10);
  assert.equal(back.view.state, STATE.SUCCESS);
  assert.equal(back.sliceIndex, 10);
  assert.equal(sent, before, 'slice 10 came back entirely from the cache');
  assert.equal(back.layersAvailable[LAYER.PREDICTION], true);
});

test('V1q mask store: fetch once, decode once, path; failures are not cached', async () => {
  const w = 64; const h = 48;
  const SLICE = { width: w, height: h };
  const bits = Uint8Array.from(ellipseMask(w, h, 30, 20, 10, 8), (v) => (v ? 1 : 0));
  let fetched = 0;
  let decoded = 0;
  let fail = true;
  // The store's own logic, with the decoder injected: here a stand-in that
  // checks it is handed the bytes and the expected size. The real adapter
  // is tested in imaging.test.mjs (I1-I4) and in V1q2 below.
  const store = createMaskStore({
    fetchBytes: async (url) => {
      fetched += 1;
      if (url.includes('broken') && fail) throw new Error('HTTP 404');
      return Uint8Array.from([1, 2, 3]);
    },
    decode: (bytes, expected) => {
      decoded += 1;
      assert.deepEqual([...bytes], [1, 2, 3]);
      assert.deepEqual(expected, SLICE);
      return { width: w, height: h, data: bits };
    },
  });
  const [a, b] = await Promise.all([store.load('http://h/a.png', SLICE), store.load('http://h/a.png', SLICE)]);
  assert.equal(a, b);
  assert.equal(fetched, 1, 'two concurrent asks share one request');
  assert.equal(decoded, 1);
  assert.equal(a.width, 64);
  assert.ok(a.pixels > 0 && a.path.startsWith('M'));
  assert.equal(store.peek('http://h/a.png', SLICE), a);
  await store.load('http://h/a.png', SLICE);
  assert.equal(fetched, 1);
  await assert.rejects(store.load('http://h/broken.png', SLICE), /404/);
  fail = false;
  const ok = await store.load('http://h/broken.png', SLICE);
  assert.ok(ok.pixels > 0, 'the failure was not cached');
  assert.equal(store.stats().failures, 1);
  await assert.rejects(store.load('http://h/a.png'), /expected slice size/);
  assert.throws(() => createMaskStore({ fetchBytes: async () => null }), /needs decode/);
});

test('V1q2 mask store with the real adapter: a PNG encoded by node:zlib comes back as its path', async (t) => {
  const m = await importMaskPngOrSkip(t);
  if (!m) return;
  const w = 64; const h = 48;
  const png = encodePng(w, h, 0, ellipseMask(w, h, 30, 20, 10, 8));
  const store = createMaskStore({ fetchBytes: async () => png, decode: m.decodeMaskPng });
  const v = await store.load('http://h/a.png', { width: w, height: h });
  assert.equal(v.pixels, ellipseMask(w, h, 30, 20, 10, 8).filter((x) => x === 255).length);
  await assert.rejects(store.load('http://h/b.png', { width: w + 1, height: h }), (e) => e.code === 'CONTRACT_DRIFT');
});

test('V1s capability labels match between the list and the case screen (TC-CASE-002)', () => {
  for (const [mode, gt] of [['EVALUATION', true], ['INFERENCE_REVIEW', false]]) {
    const listRow = readCaseRows({ items: [{ case_id: 'C', mode, ground_truth_available: gt }] }).rows[0].capability;
    const caseScreen = capabilityOf(mode, gt);
    assert.equal(listRow.label, caseScreen.label);
    assert.equal(listRow.groundTruthUsable, caseScreen.groundTruthUsable);
  }
  assert.equal(CAPABILITY.EVALUATION.short, 'EVAL');
});
