// Limit viewer selection to known local artifacts. A query parameter must not
// become an arbitrary fetch path.
const VOXEL_FACE = Object.freeze({
  file: 'level_0_cell1.obj',
  label: 'voxel-face level 0',
  smoothNormals: false,
});

const MARCHING_CUBES_PREVIEW = Object.freeze({
  file: 'marching_cubes_preview.obj',
  label: 'Marching Cubes preview',
  smoothNormals: true,
});

export function selectMeshSource(search) {
  return new URLSearchParams(search).get('surface') === 'marching-cubes'
    ? MARCHING_CUBES_PREVIEW
    : VOXEL_FACE;
}
