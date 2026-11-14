// node --test mobile/test/  - SCR-06 upgrades in the controller (src/screens/v4-review/reviewScreen.mjs): the source
// outline and "hold Source". Fixture runtime over the GENERATED bundle; `drive` plays the screen's readers.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fitTransform } from '../src/lib/viewMath.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import { createReviewScreen, MASK_STATE, TOOL, syntheticSourceSlice } from '../src/screens/v4-review/reviewScreen.mjs';
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
