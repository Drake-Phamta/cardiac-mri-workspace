// node spikes/spike_b_3d/s1/test_s1_core.mjs
//
// Checks for the S-1 page core: the scripted camera, the auto poses, the projection that
// turns a target into a tap, the pick record the extractor reads, and that the vendored
// frame probe is byte-identical to PR #44's app/performance.js whenever that file exists.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invertMat4, multiplyMat4, rayMeshFirstHit, screenRayFromNdc, worldToSlice } from '../app/picking.js';
import { FrameProbe, summarizeFrameIntervals } from './frame_probe_pr44.js';
import {
  AUTO_POSES, FIT_CAMERA, S1_PROBE_MEASURE_MS, S1_PROBE_WARMUP_MS, ZOOM_MAX, ZOOM_MIN, cssToNdc,
  gridScreenPoints, parseCommand, pickRecord, projectToCss, scriptedCamera,
} from './s1_core.js';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
function ok(cond, name) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed += 1;
}
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// 1 - vendored probe == PR #44 performance.js (when present in this checkout)
const vendored = readFileSync(join(here, 'frame_probe_pr44.js'));
const upstream = join(here, '..', 'app', 'performance.js');
if (existsSync(upstream)) {
  ok(Buffer.compare(vendored, readFileSync(upstream)) === 0, 'frame_probe_pr44.js is byte-identical to app/performance.js');
} else {
  ok(vendored.length === 3480, 'vendored probe has the PR #44 62d39de size (3,480 bytes)');
}

// 2 - scripted camera: deterministic, continuous phases, zoom inside the clamp
ok(JSON.stringify(scriptedCamera(0)) === JSON.stringify(scriptedCamera(0)), 'scriptedCamera is deterministic');
ok(close(scriptedCamera(0).yaw, FIT_CAMERA.yaw), 'orbit starts at the fit camera');
ok(close(scriptedCamera(12999).yaw, FIT_CAMERA.yaw + 2 * Math.PI * (12.999 / 13), 1e-9), 'orbit turns once in 13 s');
const panMid = scriptedCamera(15500);
ok(Math.abs(panMid.pan[0]) > 0.1, 'pan phase moves the target');
let zmin = Infinity, zmax = -Infinity;
for (let t = 23000; t <= 33000; t += 50) {
  const d = scriptedCamera(t).distance;
  zmin = Math.min(zmin, d);
  zmax = Math.max(zmax, d);
}
ok(zmin >= ZOOM_MIN && zmax <= ZOOM_MAX && zmax / zmin > 4, `zoom phase spans ${zmin.toFixed(2)}..${zmax.toFixed(2)}`);
ok(S1_PROBE_WARMUP_MS + S1_PROBE_MEASURE_MS === 33000, 'probe window is 3 s + 30 s, as on 2026-09-18');
for (let t = 0; t <= 33000; t += 250) {
  const c = scriptedCamera(t);
  if (!(Math.abs(c.pitch) <= 1.45 && Number.isFinite(c.yaw) && c.pan.every(Number.isFinite))) throw new Error(`bad camera at ${t}`);
}
passed += 1;

// 3 - poses and grid
ok(AUTO_POSES.length === 6 && new Set(AUTO_POSES.map((p) => p.id)).size === 6, 'six distinct auto poses');
ok(AUTO_POSES.some((p) => p.distance < 2) && AUTO_POSES.some((p) => p.distance > 4), 'poses include zoom in and zoom out');
ok(AUTO_POSES.some((p) => p.pitch < -1) && AUTO_POSES.some((p) => p.pitch > 1.3), 'poses include from below and near top-down');
const grid = gridScreenPoints(400, 600);
ok(grid.length === 60 && grid.every((p) => p.x > 0 && p.x < 400 && p.y > 0 && p.y < 600), 'grid of 60 interior points');

