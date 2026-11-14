// What the 3D Inspector (SCR-05) decides apart from drawing: mesh references, the mesh file header, viewer messages,
// tap-to-slice and the layer states. Plain JS, so the Node tests check the same code the phone runs.

import { bytesToBase64 } from '../../lib/bytes.mjs';

export const MESH_FORMAT = 'cardiac-mesh/1';
export const MESH_ID = /^MESH_([0-9a-f]{64})$/;
export const ROLES = Object.freeze({ PREDICTION: 'prediction', GROUND_TRUTH: 'groundTruth' });
export const ROLE_LABEL = Object.freeze({ prediction: 'Prediction', groundTruth: 'Ground truth' });
// Same colours as the 2D overlays on SCR-03, so the whole app has one legend.
export const LAYER_COLOR = Object.freeze({ prediction: '#f0883e', groundTruth: '#39c5cf' });

// The id is MESH_<sha256 of the mesh bytes>, so both the download URL and the checksum come from the id alone.
// Any other id has no content route: null.
export function meshRef(basePath, meshArtifactId) {
  const m = typeof meshArtifactId === 'string' ? MESH_ID.exec(meshArtifactId) : null;
  if (!m || typeof basePath !== 'string' || !basePath.startsWith('/')) return null;
  return Object.freeze({ contentUrl: `${basePath.replace(/\/+$/, '')}/artifacts/${m[1]}.cmesh`, checksum: `sha256:${m[1]}` });
}

const ascii = (bytes, from, to) => {
  let out = '';
  for (let i = from; i < to; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
};
const pad4 = (n) => (4 - (n % 4)) % 4;

// Checks a cardiac-mesh/1 file with the same rules as read_header in backend/mesh/artifact.py. It returns
// { ok: false, code, message } instead of throwing, so a damaged file becomes a screen state, not a crash.
export function parseMeshHeader(bytes) {
  const bad = (code, message) => ({ ok: false, code, message });
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || ascii(bytes, 0, 8) !== 'CARDMESH') {
    return bad('MESH_MAGIC', 'not a cardiac-mesh artifact');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hlen = view.getUint32(8, true);
  if (hlen % 4 !== 0 || 12 + hlen > bytes.length) return bad('MESH_HEADER', 'header length is not aligned or runs past the end');
  let header;
  try { header = JSON.parse(ascii(bytes, 12, 12 + hlen)); } catch (_e) { return bad('MESH_HEADER', 'header is not JSON'); }
  if (!header || typeof header !== 'object' || header.format !== MESH_FORMAT) return bad('MESH_FORMAT', `format is not ${MESH_FORMAT}`);
  const ints = ['vertex_count', 'triangle_count', 'index_bytes'];
  if (!ints.every((k) => Number.isInteger(header[k]) && header[k] >= 0)
    || !Array.isArray(header.shape) || header.shape.length !== 3 || !header.shape.every((v) => Number.isInteger(v) && v > 0)) {
    return bad('MESH_HEADER', 'counts or shape are not integers');
  }
  if (![2, 4].includes(header.index_bytes) || header.level !== 0 || header.frame !== 'voxel-index'
    || header.index_convention !== 'x=column,y=row,z=slice') {
    return bad('MESH_HEADER', 'unsupported index size, level, frame or index convention');
  }
  let expected = 12 + hlen;
  for (const size of [header.vertex_count * 6, header.triangle_count * 3 * header.index_bytes, header.triangle_count * 2]) {
    expected += size + pad4(size);
  }
  if (expected !== bytes.length) return bad('MESH_LENGTH', `sections need ${expected} bytes, the file has ${bytes.length}`);
  return Object.freeze({ ok: true, header: Object.freeze(header) });
}

// A mesh must be built on the grid of the case it is shown for, so both layers share one grid.
export function gridMatches(header, caseShape) {
  return Boolean(header) && Array.isArray(caseShape) && caseShape.length === 3
    && header.shape.every((v, i) => v === caseShape[i]);
}

// Messages to the WebView page (viewerHtml.mjs reads them).
export const toViewer = Object.freeze({
  mesh: (role, bytes) => JSON.stringify({ type: 'mesh', role, b64: bytesToBase64(bytes) }),
  layers: (prediction, groundTruth) => JSON.stringify({ type: 'layers', prediction: Boolean(prediction), groundTruth: Boolean(groundTruth) }),
  slice: (index) => JSON.stringify({ type: 'slice', index: Number.isInteger(index) ? index : null }),
  fit: () => JSON.stringify({ type: 'fit' }),
});

// Checks one message from the WebView. A malformed message becomes { kind: 'ignored' }; a pick slice must be an
// integer or null and is never coerced.
export function parseViewerMessage(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (_e) { return { kind: 'ignored', reason: 'not JSON' }; }
  }
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return { kind: 'ignored', reason: 'no type' };
  const role = data.role === ROLES.PREDICTION || data.role === ROLES.GROUND_TRUTH ? data.role : null;
  switch (data.type) {
    case 'ready': return { kind: 'ready' };
    case 'loaded':
      return role && Number.isInteger(data.triangles) && Number.isInteger(data.vertices)
        ? { kind: 'loaded', role, triangles: data.triangles, vertices: data.vertices }
        : { kind: 'ignored', reason: 'malformed loaded' };
    case 'error':
      return { kind: 'error', role, code: typeof data.code === 'string' ? data.code : 'VIEWER_ERROR', message: typeof data.message === 'string' ? data.message.slice(0, 300) : '' };
    case 'pick': {
      if (data.slice === null) return { kind: 'pick', role: null, triangle: null, slice: null };
      if (!Number.isInteger(data.slice) || data.slice < 0 || !role) return { kind: 'ignored', reason: 'malformed pick' };
      return { kind: 'pick', role, triangle: Number.isInteger(data.triangle) ? data.triangle : null, slice: data.slice };
    }
    default: return { kind: 'ignored', reason: `unknown type ${data.type.slice(0, 20)}` };
  }
}

