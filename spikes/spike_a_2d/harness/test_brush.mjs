// SPIKE_A — offline check of app/brushMath.js (stage S5: A3–A7), the exact code the phone runs.
//
// THROWAWAY SPIKE CODE under spikes/spike_a_2d/.
//
//   node harness/test_brush.mjs
//
// Independent references, so the module is not checked against itself:
//   pixels and hashes after every stroke,  fixtures/brush_ops.json - computed by the
//   undo, redo and reset                   Python oracle in fixtures/generate.py
//   r = 0 painted pixel                    brush_cases.json expected_source_pixel (F2 rederives it)
//   SHA-256                                node:crypto, never the app's sha256Hex
//   footprint sizes                        counted by hand (H1)
//   the Bresenham loop                     the closed-form rounding rule it implements (H2)
//
// Exit code 1 on any failure. Nothing here is a device measurement.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as B from '../app/brushMath.js';
import * as M from '../app/viewerMath.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'fixtures');
const load = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));

let failures = 0;
const check = (id, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(4)} ${detail}`);
};

const mask = load('mask_synthetic.json');
const brush = load('brush_cases.json');
const ops = load('brush_ops.json');
const [NX, NY, NZ] = mask.shape_xyz;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const volSha = (slices) => sha(Buffer.concat(slices.map((b) => Buffer.from(b))));
const hashes = (slices) => slices.map(sha);
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const sorted = (xs) => Array.from(xs).sort((a, b) => a - b);

// The source mask exactly as the app decodes it.
const source = mask.slices_b64.map(M.base64ToBytes);
const sourceHashes = hashes(source);

// SRC — the oracle starts from the real fixture, not from a copy of its own
{
  const ok = sameList(sourceHashes, mask.slice_sha256) && sameList(ops.source_slice_sha256, mask.slice_sha256) &&
    sameList(ops.shape_xyz, mask.shape_xyz);
  check('SRC', ok, `brush_ops.json starts from mask_synthetic.json: ${NZ} source slice hashes agree (node:crypto)`);
}

// H1 — footprints counted by hand, independent of the oracle
{
  const blankStamp = (u, v, r) => {
    const buf = new Uint8Array(NX * NY);
    const st = B.beginStroke(0, 'add', r);
    B.strokeSample(st, buf, u, v, { zoom: 1, panX: 0, panY: 0 }, NX, NY);
    return sorted(buf.reduce((acc, val, i) => (val ? [...acc, i] : acc), []));
  };
  const at = (x, y) => y * NX + x;
  const r1 = blankStamp(10.5, 10.5, 1);
  const r2 = blankStamp(10.5, 10.5, 2);
  const corner = blankStamp(0.5, 0.5, 2);
  const ok = sameList(r1, sorted([at(10, 9), at(9, 10), at(10, 10), at(11, 10), at(10, 11)])) &&
    r2.length === 13 && sameList(corner, sorted([at(0, 0), at(1, 0), at(2, 0), at(0, 1), at(1, 1), at(0, 2)])) &&
    B.footprint(10, 10, 0, NX, NY).length === 1;
  check('H1', ok, `hand counts on a blank ${NX}x${NY}: r=1 at (10,10) -> ${r1.length} px (plus sign), ` +
    `r=2 -> ${r2.length}, r=2 at corner (0,0) -> ${corner.length}; r=0 -> centre only`);
}

// H2 — the Bresenham loop equals the rounding rule for every offset in [-12, 12]^2
{
  const rule = (x0, y0, x1, y1) => {
    const a = Math.abs(x1 - x0);
    const b = Math.abs(y1 - y0);
    const sx = x1 >= x0 ? 1 : -1;
    const sy = y1 >= y0 ? 1 : -1;
    const out = [];
    if (a >= b) {
      for (let i = 0; i <= a; i++) out.push(x0 + sx * i, y0 + sy * (a ? Math.floor((2 * i * b + a) / (2 * a)) : 0));
    } else {
      for (let j = 0; j <= b; j++) out.push(x0 + sx * Math.floor((2 * j * a + b) / (2 * b)), y0 + sy * j);
    }
    return out;
  };
  let bad = 0;
  let n = 0;
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      n += 1;
      const got = B.linePixels(20, 20, 20 + dx, 20 + dy);
      if (!sameList(got, rule(20, 20, 20 + dx, 20 + dy))) bad += 1;
    }
  }
  check('H2', bad === 0, `linePixels vs the closed-form rounding rule on ${n} segments, ends included` +
    (bad ? ` — ${bad} differ` : ''));
}

// A3 / A4 — every scripted stroke changes exactly the oracle's pixels and nothing else
const working = B.copySlices(source);
const history = B.createHistory();
{
  const tally = { add: { pass: 0, of: 0, px: 0 }, erase: { pass: 0, of: 0, px: 0 } };
  const problems = [];
  for (const op of ops.ops) {
    const before = working.map((b) => Uint8Array.from(b));
    const exp = op.expected;
    const t = { zoom: op.transform.zoom, panX: op.transform.pan_x, panY: op.transform.pan_y };
    const st = B.beginStroke(op.slice, op.tool, op.radius);
    const centres = op.samples.map(([u, v]) => B.strokeSample(st, working[op.slice], u, v, t, NX, NY));
    const res = B.endStroke(history, st, working[op.slice], B.END_RELEASE);
    const diff = [];
    const otherSlices = [];
    for (let z = 0; z < NZ; z++) {
      for (let i = 0; i < NX * NY; i++) {
        if (working[z][i] === before[z][i]) continue;
        if (z === op.slice) diff.push(i); else otherSlices.push(z);
      }
    }
    const value = op.tool === 'add' ? 1 : 0;
    const why = [];
    if (JSON.stringify(centres) !== JSON.stringify(exp.centre_pixels)) why.push(`centres ${JSON.stringify(centres)}`);
    if (!sameList(diff, exp.changed_indices)) why.push(`changed ${diff.length} px, oracle ${exp.changed_indices.length}`);
    if (!sameList(sorted(res.entry.indices), exp.changed_indices)) why.push('undo step indices differ from the oracle');
    if (res.changed !== exp.changed) why.push(`reported ${res.changed} changed`);
    if (!diff.every((i) => working[op.slice][i] === value && before[op.slice][i] !== value)) why.push('a changed pixel has the wrong value');
    if (otherSlices.length) why.push(`other slices written: ${[...new Set(otherSlices)].join(', ')}`);
    if (sha(before[op.slice]) !== exp.slice_sha256_before) why.push('before-hash differs');
    if (sha(working[op.slice]) !== exp.slice_sha256_after) why.push('slice hash differs');
    if (volSha(working) !== exp.volume_sha256_after) why.push('volume hash differs');
    const k = tally[op.tool];
    k.of += 1;
    k.px += diff.length;
    if (why.length) problems.push(`${op.id}: ${why.join('; ')}`); else k.pass += 1;
  }
  const detail = (tool) => `${tally[tool].pass}/${tally[tool].of} ${tool.toUpperCase()} strokes change exactly the oracle's ` +
    `${tally[tool].px} px on their slice, nothing else in ${NZ} slices; slice + volume SHA-256 match`;
  const mine = (tool) => problems.filter((p) => ops.ops.find((o) => p.startsWith(o.id)).tool === tool);
  check('A3', tally.add.of > 0 && mine('add').length === 0, detail('add') + (mine('add').length ? ` — ${mine('add').slice(0, 2).join(' | ')}` : ''));
  check('A4', tally.erase.of > 0 && mine('erase').length === 0, detail('erase') + (mine('erase').length ? ` — ${mine('erase').slice(0, 2).join(' | ')}` : ''));
}
const afterScript = hashes(working);

