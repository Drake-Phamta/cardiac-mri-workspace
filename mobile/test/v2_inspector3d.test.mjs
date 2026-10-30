// node --test mobile/test/  - V2 SCR-05: the pure logic of the 3D Inspector (src/verticals/v2/inspector3d.mjs)
//
// Mesh references from the ids, the `cardiac-mesh/1` and `cardiac-errormesh/1` headers (against goldens built by the Python
// encoders from synthetic masks), the viewer's messages, the screen's one reducer (switches, plane, selection, camera),
// pick -> slice and class (H7), the pushes to SCR-03 / SCR-04 with returnParams, and the layers' states. No device, no GPU:
// the viewer script itself is exercised in v2_viewer.test.mjs; the screen's rendering in test:render (section 11).
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from '../src/config.mjs';
import { initialNavState, navReducer, NAV, top, validateRoute } from '../src/nav/navigator.mjs';
import { createRuntime } from '../src/runtime/createRuntime.mjs';
import { ERROR_CLASS } from '../src/verticals/v1/errorInspector.mjs';
import { sliceLabel } from '../src/verticals/v1/explorer.mjs';
import {
  ACTION, bytesToBase64, CAMERA_LIMITS, effectiveVisibility, entryFromParams, errorCounts, errorMaskProblem, errorMeshRef,
  gridMatches, initialInspectorState, inspectorReducer, LAYER, LAYER_COLOR, LAYER_INFO, layerNote, layerStatus,
  maskIdForVariant, meshRef, openErrors, openIn2D, parseErrorMeshHeader, parseMeshHeader, parseViewerMessage, planeText,
  PLANE_SOURCE, ROLE_ORDER, ROLES, sanitizeCamera, screenStatus, SELECTION_NONE, selectionAfterPick, selectionText, sliceText,
  toViewer, triangleText,
} from '../src/verticals/v2/inspector3d.mjs';
import { VIEWER_HTML, VIEWER_SCRIPT } from '../src/verticals/v2/viewerSource.mjs';
import { generatedBundleJson, readContractJson } from './_helpers.mjs';
import {
  boxClass, encodeErrorMesh, ERROR_GOLDEN, errorGoldenBytes, GOLDEN, goldenBytes, NO_FACES,
} from './_v2mesh.mjs';

const HEX = 'ab'.repeat(32);
const CAMERA = Object.freeze({ yaw: -0.2, pitch: 0.4, zoom: 2, pan: [0.1, -0.2] });

test('V2L1 a mesh id is MESH_<sha256>, an error mesh id ERRMESH_<sha256>: each names the content route and the checksum to verify', () => {
  assert.deepEqual({ ...meshRef('/api/v1', `MESH_${HEX}`) }, { contentUrl: `/api/v1/artifacts/${HEX}.cmesh`, checksum: `sha256:${HEX}` });
  assert.deepEqual({ ...errorMeshRef('/api/v1', `ERRMESH_${HEX}`) }, { contentUrl: `/api/v1/artifacts/${HEX}.cmesh`, checksum: `sha256:${HEX}` });
  assert.equal(meshRef('/api/v1/', `MESH_${HEX}`).contentUrl, `/api/v1/artifacts/${HEX}.cmesh`);
  assert.equal(errorMeshRef('/api/v1/', `ERRMESH_${HEX}`).contentUrl, `/api/v1/artifacts/${HEX}.cmesh`);
  for (const bad of [null, undefined, '', 'MESH_', `MESH_${HEX.slice(1)}`, `MESH_${HEX.toUpperCase()}`, `mesh_${HEX}`, `ART_${HEX}`, `MESH_${HEX}.png`, 7, `ERRMESH_${HEX}`]) {
    assert.equal(meshRef('/api/v1', bad), null, String(bad));
  }
  for (const bad of [null, undefined, '', 'ERRMESH_', `ERRMESH_${HEX.slice(1)}`, `ERRMESH_${HEX.toUpperCase()}`, `errmesh_${HEX}`, `MESH_${HEX}`, `ERRMESH_${HEX}.png`, 7]) {
    assert.equal(errorMeshRef('/api/v1', bad), null, String(bad));
  }
  assert.equal(meshRef('api/v1', `MESH_${HEX}`), null, 'a base path is absolute');
  assert.equal(errorMeshRef('api/v1', `ERRMESH_${HEX}`), null, 'a base path is absolute');
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
  assert.equal(code(errorGoldenBytes()), 'MESH_FORMAT', 'an error mesh is not a surface mesh');
});

test('V2L4 the mesh must live in the case grid', () => {
  const { header } = parseMeshHeader(goldenBytes());
  assert.equal(gridMatches(header, GOLDEN.shape_xyz), true);
  assert.equal(gridMatches(header, [6, 5, 5]), false);
  assert.equal(gridMatches(header, [5, 6, 4]), false, 'x and y swapped is another grid');
  assert.equal(gridMatches(header, null), false);
  assert.equal(gridMatches(null, GOLDEN.shape_xyz), false);
});

