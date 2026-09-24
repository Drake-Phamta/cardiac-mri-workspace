/*
 * Display-transform math for the slice viewer.
 *
 * PROVENANCE - this is a COPY, not an import.
 *   source : spikes/spike_a_2d/app/viewerMath.js
 *   commit : 1b362e8 "SPIKE_A S4: pinch-zoom and pan, with an on-device A2 checksum check"
 *   blob   : e4275a93ad8f1282beed27d7af7767e06af96f44
 *   copied : 2026-09-19, five pure functions, character-for-character.
 *
 * Spike code is labelled throwaway and lives behind the boundary
 * `spikes/spike_a_2d/**`; product code importing it would quietly promote a
 * spike to a dependency. But these five functions were exercised on an A17 in
 * the A2 session (16/16 checksums) and re-checked offline by
 * spikes/spike_a_2d/harness/test_viewer_math.mjs, so rewriting them from
 * scratch would throw away evidence, not gain independence. The copy keeps
 * the evidence and the boundary both.
 *
 * NOT copied: base64ToBytes, sha256Hex, A2_SEQUENCE, applyStep. Those serve
 * the spike's measurement harness, not a product screen.
 *
 * Display transform (DR-008a: x = column, y = row, origin top-left):
 *   zoom   screen pixels per source pixel, uniform in x and y
 *   pan    viewport-space position of the image's top-left corner
 *   source_x = floor((u - panX) / zoom),  source_y = floor((v - panY) / zoom)
 *
 * Invariant 2 of `07` section 8 (Q2): zoom and pan change ONLY the display
 * transform. Every function here takes and returns a transform; none of them
 * ever receives mask data. A pan that can reach the mask is a pan that can
 * corrupt it.
 */

// Returns null for a touch outside the image. Null must never paint.
export function screenToSource(u, v, t, nx, ny) {
  const sx = (u - t.panX) / t.zoom;
  const sy = (v - t.panY) / t.zoom;
  if (!(sx >= 0 && sy >= 0 && sx < nx && sy < ny)) return null;
  return [Math.floor(sx), Math.floor(sy)];
}

export function fitTransform(viewW, viewH, nx, ny) {
  const zoom = Math.min(viewW / nx, viewH / ny);
  return { zoom, panX: (viewW - nx * zoom) / 2, panY: (viewH - ny * zoom) / 2 };
}

export function clampZoom(zoom, fitZoom, minFactor = 0.25, maxFactor = 16) {
  return Math.min(fitZoom * maxFactor, Math.max(fitZoom * minFactor, zoom));
}

/*
 * Zoom about a focal point (the pinch midpoint) so the source pixel under the
 * fingers stays under the fingers:  pan' = focal - (focal - pan) * (zoom'/zoom)
 */
export function zoomAbout(t, newZoom, fx, fy) {
  const k = newZoom / t.zoom;
  return { zoom: newZoom, panX: fx - (fx - t.panX) * k, panY: fy - (fy - t.panY) * k };
}

export function panBy(t, dx, dy) {
  return { zoom: t.zoom, panX: t.panX + dx, panY: t.panY + dy };
}
