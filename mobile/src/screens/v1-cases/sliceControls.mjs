/*
 * The slice viewer's controls, plain JS for node tests: how an overlay is drawn (fill, outline or both), the
 * play button, hold-to-repeat on the step buttons, and double tap to zoom. SliceView.js draws them.
 */

import { zoomAbout } from '../../lib/viewMath.mjs';

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

// The next slice of a sweep: one up, back to the first slice after the last.
export function nextPlayIndex(index, total) {
  if (!Number.isInteger(index) || !Number.isInteger(total) || total <= 0) return null;
  return index + 1 >= total ? 0 : index + 1;
}

/*
 * The play button. It asks for one slice, waits until that slice is on screen (settled) or failed, waits out the
 * rest of the interval, then asks for the next. So play never has two slice loads in flight, and the serial
 * runner's newest-slice-wins rule is never needed to throw a request away. step(index) asks the screen for a
 * slice; stop() comes from the screen on any other slice action.
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
  const ask = () => {
    timer = null;
    if (!playing) return;
    const next = nextPlayIndex(position, total);
    if (next === null) { stop(); return; }
    waitingFor = next;
    askedAt = now();
    step(next);
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
      if (playing || !Number.isInteger(from)) return;
      playing = true;
      position = from;
      onChange(true);
      ask();
    },
    stop,
    // The screen shows `index` now. Only the slice play asked for moves play on.
    settled(index) {
      if (!playing || index !== waitingFor) return;
      position = index;
      waitingFor = null;
      clearTimer();
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
