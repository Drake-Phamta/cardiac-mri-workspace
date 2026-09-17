/*
 * Dependency-free picking helpers for the B1 diagnostic viewer.
 *
 * Mesh vertices are in the canonical fixture's world coordinates.  A pointer
 * ray is unprojected through the exact projection × model matrix used to draw
 * the mesh, intersects the unindexed OBJ triangles, then maps back through
 * DR-008a's world -> voxel floor rule.  Nothing here clamps an out-of-range
 * hit into a plausible slice.
 */

const EPSILON = 1e-8;

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addScaled = (a, b, scale) => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalise = (v) => {
  const length = Math.hypot(...v);
  return length > EPSILON ? v.map((value) => value / length) : null;
};

export function rayMeshFirstHit(origin, direction, positions) {
  const unit = normalise(direction);
  if (!unit) return null;
  let best = null;
  for (let offset = 0; offset < positions.length; offset += 9) {
    const v0 = [positions[offset], positions[offset + 1], positions[offset + 2]];
    const v1 = [positions[offset + 3], positions[offset + 4], positions[offset + 5]];
    const v2 = [positions[offset + 6], positions[offset + 7], positions[offset + 8]];
    const edge1 = subtract(v1, v0);
    const edge2 = subtract(v2, v0);
    const p = cross(unit, edge2);
    const determinant = dot(edge1, p);
    if (Math.abs(determinant) < EPSILON) continue;
    const inverse = 1 / determinant;
    const fromV0 = subtract(origin, v0);
    const u = dot(fromV0, p) * inverse;
    if (u < -EPSILON || u > 1 + EPSILON) continue;
    const q = cross(fromV0, edge1);
    const v = dot(unit, q) * inverse;
    if (v < -EPSILON || u + v > 1 + EPSILON) continue;
    const distance = dot(edge2, q) * inverse;
    if (distance <= EPSILON || (best && distance >= best.distance)) continue;
    best = { point: addScaled(origin, unit, distance), distance, triangle: offset / 9 };
  }
  return best;
}

export function worldToVoxel(point, geometry) {
  if (!point || !geometry) return null;
  const { shape_xyz: shape, spacing_xyz_mm: spacing, origin_world_mm: origin } = geometry;
  if (!Array.isArray(shape) || !Array.isArray(spacing) || !Array.isArray(origin)) return null;
  const voxel = point.map((value, axis) => Math.floor((value - origin[axis]) / spacing[axis] + EPSILON));
  if (voxel.some((value, axis) => value < 0 || value >= shape[axis])) return null;
  return voxel;
}

export function worldToSlice(point, geometry) {
  const voxel = worldToVoxel(point, geometry);
  return voxel ? { voxel, sliceIndex: voxel[2] } : null;
}

export function multiplyMat4(out, a, b) {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] = a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

export function invertMat4(out, matrix) {
  const m = matrix;
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const determinant = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(determinant) < EPSILON) return null;
  for (let i = 0; i < 16; i += 1) out[i] = inv[i] / determinant;
  return out;
}

function transformPoint(matrix, point) {
  const x = point[0], y = point[1], z = point[2], w = point[3];
  const result = [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w,
  ];
  return result[3] ? result.slice(0, 3).map((value) => value / result[3]) : null;
}

export function screenRayFromNdc(ndcX, ndcY, inverseProjectionModel) {
  const near = transformPoint(inverseProjectionModel, [ndcX, ndcY, -1, 1]);
  const far = transformPoint(inverseProjectionModel, [ndcX, ndcY, 1, 1]);
  return near && far ? { origin: near, direction: subtract(far, near) } : null;
}