export const SELECTION_NONE = Object.freeze({ slice: null, role: null, note: null });

// A background tap clears the selection with a note, so a tap never navigates by accident. A slice outside
// [0, total) is refused, not clamped.
export function selectionAfterPick(pick, total) {
  if (!pick || pick.kind !== 'pick') return null;
  if (pick.slice === null) {
    return Object.freeze({ slice: null, role: null, note: 'No surface at that point: nothing selected. Tap the surface to pick a slice.' });
  }
  if (!Number.isInteger(total) || total <= 0 || pick.slice >= total) {
    return Object.freeze({ slice: null, role: null, note: `The pick named slice ${pick.slice}, outside this volume (${total} slices): ignored.` });
  }
  return Object.freeze({ slice: pick.slice, role: pick.role, note: null });
}

// 1-based for people, then the 0-based index the API uses, as SCR-03 prints it.
export function sliceText(slice, total) {
  if (!Number.isInteger(slice) || !Number.isInteger(total)) return 'slice - / -';
  return `slice ${slice + 1} / ${total}  (z = ${slice})`;
}

// The push to SCR-03 at the picked slice, or null. returnParams update this screen's stack entry, so Back from
// SCR-03 reopens it on the same slice.
export function openIn2D({ caseId, runId, variant, selection, total }) {
  if (!selection || !Number.isInteger(selection.slice) || !Number.isInteger(total) || selection.slice < 0 || selection.slice >= total) return null;
  if (!caseId || !runId || (variant !== 'RAW' && variant !== 'PROCESSED')) return null;
  return Object.freeze({
    screenId: 'SCR-03',
    params: Object.freeze({ caseId, runId, variant, sliceIndex: selection.slice }),
    returnParams: Object.freeze({ runId, variant, sliceIndex: selection.slice }),
  });
}

export function maskIdForVariant(run, variant) {
  if (!run) return null;
  const id = variant === 'RAW' ? run.raw_prediction_artifact_id : variant === 'PROCESSED' ? run.processed_prediction_artifact_id : null;
  return typeof id === 'string' && id ? id : null;
}

export const LAYER = Object.freeze({ IDLE: 'IDLE', LOADING: 'LOADING', READY: 'READY', UNAVAILABLE: 'UNAVAILABLE', ERROR: 'ERROR' });

// `steps` are the layer's screen states in order (API call, bytes, ...); the first one that is not SUCCESS decides.
export function layerStatus({ wanted = true, reason = null, steps = [], viewerLoaded = false, viewerError = null }) {
  if (!wanted) return Object.freeze({ state: LAYER.UNAVAILABLE, reason: reason || 'NOT_APPLICABLE', code: reason || null });
  if (viewerError) return Object.freeze({ state: LAYER.ERROR, reason: viewerError.code, code: viewerError.code, message: viewerError.message });
  for (const step of steps) {
    if (!step || step.state === 'LOADING' || step.state === 'PROCESSING') return Object.freeze({ state: LAYER.LOADING, reason: null, code: null });
    if (step.state === 'EMPTY_UNAVAILABLE') return Object.freeze({ state: LAYER.UNAVAILABLE, reason: step.reason, code: step.reason, view: step });
    if (step.state !== 'SUCCESS') return Object.freeze({ state: LAYER.ERROR, reason: step.reason, code: step.reason, view: step });
  }
  return Object.freeze({ state: viewerLoaded ? LAYER.READY : LAYER.LOADING, reason: null, code: null });
}

// The prediction layer decides the whole screen: a 3D view without the prediction is not what the user asked for.
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
