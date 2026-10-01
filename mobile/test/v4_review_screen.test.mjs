// node --test mobile/test/  - SCR-06 Review / Correction controller (src/verticals/v4/reviewController.mjs)
//
// Fixture runtime over the GENERATED bundle; scenarios are switched with the
// runtime's own override API (the FIXTURE panel's), never a hand-written body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { STATE, RECOVERY, fitTransform } from '../../app/core/index.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { createReviewScreen, PHASE, PIXELS, MODE, TOOL, MASK_STATE, maskRuns } from '../src/verticals/v4/reviewController.mjs';
import { syntheticSourceSlice } from '../src/verticals/v4/syntheticSource.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';

const contractJson = readContractJson();
const RUN = generatedBundleJson().scenarios.analysis_run_get.default.response.data;
const W = 1080;
const H = 1440;

function fixtureRuntime() {
  return createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: generatedBundleJson() });
}

// Records which endpoints a screen called, without changing what they answer.
function recorded(runtime) {
  const calls = [];
  const client = { ...runtime.client, call: (id, p, o) => { calls.push(id); return runtime.client.call(id, p, o); } };
  return { calls, runtime: { ...runtime, client } };
}

async function readyScreen(params = { runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW' }, runtime = fixtureRuntime()) {
  const ctl = createReviewScreen({ runtime, params });
  ctl.setViewport(W, H);
  await ctl.start();
  return ctl;
}

// Canvas point at the centre of source pixel (x, y) under the fit transform.
function at(x, y, nx = 576, ny = 576) {
  const t = fitTransform(W, H, nx, ny);
  return { x: t.panX + (x + 0.5) * t.zoom, y: t.panY + (y + 0.5) * t.zoom };
}
const covers = (runs, x, y) => runs.some((r) => r.y === y && x >= r.x && x < r.x + r.len);

test('RS1 a route without a variant asks for one - nothing is called, nothing defaulted (11 §6)', async () => {
  const { calls, runtime } = recorded(fixtureRuntime());
  const ctl = createReviewScreen({ runtime, params: { runId: 'RUN_0043' } });
  const s = await ctl.start();
  assert.equal(s.phase, PHASE.CHOOSE_VARIANT);
  assert.deepEqual(calls, []);
  const bad = await ctl.chooseVariant('REVIEWED');
  assert.equal(bad.phase, PHASE.CHOOSE_VARIANT, 'only RAW or PROCESSED can scope a review');
});

test('RS2 choosing RAW opens the run, the scoped review and the middle slice, labelled SYNTHETIC in fixture mode', async () => {
  const { calls, runtime } = recorded(fixtureRuntime());
  const ctl = createReviewScreen({ runtime, params: { runId: 'RUN_0043' } });
  ctl.setViewport(W, H);
  await ctl.start();
  const s = await ctl.chooseVariant('RAW');
  assert.equal(s.phase, PHASE.READY);
  assert.deepEqual(calls, ['analysis_run_get', 'case_get', 'review_create', 'reviewed_masks_list']);
  assert.equal(s.target.sourceMaskId, RUN.raw_prediction_artifact_id, 'the source is the run\'s RAW artifact');
  assert.equal(s.review.status, 'NOT_REVIEWED');
  assert.equal(s.slice.index, 44);
  assert.equal(s.slice.total, 88);
  assert.equal(s.slice.pixels.kind, PIXELS.SYNTHETIC);
  assert.equal(s.brush.source.synthetic, true);
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE);
  assert.ok(s.layers.source.length > 0 && s.layers.unsaved.length === 0 && s.layers.saved.length === 0);
  assert.equal(s.canSave, false, 'nothing to save yet');
});

test('RS3 a route that names the variant and slice opens there directly', async () => {
  const ctl = await readyScreen({ runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW', sliceIndex: 40 });
  const s = ctl.getState();
  assert.equal(s.phase, PHASE.READY);
  assert.equal(s.slice.index, 40);
  const want = maskRuns(syntheticSourceSlice(576, 576, 40, 88), 576, 576);
  assert.deepEqual(s.layers.source, want, 'the drawn source is exactly the synthetic slice');
});

test('RS4 one finger paints the source pixel under it (TC-REV-003 at the screen), zero samples lost', async () => {
  const ctl = await readyScreen();
  ctl.setTool(TOOL.ADD);
  ctl.setRadius(0);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.move([at(390, 280)]);
  ctl.touch.move([at(400, 290)]);
  ctl.touch.release();
  const s = ctl.getState();
  assert.equal(s.lastStroke.committed, true);
  assert.equal(s.lastStroke.received, 3);
  assert.equal(s.lastStroke.lost, 0);
  assert.equal(s.slice.maskState, MASK_STATE.UNSAVED);
  for (const [x, y] of [[380, 276], [390, 280], [400, 290]]) assert.ok(covers(s.layers.unsaved, x, y), `(${x}, ${y}) painted`);
  assert.equal(s.canSave, true);
});

test('RS5 a second finger rolls the stroke back and the gesture becomes navigation (A11, 10 §5)', async () => {
  const ctl = await readyScreen();
  const before = ctl.getState().transform;
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.move([at(395, 276)]);
  ctl.touch.fingers([at(395, 276), at(300, 400)]);
  let s = ctl.getState();
  assert.equal(s.lastStroke.committed, false);
  assert.equal(s.lastStroke.end, 'second_finger');
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE, 'nothing was edited');
  // the two fingers spread: a pinch zoom, still no edit
  ctl.touch.move([at(400, 270), at(290, 410)]);
  ctl.touch.release();
  s = ctl.getState();
  assert.ok(s.transform.zoom > before.zoom, 'the pinch zoomed in');
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE);
  assert.equal(s.brush.undoDepth, 0);
});

