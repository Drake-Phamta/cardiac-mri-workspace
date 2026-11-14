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

/*
 * Encode a cardiac-error-geometry/1 file (the layout of build_error_artifact in backend/mesh/error_geometry.py):
 * { shape, surface: 'MESH_<sha256>' | null, components: [{ id, class, voxel_count, slice_range, marker_voxel }] }.
 * `extra` overrides top-level fields (to build a damaged file).
 */
export function encodeErrors({ shape, surface, components, extra = {} }) {
  const doc = {
    format: 'cardiac-error-geometry/1', frame: 'voxel-index', index_convention: 'x=column,y=row,z=slice', shape,
    connectivity: 26, surface_mesh_artifact_id: surface, summary: {},
    components: components.map((c) => ({ bbox_lo: c.marker_voxel, bbox_hi: c.marker_voxel, ...c })),
    ...extra,
  };
  return new Uint8Array(Buffer.from(JSON.stringify(doc), 'ascii'));
}

// Three error regions in a 576 x 576 x 88 grid, in the server's order (FN first, then FP, largest first).
export const ERROR_COMPONENTS = Object.freeze([
  { id: 'FN_0001', class: 'FN', voxel_count: 523, slice_range: [10, 12], marker_voxel: [150, 150, 11] },
  { id: 'FP_0001', class: 'FP', voxel_count: 40, slice_range: [10, 10], marker_voxel: [200, 120, 10] },
  { id: 'FP_0002', class: 'FP', voxel_count: 3, slice_range: [12, 12], marker_voxel: [250, 250, 12] },
]);

/*
 * The canonical geometry fixture (tests/fixtures/geometry, DR-008a): grid, spacing, origin, 33 points and 13 picking
 * rays with the slice each must resolve to. TC-MAINT-002: the same file the backend and the reference checker run.
 */
export const CANONICAL = JSON.parse(
  readFileSync(join(REPO_ROOT, 'tests', 'fixtures', 'geometry', 'geometry_fixture_v0.json'), 'utf8').replace(/^﻿/, ''),
);

// Occupancy of the synthetic blob the canonical picking rays target. A COPY of the data definition in
// backend/mesh/tests/conftest.py (itself a copy of the checker's), so no code is shared with the viewer.
export function blobOccupied(x, y, z, [nx, ny, nz]) {
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return false;
  const [cx, cy, cz] = [nx / 2, ny / 2, nz / 2];
  const main = ((x - cx) / (nx * 0.32)) ** 2 + ((y - cy) / (ny * 0.30)) ** 2 + ((z - cz) / (nz * 0.34)) ** 2 <= 1;
  const lobe = ((x - cx * 1.45) / (nx * 0.16)) ** 2 + ((y - cy * 0.72) / (ny * 0.17)) ** 2 + ((z - cz * 1.2) / (nz * 0.22)) ** 2 <= 1;
  return main || lobe;
}

// The voxel-face surface of that blob: one quad (two triangles) per foreground face whose neighbour is empty, and
// every face carries the slice (z) of the voxel behind it, as the served mesh does.
export function blobMesh(shape) {
  const vertices = [];
  const index = new Map();
  const vertex = (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (!index.has(key)) { index.set(key, vertices.length); vertices.push([x, y, z]); }
    return index.get(key);
  };
  const triangles = [];
  const slices = [];
  // [neighbour offset, the four corners of the face as offsets inside the voxel]
  const FACES = [
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]], [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]], [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  ];
  for (let x = 0; x < shape[0]; x += 1) {
    for (let y = 0; y < shape[1]; y += 1) {
      for (let z = 0; z < shape[2]; z += 1) {
        if (!blobOccupied(x, y, z, shape)) continue;
        for (const [[dx, dy, dz], corners] of FACES) {
          if (blobOccupied(x + dx, y + dy, z + dz, shape)) continue;
          const [a, b, c, d] = corners.map(([i, j, k]) => vertex(x + i, y + j, z + k));
          triangles.push([a, b, c], [a, c, d]);
          slices.push(z, z);
        }
      }
    }
  }
  return { shape, vertices, triangles, slices };
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