// A5 — each brush case through strokeSample, the entry point a touch sample uses
for (const radius of ops.a5.radii) {
  const expected = brush.cases.map((c, k) => {
    const p = c.expected_source_pixel;
    const fromCases = p ? [p[1] * NX + p[0]] : [];
    if (radius === 0 && !sameList(fromCases, ops.a5.cases[k].painted_r0)) throw new Error(`${c.id}: brush_ops painted_r0 disagrees with brush_cases`);
    return radius === 0 ? fromCases : ops.a5.cases[k][`painted_r${radius}`];
  });
  const res = B.runA5(brush.cases, radius, expected, NX, NY);
  // Recompute the verdict from the per-case records instead of trusting res.pass.
  let hits = 0;
  const dist = {};
  res.cases.forEach(([cx, cy, n, h12], k) => {
    const c = brush.cases[k];
    const blank = new Uint8Array(NX * NY);
    for (const i of expected[k]) blank[i] = 1;
    if (n === expected[k].length && h12 === sha(blank).slice(0, 12)) hits += 1;
    const p = c.expected_source_pixel;
    const key = p && cx !== null ? `(${cx - p[0]},${cy - p[1]})` : (!p && cx === null ? 'outside->nothing' : 'MISMATCH');
    dist[key] = (dist[key] || 0) + 1;
  });
  const shown = Object.entries(dist).map(([key, count]) => `${key} x${count}`).join(', ');
  check(`A5r${radius}`, hits === brush.cases.length && res.pass === hits && res.errors.length === 0,
    `r=${radius}: ${hits}/${brush.cases.length} cases paint exactly the expected set; (dx, dy) distribution: ${shown}`);
}

