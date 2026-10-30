/*
 * SCR-05 - everything the 3D Inspector decides that is not drawing (V2, Vũ Hùng Anh; skeleton built under the
 * Day 39 recovery override, extended on 2026-10-30 with the 3D error map, DR-005). Pure, so `node --test` checks the
 * same code Hermes runs.
 *
 *   mesh reference     reconstruction_get answers `mesh_artifact_id` = MESH_<sha256 of the mesh bytes> and
 *                      error_reconstruction_get answers `error_mesh_artifact_id` = ERRMESH_<sha256>; the content route
 *                      and the checksum the app must verify (DR-021 rule 1) come from that id alone
 *                      (contracts/api/README.md, "3-D mesh content" and "3-D error mesh")
 *   artifact header    the `cardiac-mesh/1` and `cardiac-errormesh/2` headers, read before the bytes go to the WebView
 *                      (backend/mesh/artifact.py, backend/mesh/error_artifact.py); the error header carries the table of
 *                      connected error REGIONS (FR-3D-008): id, class, voxels and the slices each one contributes to
 *   layers             four: prediction, ground truth, false positive (FP), false negative (FN). FP and FN come from one
 *                      error artifact; each layer has its own state (loading / unavailable / error / ready) and its own
 *                      switch, so a missing error mesh never takes the surfaces down
 *   viewer messages    what the WebView posts, checked: a malformed message is ignored, never acted on
 *   state              one reducer (visible layers, slice plane, selection, camera) - see `inspectorReducer`
 *   pick -> slice      H7: a tap resolves to face_source_slice[t], the class, the region and the voxel of the FIRST triangle
 *                      hit; a background tap resolves nothing and CLEARS the selection, so nothing can navigate by accident
 *   region (FR-3D-008) a tap on an FP / FN face selects its connected region: the panel gives its class, voxel count and
 *                      slices, starts on the tapped slice, and steps through the region's slices (never out of them)
 *   3D -> 2D           "Open in 2D" (SCR-03) at the region's current slice, and for an FP / FN face "Open errors" (SCR-04) at
 *                      it, with the returnParams that put this screen back on the same layers, camera and slice; the picked
 *                      voxel's (column, row) rides along as a marker, only while the slice opened is the slice it was picked in
 *   2D -> 3D           the plane follows the slice SCR-03 / SCR-04 hand in, on entry and (QA #98 N-6) on Back
 *   bytes -> viewer    a mesh goes to the WebView in bounded chunks (`transferPlan`) with its length and sha256, never in
 *                      one message; a layer that is off is not fetched until it is switched on (`layerRequested`)
 */

import { ERROR_CLASS } from '../v1/errorInspector.mjs';

export const MESH_FORMAT = 'cardiac-mesh/1';
export const ERROR_MESH_FORMAT = 'cardiac-errormesh/2';
export const CONNECTIVITIES = Object.freeze([6, 18, 26]);

/*
 * The bounds of one mesh transfer to the WebView (viewerSource.mjs embeds them, so the sender and the receiver cannot
 * disagree):
 *   CHUNK_BYTES       192 KiB of raw bytes = 262,144 base64 characters per message. Small enough to stay far below the message
 *                     sizes at which WebView bridges have stalled or dropped (reports start near 1 MB), large enough that the
 *                     biggest error mesh measured on the Day 39 data (9.8 MB) is 50 chunks. One chunk is converted and posted per
 *                     macrotask, so the JS thread is never held for more than the conversion of one chunk.
 *   MAX_MESH_BYTES    32 MiB: what the page allocates for one reassembly buffer, 3.3 times the biggest mesh measured. A bigger
 *                     announcement is refused (MESH_TOO_LARGE) before anything is allocated.
 *   TRANSFER_IDLE_MS  a transfer that has been quiet this long is dead (MESH_TRANSFER_TIMEOUT): one error for the layer.
 */
export const CHUNK_BYTES = 196608;
export const MAX_MESH_BYTES = 33554432;
export const TRANSFER_IDLE_MS = 20000;
export const MESH_ID = /^MESH_([0-9a-f]{64})$/;
export const ERROR_MESH_ID = /^ERRMESH_([0-9a-f]{64})$/;
export const HEX64 = /^[0-9a-f]{64}$/;

/* ------------------------------------------------------------------ layers: roles, names, colours */

export const ROLES = Object.freeze({
  PREDICTION: 'prediction', GROUND_TRUTH: 'groundTruth', FALSE_POSITIVE: 'falsePositive', FALSE_NEGATIVE: 'falseNegative',
});
// Legend order. The viewer picks in another order (errors first), see viewerSource.mjs PICK_ORDER.
export const ROLE_ORDER = Object.freeze([ROLES.PREDICTION, ROLES.GROUND_TRUTH, ROLES.FALSE_POSITIVE, ROLES.FALSE_NEGATIVE]);
export const ERROR_ROLES = Object.freeze([ROLES.FALSE_POSITIVE, ROLES.FALSE_NEGATIVE]);
// The container the error layers come from, as the viewer names it in `mesh` and `error` messages.
export const ERROR_CONTAINER = 'error';
export const CLASS_OF_ROLE = Object.freeze({ falsePositive: 'FP', falseNegative: 'FN' });
export const ROLE_OF_CLASS = Object.freeze({ FP: 'falsePositive', FN: 'falseNegative' });

