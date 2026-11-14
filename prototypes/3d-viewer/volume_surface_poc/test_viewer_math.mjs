import { nearestLabeledVoxel } from './viewer_math.js';

const meta = {
  shape_xyz: [8, 8, 8],
  crop_min_xyz: [2, 2, 2],
  crop_shape_xyz: [4, 4, 4],
  spacing_signed_xyz_mm: [1, 2, 3],
};
const labels = new Uint8Array(8 * 8 * 8);
const sourceIndex = (x, y, z) => z * 64 + y * 8 + x;
labels[sourceIndex(3, 4, 4)] = 1;
const pickedSurfacePoint = [0.5, 1, 3];
const resolved = nearestLabeledVoxel(pickedSurfacePoint, 1, labels, meta);
if (JSON.stringify(resolved) !== JSON.stringify([3, 4, 4])) {
  throw new Error(`surface point did not map to its source label voxel: ${resolved}`);
}
console.log('surface hit maps to the nearest matching source-label voxel');