// A6 — undo walks back through every stroke to the state before it
{
  const bad = [];
  let k = 0;
  while (history.undo.length) {
    const op = ops.ops[history.undo.length - 1];
    const e = B.undo(history, working);
    const w = ops.undo_walk[k];
    k += 1;
    const h = sha(working[e.slice]);
    if (w.undo_of !== op.id || h !== w.slice_sha256 || h !== op.expected.slice_sha256_before || volSha(working) !== w.volume_sha256) bad.push(op.id);
  }
  const back = sameList(hashes(working), ops.after_undo_all_slice_sha256) && sameList(hashes(working), sourceHashes);
  check('A6', bad.length === 0 && k === ops.ops.length && back,
    `${k} undos, each restores the slice and volume hash from before its stroke; undo-all = source on ${NZ} slices` +
    (bad.length ? ` — wrong at ${bad.join(', ')}` : ''));
}

// A7 — redo walks forward to the state after each stroke
{
  const bad = [];
  let k = 0;
  while (history.redo.length) {
    const op = ops.ops[history.undo.length];
    const e = B.redo(history, working);
    const w = ops.redo_walk[k];
    k += 1;
    const h = sha(working[e.slice]);
    if (w.redo_of !== op.id || h !== w.slice_sha256 || h !== op.expected.slice_sha256_after || volSha(working) !== w.volume_sha256) bad.push(op.id);
  }
  const fwd = sameList(hashes(working), ops.after_redo_all_slice_sha256) && sameList(hashes(working), afterScript);
  check('A7', bad.length === 0 && k === ops.ops.length && fwd,
    `${k} redos, each reaches the slice and volume hash after its stroke; redo-all = state after the script` +
    (bad.length ? ` — wrong at ${bad.join(', ')}` : ''));
}

// SEP / TRM — a stroke that ends with a second finger, or is terminated by the
// system, is rolled back exactly: every hash and both history stacks unchanged
for (const [id, end] of [['SEP', B.END_SECOND_FINGER], ['TRM', B.END_TERMINATED]]) {
  B.undo(history, working);
  B.undo(history, working);                           // leave something on both stacks
  const hBefore = hashes(working);
  const depth = [history.undo.length, history.redo.length];
  const st = B.beginStroke(8, 'erase', 5);
  const t = { zoom: 16, panX: 8, panY: 8 };
  for (const [sx, sy] of [[20.5, 20.5], [32.5, 32.5], [44.5, 30.5]]) B.strokeSample(st, working[8], 8 + sx * 16, 8 + sy * 16, t, NX, NY);
  const painted = sha(working[8]) !== hBefore[8];
  const res = B.endStroke(history, st, working[8], end);
  const same = sameList(hashes(working), hBefore);
  const depthSame = history.undo.length === depth[0] && history.redo.length === depth[1];
  B.redo(history, working);
  B.redo(history, working);
  const redoIntact = sameList(hashes(working), afterScript);
  check(id, painted && same && depthSame && !res.committed && res.end === end && res.changed > 0 && redoIntact,
    `end "${end}": ${res.changed} px painted mid-stroke, then restored; ${NZ} slice hashes and ` +
    `undo/redo depth ${depth[0]}/${depth[1]} unchanged; nothing committed; redo still reaches the script's end`);
}