// 4 - projection round trip: project a world point, unproject the tap, hit the same point
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far); out[11] = -1; out[14] = (2 * far * near) / (near - far);
  return out;
}
const projection = perspective(Math.PI / 4, 400 / 600, 0.01, 100);
const model = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1]);
const pm = multiplyMat4(new Float32Array(16), projection, model);
// one triangle facing the camera at z = 0
const tri = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
const world = [0.1, -0.2, 0];
const screen = projectToCss(pm, world, 400, 600);
ok(screen && screen.x > 0 && screen.y > 0, 'target projects onto the canvas');
const ndc = cssToNdc(screen.x, screen.y, 400, 600);
ok(close(ndc[0], screen.ndc[0], 1e-9) && close(ndc[1], screen.ndc[1], 1e-9), 'cssToNdc inverts projectToCss');
const inv = invertMat4(new Float32Array(16), pm);
const ray = screenRayFromNdc(ndc[0], ndc[1], inv);
const hit = rayMeshFirstHit(ray.origin, ray.direction, tri);
ok(hit && close(hit.point[0], 0.1, 1e-4) && close(hit.point[1], -0.2, 1e-4), 'the tap ray hits the projected point');
ok(projectToCss(pm, [0, 0, 10], 400, 600) === null, 'a point behind the camera is not tappable');
ok(projectToCss(pm, [50, 0, 0], 400, 600) === null, 'an off-canvas point is not tappable');

// 5 - pick record: outcome classes and the fields the extractor needs
const geometry = { shape_xyz: [4, 4, 4], spacing_xyz_mm: [1, 1, 1], origin_world_mm: [-2, -2, -2] };
const resolved = worldToSlice(hit.point, geometry);
const rec = pickRecord({
  pickId: 'L0-1', phase: 'auto_target', level: 0, poseId: 'P0_fit',
  camera: { yaw: 0, pitch: 0, distance: 3, pan: [0, 0], scale: 1, center: [0, 0, 0] },
  canvasCss: [400, 600], canvasBacking: [1050, 1575], dpr: 2.625, screen, ndc, ray, hit, resolved,
  navigationPosted: true, target: { id: 'T00', expected_slice: 1, world, face: '+z' }, elapsedMs: 1.5,
});
ok(rec.kind === 's1_pick' && rec.outcome === 'resolved' && rec.resolved_slice === resolved.sliceIndex, 'resolved record');
ok(rec.ray_origin_world.length === 3 && rec.ray_direction_world.length === 3, 'record carries the world ray');
ok(rec.target.expected_slice === 1 && rec.navigation_posted === true, 'record carries the target and the navigation flag');
const miss = pickRecord({ pickId: 'L0-2', phase: 'auto_grid', level: 0, ray, hit: null, resolved: null, navigationPosted: false });
ok(miss.outcome === 'no_hit' && miss.navigation_posted === false && miss.resolved_slice === null, 'no-hit record never navigates');
const outside = pickRecord({ pickId: 'L0-3', phase: 'tap', level: 0, ray, hit, resolved: null, navigationPosted: false, label: 'background' });
ok(outside.outcome === 'outside_volume' && outside.operator_label === 'background', 'outside-volume record and tap label');
ok(JSON.stringify(rec).length < 3000, 'a pick record fits one logcat line (no chunking needed)');

// 6 - commands
ok(parseCommand('{"cmd":"run_suite"}').cmd === 'run_suite', 'parses a command');
ok(parseCommand('not json') === null && parseCommand('{"kind":"x"}') === null, 'ignores non-commands');

// 7 - frame probe summary is the PR #44 nearest-rank rule
const s = summarizeFrameIntervals([16.7, 16.6, 16.8, 600]);
ok(s.frames_over_500ms === 1 && s.longest_stall_ms === 600, 'stall accounting');
const probe = new FrameProbe({ startedAt: 0, warmupMs: 10, measureMs: 100 });
let result = null;
for (let t = 0; t <= 140 && !result; t += 16.7) result = probe.record(t);
ok(result && result.status === 'complete' && result.raw_frame_intervals_ms.length > 0, 'probe completes');

console.log(`s1 core tests: ${passed} passed`);
