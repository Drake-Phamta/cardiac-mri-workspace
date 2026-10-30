// node --test mobile/test/  - V2 SCR-05: the WebGL2 viewer script, run in node against a stubbed canvas and GL
//
// What this proves: the page's own code takes a mesh in bounded chunks and refuses a missing, repeated, out-of-order or
// oversized one, a wrong length or sha256, a transfer that goes quiet; decodes the served `cardiac-mesh/1` surface and
// `cardiac-errormesh/2` error artifacts (the Python goldens), refuses a damaged one (class table, region table, a face naming
// the wrong region), casts a pick ray with the same result as the Python reference on the goldens' cases (the slice, the class,
// the region AND the voxel of the first face hit), resolves a TAP through its camera to the face's source slice (H7), never
// resolves a background tap to a slice, honours the four layer switches, highlights the faces of one error region, loads each
// mesh once however often it is delivered, and turns pointer events into orbit / pinch zoom / pan / tap. What it cannot prove:
// how it looks, or how fast it draws on the A17 - that is the owner's TC-3D-001/002 and TC-PERF-002 on the device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

import { CHUNK_BYTES, MAX_MESH_BYTES, TRANSFER_IDLE_MS, transferPlan } from '../src/verticals/v2/inspector3d.mjs';
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
  // A mesh goes in through the same sender the screen uses (transferPlan): meshStart, chunks, meshEnd, each a message of its own.
  let tx = 0;
  const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const plan = (role, bytes, chunkBytes) => transferPlan({ role, bytes, checksum: sha(bytes), tx: ++tx, chunkBytes });
  const load = (role, bytes, chunkBytes) => {
    const p = plan(role, bytes, chunkBytes);
    for (let i = 0; i < p.count; i += 1) send(p.message(i));
    return p;
  };
  const events = (type) => posted.filter((m) => m.type === type);
  // one animation frame: runs draw() once (it draws only when something changed) and returns the GL calls it made
  const frame = () => {
    const from = glCalls.length;
    if (frameCallback) frameCallback();
    return glCalls.slice(from);
  };
  return { api, posted, canvas, canvasHandlers, windowHandlers, documentHandlers, glCalls, send, load, plan, sha, events, rect, frame, timers };
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
  const viaDocument = v.plan('groundTruth', goldenBytes());
  for (let i = 0; i < viaDocument.count; i += 1) v.documentHandlers.message({ data: viaDocument.message(i) });
  assert.equal(v.events('loaded').length, 2, 'the Android channel (document) works too');
  assert.ok(v.glCalls.some(([n]) => n === 'bufferData'), 'the vertices and indices were uploaded');
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().loaded)), { prediction: true, groundTruth: true, falsePositive: false, falseNegative: false });
  v.send('not json at all');
  v.send({ type: 'nope' });
  v.send({ notype: 1 });
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
  assert.deepEqual(picks.map((p) => [p.role, p.slice, p.cls, p.component, p.column, p.row]),
    [['prediction', 2, null, null, 1, 1], ['prediction', 3, null, null, 4, 3]],
    'a surface face names no region but its voxel: column 1, row 1 of the tower; column 4, row 3 of the voxel (4, 3, 3)');
  assert.ok(picks.every((p) => Number.isInteger(p.triangle) && p.triangle >= 0 && p.triangle < GOLDEN.triangle_count));
  assert.equal(v.api.state().slice, null, 'the page does not move the plane on its own: the screen owns it and answers with a slice message');
  v.send({ type: 'slice', index: 3 });
  assert.equal(v.api.state().slice, 3, 'the plane follows the slice the screen sends');
  // after a rotation the same tap logic still resolves the slice of the face that is under the finger
  v.api.setCamera({ yaw: -0.5, pitch: 0.35 });
  const at = v.api.project([FACE_ON_TOP.x, FACE_ON_TOP.y, FACE_ON_TOP.z]);
  const ray = v.api.rayAt(at.x, at.y);
  const hit = v.api.pickRay(ray.origin, ray.direction);
  assert.equal(hit.slice, 2, 'after a rotation the tap on the same face still resolves the same slice (V2W20 covers more cameras)');
});

