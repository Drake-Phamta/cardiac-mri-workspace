// What the 3D Inspector (SCR-05) decides apart from drawing: mesh and error references, the downloaded files,
// viewer messages, tap-to-slice, error markers, the layer states and the words of the bottom panel and the Details
// sheet. Plain JS, so the Node tests check the same code the phone runs. (Which layers are shown, their opacity, the
// cut and Previous / Next are the page's own tools: viewerTools.mjs.)

import { bytesToBase64 } from '../../lib/bytes.mjs';
import { errorClass } from '../../components/tokens.mjs';

export const MESH_FORMAT = 'cardiac-mesh/1';
export const ERRORS_FORMAT = 'cardiac-error-geometry/1';
export const MESH_ID = /^MESH_([0-9a-f]{64})$/;
export const ERRORS_ID = /^ERRGEOM_([0-9a-f]{64})$/;
export const ROLES = Object.freeze({ PREDICTION: 'prediction', GROUND_TRUTH: 'groundTruth', ERRORS: 'errors' });
export const ROLE_LABEL = Object.freeze({ prediction: 'Prediction', groundTruth: 'Ground truth', errors: 'Errors' });
export const VARIANT_LABEL = Object.freeze({ RAW: 'Raw', PROCESSED: 'Processed' });
// The error classes are the colours of the Error Inspector (and of the markers on the surface), so the app has one legend.
export const MARKER_COLOR = Object.freeze({ FN: errorClass.FN, FP: errorClass.FP });
export const ERROR_TITLE = Object.freeze({ FN: 'Missed region (FN)', FP: 'Extra region (FP)' });
export const ERROR_MEANING = Object.freeze({
  FN: 'Ground truth that the prediction left out.',
  FP: 'Predicted where the ground truth has none.',
});

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
  markers: (markers) => JSON.stringify({
    type: 'markers', items: markers.map((m) => ({ id: m.id, cls: m.cls, at: m.at, voxels: m.voxels })),
  }),
  select: (markerId) => JSON.stringify({ type: 'select', id: typeof markerId === 'string' ? markerId : null }),
  slice: (index) => JSON.stringify({ type: 'slice', index: Number.isInteger(index) ? index : null }),
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

// "45 / 88": the slice 1-based, as the app writes it everywhere (the shared formatter of the 2D screens is not on this
// branch yet; same output). The 0-based z index the API uses is for the Details sheet only.
export function sliceReadout(slice, total) {
  return `${Number.isInteger(slice) ? slice + 1 : '-'} / ${Number.isInteger(total) ? total : '-'}`;
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

// What the bottom panel says about the selection, as plain strings (the screen only lays them out): a tapped region
// (what it is in words, its size and slices), a picked surface point, or a hint when nothing is selected.
export function selectionPanel(selection, markers) {
  const marker = selection && selection.marker;
  if (marker) {
    const at = Array.isArray(markers) ? markers.findIndex((m) => m.id === marker.id) : -1;
    return Object.freeze({
      kind: 'marker',
      cls: marker.cls,
      title: ERROR_TITLE[marker.cls],
      meaning: ERROR_MEANING[marker.cls],
      facts: Object.freeze([
        `${thousands(marker.voxels)} voxel${marker.voxels === 1 ? '' : 's'}`,
        marker.zmin === marker.zmax ? `Slice ${marker.zmin + 1}` : `Slices ${marker.zmin + 1}\u2013${marker.zmax + 1}`,
        ...(at >= 0 ? [`Region ${at + 1} of ${markers.length}`] : []),
      ]),
    });
  }
  if (selection && Number.isInteger(selection.slice)) {
    return Object.freeze({
      kind: 'pick',
      cls: null,
      title: `Picked on the ${ROLE_LABEL[selection.role].toLowerCase()}`,
      meaning: 'The 2D slice that produced this part of the surface.',
      facts: Object.freeze([]),
    });
  }
  return Object.freeze({
    kind: 'none',
    cls: null,
    title: null,
    meaning: (selection && selection.note) || 'Tap the surface to pick a slice, or an error marker to see its region.',
    facts: Object.freeze([]),
  });
}

// One plain sentence for each layer that cannot be shown (the codes and messages go to Details). A loading layer says
// nothing: its row appears when it is drawn.
export function layerNotices(groundTruth, errors) {
  const out = [];
  const gone = (status) => status.state === LAYER.UNAVAILABLE || status.state === LAYER.ERROR;
  if (groundTruth.state === LAYER.UNAVAILABLE && groundTruth.reason === 'GROUND_TRUTH_UNAVAILABLE') {
    out.push('This case has no ground truth, so only the prediction is shown.');
    return out;
  }
  if (gone(groundTruth)) out.push('The ground-truth surface is not available.');
  if (gone(errors)) out.push('The error markers are not available for this prediction.');
  return out;
}

const layerLine = (label, status) => {
  if (status.state === LAYER.UNAVAILABLE) return `${label}: unavailable (${status.reason || 'no reason given'})`;
  if (status.state === LAYER.ERROR) return `${label}: error (${status.reason || 'unknown'})${status.message ? `: ${status.message}` : ''}`;
  return null;
};

// The Details sheet: what the main surface leaves out (ids, checksums, counts, indices, the frame). Sections of
// { title, lines }; `surfaces` are the drawn meshes: { label, id, checksum, triangles, vertices }.
export function detailSections({
  caseId, runId, variant, modeLabel, surfaces = [], errorGeometryId = null, markers = null, selection = null,
  statuses = [], geometryNote = null,
}) {
  const sections = [{
    title: 'This view',
    lines: [`Case ${caseId}`, `Run ${runId}`, `Prediction ${variant} · ${modeLabel}`, 'Surface: level L0, undecimated'],
  }];
  const drawn = surfaces.filter((m) => m.id);
  if (drawn.length) {
    sections.push({
      title: 'Surfaces',
      lines: drawn.flatMap((m) => [
        `${m.label} ${m.id}`,
        `${m.label}: ${triangleText(m.triangles)} · ${Number.isInteger(m.vertices) ? `${thousands(m.vertices)} vertices` : '- vertices'}`,
        `${m.label} checksum ${m.checksum || 'not stated'}`,
      ]),
    });
  }
  if (Array.isArray(markers)) {
    sections.push({
      title: 'Error regions',
      lines: [...(errorGeometryId ? [`Error geometry ${errorGeometryId}`] : []), errorSummaryText(markers)],
    });
  }
  if (selection && selection.marker) {
    sections.push({ title: 'Selected region', lines: [selection.marker.id, markerText(selection.marker)] });
  } else if (selection && Number.isInteger(selection.slice)) {
    sections.push({ title: 'Selected slice', lines: [`Slice index z = ${selection.slice} (0-based)`] });
  }
  const problems = statuses.map(([label, status]) => layerLine(label, status)).filter(Boolean);
  if (problems.length) sections.push({ title: 'Layers', lines: problems });
  if (geometryNote) sections.push({ title: 'Frame', lines: [geometryNote] });
  return sections;
}