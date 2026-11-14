// node --test mobile/test/  - V2 SCR-05: the pure logic of the 3D Inspector (src/screens/v2-3d/inspector3d.mjs)
//
// Mesh and error references from the id, the `cardiac-mesh/1` header (against a golden built by the Python encoder from
// a synthetic mask), the `cardiac-error-geometry/1` markers, the viewer's messages, pick -> slice (H7), marker -> region,
// the cut, and the push back to SCR-03 with returnParams. No device, no GPU: the viewer script itself is exercised in
// v2_viewer.test.mjs; the screen's rendering in test:render (section 11).
import { bytesToBase64 } from '../src/lib/bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from '../src/config.mjs';
import { initialNavState, navReducer, NAV, top, validateRoute } from '../src/navigation/navigator.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import { sliceLabel } from '../src/screens/v1-cases/cases.mjs';
import {
  cutStatus, DEFAULT_OPACITY, errorSummaryText, errorsRef, gridMatches, LAYER, LAYER_COLOR, layerStatus, MARKER_COLOR,
  markerText, maskIdForVariant, meshRef, OPACITY_STEPS, opacityText, openIn2D, parseErrorGeometry, parseMeshHeader,
  parseViewerMessage, screenStatus, SELECTION_NONE, selectionAfterPick, selectionForMarker, sliceText, stepMarker,
  toViewer, triangleText, VIEW_AXES,
} from '../src/screens/v2-3d/inspector3d.mjs';
import { errorClass, overlay } from '../src/components/tokens.mjs';
import { VIEWER_HTML, VIEWER_SCRIPT } from '../src/screens/v2-3d/viewerHtml.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { encodeErrors, ERROR_COMPONENTS, GOLDEN, goldenBytes } from './_v2mesh.mjs';
const HEX = 'ab'.repeat(32);

test('V2L1 a mesh id is MESH_<sha256>: it names the content route and the checksum to verify', () => {
  assert.deepEqual({ ...meshRef('/api/v1', `MESH_${HEX}`) }, { contentUrl: `/api/v1/artifacts/${HEX}.cmesh`, checksum: `sha256:${HEX}` });
  assert.equal(meshRef('/api/v1/', `MESH_${HEX}`).contentUrl, `/api/v1/artifacts/${HEX}.cmesh`);
  for (const bad of [null, undefined, '', 'MESH_', `MESH_${HEX.slice(1)}`, `MESH_${HEX.toUpperCase()}`, `mesh_${HEX}`, `ART_${HEX}`, `MESH_${HEX}.png`, 7]) {
    assert.equal(meshRef('/api/v1', bad), null, String(bad));
  }
  assert.equal(meshRef('api/v1', `MESH_${HEX}`), null, 'a base path is absolute');
});

test('V2L2 the golden artifact (Python encoder, synthetic L-shaped mask) parses; its header says what the frame is', () => {
  const r = parseMeshHeader(goldenBytes());
  assert.equal(r.ok, true);
  assert.deepEqual([...r.header.shape], GOLDEN.shape_xyz);
  assert.equal(r.header.vertex_count, GOLDEN.vertex_count);
  assert.equal(r.header.triangle_count, GOLDEN.triangle_count);
  assert.equal(r.header.index_convention, 'x=column,y=row,z=slice');
  assert.equal(r.header.frame, 'voxel-index');
  assert.equal(r.header.level, 0);
  assert.equal(goldenBytes().length, GOLDEN.bytes);
});

