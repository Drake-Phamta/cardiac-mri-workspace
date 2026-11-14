export const voxelIndex = ([x, y, z], [nx, ny]) => z * nx * ny + y * nx + x;
export const voxelWorld = (ijk, geometry) => ijk.map((v, a) => geometry.origin_ras_mm[a] + v * geometry.spacing_xyz_mm[a]);
export const worldVoxel = (point, geometry) => point.map((v, a) => (v - geometry.origin_ras_mm[a]) / geometry.spacing_xyz_mm[a]);
export const inside = (ijk, shape) => ijk.every((v, a) => Number.isInteger(v) && v >= 0 && v < shape[a]);
export function nativeVoxel(ijk, matrix) {
  return matrix.slice(0, 3).map((row) => row[3] + row.slice(0, 3).reduce((sum, v, a) => sum + v * ijk[a], 0));
}
export function nearestSourceLabel(point, labelId, labels, geometry, maxMm) {
  if (!point.every(Number.isFinite) || !Number.isFinite(maxMm) || maxMm < 0) return null;
  const voxel = worldVoxel(point, geometry).map(Math.round);
  const radius = Math.ceil(maxMm / Math.min(...geometry.spacing_xyz_mm)) + 1;
  if (radius > 8) return null;
  let best = null;
  for (let z = voxel[2] - radius; z <= voxel[2] + radius; z += 1) {
    for (let y = voxel[1] - radius; y <= voxel[1] + radius; y += 1) {
      for (let x = voxel[0] - radius; x <= voxel[0] + radius; x += 1) {
        const ijk = [x, y, z];
        if (!inside(ijk, geometry.shape_xyz) || labels[voxelIndex(ijk, geometry.shape_xyz)] !== labelId) continue;
        const world = voxelWorld(ijk, geometry);
        const distanceMm = Math.hypot(...world.map((v, a) => v - point[a]));
        if (distanceMm <= maxMm && (!best || distanceMm < best.distanceMm)) best = { ijk, world, distanceMm };
      }
    }
  }
  return best;
}
const ORIENTATION_STATUS = new Set(['header', 'operator-declared', 'unverified']);
// Only a scanner header or an explicit operator declaration may name anatomy.
export const anatomyVerified = (meta) => meta.orientation?.status === 'header' || meta.orientation?.status === 'operator-declared';
export function assertFrame(meta) {
  if (meta.format !== 'cmw-workstation-preview/2' || meta.coordinate_system !== 'RAS'
      || meta.spatial_unit !== 'mm' || meta.source_origin_reference !== 'voxel_center') throw new Error('Unsupported physical frame. Rebuild the preview.');
  if (!ORIENTATION_STATUS.has(meta.orientation?.status)) throw new Error('Preview does not state whether its anatomical orientation is verified. Rebuild the preview.');
  if (meta.volume && !(meta.volume.mip_window?.length === 2 && meta.volume.mip_window.every(Number.isFinite))) throw new Error('Preview has no MIP intensity range. Rebuild the preview.');
  if (!meta.shape_xyz?.every((n) => Number.isInteger(n) && n > 0)
      || meta.shape_xyz.length !== 3 || meta.spacing_xyz_mm?.length !== 3 || !meta.spacing_xyz_mm?.every((n) => Number.isFinite(n) && n > 0)
      || meta.origin_ras_mm?.length !== 3 || !meta.origin_ras_mm?.every(Number.isFinite)) throw new Error('Invalid source geometry.');
  const expected = [[meta.spacing_xyz_mm[0], 0, 0, meta.origin_ras_mm[0]], [0, meta.spacing_xyz_mm[1], 0, meta.origin_ras_mm[1]], [0, 0, meta.spacing_xyz_mm[2], meta.origin_ras_mm[2]], [0, 0, 0, 1]];
  if (meta.affine_ras_mm?.length !== 4 || !meta.affine_ras_mm?.every((row, a) => row.length === 4 && row.every((v, b) => Number.isFinite(v) && Math.abs(v - expected[a][b]) < 1e-5))) throw new Error('This preview requires a validated axis-aligned RAS affine.');
}
