// node --test mobile/test/  - the pick marker (Spec 10 s6): SCR-05 hands SCR-03 / SCR-04 the pixel of the picked voxel
// (src/verticals/v1/marker.mjs). The pixel must be EXACT at every zoom and pan, and the marker must exist only where its
// location is known. The drawing is checked in test:render (V2M3-V2M5); this is the arithmetic and the rules behind it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { clampZoom, fitTransform, panBy, screenToSource, zoomAbout } from '../../app/core/index.mjs';
import { MARKER_RING, markerAtSlice, markerFromParams, markerGeometry, markerText } from '../src/verticals/v1/marker.mjs';

const SHAPE = [576, 576, 88];

test('V1M1 a marker param is a pixel of a slice of THIS volume, or nothing: nothing is clamped, nothing repaired', () => {
  const ok = markerFromParams({ column: 305, row: 155, sliceIndex: 52 }, SHAPE);
  assert.deepEqual({ ...ok }, { column: 305, row: 155, sliceIndex: 52 });
  assert.ok(Object.isFrozen(ok));
  assert.deepEqual({ ...markerFromParams({ column: 0, row: 0, sliceIndex: 0 }, SHAPE) }, { column: 0, row: 0, sliceIndex: 0 }, 'pixel (0, 0) of slice 0 is a pixel');
  assert.deepEqual({ ...markerFromParams({ column: 575, row: 575, sliceIndex: 87 }, SHAPE) }, { column: 575, row: 575, sliceIndex: 87 }, 'and the last one');
  const refused = [
    { column: 576, row: 155, sliceIndex: 52 }, { column: 305, row: 576, sliceIndex: 52 }, { column: 305, row: 155, sliceIndex: 88 },
    { column: -1, row: 155, sliceIndex: 52 }, { column: 305, row: -1, sliceIndex: 52 }, { column: 305, row: 155, sliceIndex: -1 },
    { column: 1.5, row: 155, sliceIndex: 52 }, { column: 305, row: '155', sliceIndex: 52 }, { column: 305, row: 155, sliceIndex: NaN },
    { column: 305, row: 155 }, { column: null, row: 155, sliceIndex: 52 }, {}, 'yes', 7, null, undefined, [], [305, 155, 52],
  ];
  for (const bad of refused) assert.equal(markerFromParams(bad, SHAPE), null, JSON.stringify(bad));
  for (const shape of [null, undefined, [576, 576], 'x', {}]) assert.equal(markerFromParams({ column: 1, row: 1, sliceIndex: 1 }, shape), null, `shape ${JSON.stringify(shape)}`);
  assert.equal(markerFromParams({ column: 100, row: 10, sliceIndex: 5 }, [100, 576, 88]), null, 'a column past a narrower grid');
});

test('V1M2 a marker belongs to the slice it was picked in: another slice has no known location', () => {
  const marker = markerFromParams({ column: 305, row: 155, sliceIndex: 52 }, SHAPE);
  assert.equal(markerAtSlice(marker, 52), marker);
  for (const other of [51, 53, 0, 87, null, undefined, 52.5, '52', NaN]) assert.equal(markerAtSlice(marker, other), null, String(other));
  assert.equal(markerAtSlice(null, 52), null);
  assert.equal(markerAtSlice(undefined, 52), null);
});