test('V2W5 H7: a tap on the background posts no slice - it can never navigate', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  const at = v.api.project([0.4, 0.4, 10]);   // beside the mask, looking straight down the volume
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: at.x, clientY: at.y });
  assert.deepEqual(v.events('pick'), [{ type: 'pick', role: null, triangle: null, slice: null, cls: null, component: null, column: null, row: null }]);
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
  w.send({ type: 'meshStart', role: 'both', tx: 1, n: 0, bytes: good.length, chunk: good.length, chunks: 1, sha256: 'a'.repeat(64) });
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
    // the region number and the voxel (the marker's column and row) are the Python reference's, face for face
    assert.deepEqual(hit === null ? null : [hit.component, hit.column, hit.row],
      c.slice === null ? null : [c.component, c.voxel[0], c.voxel[1]], JSON.stringify(c));
    if (hit) assert.equal(c.voxel[2], hit.slice, 'the voxel is in the face\'s source slice');
  }
  const picks = ERROR_GOLDEN.picks;
  assert.ok(picks.some((c) => c.class === 'FP') && picks.some((c) => c.class === 'FN') && picks.some((c) => c.slice === null), 'hits of both classes and misses');
  // and a tap through the camera posts them (role, slice, class)
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  tap(v, { x: 6.5, y: 3.5, z: 5 });                // the top of the FP slab: voxel (6, 3, 4), whose +z face lies on z = 5
  const posted = v.events('pick').pop();
  assert.deepEqual([posted.role, posted.slice, posted.cls, posted.component, posted.column, posted.row], ['falsePositive', 4, 'FP', 1, 6, 3]);
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
  // every message of the transfer arrives through both channels, and some twice through one: the ordinal makes the repeat a no-op
  const deliver = (p) => {
    for (let i = 0; i < p.count; i += 1) {
      const message = { data: p.message(i) };
      v.windowHandlers.message(message);
      v.documentHandlers.message(message);
      if (i % 2) v.windowHandlers.message(message);
    }
  };
  deliver(v.plan('prediction', errorGoldenPredictionBytes(), 500));
  assert.equal(v.events('loaded').length, 1, 'one loaded event for three deliveries of every message');
  assert.equal(v.glCalls.filter(([n]) => n === 'createVertexArray').length, 2, 'uploaded once (plus the plane)');
  assert.equal(v.glCalls.filter(([n]) => n === 'deleteVertexArray').length, 0, 'and not replaced');
  assert.equal(v.events('error').length, 0, 'a repeated message is not an error (a repeated CHUNK is: V2W22)');
  // the same bytes again as a transfer of their own (a Retry, a second mount): the same mesh, nothing to report
  deliver(v.plan('prediction', errorGoldenPredictionBytes()));
  assert.equal(v.events('loaded').length, 1);
  assert.equal(v.glCalls.filter(([n]) => n === 'createVertexArray').length, 2);
  // the error container: two layers, still one report each
  deliver(v.plan('error', errorGoldenBytes(), 900));
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
    { name: 'FP', code: 1, rule: 'x', voxels: fp.voxels, vertex_range: [0, 8], triangle_range: [0, 12], component_range: [1, 2] },
    { name: 'FN', code: 2, rule: 'y', voxels: fn.voxels, vertex_range: [8, 16], triangle_range: [12, 24], component_range: [2, 3] }])); edit(t); return t; };
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
  assert.ok(v.timers.every((t) => t.cleared), 'the mesh transfer that loaded the prediction left no timer running');
  const base = v.timers.length;
  v.canvasHandlers.wheel({ deltaY: -400, preventDefault() {} });
  v.canvasHandlers.wheel({ deltaY: -400, preventDefault() {} });
  assert.equal(v.events('camera').length, 1, 'not on every notch');
  assert.equal(v.timers.length - base, 2);
  assert.equal(v.timers[base].cleared, true, 'a newer notch cancels the older timer');
  v.timers[base + 1].fn();
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

