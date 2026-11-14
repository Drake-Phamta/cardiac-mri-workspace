// node --test mobile/test/  - V2 SCR-05: the WebGL2 viewer script, run in node against a stubbed canvas and GL
//
// What this proves: the page's own code decodes the served `cardiac-mesh/1` artifact (the Python golden), refuses a
// damaged one, casts a pick ray with the same result as the Python reference on the golden's cases, resolves a TAP
// through its camera to the face's source slice (H7), never resolves a background tap to a slice, honours the layer
// switches, and turns pointer events into orbit / pinch zoom / pan / tap; that a tap on an error marker names it, the
// cut hides (and does not pick) what lies above the slice, the axis views look along the voxel axes, see-through layers
// are drawn after the solid ones, the axis marker is labelled with voxel axes, and dispose frees every GPU object.
// The tools the page draws over the surface (layers, opacity, cut, views, Previous / Next) are pressed here the way the
// page's own click listener sees them (data-act / data-arg), so the same code path serves a finger and a test.
// What it cannot prove: how it looks, or how fast it draws on the A17 - that is the owner's device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { VIEWER_HTML, VIEWER_SCRIPT } from '../src/screens/v2-3d/viewerHtml.mjs';
import { boxMesh, encodeMesh, GOLDEN, goldenBytes } from './_v2mesh.mjs';
import { errorClass, overlay } from '../src/components/tokens.mjs';
import { makeViewer } from './_v2viewer.mjs';
import { PALETTE } from '../src/screens/v2-3d/viewerTools.mjs';

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
  v.press('layer', 'prediction');
  assert.equal(v.api.pickRay(ray.origin, ray.direction).role, 'groundTruth');
  assert.equal(v.api.pickRay(ray.origin, ray.direction).slice, 2);
  v.press('layer', 'groundTruth');
  assert.equal(v.api.pickRay(ray.origin, ray.direction), null, 'nothing visible, nothing to pick');
  v.send({ type: 'layers', prediction: true, groundTruth: true });
  assert.equal(v.api.pickRay(ray.origin, ray.direction), null, 'the app cannot flip the switches: they belong to the tools');
  v.press('layer', 'prediction');
  assert.equal(v.api.pickRay(ray.origin, ray.direction).role, 'prediction');
  v.press('layer', 'errors');
  assert.equal(v.api.state().visible.errors, true, 'a layer with nothing loaded has no switch');
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
  v.press('fit');
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

// ---- error markers, cut, axis views, opacity, axis marker, dispose ------------------------------------------------

// Two markers on the golden L shape: an FP inside the top of the tower at (1, 1) and an FN beside it.
const MARKERS = [
  { id: 'FN_0001', cls: 'FN', at: [3, 3, 0], voxels: 6 },
  { id: 'FP_0001', cls: 'FP', at: [1, 1, 2], voxels: 1 },
];
const centre = (m) => [m.at[0] + 0.5, m.at[1] + 0.5, m.at[2] + 0.5];
const topDown = (v) => v.api.setCamera({ yaw: 0, pitch: 0, zoom: 1, pan: [0, 0] });

test('V2W13 a tap on an error marker names it and moves the band to its slice; markers are drawn over the surface', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.send({ type: 'markers', items: MARKERS });
  topDown(v);
  const fp = v.api.project(centre(MARKERS[1]));
  v.tap(fp.x, fp.y);
  assert.deepEqual(v.events('marker'), [{ type: 'marker', id: 'FP_0001' }], 'the marker wins over the tower top just under it');
  assert.equal(v.events('pick').length, 0);
  assert.deepEqual([v.api.state().slice, v.api.state().selected], [2, 'FP_0001']);
  v.tap(fp.x + 40, fp.y + 40);
  assert.equal(v.events('marker').length, 1, 'a tap 40 px away is not a marker tap');
  assert.equal(v.events('pick').length, 1, 'it falls through to the surface pick');
  assert.equal(v.api.state().selected, null, 'and clears the marker selection');
  v.press('layer', 'errors');
  v.tap(fp.x, fp.y);
  assert.deepEqual(v.events('pick').pop().slice, 2, 'with the error layer off the same tap picks the surface');
  assert.deepEqual([...v.api.state().shownMarkers], []);
});

