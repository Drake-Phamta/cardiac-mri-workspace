// What the 3D Inspector (SCR-05) decides apart from drawing: mesh and error references, the downloaded files,
// viewer messages, tap-to-slice, error markers and the layer states. Plain JS, so the Node tests check the same code
// the phone runs.

import { bytesToBase64 } from '../../lib/bytes.mjs';
import { errorClass, overlay } from '../../components/tokens.mjs';

export const MESH_FORMAT = 'cardiac-mesh/1';
export const ERRORS_FORMAT = 'cardiac-error-geometry/1';
export const MESH_ID = /^MESH_([0-9a-f]{64})$/;
export const ERRORS_ID = /^ERRGEOM_([0-9a-f]{64})$/;
export const ROLES = Object.freeze({ PREDICTION: 'prediction', GROUND_TRUTH: 'groundTruth', ERRORS: 'errors' });
export const ROLE_LABEL = Object.freeze({ prediction: 'Prediction', groundTruth: 'Ground truth', errors: 'Errors' });
// Same colours as the 2D overlays and the Error Inspector, so the whole app has one legend.
export const LAYER_COLOR = Object.freeze({ prediction: overlay.prediction, groundTruth: overlay.groundTruth });
export const MARKER_COLOR = Object.freeze({ FN: errorClass.FN, FP: errorClass.FP });
export const ERROR_MEANING = Object.freeze({
  FN: 'missed: ground truth the prediction left out',
  FP: 'extra: predicted where the ground truth has none',
});

// Opacity steps of a surface layer. The ground truth starts see-through so the solid prediction reads in front.
export const OPACITY_STEPS = Object.freeze([0.3, 0.6, 1]);
export const DEFAULT_OPACITY = Object.freeze({ prediction: 1, groundTruth: 0.3 });
// Camera presets: look at the model from the named side of each voxel axis.
export const VIEW_AXES = Object.freeze(['+x', '-x', '+y', '-y', '+z', '-z']);

// Both ids are <PREFIX>_<sha256 of the bytes>, so the download URL and the checksum come from the id alone.
// Any other id has no content route: null.
function contentRef(basePath, id, pattern, extension) {
  const m = typeof id === 'string' ? pattern.exec(id) : null;
  if (!m || typeof basePath !== 'string' || !basePath.startsWith('/')) return null;
  return Object.freeze({ contentUrl: `${basePath.replace(/\/+$/, '')}/artifacts/${m[1]}.${extension}`, checksum: `sha256:${m[1]}` });
}
export const meshRef = (basePath, meshArtifactId) => contentRef(basePath, meshArtifactId, MESH_ID, 'cmesh');
export const errorsRef = (basePath, errorMeshArtifactId) => contentRef(basePath, errorMeshArtifactId, ERRORS_ID, 'json');

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

const isIndex = (v, below) => Number.isInteger(v) && v >= 0 && v < below;
const MARKER_ID = /^(FN|FP)_\d{4,}$/;

