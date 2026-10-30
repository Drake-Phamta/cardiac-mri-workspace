// node --test mobile/test/  - V2 SCR-05: the WebGL2 viewer script, run in node against a stubbed canvas and GL
//
// What this proves: the page's own code decodes the served `cardiac-mesh/1` surface and `cardiac-errormesh/1` error artifacts
// (the Python goldens), refuses a damaged one, casts a pick ray with the same result as the Python reference on the goldens'
// cases (the slice AND the class of the first face hit), resolves a TAP through its camera to the face's source slice (H7),
// never resolves a background tap to a slice, honours the four layer switches, loads each mesh once however often it is
// delivered, and turns pointer events into orbit / pinch zoom / pan / tap. What it cannot prove: how it looks, or how fast it
// draws on the A17 - that is the owner's TC-3D-001/002 and TC-PERF-002 on the device.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { VIEWER_SCRIPT } from '../src/verticals/v2/viewerSource.mjs';
import {
  boxClass, boxMesh, encodeErrorMesh, encodeMesh, ERROR_GOLDEN, errorGoldenBytes, errorGoldenPredictionBytes,
  errorGoldenReferenceBytes, GOLDEN, goldenBytes,
} from './_v2mesh.mjs';

function makeViewer({ withTimers = false } = {}) {
  const posted = [];
  const canvasHandlers = {};
  const windowHandlers = {};
  const documentHandlers = {};
  const glCalls = [];
  const timers = [];
  const snapshot = (a) => (ArrayBuffer.isView(a) ? (a.length <= 16 ? Array.from(a) : `${a.constructor.name}(${a.length})`) : a);
  const gl = new Proxy({}, {
    get: (_t, name) => {
      if (typeof name !== 'string') return undefined;
      if (/^[A-Z_0-9]+$/.test(name)) return name; // GL constants
      return (...args) => {
        glCalls.push([name, ...args.map(snapshot)]);
        if (name === 'getUniformLocation') return { uniform: args[1] };
        return name.startsWith('create') ? { name } : true;
      };
    },
  });
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  const canvas = {
    clientWidth: 400, clientHeight: 400, width: 0, height: 0, getContext: () => gl, setPointerCapture() {},
    getBoundingClientRect: () => rect, addEventListener: (type, fn) => { canvasHandlers[type] = fn; },
  };
  const document = { getElementById: () => canvas, addEventListener: (type, fn) => { documentHandlers[type] = fn; } };
  let frameCallback = null;
  const window = {
    ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) },
    addEventListener: (type, fn) => { windowHandlers[type] = fn; },
    requestAnimationFrame: (fn) => { frameCallback = fn; return 0; }, devicePixelRatio: 1,
  };
  const sandbox = { window, document, atob: globalThis.atob, console };
  if (withTimers) {
    sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; };
    sandbox.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  }
  const context = vm.createContext(sandbox);
  new vm.Script(VIEWER_SCRIPT, { filename: 'viewer-script.js' }).runInContext(context);
  const api = window.__cardiacViewer;
  const send = (message) => windowHandlers.message({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  const load = (role, bytes) => send({ type: 'mesh', role, b64: b64(bytes) });
  const events = (type) => posted.filter((m) => m.type === type);
  // one animation frame: runs draw() once (it draws only when something changed) and returns the GL calls it made
  const frame = () => {
    const from = glCalls.length;
    if (frameCallback) frameCallback();
    return glCalls.slice(from);
  };
  return { api, posted, canvas, canvasHandlers, windowHandlers, documentHandlers, glCalls, send, load, events, rect, frame, timers };
}

const FACE_ON_TOP = { x: 1.5, y: 1.5, z: 3 };   // the top of the tower at column 1, row 1: voxels z 0..2 -> source slice 2
const tap = (v, p) => {
  const at = v.api.project([p.x, p.y, p.z]);
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: at.x, clientY: at.y });
};

test('V2W1 the page starts, asks nothing of the network, and tells the app it is ready', () => {
  const v = makeViewer();
  assert.deepEqual(v.posted, [{ type: 'ready' }]);
  assert.equal(typeof v.canvasHandlers.pointerdown, 'function');
  assert.equal(typeof v.windowHandlers.message, 'function', 'iOS delivers messages to window');
  assert.equal(typeof v.documentHandlers.message, 'function', 'Android delivers messages to document');
  assert.ok(v.glCalls.some(([n]) => n === 'linkProgram'), 'the program was built');
});

