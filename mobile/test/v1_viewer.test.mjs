// node --test mobile/test/  - V1 viewer in Direction A: the one slice formatter (B5), no black frame between slices
// (B1), the full-bleed framing and the words the viewer shows (src/lib/sliceNumber.mjs, src/screens/v1-cases/)
import test from 'node:test';
import assert from 'node:assert/strict';

import { formatSlice, sliceDetail, sliceParts } from '../src/lib/sliceNumber.mjs';
import {
  framing, MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, pinchTransform, VIEWER_ZOOM, viewerFrame, zoomReadout, doubleTapTransform,
} from '../src/screens/v1-cases/sliceControls.mjs';
import {
  diceCornerText, familyName, runSubtitle, sliceLabel, variantLabel,
} from '../src/screens/v1-cases/cases.mjs';
import { worstEntryText, worstLabel } from '../src/screens/v1-cases/errorInspector.mjs';

test('V1v1 one slice formatter: 1-based "45 / 88"; the z only in the Details line', () => {
  assert.equal(formatSlice(44, 88), '45 / 88');
  assert.equal(formatSlice(0, 88), '1 / 88');
  assert.equal(formatSlice(87, 88), '88 / 88');
  assert.deepEqual({ ...sliceParts(44, 88) }, { current: '45', total: '88', text: '45 / 88' });
  // Not known yet, or outside the volume: a dash, never 0 and never a number the volume does not have.
  assert.equal(formatSlice(null, 88), '- / 88');
  assert.equal(formatSlice(88, 88), '- / 88');
  assert.equal(formatSlice(-1, 88), '- / 88');
  assert.equal(formatSlice(3, null), '- / -');
  assert.equal(sliceDetail(44, 88), 'Slice 45 / 88 · z 44');
  assert.equal(sliceDetail(null, 88), 'Slice - / 88');
  // The older label (logs, the 3D view's parity test) is built from the same numbers.
  assert.equal(sliceLabel(44, 88), `slice ${formatSlice(44, 88)}  (z = 44)`);
  // SCR-04's worst slices use it too.
  const e = { sliceIndex: 52, dice: 0.62, falsePositives: 120, falseNegatives: 340 };
  assert.equal(worstEntryText(e, 88), 'Slice 53 / 88 · Dice 0.620 · FP 120 · FN 340');
  assert.equal(worstEntryText({ ...e, sliceIndex: 90 }, 88), 'Slice 91 (not in this volume) · Dice 0.620 · FP 120 · FN 340');
  assert.match(worstLabel(e), /^z 52 \(slice 53\) /, 'the older label keeps its z for the logs');
});

test('V1v2 no black frame (B1): the slice on screen stays up, with its own overlays, until the next has loaded', () => {
  // First open: nothing loaded yet, so the image loads where it will show and the overlays are the slice's own.
  let f = viewerFrame(null, 'mri-44');
  assert.deepEqual({ ...f }, { pending: 'mri-44', front: null, hold: false });
  // Loaded: one image, nothing held.
  f = viewerFrame('mri-44', 'mri-44');
  assert.deepEqual({ ...f }, { pending: null, front: 'mri-44', hold: false });
  // Play asks for slice 45: 44 stays drawn (front), 45 loads under it, and 44's overlays stay with 44's image.
  f = viewerFrame('mri-44', 'mri-45');
  assert.deepEqual({ ...f }, { pending: 'mri-45', front: 'mri-44', hold: true });
  // Every frame of a sweep has an image to draw until the next one is in.
  let front = null;
  const sweep = ['mri-44', 'mri-45', 'mri-46', 'mri-47'];
  for (const uri of sweep) {
    const before = viewerFrame(front, uri);
    if (front) assert.ok(before.front === front && before.hold, `${uri}: the previous image stays up while it loads`);
    front = uri; // its onLoad
    const after = viewerFrame(front, uri);
    assert.ok(after.front === uri && !after.pending && !after.hold, `${uri}: shown once loaded`);
  }
  // A newer slice replaces the one still loading; going back to the slice on screen loads nothing.
  assert.equal(viewerFrame('mri-44', 'mri-46').pending, 'mri-46');
  assert.deepEqual({ ...viewerFrame('mri-44', 'mri-44') }, { pending: null, front: 'mri-44', hold: false });
  // No image (fixture mode, no URL): nothing to keep.
  assert.deepEqual({ ...viewerFrame('mri-44', null) }, { pending: null, front: null, hold: false });
});