// Checks a downloaded cardiac-error-geometry/1 file (backend/mesh/error_geometry.py, build_error_artifact) and
// returns its markers, in the server's order (FN before FP, largest first). The markers must belong to the surface
// on screen and to this case's grid; one bad component refuses the whole file, nothing is guessed or clamped.
export function parseErrorGeometry(bytes, { shape, surfaceMeshId }) {
  const bad = (code, message) => ({ ok: false, code, message });
  let doc;
  try { doc = JSON.parse(bytes instanceof Uint8Array ? ascii(bytes, 0, bytes.length) : ''); } catch (_e) { return bad('ERRORS_FORMAT', 'the error geometry is not JSON'); }
  if (!doc || doc.format !== ERRORS_FORMAT || doc.frame !== 'voxel-index' || doc.index_convention !== 'x=column,y=row,z=slice') {
    return bad('ERRORS_FORMAT', `format is not ${ERRORS_FORMAT} in the voxel-index frame`);
  }
  if (!Array.isArray(shape) || !Array.isArray(doc.shape) || doc.shape.length !== 3 || !doc.shape.every((v, i) => v === shape[i])) {
    return bad('GEOMETRY_MISMATCH', 'the error geometry was built for another grid than this case');
  }
  if (!surfaceMeshId || doc.surface_mesh_artifact_id !== surfaceMeshId) {
    return bad('ERRORS_OTHER_SURFACE', 'the error markers belong to another surface than the prediction shown');
  }
  if (!Array.isArray(doc.components)) return bad('ERRORS_FORMAT', 'no component list');
  const markers = [];
  for (const c of doc.components) {
    const at = c && c.marker_voxel;
    const range = c && c.slice_range;
    const ok = c && MARKER_ID.test(c.id) && c.id.slice(0, 2) === c.class && Number.isInteger(c.voxel_count) && c.voxel_count > 0
      && Array.isArray(at) && at.length === 3 && at.every((v, i) => isIndex(v, shape[i]))
      && Array.isArray(range) && range.length === 2 && isIndex(range[0], shape[2]) && isIndex(range[1], shape[2])
      && range[0] <= at[2] && at[2] <= range[1];
    if (!ok) return bad('ERRORS_INVALID', `component ${String(c && c.id).slice(0, 20)} is malformed or outside the volume`);
    markers.push(Object.freeze({
      id: c.id, cls: c.class, voxels: c.voxel_count, zmin: range[0], zmax: range[1], slice: at[2], at: Object.freeze([...at]),
    }));
  }
  return Object.freeze({ ok: true, markers: Object.freeze(markers) });
}

// Messages to the WebView page (viewerHtml.mjs reads them). Only geometry in voxel units crosses: no case, run,
// mask or server name, so the page never holds anything that identifies a case.
export const toViewer = Object.freeze({
  mesh: (role, bytes) => JSON.stringify({ type: 'mesh', role, b64: bytesToBase64(bytes) }),
  layers: ({ prediction, groundTruth, errors }) => JSON.stringify({
    type: 'layers', prediction: Boolean(prediction), groundTruth: Boolean(groundTruth), errors: Boolean(errors),
  }),
  opacity: ({ prediction, groundTruth }) => JSON.stringify({ type: 'opacity', prediction, groundTruth }),
  markers: (markers) => JSON.stringify({
    type: 'markers', items: markers.map((m) => ({ id: m.id, cls: m.cls, at: m.at, voxels: m.voxels })),
  }),
  select: (markerId) => JSON.stringify({ type: 'select', id: typeof markerId === 'string' ? markerId : null }),
  slice: (index) => JSON.stringify({ type: 'slice', index: Number.isInteger(index) ? index : null }),
  cut: (on) => JSON.stringify({ type: 'cut', on: Boolean(on) }),
  view: (axis) => JSON.stringify({ type: 'view', axis: VIEW_AXES.includes(axis) ? axis : null }),
  fit: () => JSON.stringify({ type: 'fit' }),
  dispose: () => JSON.stringify({ type: 'dispose' }),
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
      return {
        kind: 'error', role: role || (data.role === ROLES.ERRORS ? ROLES.ERRORS : null),
        code: typeof data.code === 'string' ? data.code : 'VIEWER_ERROR', message: typeof data.message === 'string' ? data.message.slice(0, 300) : '',
      };
    case 'pick': {
      if (data.slice === null) return { kind: 'pick', role: null, triangle: null, slice: null };
      if (!Number.isInteger(data.slice) || data.slice < 0 || !role) return { kind: 'ignored', reason: 'malformed pick' };
      return { kind: 'pick', role, triangle: Number.isInteger(data.triangle) ? data.triangle : null, slice: data.slice };
    }
    case 'marker':
      return typeof data.id === 'string' && MARKER_ID.test(data.id) ? { kind: 'marker', id: data.id } : { kind: 'ignored', reason: 'malformed marker' };
    default: return { kind: 'ignored', reason: `unknown type ${data.type.slice(0, 20)}` };
  }
}

