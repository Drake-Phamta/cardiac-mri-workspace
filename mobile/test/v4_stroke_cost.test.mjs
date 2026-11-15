// node --test mobile/test/  - SCR-06 stroke cost (NFR-PERF-003): what a touch move costs must not depend on how many slices were
// visited. On the phone (device session 2026-11-15, r6) a stroke answered in 39 ms on the slice the screen opened on, in about
// 113 ms after 3 slice steps and in about 204 ms after 6, because every touch move asked each open slice for its state and that
// compares the whole slice (brush.mjs maskState). The state of a slice is now kept until its bytes are written; these checks hold
// the count of whole-slice comparisons (totals.scans), the answer against a brute-force comparison after every kind of write, and
// the time of a move on a real-size slice at 0 and at 10 slice steps.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntime } from '../src/api/runtime.mjs';
import { resolveConfig } from '../src/config.mjs';
import { fitTransform } from '../src/lib/viewMath.mjs';
import { createBrushSession, MASK_STATE, SOURCE_KIND, TOOL, END_RELEASE, END_SECOND_FINGER, END_TERMINATED } from '../src/screens/v4-review/brush.mjs';
import { createReviewScreen, TOOL as SCREEN_TOOL } from '../src/screens/v4-review/reviewScreen.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { drive } from './_v4_drive.mjs';

const ID = { zoom: 1, panX: 0, panY: 0 }; // one screen unit is one source pixel
const SOURCE = { maskId: 'MASK_RAW_TEST', kind: SOURCE_KIND.RAW_PREDICTION, variant: 'RAW' };

// A blob-shaped source: deterministic, binary.
function blob(nx, ny, cx, cy, r) {
  const b = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) b[y * nx + x] = 1;
  return b;
}

function openSession(nx, ny, slices) {
  const s = createBrushSession({ nx, ny, source: SOURCE });
  for (let z = 0; z < slices; z += 1) s.loadSlice(z, blob(nx, ny, nx / 2 + z, ny / 2, ny / 5));
  return s;
}

// One stroke on slice 0: a stamp, then `moves` moves, asking for the state after each as the screen does. Returns the whole-slice
// comparisons it took.
function strokeScans(s, moves) {
  const before = s.state().totals.scans;
  s.beginStroke(0);
  s.sample(2, 2, ID);
  s.state();
  for (let k = 1; k <= moves; k += 1) {
    s.sample(2 + k, 2 + (k % 3), ID);
    s.state();
  }
  s.endStroke(END_RELEASE);
  s.state();
  return s.state().totals.scans - before;
}

test('SC1 a touch move compares the slice under the finger, however many slices are open', () => {
  const moves = 12;
  const few = strokeScans(openSession(48, 48, 1), moves);
  const many = strokeScans(openSession(48, 48, 25), moves);
  // One comparison per move that wrote a pixel (the slice under the finger), plus a stamp and the end; none for the 24 others.
  assert.ok(few <= moves + 3, `one slice open: ${few} comparisons for ${moves} moves`);
  assert.equal(many, few, `25 slices open: ${many} comparisons, one slice open: ${few}`);
});

test('SC2 asking again without a write compares nothing, and what a write changes is compared again', () => {
  const s = openSession(48, 48, 6);
  s.state();
  const settled = s.state().totals.scans;
  for (let i = 0; i < 20; i += 1) s.state();
  assert.equal(s.state().totals.scans, settled, 'twenty more asks, no comparison');
  s.beginStroke(3);
  s.sample(5, 5, ID);
  assert.equal(s.maskState(3), MASK_STATE.UNSAVED, 'the stamp is seen at once');
  assert.deepEqual([...s.state().unsavedSlices], [3]);
  // a stamp that changes nothing (adding where the mask already is) writes nothing, so it costs no comparison
  s.endStroke(END_RELEASE);
  const before = s.state().totals.scans;
  s.setTool(TOOL.ADD);
  s.beginStroke(3);
  s.sample(24 + 3, 24, ID); // inside the blob of slice 3
  s.endStroke(END_RELEASE);
  s.state();
  assert.equal(s.state().totals.scans, before, 'a stamp on pixels that already hold the value is not compared');
});

// The brute force the cache must agree with, read through the session's own read-only views.
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function truth(s) {
  const loaded = [...s.state().loadedSlices];
  const stateOf = (z) => {
    const saved = s.savedSlice(z);
    if (saved) return same(s.workingSlice(z), saved) ? MASK_STATE.SAVED : MASK_STATE.UNSAVED;
    return same(s.workingSlice(z), s.sourceSlice(z)) ? MASK_STATE.SOURCE : MASK_STATE.UNSAVED;
  };
  const per = new Map(loaded.map((z) => [z, stateOf(z)]));
  const unsaved = loaded.filter((z) => per.get(z) === MASK_STATE.UNSAVED);
  let overall = MASK_STATE.SOURCE;
  if (unsaved.length) overall = MASK_STATE.UNSAVED;
  else if (s.state().lastSave || loaded.some((z) => s.savedSlice(z))) overall = MASK_STATE.SAVED;
  return { per, unsaved, overall };
}
function agrees(s, what) {
  const t = truth(s);
  for (const [z, want] of t.per) assert.equal(s.maskState(z), want, `${what}: slice ${z}`);
  assert.deepEqual([...s.state().unsavedSlices], t.unsaved, `${what}: unsaved slices`);
  assert.equal(s.state().maskState, t.overall, `${what}: overall state`);
}