test('V2W2 it decodes the Python golden artifact, in both message channels, and reports it', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  assert.deepEqual(v.events('loaded'), [{ type: 'loaded', role: 'prediction', triangles: GOLDEN.triangle_count, vertices: GOLDEN.vertex_count }]);
  assert.deepEqual(v.events('error'), []);
  v.documentHandlers.message({ data: JSON.stringify({ type: 'mesh', role: 'groundTruth', b64: Buffer.from(goldenBytes()).toString('base64') }) });
  assert.equal(v.events('loaded').length, 2, 'the Android channel (document) works too');
  assert.ok(v.glCalls.some(([n]) => n === 'bufferData'), 'the vertices and indices were uploaded');
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().loaded)), { prediction: true, groundTruth: true, falsePositive: false, falseNegative: false });
  v.send('not json at all');
  v.send({ type: 'mesh', role: 'prediction' });
  assert.equal(v.events('error').length, 0, 'noise is ignored, not an error');
});

test('V2W3 the viewer casts every golden pick case like the Python reference (the first triangle hit gives the slice)', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  const results = GOLDEN.picks.map((c) => {
    const hit = v.api.pickRay(c.origin, c.direction);
    return [c, hit === null ? null : hit.slice];
  });
  for (const [c, slice] of results) assert.equal(slice, c.slice, JSON.stringify(c));
  assert.ok(results.some(([, s]) => s === null) && results.some(([, s]) => s === 2) && results.some(([, s]) => s === 0), 'the cases cover hits and misses');
  assert.equal(v.api.pickRay([1.5, 1.5, 10], [0, 0, 0]), null, 'a zero direction is no ray');
  assert.equal(v.api.pickRay([1.5, 1.5, 10], [0, 0, -1]).cls, null, 'a surface face has no error class');
});

test('V2W4 H7: a TAP goes through the camera to the face under the finger and posts its source slice; the screen, not the page, moves the plane', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  tap(v, FACE_ON_TOP);
  tap(v, { x: 4.5, y: 3.5, z: 4 });   // the top of the voxel (4, 3, 3): source slice 3
  const picks = v.events('pick');
  assert.deepEqual(picks.map((p) => [p.role, p.slice, p.cls]), [['prediction', 2, null], ['prediction', 3, null]]);
  assert.ok(picks.every((p) => Number.isInteger(p.triangle) && p.triangle >= 0 && p.triangle < GOLDEN.triangle_count));
  assert.equal(v.api.state().slice, null, 'the page does not move the plane on its own: the screen owns it and answers with a slice message');
  v.send({ type: 'slice', index: 3 });
  assert.equal(v.api.state().slice, 3, 'the plane follows the slice the screen sends');
  // after a rotation the same tap logic still resolves the slice of the face that is under the finger
  v.api.setCamera({ yaw: -0.5, pitch: 0.35 });
  const at = v.api.project([FACE_ON_TOP.x, FACE_ON_TOP.y, FACE_ON_TOP.z]);
  const ray = v.api.rayAt(at.x, at.y);
  const hit = v.api.pickRay(ray.origin, ray.direction);
  assert.ok(hit !== null && hit.slice >= 0 && hit.slice < GOLDEN.shape_xyz[2], 'a pick after rotation is a slice in range or nothing');
});

test('V2W5 H7: a tap on the background posts no slice - it can never navigate', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  const at = v.api.project([0.4, 0.4, 10]);   // beside the mask, looking straight down the volume
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: at.x, clientY: at.y });
  assert.deepEqual(v.events('pick'), [{ type: 'pick', role: null, triangle: null, slice: null, cls: null }]);
  const corner = { clientX: 2, clientY: 2 };
  v.canvasHandlers.pointerdown({ pointerId: 2, ...corner });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 2, ...corner });
  assert.deepEqual(v.events('pick').map((p) => p.slice), [null, null]);
  assert.equal(v.api.state().slice, null, 'a background tap selects nothing');
});

test('V2W6 layers: a hidden layer cannot be picked; with both visible the nearer surface wins', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.load('groundTruth', goldenBytes());
  const ray = { origin: [1.5, 1.5, 10], direction: [0, 0, -1] };
  assert.equal(v.api.pickRay(ray.origin, ray.direction).role, 'prediction', 'a tie keeps the first layer');
  v.send({ type: 'layers', prediction: false, groundTruth: true });
  assert.equal(v.api.pickRay(ray.origin, ray.direction).role, 'groundTruth');
  assert.equal(v.api.pickRay(ray.origin, ray.direction).slice, 2);
  v.send({ type: 'layers', prediction: false, groundTruth: false });
  assert.equal(v.api.pickRay(ray.origin, ray.direction), null, 'nothing visible, nothing to pick');
  v.send({ type: 'layers', prediction: 'yes', groundTruth: 1 });
  assert.equal(v.api.pickRay(ray.origin, ray.direction), null, 'a non-boolean switch is ignored');
  v.send({ type: 'layers', prediction: true, groundTruth: false });
  assert.equal(v.api.pickRay(ray.origin, ray.direction).role, 'prediction');
});