// Never colour alone (`10` §7, §9): every layer has a printed name, a printed meaning, a glyph and a printed LOOK in the
// scene (solid, see-through, checkered, striped - the viewer draws FP checkered and FN striped, see viewerSource.mjs), so
// the legend ties each pattern to its class. The FP / FN names, meanings and colours are SCR-04's (ERROR_CLASS): one
// legend across the app.
export const LAYER_INFO = Object.freeze({
  prediction: Object.freeze({ short: 'Prediction', glyph: '■', color: '#f0883e', detail: 'the segmentation the model produced', look: 'drawn solid' }),
  groundTruth: Object.freeze({ short: 'Ground truth', glyph: '□', color: '#39c5cf', detail: 'the reference segmentation', look: 'drawn see-through' }),
  falsePositive: Object.freeze({ short: ERROR_CLASS.FP.label, glyph: '▲', color: ERROR_CLASS.FP.color, detail: ERROR_CLASS.FP.detail, look: 'drawn checkered' }),
  falseNegative: Object.freeze({ short: ERROR_CLASS.FN.label, glyph: '▼', color: ERROR_CLASS.FN.color, detail: ERROR_CLASS.FN.detail, look: 'drawn striped' }),
});
export const LAYER_COLOR = Object.freeze({
  prediction: LAYER_INFO.prediction.color, groundTruth: LAYER_INFO.groundTruth.color,
  falsePositive: LAYER_INFO.falsePositive.color, falseNegative: LAYER_INFO.falseNegative.color,
});
const SURFACE_NAME = Object.freeze({
  prediction: 'the prediction surface', groundTruth: 'the ground-truth surface',
  falsePositive: 'a false-positive (FP) face', falseNegative: 'a false-negative (FN) face',
});

/* ------------------------------------------------------------------ mesh reference */

function refOf(basePath, id, pattern) {
  const m = typeof id === 'string' ? pattern.exec(id) : null;
  if (!m || typeof basePath !== 'string' || !basePath.startsWith('/')) return null;
  return Object.freeze({ contentUrl: `${basePath.replace(/\/+$/, '')}/artifacts/${m[1]}.cmesh`, checksum: `sha256:${m[1]}` });
}

/*
 * { contentUrl, checksum } for a mesh_artifact_id, or null when it is not `MESH_<64 hex>` (a Contract 2 package
 * that lists its own mesh uses its own ids: the app has no content route for those and says so).
 */
export const meshRef = (basePath, meshArtifactId) => refOf(basePath, meshArtifactId, MESH_ID);

/* The same for an error_mesh_artifact_id (`ERRMESH_<64 hex>`): one route, two artifacts, told apart by the id. */
export const errorMeshRef = (basePath, errorMeshArtifactId) => refOf(basePath, errorMeshArtifactId, ERROR_MESH_ID);

/* ------------------------------------------------------------------ artifact headers */

