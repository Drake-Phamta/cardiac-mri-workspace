// node --test mobile/test/  - SCR-06 upgrades in the controller (src/screens/v4-review/reviewScreen.mjs): the source
// outline, "hold Source", the brush ring, the flag reason and the review timeline. Fixture runtime over the
// GENERATED bundle; `drive` plays the screen's readers, and the tests hand the timeline read in themselves.
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
import { drive, patchedClient } from './_v4_drive.mjs';

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

// Records the endpoints and bodies a screen sends, over a client whose answers may be rewritten.
function recording(runtime, patches = {}) {
  const sent = [];
  const base = patchedClient(runtime.client, patches);
  const client = { ...base, call: (id, p, o) => { sent.push({ id, body: o && o.body }); return base.call(id, p, o); } };
  return { sent, runtime: { ...runtime, client } };
}

test('RU6 a flag needs a reason: none, spaces or too long sends nothing; a reason is sent with the change', async () => {
  const { sent, runtime } = recording(fixtureRuntime());
  const ctl = await readyScreen(undefined, runtime);
  const before = sent.length;
  let s = await ctl.setStatus('FLAGGED');
  assert.equal(s.notice.code, 'REASON_REQUIRED');
  assert.equal(sent.length, before, 'refused on the phone: nothing sent');

  assert.equal(ctl.getState().flag, null, 'the reason box is closed until Flag is pressed');
  ctl.startFlag();
  assert.deepEqual({ text: ctl.getState().flag.text, canSubmit: ctl.getState().flag.canSubmit }, { text: '', canSubmit: false });
  ctl.setFlagReason('   ');
  assert.equal(ctl.getState().flag.canSubmit, false, 'spaces are no reason');
  ctl.setFlagReason('x'.repeat(501));
  assert.equal(ctl.getState().flag.canSubmit, false, 'over the limit');
  await ctl.submitFlag();
  assert.equal(sent.length, before);
  ctl.setFlagReason('Checked with Dr Smith');
  s = ctl.getState();
  assert.deepEqual([...s.flag.check.warnings], ['looks like a person\'s name (a title before a name)']);
  assert.equal(s.flag.canSubmit, true, 'a warning does not block');

  ctl.setFlagReason('  Misses the septal wall on this slice.  ');
  s = await ctl.submitFlag();
  const patch = sent.filter((c) => c.id === 'review_patch').pop();
  assert.deepEqual(patch.body, { status: 'FLAGGED', expected_revision: 1, reason: 'Misses the septal wall on this slice.' });
  assert.equal(s.review.status, 'FLAGGED');
  assert.equal(s.flag, null, 'the box closes once the flag went through');
  await ctl.setStatus('ACCEPTED');
  assert.ok(!sent.some((c) => c.id === 'review_patch' && c.body.status === 'ACCEPTED'), 'FLAGGED -> ACCEPTED is not a transition');
});

test('RU7 Accept sends no reason field; a refused flag keeps the typed reason', async () => {
  const { sent, runtime } = recording(fixtureRuntime());
  const ctl = await readyScreen(undefined, runtime);
  await ctl.setStatus('ACCEPTED');
  assert.deepEqual(sent.filter((c) => c.id === 'review_patch').pop().body, { status: 'ACCEPTED', expected_revision: 1 });
  ctl.startFlag();
  ctl.setFlagReason('Leaks into the atrium.');
  const s = await ctl.submitFlag();
  assert.equal(s.notice.code, 'CONFIRMATION_REQUIRED', 'leaving ACCEPTED still asks first');
  assert.equal(s.flag.text, 'Leaks into the atrium.', 'the reason is still there to confirm');
  const confirmed = await ctl.submitFlag({ confirmed: true });
  assert.equal(confirmed.review.status, 'FLAGGED');
});

test('RU8 the timeline is read only while open, again after each write, and reads newest first', async () => {
  const { sent, runtime } = recording(fixtureRuntime(), {
    // The fixture answers every write with revision 1; a real server moves it on, so this answer does too.
    review_patch: (v) => ({ ...v, data: { ...v.data, revision: 2 } }),
  });
  const ctl = await readyScreen(undefined, runtime);
  assert.equal(ctl.getState().wants.history, null, 'closed: nothing to read');
  ctl.toggleHistory();
  const want = ctl.getState().wants.history;
  assert.deepEqual({ ...want }, { reviewId: ctl.getState().review.reviewId, revision: 1 });
  assert.equal(ctl.getState().history.current, false, 'loading until the answer is handed in');
  let s = await ctl.provideHistory(1, await runtime.client.call('review_history_list', { review_id: want.reviewId }));
  assert.equal(s.wants.history, null, 'read once for this revision');
  assert.deepEqual(s.history.lines.map((l) => l.what), [
    'Saved correction REVIEWED_MASK_0043_R1, slice 44', 'Flagged (was not reviewed)', 'Review opened']);
  ctl.startFlag();
  ctl.setFlagReason('Boundary misses the wall.');
  s = await ctl.submitFlag();
  assert.equal(s.wants.history.revision, 2, 'a write moved the revision: the timeline is read again');
  assert.equal(s.history.current, false);
  await ctl.provideHistory(1, s.history.view);
  assert.equal(ctl.getState().wants.history.revision, 2, 'an answer for an older revision is not taken');
  ctl.toggleHistory();
  assert.equal(ctl.getState().wants.history, null, 'closed again: nothing is read');
  assert.equal(sent.filter((c) => c.id === 'review_history_list').length, 1, 'only the test read it: the controller never fetches');
});

test('RU9 a failed or foreign history answer is a state of the panel, never the screen', async () => {
  const fx = fixtureRuntime();
  fx.fixtureScenarios.set('review_history_list', 'error_case');
  const ctl = await readyScreen(undefined, fx);
  ctl.toggleHistory();
  let s = await ctl.provideHistory(1, await fx.client.call('review_history_list', { review_id: ctl.getState().review.reviewId }));
  assert.equal(s.history.view.state !== 'SUCCESS', true);
  assert.equal(s.phase, 'READY', 'the review stays usable');
  assert.deepEqual([...s.history.lines], []);
  ctl.retryHistory();
  assert.equal(ctl.getState().wants.history.revision, 1, 'Retry asks again');

  // Live mode checks the answer names the review that was asked for (fixture ids are placeholders).
  const live = { ...fixtureRuntime(), mode: 'live' };
  const run = bundle.scenarios.analysis_run_get.default.response.data;
  const lctl = await readyScreen({ runId: run.run_id, caseId: run.case_id, variant: 'RAW' }, live);
  lctl.toggleHistory();
  const view = await live.client.call('review_history_list', { review_id: lctl.getState().review.reviewId });
  s = await lctl.provideHistory(1, { ...view, data: { ...view.data, review_id: 'REVIEW_OF_SOMEONE_ELSE' } });
  assert.equal(s.history.view.error.code, 'CONTRACT_DRIFT');
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