test('V2W7 the two layers must share one grid; a damaged artifact is refused with its code and role', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  const other = encodeMesh({ ...boxMesh([9, 9, 9], [1, 1, 0], [3, 3, 1]) });
  v.load('groundTruth', other);
  const grid = v.events('error').pop();
  assert.match(grid.message, /^MESH_GRID/);
  assert.equal(grid.role, 'groundTruth');
  assert.equal(v.api.state().loaded.groundTruth, false, 'the refused mesh is not kept');

  const box = boxMesh([6, 5, 4], [1, 1, 0], [3, 3, 1]);
  const good = encodeMesh(box);
  const fresh = () => { const w = makeViewer(); return w; };
  const refuse = (bytes, code) => {
    const w = fresh();
    w.load('prediction', bytes);
    const e = w.events('error');
    assert.equal(e.length, 1, code);
    assert.match(e[0].message, new RegExp(`^${code}`), e[0].message);
    assert.equal(w.events('loaded').length, 0, code);
  };
  const ok = fresh();
  ok.load('prediction', good);
  assert.equal(ok.events('loaded')[0].triangles, 12, 'the hand-made box is valid');
  refuse(good.subarray(0, good.length - 4), 'MESH_LENGTH');
  refuse(Uint8Array.from([...good].map((b, i) => (i === 0 ? 0x58 : b))), 'MESH_MAGIC');
  refuse(encodeMesh({ ...box, triangles: box.triangles.map(([a, b, c], i) => (i === 3 ? [a, b, 99] : [a, b, c])) }), 'MESH_INDEX');
  refuse(encodeMesh({ ...box, vertices: box.vertices.map((p, i) => (i === 2 ? [7, p[1], p[2]] : p)) }), 'MESH_VERTEX');
  refuse(encodeMesh({ ...box, slices: box.slices.map((z, i) => (i === 1 ? 4 : z)) }), 'MESH_SLICE');
  refuse(encodeMesh({ ...box, header: { level: 2 } }), 'MESH_HEADER');
  refuse(encodeMesh({ ...box, header: { frame: 'world' } }), 'MESH_HEADER');
  refuse(encodeMesh({ ...box, header: { format: 'cardiac-mesh/2' } }), 'MESH_FORMAT');
  const w = fresh();
  w.send({ type: 'mesh', role: 'both', b64: Buffer.from(good).toString('base64') });
  assert.match(w.events('error')[0].message, /^MESH_ROLE/);
});

test('V2W8 four-byte indices (a mesh above 65,535 vertices) decode and pick like two-byte ones', () => {
  const v = makeViewer();
  const box = boxMesh([6, 5, 4], [1, 1, 2], [3, 3, 3]);
  v.load('prediction', encodeMesh({ ...box, indexBytes: 4 }));
  assert.equal(v.events('error').length, 0);
  const hit = v.api.pickRay([2, 2, 10], [0, 0, -1]);
  assert.equal(hit.slice, 2);
});

test('V2W9 the 2D slice shows as the band; only a valid slice index is accepted', () => {
  const v = makeViewer();
  v.send({ type: 'slice', index: 12 });
  assert.equal(v.api.state().slice, 12);
  v.send({ type: 'slice', index: null });
  assert.equal(v.api.state().slice, null);
  for (const bad of [-1, 'x', NaN, Infinity, undefined]) {
    v.send({ type: 'slice', index: 5 });
    v.send({ type: 'slice', index: bad });
    assert.equal(v.api.state().slice, null, String(bad));
  }
  v.send({ type: 'slice', index: 4.7 });
  assert.equal(v.api.state().slice, 4);
});

test('V2W10 gestures: one finger orbits, two fingers pinch-zoom and pan, a wheel zooms, a drag is not a tap', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  const cam0 = { ...v.api.camera(), pan: [...v.api.camera().pan] };
  // orbit
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: 100, clientY: 100 });
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: 160, clientY: 120 });
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: 200, clientY: 140 });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: 200, clientY: 140 });
  assert.notEqual(v.api.camera().yaw, cam0.yaw, 'yaw changed');
  assert.notEqual(v.api.camera().pitch, cam0.pitch, 'pitch changed');
  assert.equal(v.events('pick').length, 0, 'a drag never picks');
  // pinch
  const zoom0 = v.api.camera().zoom;
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: 150, clientY: 200 });
  v.canvasHandlers.pointerdown({ pointerId: 2, clientX: 250, clientY: 200 });
  v.canvasHandlers.pointermove({ pointerId: 2, clientX: 350, clientY: 200 });
  assert.ok(v.api.camera().zoom > zoom0 * 1.5, `pinch out zooms in (${zoom0} -> ${v.api.camera().zoom})`);
  const panned = [...v.api.camera().pan];
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: 190, clientY: 240 });
  v.canvasHandlers.pointermove({ pointerId: 2, clientX: 390, clientY: 240 });
  assert.notDeepEqual(v.api.camera().pan, panned, 'two fingers moving together pan');
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 2, clientX: 390, clientY: 240 });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: 190, clientY: 240 });
  assert.equal(v.events('pick').length, 0, 'lifting fingers after a pinch is not a tap');
  // wheel, clamped
  const z1 = v.api.camera().zoom;
  v.canvasHandlers.wheel({ deltaY: -400, preventDefault() {} });
  assert.ok(v.api.camera().zoom > z1);
  for (let i = 0; i < 40; i += 1) v.canvasHandlers.wheel({ deltaY: -1000, preventDefault() {} });
  assert.ok(v.api.camera().zoom <= 8, 'zoom is bounded');
  for (let i = 0; i < 80; i += 1) v.canvasHandlers.wheel({ deltaY: 1000, preventDefault() {} });
  assert.ok(v.api.camera().zoom >= 0.35, 'zoom out is bounded');
  v.send({ type: 'fit' });
  assert.deepEqual([v.api.camera().yaw, v.api.camera().pitch, v.api.camera().zoom, ...v.api.camera().pan], [-0.5, 0.35, 1, 0, 0]);
});