test('V2W19 what a frame draws: the error layers with a depth offset, FP checkered and FN striped, the empty class not at all, the plane only with a slice', () => {
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
  // every layer has a pattern of its own besides its colour: the prediction solid (0), FP checkered (2), FN striped (1)
  const hatch = first.filter(([n, loc]) => n === 'uniform1f' && loc && loc.uniform === 'uHatch').map((c) => c[2]);
  assert.deepEqual(hatch, [0, 2, 1]);
  const mute = first.filter(([n, loc]) => n === 'uniform1f' && loc && loc.uniform === 'uMute').map((c) => c[2]);
  assert.deepEqual(mute, [0.55, 0, 0], 'the surface is partly desaturated while error layers are drawn; the error layers keep their colours');
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

test('V2W20 TC-3D-004: the slice and the class a tap resolves do not depend on the camera - rotation, zoom and pan change nothing', () => {
  const cameras = [
    { yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] }, { yaw: -0.5, pitch: 0.35, zoom: 1, pan: [0, 0] },
    { yaw: 0.4, pitch: 0.6, zoom: 2.5, pan: [0.05, -0.05] }, { yaw: -0.9, pitch: 0.2, zoom: 1.5, pan: [0, 0] },
    { yaw: 1.2, pitch: 0.9, zoom: 3, pan: [0, 0] }, { yaw: 0.1, pitch: 1.2, zoom: 1, pan: [0, 0] },
    { yaw: -2.2, pitch: 0.8, zoom: 0.5, pan: [-0.1, 0.1] },
  ];
  const through = (v, point) => {
    const at = v.api.project(point);
    const ray = v.api.rayAt(at.x, at.y);
    return v.api.pickRay(ray.origin, ray.direction);
  };
  // the surface golden: the top of the tower at column 1, row 1 is slice 2, the top of the voxel (4, 3, 3) is slice 3
  const surface = makeViewer();
  surface.load('prediction', goldenBytes());
  // the error golden, error layers only: the top of the FP slab voxel (6, 3, 4) lies on z = 5 -> slice 4, FP;
  // the top of the FN slab voxel (2, 2, 2) lies on z = 3 -> slice 2, FN (hand-derived in test_error_artifact.py)
  const errors = makeViewer();
  errors.load('error', errorGoldenBytes());
  let seen = 0;
  for (const camera of cameras) {
    surface.api.setCamera(camera);
    errors.api.setCamera(camera);
    const a = through(surface, [1.5, 1.5, 3]);
    const b = through(surface, [4.5, 3.5, 4]);
    const c = through(errors, [6.5, 3.5, 5]);
    const d = through(errors, [2.5, 2.5, 3]);
    assert.ok(a && b && c && d, `${JSON.stringify(camera)}: a point is hidden behind another face - every camera here looks at the tops from above`);
    assert.deepEqual([a.slice, b.slice, c.slice, c.cls, d.slice, d.cls], [2, 3, 4, 'FP', 2, 'FN'], JSON.stringify(camera));
    seen += 1;
  }
  assert.equal(seen, cameras.length);
  // the other side of the same coin: from below the first face along the ray is another one, and that is what is resolved
  surface.api.setCamera({ yaw: -3.0, pitch: -0.8, zoom: 0.5, pan: [-0.1, 0.1] });
  const below = through(surface, [4.5, 3.5, 4]);
  assert.notEqual(below.slice, 3, 'seen from underneath, the first face is not the top of the voxel: the tap resolves what it really hits');
});


/* ------------------------------------------------------------------ the mesh transfer: bounded chunks, verified before decoding */

const transferText = (bytes, chunk = 700) => {
  const v = makeViewer();
  const plan = v.plan('error', bytes, chunk);
  return Array.from({ length: plan.count }, (_, i) => JSON.parse(plan.message(i)));
};
const errorMessages = (chunk = 700) => transferText(errorGoldenBytes(), chunk);   // start, 4 chunks, end for the 2,672-byte golden
const renumber = (messages) => messages.map((m, i) => ({ ...m, n: i }));
const chunkOf = (m) => Buffer.from(m.b64, 'base64');
const withBytes = (m, bytes) => ({ ...m, b64: Buffer.from(bytes).toString('base64') });

test('V2W21 a mesh arrives in bounded chunks: nothing is decoded before the end, then the length and sha256 are checked and it is decoded once', () => {
  const v = makeViewer();
  const plan = v.plan('error', errorGoldenBytes(), 700);
  assert.deepEqual([plan.bytes, plan.chunks, plan.count], [2672, 4, 6]);
  v.send(plan.message(0));
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().transfers)), { error: { tx: 1, next: 0, chunks: 4 } });
  for (let i = 1; i <= 4; i += 1) {
    v.send(plan.message(i));
    assert.equal(v.events('loaded').length, 0, `chunk ${i - 1} does not load anything`);
    assert.equal(v.api.state().transfers.error.next, i, 'the page counts what it has');
  }
  assert.equal(v.events('error').length, 0);
  v.send(plan.message(5));
  assert.deepEqual(v.events('loaded').map((m) => [m.role, m.triangles]), [['falsePositive', FP_TRIANGLES], ['falseNegative', FN_TRIANGLES]]);
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().transfers)), {}, 'the transfer is over');
  assert.equal(v.events('error').length, 0);
  // one chunk is the common case: a mesh below the bound is a start, one chunk and an end
  const one = makeViewer();
  const small = one.load('prediction', goldenBytes());
  assert.deepEqual([small.chunks, small.count], [1, 3]);
  assert.equal(one.events('loaded').length, 1);
  // the bounds the page enforces are the screen's: one source (inspector3d.mjs), embedded into the script
  assert.ok(VIEWER_SCRIPT.includes(`CHUNK_MAX = ${CHUNK_BYTES}`) && VIEWER_SCRIPT.includes(`MESH_MAX = ${MAX_MESH_BYTES}`) && VIEWER_SCRIPT.includes(`IDLE_MS = ${TRANSFER_IDLE_MS}`));
  // and a transfer is paced, not a flood: no more than CHUNK_BYTES raw bytes (256 KiB of base64) in any message of a big mesh
  const big = transferPlan({ role: 'groundTruth', bytes: new Uint8Array(CHUNK_BYTES * 2 + 5), checksum: `sha256:${'0'.repeat(64)}`, tx: 9 });
  for (let i = 0; i < big.count; i += 1) assert.ok(big.message(i).length < 262144 + 200, `message ${i}`);
});