test('V2E1 the error golden (Python encoder, known FP / FN pair) parses: classes, counts, frame and both source masks', () => {
  const r = parseErrorMeshHeader(errorGoldenBytes());
  assert.equal(r.ok, true, r.message);
  const h = r.header;
  assert.deepEqual([...h.shape], ERROR_GOLDEN.shape_xyz);
  assert.deepEqual([h.format, h.frame, h.level, h.index_convention], ['cardiac-errormesh/1', 'voxel-index', 0, 'x=column,y=row,z=slice']);
  assert.deepEqual([h.vertex_count, h.triangle_count, errorGoldenBytes().length], [ERROR_GOLDEN.vertex_count, ERROR_GOLDEN.triangle_count, ERROR_GOLDEN.bytes]);
  assert.deepEqual([h.reference_mask_sha256, h.prediction_mask_sha256], [ERROR_GOLDEN.reference_sha256, ERROR_GOLDEN.prediction_sha256]);
  assert.deepEqual(h.classes.map((c) => [c.name, c.code]), [['FP', 1], ['FN', 2]]);
  // hand-derived in backend/mesh/tests/test_error_artifact.py: FP = a 1x2x2 slab + one voxel, FN = a 2x1x2 slab
  assert.deepEqual(JSON.parse(JSON.stringify(errorCounts(h))), {
    falsePositive: { voxels: 5, triangles: 44 }, falseNegative: { voxels: 4, triangles: 32 },
  });
  assert.equal(h.agreement_voxels, 44);
  assert.equal(parseMeshHeader(goldenBytes()).ok, true);
  assert.equal(parseErrorMeshHeader(goldenBytes()).code, 'MESH_FORMAT', 'a surface mesh is not an error mesh');
});

test('V2E2 a hand-made error mesh parses, zero errors is a fact not a refusal, and every damaged class table is refused with a code', () => {
  const shape = [10, 10, 6];
  const good = encodeErrorMesh({ shape, fp: boxClass([1, 1, 1], [3, 3, 2]), fn: boxClass([5, 5, 3], [6, 6, 5]) });
  const r = parseErrorMeshHeader(good);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(JSON.parse(JSON.stringify(errorCounts(r.header))), {
    falsePositive: { voxels: 4, triangles: 12 }, falseNegative: { voxels: 2, triangles: 12 },
  });
  const none = parseErrorMeshHeader(encodeErrorMesh({ shape }));
  assert.equal(none.ok, true, 'no false positive and no false negative is a valid artifact');
  assert.deepEqual(JSON.parse(JSON.stringify(errorCounts(none.header))), {
    falsePositive: { voxels: 0, triangles: 0 }, falseNegative: { voxels: 0, triangles: 0 },
  });
  const onlyFn = parseErrorMeshHeader(encodeErrorMesh({ shape, fn: boxClass([5, 5, 3], [6, 6, 5]) }));
  assert.equal(onlyFn.ok, true);
  assert.equal(errorCounts(onlyFn.header).falsePositive.voxels, 0);
  const fp = boxClass([1, 1, 1], [3, 3, 2]);
  const fn = boxClass([5, 5, 3], [6, 6, 5]);
  const table = (edit) => {
    const t = JSON.parse(JSON.stringify(parseErrorMeshHeader(good).header.classes));
    edit(t);
    return t;
  };
  const refuse = (bytes, ...codes) => {
    const out = parseErrorMeshHeader(bytes);
    assert.equal(out.ok, false);
    assert.ok(codes.includes(out.code), `${out.code}: ${out.message}`);
  };
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: table((t) => t.reverse()) }), 'MESH_CLASSES');
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[1].code = 3; }) }), 'MESH_CLASSES');
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[1].triangle_range = [10, 24]; }) }), 'MESH_CLASSES');
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[0].voxels = 0; }) }), 'MESH_CLASSES');
  // faces for no voxel, and more faces than the voxels claimed can have (two boxes of 12 triangles for 1 voxel)
  refuse(encodeErrorMesh({ shape, fp, fn: { ...fn, voxels: 0 } }), 'MESH_CLASSES');
  const twoBoxes = (a, b) => ({
    voxels: 1, vertices: [...a.vertices, ...b.vertices], triangles: [...a.triangles, ...b.triangles.map((t) => t.map((i) => i + 8))], slices: [...a.slices, ...b.slices],
  });
  refuse(encodeErrorMesh({ shape, fp: twoBoxes(boxClass([1, 1, 1], [2, 2, 2]), boxClass([4, 4, 1], [5, 5, 2])), fn }), 'MESH_CLASSES');
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t.pop(); }) }), 'MESH_CLASSES');
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[1].vertex_range = [8, 14]; }) }), 'MESH_CLASSES');
  refuse(encodeErrorMesh({ shape, fp, fn, header: { reference_mask_sha256: 'short' } }), 'MESH_HEADER');
  refuse(encodeErrorMesh({ shape, fp, fn, header: { frame: 'world' } }), 'MESH_HEADER');
  refuse(encodeErrorMesh({ shape, fp, fn, header: { level: 2 } }), 'MESH_HEADER');
  refuse(encodeErrorMesh({ shape, fp, fn, header: { format: 'cardiac-errormesh/2' } }), 'MESH_FORMAT');
  refuse(good.subarray(0, good.length - 4), 'MESH_LENGTH');
  refuse(Uint8Array.from([...good, 0, 0, 0, 0]), 'MESH_LENGTH');
  refuse(null, 'MESH_MAGIC');
  assert.deepEqual(errorCounts(null), {});
});