test('V2L3 a damaged artifact is a typed refusal, never a throw', () => {
  const g = goldenBytes();
  const code = (b) => parseMeshHeader(b).code;
  assert.equal(code(Uint8Array.from([...g].map((v, i) => (i < 8 ? 0x41 : v)))), 'MESH_MAGIC');
  assert.equal(code(g.subarray(0, 10)), 'MESH_MAGIC');
  assert.equal(code(null), 'MESH_MAGIC');
  assert.equal(code(g.subarray(0, g.length - 4)), 'MESH_LENGTH');
  assert.equal(code(Uint8Array.from([...g, 0, 0, 0, 0])), 'MESH_LENGTH');
  const longHeader = Uint8Array.from(g);
  new DataView(longHeader.buffer).setUint32(8, 4_000_000, true);
  assert.equal(code(longHeader), 'MESH_HEADER');
  const unaligned = Uint8Array.from(g);
  new DataView(unaligned.buffer).setUint32(8, 7, true);
  assert.equal(code(unaligned), 'MESH_HEADER');
  const text = Buffer.from(g).toString('latin1');
  const other = Uint8Array.from(Buffer.from(text.replace('cardiac-mesh/1', 'cardiac-mesh/9'), 'latin1'));
  assert.equal(code(other), 'MESH_FORMAT');
  const decimated = Uint8Array.from(Buffer.from(text.replace('"level":0', '"level":2'), 'latin1'));
  assert.equal(code(decimated), 'MESH_HEADER', 'only the undecimated level is drawn (DR-008c)');
  const world = Uint8Array.from(Buffer.from(text.replace('"frame":"voxel-index"', '"frame":"world-mm-xxx"'), 'latin1'));
  assert.equal(code(world), 'MESH_HEADER', 'the voxel-index frame is the only frame served');
});

test('V2L4 the mesh must live in the case grid', () => {
  const { header } = parseMeshHeader(goldenBytes());
  assert.equal(gridMatches(header, GOLDEN.shape_xyz), true);
  assert.equal(gridMatches(header, [6, 5, 5]), false);
  assert.equal(gridMatches(header, [5, 6, 4]), false, 'x and y swapped is another grid');
  assert.equal(gridMatches(header, null), false);
  assert.equal(gridMatches(null, GOLDEN.shape_xyz), false);
});

test('V2L5 base64 for the WebView equals the standard encoding, for every length', () => {
  for (let n = 0; n <= 40; n += 1) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
    assert.equal(bytesToBase64(b), Buffer.from(b).toString('base64'), `n=${n}`);
  }
  const big = Uint8Array.from({ length: 300_001 }, (_, i) => (i * 131) & 255);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString('base64'));
  assert.equal(bytesToBase64(goldenBytes()), GOLDEN.bytes_b64);
  const m = JSON.parse(toViewer.mesh('prediction', goldenBytes()));
  assert.deepEqual([m.type, m.role, m.b64], ['mesh', 'prediction', GOLDEN.bytes_b64]);
  assert.deepEqual(JSON.parse(toViewer.layers({ prediction: 1, groundTruth: 0 })), { type: 'layers', prediction: true, groundTruth: false, errors: false });
  assert.deepEqual(JSON.parse(toViewer.slice(12)), { type: 'slice', index: 12 });
  assert.deepEqual(JSON.parse(toViewer.slice(null)), { type: 'slice', index: null });
  assert.deepEqual(JSON.parse(toViewer.slice(1.5)), { type: 'slice', index: null });
  assert.deepEqual(JSON.parse(toViewer.fit()), { type: 'fit' });
});

test('V2L6 viewer messages are checked: a malformed one is ignored, a pick slice is an integer or null, never coerced', () => {
  const p = (o) => parseViewerMessage(typeof o === 'string' ? o : JSON.stringify(o));
  assert.deepEqual(p({ type: 'ready' }), { kind: 'ready' });
  assert.deepEqual(p({ type: 'loaded', role: 'prediction', triangles: 10, vertices: 8 }), { kind: 'loaded', role: 'prediction', triangles: 10, vertices: 8 });
  assert.equal(p({ type: 'loaded', role: 'other', triangles: 10, vertices: 8 }).kind, 'ignored');
  assert.deepEqual(p({ type: 'pick', role: 'groundTruth', triangle: 4, slice: 9 }), { kind: 'pick', role: 'groundTruth', triangle: 4, slice: 9 });
  assert.deepEqual(p({ type: 'pick', role: null, triangle: null, slice: null }), { kind: 'pick', role: null, triangle: null, slice: null });
  for (const bad of [{ type: 'pick', role: 'prediction', slice: '9' }, { type: 'pick', role: 'prediction', slice: 2.5 }, { type: 'pick', role: 'prediction', slice: -1 },
    { type: 'pick', role: 'prediction' }, { type: 'pick', role: 'x', slice: 3 }, { type: 'nope' }, { notype: 1 }, 'not json', '[]', 'null', '7']) {
    assert.equal(p(bad).kind, 'ignored', JSON.stringify(bad));
  }
  const e = p({ type: 'error', code: 'MESH_GRID', message: 'm'.repeat(1000), role: 'groundTruth' });
  assert.deepEqual([e.kind, e.code, e.role, e.message.length], ['error', 'MESH_GRID', 'groundTruth', 300]);
  assert.equal(p({ type: 'error' }).code, 'VIEWER_ERROR');
  assert.equal(parseViewerMessage(null).kind, 'ignored');
  assert.deepEqual(parseViewerMessage({ type: 'ready' }), { kind: 'ready' }, 'an object is accepted as well as a string');
});