test('V1v3 full-bleed framing: fit in the band between the floating bar and the panel, open at 1.6x about its centre', () => {
  const insets = { top: 56, bottom: 168 };
  const f = framing(390, 716, 576, 576, insets, VIEWER_ZOOM);
  const band = 716 - 56 - 168;
  assert.ok(Math.abs(f.fit.zoom - 390 / 576) < 1e-12, 'width-bound fit');
  assert.ok(Math.abs(f.fit.panY + (576 * f.fit.zoom) / 2 - (56 + band / 2)) < 1e-9, 'fitted image centred in the band');
  assert.ok(Math.abs(f.start.zoom / f.fit.zoom - 1.6) < 1e-12);
  const cx = f.start.panX + (576 * f.start.zoom) / 2;
  const cy = f.start.panY + (576 * f.start.zoom) / 2;
  assert.ok(Math.abs(cx - 195) < 1e-9 && Math.abs(cy - (56 + band / 2)) < 1e-9, 'opening view centred in the band');
  assert.equal(framing(0, 716, 576, 576, insets, 1.6), null);
  // The zoom readout stays away from the two views a viewer opens to or returns to.
  assert.equal(zoomReadout(f.start, f.fit, f.start), null, 'opening view: no readout');
  assert.equal(zoomReadout(f.fit, f.fit, f.start), null, 'fit: no readout');
  const twice = doubleTapTransform(f.fit, f.fit, 195, 300);
  assert.equal(zoomReadout(twice, f.fit, f.start), '×2.0');
  assert.deepEqual({ ...doubleTapTransform(f.start, f.fit, 195, 300) }, { ...f.fit }, 'a double tap from 1.6x returns to fit');
});

test('V1v5 pinch-in stops at fit (1.0x), never below; pinch-out stops at 16x; reaching fit gives exactly the fit view', () => {
  const f = framing(390, 716, 576, 576, { top: 56, bottom: 168 }, VIEWER_ZOOM);
  const zoomOf = (t) => t.zoom / f.fit.zoom;
  assert.equal(MIN_ZOOM_FACTOR, 1);
  assert.equal(MAX_ZOOM_FACTOR, 16);
  // From the opening view (1.6x): a small pinch-in stays above fit and keeps the point under the fingers.
  const small = pinchTransform(f.start, 0.8, f.fit, 100, 300);
  assert.ok(Math.abs(zoomOf(small) - 1.28) < 1e-9);
  assert.ok(Math.abs((100 - f.start.panX) / f.start.zoom - (100 - small.panX) / small.zoom) < 1e-9, 'the source pixel under the fingers stays there');
  // The device showed 0.9x after a pinch from 2x: any pinch-in past fit now lands on fit itself.
  const two = doubleTapTransform(f.fit, f.fit, 195, 300);
  assert.ok(Math.abs(zoomOf(two) - 2) < 1e-9);
  const past = pinchTransform(two, 150 / 500, f.fit, 195, 300);
  assert.deepEqual({ ...past }, { ...f.fit }, 'pinch-in from 2x by a factor 0.3 stops at fit (it was 0.6x before) and the slice is centred again');
  assert.equal(zoomReadout(past, f.fit, f.start), null, 'so no "x0.6" or "x0.9" readout');
  // Many small pinch-in steps (a real gesture is a stream of them) never go under fit.
  let t = f.start;
  for (let i = 0; i < 40; i += 1) {
    t = pinchTransform(t, 0.9, f.fit, 80 + i, 300);
    assert.ok(t.zoom >= f.fit.zoom, `step ${i}: ${zoomOf(t)}x`);
  }
  assert.deepEqual({ ...t }, { ...f.fit });
  // Pinch-out is capped at 16x fit; at fit a pinch-in does nothing.
  assert.ok(Math.abs(zoomOf(pinchTransform(two, 1000, f.fit, 195, 300)) - 16) < 1e-9);
  assert.deepEqual({ ...pinchTransform(f.fit, 0.5, f.fit, 10, 10) }, { ...f.fit });
});

test('V1v4 the words of the viewer: corner Dice, model names, variant labels, the run subtitle', () => {
  assert.equal(diceCornerText({ state: 'COMPUTED', value: 0.1331 }), '0.133');
  assert.equal(diceCornerText({ state: 'NOT_APPLICABLE' }), 'Not applicable');
  assert.equal(diceCornerText({ state: 'UNAVAILABLE', reason: 'X' }), 'Unavailable');
  assert.equal(diceCornerText(null), '—');
  assert.equal(diceCornerText({ state: 'COMPUTED', value: null }), 'Not shown', 'a COMPUTED state without a number is not shown as 0');
  assert.equal(familyName('dinov2'), 'DINOv2');
  assert.equal(familyName('UNet2D'), 'UNet2D');
  assert.equal(familyName('model_family_fixture'), 'model_family_fixture');
  assert.equal(familyName(''), null);
  assert.equal(variantLabel('RAW'), 'Raw');
  assert.equal(variantLabel('PROCESSED'), 'Processed');
  const run = { runId: 'RUN_EXP-D-100_CASE_0029', experimentId: 'EXP-D-100' };
  assert.equal(runSubtitle(run, 'dinov2'), 'DINOv2 · EXP-D-100');
  assert.equal(runSubtitle(run, null, { loading: true }), 'Loading the run…');
  assert.equal(runSubtitle(run, null, { error: 'ARTIFACT_NOT_FOUND' }), 'Run RUN_EXP-D-100_CASE_0029');
  assert.equal(runSubtitle({ runId: 'R' }, null), 'Run R');
});
