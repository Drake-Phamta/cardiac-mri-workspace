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
import { reviewDetailSections } from '../src/screens/v4-review/reviewDetails.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { drive, patchedClient } from './_v4_drive.mjs';

const contractJson = readContractJson();
const bundle = generatedBundleJson();
const RUN = bundle.scenarios.analysis_run_get.default.response.data;
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

// Canvas point at the centre of source pixel (x, y) under the transform the screen holds now (zoomed or not).
function atNow(ctl, x, y) {
  const t = ctl.getState().transform;
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
    'Saved correction, slice 45', 'Flagged (was not reviewed)', 'Review opened']);
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

test('RU10 PR-FIND-01: the run decides the experiment a finding made from the review names', async () => {
  const ctl = await readyScreen();
  assert.equal(ctl.getState().target.experimentId, RUN.experiment_id, 'the run answered with its experiment');
  assert.ok(RUN.experiment_id, 'the generated run names one');

  // a route that carries an experiment is the fallback when the run does not say
  const runtime = fixtureRuntime();
  const bare = { ...runtime.client, call: async (id, p, o) => {
    const view = await runtime.client.call(id, p, o);
    return id === 'analysis_run_get' && view.data ? { ...view, data: { ...view.data, experiment_id: null } } : view;
  } };
  const ctl2 = createReviewScreen({ runtime: { ...runtime, client: bare }, params: { runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW', experimentId: 'EXP_FROM_ROUTE' } });
  ctl2.setViewport(W, H);
  await ctl2.start();
  await drive(ctl2, bare);
  assert.equal(ctl2.getState().target.experimentId, 'EXP_FROM_ROUTE');
});

test('RU11 B7: Save keeps the zoom and the pan, and leaves no undo step', async () => {
  const ctl = await readyScreen();
  ctl.zoomBy(2);
  const zoomed = ctl.getState().transform;
  assert.ok(zoomed.zoom > fitTransform(W, H, 576, 576).zoom, 'zoomed in');
  ctl.touch.grant([atNow(ctl, 380, 276)]);
  ctl.touch.release();
  assert.equal(ctl.getState().brush.canUndo, true, 'a stroke is an undo step');

  // the notice that appears after Save makes the canvas a little shorter: the screen reports the new size
  const s = await ctl.save();
  assert.equal(s.notice.kind, 'saved');
  ctl.setViewport(W, H - 60);
  const after = ctl.getState().transform;
  assert.deepEqual({ zoom: after.zoom, panX: after.panX, panY: after.panY }, { zoom: zoomed.zoom, panX: zoomed.panX, panY: zoomed.panY },
    'the view is what it was before Save');

  assert.equal(s.brush.canUndo, false, 'the saved stroke is not an undo step any more');
  assert.equal(s.brush.canRedo, false);
  assert.equal(s.brush.undoDepth, 0);
  ctl.undo();
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.SAVED, 'Undo does nothing to the saved slice');

  // a stroke after the save is an undo step again, and undoing it returns to the saved version
  ctl.touch.grant([atNow(ctl, 450, 300)]);
  ctl.touch.release();
  assert.equal(ctl.getState().brush.canUndo, true);
  ctl.undo();
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.SAVED);
});

test('RU12 B7: a canvas that changes size refits a view that was still "fit", and keeps one the user changed', async () => {
  const ctl = await readyScreen();
  ctl.setViewport(W, H - 200);
  const fit = fitTransform(W, H - 200, 576, 576);
  assert.deepEqual({ zoom: ctl.getState().transform.zoom, panX: ctl.getState().transform.panX, panY: ctl.getState().transform.panY },
    { zoom: fit.zoom, panX: fit.panX, panY: fit.panY }, 'still fit: fitted to the new size');

  ctl.zoomBy(2);
  const zoomed = ctl.getState().transform;
  ctl.setViewport(W, H);
  assert.equal(ctl.getState().transform.zoom, zoomed.zoom, 'zoomed by the user: left alone');
  ctl.fitView();
  assert.equal(ctl.getState().transform.zoom, fitTransform(W, H, 576, 576).zoom, 'Fit works as before');
});

test('RU13 the Details sheet holds what the page leaves out: ids, revision, the slice both ways, the full history', async () => {
  const ctl = await readyScreen();
  ctl.toggleHistory();
  const want = ctl.getState().wants.history;
  await ctl.provideHistory(1, await fixtureRuntime().client.call('review_history_list', { review_id: want.reviewId }));
  const sections = reviewDetailSections(ctl.getState());
  const lines = sections.flatMap((x) => [...x.lines]);
  assert.deepEqual(sections.map((x) => x.title), ['This review', 'Where', 'Versions', 'History, in full']);
  assert.ok(lines.includes(`Review ${ctl.getState().review.reviewId}`));
  assert.ok(lines.includes('Status Not reviewed (revision 1)'));
  assert.ok(lines.includes(`Experiment ${RUN.experiment_id}`));
  assert.ok(lines.includes('Slice 45 / 88 · z 44'));
  assert.ok(lines.some((l) => /^Latest version /.test(l) || l === 'No version saved yet'));
  assert.ok(lines.some((l) => /^Revision \d+ · 2026-10-01 09:00 UTC · project-reviewer · Review opened$/.test(l)));
  assert.equal(new Set(lines).size, lines.length, 'no line repeats (the sheet keys its lines by their text)');
});

test('RU14 a message is dismissed by a tap, and a new stroke dismisses a finished one', async () => {
  const ctl = await readyScreen();
  ctl.setRadius(3);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  let s = await ctl.save();
  assert.equal(s.notice.kind, 'saved');
  ctl.touch.grant([at(450, 300)]);
  assert.equal(ctl.getState().notice, null, 'a stroke starts: "saved" does not hang over the new edit');
  ctl.touch.release();

  const other = await readyScreen();
  other.setRadius(3);
  other.touch.grant([at(380, 276)]);
  other.touch.release();
  s = await other.save();
  assert.equal(s.notice.kind, 'saved');
  other.dismissNotice();
  assert.equal(other.getState().notice, null, 'a tap on the message dismisses it');
});

test('RU15 the picture is fitted between the bar above and the panel below, and zooming turns around the middle of that area', async () => {
  const runtime = fixtureRuntime();
  const ctl = createReviewScreen({ runtime, params: { runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW' } });
  ctl.setViewport(W, H, { top: 56, bottom: 137 });
  await ctl.start();
  await drive(ctl, runtime.client);
  const t = ctl.getState().transform;
  const free = H - 56 - 137;
  assert.equal(t.zoom, Math.min(W / 576, free / 576), 'fitted into the free height, not the whole canvas');
  assert.ok(t.panY >= 56 && t.panY + 576 * t.zoom <= H - 137, 'the whole picture is between the bar and the panel');
  assert.ok(Math.abs((t.panY + 288 * t.zoom) - (56 + free / 2)) < 1e-6, 'and centred there');

  const middle = { x: W / 2, y: 56 + free / 2 };
  const under = (tr) => [(middle.x - tr.panX) / tr.zoom, (middle.y - tr.panY) / tr.zoom];
  const before = under(t);
  ctl.zoomBy(2);
  const after = under(ctl.getState().transform);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-6 && Math.abs(before[1] - after[1]) < 1e-6, 'the pixel in the middle of the free area stays there');

  ctl.setViewport(W, H, { top: 56, bottom: 200 }); // the panel grew: a zoomed view is left alone, only its fit changes
  assert.equal(ctl.getState().transform.zoom, t.zoom * 2);
  ctl.fitView();
  assert.equal(ctl.getState().transform.zoom, Math.min(W / 576, (H - 56 - 200) / 576));
});

test('RU16 the saved layer is the same array while the person paints or undoes (it is not scanned on every touch)', async () => {
  const ctl = await readyScreen();
  ctl.setRadius(3);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.move([at(390, 286)]);
  ctl.touch.release();
  await ctl.save();
  const saved = ctl.getState().layers.saved;
  assert.ok(saved.length > 0);
  // a second stroke, drawn in many moves: every state it passes through gives back the same saved array
  ctl.touch.grant([at(450, 300)]);
  for (let i = 1; i <= 12; i += 1) {
    ctl.touch.move([at(450 + i * 3, 300 + i * 2)]);
    assert.equal(ctl.getState().layers.saved, saved, `move ${i}: the saved layer is not rebuilt`);
  }
  ctl.touch.release();
  const s = ctl.getState();
  assert.equal(s.layers.saved, saved);
  assert.ok(s.layers.unsaved.length > 0, 'the new stroke is still drawn as the unsaved layer');
  // undoing the unsaved stroke does not touch the saved layer either
  ctl.undo();
  assert.equal(ctl.getState().layers.saved, saved);
  assert.equal(ctl.getState().layers.unsaved.length, 0);
});
