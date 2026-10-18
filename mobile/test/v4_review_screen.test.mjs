// node --test mobile/test/  - SCR-06 Review / Correction controller (src/verticals/v4/reviewController.mjs)
//
// Fixture runtime over the GENERATED bundle; scenarios are switched with the
// runtime's own override API (the FIXTURE panel's), never a hand-written body.
// The controller reads nothing itself (DR-021 rule 2): `drive` plays the
// screen's useCall readers - same endpoints, same params - and hands the
// answers back. The real hooks run in the render smoke (test/render/smoke.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE, RECOVERY, fitTransform, fatalInvalid } from '../../app/core/index.mjs';
import { resolveConfig } from '../src/config.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { createReviewScreen, PHASE, PIXELS, MODE, TOOL, MASK_STATE, maskRuns } from '../src/verticals/v4/reviewController.mjs';
import { syntheticSourceSlice } from '../src/verticals/v4/syntheticSource.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { ellipseMask, encodePng, importMaskPngOrSkip } from './_png.mjs';
import { drive, fakeContent, patchedClient } from './_v4_drive.mjs';

const contractJson = readContractJson();
const bundle = generatedBundleJson();
const RUN = bundle.scenarios.analysis_run_get.default.response.data;
const W = 1080;
const H = 1440;
const NX = 576;

function fixtureRuntime() {
  return createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson, bundleJson: bundle });
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
  await drive(ctl, runtime.client);
  return ctl;
}

// Canvas point at the centre of source pixel (x, y) under the fit transform.
function at(x, y, nx = 576, ny = 576) {
  const t = fitTransform(W, H, nx, ny);
  return { x: t.panX + (x + 0.5) * t.zoom, y: t.panY + (y + 0.5) * t.zoom };
}
const covers = (runs, x, y) => runs.some((r) => r.y === y && x >= r.x && x < r.x + r.len);

// What the app does in live mode: runtime.content, imageStore and the PNG adapter. The generated
// bundle answers every slice with its own placeholder ids, so the live checks use the run id the
// bundle's analysis_run_get answers (live mode requires the run that answered to be the route's).
const LIVE_PARAMS = Object.freeze({ runId: RUN.run_id, caseId: 'CASE_0043', variant: 'RAW' });
const liveOf = (fx, content, client = fx.client) => ({
  ...fx,
  mode: 'live',
  client,
  content,
  imageStore: { load: async (url, { checksum }) => ({ uri: `data:image/png;base64,${Buffer.from(`${url}${checksum}`).toString('base64')}` }) },
  config: { ...fx.config, apiBaseUrl: 'http://backend.test:8000' },
});

test('RS1 a route without a variant asks for one - nothing is called, nothing defaulted (11 §6)', async () => {
  const { calls, runtime } = recorded(fixtureRuntime());
  const ctl = createReviewScreen({ runtime, params: { runId: 'RUN_0043' } });
  const s = await ctl.start();
  assert.equal(s.phase, PHASE.CHOOSE_VARIANT);
  await drive(ctl, runtime.client);
  assert.deepEqual(calls, []);
  assert.deepEqual(s.wants, { run: null, slice: null }, 'it wants nothing before a variant is chosen');
  const bad = await ctl.chooseVariant('REVIEWED');
  assert.equal(bad.phase, PHASE.CHOOSE_VARIANT, 'only RAW or PROCESSED can scope a review');
});

