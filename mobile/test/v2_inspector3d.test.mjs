// node --test mobile/test/  - V2 SCR-05: the pure logic of the 3D Inspector (src/screens/v2-3d/inspector3d.mjs)
//
// Mesh and error references from the id, the `cardiac-mesh/1` header (against a golden built by the Python encoder from
// a synthetic mask), the `cardiac-error-geometry/1` markers, the viewer's messages, pick -> slice (H7), marker -> region,
// the words of the bottom panel and the Details sheet, and the push back to SCR-03 with returnParams. No device, no GPU:
// the viewer script and its tools are exercised in v2_viewer.test.mjs and v2_geometry.test.mjs; the screen's rendering
// in test:render (section 11).
import { bytesToBase64 } from '../src/lib/bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from '../src/config.mjs';
import { initialNavState, navReducer, NAV, top, validateRoute } from '../src/navigation/navigator.mjs';
import { createRuntime } from '../src/api/runtime.mjs';
import {
  AXES_NOTE, detailSections, ERROR_MEANING, ERROR_TITLE, errorSummaryText, errorsRef, gridMatches, hiddenRegionsText, LAYER,
  layerNotices, layerStatus, MARKER_COLOR, MARKER_PX, markerSize, markerText, maskIdForVariant, meshRef, openIn2D,
  parseErrorGeometry, parseMeshHeader, parseViewerMessage, regionList, screenStatus, SELECTION_NONE, selectionAfterPick,
  selectionAfterSmallToggle, selectionForMarker, selectionPanel, SMALL_REGION_FRACTION, toViewer, triangleText,
  VARIANT_LABEL, visibleRegions,
} from '../src/screens/v2-3d/inspector3d.mjs';
import { errorClass } from '../src/components/tokens.mjs';
import { VIEWER_HTML, VIEWER_SCRIPT } from '../src/screens/v2-3d/viewerHtml.mjs';
import { formatSlice, sliceDetail } from '../src/lib/sliceNumber.mjs';
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
  assert.deepEqual(JSON.parse(toViewer.slice(12)), { type: 'slice', index: 12, label: null });
  assert.deepEqual(JSON.parse(toViewer.slice(12, '13')), { type: 'slice', index: 12, label: '13' }, 'the page shows the slice number the app wrote');
  assert.deepEqual(JSON.parse(toViewer.slice(null)), { type: 'slice', index: null, label: null });
  assert.deepEqual(JSON.parse(toViewer.slice(1.5, 7)), { type: 'slice', index: null, label: null });
  assert.deepEqual(JSON.parse(toViewer.insets(56, 190)), { type: 'insets', top: 56, bottom: 190 });
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

