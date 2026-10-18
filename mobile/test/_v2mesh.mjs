// Shared by the V2 tests: the golden `cardiac-mesh/1` artifact the Python encoder built from a synthetic mask
// (backend/mesh/tests/golden/l_shape_cmesh.json), and a small JavaScript encoder for hand-made meshes.
// The encoder follows the layout of backend/mesh/artifact.py independently, so a format change breaks a test here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './_helpers.mjs';

export const GOLDEN = JSON.parse(readFileSync(join(REPO_ROOT, 'backend', 'mesh', 'tests', 'golden', 'l_shape_cmesh.json'), 'utf8'));
export const goldenBytes = () => new Uint8Array(Buffer.from(GOLDEN.bytes_b64, 'base64'));

const pad4 = (n) => (4 - (n % 4)) % 4;

/*
 * Encode a mesh: { shape: [Nx, Ny, Nz], vertices: [[x, y, z], ...], triangles: [[a, b, c], ...], slices: [z, ...] }.
 * `header` overrides fields of the header (to build a damaged file); `indexBytes` is 2 or 4.
 */
export function encodeMesh({ shape, vertices, triangles, slices, header = {}, indexBytes = 2 }) {
  const head = {
    format: 'cardiac-mesh/1', kind: 'voxel_face_surface', builder: 'test', level: 0,
    vertex_count: vertices.length, triangle_count: triangles.length, index_bytes: indexBytes, shape,
    index_convention: 'x=column,y=row,z=slice', frame: 'voxel-index', foreground_voxels: 1, ...header,
  };
  let raw = JSON.stringify(head);
  raw += ' '.repeat(pad4(12 + raw.length));
  const parts = [Buffer.from('CARDMESH', 'latin1'), Buffer.alloc(4), Buffer.from(raw, 'latin1')];
  parts[1].writeUInt32LE(raw.length, 0);
  const section = (values, bytes) => {
    const b = Buffer.alloc(values.length * bytes);
    values.forEach((v, i) => (bytes === 2 ? b.writeUInt16LE(v, i * 2) : b.writeUInt32LE(v, i * 4)));
    parts.push(b, Buffer.alloc(pad4(b.length)));
  };
  section(vertices.flat(), 2);
  section(triangles.flat(), indexBytes);
  section(slices, 2);
  return new Uint8Array(Buffer.concat(parts));
}

// The outward-wound box of voxels [x0, x1) x [y0, y1) x [z0, z1) as 12 triangles (a hand-made, valid mesh).
export function boxMesh(shape, [x0, y0, z0], [x1, y1, z1]) {
  const v = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) v.push([x, y, z]);
  // index = (zi * 2 + yi) * 2 + xi
  const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
  const tris = [
    ...q(0, 2, 3, 1), // -z  (z0 plane)
    ...q(4, 5, 7, 6), // +z
    ...q(0, 1, 5, 4), // -y
    ...q(2, 6, 7, 3), // +y
    ...q(0, 4, 6, 2), // -x
    ...q(1, 3, 7, 5), // +x
  ];
  // the source slice of a face: the foreground voxel behind it; for the side faces and caps of a one-slice box it is z0
  const slices = tris.map(() => z0);
  return { shape, vertices: v, triangles: tris, slices };
}