// NEW — a newly committed stroke clears redo: undone strokes cannot come back after it
{
  B.undo(history, working);
  B.undo(history, working);                           // undo 12, redo 2
  const hBefore = hashes(working);
  const st = B.beginStroke(3, 'add', 1);
  B.strokeSample(st, working[3], 8 + 5.5 * 16, 8 + 5.5 * 16, { zoom: 16, panX: 8, panY: 8 }, NX, NY);
  const res = B.endStroke(history, st, working[3], B.END_RELEASE);
  const cleared = history.redo.length === 0 && history.undo.length === 13;
  const nothingToRedo = B.redo(history, working) === null;
  B.undo(history, working);                           // takes back the new stroke only
  const back = sameList(hashes(working), hBefore) && history.redo.length === 1;
  check('NEW', res.committed && res.changed > 0 && cleared && nothingToRedo && back,
    `a stroke committed with 2 steps on the redo stack empties it; undoing that stroke returns to the ` +
    `previous hashes with only itself to redo`);
}

// RST — reset restores every slice from the source and clears history (both stacks non-empty here)
{
  const stacks = [history.undo.length, history.redo.length];
  B.resetWorking(history, working, source);
  const ok = stacks[0] > 0 && stacks[1] > 0 &&
    sameList(hashes(working), ops.after_reset_slice_sha256) && sameList(hashes(working), sourceHashes) &&
    history.undo.length === 0 && history.redo.length === 0 && sameList(hashes(source), mask.slice_sha256);
  check('RST', ok, `reset from undo/redo depth ${stacks[0]}/${stacks[1]}: ${NZ}/${NZ} slices equal the source hashes, ` +
    `both stacks emptied; source mask bytes never written`);
}

// OPS — the device hook "A3–A7 tự động" emits exactly what the oracle expects
{
  const recs = B.runOpsScript(ops, source, NX, NY);
  const want = [
    ...ops.ops.map((o) => ({ op: o.id, hash: o.expected.slice_sha256_after, changed: o.expected.changed, volume: o.expected.volume_sha256_after })),
    ...ops.undo_walk.map((w) => ({ op: `undo:${w.undo_of}`, hash: w.slice_sha256, changed: w.changed, volume: w.volume_sha256 })),
    { op: 'undo-all', hashes: ops.after_undo_all_slice_sha256 },
    ...ops.redo_walk.map((w) => ({ op: `redo:${w.redo_of}`, hash: w.slice_sha256, changed: w.changed, volume: w.volume_sha256 })),
    { op: 'redo-all', hashes: ops.after_redo_all_slice_sha256 },
    { op: 'reset', hashes: ops.after_reset_slice_sha256 },
  ];
  const bad = [];
  want.forEach((w, k) => {
    const r = recs[k];
    const ok = r && r.step === k + 1 && r.op === w.op && (w.hashes ? sameList(r.hashes, w.hashes)
      : r.hash === w.hash && r.changed === w.changed && r.volume === w.volume);
    if (!ok) bad.push(w.op);
  });
  const last = recs[recs.length - 1];
  check('OPS', bad.length === 0 && recs.length === want.length && last.undo_depth === 0 && last.redo_depth === 0 &&
    sameList(hashes(source), mask.slice_sha256),
    `runOpsScript (the on-device hook): ${recs.length} records match the oracle, scratch buffer only` +
    (bad.length ? ` — wrong at ${bad.slice(0, 4).join(', ')}` : ''));
}

console.log(`\n  ${failures === 0 ? 'all passed' : `${failures} FAILED`} — offline logic only; A3–A7 themselves are measured on the device.\n`);
process.exit(failures ? 1 : 0);