test('V2W14 the app picks the selected marker; a malformed marker list is refused for the error layer only', () => {
  const v = makeViewer();
  v.send({ type: 'markers', items: MARKERS });
  v.send({ type: 'select', id: 'FN_0001' });
  assert.equal(v.api.state().selected, 'FN_0001');
  v.send({ type: 'select', id: 7 });
  assert.equal(v.api.state().selected, null);
  for (const items of [null, [{ ...MARKERS[0], cls: 'TP' }], [{ ...MARKERS[0], at: [1, 1] }], [{ ...MARKERS[0], at: [1, -1, 0] }], [{ ...MARKERS[0], voxels: 0 }]]) {
    v.send({ type: 'markers', items });
    const e = v.events('error').pop();
    assert.equal(e.role, 'errors', JSON.stringify(items));
    assert.match(e.message, /^MARKERS_INVALID/);
  }
  assert.equal(v.api.state().markers, 2, 'the last good markers stay');
});

test('V2W15 Cut at slice: nothing above the slice is drawn or picked, markers above it are hidden', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.send({ type: 'markers', items: MARKERS });
  const down = (x, y) => v.api.pickRay([x, y, 10], [0, 0, -1]);
  assert.deepEqual([down(1.5, 1.5).slice, down(1.5, 1.5).distance], [2, 7], 'no cut: the tower top (z = 3)');
  v.press('cut');
  assert.equal(v.api.state().cut, null, 'with no slice there is nothing to cut at');
  v.send({ type: 'slice', index: 1 });
  v.press('cut');
  assert.equal(v.api.state().cut, 2, 'slice 1 keeps everything up to z = 2');
  assert.deepEqual([down(1.5, 1.5).slice, down(1.5, 1.5).distance], [0, 10], 'the hidden top is skipped: the ray reaches the bottom face');
  assert.deepEqual([...v.api.state().shownMarkers], ['FN_0001'], 'the marker on slice 2 is above the cut');
  v.send({ type: 'slice', index: 2 });
  assert.deepEqual([down(4.5, 3.5).slice, down(4.5, 3.5).distance], [2, 8], 'the voxel on slice 3 is cut away, its slice-2 voxel stays');
  assert.deepEqual([...v.api.state().shownMarkers], ['FN_0001', 'FP_0001']);
  v.press('cut');
  assert.equal(v.api.state().cut, null);
  assert.equal(down(4.5, 3.5).slice, 3);
  v.press('cut');
  v.send({ type: 'slice', index: null });
  assert.equal(v.api.state().cut, null, 'no slice, nothing to cut at');
  v.frame();
  assert.ok(v.glCalls.some(([n, , value]) => n === 'uniform1f' && value === -1), 'the shader gets -1: no cut');
});

test('V2W16 axis views look along each voxel axis from its named side; Fit returns to the default view', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  const look = () => {
    const ray = v.api.rayAt(200, 200);
    const n = Math.hypot(...ray.direction);
    return Array.from(ray.direction, (x) => Math.round((x / n) * 1000) / 1000 + 0);  // + 0 turns -0 into 0
  };
  const expected = { '+x': [-1, 0, 0], '-x': [1, 0, 0], '+y': [0, -1, 0], '-y': [0, 1, 0], '+z': [0, 0, -1], '-z': [0, 0, 1] };
  for (const [axis, dir] of Object.entries(expected)) {
    v.press('view', axis);
    assert.deepEqual(look(), dir, `from ${axis} the camera looks along ${dir}`);
    assert.deepEqual([v.api.camera().zoom, ...v.api.camera().pan], [1, 0, 0]);
  }
  v.press('view', 'anterior');
  assert.deepEqual(look(), [0, 0, 1], 'an unknown view changes nothing');
  v.press('view', '+y');
  v.canvasHandlers.pointerdown({ pointerId: 1, clientX: 100, clientY: 100 });
  v.canvasHandlers.pointermove({ pointerId: 1, clientX: 100, clientY: 200 });
  v.canvasHandlers.pointerup({ type: 'pointerup', pointerId: 1, clientX: 100, clientY: 200 });
  assert.ok(v.api.camera().pitch <= Math.PI / 2 + 1e-12, 'orbiting never tips past the pole');
  v.press('fit');
  assert.deepEqual([v.api.camera().yaw, v.api.camera().pitch], [-0.5, 0.35]);
});

