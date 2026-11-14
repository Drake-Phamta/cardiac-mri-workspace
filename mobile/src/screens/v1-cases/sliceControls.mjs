/*
 * The slice viewer's controls, plain JS for node tests: how an overlay is drawn (fill, outline or both), the
 * play button, hold-to-repeat on the step buttons, and double tap to zoom. SliceView.js draws them.
 */

import { clampZoom, zoomAbout } from '../../lib/viewMath.mjs';

// ----- Overlay drawing -----

export const OVERLAY_MODE = Object.freeze({ FILL: 'FILL', OUTLINE: 'OUTLINE', BOTH: 'BOTH' });

export const OVERLAY_MODES = Object.freeze([
  Object.freeze({ key: OVERLAY_MODE.FILL, label: 'Fill' }),
  Object.freeze({ key: OVERLAY_MODE.OUTLINE, label: 'Outline' }),
  Object.freeze({ key: OVERLAY_MODE.BOTH, label: 'Both' }),
]);

// Outline width in screen pixels (dp).
export const OUTLINE_WIDTHS = Object.freeze([1, 2, 3]);

/*
 * What one overlay layer draws. The path is in source pixels and the viewport scales it by `zoom` (screen pixels
 * per source pixel), so the stroke width and dash are divided by zoom to stay `widthPx` wide on screen at any zoom.
 * The outline is drawn fully opaque: the opacity steps are for the fill. A dashed layer (FP) dashes 3 widths on,
 * 2 off.
 */
export function overlayStyle({ mode = OVERLAY_MODE.FILL, widthPx = 2, zoom = 1, dashed = false, opacity = 0.5 } = {}) {
  const z = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const fill = mode === OVERLAY_MODE.FILL || mode === OVERLAY_MODE.BOTH;
  const stroke = mode === OVERLAY_MODE.OUTLINE || mode === OVERLAY_MODE.BOTH;
  const width = widthPx / z;
  return Object.freeze({
    fill,
    fillOpacity: fill ? opacity : 0,
    stroke,
    strokeWidth: stroke ? width : 0,
    strokeDasharray: stroke && dashed ? Object.freeze([3 * width, 2 * width]) : null,
  });
}

export const needsOutline = (mode) => mode === OVERLAY_MODE.OUTLINE || mode === OVERLAY_MODE.BOTH;

// The style chosen on each screen, kept for the session: a screen unmounts under the next one, and Back should
// not undo the user's choice.
const chosenStyle = new Map();
export function rememberedOverlayStyle(screenId, fallback) {
  return chosenStyle.get(screenId) || Object.freeze({ ...fallback });
}
export function rememberOverlayStyle(screenId, style) {
  chosenStyle.set(screenId, Object.freeze({ mode: style.mode, width: style.width }));
}
export function forgetOverlayStyles() { chosenStyle.clear(); }

// ----- Play -----

// About 5 slices per second once they are cached; a slice not yet cached takes as long as it takes to load.
export const PLAY_INTERVAL_MS = 200;

// The next slice of a sweep: one up. null after the last slice (the sweep ends there) or for a slice or count that
// is not a number.
export function nextPlayIndex(index, total) {
  if (!Number.isInteger(index) || !Number.isInteger(total) || total <= 0) return null;
  return index + 1 >= total ? null : index + 1;
}

/*
 * The play button. It asks for one slice, waits until that slice is on screen (settled) or failed, waits out the
 * rest of the interval, then asks for the next. So play never has two slice loads in flight, and the serial
 * runner's newest-slice-wins rule is never needed to throw a request away. step(index) asks the screen for a
 * slice; stop() comes from the screen on any other slice action.
 * The sweep ends on the last slice: once it is on screen play stops, and the button reads Play again. Pressing Play
 * on the last slice starts over from the first one.
 */
export function createPlayer({
  step, total, intervalMs = PLAY_INTERVAL_MS, now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = (t) => clearTimeout(t), onChange = () => {},
}) {
  let playing = false;
  let position = null;
  let waitingFor = null;
  let askedAt = -Infinity;
  let timer = null;

  const clearTimer = () => { if (timer !== null) { cancel(timer); timer = null; } };
  const request = (index) => {
    waitingFor = index;
    askedAt = now();
    step(index);
  };
  const ask = () => {
    timer = null;
    if (!playing) return;
    const next = nextPlayIndex(position, total);
    if (next === null) { stop(); return; }
    request(next);
  };
  function stop() {
    const was = playing;
    playing = false;
    waitingFor = null;
    clearTimer();
    if (was) onChange(false);
  }

  return Object.freeze({
    start(from) {
      if (playing || !Number.isInteger(from) || !Number.isInteger(total) || total < 2) return;
      playing = true;
      position = from;
      onChange(true);
      // On the last slice there is nowhere to go on to: begin again at the first.
      if (nextPlayIndex(from, total) === null) request(0);
      else ask();
    },
    stop,
    // The screen shows `index` now. Only the slice play asked for moves play on; on the last slice it ends.
    settled(index) {
      if (!playing || index !== waitingFor) return;
      position = index;
      waitingFor = null;
      clearTimer();
      if (nextPlayIndex(index, total) === null) { stop(); return; }
      timer = schedule(ask, Math.max(0, askedAt + intervalMs - now()));
    },
    // The slice play asked for ended in an error or unavailable state: play stops there.
    failed() { stop(); },
    get playing() { return playing; },
    get waitingFor() { return waitingFor; },
  });
}