test('V2W11 a tap is a quick press without movement; a cancelled press is not a tap', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  const at = v.api.project([FACE_ON_TOP.x, FACE_ON_TOP.y, FACE_ON_TOP.z]);
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: at.x + 3, clientY: at.y - 2 });   // a finger's jitter is still a tap
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: at.x + 3, clientY: at.y - 2 });
  assert.equal(v.events('pick').length, 1, 'jitter below the threshold is a tap');
  const yaw = v.api.camera().yaw;
  assert.equal(yaw, 0, 'and it did not rotate the model under the finger');
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
  v.canvasHandlers.pointercancel({ type: 'pointercancel', pointerId: 1, clientX: at.x, clientY: at.y });
  assert.equal(v.events('pick').length, 1, 'a cancelled press picks nothing');
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: at.x + 40, clientY: at.y });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: at.x + 40, clientY: at.y });
  assert.equal(v.events('pick').length, 1, 'a drag of 40 px is an orbit, not a pick');
});

test('V2W12 no WebGL2: the page says so (the screen shows an error state), and does not pretend to draw', () => {
  const posted = [];
  const canvas = {
    clientWidth: 100, clientHeight: 100, getContext: () => null, addEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };
  const context = vm.createContext({
    window: { ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) }, addEventListener() {}, requestAnimationFrame: () => 0 },
    document: { getElementById: () => canvas, addEventListener() {} }, atob: globalThis.atob,
  });
  new vm.Script(VIEWER_SCRIPT).runInContext(context);
  assert.equal(posted[0].type, 'error');
  assert.equal(posted[0].code, 'WEBGL2_UNAVAILABLE');
});

/* ------------------------------------------------------------------ the error map: FP and FN as layers of their own */

const FP_TRIANGLES = ERROR_GOLDEN.classes[0].triangle_range[1] - ERROR_GOLDEN.classes[0].triangle_range[0];
const FN_TRIANGLES = ERROR_GOLDEN.classes[1].triangle_range[1] - ERROR_GOLDEN.classes[1].triangle_range[0];
const FP_VERTICES = ERROR_GOLDEN.classes[0].vertex_range[1];
const FN_VERTICES = ERROR_GOLDEN.classes[1].vertex_range[1] - ERROR_GOLDEN.classes[1].vertex_range[0];
const ROLE_CLASS = { falsePositive: 'FP', falseNegative: 'FN' };
const hitOf = (v, c) => v.api.pickRay(c.origin, c.direction);
const brief = (hit) => (hit === null ? null : [hit.slice, hit.cls]);

test('V2W13 the error artifact becomes two layers, one per class, each reported with its own counts; the surfaces are untouched', () => {
  const v = makeViewer();
  v.load('error', errorGoldenBytes());
  assert.deepEqual(v.events('error'), []);
  assert.deepEqual(v.events('loaded'), [
    { type: 'loaded', role: 'falsePositive', triangles: FP_TRIANGLES, vertices: FP_VERTICES },
    { type: 'loaded', role: 'falseNegative', triangles: FN_TRIANGLES, vertices: FN_VERTICES },
  ]);
  assert.deepEqual([FP_TRIANGLES, FN_TRIANGLES, FP_VERTICES, FN_VERTICES], [44, 32, 26, 18], 'the hand-derived counts of the known-error pair');
  const state = v.api.state();
  assert.deepEqual(JSON.parse(JSON.stringify(state.loaded)), { prediction: false, groundTruth: false, falsePositive: true, falseNegative: true });
  assert.deepEqual(JSON.parse(JSON.stringify(state.triangles)), { prediction: null, groundTruth: null, falsePositive: 44, falseNegative: 32 });
  assert.equal(v.glCalls.filter(([n]) => n === 'createVertexArray').length, 3, 'the plane and two error layers have their own vertex array');
});