test('V2L5 base64 for the WebView equals the standard encoding, for every length; the messages to the viewer are exact', () => {
  for (let n = 0; n <= 40; n += 1) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
    assert.equal(bytesToBase64(b), Buffer.from(b).toString('base64'), `n=${n}`);
  }
  const big = Uint8Array.from({ length: 300_001 }, (_, i) => (i * 131) & 255);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString('base64'));
  assert.equal(bytesToBase64(goldenBytes()), GOLDEN.bytes_b64);
  assert.equal(bytesToBase64(errorGoldenBytes()), ERROR_GOLDEN.bytes_b64);
  const m = JSON.parse(toViewer.mesh('prediction', goldenBytes()));
  assert.deepEqual([m.type, m.role, m.b64], ['mesh', 'prediction', GOLDEN.bytes_b64]);
  const e = JSON.parse(toViewer.mesh('error', errorGoldenBytes()));
  assert.deepEqual([e.type, e.role, e.b64], ['mesh', 'error', ERROR_GOLDEN.bytes_b64]);
  assert.deepEqual(JSON.parse(toViewer.layers({ prediction: 1, groundTruth: 0, falsePositive: true, falseNegative: false })),
    { type: 'layers', prediction: true, groundTruth: false, falsePositive: true, falseNegative: false });
  assert.deepEqual(JSON.parse(toViewer.layers({ falseNegative: true, other: true })), { type: 'layers', falseNegative: true },
    'only the four roles, only those given');
  assert.deepEqual(JSON.parse(toViewer.slice(12)), { type: 'slice', index: 12 });
  assert.deepEqual(JSON.parse(toViewer.slice(null)), { type: 'slice', index: null });
  assert.deepEqual(JSON.parse(toViewer.slice(1.5)), { type: 'slice', index: null });
  assert.deepEqual(JSON.parse(toViewer.fit()), { type: 'fit' });
  assert.deepEqual(JSON.parse(toViewer.camera(CAMERA)), { type: 'camera', yaw: -0.2, pitch: 0.4, zoom: 2, panX: 0.1, panY: -0.2 });
  assert.equal(toViewer.camera({ ...CAMERA, zoom: 99 }), null, 'a camera outside the limits is not sent');
  assert.equal(toViewer.camera(null), null);
});

test('V2L6 viewer messages are checked: a malformed one is ignored, a pick slice is an integer or null, its class is its layer\'s, never coerced', () => {
  const p = (o) => parseViewerMessage(typeof o === 'string' ? o : JSON.stringify(o));
  assert.deepEqual(p({ type: 'ready' }), { kind: 'ready' });
  for (const role of ROLE_ORDER) {
    assert.deepEqual(p({ type: 'loaded', role, triangles: 10, vertices: 8 }), { kind: 'loaded', role, triangles: 10, vertices: 8 });
  }
  assert.deepEqual(p({ type: 'loaded', role: 'falsePositive', triangles: 0, vertices: 0 }), { kind: 'loaded', role: 'falsePositive', triangles: 0, vertices: 0 }, 'a class with no face is loaded');
  assert.equal(p({ type: 'loaded', role: 'other', triangles: 10, vertices: 8 }).kind, 'ignored');
  assert.equal(p({ type: 'loaded', role: 'error', triangles: 10, vertices: 8 }).kind, 'ignored', 'the container loads as its two layers');
  assert.deepEqual(p({ type: 'pick', role: 'groundTruth', triangle: 4, slice: 9 }), { kind: 'pick', role: 'groundTruth', triangle: 4, slice: 9, cls: null });
  assert.deepEqual(p({ type: 'pick', role: 'falsePositive', triangle: 4, slice: 9, cls: 'FP' }), { kind: 'pick', role: 'falsePositive', triangle: 4, slice: 9, cls: 'FP' });
  assert.deepEqual(p({ type: 'pick', role: 'falseNegative', triangle: 1, slice: 0, cls: 'FN' }), { kind: 'pick', role: 'falseNegative', triangle: 1, slice: 0, cls: 'FN' });
  assert.deepEqual(p({ type: 'pick', role: null, triangle: null, slice: null }), { kind: 'pick', role: null, triangle: null, slice: null, cls: null });
  for (const bad of [{ type: 'pick', role: 'prediction', slice: '9' }, { type: 'pick', role: 'prediction', slice: 2.5 }, { type: 'pick', role: 'prediction', slice: -1 },
    { type: 'pick', role: 'prediction' }, { type: 'pick', role: 'x', slice: 3 }, { type: 'nope' }, { notype: 1 }, 'not json', '[]', 'null', '7',
    // the class of a face must be the class of the layer that was hit
    { type: 'pick', role: 'falsePositive', slice: 3, cls: 'FN' }, { type: 'pick', role: 'falseNegative', slice: 3, cls: 'FP' },
    { type: 'pick', role: 'falsePositive', slice: 3 }, { type: 'pick', role: 'falsePositive', slice: 3, cls: null },
    { type: 'pick', role: 'prediction', slice: 3, cls: 'FP' }, { type: 'pick', role: 'groundTruth', slice: 3, cls: 'FN' },
    { type: 'pick', role: 'falsePositive', slice: 3, cls: 'TP' }]) {
    assert.equal(p(bad).kind, 'ignored', JSON.stringify(bad));
  }
  const e = p({ type: 'error', code: 'MESH_GRID', message: 'm'.repeat(1000), role: 'groundTruth' });
  assert.deepEqual([e.kind, e.code, e.role, e.message.length], ['error', 'MESH_GRID', 'groundTruth', 300]);
  assert.equal(p({ type: 'error', role: 'error', code: 'VIEWER_ERROR' }).role, 'error', 'the error container can fail');
  assert.equal(p({ type: 'error' }).code, 'VIEWER_ERROR');
  assert.equal(parseViewerMessage(null).kind, 'ignored');
  assert.deepEqual(parseViewerMessage({ type: 'ready' }), { kind: 'ready' }, 'an object is accepted as well as a string');
  const cam = p({ type: 'camera', yaw: -0.2, pitch: 0.4, zoom: 2, panX: 0.1, panY: -0.2 });
  assert.equal(cam.kind, 'camera');
  assert.deepEqual({ ...cam.camera, pan: [...cam.camera.pan] }, { yaw: -0.2, pitch: 0.4, zoom: 2, pan: [0.1, -0.2] });
  for (const bad of [{ zoom: 9 }, { zoom: 0.1 }, { pitch: 2 }, { yaw: 'x' }, { panX: 99 }, { panY: NaN }, { panX: null }]) {
    assert.equal(p({ type: 'camera', yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0, ...bad }).kind, 'ignored', JSON.stringify(bad));
  }
});

