/*
 * The marker SCR-05 hands SCR-03 and SCR-04 when a 3D pick opens them (`10` §6, 3D -> 2D): "highlights the corresponding
 * projected location when the transform can resolve it reliably; if only the slice index is reliable, the UI must not invent
 * a more precise pixel highlight".
 *
 * The 3D mesh lives in the voxel-index frame of the very masks the 2D screens show (x = column, y = row, z = slice), so the
 * voxel behind the picked face IS a pixel of that slice - exactly, not approximately. The marker therefore names that pixel
 * and nothing else, and it exists only where the location is known:
 *   - on the slice the voxel was picked in (`markerAtSlice`): any other slice - a slider move, a region step, Back from
 *     another slice - has no known location, so no marker;
 *   - when the screen was opened from a 3D pick at all: a screen opened from the case list (SCR-02) has no `marker` param.
 * Pure, so `node --test` checks the same code Hermes runs.
 */

const isIndex = (v) => Number.isInteger(v) && v >= 0;

/*
 * The `marker` param of a route, checked against the case's grid [Nx, Ny, Nz]: { column, row, sliceIndex } with the pixel and
 * the slice inside the volume, else null. Nothing is clamped into range and nothing is repaired.
 */
export function markerFromParams(raw, shape) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(shape) || shape.length !== 3) return null;
  const { column, row, sliceIndex } = raw;
  if (!isIndex(column) || !isIndex(row) || !isIndex(sliceIndex)) return null;
  if (column >= shape[0] || row >= shape[1] || sliceIndex >= shape[2]) return null;
  return Object.freeze({ column, row, sliceIndex });
}

/* The marker to draw while `slice` is the slice on screen: only the slice it was picked in has one. */
export const markerAtSlice = (marker, slice) => (marker && Number.isInteger(slice) && marker.sliceIndex === slice ? marker : null);

/*
 * Where the marker goes for a display transform { zoom, panX, panY } (app/core viewMath: source pixel (x, y) is drawn at
 * panX + x * zoom, panY + y * zoom, one pixel being `zoom` wide): the exact pixel as a rectangle and its centre, both in view
 * coordinates. `screenToSource(centre)` is the picked pixel again at every zoom and pan - the exact-pixel test.
 */
export function markerGeometry(marker, transform) {
  if (!marker || !transform || !(transform.zoom > 0)) return null;
  const { zoom, panX, panY } = transform;
  return Object.freeze({
    pixel: Object.freeze({ x: panX + marker.column * zoom, y: panY + marker.row * zoom, width: zoom, height: zoom }),
    center: Object.freeze({ x: panX + (marker.column + 0.5) * zoom, y: panY + (marker.row + 0.5) * zoom }),
  });
}

/* The size of the ring and ticks drawn around the pixel, in view units: constant at every zoom, so it can be found. */
export const MARKER_RING = Object.freeze({ radius: 14, innerGap: 6 });

/* What the screen says about the marker, so it is never only a drawing: the pixel, the slice, where it came from. */
export function markerText(marker, total) {
  if (!marker) return null;
  const of = Number.isInteger(total) ? ` / ${total}` : '';
  return `Marker: column ${marker.column}, row ${marker.row} on slice ${marker.sliceIndex + 1}${of} - the voxel you picked in the 3D view. `
    + 'It shows on that slice only.';
}