export const SELECTION_NONE = Object.freeze({ slice: null, role: null, note: null, marker: null });

// A tapped (or stepped-to) error marker selects its region: the band and "Open in 2D" go to the marker's slice,
// which is a slice of the region itself (the marker voxel lies inside it). An id the screen does not hold is refused.
export function selectionForMarker(markers, id) {
  const marker = Array.isArray(markers) ? markers.find((m) => m.id === id) : null;
  if (!marker) return Object.freeze({ ...SELECTION_NONE, note: 'That error marker is not in this error geometry: ignored.' });
  return Object.freeze({ slice: marker.slice, role: ROLES.ERRORS, note: null, marker });
}

// The marker after (step 1) or before (step -1) the selected one, in the server's order, wrapping around.
export function stepMarker(markers, selected, step) {
  if (!Array.isArray(markers) || markers.length === 0) return null;
  const at = selected ? markers.findIndex((m) => m.id === selected.id) : -1;
  if (at < 0) return step < 0 ? markers[markers.length - 1] : markers[0];
  return markers[(at + step + markers.length) % markers.length];
}

const slicesOf = (zmin, zmax) => (zmin === zmax ? `slice ${zmin + 1} (z = ${zmin})` : `slices ${zmin + 1}-${zmax + 1} (z = ${zmin}-${zmax})`);
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// "FN, slices 35-42 (z = 34-41), 523 voxels": slices 1-based for people, then the 0-based index SCR-03 prints.
export function markerText(marker) {
  if (!marker) return '';
  return `${marker.cls}, ${slicesOf(marker.zmin, marker.zmax)}, ${thousands(marker.voxels)} voxel${marker.voxels === 1 ? '' : 's'}`;
}

// "3 FN regions (1,020 voxels) · 5 FP regions (184 voxels)"
export function errorSummaryText(markers) {
  if (!Array.isArray(markers)) return '';
  if (markers.length === 0) return 'No FP or FN region: the prediction matches the ground truth voxel for voxel.';
  return ['FN', 'FP'].map((cls) => {
    const mine = markers.filter((m) => m.cls === cls);
    const voxels = mine.reduce((sum, m) => sum + m.voxels, 0);
    return `${mine.length} ${cls} region${mine.length === 1 ? '' : 's'} (${thousands(voxels)} voxels)`;
  }).join(' · ');
}

export function opacityText(value) {
  return `${Math.round(value * 100)}%`;
}

// "Cut at slice": hide the surface above the active slice (the band), so the inside shows there. Without a slice
// there is nothing to cut at.
export function cutStatus(on, slice, total) {
  const available = Number.isInteger(slice) && Number.isInteger(total) && slice >= 0 && slice < total;
  if (!available) {
    return Object.freeze({ available, active: false, label: 'Cut at slice: n/a', note: 'Cut needs a slice: open 3D from a 2D slice, or tap the surface or a marker.' });
  }
  return Object.freeze({
    available, active: Boolean(on), label: `Cut at slice ${slice + 1}: ${on ? 'ON' : 'OFF'}`,
    note: on ? `The surface above slice ${slice + 1} of ${total} is hidden.` : null,
  });
}

// A background tap clears the selection with a note, so a tap never navigates by accident. A slice outside
// [0, total) is refused, not clamped.
export function selectionAfterPick(pick, total) {
  if (!pick || pick.kind !== 'pick') return null;
  if (pick.slice === null) {
    return Object.freeze({ ...SELECTION_NONE, note: 'No surface at that point: nothing selected. Tap the surface to pick a slice.' });
  }
  if (!Number.isInteger(total) || total <= 0 || pick.slice >= total) {
    return Object.freeze({ ...SELECTION_NONE, note: `The pick named slice ${pick.slice}, outside this volume (${total} slices): ignored.` });
  }
  return Object.freeze({ slice: pick.slice, role: pick.role, note: null, marker: null });
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
  return Number.isInteger(n) ? `${thousands(n)} triangles` : '- triangles';
}