test('RS2 choosing RAW opens the run, the scoped review and the middle slice, labelled SYNTHETIC in fixture mode', async () => {
  const { calls, runtime } = recorded(fixtureRuntime());
  const ctl = createReviewScreen({ runtime, params: { runId: 'RUN_0043' } });
  ctl.setViewport(W, H);
  await ctl.start();
  const chosen = await ctl.chooseVariant('RAW');
  assert.equal(chosen.phase, PHASE.LOADING);
  assert.equal(chosen.wants.run.runId, 'RUN_0043', 'it asks the screen for the run read');
  const s = await drive(ctl, runtime.client);
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
  assert.equal(s.wants.slice, null, 'fixture mode has no slice bytes to read');
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

test('RS8 save: a new version with its source identity, the review CORRECTED, saved / unsaved drawn as different layers', async () => {
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
  // the new version is shown with the identity of what it corrects (PR-PROV-01)
  assert.equal(s.review.latestVersion.reviewed_mask_id, s.notice.reviewedMaskId);
  assert.equal(s.notice.sourceMaskId, RUN.raw_prediction_artifact_id);
  assert.equal(s.notice.sourceMaskKind, 'RAW_PREDICTION');
  assert.match(s.notice.text, new RegExp(`${s.notice.reviewedMaskId}.*RAW prediction ${RUN.raw_prediction_artifact_id} \\(RAW_PREDICTION\\)`));
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
  assert.equal(s.slice.maskState, MASK_STATE.UNSAVED, 'Refresh does not touch the edit');
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

test('RS12 a live runtime without a mask decoder says so, keeps the review controls, and never edits', async () => {
  const fx = fixtureRuntime();
  const live = liveOf(fx, fakeContent({}));
  const ctl = createReviewScreen({ runtime: live, params: LIVE_PARAMS });
  ctl.setViewport(W, H);
  await ctl.start();
  await drive(ctl, live.client);
  const s = ctl.getState();
  assert.equal(s.phase, PHASE.READY);
  assert.equal(s.slice.pixels.kind, PIXELS.UNAVAILABLE);
  assert.equal(s.slice.pixels.reason, 'NO_DECODER');
  assert.equal(s.canEdit, false);
  assert.equal(s.brush.source.synthetic, false, 'live mode never uses the synthetic stand-in');
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  assert.equal(ctl.getState().brush.undoDepth, 0);
  const t = await ctl.setStatus('FLAGGED');
  assert.equal(t.review.status, 'FLAGGED');
});

test('RS13 live pixels: the reads, then runtime.content (mandatory checksum, unmount signal) + the shell\'s PNG adapter, refused on drift', async (t) => {
  const png = await importMaskPngOrSkip(t);
  if (!png) return;
  const fx = fixtureRuntime();
  const served = ellipseMask(NX, NX, 300, 276, 20, 15); // 0 / 255, as binary_delivery serves masks
  const bytes = encodePng(NX, NX, 0, served);
  const content = fakeContent({ mask: bytes });
  const life = new AbortController();
  const asked = [];
  const recordingClient = { ...fx.client, call: (id, p, o) => { asked.push(id); return fx.client.call(id, p, o); } };
  const live = liveOf(fx, content, recordingClient);
  const ok = createReviewScreen({ runtime: live, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng, signal: life.signal });
  ok.setViewport(W, H);
  await ok.start();
  await drive(ok, live.client);
  const s = ok.getState();
  assert.equal(s.slice.pixels.kind, PIXELS.SERVED, JSON.stringify(s.slice.pixels));
  assert.equal(s.slice.pixels.verified, true);
  assert.deepEqual(asked.filter((id) => /slice_get/.test(id)), ['prediction_slice_get', 'mri_slice_get'],
    'a first review reads the prediction and the MRI slice; no reviewed-mask slice');
  const maskCall = content.calls.find((c) => c.opts.kind === 'mask');
  assert.equal(maskCall.opts.signal, life.signal, 'the unmount signal reaches the one binary path');
  assert.match(maskCall.opts.checksum, /^sha256:/, 'the slice checksum is handed over for content to verify');
  assert.deepEqual(s.layers.source, maskRuns(Uint8Array.from(served, (v) => (v ? 1 : 0)), NX, NX), 'the served mask, decoded exactly');
  assert.ok(s.slice.mriUri && s.slice.mriUri.startsWith('data:image/png;base64,'), 'the MRI slice is the verified data URI from the image store');
  assert.equal(s.canEdit, true);

  // runtime.content refusing the bytes (checksum, foreign URL, no checksum...) -> unavailable, never drawn
  const refusing = fakeContent({ mask: async () => fatalInvalid({ code: 'CONTRACT_DRIFT', safeMessage: 'bytes do not hash to the checksum' }) });
  const refusedRt = liveOf(fx, refusing);
  const a = createReviewScreen({ runtime: refusedRt, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  await a.start();
  await drive(a, refusedRt.client);
  assert.equal(a.getState().slice.pixels.reason, 'CONTRACT_DRIFT');
  assert.equal(a.getState().canEdit, false);

  // a PNG of another size -> the adapter throws CONTRACT_DRIFT -> unavailable
  const small = encodePng(288, 288, 0, ellipseMask(288, 288, 100, 100, 10, 10));
  const smallRt = liveOf(fx, fakeContent({ mask: small }));
  const b = createReviewScreen({ runtime: smallRt, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  await b.start();
  await drive(b, smallRt.client);
  assert.equal(b.getState().slice.pixels.reason, 'CONTRACT_DRIFT');

  // the MRI is optional: without it the masks are still drawn, and the absence is reported
  const noMri = liveOf(fx, fakeContent({ mask: bytes }), patchedClient(fx.client, { mri_slice_get: () => fatalInvalid({ code: 'CONTRACT_DRIFT', safeMessage: 'x' }) }));
  const c = createReviewScreen({ runtime: noMri, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  await c.start();
  await drive(c, noMri.client);
  assert.equal(c.getState().slice.pixels.kind, PIXELS.SERVED);
  assert.equal(c.getState().slice.mriUri, null);
  assert.ok(c.getState().slice.mriReason, 'the missing MRI has a reason');
});

test('RS14 with unsaved slices canLeave is false, so the screen registers the shell\'s leave guard', async () => {
  const ctl = await readyScreen();
  assert.equal(ctl.getState().canLeave, true, 'nothing to lose yet');
  ctl.touch.grant([at(380, 276)]);
  ctl.touch.release();
  let s = ctl.getState();
  assert.equal(s.canLeave, false);
  assert.match(s.leaveBlockedReason, /[Ss]lice 44/);
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

test('RS15 live: the run that answered must be the run the route named', async (t) => {
  const png = await importMaskPngOrSkip(t);
  if (!png) return;
  const fx = fixtureRuntime();
  const live = liveOf(fx, fakeContent({ mask: encodePng(NX, NX, 0, ellipseMask(NX, NX, 300, 276, 20, 15)) }));
  const ctl = createReviewScreen({ runtime: live, params: { ...LIVE_PARAMS, runId: 'RUN_9999' }, decodeMaskPng: png.decodeMaskPng });
  await ctl.start();
  await drive(ctl, live.client);
  const s = ctl.getState();
  assert.equal(s.phase, PHASE.BLOCKED);
  assert.equal(s.blockedView.error.code, 'CONTRACT_DRIFT');
  assert.match(s.blockedView.error.detail.problems[0], /RUN_9999/);
});

test('RS16 continuing a CORRECTED review (QA-063 N-4): the latest version is the base, reset returns to the original prediction', async (t) => {
  const png = await importMaskPngOrSkip(t);
  if (!png) return;
  const fx = fixtureRuntime();
  const baseId = bundle.scenarios.reviewed_masks_list.default.response.data.items[0].reviewed_mask_id;
  const original = ellipseMask(NX, NX, 300, 276, 20, 15);
  const corrected = ellipseMask(NX, NX, 322, 276, 26, 15); // an earlier correction: the version differs from the source
  const bits = (m) => Uint8Array.from(m, (v) => (v ? 1 : 0));
  const content = fakeContent({ mask: encodePng(NX, NX, 0, original), reviewed: encodePng(NX, NX, 0, corrected) });
  const bodies = [];
  const base = patchedClient(fx.client, {
    review_create: (v) => (v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, status: 'CORRECTED' } } : v),
    reviewed_mask_slice_get: (v) => (v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, reviewed_mask_id: baseId } } : v),
  });
  const asked = [];
  const client = {
    ...base,
    call: (id, p, o) => { asked.push(id); if (o && o.body) bodies.push({ id, body: o.body }); return base.call(id, p, o); },
  };
  const live = liveOf(fx, content, client);
  const ctl = createReviewScreen({ runtime: live, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  ctl.setViewport(W, H);
  await ctl.start();
  await drive(ctl, live.client);
  let s = ctl.getState();
  assert.equal(s.review.status, 'CORRECTED');
  assert.equal(s.review.baseVersion.reviewed_mask_id, baseId);
  assert.equal(s.brush.baseId, baseId, 'the session continues from the latest version');
  assert.equal(s.brush.source.maskId, RUN.raw_prediction_artifact_id, 'the source stays the original prediction');
  assert.equal(s.brush.source.kind, 'RAW_PREDICTION');
  assert.ok(asked.includes('reviewed_mask_slice_get'), 'the base slice is read from the latest version');
  assert.ok(content.calls.some((c) => c.opts.kind === 'reviewed'), 'and its bytes go through runtime.content');
  assert.equal(s.slice.pixels.kind, PIXELS.SERVED);
  // working = the latest version (SAVED); the source layer is the original; the saved layer is the earlier correction
  assert.equal(s.slice.maskState, MASK_STATE.SAVED);
  assert.deepEqual(s.layers.source, maskRuns(bits(original), NX, NX));
  assert.ok(s.layers.saved.length > 0 && s.layers.unsaved.length === 0, 'the earlier correction is drawn as saved, nothing unsaved');
  assert.equal(s.canSave, false, 'opening a corrected review is not an edit');
  // edit on top of the version: only that is unsaved
  ctl.setRadius(3);
  ctl.touch.grant([at(420, 276)]);
  ctl.touch.release();
  s = ctl.getState();
  assert.equal(s.slice.maskState, MASK_STATE.UNSAVED);
  assert.ok(covers(s.layers.unsaved, 420, 276));
  assert.ok(s.layers.saved.length > 0, 'the earlier correction is still drawn');
  // cancel returns to the latest version, not to the source
  ctl.cancel();
  assert.equal(ctl.getState().slice.maskState, MASK_STATE.SAVED);
  // reset returns to the ORIGINAL prediction: it now differs from the version
  ctl.reset();
  s = ctl.getState();
  assert.equal(s.slice.maskState, MASK_STATE.UNSAVED);
  assert.equal(s.canSave, true);
  assert.deepEqual(s.layers.unsaved.length > 0, true);
  s = await ctl.save();
  assert.equal(s.notice.kind, 'saved', JSON.stringify(s.notice));
  const put = bodies.find((b) => b.id === 'working_mask_put');
  assert.equal(put.body.source_mask_id, RUN.raw_prediction_artifact_id);
  const packed = Buffer.from(put.body.mask_payload.data, 'base64');
  const sent = new Uint8Array(NX * NX);
  for (let k = 0; k < sent.length; k++) sent[k] = (packed[Math.floor(k / 8)] >> (7 - (k % 8))) & 1;
  assert.deepEqual(sent, bits(original), 'saving after a reset commits the original prediction for that slice');
  assert.equal(s.brush.baseId, s.review.latestVersion.reviewed_mask_id, 'the session now continues from the version it just saved');
  assert.equal(s.review.status, 'CORRECTED');
  assert.equal(s.review.latestVersion.source_mask_id, RUN.raw_prediction_artifact_id);
});

test('RS17 continuing a CORRECTED review: no base slice, no editing (the source pixels would drop the earlier correction)', async (t) => {
  const png = await importMaskPngOrSkip(t);
  if (!png) return;
  const fx = fixtureRuntime();
  const original = ellipseMask(NX, NX, 300, 276, 20, 15);
  const baseId = bundle.scenarios.reviewed_masks_list.default.response.data.items[0].reviewed_mask_id;
  const corrected = (extra = {}) => patchedClient(fx.client, {
    review_create: (v) => (v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, status: 'CORRECTED' } } : v),
    reviewed_mask_slice_get: (v) => (v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, reviewed_mask_id: baseId } } : v),
    ...extra,
  });
  const bytes = encodePng(NX, NX, 0, original);
  // the version's bytes cannot be fetched
  const down = liveOf(fx, fakeContent({ mask: bytes, reviewed: async () => fatalInvalid({ code: 'TRANSPORT_UNREACHABLE', safeMessage: 'down' }) }), corrected());
  const a = createReviewScreen({ runtime: down, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  await a.start();
  await drive(a, down.client);
  assert.equal(a.getState().slice.pixels.reason, 'BASE_UNAVAILABLE');
  assert.equal(a.getState().canEdit, false);
  assert.equal(a.getState().canSave, false);
  // the version's slice endpoint answers another version
  const other = liveOf(fx, fakeContent({ mask: bytes, reviewed: encodePng(NX, NX, 0, original) }), patchedClient(fx.client, {
    review_create: (v) => (v.state === STATE.SUCCESS ? { ...v, data: { ...v.data, status: 'CORRECTED' } } : v),
  }));
  const b = createReviewScreen({ runtime: other, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  await b.start();
  await drive(b, other.client);
  assert.equal(b.getState().slice.pixels.reason, 'BASE_MISMATCH', 'the placeholder id the fixture answers is not the review\'s latest version');
  assert.equal(b.getState().canEdit, false);
});

test('RS18 a slice that could not be fetched can be retried; a slice left before its reads came back is asked for again', async (t) => {
  const png = await importMaskPngOrSkip(t);
  if (!png) return;
  const fx = fixtureRuntime();
  const bytes = encodePng(NX, NX, 0, ellipseMask(NX, NX, 300, 276, 20, 15));
  let fail = true;
  const content = fakeContent({
    mask: async (url, opts) => (fail ? fatalInvalid({ code: 'TRANSPORT_UNREACHABLE', safeMessage: 'down' })
      : { state: STATE.SUCCESS, data: { bytes, size: bytes.length, checksum: opts.checksum, verified: true } }),
  });
  const live = liveOf(fx, content);
  const ctl = createReviewScreen({ runtime: live, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  ctl.setViewport(W, H);
  await ctl.start();
  await drive(ctl, live.client);
  assert.equal(ctl.getState().slice.pixels.kind, PIXELS.UNAVAILABLE);
  assert.ok(ctl.getState().slice.pixels.reason, 'a reason is kept');
  fail = false;
  await ctl.retrySlice();
  assert.ok(ctl.getState().wants.slice, 'Retry asks the screen for the reads again');
  await drive(ctl, live.client);
  assert.equal(ctl.getState().slice.pixels.kind, PIXELS.SERVED);

  // z 44 -> 45 -> back to 44 before 45's reads arrived: 45 is wanted again when the user returns
  const leave = createReviewScreen({ runtime: live, params: LIVE_PARAMS, decodeMaskPng: png.decodeMaskPng });
  await leave.start();
  await drive(leave, live.client);
  await leave.nextSlice();
  const first = leave.getState().wants.slice;
  assert.equal(first.z, 45);
  await leave.prevSlice();
  await leave.nextSlice();
  const second = leave.getState().wants.slice;
  assert.equal(second.z, 45);
  assert.notEqual(second.ticket, first.ticket, 'a new ask, so a new reader');
  // an answer for a slice that is no longer the wanted one is dropped
  await leave.provideSlice(44, {});
  assert.equal(leave.getState().wants.slice.z, 45);
});