test('V2L7 H7: a pick selects the source slice and class only inside the volume; a background tap clears and says so', () => {
  const pick = (slice, role = 'prediction', cls = null) => ({ kind: 'pick', role, triangle: 3, slice, cls });
  assert.deepEqual({ ...selectionAfterPick(pick(44), 88) }, { slice: 44, role: 'prediction', cls: null, triangle: 3, note: null });
  assert.deepEqual({ ...selectionAfterPick(pick(0, 'groundTruth'), 88) }, { slice: 0, role: 'groundTruth', cls: null, triangle: 3, note: null });
  assert.deepEqual({ ...selectionAfterPick(pick(52, 'falsePositive', 'FP'), 88) }, { slice: 52, role: 'falsePositive', cls: 'FP', triangle: 3, note: null });
  assert.equal(selectionAfterPick(pick(7, 'falseNegative', 'FN'), 88).cls, 'FN');
  assert.equal(selectionAfterPick(pick(87), 88).slice, 87);
  const bg = selectionAfterPick({ kind: 'pick', role: null, triangle: null, slice: null, cls: null }, 88);
  assert.equal(bg.slice, null);
  assert.match(bg.note, /No surface at that point: nothing selected/);
  for (const slice of [88, 89, 1000]) {
    const out = selectionAfterPick(pick(slice, 'falsePositive', 'FP'), 88);
    assert.equal(out.slice, null, `slice ${slice} is outside 88 slices: never selected, never clamped`);
    assert.equal(out.cls, null, 'and its class is not kept either');
    assert.match(out.note, /outside this volume \(88 slices\)/);
  }
  assert.equal(selectionAfterPick(pick(3), null).slice, null, 'no known volume: no selection');
  assert.equal(selectionAfterPick({ kind: 'ready' }, 88), null, 'only picks are handled');
  assert.deepEqual({ ...SELECTION_NONE }, { slice: null, role: null, cls: null, triangle: null, note: null });
});

test('V2L8 "slice n / total" reads exactly as SCR-03 prints it', () => {
  for (const [z, n] of [[0, 88], [44, 88], [87, 88], [3, 6]]) assert.equal(sliceText(z, n), sliceLabel(z, n));
  assert.equal(sliceText(null, 88), 'slice - / -');
  assert.equal(sliceText(44, 88), 'slice 45 / 88  (z = 44)');
  assert.equal(triangleText(61424), '61,424 triangles');
  assert.equal(triangleText(null), '- triangles');
});

/* ------------------------------------------------------------------ the reducer: switches, plane, selection, camera */

const TOTAL = 88;
const fresh = (over = {}) => initialInspectorState({ slice: 44, total: TOTAL, ...over });
const pickMsg = (slice, role = 'falsePositive', cls = 'FP') => ({ kind: 'pick', role, triangle: 5, slice, cls });

test('V2S1 the state starts from the 2D slice handed in; a slice outside the volume is not used and not clamped', () => {
  const s = fresh();
  assert.deepEqual([s.plane, s.planeSource, s.selection, s.camera], [44, PLANE_SOURCE.ENTRY, SELECTION_NONE, null]);
  assert.deepEqual({ ...s.visible }, {});
  for (const slice of [88, 200, -1, 2.5, null, undefined, '4']) {
    const t = initialInspectorState({ slice, total: TOTAL });
    assert.deepEqual([t.plane, t.planeSource], [null, null], String(slice));
  }
  assert.equal(initialInspectorState({ slice: 3, total: null }).plane, null, 'no known volume, no plane');
  assert.deepEqual([...fresh({ camera: CAMERA }).camera.pan], [0.1, -0.2]);
  assert.equal(fresh({ camera: { ...CAMERA, zoom: 100 } }).camera, null);
  assert.deepEqual({ ...fresh({ layers: { prediction: false, falsePositive: true, groundTruth: 'yes', other: true } }).visible }, { prediction: false, falsePositive: true });
});

test('V2S2 switches are set per role; an unknown role or a non-boolean changes nothing; the state is never mutated', () => {
  const s0 = fresh();
  const s1 = inspectorReducer(s0, { type: ACTION.SET_VISIBLE, role: ROLES.FALSE_POSITIVE, visible: false });
  assert.deepEqual({ ...s1.visible }, { falsePositive: false });
  assert.deepEqual({ ...s0.visible }, {}, 'the previous state is untouched');
  const s2 = inspectorReducer(s1, { type: ACTION.SET_VISIBLE, role: ROLES.GROUND_TRUTH, visible: true });
  assert.deepEqual({ ...s2.visible }, { falsePositive: false, groundTruth: true });
  assert.equal(inspectorReducer(s2, { type: ACTION.SET_VISIBLE, role: 'nope', visible: true }), s2);
  assert.equal(inspectorReducer(s2, { type: ACTION.SET_VISIBLE, role: ROLES.PREDICTION, visible: 'yes' }), s2);
  assert.equal(inspectorReducer(s2, { type: 'UNKNOWN' }), s2);
  assert.equal(inspectorReducer(s2, null), s2);
  assert.ok(Object.isFrozen(s2) && Object.isFrozen(s2.visible));
});

