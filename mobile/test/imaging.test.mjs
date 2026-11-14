// node --test mobile/test/  - the mask PNG adapter (src/imaging/maskPng.js, over fast-png)
// and mask paths (src/imaging/maskPaths.mjs)
//
// Every PNG here is ENCODED IN THE TEST with node:zlib (_png.mjs), from pixel
// arrays the test also holds: an independent encoder cross-checks the app's
// decoder across stored / fixed / dynamic deflate blocks and all five PNG row
// filters. The adapter tests SKIP where fast-png is not installed (CI runs
// without npm install); the maskPaths tests always run.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { ellipseMask, encodePng, importMaskPngOrSkip } from './_png.mjs';
import {
  disagreementRuns, foregroundCount, maskRuns, runPixelCount, runsToPath,
} from '../src/imaging/maskPaths.mjs';

const toBits = (d) => Uint8Array.from(d, (v) => (v === 255 ? 1 : 0));

let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

test('I1 a 0/255 mask decodes to exactly the same 0/1 pixels for every row filter (DR-008a layout)', async (t) => {
  const m = await importMaskPngOrSkip(t);
  if (!m) return;
  const w = 37; const h = 23;
  const px = new Uint8Array(w * h);
  for (let i = 0; i < px.length; i += 1) px[i] = rand() < 0.3 ? 255 : 0;
  for (const ft of [0, 1, 2, 3, 4]) {
    const out = m.decodeMaskPng(encodePng(w, h, 0, px, { filterFor: () => ft }), { width: w, height: h });
    assert.equal(out.width, w);
    assert.equal(out.height, h);
    assert.deepEqual(out.data, toBits(px), `filter ${ft}`);
  }
  const mixed = m.decodeMaskPng(encodePng(w, h, 0, px, { filterFor: (y) => y % 5 }), { width: w, height: h });
  assert.deepEqual(mixed.data, toBits(px), 'mixed filters');
});

test('I2 stored, fixed-Huffman, dynamic and Huffman-only deflate all decode the same mask', async (t) => {
  const m = await importMaskPngOrSkip(t);
  if (!m) return;
  const w = 96; const h = 80;
  const px = ellipseMask(w, h, 40, 35, 25, 18);
  for (const [name, zopts] of [
    ['stored', { level: 0 }],
    ['fixed', { strategy: zlib.constants.Z_FIXED }],
    ['dynamic', { level: 9 }],
    ['huffman-only', { strategy: zlib.constants.Z_HUFFMAN_ONLY }],
  ]) {
    const out = m.decodeMaskPng(encodePng(w, h, 0, px, { zopts, filterFor: (y) => y % 5 }), { width: w, height: h });
    assert.deepEqual(out.data, toBits(px), name);
  }
});

test('I3 a 576x576 cohort-size mask decodes to the same foreground set, and fast', async (t) => {
  const m = await importMaskPngOrSkip(t);
  if (!m) return;
  const w = 576; const h = 576;
  const px = ellipseMask(w, h, 300, 260, 70, 55);
  const png = encodePng(w, h, 0, px, { filterFor: (y) => (y % 2 ? 2 : 1), zopts: { level: 9 } });
  const t0 = performance.now();
  const out = m.decodeMaskPng(png, { width: w, height: h });
  const ms = performance.now() - t0;
  assert.deepEqual(out.data, toBits(px));
  assert.equal(foregroundCount(out), toBits(px).reduce((a, b) => a + b, 0));
  assert.ok(ms < 1000, `decode took ${ms.toFixed(1)} ms`);
});