const ascii = (bytes, from, to) => {
  let out = '';
  for (let i = from; i < to; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
};
const pad4 = (n) => (4 - (n % 4)) % 4;
const isCount = (v) => Number.isInteger(v) && v >= 0;

/* Shared by both formats: magic, header length, JSON. { ok: true, header, headerEnd } or { ok: false, code, message }. */
function readContainer(bytes) {
  const bad = (code, message) => ({ ok: false, code, message });
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || ascii(bytes, 0, 8) !== 'CARDMESH') {
    return bad('MESH_MAGIC', 'not a cardiac-mesh artifact');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hlen = view.getUint32(8, true);
  if (hlen % 4 !== 0 || 12 + hlen > bytes.length) return bad('MESH_HEADER', 'header length is not aligned or runs past the end');
  let header;
  try { header = JSON.parse(ascii(bytes, 12, 12 + hlen)); } catch (_e) { return bad('MESH_HEADER', 'header is not JSON'); }
  if (!header || typeof header !== 'object') return bad('MESH_HEADER', 'header is not an object');
  return { ok: true, header, headerEnd: 12 + hlen };
}

function baseChecks(header, format) {
  const bad = (code, message) => ({ ok: false, code, message });
  if (header.format !== format) return bad('MESH_FORMAT', `format is not ${format}`);
  if (!['vertex_count', 'triangle_count', 'index_bytes'].every((k) => isCount(header[k]))
    || !Array.isArray(header.shape) || header.shape.length !== 3 || !header.shape.every((v) => Number.isInteger(v) && v > 0)) {
    return bad('MESH_HEADER', 'counts or shape are not integers');
  }
  if (![2, 4].includes(header.index_bytes) || header.level !== 0 || header.frame !== 'voxel-index'
    || header.index_convention !== 'x=column,y=row,z=slice') {
    return bad('MESH_HEADER', 'unsupported index size, level, frame or index convention');
  }
  return null;
}

/*
 * Reads and checks the header of a `cardiac-mesh/1` artifact: magic, JSON, level 0 in the voxel-index frame, and that
 * the sections fill the file exactly. Mirrors backend/mesh/artifact.py read_header. { ok, header } or { ok: false,
 * code, message } - never a throw, so a damaged file is a state, not a crash.
 */
export function parseMeshHeader(bytes) {
  const c = readContainer(bytes);
  if (!c.ok) return c;
  const problem = baseChecks(c.header, MESH_FORMAT);
  if (problem) return problem;
  const h = c.header;
  let expected = c.headerEnd;
  for (const size of [h.vertex_count * 6, h.triangle_count * 3 * h.index_bytes, h.triangle_count * 2]) expected += size + pad4(size);
  if (expected !== bytes.length) return { ok: false, code: 'MESH_LENGTH', message: `sections need ${expected} bytes, the file has ${bytes.length}` };
  return Object.freeze({ ok: true, header: Object.freeze(h) });
}

const CLASS_TABLE = Object.freeze([['FP', 1], ['FN', 2]]);

const componentBytesFor = (count) => (count <= 0xFF ? 1 : count <= 0xFFFF ? 2 : 4);
const COMPONENT_KEYS = ['class', 'first_slice', 'id', 'slice_voxels', 'voxels'];

/*
 * The region table of an error header (FR-3D-008): a declared connectivity, a table of exactly `component_count` entries named
 * `<class>_<rank>`, contiguous per-class `component_range`s that cover 1..C, the smallest region-number type, and per region a
 * contiguous run of non-empty slices whose counts add up to its voxels and the class's regions to the class's voxels.
 * Mirrors backend/mesh/error_artifact.py _check_component_table. null when it holds, else { ok: false, code, message }.
 */
function checkRegionTable(h) {
  const bad = (message) => ({ ok: false, code: 'MESH_COMPONENTS', message });
  const table = h.components;
  const count = h.component_count;
  if (!CONNECTIVITIES.includes(h.connectivity)) return bad('connectivity must be 6, 18 or 26');
  if (!Array.isArray(table) || !isCount(count) || count !== table.length) return bad('component_count is not the length of the component table');
  if (h.component_index_bytes !== componentBytesFor(count)) return bad(`component_index_bytes must be ${componentBytesFor(count)} (the smallest type that holds ${count})`);
  let at = 1;
  for (let i = 0; i < CLASS_TABLE.length; i += 1) {
    const name = CLASS_TABLE[i][0];
    const span = h.classes[i].component_range;
    if (!Array.isArray(span) || span.length !== 2 || span[0] !== at || !isCount(span[1]) || span[1] < span[0]) return bad(`class ${name}: component_range is not contiguous`);
    if ((h.classes[i].voxels === 0) !== (span[1] === span[0])) return bad(`class ${name}: voxels and regions disagree about being empty`);
    let total = 0;
    for (let c = span[0]; c < span[1]; c += 1) {
      const row = table[c - 1];
      const rank = c - span[0] + 1;
      if (!row || typeof row !== 'object' || Object.keys(row).sort().join() !== COMPONENT_KEYS.join()) return bad(`${name} region ${rank}: keys must be ${COMPONENT_KEYS.join(', ')}`);
      if (row.class !== name || row.id !== `${name}_${String(rank).padStart(4, '0')}`) return bad(`${name} region ${rank}: id or class does not match its place`);
      const per = row.slice_voxels;
      if (!Array.isArray(per) || per.length === 0 || !per.every((n) => isCount(n) && n >= 1) || !isCount(row.first_slice) || row.first_slice + per.length > h.shape[2]) {
        return bad(`${row.id}: slices are not a contiguous run of non-empty slices inside the volume`);
      }
      const sum = per.reduce((a, b) => a + b, 0);
      if (row.voxels !== sum) return bad(`${row.id}: voxels is not the sum of its slice counts`);
      total += sum;
    }
    if (total !== h.classes[i].voxels) return bad(`class ${name}: its regions hold ${total} voxels, the class ${h.classes[i].voxels}`);
    at = span[1];
  }
  return at === count + 1 ? null : bad('the class component ranges do not cover the component table');
}

/*
 * Reads and checks the header of a `cardiac-errormesh/2` artifact. Mirrors backend/mesh/error_artifact.py
 * read_error_header: the container, the class table (FP then FN, codes 1 and 2, contiguous ranges that cover the
 * vertices and the triangles exactly, a class with no voxel an empty range), the region table (checkRegionTable) and the
 * sections (vertices, triangles, source slices, one class byte and one region number per triangle) filling the file. The
 * header names both source masks.
 */
export function parseErrorMeshHeader(bytes) {
  const bad = (code, message) => ({ ok: false, code, message });
  const c = readContainer(bytes);
  if (!c.ok) return c;
  const problem = baseChecks(c.header, ERROR_MESH_FORMAT);
  if (problem) return problem;
  const h = c.header;
  if (!HEX64.test(h.reference_mask_sha256 || '') || !HEX64.test(h.prediction_mask_sha256 || '')) {
    return bad('MESH_HEADER', 'the source mask digests are not sha256');
  }
  if (!Array.isArray(h.classes) || h.classes.length !== CLASS_TABLE.length) return bad('MESH_CLASSES', 'the class table must list FP then FN');
  let vertexAt = 0;
  let triangleAt = 0;
  for (let i = 0; i < CLASS_TABLE.length; i += 1) {
    const [name, code] = CLASS_TABLE[i];
    const e = h.classes[i];
    if (!e || e.name !== name || e.code !== code || !isCount(e.voxels)) return bad('MESH_CLASSES', `class ${name} is malformed`);
    const v = e.vertex_range;
    const t = e.triangle_range;
    if (!Array.isArray(v) || v.length !== 2 || v[0] !== vertexAt || !Number.isInteger(v[1]) || v[1] < v[0]
      || !Array.isArray(t) || t.length !== 2 || t[0] !== triangleAt || !Number.isInteger(t[1]) || t[1] < t[0]) {
      return bad('MESH_CLASSES', `class ${name} ranges are not contiguous`);
    }
    if ((e.voxels === 0) !== (t[1] === t[0]) || (e.voxels === 0) !== (v[1] === v[0])) return bad('MESH_CLASSES', `class ${name}: voxels and faces disagree about being empty`);
    if (t[1] - t[0] > 12 * e.voxels || v[1] - v[0] > 8 * e.voxels) return bad('MESH_CLASSES', `class ${name}: more faces than ${e.voxels} voxels can have`);
    vertexAt = v[1];
    triangleAt = t[1];
  }
  if (vertexAt !== h.vertex_count || triangleAt !== h.triangle_count) return bad('MESH_CLASSES', 'the class ranges do not cover the file');
  const regions = checkRegionTable(h);
  if (regions) return regions;
  let expected = c.headerEnd;
  for (const size of [h.vertex_count * 6, h.triangle_count * 3 * h.index_bytes, h.triangle_count * 2, h.triangle_count, h.triangle_count * h.component_index_bytes]) expected += size + pad4(size);
  if (expected !== bytes.length) return bad('MESH_LENGTH', `sections need ${expected} bytes, the file has ${bytes.length}`);
  return Object.freeze({ ok: true, header: Object.freeze(h) });
}

/*
 * The regions of a parsed error header, one per region number (1..C): `number` (what a pick names), `id`, `cls` and `role`,
 * `voxels`, the contiguous run of slices it contributes to (`firstSlice`..`lastSlice`, `sliceCount`) and `sliceVoxels`, its
 * voxel count on each of them. A connected voxel set has no gap in z, so the run IS the slice list.
 */
export function regionTable(header) {
  if (!header || !Array.isArray(header.components)) return Object.freeze([]);
  return Object.freeze(header.components.map((c, i) => Object.freeze({
    number: i + 1, id: c.id, cls: c.class, role: ROLE_OF_CLASS[c.class], voxels: c.voxels,
    firstSlice: c.first_slice, lastSlice: c.first_slice + c.slice_voxels.length - 1, sliceCount: c.slice_voxels.length,
    sliceVoxels: Object.freeze([...c.slice_voxels]),
  })));
}

export const regionOf = (regions, number) => (Array.isArray(regions) && Number.isInteger(number) && number >= 1 && number <= regions.length ? regions[number - 1] : null);

/* The per-class counts of a parsed error header: { falsePositive: { voxels, triangles }, falseNegative: {...} }. */
export function errorCounts(header) {
  const out = {};
  if (!header || !Array.isArray(header.classes)) return out;
  for (const e of header.classes) {
    const role = ROLE_OF_CLASS[e.name];
    if (role) out[role] = Object.freeze({ voxels: e.voxels, triangles: e.triangle_range[1] - e.triangle_range[0] });
  }
  return Object.freeze(out);
}

/* A mesh must live in the grid of the case it is shown for, and the layers must share one grid. */
export function gridMatches(header, caseShape) {
  return Boolean(header) && Array.isArray(caseShape) && caseShape.length === 3
    && header.shape.every((v, i) => v === caseShape[i]);
}

/*
 * The error mesh must be made from the masks the screen shows (the DR-013a addendum's rule for SCR-04, applied here):
 * `data` is the error_reconstruction_get answer, `predictionMaskId` the run's mask for the variant and
 * `referenceMaskId` the id the server states on a ground-truth slice. null when they agree, else the refusal.
 */
export function errorMaskProblem({ data, variant, predictionMaskId, referenceMaskId }) {
  if (!data || typeof data !== 'object') return { code: 'MASK_MISMATCH', message: 'the error mesh answer is missing' };
  const differs = [];
  if (data.prediction_variant !== variant) differs.push(`variant ${String(data.prediction_variant)} (shown ${variant})`);
  if (data.prediction_mask_id !== predictionMaskId) differs.push(`prediction mask ${String(data.prediction_mask_id)}`);
  if (data.reference_mask_id !== referenceMaskId) differs.push(`reference mask ${String(data.reference_mask_id)}`);
  if (!differs.length) return null;
  return { code: 'MASK_MISMATCH', message: `the error mesh was made from other masks than the ones shown: ${differs.join(', ')}` };
}

/* ------------------------------------------------------------------ bytes -> WebView */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes) {
  const parts = [];
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63]);
    if (parts.length >= 8192) { parts[0] = parts.join(''); parts.length = 1; }
  }
  if (n - i === 1) {
    const v = bytes[i] << 16;
    parts.push(`${B64[(v >> 18) & 63]}${B64[(v >> 12) & 63]}==`);
  } else if (n - i === 2) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8);
    parts.push(`${B64[(v >> 18) & 63]}${B64[(v >> 12) & 63]}${B64[(v >> 6) & 63]}=`);
  }
  return parts.join('');
}