// ----- Hold to repeat -----

export const REPEAT_EVERY_MS = 120;

// While a step button is held (after the long-press delay), fire() runs at once and then every everyMs.
export function createRepeater({
  fire, everyMs = REPEAT_EVERY_MS, schedule = (fn, ms) => setInterval(fn, ms), cancel = (t) => clearInterval(t),
}) {
  let timer = null;
  return Object.freeze({
    start() {
      if (timer !== null) return;
      fire();
      timer = schedule(fire, everyMs);
    },
    stop() {
      if (timer !== null) { cancel(timer); timer = null; }
    },
    get running() { return timer !== null; },
  });
}

// ----- Double tap -----

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP = 24;

// Two taps close in time and place. A tap is { t, u, v } (time, screen point).
export function isDoubleTap(prev, cur, { maxMs = DOUBLE_TAP_MS, maxDist = DOUBLE_TAP_SLOP } = {}) {
  if (!prev || !cur) return false;
  return cur.t - prev.t <= maxMs && Math.hypot(cur.u - prev.u, cur.v - prev.v) <= maxDist;
}

// Double tap toggles between fit and 2x fit about the tapped point. Zoomed in past 1.5x fit, it goes back to fit.
export function doubleTapTransform(t, fit, u, v) {
  if (!t || !fit) return t;
  if (t.zoom / fit.zoom > 1.5) return { ...fit };
  return zoomAbout(t, fit.zoom * 2, u, v);
}

// ----- Pinch zoom -----

// A pinch zooms between fit and 16x fit. Below fit the slice only gets smaller, with black all round it.
export const MIN_ZOOM_FACTOR = 1;
export const MAX_ZOOM_FACTOR = 16;

/*
 * The transform after a pinch that changed the finger distance by `ratio`, about the point (fx, fy). Zoom stays
 * between fit and MAX_ZOOM_FACTOR x fit; when the pinch reaches fit it returns exactly the fit view (centred), so
 * pinching in always ends on the whole slice.
 */
export function pinchTransform(t, ratio, fit, fx, fy) {
  const zoom = clampZoom(t.zoom * ratio, fit.zoom, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
  return zoom <= fit.zoom ? { ...fit } : zoomAbout(t, zoom, fx, fy);
}

// ----- Full-bleed framing (SCR-03) -----

// The viewer opens at 1.6x fit, as in the mockup: the atrium fills the screen and the body's edges are cropped.
export const VIEWER_ZOOM = 1.6;

/*
 * Fit and the opening view for a viewport of w x h whose top and bottom are covered by the floating app bar and
 * the bottom panel (insets). The image is fitted into the uncovered band and centred in it; the opening view is
 * `factor` times that fit about the band's centre. Pinch, pan and double tap start from there.
 */
export function framing(w, h, nx, ny, { top = 0, bottom = 0 } = {}, factor = 1) {
  if (!(w > 0) || !(h > 0) || !(nx > 0) || !(ny > 0)) return null;
  const band = Math.max(1, h - top - bottom);
  const z = Math.min(w / nx, band / ny);
  const fit = { zoom: z, panX: (w - nx * z) / 2, panY: top + (band - ny * z) / 2 };
  const start = factor > 0 && factor !== 1 ? zoomAbout(fit, z * factor, w / 2, top + band / 2) : { ...fit };
  return Object.freeze({ fit: Object.freeze(fit), start: Object.freeze(start) });
}

// The zoom readout ("×2.0", relative to fit), shown only away from the two views a viewer opens to or returns to:
// fit, and the opening view. null = nothing to show.
export function zoomReadout(t, fit, start = null) {
  if (!t || !fit || !(fit.zoom > 0)) return null;
  const near = (a, b) => Math.abs(a / b - 1) <= 0.01;
  if (near(t.zoom, fit.zoom) || (start && near(t.zoom, start.zoom))) return null;
  return `×${(t.zoom / fit.zoom).toFixed(1)}`;
}

// ----- No black frame between slices (B1) -----

/*
 * An <Image> whose source changes shows nothing until the new picture is decoded, so Play flashed black frames on
 * the phone. The viewport keeps two images instead: the one on screen (front, the last that finished loading) and
 * the next one (pending), drawn under it until it has loaded. `front` is the uri on screen, `uri` the one wanted.
 *   pending   the uri to load under the front image, or null
 *   front     the uri to keep on screen, or null
 *   hold      true while the front image stays up for a newer uri: draw the overlays that belong to it, not the
 *             new slice's, so image and masks change together
 */
export function viewerFrame(front, uri) {
  if (!uri) return Object.freeze({ pending: null, front: null, hold: false });
  if (front === uri) return Object.freeze({ pending: null, front, hold: false });
  return Object.freeze({ pending: uri, front: front || null, hold: Boolean(front) });
}