test('V2W17 opacity: solid layers are drawn first into the depth buffer, see-through layers after, blended', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.load('groundTruth', goldenBytes());
  const draws = () => {
    v.glCalls.length = 0;
    v.press('fit');   // anything that asks for a new frame
    v.frame();
    let depth = null, blend = null, alpha = null;
    const out = [];
    for (const [n, a, b] of v.glCalls) {
      if (n === 'depthMask') depth = a;
      if (n === 'enable' && a === 'BLEND') blend = true;
      if (n === 'disable' && a === 'BLEND') blend = false;
      if (n === 'uniform1f') alpha = b;
      if (n === 'drawElements') out.push([depth, blend, alpha]);
    }
    return out;
  };
  assert.deepEqual(draws(), [[true, false, 1], [false, true, 0.3]], 'default: a solid prediction, then the ground truth at 30%');
  v.press('opacity', 'prediction:0.6');
  v.press('opacity', 'groundTruth:1');
  assert.deepEqual(draws(), [[true, false, 1], [false, true, 0.6]], 'a solid ground truth first, then the prediction at 60%');
  for (const bad of ['prediction:0', 'groundTruth:2', 'prediction:0.5', 'prediction:x', 'errors:1', 'sky:0.3']) v.press('opacity', bad);
  assert.deepEqual({ ...v.api.state().opacity }, { prediction: 0.6, groundTruth: 1 }, 'only the three steps 30 / 60 / 100 % of the two surfaces are accepted');
  v.send({ type: 'markers', items: MARKERS });
  v.frame();
  assert.ok(v.glCalls.some(([n, mode, , count]) => n === 'drawArrays' && mode === 'POINTS' && count === 2), 'the two markers are drawn as points');
});

test('V2W18 the axis marker names the voxel axes, never anatomy', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.frame();
  assert.deepEqual([...new Set(v.axesText)].sort(), ['voxel axes', 'x col', 'y row', 'z slice']);
  assert.ok(!v.axesText.some((t) => /^(A|P|S|I|L|R)$|anterior|superior|mm/i.test(t)));
});

test('V2W19 dispose frees every buffer, vertex array, shader and program, and loses the context; then the page is quiet', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.load('groundTruth', goldenBytes());
  v.load('prediction', goldenBytes());   // a replaced layer frees its old buffers at once
  v.send({ type: 'markers', items: MARKERS });
  v.frame();
  const count = (name) => v.glCalls.filter(([n]) => n === name).length;
  assert.equal(count('deleteBuffer'), 2, 'the replaced prediction layer');
  assert.equal(typeof v.windowHandlers.pagehide, 'function', 'the page also frees everything when it is unloaded');
  v.send({ type: 'dispose' });
  assert.equal(count('deleteBuffer'), count('createBuffer'));
  assert.equal(count('deleteVertexArray'), count('createVertexArray'));
  assert.equal(count('deleteShader'), count('createShader'));
  assert.equal(count('deleteProgram'), count('createProgram'));
  assert.deepEqual([count('createProgram'), count('loseContext')], [2, 1]);
  const before = v.glCalls.length;
  v.canvasHandlers.webglcontextlost({ preventDefault() {} });
  v.load('prediction', goldenBytes());
  v.frame();
  v.windowHandlers.pagehide();
  assert.equal(v.events('error').length, 0, 'losing the context on purpose is not an error');
  assert.equal(v.events('loaded').length, 3, 'nothing is loaded after dispose');
  assert.equal(v.glCalls.length, before, 'and nothing touches the GPU again');
  assert.equal(v.api.state().disposed, true);
});