test('V2W22 a missing, repeated, out-of-order or oversized chunk, a wrong length or sha256 is that layer\'s error: nothing is decoded, a fresh transfer works', () => {
  const run = (code, mutate, { role = 'error', timers = false } = {}) => {
    const v = makeViewer({ withTimers: timers });
    const before = v.events('loaded').length;
    for (const m of mutate(errorMessages())) v.send(m);
    const e = v.events('error');
    assert.ok(e.length >= 1, `${code}: no error was posted`);
    assert.match(e[0].message, new RegExp(`^${code}`), `${code}: ${e[0].message}`);
    assert.equal(e[0].role, role, `${code}: the error names the layer of the transfer`);
    assert.equal(v.events('loaded').length, before, `${code}: nothing was decoded`);
    assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().transfers)), {}, `${code}: the transfer is closed`);
    assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().loaded)), { prediction: false, groundTruth: false, falsePositive: false, falseNegative: false });
    // Retry: a transfer of its own, with the next tx, is taken as if nothing had happened
    const again = v.events('error').length;
    v.plan('error', errorGoldenBytes(), 700);                     // tx 1 was the failed transfer's: the sender moves on
    v.load('error', errorGoldenBytes(), 700);
    assert.equal(v.events('loaded').length, before + 2, `${code}: a fresh transfer loads`);
    assert.equal(v.events('error').length, again);
    return v;
  };
  // out of order: chunks 1 and 2 swapped, ordinals in sequence - chunk 2 arrives while chunk 1 is expected
  run('MESH_CHUNK_ORDER', (m) => { const out = [...m]; [out[2], out[3]] = [{ ...m[3], n: 2 }, { ...m[2], n: 3 }]; return out; });
  // repeated: chunk 1 sent again as the next message
  run('MESH_CHUNK_DUPLICATE', (m) => renumber([m[0], m[1], m[2], m[2], m[3], m[4], m[5]]));
  // missing: a chunk dropped on the way (the ordinal jumps), or the last chunk dropped before the end
  run('MESH_CHUNK_MISSING', (m) => [m[0], m[1], m[2], m[4], m[5]]);
  run('MESH_CHUNK_MISSING', (m) => renumber([m[0], m[1], m[2], m[3], m[5]]));
  run('MESH_CHUNK_MISSING', (m) => renumber([m[0], m[5]]));
  // oversized: a chunk bigger than its place, a chunk size above the bound, a mesh above the bound, an absurd string, one chunk too many
  run('MESH_CHUNK_OVERSIZED', (m) => { const out = [...m]; out[2] = withBytes(m[2], Buffer.concat([chunkOf(m[2]), Buffer.from([1])])); return out; });
  run('MESH_CHUNK_OVERSIZED', (m) => { const out = [...m]; out[0] = { ...m[0], chunk: CHUNK_BYTES + 1, chunks: 1 }; return out; });
  run('MESH_TOO_LARGE', (m) => { const out = [...m]; out[0] = { ...m[0], bytes: MAX_MESH_BYTES + 1, chunks: Math.ceil((MAX_MESH_BYTES + 1) / 700) }; return out; });
  run('MESH_CHUNK_OVERSIZED', (m) => { const out = [...m]; out[2] = { ...m[2], b64: 'A'.repeat(1_000_000) }; return out; });
  run('MESH_CHUNK_OVERSIZED', (m) => renumber([m[0], m[1], m[2], m[3], m[4], { ...m[4] }, m[5]].map((x, i) => (i === 5 ? { ...x, seq: 4 } : x))));
  // undersized: a chunk shorter than its place (a short read on the bridge)
  run('MESH_CHUNK_SIZE', (m) => { const out = [...m]; out[2] = withBytes(m[2], chunkOf(m[2]).subarray(0, 699)); return out; });
  run('MESH_CHUNK_ENCODING', (m) => { const out = [...m]; out[2] = { ...m[2], b64: '!!!!' }; return out; });
  // bytes that arrive whole but are not the bytes the transfer announced: one flipped bit in the middle of the mesh
  run('MESH_CHECKSUM', (m) => { const out = [...m]; const raw = Buffer.from(chunkOf(m[2])); raw[100] ^= 1; out[2] = withBytes(m[2], raw); return out; });
  run('MESH_CHECKSUM', (m) => { const out = [...m]; out[0] = { ...m[0], sha256: 'f'.repeat(64) }; return out; });
  // a start that does not describe a transfer, a chunk of no transfer, a single-message mesh, a role that is not one
  run('MESH_TRANSFER', (m) => [{ ...m[0], bytes: 0 }]);
  run('MESH_TRANSFER', (m) => [{ ...m[0], chunks: 3 }]);
  run('MESH_TRANSFER', (m) => [{ ...m[0], sha256: 'xyz' }]);
  run('MESH_TRANSFER', (m) => [{ ...m[0], n: 1 }]);
  run('MESH_TRANSFER', (m) => [m[0], { ...m[1], seq: 'zero' }]);
  run('MESH_TRANSFER', (m) => [m[0], { ...m[1], n: undefined }]);
  run('MESH_CHUNK_UNEXPECTED', (m) => [m[1]]);
  run('MESH_CHUNK_UNEXPECTED', (m) => [m[5]]);
  run('MESH_PROTOCOL', () => [{ type: 'mesh', role: 'error', b64: Buffer.from(errorGoldenBytes()).toString('base64') }]);
  const bad = makeViewer();
  bad.send({ ...errorMessages()[0], role: 'both' });
  assert.match(bad.events('error')[0].message, /^MESH_ROLE/);
  // the surface roles refuse the same way, and name their own layer
  const surface = makeViewer();
  const msgs = transferText(goldenBytes(), 500).map((m) => ({ ...m, role: 'prediction' }));
  surface.send(msgs[0]);
  surface.send({ ...msgs[2], n: 1 });                             // chunk 1 arrives while chunk 0 is expected
  assert.match(surface.events('error')[0].message, /^MESH_CHUNK_ORDER/);
  assert.equal(surface.events('error')[0].role, 'prediction');
});