test('V1M3 the marker\'s centre is exactly the picked pixel at every zoom and pan: screenToSource gives it back, and its rectangle is that one pixel', () => {
  const view = [400, 400];
  const fit = fitTransform(view[0], view[1], SHAPE[0], SHAPE[1]);
  // transforms a user can reach: fitted, zoomed about a point (the pinch), panned (the drag), zoomed out below fit, up to 16x
  const transforms = [fit, zoomAbout(fit, fit.zoom * 0.5, 10, 390), panBy(zoomAbout(fit, fit.zoom * 0.3, 200, 200), -37, 21)];
  let t = fit;
  for (const [factor, fx, fy] of [[2, 100, 120], [1.37, 300, 50], [4, 200, 200], [0.5, 10, 390], [16, 0, 0], [3.3, 399, 399]]) {
    t = zoomAbout(t, clampZoom(t.zoom * factor, fit.zoom), fx, fy);
    transforms.push(t);
    t = panBy(t, factor * 13.7, -factor * 9.1);
    transforms.push(t);
  }
  assert.ok(transforms.length >= 13 && transforms.some((x) => x.zoom > 5 * fit.zoom) && transforms.some((x) => x.zoom < fit.zoom));
  const pixels = [[0, 0], [575, 575], [305, 155], [288, 288], [1, 574], [574, 1], [123, 456]];
  let checked = 0;
  for (const xf of transforms) {
    for (const [column, row] of pixels) {
      const g = markerGeometry({ column, row, sliceIndex: 4 }, xf);
      // the centre of the marker, taken back through the inverse the 2D tap uses, IS the pixel (when it is on screen at all)
      assert.deepEqual(screenToSource(g.center.x, g.center.y, xf, SHAPE[0], SHAPE[1]), [column, row], `${JSON.stringify(xf)} pixel ${column},${row}`);
      // the rectangle is the pixel: its corners map to the pixel's corners, and it is one display pixel (`zoom`) wide
      assert.ok(Math.abs(g.pixel.width - xf.zoom) < 1e-12 && Math.abs(g.pixel.height - xf.zoom) < 1e-12);
      assert.deepEqual(screenToSource(g.pixel.x + 1e-6, g.pixel.y + 1e-6, xf, SHAPE[0], SHAPE[1]), [column, row], 'its top-left corner is inside the pixel');
      assert.deepEqual(screenToSource(g.pixel.x + g.pixel.width - 1e-6, g.pixel.y + g.pixel.height - 1e-6, xf, SHAPE[0], SHAPE[1]), [column, row], 'and so is its bottom-right one');
      assert.ok(Math.abs(g.center.x - (g.pixel.x + g.pixel.width / 2)) < 1e-9 && Math.abs(g.center.y - (g.pixel.y + g.pixel.height / 2)) < 1e-9, 'the centre is the pixel\'s centre');
      checked += 1;
    }
  }
  assert.equal(checked, transforms.length * pixels.length);
  // the neighbours are not it: one pixel to the right or below is a different pixel under the same transform
  const g = markerGeometry({ column: 305, row: 155, sliceIndex: 4 }, fit);
  assert.deepEqual(screenToSource(g.center.x + fit.zoom, g.center.y, fit, SHAPE[0], SHAPE[1]), [306, 155]);
  assert.deepEqual(screenToSource(g.center.x, g.center.y + fit.zoom, fit, SHAPE[0], SHAPE[1]), [305, 156]);
  assert.equal(markerGeometry(null, fit), null);
  assert.equal(markerGeometry({ column: 1, row: 1, sliceIndex: 1 }, null), null);
  assert.equal(markerGeometry({ column: 1, row: 1, sliceIndex: 1 }, { zoom: 0, panX: 0, panY: 0 }), null);
  assert.ok(Object.isFrozen(g) && Object.isFrozen(g.pixel) && Object.isFrozen(g.center));
  // the ring is the same size at every zoom (it is found, not scaled with the pixel)
  assert.deepEqual({ ...MARKER_RING }, { radius: 14, innerGap: 6 });
});

test('V1M4 the screen says the marker in words, so it is never only a drawing', () => {
  const m = markerFromParams({ column: 305, row: 155, sliceIndex: 52 }, SHAPE);
  assert.equal(markerText(m, 88), 'Marker: column 305, row 155 on slice 53 / 88 - the voxel you picked in the 3D view. It shows on that slice only.');
  assert.equal(markerText(m, null), 'Marker: column 305, row 155 on slice 53 - the voxel you picked in the 3D view. It shows on that slice only.');
  assert.equal(markerText(null, 88), null);
});
