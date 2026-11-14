/*
 * The slice viewer's controls, plain JS for node tests: how an overlay is drawn (fill, outline or both).
 * SliceView.js draws them.
 */

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