test('V2W22b a transfer that goes quiet is that layer\'s error; a finished or replaced transfer leaves no timer and its late messages change nothing', () => {
  const v = makeViewer({ withTimers: true });
  const m = errorMessages();
  v.send(m[0]);
  v.send(m[1]);
  const live = v.timers.filter((t) => !t.cleared);
  assert.equal(live.length, 1, 'one timer per transfer, re-armed by every message');
  assert.equal(live[0].ms, TRANSFER_IDLE_MS);
  live[0].fn();                                                   // the quiet period passes
  const e = v.events('error');
  assert.equal(e.length, 1);
  assert.match(e[0].message, new RegExp(`^MESH_TRANSFER_TIMEOUT: no message of transfer 0?[0-9]+ for ${TRANSFER_IDLE_MS / 1000} s \\(1 of 4 chunks arrived\\)`));
  assert.equal(e[0].role, 'error');
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().transfers)), {});
  // the late tail of the dead transfer is not a second error, and does not load anything
  for (const late of m.slice(2)) v.send(late);
  assert.equal(v.events('error').length, 1);
  assert.equal(v.events('loaded').length, 0);
  // a transfer that finishes leaves nothing running
  const w = makeViewer({ withTimers: true });
  w.load('error', errorGoldenBytes(), 700);
  assert.ok(w.timers.length > 0 && w.timers.every((t) => t.cleared), 'every timer a finished transfer armed was cleared');
  // a new transfer for the role replaces the open one: the old one's timer is gone, and its late chunks are ignored, not errors
  const r = makeViewer({ withTimers: true });
  const old = errorMessages();
  r.send(old[0]);
  r.send(old[1]);
  const fresh = transferPlan({ role: 'error', bytes: errorGoldenBytes(), checksum: r.sha(errorGoldenBytes()), tx: 2, chunkBytes: 700 });
  r.send(fresh.message(0));
  assert.equal(r.timers.filter((t) => !t.cleared).length, 1, 'the replaced transfer\'s timer was cleared');
  for (const late of old.slice(2)) r.send(late);                  // the tail of the transfer that was replaced
  assert.equal(r.events('error').length, 0, 'the tail of a replaced transfer is not an error');
  for (let i = 1; i < fresh.count; i += 1) r.send(fresh.message(i));
  assert.deepEqual(r.events('loaded').map((x) => x.role), ['falsePositive', 'falseNegative']);
  // an older transfer replayed after a newer one started is ignored
  const q = makeViewer();
  const first = q.plan('prediction', goldenBytes());
  const second = q.plan('prediction', goldenBytes());
  q.send(second.message(0));
  q.send(first.message(0));
  assert.equal(q.api.state().transfers.prediction.tx, 2);
  assert.equal(q.events('error').length, 0);
});