test('V2L7 H7: a pick selects the source slice only inside the volume; a background tap clears and says so', () => {
  const pick = (slice, role = 'prediction') => ({ kind: 'pick', role, triangle: 3, slice });
  assert.deepEqual({ ...selectionAfterPick(pick(44), 88) }, { slice: 44, role: 'prediction', note: null, marker: null });
  assert.deepEqual({ ...selectionAfterPick(pick(0, 'groundTruth'), 88) }, { slice: 0, role: 'groundTruth', note: null, marker: null });
  assert.equal(selectionAfterPick(pick(87), 88).slice, 87);
  const bg = selectionAfterPick({ kind: 'pick', role: null, triangle: null, slice: null }, 88);
  assert.equal(bg.slice, null);
  assert.match(bg.note, /No surface at that point: nothing selected/);
  for (const slice of [88, 89, 1000]) {
    const out = selectionAfterPick(pick(slice), 88);
    assert.equal(out.slice, null, `slice ${slice} is outside 88 slices: never selected, never clamped`);
    assert.match(out.note, /outside this volume \(88 slices\)/);
  }
  assert.equal(selectionAfterPick(pick(3), null).slice, null, 'no known volume: no selection');
  assert.equal(selectionAfterPick({ kind: 'ready' }, 88), null, 'only picks are handled');
  assert.deepEqual({ ...SELECTION_NONE }, { slice: null, role: null, note: null, marker: null });
});

test('V2L8 "slice n / total" reads exactly as SCR-03 prints it', () => {
  for (const [z, n] of [[0, 88], [44, 88], [87, 88], [3, 6]]) assert.equal(sliceText(z, n), sliceLabel(z, n));
  assert.equal(sliceText(null, 88), 'slice - / -');
  assert.equal(sliceText(44, 88), 'slice 45 / 88  (z = 44)');
  assert.equal(triangleText(61424), '61,424 triangles');
  assert.equal(triangleText(null), '- triangles');
});

test('V2L9 Open in 2D: SCR-03 at the picked slice, same case, run and variant; Back reopens SCR-05 on that slice', () => {
  const selection = { slice: 44, role: 'prediction', note: null };
  const plan = openIn2D({ caseId: 'CASE_0042', runId: 'RUN_EXP-D-100_CASE_0042', variant: 'RAW', selection, total: 88 });
  assert.equal(plan.screenId, 'SCR-03');
  assert.deepEqual({ ...plan.params }, { caseId: 'CASE_0042', runId: 'RUN_EXP-D-100_CASE_0042', variant: 'RAW', sliceIndex: 44 });
  assert.deepEqual({ ...plan.returnParams }, { runId: 'RUN_EXP-D-100_CASE_0042', variant: 'RAW', sliceIndex: 44 });
  assert.doesNotThrow(() => validateRoute(plan.screenId, plan.params));
  // the real navigator: SCR-03 -> SCR-05 -> SCR-03 and back
  let state = initialNavState('SCR-03', { caseId: 'CASE_0042' });
  state = navReducer(state, { type: NAV.PUSH, screenId: 'SCR-05', params: { caseId: 'CASE_0042', runId: 'RUN_X', variant: 'RAW', sliceIndex: 10 }, returnParams: { runId: 'RUN_X', variant: 'RAW', sliceIndex: 10 } });
  state = navReducer(state, { type: NAV.PUSH, screenId: plan.screenId, params: plan.params, returnParams: plan.returnParams });
  assert.equal(top(state).screenId, 'SCR-03');
  assert.equal(top(state).params.sliceIndex, 44, 'the 2D viewer opens on the picked slice');
  state = navReducer(state, { type: NAV.POP });
  assert.equal(top(state).screenId, 'SCR-05');
  assert.equal(top(state).params.sliceIndex, 44, 'Back: the 3D screen reopens on the slice that was opened, not the one it was entered with');
  assert.equal(top(state).params.variant, 'RAW');
  state = navReducer(state, { type: NAV.POP });
  assert.equal(top(state).screenId, 'SCR-03');
});