export const MESH_ROLES = Object.freeze(['prediction', 'groundTruth', ERROR_CONTAINER]);

/*
 * The messages of ONE mesh transfer, built one at a time (a nine-megabyte mesh is never a twelve-megabyte string): message 0 is
 * meshStart (role, transfer id `tx`, byte length, chunk size, number of chunks, sha256), messages 1..chunks are the chunks
 * (`seq` 0-based, `chunkBytes` raw bytes each and the last the remainder, base64), message chunks + 1 is meshEnd. `n` is the
 * ordinal of the message in the transfer - the viewer ignores a message it has already taken (both message channels deliver
 * one) and refuses a repeated chunk, an out-of-order one, a missing one. `checksum` is `sha256:<64 hex>`, the one the bytes
 * were verified against (runtime.content). null when the inputs are not a mesh the viewer would accept.
 */
export function transferPlan({ role, bytes, checksum, tx, chunkBytes = CHUNK_BYTES }) {
  if (!MESH_ROLES.includes(role) || !(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_MESH_BYTES) return null;
  if (typeof checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(checksum)) return null;
  if (!Number.isInteger(tx) || tx < 1 || !Number.isInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > CHUNK_BYTES) return null;
  const chunks = Math.ceil(bytes.length / chunkBytes);
  const sha256 = checksum.slice(7);
  return Object.freeze({
    role, tx, bytes: bytes.length, chunks, count: chunks + 2,
    message(i) {
      if (!Number.isInteger(i) || i < 0 || i > chunks + 1) return null;
      if (i === 0) return JSON.stringify({ type: 'meshStart', role, tx, n: 0, bytes: bytes.length, chunk: chunkBytes, chunks, sha256 });
      if (i === chunks + 1) return JSON.stringify({ type: 'meshEnd', role, tx, n: i });
      const seq = i - 1;
      return JSON.stringify({ type: 'meshChunk', role, tx, n: i, seq, b64: bytesToBase64(bytes.subarray(seq * chunkBytes, Math.min(bytes.length, (seq + 1) * chunkBytes))) });
    },
  });
}

/* The messages the screen sends the viewer (viewerSource.mjs protocol). A mesh goes through `transferPlan`, never one message. */
export const toViewer = Object.freeze({
  // the selected error region (its number in the error artifact), or null for none
  highlight: (component) => JSON.stringify({ type: 'highlight', component: Number.isInteger(component) && component >= 1 ? component : null }),
  // `visible` maps each of the four roles to a boolean; anything else is left out and the viewer ignores it.
  layers: (visible) => {
    const out = { type: 'layers' };
    for (const role of ROLE_ORDER) if (visible && role in visible) out[role] = Boolean(visible[role]);
    return JSON.stringify(out);
  },
  slice: (index) => JSON.stringify({ type: 'slice', index: Number.isInteger(index) ? index : null }),
  fit: () => JSON.stringify({ type: 'fit' }),
  // null (nothing to send) unless it is a camera within the limits
  camera: (camera) => {
    const c = sanitizeCamera(camera);
    return c ? JSON.stringify({ type: 'camera', yaw: c.yaw, pitch: c.pitch, zoom: c.zoom, panX: c.pan[0], panY: c.pan[1] }) : null;
  },
});

/* ------------------------------------------------------------------ the camera, as far as the screen keeps it */

// The same bounds the viewer's gestures keep (viewerSource.mjs): a camera outside them is not one the viewer made.
export const CAMERA_LIMITS = Object.freeze({ pitch: 1.45, zoomMin: 0.35, zoomMax: 8, pan: 20 });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/* { yaw, pitch, zoom, pan: [x, y] } if it is a camera within the limits, else null. Nothing is clamped into range. */
export function sanitizeCamera(c) {
  if (!c || typeof c !== 'object') return null;
  const pan = Array.isArray(c.pan) ? c.pan : null;
  if (!finite(c.yaw) || !finite(c.pitch) || !finite(c.zoom) || !pan || pan.length !== 2 || !finite(pan[0]) || !finite(pan[1])) return null;
  if (Math.abs(c.pitch) > CAMERA_LIMITS.pitch || c.zoom < CAMERA_LIMITS.zoomMin || c.zoom > CAMERA_LIMITS.zoomMax
    || Math.abs(pan[0]) > CAMERA_LIMITS.pan || Math.abs(pan[1]) > CAMERA_LIMITS.pan) return null;
  return Object.freeze({ yaw: c.yaw, pitch: c.pitch, zoom: c.zoom, pan: Object.freeze([pan[0], pan[1]]) });
}

/* ------------------------------------------------------------------ viewer -> screen */

/*
 * One message the WebView posted, checked. { kind: 'ready' | 'loaded' | 'error' | 'pick' | 'camera' | 'ignored', ... }.
 * A pick carries `slice` as an integer or null and, for an error face, its class and region number; `column` and `row` are the
 * voxel behind the face (both or neither). Anything else is ignored (never coerced into a slice), and so is a pick whose class
 * disagrees with the layer it names or whose region does not go with its class (a surface face has none, an error face one).
 */
export function parseViewerMessage(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (_e) { return { kind: 'ignored', reason: 'not JSON' }; }
  }
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return { kind: 'ignored', reason: 'no type' };
  const role = ROLE_ORDER.includes(data.role) ? data.role : null;
  switch (data.type) {
    case 'ready': return { kind: 'ready' };
    case 'loaded':
      return role && isCount(data.triangles) && isCount(data.vertices)
        ? { kind: 'loaded', role, triangles: data.triangles, vertices: data.vertices }
        : { kind: 'ignored', reason: 'malformed loaded' };
    case 'error':
      return {
        kind: 'error', role: role || (data.role === ERROR_CONTAINER ? ERROR_CONTAINER : null),
        code: typeof data.code === 'string' ? data.code : 'VIEWER_ERROR',
        message: typeof data.message === 'string' ? data.message.slice(0, 300) : '',
      };
    case 'pick': {
      if (data.slice === null) return { kind: 'pick', role: null, triangle: null, slice: null, cls: null, component: null, column: null, row: null };
      if (!Number.isInteger(data.slice) || data.slice < 0 || !role) return { kind: 'ignored', reason: 'malformed pick' };
      const cls = data.cls === undefined || data.cls === null ? null : data.cls;
      // The class of the face must be the class of the layer: a layer of FP faces cannot name an FN face.
      if (cls !== (CLASS_OF_ROLE[role] || null)) return { kind: 'ignored', reason: 'pick class disagrees with its layer' };
      const component = data.component === undefined || data.component === null ? null : data.component;
      if (cls ? !(Number.isInteger(component) && component >= 1) : component !== null) return { kind: 'ignored', reason: 'pick region does not go with its class' };
      const located = Number.isInteger(data.column) && data.column >= 0 && Number.isInteger(data.row) && data.row >= 0;
      return {
        kind: 'pick', role, triangle: Number.isInteger(data.triangle) ? data.triangle : null, slice: data.slice, cls, component,
        column: located ? data.column : null, row: located ? data.row : null,
      };
    }
    case 'camera': {
      const camera = sanitizeCamera({ yaw: data.yaw, pitch: data.pitch, zoom: data.zoom, pan: [data.panX, data.panY] });
      return camera ? { kind: 'camera', camera } : { kind: 'ignored', reason: 'malformed camera' };
    }
    default: return { kind: 'ignored', reason: `unknown type ${data.type.slice(0, 20)}` };
  }
}