test('V2S3 the slider moves the plane inside the volume only, and says it was the slider', () => {
  let s = fresh();
  s = inspectorReducer(s, { type: ACTION.SLIDE, slice: 60, total: TOTAL });
  assert.deepEqual([s.plane, s.planeSource], [60, PLANE_SOURCE.SLIDER]);
  s = inspectorReducer(s, { type: ACTION.SLIDE, slice: 0, total: TOTAL });
  assert.equal(s.plane, 0, 'slice 0 is a slice');
  const last = inspectorReducer(s, { type: ACTION.SLIDE, slice: 87, total: TOTAL });
  assert.equal(last.plane, 87);
  for (const slice of [88, -1, 3.5, null, '5']) assert.equal(inspectorReducer(last, { type: ACTION.SLIDE, slice, total: TOTAL }), last, String(slice));
  assert.equal(inspectorReducer(last, { type: ACTION.SLIDE, slice: 5, total: null }), last);
});

test('V2S4 H7: a pick selects the face (slice, layer, class) and the plane marks its slice; a background tap clears the selection and leaves the plane', () => {
  let s = fresh();
  s = inspectorReducer(s, { type: ACTION.PICK, pick: pickMsg(52), total: TOTAL });
  assert.deepEqual({ ...s.selection }, { slice: 52, role: 'falsePositive', cls: 'FP', triangle: 5, note: null });
  assert.deepEqual([s.plane, s.planeSource], [52, PLANE_SOURCE.PICK]);
  const moved = inspectorReducer(s, { type: ACTION.SLIDE, slice: 70, total: TOTAL });
  assert.equal(moved.selection.slice, 52, 'moving the plane does not change what was picked');
  s = inspectorReducer(s, { type: ACTION.PICK, pick: { kind: 'pick', role: null, triangle: null, slice: null, cls: null }, total: TOTAL });
  assert.equal(s.selection.slice, null);
  assert.match(s.selection.note, /No surface at that point/);
  assert.deepEqual([s.plane, s.planeSource], [52, PLANE_SOURCE.PICK], 'the plane stays where the user last put it');
  const outside = inspectorReducer(s, { type: ACTION.PICK, pick: pickMsg(88), total: TOTAL });
  assert.equal(outside.selection.slice, null);
  assert.match(outside.selection.note, /outside this volume \(88 slices\)/);
  assert.equal(outside.plane, 52, 'a refused pick moves nothing');
  assert.equal(inspectorReducer(s, { type: ACTION.PICK, pick: { kind: 'ready' }, total: TOTAL }), s, 'only picks are handled');
  const cleared = inspectorReducer(inspectorReducer(fresh(), { type: ACTION.PICK, pick: pickMsg(9), total: TOTAL }), { type: ACTION.DESELECT });
  assert.deepEqual({ ...cleared.selection }, { ...SELECTION_NONE });
  assert.equal(cleared.plane, 9);
});

test('V2S5 the camera the viewer reports is kept only if it is within the gesture limits', () => {
  let s = inspectorReducer(fresh(), { type: ACTION.CAMERA, camera: CAMERA });
  assert.deepEqual([s.camera.yaw, s.camera.zoom, [...s.camera.pan]], [-0.2, 2, [0.1, -0.2]]);
  assert.equal(inspectorReducer(s, { type: ACTION.CAMERA, camera: { ...CAMERA, zoom: CAMERA_LIMITS.zoomMax + 1 } }), s);
  assert.equal(inspectorReducer(s, { type: ACTION.CAMERA, camera: { ...CAMERA, pitch: 1.5 } }), s);
  assert.equal(inspectorReducer(s, { type: ACTION.CAMERA, camera: null }), s);
  assert.equal(sanitizeCamera({ ...CAMERA, pan: [0] }), null);
  assert.equal(sanitizeCamera({ ...CAMERA, yaw: Infinity }), null);
  s = inspectorReducer(s, { type: ACTION.CAMERA, camera: { yaw: 7, pitch: -1.45, zoom: 0.35, pan: [-20, 20] } });
  assert.equal(s.camera.zoom, 0.35, 'the limits themselves are valid');
});

const status = (state, extra = {}) => ({ state, reason: null, ...extra });

