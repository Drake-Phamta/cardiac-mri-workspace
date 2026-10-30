// Shared by the V2 tests: the golden `cardiac-mesh/1` and `cardiac-errormesh/2` artifacts the Python encoders built from
// synthetic masks (backend/mesh/tests/golden/*.json), and small JavaScript encoders for hand-made meshes.
// The encoders follow the layouts of backend/mesh/artifact.py and backend/mesh/error_artifact.py independently, so a
// format change breaks a test here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './_helpers.mjs';

const golden = (name) => JSON.parse(readFileSync(join(REPO_ROOT, 'backend', 'mesh', 'tests', 'golden', name), 'utf8'));
const bytesOf = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));

export const GOLDEN = golden('l_shape_cmesh.json');
export const goldenBytes = () => bytesOf(GOLDEN.bytes_b64);

// The known-error pair (TC-3D-005): a ground-truth block, a prediction that misses one slab of it (FN) and adds a slab
// beside it and one far voxel (FP). `picks` are the rays the viewer must resolve like the Python reference does.
export const ERROR_GOLDEN = golden('known_errors_errormesh.json');
export const errorGoldenBytes = () => bytesOf(ERROR_GOLDEN.bytes_b64);
export const errorGoldenPredictionBytes = () => bytesOf(ERROR_GOLDEN.prediction_surface_b64);
export const errorGoldenReferenceBytes = () => bytesOf(ERROR_GOLDEN.reference_surface_b64);

const pad4 = (n) => (4 - (n % 4)) % 4;

function pack(head, sections) {
  let raw = JSON.stringify(head);
  raw += ' '.repeat(pad4(12 + raw.length));
  const parts = [Buffer.from('CARDMESH', 'latin1'), Buffer.alloc(4), Buffer.from(raw, 'latin1')];
  parts[1].writeUInt32LE(raw.length, 0);
  for (const [values, bytes] of sections) {
    const b = Buffer.alloc(values.length * bytes);
    values.forEach((v, i) => (bytes === 1 ? b.writeUInt8(v, i) : bytes === 2 ? b.writeUInt16LE(v, i * 2) : b.writeUInt32LE(v, i * 4)));
    parts.push(b, Buffer.alloc(pad4(b.length)));
  }
  return new Uint8Array(Buffer.concat(parts));
}

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
  return pack(head, [[vertices.flat(), 2], [triangles.flat(), indexBytes], [slices, 2]]);
}

/*
 * Encode an error mesh (`cardiac-errormesh/2`): `fp` and `fn` are { voxels, vertices, triangles (LOCAL to the class), slices,
 * regions? }, an empty class is `{ voxels: 0, vertices: [], triangles: [], slices: [] }`. The file puts the FP block before the
 * FN block, offsets the FN triangle indices, writes one class byte and one region number per triangle, a class table and the
 * region table. A class's `regions` is [{ faces: [local triangle indices], firstSlice, sliceVoxels: [...] }]; without it the
 * class is ONE region holding every face, whose voxels are spread over the slice run of its faces. The regions are numbered 1..C,
 * FP first. Overrides to build a damaged file: `header` (top-level fields), `classTable`, `classBytes`, `componentTable` (the
 * `components` list), `faceComponents` (the region number of every triangle), `componentBytes` (the width of those numbers).
 */
export const NO_FACES = Object.freeze({ voxels: 0, vertices: [], triangles: [], slices: [] });

function defaultRegions(cls) {
  if (cls.voxels === 0 && cls.triangles.length === 0) return [];
  const first = Math.min(...cls.slices);
  const run = Math.max(...cls.slices) - first + 1;
  const voxels = Math.max(cls.voxels, run);   // a damaged class (faces for no voxel) still gets a region of its own, one voxel per slice at least
  const base = Math.floor(voxels / run);
  const sliceVoxels = Array.from({ length: run }, (_, i) => base + (i === 0 ? voxels - base * run : 0));
  return [{ faces: cls.triangles.map((_, i) => i), firstSlice: first, sliceVoxels }];
}

export function encodeErrorMesh({
  shape, fp = NO_FACES, fn = NO_FACES, header = {}, classTable = null, classBytes = null, indexBytes = 2,
  componentTable = null, faceComponents = null, componentBytes = null, connectivity = 26,
}) {
  const vertices = [...fp.vertices, ...fn.vertices];
  const triangles = [...fp.triangles, ...fn.triangles.map((t) => t.map((i) => i + fp.vertices.length))];
  const slices = [...fp.slices, ...fn.slices];
  const classes = [...fp.triangles.map(() => 1), ...fn.triangles.map(() => 2)];
  const fpRegions = fp.regions || defaultRegions(fp);
  const fnRegions = fn.regions || defaultRegions(fn);
  const numbersOf = (cls, regions, offset) => {
    const out = cls.triangles.map(() => 0);
    regions.forEach((r, k) => r.faces.forEach((t) => { out[t] = offset + k + 1; }));
    return out;
  };
  const numbers = [...numbersOf(fp, fpRegions, 0), ...numbersOf(fn, fnRegions, fpRegions.length)];
  const count = fpRegions.length + fnRegions.length;
  const entry = (name, regions, k) => ({
    id: `${name}_${String(k + 1).padStart(4, '0')}`, class: name, voxels: regions[k].sliceVoxels.reduce((a, b) => a + b, 0),
    first_slice: regions[k].firstSlice, slice_voxels: regions[k].sliceVoxels,
  });
  const table = componentTable || [...fpRegions.map((_, k) => entry('FP', fpRegions, k)), ...fnRegions.map((_, k) => entry('FN', fnRegions, k))];
  const width = componentBytes || (count <= 255 ? 1 : count <= 65535 ? 2 : 4);
  const classEntries = classTable || [
    { name: 'FP', code: 1, rule: 'prediction AND NOT ground truth', voxels: fp.voxels, vertex_range: [0, fp.vertices.length],
      triangle_range: [0, fp.triangles.length], component_range: [1, 1 + fpRegions.length] },
    { name: 'FN', code: 2, rule: 'ground truth AND NOT prediction', voxels: fn.voxels,
      vertex_range: [fp.vertices.length, vertices.length], triangle_range: [fp.triangles.length, triangles.length],
      component_range: [1 + fpRegions.length, 1 + count] },
  ];
  const head = {
    format: 'cardiac-errormesh/2', kind: 'error_voxel_face_surface', builder: 'test', level: 0,
    vertex_count: vertices.length, triangle_count: triangles.length, index_bytes: indexBytes, shape,
    index_convention: 'x=column,y=row,z=slice', frame: 'voxel-index', classes: classEntries, agreement_voxels: 1,
    connectivity, labelling: 'test', component_count: count, component_index_bytes: width, components: table,
    reference_mask_sha256: 'b'.repeat(64), prediction_mask_sha256: 'a'.repeat(64), ...header,
  };
  return pack(head, [[vertices.flat(), 2], [triangles.flat(), indexBytes], [slices, 2], [classBytes || classes, 1], [faceComponents || numbers, width]]);
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

// A box as one class of an error mesh (local indices, `voxels` the box's voxel count).
export function boxClass([x0, y0, z0], [x1, y1, z1]) {
  const { vertices, triangles, slices } = boxMesh([1, 1, 1], [x0, y0, z0], [x1, y1, z1]);
  return { voxels: (x1 - x0) * (y1 - y0) * (z1 - z0), vertices, triangles, slices };
}