/* ------------------------------------------------------------------ pick -> slice and class (H7) */

export const SELECTION_NONE = Object.freeze({ slice: null, role: null, cls: null, component: null, column: null, row: null, triangle: null, note: null });

/*
 * The selection after a pick message. A background tap clears the selection and says so; a slice outside the volume
 * (a viewer that disagrees with the case's shape) is refused and clears it too - nothing is clamped into range. Only a
 * slice inside [0, total) is ever selected, and only it can be opened in 2D. The class (FP / FN / none) is the one the
 * first triangle hit carries.
 */
export function selectionAfterPick(pick, total) {
  if (!pick || pick.kind !== 'pick') return null;
  if (pick.slice === null) {
    return Object.freeze({ ...SELECTION_NONE, note: 'No surface at that point: nothing selected. Tap the surface to pick a slice.' });
  }
  if (!Number.isInteger(total) || total <= 0 || pick.slice >= total) {
    return Object.freeze({ ...SELECTION_NONE, note: `The pick named slice ${pick.slice}, outside this volume (${total} slices): ignored.` });
  }
  return Object.freeze({
    slice: pick.slice, role: pick.role, cls: pick.cls || null, component: Number.isInteger(pick.component) ? pick.component : null,
    column: Number.isInteger(pick.column) ? pick.column : null, row: Number.isInteger(pick.row) ? pick.row : null,
    triangle: Number.isInteger(pick.triangle) ? pick.triangle : null, note: null,
  });
}

