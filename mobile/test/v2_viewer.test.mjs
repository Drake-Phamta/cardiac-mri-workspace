// node --test mobile/test/  - V2 SCR-05: the WebGL2 viewer script, run in node against a stubbed canvas and GL
//
// What this proves: the page's own code decodes the served `cardiac-mesh/1` artifact (the Python golden), refuses a
// damaged one, casts a pick ray with the same result as the Python reference on the golden's cases, resolves a TAP
// through its camera to the face's source slice (H7), never resolves a background tap to a slice, honours the layer
// switches, and turns pointer events into orbit / pinch zoom / pan / tap. What it cannot prove: how it looks, or how fast
// it draws on the A17 - that is the owner's TC-3D-001/002 and TC-PERF-002 on the device.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { VIEWER_SCRIPT } from '../src/verticals/v2/viewerSource.mjs';
import { boxMesh, encodeMesh, GOLDEN, goldenBytes } from './_v2mesh.mjs';

function makeViewer() {
  const posted = [];
  const canvasHandlers = {};
  const windowHandlers = {};
  const documentHandlers = {};
  const glCalls = [];
  const gl = new Proxy({}, {
    get: (_t, name) => {
      if (typeof name !== 'string') return undefined;
      if (/^[A-Z_0-9]+$/.test(name)) return name; // GL constants
      return (...args) => { glCalls.push([name, ...args]); return name === 'getUniformLocation' || name.startsWith('create') ? { name } : true; };
    },
  });
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  const canvas = {
    clientWidth: 400, clientHeight: 400, width: 0, height: 0, getContext: () => gl, setPointerCapture() {},
    getBoundingClientRect: () => rect, addEventListener: (type, fn) => { canvasHandlers[type] = fn; },
  };
  const document = { getElementById: () => canvas, addEventListener: (type, fn) => { documentHandlers[type] = fn; } };
  const window = {
    ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) },
    addEventListener: (type, fn) => { windowHandlers[type] = fn; },
    requestAnimationFrame: () => 0, devicePixelRatio: 1,
  };
  const context = vm.createContext({ window, document, atob: globalThis.atob, console });
  new vm.Script(VIEWER_SCRIPT, { filename: 'viewer-script.js' }).runInContext(context);
  const api = window.__cardiacViewer;
  const send = (message) => windowHandlers.message({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  const load = (role, bytes) => send({ type: 'mesh', role, b64: b64(bytes) });
  const events = (type) => posted.filter((m) => m.type === type);
  return { api, posted, canvas, canvasHandlers, windowHandlers, documentHandlers, glCalls, send, load, events, rect };
}

const FACE_ON_TOP = { x: 1.5, y: 1.5, z: 3 };   // the top of the tower at column 1, row 1: voxels z 0..2 -> source slice 2

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
  assert.deepEqual(JSON.parse(JSON.stringify(v.api.state().loaded)), { prediction: true, groundTruth: true });
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
});

test('V2W4 H7: a TAP goes through the camera to the face under the finger and posts its source slice', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });
  const tap = (p) => {
    const at = v.api.project([p.x, p.y, p.z]);
    v.canvasHandlers.pointerdown({ pointerId: 1, clientX: at.x, clientY: at.y });
    v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: at.x, clientY: at.y });
  };
  tap(FACE_ON_TOP);
  tap({ x: 4.5, y: 3.5, z: 4 });   // the top of the voxel (4, 3, 3): source slice 3
  const picks = v.events('pick');
  assert.deepEqual(picks.map((p) => [p.role, p.slice]), [['prediction', 2], ['prediction', 3]]);
  assert.ok(picks.every((p) => Number.isInteger(p.triangle) && p.triangle >= 0 && p.triangle < GOLDEN.triangle_count));
  assert.equal(v.api.state().slice, 3, 'the selected slice becomes the band on the surface');
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
  assert.deepEqual(v.events('pick'), [{ type: 'pick', role: null, triangle: null, slice: null }]);
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