test('V2L10 nothing opens without a valid selection, case, run and variant', () => {
  const base = { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'RAW', total: 88 };
  const sel = (slice) => ({ slice, role: 'prediction', note: null });
  assert.equal(openIn2D({ ...base, selection: SELECTION_NONE }), null);
  assert.equal(openIn2D({ ...base, selection: null }), null);
  assert.equal(openIn2D({ ...base, selection: sel(88) }), null, 'outside the volume');
  assert.equal(openIn2D({ ...base, selection: sel(-1) }), null);
  assert.equal(openIn2D({ ...base, selection: sel(2.5) }), null);
  assert.equal(openIn2D({ ...base, selection: sel(3), total: null }), null);
  assert.equal(openIn2D({ ...base, selection: sel(3), variant: null }), null, 'the variant is never defaulted');
  assert.equal(openIn2D({ ...base, selection: sel(3), variant: 'REVIEWED' }), null);
  assert.equal(openIn2D({ ...base, selection: sel(3), runId: '' }), null);
  assert.notEqual(openIn2D({ ...base, selection: sel(0) }), null, 'slice 0 is a slice');
  assert.doesNotThrow(() => validateRoute('SCR-05', { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 5, view: 'error' }));
});

test('V2L11 layers: each says loading, unavailable (with the reason), error or ready; the prediction decides the screen', () => {
  const S = (state, reason = null) => ({ state, reason, data: null, error: null, actions: [] });
  assert.equal(layerStatus({ steps: [S('LOADING')] }).state, LAYER.LOADING);
  assert.equal(layerStatus({ steps: [S('SUCCESS'), S('LOADING')] }).state, LAYER.LOADING);
  const gone = layerStatus({ steps: [S('SUCCESS'), S('EMPTY_UNAVAILABLE', 'ARTIFACT_NOT_FOUND')] });
  assert.deepEqual([gone.state, gone.reason], [LAYER.UNAVAILABLE, 'ARTIFACT_NOT_FOUND'], 'the API reason is kept');
  assert.equal(layerStatus({ steps: [S('RECOVERABLE_ERROR', 'TRANSPORT_UNREACHABLE')] }).state, LAYER.ERROR);
  assert.equal(layerStatus({ steps: [S('FATAL_INVALID', 'CONTRACT_DRIFT')] }).state, LAYER.ERROR);
  assert.equal(layerStatus({ steps: [S('SUCCESS')] }).state, LAYER.LOADING, 'bytes are in but the viewer has not reported the mesh');
  assert.equal(layerStatus({ steps: [S('SUCCESS')], viewerLoaded: true }).state, LAYER.READY);
  const refused = layerStatus({ steps: [S('SUCCESS')], viewerLoaded: true, viewerError: { code: 'MESH_GRID', message: 'x' } });
  assert.deepEqual([refused.state, refused.code], [LAYER.ERROR, 'MESH_GRID'], 'a viewer error beats a loaded mesh');
  const no = layerStatus({ wanted: false, reason: 'GROUND_TRUTH_UNAVAILABLE' });
  assert.deepEqual([no.state, no.reason], [LAYER.UNAVAILABLE, 'GROUND_TRUTH_UNAVAILABLE']);
  assert.equal(screenStatus({ state: LAYER.READY }), 'success');
  assert.equal(screenStatus({ state: LAYER.UNAVAILABLE }), 'unavailable');
  assert.equal(screenStatus({ state: LAYER.ERROR }), 'error');
  assert.equal(screenStatus({ state: LAYER.LOADING }), 'loading');
});

test('V2L12 the prediction mask id is the run\'s own for the variant; none is invented', () => {
  const run = { raw_prediction_artifact_id: 'ART_RAW', processed_prediction_artifact_id: null };
  assert.equal(maskIdForVariant(run, 'RAW'), 'ART_RAW');
  assert.equal(maskIdForVariant(run, 'PROCESSED'), null, 'a RAW-only run has no PROCESSED mesh to ask for');
  assert.equal(maskIdForVariant(run, null), null);
  assert.equal(maskIdForVariant(null, 'RAW'), null);
});