// `10` §3: slice n / total. 1-based for people with the 0-based index the API uses, as SCR-03 prints it.
export function sliceText(slice, total) {
  if (!Number.isInteger(slice) || !Number.isInteger(total)) return 'slice - / -';
  return `slice ${slice + 1} / ${total}  (z = ${slice})`;
}

/*
 * What the plane line says: the slice of the plane and why it is there. Printed, so the band on the surface is never the
 * only way to know the slice (`10` §6: the link is deterministic and visible).
 */
export function planeText(plane, total, source) {
  if (!Number.isInteger(plane) || !Number.isInteger(total)) return 'No slice plane: no 2D slice is selected. Move the slider or tap the surface.';
  const why = source === PLANE_SOURCE.PICK ? 'the picked slice'
    : source === PLANE_SOURCE.REGION ? 'the slice of the selected region you stepped to'
      : source === PLANE_SOURCE.SLIDER ? 'set with the slider' : 'the 2D slice you came from';
  return `Amber plane and band on the surface: slice ${plane + 1} of ${total} (${why}).`;
}

/* What the selection card says about a picked face: its class in words, never by colour alone. */
export function selectionText(selection, total) {
  if (!selection || !Number.isInteger(selection.slice)) return null;
  const what = SURFACE_NAME[selection.role] || 'the surface';
  const meaning = selection.cls ? ` - ${LAYER_INFO[ROLE_OF_CLASS[selection.cls]].detail}` : '';
  return `${sliceText(selection.slice, total)} · picked on ${what}${meaning}`;
}

/*
 * What the region panel says about the selected region (FR-3D-008, UC-09): its id and class in words, its voxel count, the
 * slices it contributes to, the slice the panel is on with its place in the region's list and the region's voxels there, and
 * what each of ◀ ▶ does - a step that would leave the region is disabled and says so, never silent. null without a region.
 */
export function regionPanel({ selection, regionSlice, region, total }) {
  if (!selection || !region || !Number.isInteger(selection.component) || selection.component !== region.number) return null;
  if (!Number.isInteger(regionSlice) || regionSlice < region.firstSlice || regionSlice > region.lastSlice) return null;
  const className = region.cls === 'FP' ? 'false positive' : 'false negative';
  const place = regionSlice - region.firstSlice;
  const span = region.sliceCount === 1 ? `slice ${region.firstSlice + 1}` : `slices ${region.firstSlice + 1}-${region.lastSlice + 1}`;
  const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return Object.freeze({
    title: `${region.id} · ${className} (${region.cls})`,
    summary: `${group(region.voxels)} voxel${region.voxels === 1 ? '' : 's'} on ${region.sliceCount} slice${region.sliceCount === 1 ? '' : 's'} · ${span} of ${total}`,
    position: `${sliceText(regionSlice, total)} · slice ${place + 1} of ${region.sliceCount} of this region${regionSlice === selection.slice ? ' (the tapped slice)' : ''}`,
    onSlice: `${group(region.sliceVoxels[place])} voxel${region.sliceVoxels[place] === 1 ? '' : 's'} of the region on this slice`,
    canPrev: place > 0,
    canNext: place < region.sliceCount - 1,
    prevNote: place > 0 ? null : 'first slice of this region',
    nextNote: place < region.sliceCount - 1 ? null : 'last slice of this region',
  });
}

/*
 * The marker SCR-03 / SCR-04 draw on the exact pixel of the picked voxel (`10` §6): { column, row, sliceIndex } only while
 * the slice being opened or shown IS the slice the voxel was picked in and the pick named its voxel. In every other case the
 * location is not known - the app does not invent a pixel for another slice, a slider move, a region step, or a screen that was
 * not opened from a 3D pick - so there is no marker.
 */
export function markerFor({ selection, slice }) {
  if (!selection || !Number.isInteger(slice) || selection.slice !== slice) return null;
  if (!Number.isInteger(selection.column) || selection.column < 0 || !Number.isInteger(selection.row) || selection.row < 0) return null;
  return Object.freeze({ column: selection.column, row: selection.row, sliceIndex: slice });
}

/* ------------------------------------------------------------------ the state of the screen: one reducer */

/*
 * What the user has done on this screen, and nothing that comes from the server:
 *   visible    the switches the user has set (or Back restored), per role; a role with no entry takes its default
 *   plane      the slice the plane / band marks, or null. It starts as the 2D slice the screen was opened with, moves
 *              with the slider, jumps to the slice of a picked face and follows the region panel's steps; `planeSource`
 *              says which (ENTRY, SLIDER, PICK, REGION)
 *   selection  the picked face (slice, layer, class, region, voxel), or SELECTION_NONE with the note why
 *   regionSlice the slice the region panel is on: the picked slice at first, then wherever ◀ ▶ stepped, always one of the
 *              region's slices (REGION_STEP refuses a step out of them); null with no region selected
 *   camera     the last camera the viewer reported (restored on Back), or null
 * The status of each layer (loading / unavailable / error / ready) is NOT here: it is derived from the calls.
 */
const isSliceIn = (slice, total) => Number.isInteger(slice) && slice >= 0 && Number.isInteger(total) && slice < total;

export const PLANE_SOURCE = Object.freeze({ ENTRY: 'ENTRY', SLIDER: 'SLIDER', PICK: 'PICK', REGION: 'REGION' });

export function sanitizeLayers(layers) {
  const out = {};
  if (layers && typeof layers === 'object') for (const role of ROLE_ORDER) if (typeof layers[role] === 'boolean') out[role] = layers[role];
  return Object.freeze(out);
}

/*
 * The state a screen starts in, from the params its stack entry carries (a fresh push from SCR-03 / SCR-04, or the
 * entry after Back with the returnParams merged in). A slice outside the volume is not used and not clamped.
 */