test('RS6 PAN mode moves the view and never edits; the system ending a stroke rolls it back', async () => {
  const ctl = await readyScreen();
  ctl.setMode(MODE.PAN);
  const t0 = ctl.getState().transform;
  ctl.touch.grant([{ x: 500, y: 700 }]);
  ctl.touch.move([{ x: 560, y: 650 }]);
  ctl.touch.release();
  let s = ctl.getState();
  assert.equal(s.transform.panX - t0.panX, 60);
  assert.equal(s.transform.panY - t0.panY, -50);
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE);
  ctl.setMode(MODE.BRUSH);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.terminate();
  s = ctl.getState();
  assert.equal(s.lastStroke.end, 'terminated');
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE);
});

test('RS7 undo, redo, reset and cancel from the toolbar are exact', async () => {
  const ctl = await readyScreen();
  ctl.setRadius(2);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  const painted = ctl.getState().layers.unsaved;
  ctl.undo();
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.SOURCE);
  ctl.redo();
  assert.deepEqual(ctl.getState().layers.unsaved, painted);
  ctl.reset();
  let s = ctl.getState();
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE);
  assert.equal(s.brush.canUndo || s.brush.canRedo, false);
  ctl.setTool(TOOL.ERASE);
  ctl.touch.grant([at(299, 276)]); // the blob centre
  ctl.touch.release();
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.UNSAVED);
  ctl.cancel();
  s = ctl.getState();
  assert.equal(s.slice.maskState, MASK_STATE.SOURCE, 'cancel before any save goes back to the source');
});

test('RS8 save: a new version, the review CORRECTED, and saved / unsaved drawn as different layers', async () => {
  const ctl = await readyScreen();
  ctl.setRadius(3);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.move([at(390, 286)]);
  ctl.touch.release();
  const versions = ctl.getState().review.reviewedMasks.length;
  let s = await ctl.save();
  assert.equal(s.notice.kind, 'saved', JSON.stringify(s.notice));
  assert.equal(s.review.status, 'CORRECTED');
  assert.equal(s.review.reviewedMasks.length, versions + 1);
  assert.equal(s.slice.maskState, MASK_STATE.SAVED);
  assert.ok(s.layers.saved.length > 0 && s.layers.unsaved.length === 0);
  assert.equal(s.canSave, false);
  // an edit after the save (outside the blob, so it changes pixels) is
  // UNSAVED on top of the saved layer
  ctl.touch.grant([at(450, 300)]);
  ctl.touch.release();
  s = ctl.getState();
  assert.equal(s.slice.maskState, MASK_STATE.UNSAVED);
  assert.ok(s.layers.saved.length > 0 && s.layers.unsaved.length > 0);
});

test('RS9 STALE_REVISION while saving keeps the edits, offers Refresh only, and saves after it', async () => {
  const runtime = fixtureRuntime();
  const ctl = await readyScreen(undefined, runtime);
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  runtime.fixtureScenarios.set('working_mask_put', 'stale_revision');
  let s = await ctl.save();
  assert.equal(s.review.view.state, STATE.STALE_MISMATCH);
  assert.deepEqual([...s.review.view.actions], [RECOVERY.REFRESH]);
  assert.equal(s.slice.maskState, MASK_STATE.UNSAVED, 'the edit is not lost');
  assert.equal(s.canSave, false, 'no resubmit of a stale write');
  runtime.fixtureScenarios.clear();
  s = await ctl.refresh();
  assert.equal(s.review.canWrite, true);
  assert.equal(s.canSave, true);
  s = await ctl.save();
  assert.equal(s.slice.maskState, MASK_STATE.SAVED);
});

test('RS10 review status from the screen: transitions as the model allows, ACCEPTED asks first', async () => {
  const ctl = await readyScreen();
  let s = await ctl.setStatus('ACCEPTED');
  assert.equal(s.review.status, 'ACCEPTED');
  s = await ctl.setStatus('FLAGGED');
  assert.equal(s.notice.code, 'CONFIRMATION_REQUIRED');
  assert.equal(s.review.status, 'ACCEPTED');
  s = await ctl.setStatus('FLAGGED', { confirmed: true });
  assert.equal(s.review.status, 'FLAGGED');
  s = await ctl.setStatus('ACCEPTED');
  assert.equal(s.notice.code, 'INVALID_REVIEW_TRANSITION');
});

