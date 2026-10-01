import { readFileSync } from 'node:fs';
import { parseObj } from './obj.js';
import { invertMat4, rayMeshFirstHit, screenRayFromNdc, worldToSlice } from './picking.js';

const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`ok  ${message}`);
};

const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/geometry/geometry_fixture_v0.json', import.meta.url)));
const mesh = parseObj(readFileSync(new URL('../mesh/out/level_0_cell1.obj', import.meta.url), 'utf8'));
const identity = new Float32Array(16);
identity[0] = identity[5] = identity[10] = identity[15] = 1;
const inverseIdentity = invertMat4(new Float32Array(16), identity);
const centreRay = screenRayFromNdc(0, 0, inverseIdentity);
check(centreRay?.origin[2] === -1 && centreRay.direction[2] === 2, 'screen ray unprojects through an inverse projection-model matrix');
check(fixture.picking_rays.length === 13, 'canonical fixture supplies thirteen picking rays');
fixture.picking_rays.forEach((ray) => {
  const hit = rayMeshFirstHit(ray.origin_world, ray.direction_world, mesh.positions);
  const mapped = worldToSlice(hit?.point, fixture);
  check(Number.isInteger(ray.expected_slice_index), `${ray.id} has an expected canonical slice`);
  check(mapped?.sliceIndex === ray.expected_slice_index, `${ray.id} resolves exact slice ${ray.expected_slice_index}`);
});
console.log('all B3/B4 canonical picking checks passed');
