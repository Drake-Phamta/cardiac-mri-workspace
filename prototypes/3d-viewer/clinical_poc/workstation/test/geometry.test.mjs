import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anatomyVerified, assertFrame, nearestSourceLabel, voxelIndex, voxelWorld, worldVoxel, nativeVoxel } from '../src/geometry.mjs';
import { planeLayout, sliceToCanvas, canvasToSlice, roiView } from '../src/mprMath.mjs';
const frame = { format: 'cmw-workstation-preview/2', coordinate_system: 'RAS', spatial_unit: 'mm', source_origin_reference: 'voxel_center', orientation: { status: 'header' }, shape_xyz: [4, 5, 6], spacing_xyz_mm: [2, 3, 4], origin_ras_mm: [-7, 10, 21], affine_ras_mm: [[2,0,0,-7],[0,3,0,10],[0,0,4,21],[0,0,0,1]] };
test('physical voxel centres and native orientation round trip without half-voxel offset', () => {
  assertFrame(frame); assert.deepEqual(voxelWorld([1,2,3], frame), [-5,16,33]);
  assert.deepEqual(worldVoxel([-5,16,33], frame), [1,2,3]);
  assert.deepEqual(nativeVoxel([1,2,3], [[-1,0,0,3],[0,1,0,0],[0,0,1,0],[0,0,0,1]]), [2,2,3]);
});
test('source correspondence rejects wrong labels and distant hits', () => {
  const labels = new Uint16Array(120); labels[voxelIndex([1,2,3], frame.shape_xyz)] = 7;
  const result = nearestSourceLabel([-4.8,16,33], 7, labels, frame, 1);
  assert.deepEqual(result.ijk, [1,2,3]); assert.ok(Math.abs(result.distanceMm - 0.2) < 1e-9);
  assert.equal(nearestSourceLabel([-4.8,16,33], 8, labels, frame, 1), null);
  assert.equal(nearestSourceLabel([-1,16,33], 7, labels, frame, 1), null);
  assert.equal(nearestSourceLabel([NaN,16,33], 7, labels, frame, 1), null);
});
test('unsupported frames, incomplete metadata and oblique affines are refused', () => {
  for (const change of [{ affine_ras_mm: [] }, { origin_ras_mm: [] }, { spacing_xyz_mm: [2] }, { coordinate_system: 'LPS' }, { source_origin_reference: 'cell_corner' }, { affine_ras_mm: [[2,.2,0,-7],[0,3,0,10],[0,0,4,21],[0,0,0,1]] }, { format: 'cmw-workstation-preview/1' }, { orientation: undefined }, { orientation: { status: 'guessed' } }]) assert.throws(() => assertFrame({...frame, ...change}));
});
test('only a scanner header or an operator declaration names anatomy', () => {
  assert.equal(anatomyVerified(frame), true);
  assert.equal(anatomyVerified({ ...frame, orientation: { status: 'operator-declared' } }), true);
  assert.equal(anatomyVerified({ ...frame, orientation: { status: 'unverified' } }), false);
  const verified = planeLayout(true), unverified = planeLayout(false);
  assert.deepEqual([verified.axial.title, verified.axial.left, verified.axial.right], ['AXIAL', 'R', 'L']);
  for (const plane of Object.values(unverified)) {
    assert.ok(![plane.left, plane.right, plane.top, plane.bottom].some((edge) => /^[RLAPSI]$/.test(edge)), plane.title);
    assert.doesNotMatch(plane.title, /AXIAL|CORONAL|SAGITTAL/);
  }
});
test('MPR zoom keeps voxel picks exact and the label ROI inside the pane', () => {
  for (const verified of [true, false]) {
    const plane = planeLayout(verified).axial, shape = [40, 30, 20], spacing = [1, 2, 1];
    const pane = { width: 300, height: 200 };
    const view = roiView(plane, shape, spacing, pane, [10, 6, 0], [20, 12, 20]);
    for (const ijk of [[10, 6, 5], [19, 11, 5], [15, 9, 5]]) {
      const [x, y] = sliceToCanvas(plane, shape, spacing, pane, view, ijk);
      assert.ok(x > 0 && x < pane.width && y > 0 && y < pane.height, `voxel ${ijk} visible`);
      assert.deepEqual(canvasToSlice(plane, shape, spacing, pane, view, x, y), [ijk[0], ijk[1]]);
    }
    assert.ok(view.zoom > 1, 'zoomed toward the ROI');
  }
});