test('SC3 after any run of strokes, rollbacks, undo, redo, reset, cancel and saves, the kept state is what a full comparison gives', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  const N = 24;
  const s = openSession(N, N, 5);
  let version = 0;
  const paint = (z, end) => {
    s.setTool(rand(2) ? TOOL.ADD : TOOL.ERASE);
    s.setRadius([0, 1, 2][rand(3)]);
    s.beginStroke(z);
    for (let k = 0; k < 1 + rand(5); k += 1) {
      s.sample(rand(N), rand(N), ID);
      agrees(s, `mid-stroke on ${z}`);
    }
    s.endStroke(end);
  };
  for (let step = 0; step < 220; step += 1) {
    const op = rand(11);
    const z = rand(5);
    if (op <= 3) paint(z, END_RELEASE);
    else if (op === 4) paint(z, END_SECOND_FINGER);
    else if (op === 5) paint(z, END_TERMINATED);
    else if (op === 6) s.undo();
    else if (op === 7) s.redo();
    else if (op === 8 && rand(4) === 0) s.reset();
    else if (op === 9 && rand(3) === 0) s.cancel();
    else if (op === 10) {
      const prepared = s.prepareSave();
      // a stroke can begin while the save is in flight, so SAVED must mean what was sent
      if (rand(2)) { s.beginStroke(z); s.sample(rand(N), rand(N), ID); s.endStroke(END_RELEASE); }
      version += 1;
      s.markSaved(prepared, { reviewedMaskId: `RM_${version}` });
    }
    agrees(s, `after step ${step} (op ${op})`);
  }
  assert.ok(version > 3, 'the run did save a few times');
});

// A real-size slice through the controller, in fixture mode (the synthetic stand-in): visit slices, then paint.
const W = 1080;
const H = 1440;
const fit = fitTransform(W, H, 576, 576);
const at = (x, y) => ({ x: fit.panX + (x + 0.5) * fit.zoom, y: fit.panY + (y + 0.5) * fit.zoom });

async function strokesAfterSteps(steps, { strokes = 6, moves = 16 } = {}) {
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson: readContractJson(), bundleJson: generatedBundleJson() });
  const ctl = createReviewScreen({ runtime, params: { runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW', sliceIndex: 44 } });
  ctl.setViewport(W, H);
  await ctl.start();
  await drive(ctl, runtime.client);
  for (let i = 0; i < steps; i += 1) await ctl.prevSlice();
  ctl.setTool(SCREEN_TOOL.ADD);
  ctl.setRadius(2);
  const open = ctl.getState().brush.loadedSlices.length;
  const scansBefore = ctl.getState().brush.totals.scans;
  const per = [];
  let count = 0;
  for (let s = 0; s < strokes; s += 1) {
    const y0 = 300 + s * 4;
    ctl.touch.grant([at(200, y0)]);
    ctl.getState();
    for (let k = 0; k < moves; k += 1) {
      const t0 = performance.now();
      ctl.touch.move([at(200 + 10 * (k + 1), y0 + k)]); // one move and the state the render then reads
      ctl.getState();
      per.push(performance.now() - t0);
      count += 1;
    }
    ctl.touch.release();
    ctl.getState();
  }
  per.sort((a, b) => a - b);
  return { open, moves: count, scans: ctl.getState().brush.totals.scans - scansBefore, median: per[Math.floor(per.length / 2)] };
}

test('SC4 on a 576 x 576 slice, a stroke after 20 slice steps does the same comparisons as one after none', async () => {
  const none = await strokesAfterSteps(0);
  const ten = await strokesAfterSteps(20);
  assert.equal(none.open, 1);
  assert.equal(ten.open, 21, 'twenty steps opened twenty more slices');
  // One comparison per move that wrote a pixel, plus one at each stroke's start and end. (The two slices hold different masks, so
  // the number of moves that wrote nothing differs a little; before the fix it was about 40 comparisons a move after 20 steps.)
  assert.ok(none.scans <= none.moves + 6 * 3, `none: ${none.scans} comparisons for ${none.moves} moves`);
  assert.ok(ten.scans <= ten.moves + 6 * 3, `20 steps: ${ten.scans} comparisons for ${ten.moves} moves`);
});

test('SC5 on a 576 x 576 slice, a touch move takes about as long after 20 slice steps as after none', async () => {
  // Before the fix a move took 4 to 15 times as long after 20 steps in node (the JIT decides how fast one comparison runs); kept
  // state makes it 1. A loose bound and the best of three tries keep a busy machine from failing it.
  let best = Infinity;
  let line = '';
  for (let attempt = 0; attempt < 3 && best > 2; attempt += 1) {
    const none = await strokesAfterSteps(0);
    const ten = await strokesAfterSteps(20);
    const ratio = ten.median / none.median;
    if (ratio < best) { best = ratio; line = `${ten.median.toFixed(2)} ms after 20 steps, ${none.median.toFixed(2)} ms after none`; }
  }
  assert.ok(best <= 2, `a move took ${best.toFixed(1)} times as long after 20 slice steps (${line})`);
});