test('V2W23 the page\'s own SHA-256 equals node\'s on every length around the block boundaries, and on the golden meshes', () => {
  const v = makeViewer();
  const node = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(v.api.sha256Hex(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'the empty message');
  assert.equal(v.api.sha256Hex(Uint8Array.from(Buffer.from('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'FIPS 180-2 "abc"');
  assert.equal(v.api.sha256Hex(Uint8Array.from(Buffer.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', 'FIPS 180-2 two-block message');
  for (const n of [1, 2, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 191, 192, 193, 1000, 4096, 65537]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 131 + n * 7) & 255);
    assert.equal(v.api.sha256Hex(bytes), node(bytes), `length ${n}`);
  }
  for (const bytes of [goldenBytes(), errorGoldenBytes(), errorGoldenPredictionBytes()]) assert.equal(v.api.sha256Hex(bytes), node(bytes));
  const noise = Uint8Array.from({ length: 300_001 }, (_, i) => (i * 2654435761 >>> 24) & 255);
  assert.equal(v.api.sha256Hex(noise), node(noise));
  assert.equal(v.api.sha256Hex(Uint8Array.from(new Array(64).fill(255))), node(Buffer.alloc(64, 255)), 'all ones: every carry');
});

/* ------------------------------------------------------------------ regions: decoded, picked with their voxel, refused when damaged */

const sectionsOf = (bytes) => {
  const hlen = Buffer.from(bytes).readUInt32LE(8);
  const h = JSON.parse(Buffer.from(bytes.subarray(12, 12 + hlen)).toString('latin1'));
  const pad = (n) => (4 - (n % 4)) % 4;
  let at = 12 + hlen;
  const out = { header: h };
  for (const [name, size] of [['vertices', h.vertex_count * 6], ['triangles', h.triangle_count * 3 * h.index_bytes], ['slices', h.triangle_count * 2],
    ['classes', h.triangle_count], ['components', h.triangle_count * h.component_index_bytes]]) {
    out[name] = at;
    at += size + pad(size);
  }
  return out;
};
const patched = (bytes, edit) => { const copy = Uint8Array.from(bytes); edit(copy, sectionsOf(bytes)); return copy; };

test('V2W24 a tap names the region and the voxel of the face: every golden pick equals the Python reference, and a surface face names its voxel but no region', () => {
  const v = makeViewer();
  v.load('error', errorGoldenBytes());
  const seen = new Set();
  for (const c of ERROR_GOLDEN.picks) {
    const hit = hitOf(v, c);
    if (c.slice === null) { assert.equal(hit, null); continue; }
    assert.deepEqual([hit.slice, hit.cls, hit.component, hit.column, hit.row], [c.slice, c.class, c.component, c.voxel[0], c.voxel[1]], JSON.stringify(c));
    seen.add(`${c.class}${c.component}`);
  }
  assert.deepEqual([...seen].sort(), ['FN3', 'FP1', 'FP2'], 'the cases reach all three regions of the known pair');
  // through the camera: the tap posts them
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  tap(v, { x: 0.5, y: 6.5, z: 6 });            // the top of the far FP voxel (0, 6, 5)
  const far = v.events('pick').pop();
  assert.deepEqual([far.role, far.slice, far.cls, far.component, far.column, far.row], ['falsePositive', 5, 'FP', 2, 0, 6]);
  // a surface: the L-shaped golden - the voxel behind the top of the tower and behind a +x face
  const s = makeViewer();
  s.load('prediction', goldenBytes());
  const topOfTower = s.api.pickRay([1.5, 1.5, 10], [0, 0, -1]);
  assert.deepEqual([topOfTower.slice, topOfTower.component, topOfTower.column, topOfTower.row], [2, null, 1, 1]);
  const side = s.api.pickRay([10, 1.5, 0.5], [-1, 0, 0]);                       // along +x into the foot of the L at row 1, slice 0
  assert.deepEqual([side.slice, side.column, side.row], [0, 3, 1], 'the +x face of the voxel (3, 1, 0): the voxel is below the plane, not above');
  const fromBelow = s.api.pickRay([1.5, 3.5, -5], [0, 0, 1]);                   // the -z face of the voxel (1, 3, 0)
  assert.deepEqual([fromBelow.slice, fromBelow.column, fromBelow.row], [0, 1, 3]);
  // a face that is not a unit voxel face names no voxel (but still its slice): the page never invents a pixel
  const tilted = makeViewer();
  tilted.load('prediction', encodeMesh({
    shape: [6, 5, 4], vertices: [[1, 1, 1], [3, 1, 1], [1, 3, 2]], triangles: [[0, 1, 2]], slices: [1], header: { foreground_voxels: 1 },
  }));
  const slanted = tilted.api.pickRay([1.5, 1.5, 10], [0, 0, -1]);
  assert.deepEqual([slanted.slice, slanted.column, slanted.row], [1, null, null]);
  // a face whose voxel is not in its source slice: the slice stays the artifact's word, the pixel is withheld
  const odd = makeViewer();
  odd.load('prediction', encodeMesh({ ...boxMesh([6, 5, 4], [1, 1, 0], [3, 3, 1]), slices: new Array(12).fill(2) }));
  const off = odd.api.pickRay([2, 2, 10], [0, 0, -1]);
  assert.deepEqual([off.slice, off.column, off.row], [2, null, null]);
});

test('V2W25 a damaged region table, or a face that names the wrong region, is refused with its code; nothing is drawn from it', () => {
  const refuse = (bytes, code) => {
    const w = makeViewer();
    w.load('error', bytes);
    const e = w.events('error');
    assert.equal(e.length, 1, `${code}: ${JSON.stringify(e)}`);
    assert.match(e[0].message, new RegExp(`^${code}`), e[0].message);
    assert.equal(w.events('loaded').length, 0, code);
    assert.equal(w.api.state().loaded.falsePositive, false);
  };
  const ok = makeViewer();
  ok.load('error', errorGoldenBytes());
  assert.equal(ok.events('error').length, 0, 'the golden itself is accepted');
  // faces: a number of the other class, zero, past the last region, a region left with no face, a face on a slice its region does not have
  refuse(patched(errorGoldenBytes(), (b, o) => { b[o.components + 0] = 3; }), 'MESH_COMPONENT');       // an FP face naming the FN region
  refuse(patched(errorGoldenBytes(), (b, o) => { b[o.components + 0] = 0; }), 'MESH_COMPONENT');
  refuse(patched(errorGoldenBytes(), (b, o) => { b[o.components + 0] = 4; }), 'MESH_COMPONENT');
  refuse(patched(errorGoldenBytes(), (b, o) => { b[o.components + 0] = 255; }), 'MESH_COMPONENT');
  refuse(patched(errorGoldenBytes(), (b, o) => { for (let t = 0; t < 44; t += 1) if (b[o.components + t] === 2) b[o.components + t] = 1; }), 'MESH_COMPONENT');   // FP_0002 loses its faces
  refuse(patched(errorGoldenBytes(), (b, o) => { b[o.components + 44] = 1; }), 'MESH_COMPONENT');       // an FN face naming an FP region
  refuse(patched(errorGoldenBytes(), (b, o) => { new DataView(b.buffer).setUint16(o.slices + 0, 0, true); }), 'MESH_COMPONENT');   // slice 0 is not one of FP_0001's (3, 4) - or FP_0002's (5)
  // the table: every damage the screen refuses, the page refuses too (it may be handed bytes the screen did not see)
  const shape = GOLDEN.shape_xyz;
  const fp = boxClass([1, 1, 0], [3, 3, 1]);
  const fn = boxClass([4, 3, 1], [5, 4, 2]);
  const base = encodeErrorMesh({ shape, fp, fn });
  const ok2 = makeViewer();
  ok2.load('error', base);
  assert.equal(ok2.events('error').length, 0);
  const header = sectionsOf(base).header;
  const edit = (change) => { const t = JSON.parse(JSON.stringify(header.components)); change(t); return t; };
  refuse(encodeErrorMesh({ shape, fp, fn, connectivity: 7 }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, header: { component_count: 5 } }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, componentTable: edit((t) => t.reverse()) }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, componentTable: edit((t) => { t[0].id = 'FP_0009'; }) }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, componentTable: edit((t) => { t[0].voxels = 3; }) }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, componentTable: edit((t) => { t[0].slice_voxels = [4, 0]; }) }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, componentTable: edit((t) => { t[0].first_slice = 4; }) }), 'MESH_COMPONENTS');   // runs past Nz = 4
  refuse(encodeErrorMesh({ shape, fp, fn, componentTable: edit((t) => { t[1].voxels = 2; t[1].slice_voxels = [2]; }) }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, classTable: header.classes.map((c, i) => (i ? { ...c, component_range: [1, 2] } : c)) }), 'MESH_COMPONENTS');
  refuse(encodeErrorMesh({ shape, fp, fn, componentBytes: 2, header: { component_index_bytes: 2 } }), 'MESH_COMPONENTS');   // not the smallest type
  refuse(encodeErrorMesh({ shape, fp, fn, header: { component_index_bytes: 3 } }), 'MESH_HEADER');
  // a face with no region at all, and a region number for every face of the wrong width
  refuse(encodeErrorMesh({ shape, fp, fn, faceComponents: new Array(24).fill(0) }), 'MESH_COMPONENT');
  refuse(encodeErrorMesh({ shape, fp, fn, faceComponents: [...new Array(12).fill(2), ...new Array(12).fill(2)] }), 'MESH_COMPONENT');
});

