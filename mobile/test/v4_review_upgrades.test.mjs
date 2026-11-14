// node --test mobile/test/  - SCR-06 upgrades in the controller (src/screens/v4-review/reviewScreen.mjs): the source
// outline, "hold Source" and the brush ring. Fixture runtime over the GENERATED bundle; `drive` plays the screen's
// readers.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fitTransform } from '../src/lib/viewMath.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import {
  createReviewScreen, MASK_STATE, MODE, TOOL, syntheticSourceSlice,
} from '../src/screens/v4-review/reviewScreen.mjs';
import { brushRing, brushSizePx, footprint, RADII } from '../src/screens/v4-review/brush.mjs';
import { outlinePath } from '../src/screens/v4-review/outline.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { drive } from './_v4_drive.mjs';

const contractJson = readContractJson();
const bundle = generatedBundleJson();
const W = 1080;
const H = 1440;

function fixtureRuntime() {
  return createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: bundle });
}

async function readyScreen(params = { runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW' }, runtime = fixtureRuntime()) {
  const ctl = createReviewScreen({ runtime, params });
  ctl.setViewport(W, H);
  await ctl.start();
  await drive(ctl, runtime.client);
  return ctl;
}

// Canvas point at the centre of source pixel (x, y) under the fit transform.
function at(x, y) {
  const t = fitTransform(W, H, 576, 576);
  return { x: t.panX + (x + 0.5) * t.zoom, y: t.panY + (y + 0.5) * t.zoom };
}

test('RU1 the source is also given as its edge, the same slice the fill is made from', async () => {
  const ctl = await readyScreen();
  const s = ctl.getState();
  assert.equal(s.layers.sourceOutline, outlinePath(syntheticSourceSlice(576, 576, 44, 88), 576, 576));
  assert.ok(s.layers.sourceOutline.length > 0);
  assert.equal(s.sourceOnly, false, 'the edits are shown unless Source is held');
  await ctl.nextSlice();
  assert.equal(ctl.getState().layers.sourceOutline, outlinePath(syntheticSourceSlice(576, 576, 45, 88), 576, 576),
    'each slice has its own edge');
});

test('RU2 holding Source shows the source alone and paints nothing; releasing brings the edits back', async () => {
  const ctl = await readyScreen();
  ctl.setTool(TOOL.ADD);
  ctl.touch.grant([at(100, 100)]);
  ctl.touch.release();
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.UNSAVED, 'an edit to compare against');
  const unsaved = ctl.getState().layers.unsaved.length;

  ctl.holdSource(true);
  let s = ctl.getState();
  assert.equal(s.sourceOnly, true);
  ctl.touch.grant([at(200, 200)]);
  ctl.touch.release();
  s = ctl.getState();
  assert.equal(s.layers.unsaved.length, unsaved, 'a touch while Source is held paints nothing');
  assert.equal(s.lastStroke.slice, 44);
  assert.equal(s.brush.undoDepth, 1, 'only the earlier stroke is in the history');

  ctl.holdSource(false);
  assert.equal(ctl.getState().sourceOnly, false);
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.UNSAVED, 'the edit was kept all along');
});

test('RU4 the brush size reads in pixels across, and the ring is as wide as the stamp with every stamped pixel inside', () => {
  assert.deepEqual(RADII.map(brushSizePx), [1, 3, 5, 7, 11]);
  assert.deepEqual({ ...brushRing([310, 262], 2) }, { x: 310, y: 262, cx: 310.5, cy: 262.5, r: 2.5 });
  assert.equal(brushRing(null, 2), null, 'no pixel under the finger, no ring');
  for (const radius of RADII) {
    const ring = brushRing([20, 20], radius);
    const stamp = footprint(20, 20, radius, 41, 41).map((i) => [i % 41, Math.floor(i / 41)]);
    const xs = stamp.map(([x]) => x);
    assert.equal(Math.max(...xs) - Math.min(...xs) + 1, brushSizePx(radius), `radius ${radius}: the stamp is ${brushSizePx(radius)} px across`);
    assert.equal(2 * ring.r, brushSizePx(radius), 'and so is the ring');
    for (const [x, y] of stamp) {
      assert.ok(Math.hypot(x + 0.5 - ring.cx, y + 0.5 - ring.cy) <= ring.r, `radius ${radius}: pixel (${x}, ${y}) inside the ring`);
    }
  }
});

test('RU5 the ring follows the painting finger, gives its pixel, and goes when the finger lifts', async () => {
  const ctl = await readyScreen();
  ctl.setRadius(3);
  assert.equal(ctl.getState().ring, null, 'no finger, no ring');
  assert.equal(ctl.getState().brushPx, 7);
  ctl.touch.grant([at(300, 280)]);
  assert.deepEqual({ ...ctl.getState().ring }, { x: 300, y: 280, cx: 300.5, cy: 280.5, r: 3.5 });
  ctl.touch.move([at(305, 281)]);
  assert.equal(ctl.getState().ring.x, 305);
  ctl.touch.move([{ x: -50, y: -50 }]);
  assert.equal(ctl.getState().ring, null, 'off the image: nothing is painted and no ring is drawn');
  ctl.touch.release();
  assert.equal(ctl.getState().ring, null);
  ctl.setMode(MODE.PAN);
  ctl.touch.grant([at(300, 280)]);
  assert.equal(ctl.getState().ring, null, 'panning shows no ring');
  ctl.touch.release();
});

test('RU3 pressing Source while a stroke is under way rolls the stroke back', async () => {
  const ctl = await readyScreen();
  ctl.touch.grant([at(300, 300)]);
  ctl.touch.move([at(310, 300)]);
  assert.equal(ctl.getState().brush.strokeActive, true);
  ctl.holdSource(true);
  const s = ctl.getState();
  assert.equal(s.brush.strokeActive, false);
  assert.equal(s.lastStroke.committed, false, 'rolled back, not committed');
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE);
  ctl.touch.release();
  ctl.holdSource(false);
  assert.equal(ctl.getState().brush.undoDepth, 0);
});