test('V2W14 every golden pick case resolves to the slice AND the class of the first face hit, like the Python reference', () => {
  const v = makeViewer();
  v.load('error', errorGoldenBytes());
  for (const c of ERROR_GOLDEN.picks) {
    const hit = hitOf(v, c);
    assert.deepEqual(brief(hit), c.slice === null ? null : [c.slice, c.class], JSON.stringify(c));
    if (hit) assert.equal(ROLE_CLASS[hit.role], hit.cls, 'a layer names the class of its own faces');
  }
  const picks = ERROR_GOLDEN.picks;
  assert.ok(picks.some((c) => c.class === 'FP') && picks.some((c) => c.class === 'FN') && picks.some((c) => c.slice === null), 'hits of both classes and misses');
  // and a tap through the camera posts them (role, slice, class)
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  tap(v, { x: 6.5, y: 3.5, z: 5 });                // the top of the FP slab: voxel (6, 3, 4), whose +z face lies on z = 5
  const posted = v.events('pick').pop();
  assert.deepEqual([posted.role, posted.slice, posted.cls], ['falsePositive', 4, 'FP']);
});

test('V2W14b a layer\'s switch decides what a ray can hit; an empty class can be loaded and is never drawn or hit', () => {
  const v = makeViewer();
  v.load('error', errorGoldenBytes());
  const fpRay = ERROR_GOLDEN.picks[0];
  const fnRay = ERROR_GOLDEN.picks[2];
  assert.equal(hitOf(v, fpRay).cls, 'FP');
  assert.equal(hitOf(v, fnRay).cls, 'FN');
  v.send({ type: 'layers', falsePositive: false });
  assert.equal(hitOf(v, fpRay), null, 'a hidden FP layer cannot be picked');
  assert.equal(hitOf(v, fnRay).cls, 'FN', 'and the FN layer is not affected');
  v.send({ type: 'layers', falsePositive: true, falseNegative: false });
  assert.equal(hitOf(v, fpRay).cls, 'FP');
  assert.equal(hitOf(v, fnRay), null);
  v.send({ type: 'layers', falsePositive: 'yes', falseNegative: 1 });
  assert.equal(hitOf(v, fnRay), null, 'a non-boolean switch is ignored');
  // a prediction with only false negatives: the FP layer is loaded, empty, and nothing can be hit on it
  const w = makeViewer();
  w.load('error', encodeErrorMesh({ shape: [10, 10, 6], fn: boxClass([5, 5, 3], [6, 6, 5]) }));
  assert.deepEqual(w.events('loaded').map((m) => [m.role, m.triangles]), [['falsePositive', 0], ['falseNegative', 12]]);
  assert.equal(w.events('error').length, 0);
  assert.equal(w.api.pickRay([5.5, 5.5, 20], [0, 0, -1]).cls, 'FN');
  const none = makeViewer();
  none.load('error', encodeErrorMesh({ shape: [10, 10, 6] }));
  assert.deepEqual(none.events('loaded').map((m) => [m.role, m.triangles]), [['falsePositive', 0], ['falseNegative', 0]], 'no error at all is a fact, not a refusal');
  assert.equal(none.api.pickRay([5.5, 5.5, 20], [0, 0, -1]), null);
  assert.equal(none.api.state().bounds, null, 'nothing to frame');
});