test('V2L8 slice numbers come from the one shared formatter: "n / total", 1-based, the z index only in Details', () => {
  assert.equal(formatSlice(44, 88), '45 / 88');
  assert.equal(sliceDetail(44, 88), 'Slice 45 / 88 · z 44');
  // the words of the panel and the Details sheet use it: no slice number is computed in this folder
  const region = selectionPanel(selectionForMarker(markersOf(), 'FN_0001'), markersOf(), 88);
  assert.deepEqual([...region.facts].slice(0, 2), ['523 voxels', 'Slices 11\u201313']);
  assert.equal(selectionPanel(selectionForMarker(markersOf(), 'FN_0001'), markersOf(), null).facts[1], 'Slices -\u2013-', 'a volume that is not known reads "-", never 0');
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

test('V2L18 marker messages: only id, class, position, voxels, drawn size and "small" cross into the page; the page answers with a marker id', () => {
  const sentMarkers = JSON.parse(toViewer.markers(markersOf().map((m) => ({ ...m, caseId: 'CASE_0042' }))));
  assert.deepEqual(sentMarkers.items[0], { id: 'FN_0001', cls: 'FN', at: [150, 150, 11], voxels: 523, size: 28, small: false });
  assert.deepEqual(sentMarkers.items.map((m) => [m.id, m.size, m.small]), [['FN_0001', 28, false], ['FP_0001', 15.3, false], ['FP_0002', 9.9, false]],
    'the regions come with the size they are drawn at (the cube root of their share of the largest)');
  assert.ok(!JSON.stringify(sentMarkers).includes('CASE_'), 'nothing beyond the geometry is copied');
  assert.deepEqual(JSON.parse(toViewer.select('FP_0001')), { type: 'select', id: 'FP_0001' });
  assert.deepEqual(JSON.parse(toViewer.select(undefined)), { type: 'select', id: null });
  assert.deepEqual(JSON.parse(toViewer.dispose()), { type: 'dispose' });
  assert.deepEqual(Object.keys(toViewer).sort(), ['dispose', 'insets', 'markers', 'mesh', 'select', 'slice'], 'the page owns its tools (layers, opacity, cut, views): the app sends data, the selection and the two insets only');
  const p = (o) => parseViewerMessage(JSON.stringify(o));
  assert.deepEqual(p({ type: 'marker', id: 'FN_0001' }), { kind: 'marker', id: 'FN_0001' });
  for (const id of [null, 7, 'TP_0001', 'FN_1', 'FN_0001; x', '']) assert.equal(p({ type: 'marker', id }).kind, 'ignored', String(id));
  assert.deepEqual(p({ type: 'small', on: true }), { kind: 'small', on: true });
  assert.deepEqual(p({ type: 'small', on: false }), { kind: 'small', on: false });
  for (const on of [undefined, null, 1, 'true', 0]) assert.equal(p({ type: 'small', on }).kind, 'ignored', `small ${String(on)}: a switch is a boolean, never coerced`);
  assert.equal(p({ type: 'error', role: 'errors', code: 'VIEWER_ERROR' }).role, 'errors', 'a marker error belongs to the error layer');
  assert.equal(p({ type: 'error', role: 'other', code: 'X' }).role, null);
});

test('V2L19 a marker selects its region: the band and Open in 2D at the marker slice; Details has the z index', () => {
  const markers = markersOf();
  const sel = selectionForMarker(markers, 'FN_0001');
  assert.equal(sel.slice, 11, 'the slice of the marker voxel, which lies inside the region');
  assert.equal(sel.marker.id, 'FN_0001');
  assert.equal(markerText(sel.marker, 88), 'FN, slices 11-13 (z 10-12), 523 voxels');
  assert.equal(markerText(markers[1], 88), 'FP, slice 11 (z 10), 40 voxels');
  assert.equal(markerText({ cls: 'FP', zmin: 0, zmax: 0, voxels: 1 }, 88), 'FP, slice 1 (z 0), 1 voxel');
  assert.equal(markerText({ cls: 'FN', zmin: 1, zmax: 2, voxels: 12345 }, 88), 'FN, slices 2-3 (z 1-2), 12,345 voxels');
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

test('V2L20 the bottom panel says what the selection is in words: a region, a picked point, or a hint', () => {
  const markers = markersOf();
  const region = selectionPanel(selectionForMarker(markers, 'FN_0001'), markers, 88);
  assert.deepEqual([region.kind, region.cls, region.title, region.meaning], ['marker', 'FN', 'Missed region (FN)', 'Ground truth that the prediction left out.']);
  assert.deepEqual([...region.facts], ['523 voxels', 'Slices 11\u201313', 'Region 1 of 3']);
  const extra = selectionPanel(selectionForMarker(markers, 'FP_0001'), markers, 88);
  assert.deepEqual([extra.title, extra.meaning, [...extra.facts]], ['Extra region (FP)', 'Predicted where the ground truth has none.', ['40 voxels', 'Slice 11', 'Region 2 of 3']]);
  assert.deepEqual([...selectionPanel(selectionForMarker([{ ...markers[0], voxels: 1 }], 'FN_0001'), null, 88).facts].slice(0, 1), ['1 voxel'], 'one voxel, in the singular');
  const pick = selectionPanel({ slice: 52, role: 'groundTruth', note: null, marker: null }, markers, 88);
  assert.deepEqual([pick.kind, pick.title], ['pick', 'Picked on the ground truth']);
  const none = selectionPanel(SELECTION_NONE, markers, 88);
  assert.deepEqual([none.kind, none.title], ['none', null]);
  assert.match(none.meaning, /^Tap the surface to pick a slice, or an error marker/);
  assert.match(selectionPanel(selectionAfterPick({ kind: 'pick', slice: null }, 88), markers, 88).meaning, /No surface at that point/, 'a note from a refused tap replaces the hint');
  assert.deepEqual(Object.keys(ERROR_TITLE), ['FN', 'FP']);
  assert.deepEqual({ ...ERROR_MEANING }, { FN: 'Ground truth that the prediction left out.', FP: 'Predicted where the ground truth has none.' });
  assert.deepEqual({ ...VARIANT_LABEL }, { RAW: 'Raw', PROCESSED: 'Processed' });
  const mainSurface = JSON.stringify([region, extra, pick, none]);
  assert.ok(!/FN_0001|FP_0001|z = |MESH_|sha256/.test(mainSurface), 'no id, z index or checksum in the words of the panel');
});

test('V2L21 a layer that cannot be shown gets one plain sentence; its code goes to Details', () => {
  const ready = { state: LAYER.READY };
  const gone = (reason) => ({ state: LAYER.UNAVAILABLE, reason });
  assert.deepEqual(layerNotices(ready, ready), []);
  assert.deepEqual(layerNotices({ state: LAYER.LOADING }, { state: LAYER.LOADING }), [], 'a loading layer says nothing yet');
  assert.deepEqual(layerNotices(gone('GROUND_TRUTH_UNAVAILABLE'), gone('GROUND_TRUTH_UNAVAILABLE')), ['This case has no ground truth, so only the prediction is shown.'], 'one sentence, not two');
  assert.deepEqual(layerNotices(ready, gone('ARTIFACT_NOT_FOUND')), ['The error markers are not available for this prediction.']);
  assert.deepEqual(layerNotices({ state: LAYER.ERROR, reason: 'CONTRACT_DRIFT' }, ready), ['The ground-truth surface is not available.']);
  assert.equal(layerNotices(gone('NO_PREDICTION_MESH_WANTED'), gone('NO_PREDICTION_MESH_WANTED')).length, 2);
});

test('V2L22 the Details sheet takes what the main surface leaves out: ids, checksums, counts, z index, the frame, layer codes', () => {
  const markers = markersOf();
  const sections = detailSections({
    caseId: 'CASE_0029', runId: 'RUN_EXP-D-100_CASE_0029', variant: 'RAW', modeLabel: 'Evaluation', total: 88,
    surfaces: [
      { label: 'Prediction', id: `MESH_${HEX}`, checksum: `sha256:${HEX}`, triangles: 168968, vertices: 84500 },
      { label: 'Ground truth', id: null, checksum: null, triangles: null, vertices: null },
    ],
    errorGeometryId: `ERRGEOM_${HEX}`, markers, selection: selectionForMarker(markers, 'FN_0001'),
    statuses: [['Ground truth', { state: LAYER.UNAVAILABLE, reason: 'ARTIFACT_NOT_FOUND' }], ['Errors', { state: LAYER.READY }]],
    geometryNote: 'Voxel-index frame. Geometry is not validated.',
  });
  const by = Object.fromEntries(sections.map((s) => [s.title, s.lines]));
  assert.deepEqual(Object.keys(by), ['This view', 'Surfaces', 'Error regions', 'Selected region', 'Layers', 'Frame']);
  assert.deepEqual(by.Frame, [AXES_NOTE, 'Voxel-index frame. Geometry is not validated.'], 'the frame says what the corner letters mean, then the geometry note');
  assert.deepEqual(by['This view'], ['Case CASE_0029', 'Run RUN_EXP-D-100_CASE_0029', 'Prediction RAW · Evaluation', 'Surface: level L0, undecimated']);
  assert.deepEqual(by.Surfaces, [`Prediction MESH_${HEX}`, 'Prediction: 168,968 triangles · 84,500 vertices', `Prediction checksum sha256:${HEX}`], 'only a drawn surface is listed');
  assert.deepEqual(by['Error regions'], [`Error geometry ERRGEOM_${HEX}`, '1 FN region (523 voxels) · 2 FP regions (43 voxels)']);
  assert.deepEqual(by['Selected region'], ['FN_0001', 'FN, slices 11-13 (z 10-12), 523 voxels']);
  assert.deepEqual(by.Layers, ['Ground truth: unavailable (ARTIFACT_NOT_FOUND)'], 'a ready layer needs no line');
  assert.equal(new Set(sections.flatMap((s) => s.lines)).size, sections.flatMap((s) => s.lines).length, 'every line is distinct: the sheet keys its rows by the line');
  const slice = detailSections({ caseId: 'C', runId: 'R', variant: 'RAW', modeLabel: 'Evaluation', total: 88, selection: selectionAfterPick({ kind: 'pick', role: 'prediction', slice: 52 }, 88) });
  assert.deepEqual(slice.map((s) => s.title), ['This view', 'Selected slice', 'Frame'], 'the frame is always there: the corner gizmo is always drawn');
  assert.deepEqual(slice[1].lines, ['Slice 53 / 88 · z 52']);
  assert.deepEqual(slice[2].lines, [AXES_NOTE], 'and with no geometry note it is the axes alone');
  assert.match(AXES_NOTE, /voxel axes/);
  assert.match(AXES_NOTE, /x = column, y = row, z = slice/);
});

test('V2L23 the panel marks the error classes with the Error Inspector colours (the page takes the same from the tokens)', () => {
  assert.deepEqual({ ...MARKER_COLOR }, { FN: errorClass.FN, FP: errorClass.FP });
});

// ---- many regions: marker size, the small regions, the order, the words about what is hidden --------------------------

// The 64 regions of CASE_0029 (EXP-D-100 Raw), by voxel count: 3 FN and 61 FP, 166,461 and 109,714 voxels in all.
const CASE_0029_FN = [164622, 1822, 17];
const CASE_0029_FP = [99420, 2111, 1100, 1075, 796, 568, 447, 445, 245, 228, 196, 176, 166, 158, 150, 150, 142, 133, 130, 127, 111, 107, 98, 98, 97, 95, 94, 92,
  86, 81, 71, 71, 70, 69, 57, 53, 49, 47, 43, 39, 35, 33, 22, 20, 20, 19, 14, 13, 13, 9, 8, 5, 2, 2, 2, 1, 1, 1, 1, 1, 1];
// Through the real parser, as the screen gets them: the server's order (FN first, then FP, each largest first).
const case0029 = () => {
  const component = (cls, n, voxels, i) => ({ id: `${cls}_${String(n + 1).padStart(4, '0')}`, class: cls, voxel_count: voxels, slice_range: [30, 30], marker_voxel: [100 + i, 200, 30] });
  const components = [...CASE_0029_FN.map((v, n) => component('FN', n, v, n)), ...CASE_0029_FP.map((v, n) => component('FP', n, v, n + 3))];
  return parseErrorGeometry(errorsOf({ components }), { shape: SHAPE, surfaceMeshId: SURFACE }).markers;
};

test('V2L24 marker size is the cube root of the region size: 6 px for a tiny region, 28 px (the old size) for the largest', () => {
  assert.deepEqual({ ...MARKER_PX }, { min: 6, max: 28 });
  assert.equal(markerSize(164622, 164622), 28, 'the largest region of the case: the full size');
  assert.equal(markerSize(1, 164622), 6.4, 'one voxel beside a 164,622-voxel region: a small dot');
  assert.equal(markerSize(99420, 164622), 24.6);
  assert.equal(markerSize(824, 164622), 9.8, 'a region at the small limit is under 10 px');
  // a cube root: eight times the voxels is twice the way from the minimum to the maximum
  assert.equal(markerSize(1000, 8000) - 6, (markerSize(8000, 8000) - 6) / 2);
  let last = 0;
  for (let v = 1; v <= 5000; v += 7) { const size = markerSize(v, 5000); assert.ok(size >= last, `grows with the region: ${v}`); last = size; }
  // never outside [min, max], never NaN
  assert.equal(markerSize(10, 5), 28, 'larger than the largest cannot happen; it is clamped');
  for (const [v, big] of [[0, 100], [-3, 100], [5, 0], [NaN, 100], [5, NaN], [undefined, undefined]]) assert.equal(markerSize(v, big), 6, `${v} / ${big}`);
});

test('V2L25 small = fewer voxels than 0.5 % of the largest region; the largest is never small; the list runs largest first', () => {
  assert.equal(SMALL_REGION_FRACTION, 0.005);
  const regions = regionList(case0029());
  assert.equal(regions.length, 64);
  assert.deepEqual(regions.slice(0, 6).map((m) => [m.id, m.voxels, m.small]),
    [['FN_0001', 164622, false], ['FP_0001', 99420, false], ['FP_0002', 2111, false], ['FN_0002', 1822, false], ['FP_0003', 1100, false], ['FP_0004', 1075, false]]);
  assert.ok(regions.slice(6).every((m) => m.small), 'every other region is under 823.1 voxels');
  assert.equal(regions.filter((m) => m.small).length, 58);
  assert.equal(regions[6].voxels, 796, 'the largest small region');
  assert.deepEqual(regions.map((m) => m.voxels), [...regions.map((m) => m.voxels)].sort((a, b) => b - a), 'largest first');
  assert.equal(regions.find((m) => m.voxels === 17).id, 'FN_0003', 'an FN region is as small as an FP one: the rule is by size, not by class');
  // equal sizes keep the server's order (the two 150-voxel regions, the six one-voxel regions)
  const ones = regions.filter((m) => m.voxels === 1).map((m) => m.id);
  assert.deepEqual(ones, [...ones].sort(), 'ties keep the server order');
  // the sizes the markers are drawn at
  assert.deepEqual(regions.slice(0, 3).map((m) => m.size), [28, 24.6, 11.1]);
  assert.equal(regions[63].size, 6.4);
  // the limit: 0.5 % of 2,000 is 10: ten voxels stay, nine are small
  const edge = regionList([{ id: 'FN_0001', cls: 'FN', voxels: 2000 }, { id: 'FP_0001', cls: 'FP', voxels: 10 }, { id: 'FP_0002', cls: 'FP', voxels: 9 }]);
  assert.deepEqual(edge.map((m) => m.small), [false, false, true]);
  // the largest region always stays, whatever its size: a nearly perfect prediction still shows its biggest error
  for (const n of [1, 3, 40, 100000]) assert.equal(regionList([{ id: 'FN_0001', cls: 'FN', voxels: n }])[0].small, false, `${n}`);
  assert.deepEqual([...regionList([])], []);
  assert.deepEqual([...regionList(null)], []);
  // it does not change what it is given, and running it twice gives the same list (the message and the screen both apply it)
  const raw = case0029();
  const once = regionList(raw);
  assert.equal(raw[0].small, undefined);
  assert.deepEqual(regionList(once).map((m) => [m.id, m.size, m.small]), once.map((m) => [m.id, m.size, m.small]));
  // and the message to the page carries that list: largest first, with sizes and the small flag, even if handed unsorted
  const sent = JSON.parse(toViewer.markers([...raw].reverse())).items;
  assert.deepEqual(sent.map((m) => [m.voxels, m.size, m.small]), once.map((m) => [m.voxels, m.size, m.small]));
  assert.deepEqual(JSON.parse(toViewer.markers(once)).items.map((m) => m.id), once.map((m) => m.id), 'a list the screen already ordered is sent as it is');
});

test('V2L26 regions shown: the small ones are left out until switched on; the panel says how many are hidden and the totals stay true', () => {
  const regions = regionList(case0029());
  assert.equal(visibleRegions(regions, false).length, 6);
  assert.equal(visibleRegions(regions, true).length, 64);
  assert.deepEqual(visibleRegions(regions, false).map((m) => m.id), ['FN_0001', 'FP_0001', 'FP_0002', 'FN_0002', 'FP_0003', 'FP_0004']);
  assert.deepEqual(visibleRegions(null, false), []);
  assert.equal(hiddenRegionsText(regions, false), '58 small regions hidden (under 824 voxels)');
  assert.equal(hiddenRegionsText(regions, true), null, 'switched on: nothing is hidden');
  assert.equal(hiddenRegionsText(regionList(markersOf()), false), null, 'a case with no small region says nothing');
  assert.equal(hiddenRegionsText(null, false), null);
  const one = regionList([{ id: 'FN_0001', cls: 'FN', voxels: 5000 }, { id: 'FP_0001', cls: 'FP', voxels: 3 }]);
  assert.equal(hiddenRegionsText(one, false), '1 small region hidden (under 25 voxels)', 'one region, in the singular');
  // the totals ignore the switch: all 64 regions and every voxel
  assert.equal(errorSummaryText(regions), '3 FN regions (166,461 voxels) · 61 FP regions (109,714 voxels)');
  // "Region k of N" is over the regions shown, largest first
  const at = (id, showSmall) => selectionPanel(selectionForMarker(regions, id), regions, 88, showSmall);
  assert.deepEqual([...at('FN_0001', false).facts].pop(), 'Region 1 of 6');
  assert.deepEqual([...at('FP_0002', false).facts].pop(), 'Region 3 of 6');
  assert.deepEqual([...at('FP_0004', false).facts].pop(), 'Region 6 of 6');
  assert.deepEqual([...at('FP_0002', true).facts].pop(), 'Region 3 of 64');
  assert.deepEqual([...at('FN_0003', true).facts].pop(), 'Region 49 of 64', 'with the small regions on they join the walk by size (17 voxels: after the 48 larger regions)');
  assert.equal([...at('FN_0003', false).facts].length, 2, 'a region that is hidden has no place among the regions shown');
  // the words for what is hidden: with a region selected and with nothing selected, not with a picked point
  assert.equal(at('FN_0001', false).hidden, '58 small regions hidden (under 824 voxels)');
  assert.equal(at('FN_0001', true).hidden, null);
  assert.equal(selectionPanel(SELECTION_NONE, regions, 88).hidden, '58 small regions hidden (under 824 voxels)', 'off by default');
  assert.equal(selectionPanel(SELECTION_NONE, regions, 88, true).hidden, null);
  assert.equal(selectionPanel({ slice: 5, role: 'prediction', note: null, marker: null }, regions, 88).hidden, null);
  assert.equal(selectionPanel(SELECTION_NONE, null, 88).hidden, null, 'no error markers: nothing to say');
  // Details: the rule, in numbers
  const detail = detailSections({ caseId: 'CASE_0029', runId: 'R', variant: 'RAW', modeLabel: 'Evaluation', total: 88, markers: regions })
    .find((s) => s.title === 'Error regions').lines;
  assert.deepEqual(detail, ['3 FN regions (166,461 voxels) · 61 FP regions (109,714 voxels)', 'Small regions: 58 of 64, under 824 voxels (0.5 % of the largest region, 164,622)']);
});

test('V2L27 switching the small regions off while one is selected leaves nothing selected; a larger region stays', () => {
  const regions = regionList(case0029());
  const small = selectionForMarker(regions, 'FN_0003');
  const large = selectionForMarker(regions, 'FP_0001');
  assert.equal(small.marker.small, true);
  assert.deepEqual({ ...selectionAfterSmallToggle(small, false) }, { ...SELECTION_NONE });
  assert.equal(selectionAfterSmallToggle(small, true), small, 'switching on changes nothing');
  assert.equal(selectionAfterSmallToggle(large, false), large);
  assert.equal(selectionAfterSmallToggle(SELECTION_NONE, false), SELECTION_NONE);
  assert.equal(selectionAfterSmallToggle({ slice: 4, role: 'prediction', note: null, marker: null }, false).slice, 4, 'a picked slice stays');
});