/* ------------------------------------------------------------------ the selected region is highlighted */

const goldenRegions = () => {
  const key = (x, y, z) => `${x},${y},${z}`;
  const pred = new Set(ERROR_GOLDEN.prediction_voxels_xyz.map((q) => key(...q)));
  const ref = new Set(ERROR_GOLDEN.reference_voxels_xyz.map((q) => key(...q)));
  const sets = { FP: new Set([...pred].filter((k) => !ref.has(k))), FN: new Set([...ref].filter((k) => !pred.has(k))) };
  const out = [];
  for (const cls of ['FP', 'FN']) {
    const unseen = new Set(sets[cls]);
    while (unseen.size) {                                        // 26-connected components by a plain flood fill
      const seed = unseen.values().next().value;
      unseen.delete(seed);
      const members = [seed];
      const queue = [seed];
      while (queue.length) {
        const [x, y, z] = queue.pop().split(',').map(Number);
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
          const k = key(x + dx, y + dy, z + dz);
          if ((dx || dy || dz) && unseen.has(k)) { unseen.delete(k); members.push(k); queue.push(k); }
        }
      }
      // the faces of the region: a face of a member voxel whose neighbour across it is not in the class
      let faces = 0;
      for (const m of members) {
        const [x, y, z] = m.split(',').map(Number);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (!sets[cls].has(key(x + dx, y + dy, z + dz))) faces += 1;
      }
      out.push({ cls, voxels: members.length, firstSlice: Math.min(...members.map((m) => Number(m.split(',')[2]))), triangles: 2 * faces });
    }
  }
  // the documented order: FP before FN, largest first, then the first slice
  return out.sort((a, b) => (a.cls === b.cls ? 0 : a.cls === 'FP' ? -1 : 1) || b.voxels - a.voxels || a.firstSlice - b.firstSlice);
};