test('V2W15 four layers: an error face on a prediction face is picked as the error; the prediction and the ground truth after it', () => {
  const v = makeViewer();
  v.load('prediction', errorGoldenPredictionBytes());
  v.load('groundTruth', errorGoldenReferenceBytes());
  v.load('error', errorGoldenBytes());
  assert.equal(v.events('error').length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().loaded)), { prediction: true, groundTruth: true, falsePositive: true, falseNegative: true });
  const [fpTop, fpFar, fnLeft, fnBelow, fnTop, fpRight, throughBlock, tpTop, corner] = ERROR_GOLDEN.picks;
  // hand-derived: where an error face lies exactly on a prediction / ground-truth face the error wins the tie
  assert.deepEqual([hitOf(v, fpTop).role, hitOf(v, fpTop).slice], ['falsePositive', 4], 'the FP slab top is also a prediction face');
  assert.deepEqual([hitOf(v, fpFar).role, hitOf(v, fpFar).slice], ['falsePositive', 5]);
  assert.deepEqual([hitOf(v, fnLeft).role, hitOf(v, fnLeft).slice], ['falseNegative', 1], 'the FN face is also a ground-truth face');
  assert.deepEqual([hitOf(v, fnBelow).role, hitOf(v, fnBelow).slice], ['falseNegative', 1]);
  assert.deepEqual([hitOf(v, fpRight).role, hitOf(v, fpRight).slice], ['falsePositive', 3]);
  // where the nearest surface is not an error, the prediction beats the ground truth at one distance
  assert.deepEqual([hitOf(v, fnTop).role, hitOf(v, fnTop).slice], ['prediction', 4], 'from above the true-positive top is nearer than the FN face under it');
  assert.deepEqual([hitOf(v, throughBlock).role, hitOf(v, throughBlock).slice], ['prediction', 3]);
  assert.deepEqual([hitOf(v, tpTop).role, hitOf(v, tpTop).slice], ['prediction', 4]);
  assert.equal(hitOf(v, corner), null);
  // hide the surfaces: only the error layers can be hit, and the answers are the error-only golden's
  v.send({ type: 'layers', prediction: false, groundTruth: false });
  for (const c of ERROR_GOLDEN.picks) assert.deepEqual(brief(hitOf(v, c)), c.slice === null ? null : [c.slice, c.class], JSON.stringify(c));
  // hide the prediction and the errors: the ground truth is what is left
  v.send({ type: 'layers', prediction: false, groundTruth: true, falsePositive: false, falseNegative: false });
  assert.deepEqual([hitOf(v, tpTop).role, hitOf(v, tpTop).cls], ['groundTruth', null]);
  assert.equal(hitOf(v, fpTop), null, 'the ground truth has nothing where the false positive is');
});

test('V2W16 QA #98 N-5: a mesh delivered twice - through both channels, or twice through one - is decoded once and reported once', () => {
  const v = makeViewer();
  const message = { data: JSON.stringify({ type: 'mesh', role: 'prediction', b64: Buffer.from(errorGoldenPredictionBytes()).toString('base64') }) };
  v.windowHandlers.message(message);
  v.documentHandlers.message(message);
  v.windowHandlers.message(message);
  assert.equal(v.events('loaded').length, 1, 'one loaded event for three deliveries');
  assert.equal(v.glCalls.filter(([n]) => n === 'createVertexArray').length, 2, 'uploaded once (plus the plane)');
  assert.equal(v.glCalls.filter(([n]) => n === 'deleteVertexArray').length, 0, 'and not replaced');
  assert.equal(v.events('error').length, 0);
  // the error container: two layers, still one report each
  const e = { data: JSON.stringify({ type: 'mesh', role: 'error', b64: Buffer.from(errorGoldenBytes()).toString('base64') }) };
  v.documentHandlers.message(e);
  v.windowHandlers.message(e);
  assert.deepEqual(v.events('loaded').map((m) => m.role), ['prediction', 'falsePositive', 'falseNegative']);
  // the same bytes under another role are another layer; different bytes under a role replace it
  v.load('groundTruth', errorGoldenPredictionBytes());
  assert.equal(v.events('loaded').length, 4);
  v.load('groundTruth', encodeMesh({ ...boxMesh(ERROR_GOLDEN.shape_xyz, [1, 1, 0], [3, 3, 1]) }));
  assert.equal(v.events('loaded').length, 5, 'new bytes are loaded');
  assert.equal(v.glCalls.filter(([n]) => n === 'deleteVertexArray').length, 1, 'and the old layer is released');
  assert.equal(v.events('error').length, 0);
});

test('V2W16b a refused artifact leaves its role as it was, and the same refusal is reported again (nothing is swallowed)', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  const broken = goldenBytes().subarray(0, goldenBytes().length - 4);
  v.load('prediction', broken);
  v.load('prediction', broken);
  assert.equal(v.events('error').length, 2, 'a failure is reported each time, so a Retry that fails again still tells the screen');
  assert.equal(v.api.state().loaded.prediction, true, 'the earlier mesh stays');
  v.load('prediction', goldenBytes());
  assert.equal(v.events('loaded').length, 1, 'and the same good bytes are still the same mesh');
});

