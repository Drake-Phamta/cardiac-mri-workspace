/*
 * SCR-05 - everything the 3D Inspector decides that is not drawing (V2, Vũ Hùng Anh; skeleton built under the
 * Day 39 recovery override, which the owner completes, measures and defends). Pure, so `node --test` checks the
 * same code Hermes runs.
 *
 *   mesh reference     reconstruction_get answers `mesh_artifact_id` = MESH_<sha256 of the mesh bytes>; the content
 *                      route and the checksum the app must verify (DR-021 rule 1) come from that id alone
 *                      (contracts/api/README.md, "3-D mesh content")
 *   artifact header    the `cardiac-mesh/1` header, read before the bytes go to the WebView (backend/mesh/artifact.py)
 *   viewer messages    what the WebView posts, checked: a malformed message is ignored, never acted on
 *   pick -> slice      H7: a tap resolves to face_source_slice[t] of the first triangle hit; a background tap
 *                      resolves nothing and CLEARS the selection, so nothing can navigate by accident
 *   open in 2D         the push to SCR-03 at the picked slice, same run and variant, with the returnParams that put
 *                      this screen back on the same slice (the 3D plane follows the 2D slice)
 *   layers             prediction and ground truth, each with its own state; ground truth only for a case that has it
 */

export const MESH_FORMAT = 'cardiac-mesh/1';
export const MESH_ID = /^MESH_([0-9a-f]{64})$/;
export const ROLES = Object.freeze({ PREDICTION: 'prediction', GROUND_TRUTH: 'groundTruth' });
export const ROLE_LABEL = Object.freeze({ prediction: 'Prediction', groundTruth: 'Ground truth' });
// The same colours as the 2D overlays (SCR-03 OVERLAY_COLOR): one legend across the app.
export const LAYER_COLOR = Object.freeze({ prediction: '#f0883e', groundTruth: '#39c5cf' });

/* ------------------------------------------------------------------ mesh reference */

/*
 * { contentUrl, checksum } for a mesh_artifact_id, or null when it is not `MESH_<64 hex>` (a Contract 2 package
 * that lists its own mesh uses its own ids: the app has no content route for those and says so).
 */
export function meshRef(basePath, meshArtifactId) {
  const m = typeof meshArtifactId === 'string' ? MESH_ID.exec(meshArtifactId) : null;
  if (!m || typeof basePath !== 'string' || !basePath.startsWith('/')) return null;
  return Object.freeze({ contentUrl: `${basePath.replace(/\/+$/, '')}/artifacts/${m[1]}.cmesh`, checksum: `sha256:${m[1]}` });
}

/* ------------------------------------------------------------------ artifact header */

const ascii = (bytes, from, to) => {
  let out = '';
  for (let i = from; i < to; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
};
const pad4 = (n) => (4 - (n % 4)) % 4;

/*
 * Reads and checks the header of a `cardiac-mesh/1` artifact: magic, JSON, level 0 in the voxel-index frame, and that
 * the sections fill the file exactly. Mirrors backend/mesh/artifact.py read_header. { ok, header } or { ok: false,
 * code, message } - never a throw, so a damaged file is a state, not a crash.
 */
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

/* A mesh must live in the grid of the case it is shown for, and the two layers must share one grid. */
export function gridMatches(header, caseShape) {
  return Boolean(header) && Array.isArray(caseShape) && caseShape.length === 3
    && header.shape.every((v, i) => v === caseShape[i]);
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

/* The messages the screen sends the viewer (viewerSource.mjs protocol). */
export const toViewer = Object.freeze({
  mesh: (role, bytes) => JSON.stringify({ type: 'mesh', role, b64: bytesToBase64(bytes) }),
  layers: (prediction, groundTruth) => JSON.stringify({ type: 'layers', prediction: Boolean(prediction), groundTruth: Boolean(groundTruth) }),
  slice: (index) => JSON.stringify({ type: 'slice', index: Number.isInteger(index) ? index : null }),
  fit: () => JSON.stringify({ type: 'fit' }),
});

/* ------------------------------------------------------------------ viewer -> screen */

/*
 * One message the WebView posted, checked. { kind: 'ready' | 'loaded' | 'error' | 'pick' | 'ignored', ... }.
 * A pick carries `slice` as an integer or null; anything else is ignored (never coerced into a slice).
 */
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

/* ------------------------------------------------------------------ pick -> slice (H7) */

export const SELECTION_NONE = Object.freeze({ slice: null, role: null, note: null });

/*
 * The selection after a pick message. A background tap clears the selection and says so; a slice outside the volume
 * (a viewer that disagrees with the case's shape) is refused and clears it too - nothing is clamped into range. Only a
 * slice inside [0, total) is ever selected, and only it can be opened in 2D.
 */
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

// `10` §3: slice n / total. 1-based for people with the 0-based index the API uses, as SCR-03 prints it.
export function sliceText(slice, total) {
  if (!Number.isInteger(slice) || !Number.isInteger(total)) return 'slice - / -';
  return `slice ${slice + 1} / ${total}  (z = ${slice})`;
}

/*
 * The push to SCR-03 for the selected slice: same case, run and variant, `sliceIndex` = the picked slice.
 * `returnParams` go into THIS screen's stack entry in the same action, so Back from SCR-03 reopens SCR-05 on the slice
 * that was opened (the band on the surface follows the 2D slice). null when nothing valid is selected.
 */
export function openIn2D({ caseId, runId, variant, selection, total }) {
  if (!selection || !Number.isInteger(selection.slice) || !Number.isInteger(total) || selection.slice < 0 || selection.slice >= total) return null;
  if (!caseId || !runId || (variant !== 'RAW' && variant !== 'PROCESSED')) return null;
  return Object.freeze({
    screenId: 'SCR-03',
    params: Object.freeze({ caseId, runId, variant, sliceIndex: selection.slice }),
    returnParams: Object.freeze({ runId, variant, sliceIndex: selection.slice }),
  });
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