test('V2S6 what is shown: a switch the user set wins; otherwise the ground truth is on only while the error layers are not usable', () => {
  const all = (state) => ({ prediction: status(LAYER.READY), groundTruth: status(LAYER.READY), falsePositive: status(state), falseNegative: status(state) });
  const shown = (s, statuses) => ({ ...effectiveVisibility(s, statuses) });
  const on = { prediction: true, groundTruth: true, falsePositive: true, falseNegative: true };
  assert.deepEqual(shown(fresh(), all(LAYER.READY)), { ...on, groundTruth: false }, 'with an error map the surfaces are the prediction and the errors');
  assert.deepEqual(shown(fresh(), all(LAYER.LOADING)), { ...on, groundTruth: false }, 'and it does not flicker while the error layers load');
  assert.deepEqual(shown(fresh(), all(LAYER.UNAVAILABLE)), on, 'with no error map the disagreement is the two surfaces side by side');
  assert.deepEqual(shown(fresh(), all(LAYER.ERROR)), on);
  const mixed = { ...all(LAYER.READY), falseNegative: status(LAYER.UNAVAILABLE) };
  assert.equal(shown(fresh(), mixed).groundTruth, false, 'one usable error layer is enough');
  const user = inspectorReducer(inspectorReducer(fresh(), { type: ACTION.SET_VISIBLE, role: 'groundTruth', visible: true }),
    { type: ACTION.SET_VISIBLE, role: 'falsePositive', visible: false });
  assert.deepEqual(shown(user, all(LAYER.READY)), { ...on, falsePositive: false }, 'the user\'s switches win over the defaults');
  assert.deepEqual(shown(user, all(LAYER.UNAVAILABLE)), { ...on, falsePositive: false });
  assert.deepEqual(Object.keys(effectiveVisibility(fresh(), {})), [...ROLE_ORDER]);
});

/* ------------------------------------------------------------------ 3D -> 2D and back */

test('V2L9 Open in 2D: SCR-03 at the picked slice, same case, run and variant; Back reopens SCR-05 on the same layers, camera and slice', () => {
  const selection = { slice: 44, role: 'falsePositive', cls: 'FP', triangle: 5, note: null };
  const visible = { prediction: true, groundTruth: false, falsePositive: true, falseNegative: false };
  const plan = openIn2D({ caseId: 'CASE_0042', runId: 'RUN_EXP-D-100_CASE_0042', variant: 'RAW', selection, total: 88, visible, camera: CAMERA });
  assert.equal(plan.screenId, 'SCR-03');
  assert.deepEqual({ ...plan.params }, { caseId: 'CASE_0042', runId: 'RUN_EXP-D-100_CASE_0042', variant: 'RAW', sliceIndex: 44 });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.returnParams)), {
    runId: 'RUN_EXP-D-100_CASE_0042', variant: 'RAW', sliceIndex: 44, layers: visible, camera: { yaw: -0.2, pitch: 0.4, zoom: 2, pan: [0.1, -0.2] },
  });
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
  const entry = entryFromParams(top(state).params, 88);
  assert.equal(entry.slice, 44);
  assert.deepEqual({ ...entry.layers }, visible, 'and with the layers it had');
  assert.deepEqual([entry.camera.yaw, entry.camera.zoom, [...entry.camera.pan]], [-0.2, 2, [0.1, -0.2]], 'and the camera it had');
  const restored = initialInspectorState({ slice: entry.slice, layers: entry.layers, camera: entry.camera, total: 88 });
  assert.deepEqual([restored.plane, { ...restored.visible }], [44, visible]);
  state = navReducer(state, { type: NAV.POP });
  assert.equal(top(state).screenId, 'SCR-03');
});

test('V2L9b Open errors: SCR-04 at the slice of a picked FP or FN face only; the prediction and ground-truth surfaces have no error to open', () => {
  const base = { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'PROCESSED', total: 88, visible: { prediction: true }, camera: null };
  const fp = openErrors({ ...base, selection: { slice: 52, role: 'falsePositive', cls: 'FP', triangle: 1, note: null } });
  assert.equal(fp.screenId, 'SCR-04');
  assert.deepEqual({ ...fp.params }, { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 52 });
  assert.equal(fp.returnParams.sliceIndex, 52);
  assert.deepEqual({ ...fp.returnParams.layers }, { prediction: true });
  assert.equal('camera' in fp.returnParams, false, 'no camera yet: none is invented');
  assert.doesNotThrow(() => validateRoute(fp.screenId, fp.params), 'SCR-04 needs caseId, runId and variant');
  assert.equal(openErrors({ ...base, selection: { slice: 9, role: 'falseNegative', cls: 'FN', triangle: 1, note: null } }).params.sliceIndex, 9);
  for (const role of ['prediction', 'groundTruth']) {
    assert.equal(openErrors({ ...base, selection: { slice: 52, role, cls: null, triangle: 1, note: null } }), null, role);
  }
  assert.equal(openErrors({ ...base, selection: SELECTION_NONE }), null);
  assert.equal(openErrors({ ...base, selection: { slice: 88, role: 'falsePositive', cls: 'FP' } }), null, 'outside the volume');
  assert.equal(openErrors({ ...base, variant: null, selection: { slice: 4, role: 'falsePositive', cls: 'FP' } }), null, 'the variant is never defaulted');
  // the real navigator: SCR-05 -> SCR-04 and Back
  let state = initialNavState('SCR-05', { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'PROCESSED', sliceIndex: 10 });
  state = navReducer(state, { type: NAV.PUSH, screenId: fp.screenId, params: fp.params, returnParams: fp.returnParams });
  assert.equal(top(state).params.sliceIndex, 52);
  state = navReducer(state, { type: NAV.POP });
  assert.deepEqual([top(state).screenId, top(state).params.sliceIndex], ['SCR-05', 52]);
});