test('V2W17 the error container and the surfaces are not interchangeable, the layers share one grid, and a damaged class table is refused', () => {
  const shape = GOLDEN.shape_xyz;
  const refuse = (role, bytes, code, setup = () => {}) => {
    const w = makeViewer();
    setup(w);
    const before = w.events('loaded').length;
    w.load(role, bytes);
    const e = w.events('error');
    assert.equal(e.length, 1, `${code}: ${JSON.stringify(e)}`);
    assert.match(e[0].message, new RegExp(`^${code}`), e[0].message);
    assert.equal(w.events('loaded').length, before, code);
    return w;
  };
  refuse('prediction', errorGoldenBytes(), 'MESH_FORMAT');
  refuse('groundTruth', errorGoldenBytes(), 'MESH_FORMAT');
  refuse('error', goldenBytes(), 'MESH_FORMAT');
  const grid = refuse('error', encodeErrorMesh({ shape: [9, 9, 9], fp: boxClass([1, 1, 0], [3, 3, 1]) }), 'MESH_GRID', (w) => w.load('prediction', goldenBytes()));
  assert.deepEqual(JSON.parse(JSON.stringify(grid.api.state().loaded)), { prediction: true, groundTruth: false, falsePositive: false, falseNegative: false });
  const fp = boxClass([1, 1, 0], [3, 3, 1]);
  const fn = boxClass([4, 3, 1], [5, 4, 2]);
  const good = encodeErrorMesh({ shape, fp, fn });
  const ok = makeViewer();
  ok.load('error', good);
  assert.equal(ok.events('error').length, 0);
  assert.deepEqual(ok.events('loaded').map((m) => [m.role, m.triangles, m.vertices]), [['falsePositive', 12, 8], ['falseNegative', 12, 8]]);
  const table = (edit) => { const t = JSON.parse(JSON.stringify([
    { name: 'FP', code: 1, rule: 'x', voxels: fp.voxels, vertex_range: [0, 8], triangle_range: [0, 12] },
    { name: 'FN', code: 2, rule: 'y', voxels: fn.voxels, vertex_range: [8, 16], triangle_range: [12, 24] }])); edit(t); return t; };
  refuse('error', encodeErrorMesh({ shape, fp, fn, classTable: table((t) => t.reverse()) }), 'MESH_CLASSES');
  refuse('error', encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[1].triangle_range = [11, 24]; }) }), 'MESH_CLASSES');
  refuse('error', encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[0].voxels = 0; }) }), 'MESH_CLASSES');
  refuse('error', encodeErrorMesh({ shape, fp, fn, classTable: table((t) => { t[1].vertex_range = [8, 15]; }) }), 'MESH_CLASSES');
  refuse('error', encodeErrorMesh({ shape, fp, fn, classBytes: Array.from({ length: 24 }, (_, i) => (i === 3 ? 2 : i < 12 ? 1 : 2)) }), 'MESH_CLASS');
  refuse('error', encodeErrorMesh({ shape, fp, fn, classBytes: Array.from({ length: 24 }, (_, i) => (i === 20 ? 1 : i < 12 ? 1 : 2)) }), 'MESH_CLASS');
  // a triangle of one class indexing the vertices of the other
  const crossing = { ...fp, triangles: fp.triangles.map((t, i) => (i === 0 ? [t[0], t[1], 9] : t)) };
  refuse('error', encodeErrorMesh({ shape, fp: crossing, fn }), 'MESH_INDEX');
  refuse('error', encodeErrorMesh({ shape, fp: { ...fp, slices: fp.slices.map((z, i) => (i === 0 ? shape[2] : z)) }, fn }), 'MESH_SLICE');
  refuse('error', encodeErrorMesh({ shape, fp, fn, header: { frame: 'world' } }), 'MESH_HEADER');
  refuse('error', encodeErrorMesh({ shape, fp, fn, header: { level: 1 } }), 'MESH_HEADER');
  refuse('error', good.subarray(0, good.length - 4), 'MESH_LENGTH');
  // four-byte indices, and a class block with more than 65,535 vertices uses them locally
  const wide = makeViewer();
  wide.load('error', encodeErrorMesh({ shape, fp, fn, indexBytes: 4 }));
  assert.equal(wide.events('error').length, 0);
  assert.equal(wide.api.pickRay([1.5, 1.5, 20], [0, 0, -1]).cls, 'FP');
});