test('I4 anything but 8-bit single-channel 0/255 at the slice size is CONTRACT_DRIFT, never a guess', async (t) => {
  const m = await importMaskPngOrSkip(t);
  if (!m) return;
  const w = 6; const h = 4;
  const ok = encodePng(w, h, 0, new Uint8Array(w * h).fill(255));
  const drift = (fn, re) => assert.throws(fn, (e) => e instanceof m.MaskPngError && e.code === 'CONTRACT_DRIFT' && re.test(e.message));

  const mid = new Uint8Array(w * h); mid[9] = 128;
  drift(() => m.decodeMaskPng(encodePng(w, h, 0, mid), { width: w, height: h }), /value 128 at pixel \(3, 1\)/);
  drift(() => m.decodeMaskPng(encodePng(w, h, 2, new Uint8Array(w * h * 3)), { width: w, height: h }), /3 channels/);
  drift(() => m.decodeMaskPng(encodePng(w, h, 4, new Uint8Array(w * h * 2)), { width: w, height: h }), /2 channels/);
  drift(() => m.decodeMaskPng(encodePng(w, h, 6, new Uint8Array(w * h * 4)), { width: w, height: h }), /4 channels/);
  drift(() => m.decodeMaskPng(encodePng(w, h, 0, new Uint16Array(w * h), { bitDepth: 16 }), { width: w, height: h }), /bit depth is 16/);
  drift(() => m.decodeMaskPng(encodePng(w, h, 3, new Uint8Array(w * h)), { width: w, height: h }), /palette/);
  drift(() => m.decodeMaskPng(ok, { width: w + 1, height: h }), /6x4; the slice is 7x4/);
  drift(() => m.decodeMaskPng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), { width: w, height: h }), /could not be decoded/);
  drift(() => m.decodeMaskPng(ok), /expected slice size/);
  assert.equal(m.decodeMaskPng(ok, { width: w, height: h }).data.every((v) => v === 1), true);
});

test('M1 runs and path cover exactly the foreground pixels, row by row', () => {
  const w = 6; const h = 3;
  const data = Uint8Array.from([
    0, 1, 1, 0, 0, 1,
    0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 1, 1,
  ]);
  const runs = maskRuns({ width: w, height: h, data });
  assert.deepEqual([...runs], [0, 1, 2, 0, 5, 1, 2, 0, 6]);
  assert.equal(runsToPath(runs), 'M1 0h2v1h-2zM5 0h1v1h-1zM0 2h6v1h-6z');
  assert.equal(runPixelCount(runs), foregroundCount({ width: w, height: h, data }));
  assert.equal(runPixelCount(runs), 9);
});

test('M2 any nonzero value is foreground (0/1 from the adapter, 0/255 raw)', () => {
  assert.deepEqual([...maskRuns({ width: 4, height: 1, data: Uint8Array.from([0, 1, 0, 255]) })], [0, 1, 1, 0, 3, 1]);
});

test('M3 an empty mask has no runs and an empty path - never a filled square', () => {
  const runs = maskRuns({ width: 8, height: 8, data: new Uint8Array(64) });
  assert.equal(runs.length, 0);
  assert.equal(runsToPath(runs), '');
});

test('M4 TP / FP / FN partition the union of the two masks exactly (TC-ERR-001 boolean semantics)', () => {
  const w = 576; const h = 576;
  const gt = { width: w, height: h, data: toBits(ellipseMask(w, h, 300, 260, 70, 55)) };
  const pred = { width: w, height: h, data: toBits(ellipseMask(w, h, 310, 262, 66, 58)) };
  const d = disagreementRuns(gt, pred);
  let tp = 0; let fp = 0; let fn = 0;
  for (let i = 0; i < w * h; i += 1) {
    const g = gt.data[i] === 1; const p = pred.data[i] === 1;
    if (g && p) tp += 1; else if (p) fp += 1; else if (g) fn += 1;
  }
  assert.deepEqual({ ...d.counts }, { tp, fp, fn });
  assert.equal(d.counts.tp + d.counts.fn, foregroundCount(gt));
  assert.equal(d.counts.tp + d.counts.fp, foregroundCount(pred));
  assert.ok(d.counts.fp > 0 && d.counts.fn > 0, 'the fixture really disagrees');
});

test('M5 masks of different sizes are refused, never stretched to fit', () => {
  const a = { width: 4, height: 4, data: new Uint8Array(16) };
  const b = { width: 4, height: 5, data: new Uint8Array(20) };
  assert.throws(() => disagreementRuns(a, b), /sizes differ/);
  assert.throws(() => maskRuns({ width: 4, height: 4, data: new Uint8Array(3) }), /width \* height/);
});