export function initialInspectorState({ slice = null, layers = null, camera = null, total = null } = {}) {
  const valid = isSliceIn(slice, total);
  return Object.freeze({
    visible: sanitizeLayers(layers),
    plane: valid ? slice : null,
    planeSource: valid ? PLANE_SOURCE.ENTRY : null,
    selection: SELECTION_NONE,
    regionSlice: null,
    camera: sanitizeCamera(camera),
  });
}

export const ACTION = Object.freeze({
  SET_VISIBLE: 'SET_VISIBLE', SLIDE: 'SLIDE', PICK: 'PICK', DESELECT: 'DESELECT', CAMERA: 'CAMERA', REGION_STEP: 'REGION_STEP',
});

export function inspectorReducer(state, action) {
  switch (action && action.type) {
    case ACTION.SET_VISIBLE:
      return ROLE_ORDER.includes(action.role) && typeof action.visible === 'boolean'
        ? Object.freeze({ ...state, visible: Object.freeze({ ...state.visible, [action.role]: action.visible }) })
        : state;
    case ACTION.SLIDE:
      return isSliceIn(action.slice, action.total)
        ? Object.freeze({ ...state, plane: action.slice, planeSource: PLANE_SOURCE.SLIDER }) : state;
    case ACTION.PICK: {
      const selection = selectionAfterPick(action.pick, action.total);
      if (!selection) return state;
      // A face picked: the plane marks its slice, and a region panel (if the face is an error face) starts on it. A background
      // tap or a bad pick clears the selection and leaves the plane.
      return Number.isInteger(selection.slice)
        ? Object.freeze({
          ...state, selection, plane: selection.slice, planeSource: PLANE_SOURCE.PICK,
          regionSlice: Number.isInteger(selection.component) ? selection.slice : null,
        })
        : Object.freeze({ ...state, selection, regionSlice: null });
    }
    case ACTION.DESELECT:
      return Object.freeze({ ...state, selection: SELECTION_NONE, regionSlice: null });
    case ACTION.REGION_STEP: {
      // One slice at a time through the region's own slices; a step that would leave them changes nothing, so the panel can
      // never show a slice the region does not contribute to (and the plane follows it, `10` §6).
      const r = action.region;
      if (!Number.isInteger(state.regionSlice) || !Number.isInteger(state.selection.component) || !r
        || !Number.isInteger(r.firstSlice) || !Number.isInteger(r.lastSlice) || r.number !== state.selection.component) return state;
      if (!Number.isInteger(action.delta) || action.delta === 0) return state;
      const next = state.regionSlice + (action.delta > 0 ? 1 : -1);
      if (next < r.firstSlice || next > r.lastSlice || !isSliceIn(next, action.total)) return state;
      return Object.freeze({ ...state, regionSlice: next, plane: next, planeSource: PLANE_SOURCE.REGION });
    }
    case ACTION.CAMERA: {
      const camera = sanitizeCamera(action.camera);
      return camera ? Object.freeze({ ...state, camera }) : state;
    }
    default:
      return state;
  }
}

/*
 * What the user would see per layer, given the status of each. A switch the user set wins. Otherwise: prediction and
 * the two error layers are on; the ground truth is on only when the error layers are not usable (a disagreement is
 * shown by the two surfaces side by side, as before the error map existed) and off while they are loading or ready (the
 * error layers already say where the two differ). The viewer draws only what has loaded.
 */
export function effectiveVisibility(state, statuses) {
  const unusable = ERROR_ROLES.every((role) => {
    const s = statuses && statuses[role];
    return s && (s.state === LAYER.UNAVAILABLE || s.state === LAYER.ERROR);
  });
  const out = {};
  for (const role of ROLE_ORDER) {
    const explicit = state.visible[role];
    out[role] = typeof explicit === 'boolean' ? explicit : (role === ROLES.GROUND_TRUTH ? unusable : true);
  }
  return Object.freeze(out);
}

/* ------------------------------------------------------------------ 2D <-> 3D: the pushes, Back, and the params a screen starts from */

export function openParams({ caseId, runId, variant, slice, total }) {
  if (!isSliceIn(slice, total) || !caseId || !runId || (variant !== 'RAW' && variant !== 'PROCESSED')) return null;
  return Object.freeze({ caseId, runId, variant, sliceIndex: slice });
}

/*
 * The returnParams of a push from this screen: merged into THIS screen's stack entry in the same action, so Back (which
 * unmounts and remounts it) reopens it on the same layers, camera and slice. `sliceIndex` is the slice the push opens;
 * when the screen that was opened goes Back it may replace it with the slice it ended on (QA #98 N-6, nav
 * `setReturnParams`).
 */
export function returnParamsFor({ runId, variant, slice, visible, camera }) {
  const out = { runId, variant, sliceIndex: slice, layers: sanitizeLayers(visible) };
  const c = sanitizeCamera(camera);
  if (c) out.camera = c;
  return Object.freeze(out);
}

/*
 * The push to SCR-03: same case, run and variant, `sliceIndex` = `slice` (the region panel's current slice, else the picked
 * one). null when nothing valid is selected. `marker` rides in the params exactly when `markerFor` gives one (the slice opened is
 * the slice the voxel was picked in). `visible` and `camera` are what Back must restore.
 */
export function openIn2D({ caseId, runId, variant, selection, slice = null, total, visible = null, camera = null }) {
  if (!selection || !isSliceIn(selection.slice, total)) return null;
  const at = slice === null ? selection.slice : slice;
  const params = openParams({ caseId, runId, variant, slice: at, total });
  if (!params) return null;
  const marker = markerFor({ selection, slice: at });
  return Object.freeze({
    screenId: 'SCR-03', params: marker ? Object.freeze({ ...params, marker }) : params,
    returnParams: returnParamsFor({ runId, variant, slice: at, visible, camera }),
  });
}