test('V2W26 the selected region is drawn in a pass of its own: exactly its faces, solid and brightened, over its layer; none, another layer or a bad number draws nothing', () => {
  const v = makeViewer();
  v.load('prediction', errorGoldenPredictionBytes());
  v.load('error', errorGoldenBytes());
  const regions = goldenRegions();
  assert.equal(regions.length, 3);
  assert.deepEqual(ERROR_GOLDEN.components.map((c) => [c.class, c.voxels, c.first_slice]), regions.map((r) => [r.cls, r.voxels, r.firstSlice]), 'the independent flood fill finds the golden\'s three regions, in its order');
  assert.deepEqual(regions.map((r) => r.triangles), [32, 12, 32], 'hand-derived: 16 + 6 + 16 exposed voxel faces, two triangles each');
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().highlight)), { component: null, role: null, faces: 0 });
  regions.forEach((region, k) => {
    v.send({ type: 'highlight', component: k + 1 });
    const state = JSON.parse(JSON.stringify(v.api.state().highlight));
    assert.deepEqual(state, { component: k + 1, role: region.cls === 'FP' ? 'falsePositive' : 'falseNegative', faces: region.triangles }, `region ${k + 1}`);
    // the highlighted triangles are those of that region and no others (their number in the artifact is the region's)
    const layer = region.cls === 'FP' ? 'falsePositive' : 'falseNegative';
    const faces = v.api.highlightFaces();
    assert.equal(new Set(faces).size, faces.length);
    assert.ok(faces.every((t) => t >= 0 && t < (layer === 'falsePositive' ? FP_TRIANGLES : FN_TRIANGLES)));
  });
  // drawing: the third region is the FN slab; its pass follows the layers' own, solid, brightened toward white, nearer by the depth offset
  v.send({ type: 'highlight', component: 3 });
  const uniform = (calls, name) => calls.filter(([n, loc]) => n === 'uniform1f' && loc && loc.uniform === name).map((c) => c[2]);
  const frame = v.frame();
  const draws = frame.filter(([n]) => n === 'drawElements').map((c) => c[2]);
  assert.deepEqual(draws, [v.api.state().triangles.prediction * 3, FP_TRIANGLES * 3, FN_TRIANGLES * 3, 32 * 3], 'prediction, FP, FN, then the region');
  assert.deepEqual(uniform(frame, 'uHatch'), [0, 2, 1, 0], 'the region is solid (no pattern): it differs from its layer without colour');
  assert.deepEqual(frame.filter(([n]) => n === 'polygonOffset').map((c) => c.slice(1)), [[-1, -1], [-2, -2]], 'nearer than the layer it is a part of');
  const colors = frame.filter(([n, loc]) => n === 'uniform3f' && loc && loc.uniform === 'uColor').map((c) => c.slice(2));
  const fnColor = v.api.state().colors.falseNegative;
  assert.deepEqual(colors[colors.length - 1].map((x) => Math.round(x * 1e6)), Array.from(fnColor, (c) => Math.round((c + (1 - c) * 0.6) * 1e6)), 'its class colour mixed 60 % toward white');
  // hidden layer: not drawn (the state stays, the pass does not)
  v.send({ type: 'layers', falseNegative: false });
  assert.equal(v.frame().filter(([n]) => n === 'drawElements').length, 2, 'prediction and FP only');
  assert.equal(v.api.state().highlight.component, 3);
  v.send({ type: 'layers', falseNegative: true });
  // none: cleared, and the highlight's buffers are released
  const deleted = v.glCalls.filter(([n]) => n === 'deleteVertexArray').length;
  v.send({ type: 'highlight', component: null });
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().highlight)), { component: null, role: null, faces: 0 });
  assert.equal(v.glCalls.filter(([n]) => n === 'deleteVertexArray').length, deleted + 1);
  assert.equal(v.frame().filter(([n]) => n === 'drawElements').length, 3, 'back to the layers');
  assert.equal(v.frame().length, 0, 'and an unchanged scene draws nothing');
  // numbers that name no region of a loaded layer draw nothing and do not throw
  for (const bad of [0, 4, 99, -1, 1.5, '1', true, NaN, undefined]) {
    v.send({ type: 'highlight', component: bad });
    assert.equal(v.api.state().highlight.component, null, String(bad));
    assert.equal(v.events('error').length, 0, String(bad));
  }
  // the error layers are loaded again (a Retry, another mesh): a highlight made on the old one is gone with it
  v.send({ type: 'highlight', component: 1 });
  v.load('error', encodeErrorMesh({ shape: ERROR_GOLDEN.shape_xyz, fp: boxClass([1, 1, 0], [3, 3, 1]) }));
  assert.equal(v.api.state().highlight.component, null);
  assert.equal(v.events('error').length, 0);
  // a region of a layer that is not loaded draws nothing
  const bare = makeViewer();
  bare.send({ type: 'highlight', component: 1 });
  assert.equal(bare.api.state().highlight.component, null);
});

test('V2W27 more than 65,535 vertices in a class: its highlight uses four-byte indices like the layer', () => {
  const v = makeViewer();
  const shape = [200, 200, 4];
  // 8,200 isolated one-voxel boxes in one class: 8 vertices each = 65,600 vertices, each its own region
  const boxes = [];
  for (let k = 0; k < 8200; k += 1) boxes.push([(k % 100) * 2, Math.floor(k / 100) * 2]);
  const vertices = [];
  const triangles = [];
  const slices = [];
  const regions = [];
  boxes.forEach(([x, y], k) => {
    const b = boxMesh([1, 1, 1], [x, y, 0], [x + 1, y + 1, 1]);
    const at = vertices.length;
    vertices.push(...b.vertices);
    regions.push({ faces: b.triangles.map((_, i) => triangles.length + i), firstSlice: 0, sliceVoxels: [1] });
    triangles.push(...b.triangles.map((t) => t.map((i) => i + at)));
    slices.push(...b.slices);
  });
  const fp = { voxels: boxes.length, vertices, triangles, slices, regions };
  v.load('error', encodeErrorMesh({ shape, fp, indexBytes: 4 }));
  assert.equal(v.events('error').length, 0, JSON.stringify(v.events('error')));
  assert.equal(v.events('loaded')[0].vertices, 65600);
  v.send({ type: 'highlight', component: 8200 });
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().highlight)), { component: 8200, role: 'falsePositive', faces: 12 });
  const upload = v.glCalls.filter(([n, target]) => n === 'bufferData' && target === 'ELEMENT_ARRAY_BUFFER').pop();
  assert.equal(upload[2], 'Uint32Array(36)', 'a layer of more than 65,535 vertices is indexed with 32 bits, so is its highlight');
  const hit = v.api.pickRay([(8199 % 100) * 2 + 0.5, Math.floor(8199 / 100) * 2 + 0.5, 20], [0, 0, -1]);
  assert.deepEqual([hit.component, hit.column, hit.row], [8200, 99 * 2, 81 * 2]);
});
