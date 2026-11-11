// node --test mobile/test/  - V2 SCR-05: the pure logic of the 3D Inspector (src/verticals/v2/inspector3d.mjs)
//
// Mesh reference from the id, the `cardiac-mesh/1` header (against a golden built by the Python encoder from a synthetic
// mask), the viewer's messages, pick -> slice (H7), and the push back to SCR-03 with returnParams. No device, no GPU:
// the viewer script itself is exercised in v2_viewer.test.mjs; the screen's rendering in test:render (section 10).
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from '../src/config.mjs';
import { initialNavState, navReducer, NAV, top, validateRoute } from '../src/nav/navigator.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { sliceLabel } from '../src/verticals/v1/explorer.mjs';
import {
  bytesToBase64, gridMatches, LAYER, layerStatus, maskIdForVariant, meshRef, openIn2D, parseMeshHeader, parseViewerMessage,
  screenStatus, SELECTION_NONE, selectionAfterPick, sliceText, toViewer, triangleText,
} from '../src/verticals/v2/inspector3d.mjs';
import { VIEWER_HTML, VIEWER_SCRIPT } from '../src/verticals/v2/viewerSource.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import { GOLDEN, goldenBytes } from './_v2mesh.mjs';
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
  assert.deepEqual(JSON.parse(toViewer.layers(1, 0)), { type: 'layers', prediction: true, groundTruth: false });
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
  assert.deepEqual({ ...selectionAfterPick(pick(44), 88) }, { slice: 44, role: 'prediction', note: null });
  assert.deepEqual({ ...selectionAfterPick(pick(0, 'groundTruth'), 88) }, { slice: 0, role: 'groundTruth', note: null });
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
  assert.deepEqual({ ...SELECTION_NONE }, { slice: null, role: null, note: null });
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