// ---- the tools over the surface ------------------------------------------------------------------------------------

test('V2W20 the tools appear with the surface, each a labelled button; a layer with nothing loaded has no row', () => {
  const v = makeViewer();
  assert.equal(v.tools.innerHTML, '', 'no tools before there is something to look at');
  v.load('prediction', goldenBytes());
  const labels = ['View from plus x', 'View from minus x', 'View from plus y', 'View from minus y', 'View from plus z', 'View from minus z',
    'Fit the model in view', 'Cut at the selected slice', 'Prediction', 'Prediction opacity 30%', 'Prediction opacity 60%', 'Prediction opacity 100%'];
  for (const label of labels) assert.ok(v.button(label), label);
  assert.equal(v.button('Ground truth'), null, 'no ground-truth mesh, no ground-truth row');
  assert.equal(v.button('Errors'), null, 'no markers yet, no error row');
  assert.match(v.button('Cut at the selected slice'), /disabled/, 'no slice to cut at: the cut is disabled');
  v.send({ type: 'slice', index: 2 });
  assert.doesNotMatch(v.button('Cut at the selected slice'), /disabled/);
  assert.match(v.button('Cut at the selected slice'), /aria-pressed="false"/);

  v.load('groundTruth', goldenBytes());
  v.send({ type: 'markers', items: MARKERS });
  assert.ok(v.button('Ground truth') && v.button('Errors') && v.button('Next error region') && v.button('Previous error region'));
  assert.match(v.tools.innerHTML, /2 regions/, 'with nothing selected the stepper counts the regions');
  assert.match(v.button('Ground truth opacity 30%'), /aria-pressed="true"/, 'the ground truth starts see-through');
  assert.match(v.button('Prediction opacity 100%'), /aria-pressed="true"/, 'and the prediction solid');
  v.press('opacity', 'groundTruth:0.6');
  assert.match(v.button('Ground truth opacity 60%'), /aria-pressed="true"/);
  assert.match(v.button('Ground truth opacity 30%'), /aria-pressed="false"/);
  v.press('layer', 'groundTruth');
  assert.match(v.button('Ground truth'), /aria-pressed="false"/, 'hidden: the switch says so');
  assert.equal(v.button('Ground truth opacity 60%'), null, 'a hidden layer shows no opacity steps');
  v.press('cut');
  assert.match(v.tools.innerHTML, /Above slice 3 hidden/, 'the cut says what it hides, slice numbers 1-based');
  v.press('step', 1);
  assert.match(v.tools.innerHTML, /1 \/ 2/, 'the stepper shows which region is selected');
  v.send({ type: 'dispose' });
  assert.equal(v.tools.innerHTML, '', 'after dispose the tools are gone');
});