test('RS11 a run that has not succeeded blocks the screen with the right state', async () => {
  const running = fixtureRuntime();
  running.fixtureScenarios.set('analysis_run_get', 'run_running');
  const a = await readyScreen(undefined, running);
  assert.equal(a.getState().phase, PHASE.BLOCKED);
  assert.equal(a.getState().blockedView.state, STATE.PROCESSING);
  const failed = fixtureRuntime();
  failed.fixtureScenarios.set('analysis_run_get', 'run_failed');
  const b = await readyScreen(undefined, failed);
  assert.equal(b.getState().blockedView.state, STATE.EMPTY_UNAVAILABLE);
  assert.equal(b.getState().blockedView.reason, 'RUN_NOT_SUCCEEDED');
});

test('RS12 live mode without the PNG decoder says so, keeps the review controls, and never edits', async () => {
  const fx = fixtureRuntime();
  const live = { ...fx, mode: 'live', config: { ...fx.config, apiBaseUrl: 'http://backend.test:8000' } };
  const ctl = await readyScreen(undefined, live);
  const s = ctl.getState();
  assert.equal(s.phase, PHASE.READY);
  assert.equal(s.slice.pixels.kind, PIXELS.UNAVAILABLE);
  assert.equal(s.slice.pixels.reason, 'PNG_DECODER_PENDING');
  assert.equal(s.canEdit, false);
  assert.equal(s.brush.source.synthetic, false, 'live mode never uses the synthetic stand-in');
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  assert.equal(ctl.getState().brush.undoDepth, 0);
  const t = await ctl.setStatus('FLAGGED');
  assert.equal(t.review.status, 'FLAGGED');
});

test('RS14 with unsaved slices SCR-06 does not offer to leave by itself (no leave guard in the shell yet)', async () => {
  const ctl = await readyScreen();
  assert.equal(ctl.getState().canLeave, true, 'nothing to lose yet');
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  let s = ctl.getState();
  assert.equal(s.canLeave, false);
  assert.match(s.leaveBlockedReason, /slice 44/);
  ctl.undo();
  assert.equal(ctl.getState().canLeave, true, 'undone back to the source: nothing to lose');
  ctl.redo();
  s = await ctl.save();
  assert.equal(s.canLeave, true, 'saved: nothing to lose');
  ctl.touch.grant([at(450, 300)]);
  ctl.touch.release();
  assert.equal(ctl.getState().canLeave, false);
  ctl.cancel();
  assert.equal(ctl.getState().canLeave, true, 'cancelled back to the save');
});

test('RS13 live pixels: verified against the checksum, decoded by the injected adapter, refused on drift', async () => {
  const fx = fixtureRuntime();
  const nx = 576;
  const bytes = new TextEncoder().encode('png bytes stand-in');
  const sum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  // Fault injection over the generated metadata: only the checksum is
  // replaced, so it matches the stand-in bytes the fake fetch returns.
  const client = {
    ...fx.client,
    call: async (id, p, o) => {
      const v = await fx.client.call(id, p, o);
      return id === 'prediction_slice_get' && v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, checksum: sum } } : v;
    },
  };
  const live = { ...fx, mode: 'live', client, config: { ...fx.config, apiBaseUrl: 'http://backend.test:8000' } };
  const fetched = [];
  const fetchBytes = async (url) => { fetched.push(url); return bytes; };
  const decoded = new Uint8Array(nx * nx);
  decoded[276 * nx + 300] = 1;
  const okDecoder = () => ({ width: nx, height: nx, data: decoded });
  const ok = createReviewScreen({ runtime: live, params: { runId: 'RUN_0043', caseId: 'CASE_0043', variant: 'RAW' }, decodeMaskPng: okDecoder, fetchBytes });
  ok.setViewport(W, H);
  await ok.start();
  const s = ok.getState();
  assert.equal(s.slice.pixels.kind, PIXELS.SERVED, JSON.stringify(s.slice.pixels));
  assert.ok(fetched[0].startsWith('http://backend.test:8000/api/v1/artifacts/'));
  assert.deepEqual(s.layers.source, [{ y: 276, x: 300, len: 1 }]);
  assert.equal(s.canEdit, true);

  const wrongSize = createReviewScreen({
    runtime: live, params: { runId: 'RUN_0043', variant: 'RAW' }, fetchBytes,
    decodeMaskPng: () => ({ width: 288, height: 1152, data: decoded }),
  });
  await wrongSize.start();
  assert.equal(wrongSize.getState().slice.pixels.reason, 'CONTRACT_DRIFT');

  const tampered = createReviewScreen({
    runtime: { ...live, client: fx.client }, params: { runId: 'RUN_0043', variant: 'RAW' }, fetchBytes, decodeMaskPng: okDecoder,
  });
  await tampered.start();
  assert.equal(tampered.getState().slice.pixels.reason, 'CHECKSUM_MISMATCH', 'bytes that do not hash to the checksum are refused');
});