test('V2L10 nothing opens without a valid selection, case, run and variant', () => {
  const base = { caseId: 'CASE_0042', runId: 'RUN_A', variant: 'RAW', total: 88 };
  const sel = (slice) => ({ slice, role: 'prediction', cls: null, triangle: 1, note: null });
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

test('V2L10b the params of a stack entry say where the screen starts: malformed layers, camera or slice are dropped, not repaired', () => {
  const e = entryFromParams({ sliceIndex: 12, layers: { prediction: false, groundTruth: 'yes', falseNegative: true, extra: true }, camera: CAMERA }, 88);
  assert.deepEqual([e.slice, { ...e.layers }, e.note], [12, { prediction: false, falseNegative: true }, null]);
  assert.equal(e.camera.zoom, 2);
  const outside = entryFromParams({ sliceIndex: 88 }, 88);
  assert.equal(outside.slice, null);
  assert.match(outside.note, /outside this volume \(88 slices\)/);
  for (const p of [undefined, null, {}, { sliceIndex: 'x', layers: 5, camera: 'c' }, { camera: { ...CAMERA, pan: 'no' } }]) {
    const out = entryFromParams(p, 88);
    assert.deepEqual([out.slice, { ...out.layers }, out.camera], [null, {}, null], JSON.stringify(p));
  }
  assert.equal(entryFromParams({ sliceIndex: 0 }, 88).slice, 0);
  assert.equal(entryFromParams({ sliceIndex: 3 }, null).slice, null, 'without a known volume there is no plane');
});

/* ------------------------------------------------------------------ layers: states, legend, masks */

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

test('V2L11b every layer\'s state is said in words: loading, unavailable with the API reason, error with its code, ready with its counts', () => {
  const st = (state, extra = {}) => ({ state, reason: null, ...extra });
  assert.equal(layerNote('falsePositive', st(LAYER.LOADING)), 'loading…');
  assert.equal(layerNote('falseNegative', st(LAYER.UNAVAILABLE, { reason: 'ARTIFACT_NOT_FOUND' })), 'unavailable (ARTIFACT_NOT_FOUND)');
  assert.equal(layerNote('falseNegative', st(LAYER.UNAVAILABLE)), 'unavailable (no reason given)');
  assert.equal(layerNote('falsePositive', st(LAYER.ERROR, { reason: 'MASK_MISMATCH', message: 'other masks' })), 'error (MASK_MISMATCH): other masks');
  assert.equal(layerNote('prediction', st(LAYER.ERROR, { reason: 'CONTRACT_DRIFT' })), 'error (CONTRACT_DRIFT)');
  assert.equal(layerNote('prediction', st(LAYER.READY), { triangles: 61424 }), '61,424 triangles');
  assert.equal(layerNote('falsePositive', st(LAYER.READY), { triangles: 44, voxels: 5 }), '5 voxels · 44 triangles');
  assert.equal(layerNote('falseNegative', st(LAYER.READY), { triangles: 233_698, voxels: 12_345 }), '12,345 voxels · 233,698 triangles');
  assert.equal(layerNote('falsePositive', st(LAYER.READY), { triangles: 0, voxels: 0 }), 'none: no false-positive voxels', 'zero error is a fact, not a missing layer');
  assert.equal(layerNote('falseNegative', st(LAYER.READY), { triangles: 0, voxels: 0 }), 'none: no false-negative voxels');
  assert.equal(layerNote('prediction', st(LAYER.IDLE)), '');
});

test('V2E4 the legend never relies on colour alone: every layer has its own name, meaning and glyph, and FP / FN are SCR-04\'s words and colours', () => {
  assert.deepEqual([...ROLE_ORDER], ['prediction', 'groundTruth', 'falsePositive', 'falseNegative']);
  for (const role of ROLE_ORDER) {
    const info = LAYER_INFO[role];
    assert.ok(info.short.length > 2 && info.detail.length > 10 && info.glyph.length === 1 && /^#[0-9a-f]{6}$/.test(info.color), role);
    assert.equal(LAYER_COLOR[role], info.color);
  }
  for (const key of ['short', 'detail', 'glyph', 'color']) {
    assert.equal(new Set(ROLE_ORDER.map((r) => LAYER_INFO[r][key])).size, 4, `four different ${key}s`);
  }
  assert.deepEqual([LAYER_INFO.falsePositive.short, LAYER_INFO.falsePositive.detail, LAYER_INFO.falsePositive.color],
    [ERROR_CLASS.FP.label, ERROR_CLASS.FP.detail, ERROR_CLASS.FP.color]);
  assert.deepEqual([LAYER_INFO.falseNegative.short, LAYER_INFO.falseNegative.detail, LAYER_INFO.falseNegative.color],
    [ERROR_CLASS.FN.label, ERROR_CLASS.FN.detail, ERROR_CLASS.FN.color]);
  assert.match(LAYER_INFO.falsePositive.detail, /predicted, not in the ground truth/);
  assert.match(LAYER_INFO.falseNegative.detail, /in the ground truth, not predicted/);
});

test('V2E5 what the plane and the selection say, in words', () => {
  assert.equal(planeText(44, 88, PLANE_SOURCE.ENTRY), 'Amber plane and band on the surface: slice 45 of 88 (the 2D slice you came from).');
  assert.match(planeText(51, 88, PLANE_SOURCE.PICK), /slice 52 of 88 \(the picked slice\)/);
  assert.match(planeText(0, 88, PLANE_SOURCE.SLIDER), /slice 1 of 88 \(set with the slider\)/);
  assert.match(planeText(null, 88, null), /No slice plane: no 2D slice is selected/);
  assert.match(planeText(3, null, null), /No slice plane/);
  const text = (sel) => selectionText({ slice: 52, triangle: 1, note: null, ...sel }, 88);
  assert.equal(text({ role: 'falsePositive', cls: 'FP' }), 'slice 53 / 88  (z = 52) · picked on a false-positive (FP) face - predicted, not in the ground truth');
  assert.equal(text({ role: 'falseNegative', cls: 'FN' }), 'slice 53 / 88  (z = 52) · picked on a false-negative (FN) face - in the ground truth, not predicted');
  assert.equal(text({ role: 'prediction', cls: null }), 'slice 53 / 88  (z = 52) · picked on the prediction surface');
  assert.equal(text({ role: 'groundTruth', cls: null }), 'slice 53 / 88  (z = 52) · picked on the ground-truth surface');
  assert.equal(selectionText(SELECTION_NONE, 88), null);
});

test('V2E3 the error mesh is drawn only if it was made from the masks shown (DR-013a\'s rule, applied to SCR-05)', () => {
  const data = { prediction_variant: 'RAW', prediction_mask_id: 'ART_RAW', reference_mask_id: 'MASK_CASE_0042', error_mesh_artifact_id: `ERRMESH_${HEX}` };
  const ask = (over = {}, ctx = {}) => errorMaskProblem({ data: { ...data, ...over }, variant: 'RAW', predictionMaskId: 'ART_RAW', referenceMaskId: 'MASK_CASE_0042', ...ctx });
  assert.equal(ask(), null);
  assert.match(ask({ prediction_mask_id: 'ART_OTHER' }).message, /prediction mask ART_OTHER/);
  assert.match(ask({ reference_mask_id: 'MASK_CASE_0001' }).message, /reference mask MASK_CASE_0001/);
  assert.match(ask({ prediction_variant: 'PROCESSED' }).message, /variant PROCESSED \(shown RAW\)/);
  assert.equal(ask({ prediction_mask_id: 'x' }).code, 'MASK_MISMATCH');
  assert.equal(ask({}, { variant: 'PROCESSED' }).code, 'MASK_MISMATCH', 'RAW answered for a PROCESSED screen is never relabelled');
  assert.equal(errorMaskProblem({ data: null, variant: 'RAW', predictionMaskId: 'a', referenceMaskId: 'b' }).code, 'MASK_MISMATCH');
  assert.match(ask({ prediction_mask_id: 'a', reference_mask_id: 'b' }).message, /prediction mask a, reference mask b/);
});

test('V2L12 the prediction mask id is the run\'s own for the variant; none is invented', () => {
  const run = { raw_prediction_artifact_id: 'ART_RAW', processed_prediction_artifact_id: null };
  assert.equal(maskIdForVariant(run, 'RAW'), 'ART_RAW');
  assert.equal(maskIdForVariant(run, 'PROCESSED'), null, 'a RAW-only run has no PROCESSED mesh to ask for');
  assert.equal(maskIdForVariant(run, null), null);
  assert.equal(maskIdForVariant(null, 'RAW'), null);
});

test('V2L13 fixture mode: reconstruction_get and error_reconstruction_get are valid contract states, but no bytes exist behind them - an honest unavailable state', async () => {
  const runtime = createRuntime({ config: resolveConfig({ mode: 'fixture' }), contractJson: readContractJson(), bundleJson: generatedBundleJson() });
  const view = await runtime.client.call('reconstruction_get', { run_id: 'RUN_A', mask_id: 'MASK_A' });
  assert.ok(['SUCCESS', 'EMPTY_UNAVAILABLE'].includes(view.state), `${view.state} ${view.reason}`);
  const missing = await runtime.client.call('reconstruction_get', { run_id: 'RUN_A', source_mask_id: 'MASK_A' });
  assert.equal(missing.reason, 'MISSING_PARAM', 'the path token of reconstruction_get is mask_id (the contract {mask_id}), not source_mask_id');
  const errors = await runtime.client.call('error_reconstruction_get', { run_id: 'RUN_A', variant: 'RAW' });
  assert.ok(['SUCCESS', 'EMPTY_UNAVAILABLE'].includes(errors.state), `${errors.state} ${errors.reason}`);
  if (errors.state === 'SUCCESS') assert.ok(errors.data.error_mesh_artifact_id, 'the generated fixture states an error mesh id');
  const noVariant = await runtime.client.call('error_reconstruction_get', { run_id: 'RUN_A', prediction_variant: 'RAW' });
  assert.equal(noVariant.reason, 'MISSING_PARAM', 'the path token of error_reconstruction_get is variant (the contract {variant})');
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

test('V2L15 QA #98 N-4: the page asks nothing of the network - no http, src=, import(, fetch(, XMLHttpRequest or <link in the HTML or the script', () => {
  for (const [name, source] of [['VIEWER_HTML', VIEWER_HTML], ['VIEWER_SCRIPT', VIEWER_SCRIPT]]) {
    for (const forbidden of [/http/i, /src\s*=/i, /import\s*\(/, /fetch\s*\(/, /XMLHttpRequest/, /<link/i,
      /<img/i, /<iframe/i, /@import/, /url\s*\(/i, /sendBeacon/, /EventSource/, /importScripts/, /new Worker/, /<form/i, /<a\s/i]) {
      assert.equal(forbidden.test(source), false, `${name} contains ${forbidden}`);
    }
  }
  // the only element with an attribute that could load something is the inline script and the canvas
  assert.deepEqual([...VIEWER_HTML.matchAll(/<([a-z]+)[\s>]/gi)].map((m) => m[1].toLowerCase()), ['html', 'head', 'meta', 'meta', 'style', 'body', 'canvas', 'script']);
});
