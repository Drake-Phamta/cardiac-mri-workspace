import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseObj } from '../app/obj.js';
import { rayMeshFirstHit } from '../app/picking.js';
import { nearestLabeledVoxel } from './viewer_math.js';

const site = process.argv[2];
if (!site) throw new Error('usage: node test_real_case_pick.mjs /path/to/generated/site');
const meta = JSON.parse(readFileSync(join(site, 'data/meta.json'), 'utf8'));
const segment = meta.segments[0];
const mesh = parseObj(readFileSync(join(site, 'data', segment.marching_cubes.file), 'utf8'));
const labels = new Uint8Array(readFileSync(join(site, meta.mpr_labels_file)));
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalize = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

let checked = 0;
const triangleCount = mesh.positions.length / 9;
const stride = Math.max(1, Math.floor(triangleCount / 16));
for (let triangle = 0; triangle < triangleCount; triangle += stride) {
  const offset = triangle * 9;
  const a = [...mesh.positions.slice(offset, offset + 3)];
  const b = [...mesh.positions.slice(offset + 3, offset + 6)];
  const c = [...mesh.positions.slice(offset + 6, offset + 9)];
  const normal = normalize(cross(b.map((v,i) => v-a[i]), c.map((v,i) => v-a[i])));
  const center = a.map((v,i) => (v+b[i]+c[i])/3);
  let hit = rayMeshFirstHit(center.map((v,i) => v + normal[i]*4), normal.map((v) => -v), mesh.positions);
  if (!hit) hit = rayMeshFirstHit(center.map((v,i) => v - normal[i]*4), normal, mesh.positions);
  if (!hit) throw new Error(`sampled surface triangle ${triangle} could not be ray-picked`);
  const voxel = nearestLabeledVoxel(hit.point, segment.label_id, labels, meta);
  if (!voxel) throw new Error(`sampled surface hit ${triangle} did not map to label ${segment.label_id}`);
  checked += 1;
}
if (checked < 8) throw new Error(`only checked ${checked} rays; expected a meaningful surface sample`);
console.log(`${checked} sampled real-mesh rays mapped back to label ${segment.label_id} source voxels`);
