export function nearestLabeledVoxel(pointMm, labelId, labels, meta) {
  const crop = meta.crop_shape_xyz;
  const cropMin = meta.crop_min_xyz;
  const spacing = meta.spacing_signed_xyz_mm;
  const center = (crop.map((n) => (n - 1) / 2));
  const cropVoxel = pointMm.map((value, axis) => value / spacing[axis] + center[axis]);
  const index = (x, y, z) => z * meta.shape_xyz[1] * meta.shape_xyz[0] + y * meta.shape_xyz[0] + x;
  const base = cropVoxel.map((value, axis) => Math.floor(value + cropMin[axis]));
  let best = null;
  for (let z = base[2] - 1; z <= base[2] + 2; z += 1) {
    for (let y = base[1] - 1; y <= base[1] + 2; y += 1) {
      for (let x = base[0] - 1; x <= base[0] + 2; x += 1) {
        if (x < 0 || y < 0 || z < 0 || x >= meta.shape_xyz[0] || y >= meta.shape_xyz[1] || z >= meta.shape_xyz[2]) continue;
        if (labels[index(x, y, z)] !== labelId) continue;
        const distance = [x, y, z].reduce((sum, coordinate, axis) => {
          const d = (coordinate - (cropVoxel[axis] + cropMin[axis])) * spacing[axis];
          return sum + d * d;
        }, 0);
        if (!best || distance < best.distance) best = { voxel: [x, y, z], distance };
      }
    }
  }
  return best?.voxel ?? null;
}