/*
 * The push to SCR-04 (Error Inspector) at the slice of a picked FP or FN face (or the slice the region panel is on). Only an
 * error face opens it: a pick on the prediction or the ground-truth surface carries no error class, so there is no error to go
 * and look at. The marker rides along under the same rule as for SCR-03.
 */
export function openErrors({ caseId, runId, variant, selection, slice = null, total, visible = null, camera = null }) {
  if (!selection || !selection.cls || !isSliceIn(selection.slice, total)) return null;
  const at = slice === null ? selection.slice : slice;
  const params = openParams({ caseId, runId, variant, slice: at, total });
  if (!params) return null;
  const marker = markerFor({ selection, slice: at });
  return Object.freeze({
    screenId: 'SCR-04', params: marker ? Object.freeze({ ...params, marker }) : params,
    returnParams: returnParamsFor({ runId, variant, slice: at, visible, camera }),
  });
}

/*
 * What the params of this screen's stack entry say about where to start: the slice (from SCR-03 / SCR-04, or the slice
 * they ended on), the layers and the camera Back restores. Anything malformed is dropped, not repaired.
 */
export function entryFromParams(params, total) {
  const p = params || {};
  const slice = isSliceIn(p.sliceIndex, total) ? p.sliceIndex : null;
  const note = Number.isInteger(p.sliceIndex) && slice === null
    ? `The slice handed in (${p.sliceIndex}) is outside this volume (${total} slices): no plane is shown.` : null;
  return Object.freeze({ slice, layers: sanitizeLayers(p.layers), camera: sanitizeCamera(p.camera), note });
}

/* ------------------------------------------------------------------ layers */

export function maskIdForVariant(run, variant) {
  if (!run) return null;
  const id = variant === 'RAW' ? run.raw_prediction_artifact_id : variant === 'PROCESSED' ? run.processed_prediction_artifact_id : null;
  return typeof id === 'string' && id ? id : null;
}

export const LAYER = Object.freeze({ IDLE: 'IDLE', LOADING: 'LOADING', READY: 'READY', UNAVAILABLE: 'UNAVAILABLE', ERROR: 'ERROR' });

/*
 * What the screen says about one layer, from the state of its steps (reconstruction_get view, bytes view, viewer
 * report). `steps` is an array of app/core screen states in order; the first that is not SUCCESS decides.
 */
export function layerStatus({ wanted = true, idle = false, reason = null, steps = [], viewerLoaded = false, viewerError = null }) {
  if (!wanted) return Object.freeze({ state: LAYER.UNAVAILABLE, reason: reason || 'NOT_APPLICABLE', code: reason || null });
  // A layer that is off and was never asked for is not fetched (layerRequested): it is IDLE until it is switched on.
  if (idle) return Object.freeze({ state: LAYER.IDLE, reason: null, code: null });
  if (viewerError) return Object.freeze({ state: LAYER.ERROR, reason: viewerError.code, code: viewerError.code, message: viewerError.message });
  for (const step of steps) {
    if (!step || step.state === 'LOADING' || step.state === 'PROCESSING') return Object.freeze({ state: LAYER.LOADING, reason: null, code: null });
    if (step.state === 'EMPTY_UNAVAILABLE') return Object.freeze({ state: LAYER.UNAVAILABLE, reason: step.reason, code: step.reason, view: step });
    if (step.state !== 'SUCCESS') {
      // the screen's own safe message rides along, so "error (MASK_MISMATCH)" says what was wrong with what
      const message = step.error && typeof step.error.safeMessage === 'string' ? step.error.safeMessage.slice(0, 200) : undefined;
      return Object.freeze({ state: LAYER.ERROR, reason: step.reason, code: step.reason, message, view: step });
    }
  }
  return Object.freeze({ state: viewerLoaded ? LAYER.READY : LAYER.LOADING, reason: null, code: null });
}

/*
 * Is a layer's mesh to be fetched now? Only a layer that can exist (`wanted`) and is switched on - or was fetched before, so
 * that switching it off and on again does not fetch it twice. The prediction is always requested (it decides the screen);
 * the ground truth is off by default while the error map is usable and costs nothing until the user switches it on.
 */
export const layerRequested = ({ wanted, shown, requestedBefore = false }) => Boolean(wanted) && (Boolean(shown) || Boolean(requestedBefore));

/* The screen's overall state: the prediction decides it (a 3D view without the prediction is not what was asked for). */
export function screenStatus(prediction) {
  switch (prediction.state) {
    case LAYER.READY: return 'success';
    case LAYER.UNAVAILABLE: return 'unavailable';
    case LAYER.ERROR: return 'error';
    default: return 'loading';
  }
}

export function triangleText(n) {
  return Number.isInteger(n) ? `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} triangles` : '- triangles';
}

/*
 * The one line under a layer's name: its state in words (never by colour), with the API's own reason when it is
 * unavailable or failed, and the face count when it is ready. An error class with no voxel is READY with a fact, not a
 * missing layer: "none: no false-positive voxels".
 */
export function layerNote(role, status, { triangles = null, voxels = null } = {}) {
  switch (status.state) {
    case LAYER.IDLE: return role === ROLES.GROUND_TRUTH
      ? 'not loaded: off while the error map is shown - switch it on to load it' : 'not loaded - switch it on to load it';
    case LAYER.LOADING: return 'loading…';
    case LAYER.UNAVAILABLE: return `unavailable (${status.reason || 'no reason given'})`;
    case LAYER.ERROR: return `error (${status.reason || 'unknown'})${status.message ? `: ${status.message}` : ''}`;
    case LAYER.READY:
      if (ERROR_ROLES.includes(role) && voxels === 0) return `none: no ${role === ROLES.FALSE_POSITIVE ? 'false-positive' : 'false-negative'} voxels`;
      return ERROR_ROLES.includes(role) && Number.isInteger(voxels)
        ? `${String(voxels).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} voxels · ${triangleText(triangles)}` : triangleText(triangles);
    default: return '';
  }
}