test('V2L13 fixture mode: reconstruction_get is a valid contract state, but no bytes exist behind it - an honest unavailable state', async () => {
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson: readContractJson(), bundleJson: generatedBundleJson() });
  const view = await runtime.client.call('reconstruction_get', { run_id: 'RUN_A', mask_id: 'MASK_A' });
  assert.ok(['SUCCESS', 'EMPTY_UNAVAILABLE'].includes(view.state), `${view.state} ${view.reason}`);
  const missing = await runtime.client.call('reconstruction_get', { run_id: 'RUN_A', source_mask_id: 'MASK_A' });
  assert.equal(missing.reason, 'MISSING_PARAM', 'the path token of reconstruction_get is mask_id (the contract {mask_id}), not source_mask_id');
  const bytes = await runtime.content.bytes(`/api/v1/artifacts/${HEX}.cmesh`, { checksum: `sha256:${HEX}`, kind: 'mesh' });
  assert.equal(bytes.state, 'EMPTY_UNAVAILABLE');
  assert.equal(bytes.reason, 'FIXTURE_NO_BYTES');
});

test('V2L14 the viewer is one self-contained page: no network, no eval, no template literal, one script', () => {
  assert.equal((VIEWER_HTML.match(/<script>/g) || []).length, 1);
  assert.equal((VIEWER_HTML.match(/<\/script>/g) || []).length, 1);
  assert.ok(VIEWER_HTML.includes(VIEWER_SCRIPT));
  assert.equal(VIEWER_SCRIPT.includes('`'), false, 'no template literal: the script is carried in a JS string');
  for (const word of [/\bfetch\b/, /XMLHttpRequest/, /\beval\s*\(/, /new Function/, /\bimport\s*\(/, /https?:\/\//, /WebSocket/, /localStorage/, /document\.cookie/]) {
    assert.equal(word.test(VIEWER_SCRIPT), false, String(word));
  }
  assert.ok(/<meta name="viewport"/.test(VIEWER_HTML) && /touch-action:none/.test(VIEWER_HTML));
});

// ---- error markers (candidate 3: the prediction surface + one marker per FP / FN region) ----------------------------

const SHAPE = [576, 576, 88];
const SURFACE = `MESH_${HEX}`;
const errorsOf = (over = {}) => encodeErrors({ shape: SHAPE, surface: SURFACE, components: ERROR_COMPONENTS, ...over });
const markersOf = () => parseErrorGeometry(errorsOf(), { shape: SHAPE, surfaceMeshId: SURFACE }).markers;

test('V2L15 an error geometry id is ERRGEOM_<sha256>: it names the JSON content route and the checksum', () => {
  assert.deepEqual({ ...errorsRef('/api/v1', `ERRGEOM_${HEX}`) }, { contentUrl: `/api/v1/artifacts/${HEX}.json`, checksum: `sha256:${HEX}` });
  for (const bad of [`MESH_${HEX}`, `ERRGEOM_${HEX.toUpperCase()}`, `ERRGEOM_${HEX}x`, 'ERROR_MESH_ARTIFACT_ID_0043', null]) {
    assert.equal(errorsRef('/api/v1', bad), null, String(bad));
  }
  assert.equal(meshRef('/api/v1', `ERRGEOM_${HEX}`), null, 'an error geometry is never fetched as a mesh');
});

test('V2L16 the error geometry parses into markers in the server order, each inside its own slice range', () => {
  const r = parseErrorGeometry(errorsOf(), { shape: SHAPE, surfaceMeshId: SURFACE });
  assert.equal(r.ok, true);
  assert.deepEqual(r.markers.map((m) => [m.id, m.cls, m.voxels, m.zmin, m.zmax, m.slice, [...m.at]]), [
    ['FN_0001', 'FN', 523, 10, 12, 11, [150, 150, 11]],
    ['FP_0001', 'FP', 40, 10, 10, 10, [200, 120, 10]],
    ['FP_0002', 'FP', 3, 12, 12, 12, [250, 250, 12]],
  ]);
  const empty = parseErrorGeometry(errorsOf({ components: [] }), { shape: SHAPE, surfaceMeshId: SURFACE });
  assert.deepEqual([empty.ok, empty.markers.length], [true, 0], 'no error region is a valid, empty answer');
});

test('V2L17 a wrong error geometry is refused whole with a code: never drawn, never clamped', () => {
  const code = (bytes, opts = {}) => parseErrorGeometry(bytes, { shape: SHAPE, surfaceMeshId: SURFACE, ...opts }).code;
  const one = (patch) => errorsOf({ components: [{ ...ERROR_COMPONENTS[0], ...patch }] });
  assert.equal(code(new Uint8Array(Buffer.from('{not json'))), 'ERRORS_FORMAT');
  assert.equal(code(null), 'ERRORS_FORMAT');
  assert.equal(code(errorsOf({ extra: { format: 'cardiac-error-geometry/2' } })), 'ERRORS_FORMAT');
  assert.equal(code(errorsOf({ extra: { frame: 'world-mm' } })), 'ERRORS_FORMAT', 'only the voxel-index frame is drawn');
  assert.equal(code(errorsOf({ shape: [576, 576, 87] })), 'GEOMETRY_MISMATCH');
  assert.equal(code(errorsOf(), { shape: [576, 576, 89] }), 'GEOMETRY_MISMATCH');
  assert.equal(code(errorsOf({ surface: `MESH_${'cd'.repeat(32)}` })), 'ERRORS_OTHER_SURFACE', 'markers of another surface');
  assert.equal(code(errorsOf({ surface: null })), 'ERRORS_OTHER_SURFACE');
  assert.equal(code(errorsOf(), { surfaceMeshId: null }), 'ERRORS_OTHER_SURFACE', 'no surface on screen, no markers');
  for (const patch of [{ class: 'FP' }, { class: 'F' }, { id: 'TP_0001', class: 'TP' }, { voxel_count: 0 }, { voxel_count: 2.5 },
    { marker_voxel: [576, 1, 11] }, { marker_voxel: [1, 1, 13] }, { marker_voxel: [1, -1, 11] }, { marker_voxel: [1, 1] },
    { slice_range: [12, 10] }, { slice_range: [10, 88] }, { slice_range: '10-12' }]) {
    assert.equal(code(one(patch)), 'ERRORS_INVALID', JSON.stringify(patch));
  }
  assert.equal(code(errorsOf({ extra: { components: 'none' } })), 'ERRORS_FORMAT');
});

test('V2L18 marker messages: only id, class, voxel and size cross into the page; the page answers with a marker id', () => {
  const sentMarkers = JSON.parse(toViewer.markers(markersOf().map((m) => ({ ...m, caseId: 'CASE_0042' }))));
  assert.deepEqual(sentMarkers.items[0], { id: 'FN_0001', cls: 'FN', at: [150, 150, 11], voxels: 523 });
  assert.ok(!JSON.stringify(sentMarkers).includes('CASE_'), 'nothing beyond the geometry is copied');
  assert.deepEqual(JSON.parse(toViewer.select('FP_0001')), { type: 'select', id: 'FP_0001' });
  assert.deepEqual(JSON.parse(toViewer.select(undefined)), { type: 'select', id: null });
  assert.deepEqual(JSON.parse(toViewer.cut(1)), { type: 'cut', on: true });
  assert.deepEqual(VIEW_AXES.map((a) => JSON.parse(toViewer.view(a)).axis), ['+x', '-x', '+y', '-y', '+z', '-z']);
  assert.equal(JSON.parse(toViewer.view('anterior')).axis, null, 'no anatomical view: the frame is voxel indices');
  assert.deepEqual(JSON.parse(toViewer.opacity(DEFAULT_OPACITY)), { type: 'opacity', prediction: 1, groundTruth: 0.3 });
  assert.deepEqual(JSON.parse(toViewer.dispose()), { type: 'dispose' });
  const p = (o) => parseViewerMessage(JSON.stringify(o));
  assert.deepEqual(p({ type: 'marker', id: 'FN_0001' }), { kind: 'marker', id: 'FN_0001' });
  for (const id of [null, 7, 'TP_0001', 'FN_1', 'FN_0001; x', '']) assert.equal(p({ type: 'marker', id }).kind, 'ignored', String(id));
  assert.equal(p({ type: 'error', role: 'errors', code: 'VIEWER_ERROR' }).role, 'errors', 'a marker error belongs to the error layer');
  assert.equal(p({ type: 'error', role: 'other', code: 'X' }).role, null);
});

test('V2L19 a marker selects its region: "FN, slices 11-13", the band and Open in 2D at the marker slice', () => {
  const markers = markersOf();
  const sel = selectionForMarker(markers, 'FN_0001');
  assert.equal(sel.slice, 11, 'the slice of the marker voxel, which lies inside the region');
  assert.equal(sel.marker.id, 'FN_0001');
  assert.equal(markerText(sel.marker), 'FN, slices 11-13 (z = 10-12), 523 voxels');
  assert.equal(markerText(markers[1]), 'FP, slice 11 (z = 10), 40 voxels');
  assert.equal(markerText({ cls: 'FP', zmin: 0, zmax: 0, voxels: 1 }), 'FP, slice 1 (z = 0), 1 voxel');
  assert.equal(markerText({ cls: 'FN', zmin: 1, zmax: 2, voxels: 12345 }), 'FN, slices 2-3 (z = 1-2), 12,345 voxels');
  const plan = openIn2D({ caseId: 'CASE_0042', runId: 'RUN_A', variant: 'RAW', selection: sel, total: 88 });
  assert.deepEqual({ ...plan.params }, { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'RAW', sliceIndex: 11 });
  const unknown = selectionForMarker(markers, 'FN_0009');
  assert.deepEqual([unknown.slice, unknown.marker], [null, null]);
  assert.match(unknown.note, /not in this error geometry/);
  assert.equal(selectionForMarker(null, 'FN_0001').slice, null);
  assert.equal(errorSummaryText(markers), '1 FN region (523 voxels) · 2 FP regions (43 voxels)');
  assert.match(errorSummaryText([]), /No FP or FN region/);
  assert.equal(errorSummaryText(null), '');
});

test('V2L20 Previous / Next step through the regions in the server order and wrap around', () => {
  const markers = markersOf();
  assert.equal(stepMarker(markers, null, 1).id, 'FN_0001', 'Next with nothing selected starts at the first region');
  assert.equal(stepMarker(markers, null, -1).id, 'FP_0002', 'Previous starts at the last');
  assert.equal(stepMarker(markers, markers[0], 1).id, 'FP_0001');
  assert.equal(stepMarker(markers, markers[2], 1).id, 'FN_0001');
  assert.equal(stepMarker(markers, markers[0], -1).id, 'FP_0002');
  assert.equal(stepMarker([], null, 1), null);
  assert.equal(stepMarker(null, null, 1), null);
});

test('V2L21 Cut at slice needs a slice inside the volume, and says what it hides', () => {
  assert.deepEqual({ ...cutStatus(false, 44, 88) }, { available: true, active: false, label: 'Cut at slice 45: OFF', note: null });
  assert.deepEqual({ ...cutStatus(true, 44, 88) }, { available: true, active: true, label: 'Cut at slice 45: ON', note: 'The surface above slice 45 of 88 is hidden.' });
  for (const [slice, total] of [[null, 88], [88, 88], [-1, 88], [2.5, 88], [3, null]]) {
    const c = cutStatus(true, slice, total);
    assert.deepEqual([c.available, c.active, c.label], [false, false, 'Cut at slice: n/a'], `${slice}/${total}`);
  }
});

test('V2L22 one legend for the app: layer and marker colours are the design tokens; three opacity steps', () => {
  assert.deepEqual({ ...LAYER_COLOR }, { prediction: overlay.prediction, groundTruth: overlay.groundTruth });
  assert.deepEqual({ ...MARKER_COLOR }, { FN: errorClass.FN, FP: errorClass.FP });
  assert.deepEqual([...OPACITY_STEPS], [0.3, 0.6, 1]);
  assert.deepEqual({ ...DEFAULT_OPACITY }, { prediction: 1, groundTruth: 0.3 }, 'the ground truth starts see-through');
  assert.deepEqual(OPACITY_STEPS.map(opacityText), ['30%', '60%', '100%']);
  // The page draws the same colours (as 0-1 RGB): FN #4c8dff, FP #f778ba.
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const page = /MARKER_COLORS = \{ FN: \[([^\]]+)\], FP: \[([^\]]+)\] \}/.exec(VIEWER_SCRIPT);
  for (const [cls, list] of [['FN', page[1]], ['FP', page[2]]]) {
    list.split(',').map(Number).forEach((v, i) => assert.ok(Math.abs(v - rgb(errorClass[cls])[i]) < 0.01, `${cls} channel ${i}`));
  }
});