test('V2W18 the camera: reported when a gesture ends, restored from the screen within the gesture limits, never echoed', () => {
  const v = makeViewer({ withTimers: true });
  v.load('prediction', goldenBytes());
  assert.equal(v.events('camera').length, 0, 'nothing is reported while nothing moved');
  // an orbit reports once, at its end
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: 100, clientY: 100 });
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: 160, clientY: 120 });
  assert.equal(v.events('camera').length, 0, 'not during the gesture');
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: 160, clientY: 120 });
  const c1 = v.events('camera');
  assert.equal(c1.length, 1);
  assert.deepEqual([c1[0].yaw, c1[0].pitch, c1[0].zoom, c1[0].panX, c1[0].panY],
    [v.api.camera().yaw, v.api.camera().pitch, v.api.camera().zoom, v.api.camera().pan[0], v.api.camera().pan[1]]);
  // a tap moves nothing and reports nothing
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  tap(v, FACE_ON_TOP);
  assert.equal(v.events('camera').length, 1);
  // a wheel reports once after a quiet moment
  v.canvasHandlers.wheel({ deltaY: -400, preventDefault() {} });
  v.canvasHandlers.wheel({ deltaY: -400, preventDefault() {} });
  assert.equal(v.events('camera').length, 1, 'not on every notch');
  assert.equal(v.timers.length, 2);
  assert.equal(v.timers[0].cleared, true, 'a newer notch cancels the older timer');
  v.timers[1].fn();
  assert.equal(v.events('camera').length, 2);
  assert.ok(Math.abs(v.events('camera')[1].zoom - v.api.camera().zoom) < 1e-12);
  // restore: in range is applied and not echoed, out of range is ignored
  v.send({ type: 'camera', yaw: 1.5, pitch: -0.4, zoom: 3, panX: 0.2, panY: -0.1 });
  assert.deepEqual([v.api.camera().yaw, v.api.camera().pitch, v.api.camera().zoom, ...v.api.camera().pan], [1.5, -0.4, 3, 0.2, -0.1]);
  assert.equal(v.events('camera').length, 2, 'restoring a camera is not a gesture, nothing is posted');
  for (const bad of [{ zoom: 9 }, { zoom: 0.2 }, { pitch: 1.6 }, { yaw: 'x' }, { panX: 99 }, { panY: Infinity }]) {
    v.send({ type: 'camera', yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0, ...bad });
    assert.deepEqual([v.api.camera().yaw, v.api.camera().zoom], [1.5, 3], `${JSON.stringify(bad)} is not applied`);
  }
  // fit resets and reports
  v.send({ type: 'fit' });
  assert.deepEqual(v.events('camera').pop(), { type: 'camera', yaw: -0.5, pitch: 0.35, zoom: 1, panX: 0, panY: 0 });
});

test('V2W19 what a frame draws: the error layers with a depth offset, FN hatched, the empty class not at all, the plane only with a slice', () => {
  const v = makeViewer();
  v.load('prediction', errorGoldenPredictionBytes());
  v.load('error', errorGoldenBytes());
  v.send({ type: 'layers', prediction: true, groundTruth: false, falsePositive: true, falseNegative: true });
  const uniformValue = (calls, name) => calls.filter(([n, loc]) => /^uniform[1-4]f$/.test(n) && loc && loc.uniform === name).map((c) => c.slice(2));
  const drawElements = (calls) => calls.filter(([n]) => n === 'drawElements');
  const first = v.frame();
  const counts = drawElements(first).map((c) => c[2]);
  assert.equal(counts.length, 3);
  assert.deepEqual(counts.slice(1), [FP_TRIANGLES * 3, FN_TRIANGLES * 3]);
  const names = first.map((c) => c[0]);
  assert.ok(names.indexOf('polygonOffset') > -1 && names.indexOf('polygonOffset') < names.indexOf('drawElements', names.indexOf('drawElements') + 1),
    'the depth offset is on before the first error layer is drawn');
  assert.deepEqual(first.filter(([n]) => n === 'polygonOffset').map((c) => c.slice(1)), [[-1, -1]]);
  // FN is hatched, FP and the prediction are not
  const hatch = first.filter(([n, loc]) => n === 'uniform1f' && loc && loc.uniform === 'uHatch').map((c) => c[2]);
  assert.deepEqual(hatch, [0, 0, 1]);
  assert.deepEqual(uniformValue(first, 'uBand').map((a) => a[0]), [0.9, 0.35, 0.35], 'the error classes keep most of their colour under the band');
  assert.equal(drawElements(first).length, 3);
  assert.equal(first.filter(([n]) => n === 'drawArrays').length, 0, 'no slice, no plane');
  // a slice: the plane is a quad at the middle of the slice with an outline
  v.send({ type: 'slice', index: 2 });
  const withPlane = v.frame();
  const quads = withPlane.filter(([n]) => n === 'drawArrays');
  assert.deepEqual(quads.map((c) => c[1]), ['TRIANGLE_FAN', 'LINE_LOOP']);
  const upload = withPlane.filter(([n, target]) => n === 'bufferData' && target === 'ARRAY_BUFFER').pop();
  const quad = upload[2];
  assert.equal(quad.length, 12);
  assert.deepEqual([quad[2], quad[5], quad[8], quad[11]], [2.5, 2.5, 2.5, 2.5], 'at the middle of slice 2');
  const bounds = v.api.state().bounds;
  assert.ok(quad[0] < bounds.lo[0] && quad[3] > bounds.hi[0] && quad[1] < bounds.lo[1] && quad[7] > bounds.hi[1], 'a little wider than everything loaded');
  // a hidden layer is not drawn
  v.send({ type: 'layers', falsePositive: false });
  assert.equal(drawElements(v.frame()).length, 2);
  // a frame with nothing changed draws nothing
  assert.deepEqual(v.frame(), []);
  // a class with no face is loaded and has no draw call at all
  const w = makeViewer();
  w.load('error', encodeErrorMesh({ shape: [10, 10, 6], fn: boxClass([5, 5, 3], [6, 6, 5]) }));
  assert.equal(drawElements(w.frame()).length, 1);
});
