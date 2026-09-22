import { selectMeshSource } from './mesh_source.js';

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok  ${message}`);
}

check(selectMeshSource('').file === 'level_0_cell1.obj', 'default selects the voxel-face mesh');
check(selectMeshSource('?surface=marching-cubes').file === 'marching_cubes_preview.obj', 'explicit mode selects Marching Cubes preview');
check(selectMeshSource('?surface=../../anything.obj').file === 'level_0_cell1.obj', 'unknown query value cannot select an arbitrary fetch path');
console.log('mesh source selection: 3 passed');
