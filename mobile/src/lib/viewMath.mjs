/*
 * Zoom and pan math for the slice viewer, copied unchanged from the 2D viewer prototype, where it ran on the phone.
 * A transform is { zoom, panX, panY }: zoom is screen pixels per source pixel, pan is where the image's top-left
 * corner sits on screen; x = column, y = row. No function here sees mask data, so a pan cannot change a mask.
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

// Zoom about the pinch midpoint so the pixel under the fingers stays there:
// pan' = focal - (focal - pan) * (zoom' / zoom)
export function zoomAbout(t, newZoom, fx, fy) {
  const k = newZoom / t.zoom;
  return { zoom: newZoom, panX: fx - (fx - t.panX) * k, panY: fy - (fy - t.panY) * k };
}

export function panBy(t, dx, dy) {
  return { zoom: t.zoom, panX: t.panX + dx, panY: t.panY + dy };
}