test('V2W21 Previous / Next never select a region while the Errors layer is off: stepping shows the layer first', () => {
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.send({ type: 'markers', items: MARKERS });
  v.press('layer', 'errors');
  const s0 = v.api.state();
  assert.deepEqual([s0.visible.errors, [...s0.shownMarkers], s0.selected], [false, [], null], 'the Errors layer is off, nothing is drawn or selected');
  v.press('step', 1);
  const s1 = v.api.state();
  assert.deepEqual([s1.visible.errors, s1.selected, v.events('marker').map((m) => m.id)], [true, 'FN_0001', ['FN_0001']],
    'Next turns the layer on, then selects the first region and tells the app');
  assert.deepEqual([...s1.shownMarkers], ['FN_0001', 'FP_0001'], 'and the markers are drawn');
  // the same from the layer off again, going backwards: the last region
  v.press('step', 1);
  v.press('layer', 'errors');
  v.press('step', -1);
  const s2 = v.api.state();
  assert.deepEqual([s2.visible.errors, s2.selected], [true, 'FN_0001'], 'Previous from the second region goes back to the first');
  assert.equal(v.events('marker').length, 3, 'every step told the app which region');
  v.press('layer', 'errors');
  v.press('step', -1);
  assert.deepEqual([v.api.state().visible.errors, v.api.state().selected], [true, 'FP_0001'], 'Previous wraps to the last region');
  v.press('step', 1);
  assert.equal(v.api.state().selected, 'FN_0001', 'Next wraps to the first');
  // no region at all: stepping does nothing and does not switch the layer on
  const none = makeViewer();
  none.load('prediction', goldenBytes());
  none.send({ type: 'markers', items: [] });
  none.press('layer', 'errors');
  none.press('step', 1);
  assert.deepEqual([none.api.state().visible.errors, none.api.state().selected, none.events('marker').length], [false, null, 0]);
  assert.match(none.tools.innerHTML, /None/, 'the row says there are none, and draws no stepper');
  assert.equal(none.button('Next error region'), null);
});

test('V2W22 every tool is at least 48 px wide and tall; the markup carries no identifier of a case', () => {
  const css = [...VIEWER_HTML.matchAll(/#tools[^{}]*button[^{}]*\{([^}]*)\}/g)].map((m) => m[1]);
  const mins = css.flatMap((rule) => [...rule.matchAll(/min-(?:width|height):(\d+)px/g)].map((m) => Number(m[1])));
  assert.ok(mins.length >= 2 && mins.every((n) => n >= 48), `min sizes of the tool buttons: ${mins}`);
  assert.ok(!/(^|[^-])(width|height):\d+px/.test(css.join(';').replace(/min-(width|height):\d+px/g, '')), 'no fixed size on a button can shrink it below the minimum');
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.load('groundTruth', goldenBytes());
  v.send({ type: 'markers', items: MARKERS });
  assert.ok((v.tools.innerHTML.match(/<button /g) || []).length >= 17, 'six views, Fit, Cut, two layers with three steps each, errors with Previous / Next');
  assert.ok(!/CASE_|RUN_|MASK_|MESH_|http/.test(v.tools.innerHTML + VIEWER_HTML.replace(/MESH_[A-Z]+:/g, '')), 'the page holds nothing that names a case');
});

test('V2W23 one legend for the app: the page takes its colours from the design tokens, nothing is hand-written in it', () => {
  assert.deepEqual([PALETTE.prediction, PALETTE.groundTruth, PALETTE.FN, PALETTE.FP], [overlay.prediction, overlay.groundTruth, errorClass.FN, errorClass.FP]);
  // The page carries exactly that palette, so a token change reaches the surface and the tool chips together.
  const inPage = JSON.parse(/var PALETTE = (\{[^;]*\});/.exec(VIEWER_SCRIPT)[1]);
  assert.deepEqual(inPage, { ...PALETTE });
  assert.ok(VIEWER_HTML.includes(`background:${PALETTE.background}`), 'the page is as near-black as the app bar');
  assert.ok(!/#4c8dff|#f778ba|#f0883e|#39c5cf/i.test(VIEWER_SCRIPT.replace(/var PALETTE = \{[^;]*\};/, '')), 'no hex of a data colour outside the palette');
  // the surfaces and the markers are painted with those colours (as 0-1 RGB uniforms)
  const v = makeViewer();
  v.load('prediction', goldenBytes());
  v.send({ type: 'markers', items: MARKERS });
  v.frame();
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const uniform3 = (name) => v.glCalls.filter(([n, loc]) => n === 'uniform3f' && loc && loc.name === name).pop().slice(2);
  assert.deepEqual(uniform3('uColor'), rgb(overlay.prediction));
  assert.deepEqual(uniform3('uFN'), rgb(errorClass.FN));
  assert.deepEqual(uniform3('uFP'), rgb(errorClass.FP));
});