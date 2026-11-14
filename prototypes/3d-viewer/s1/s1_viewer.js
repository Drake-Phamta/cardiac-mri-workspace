/*
 * SPIKE_B S-1 — device-session viewer: real-mesh levels, B6/B7/B9/B10/B11 probes.
 *
 * THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Day 22 (2026-10-01), written by a Claude
 * agent under the leader's recovery override; Spike B owner Vu Hung Anh adopts or rejects
 * it on Day 23.
 *
 * PROVENANCE. The renderer (shaders, compile/link, perspective, modelMatrix, setup) and the
 * orbit / two-finger pan / pinch handlers are copied from app/viewer.js at PR #44 head
 * 62d39de, unchanged except that the canvas fills the WebView. Picking and the OBJ parser
 * are NOT copied: app/picking.js and app/obj.js are bundled as they are (stage_assets.py),
 * so the device runs the tested functions. The frame probe is PR #44's app/performance.js;
 * #44 is not merged yet, so s1/frame_probe_pr44.js is a byte-identical copy of it at
 * 62d39de, and test_s1_core.mjs fails if app/performance.js exists and differs.
 *
 * The page is loaded from file:///android_asset/spike_b_s1/ inside the S-1 APK, so it is
 * one classic script (no ES modules over file://) and reads its assets with XMLHttpRequest
 * (fetch() does not accept file: URLs). It talks to React Native only through
 * window.ReactNativeWebView.postMessage, and receives commands through window.__s1Receive,
 * which App.js calls with injectJavaScript.
 *
 * It COMPUTES NO B NUMBER. It emits raw records (s1_core.pickRecord, s1_core.framePayload);
 * harness/s1_extract.py recomputes every bound on the workstation, including the truth of
 * each pick, by traversing the real mask along the ray the device logged.
 */

import { invertMat4, multiplyMat4, rayMeshFirstHit, screenRayFromNdc, worldToSlice } from '../app/picking.js';
import { FrameProbe } from './frame_probe_pr44.js';
import { parseObj } from '../app/obj.js';
import {
  AUTO_POSES, FIT_CAMERA, S1_PROBE_MEASURE_MS, S1_PROBE_RUNS, S1_PROBE_WARMUP_MS, S1_SCHEMA_VERSION,
  clampZoom, cssToNdc, framePayload, gridScreenPoints, parseCommand, pickRecord, projectToCss, scriptedCamera,
} from './s1_core.js';

const CONFIG = window.S1_CONFIG || {};
const canvas = document.querySelector('#gl');
const statusLine = document.querySelector('#status');
const NAV_ACK_TIMEOUT_MS = 3000;

function post(obj) {
  const text = JSON.stringify(obj);
  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
    window.ReactNativeWebView.postMessage(text);
  } else {
    console.log(text);
  }
}

function setStatus(text) {
  if (statusLine) statusLine.textContent = text;
}

function loadText(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = () => {
      // file:// answers status 0 on success in Android WebView
      if ((xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) && xhr.responseText) resolve(xhr.responseText);
      else reject(new Error(`load ${url}: status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`load ${url}: network error`));
    xhr.send();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// --- renderer: copied from app/viewer.js (PR #44, 62d39de) -----------------------------

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorld;
out float vSourceZ;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vNormal = mat3(uModel) * aNormal;
  vWorld = world.xyz;
  vSourceZ = aPosition.z;
  gl_Position = uProjection * world;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in float vSourceZ;
uniform vec3 uLight;
uniform vec3 uColor;
uniform bool uShading;
uniform float uSliceZ;
uniform bool uSliceActive;
out vec4 outColor;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLight - vWorld);
  vec3 viewDir = normalize(-vWorld);
  float diffuse = uShading ? max(dot(normal, lightDir), 0.0) : 0.72;
  float rim = uShading ? pow(1.0 - max(dot(normal, viewDir), 0.0), 2.3) : 0.0;
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = uShading ? pow(max(dot(normal, halfDir), 0.0), 28.0) : 0.0;
  vec3 color = uColor * (0.34 + 0.62 * diffuse + 0.18 * rim)
             + vec3(0.78, 0.95, 1.0) * (0.20 * specular);
  float planeBand = 1.0 - smoothstep(0.0, 1.6, abs(vSourceZ - uSliceZ));
  if (uSliceActive) color = mix(color, vec3(1.0, 0.72, 0.16), planeBand * 0.92);
  outColor = vec4(color, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compilation failed');
  }
  return shader;
}

function link(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

function perspective(out, fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function modelMatrix(out, yaw, pitch, distance, scale, center, pan) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const rx = cy * center[0] - sy * center[2];
  const ry = sy * sx * center[0] + cx * center[1] + cy * sx * center[2];
  const rz = sy * cx * center[0] - sx * center[1] + cy * cx * center[2];
  out.set([
    cy * scale, sy * sx * scale, sy * cx * scale, 0,
    0, cx * scale, -sx * scale, 0,
    -sy * scale, cy * sx * scale, cy * cx * scale, 0,
    -rx * scale + pan[0], -ry * scale + pan[1], -rz * scale - distance, 1,
  ]);
  return out;
}

function setup(gl, mesh) {
  const program = link(gl, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER), compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  const position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  const normal = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normal);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const aPosition = gl.getAttribLocation(program, 'aPosition');
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  const aNormal = gl.getAttribLocation(program, 'aNormal');
  gl.bindBuffer(gl.ARRAY_BUFFER, normal);
  gl.enableVertexAttribArray(aNormal);
  gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { program, vao, count: mesh.positions.length / 3, positions: mesh.positions,
    projection: gl.getUniformLocation(program, 'uProjection'),
    model: gl.getUniformLocation(program, 'uModel'),
    light: gl.getUniformLocation(program, 'uLight'),
    color: gl.getUniformLocation(program, 'uColor'),
    shading: gl.getUniformLocation(program, 'uShading'),
    sliceZ: gl.getUniformLocation(program, 'uSliceZ'),
    sliceActive: gl.getUniformLocation(program, 'uSliceActive') };
}

// --- state ------------------------------------------------------------------------------

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
let renderer = null;
let geometry = null;
let manifest = null;
let levelEntry = null;
let camera = { yaw: FIT_CAMERA.yaw, pitch: FIT_CAMERA.pitch, distance: FIT_CAMERA.distance, pan: [0, 0] };
let scale = 1;
let center = [0, 0, 0];
let sliceWorldZ = null;
let busy = false;
let tapLabel = 'surface';
let pickSeq = 0;
let activeProbe = null;            // { probe, startedAt, resolve }
const pendingAcks = new Map();     // pick_id -> resolve
const glInfo = {};

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
}

function matrices() {
  const projection = perspective(new Float32Array(16), Math.PI / 4, canvas.width / canvas.height, 0.01, 100);
  const model = modelMatrix(new Float32Array(16), camera.yaw, camera.pitch, camera.distance, scale, center, camera.pan);
  return { projection, model, projectionModel: multiplyMat4(new Float32Array(16), projection, model) };
}

function cameraSnapshot() {
  return { yaw: camera.yaw, pitch: camera.pitch, distance: camera.distance, pan: camera.pan.slice(), scale, center };
}

function canvasCss() {
  const rect = canvas.getBoundingClientRect();
  return [rect.width, rect.height];
}

function draw(frameAt) {
  if (!renderer) return;
  if (activeProbe) {
    const cam = scriptedCamera(frameAt - activeProbe.startedAt);
    camera = { yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, pan: cam.pan };
  }
  resize();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.015, 0.033, 0.055, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(renderer.program);
  gl.bindVertexArray(renderer.vao);
  const { projection, model } = matrices();
  gl.uniformMatrix4fv(renderer.projection, false, projection);
  gl.uniformMatrix4fv(renderer.model, false, model);
  gl.uniform3f(renderer.light, -1.8, 2.6, 3.2);
  gl.uniform3f(renderer.color, 0.31, 0.77, 0.82);
  gl.uniform1i(renderer.shading, 1);
  gl.uniform1f(renderer.sliceZ, sliceWorldZ === null ? 0 : sliceWorldZ);
  gl.uniform1i(renderer.sliceActive, sliceWorldZ === null ? 0 : 1);
  gl.drawArrays(gl.TRIANGLES, 0, renderer.count);
  gl.bindVertexArray(null);
  if (activeProbe) {
    const result = activeProbe.probe.record(frameAt);
    if (result) {
      const done = activeProbe;
      activeProbe = null;
      done.resolve(result);
    }
  }
  requestAnimationFrame(draw);
}

// --- picking: the same path as a finger tap ------------------------------------------------

function pickAt(x, y, { phase, poseId = null, target = null, label = null }) {
  const started = performance.now();
  const [w, h] = canvasCss();
  const ndc = cssToNdc(x, y, w, h);
  const { projectionModel } = matrices();
  const inverse = invertMat4(new Float32Array(16), projectionModel);
  const ray = inverse && screenRayFromNdc(ndc[0], ndc[1], inverse);
  const hit = ray && rayMeshFirstHit(ray.origin, ray.direction, renderer.positions);
  const resolved = hit ? worldToSlice(hit.point, geometry) : null;
  pickSeq += 1;
  const pickId = `L${levelEntry.level}-${pickSeq}`;
  const navigationPosted = Boolean(resolved);
  const record = pickRecord({
    pickId, phase, level: levelEntry.level, poseId, camera: cameraSnapshot(),
    canvasCss: [w, h], canvasBacking: [canvas.width, canvas.height], dpr: window.devicePixelRatio || 1,
    screen: { x, y }, ndc, ray, hit, resolved, navigationPosted, target, label,
    elapsedMs: performance.now() - started,
  });
  post(record);
  if (navigationPosted) {
    // B7: the resolved slice goes to React Native, which shows it in the 2D panel and logs
    // what it displayed. Background / out-of-volume picks post NOTHING (B9).
    post({ kind: 's1_nav_request', schema_version: S1_SCHEMA_VERSION, pick_id: pickId, level: levelEntry.level,
      slice: resolved.sliceIndex, voxel: resolved.voxel, phase, t_ms: performance.now() });
  }
  return { pickId, navigationPosted, resolved };
}

function waitForAck(pickId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(pickId);
      post({ kind: 's1_nav_ack_timeout', pick_id: pickId, level: levelEntry.level, timeout_ms: NAV_ACK_TIMEOUT_MS });
      resolve(null);
    }, NAV_ACK_TIMEOUT_MS);
    pendingAcks.set(pickId, (ack) => { clearTimeout(timer); resolve(ack); });
  });
}

async function pickAndWait(x, y, meta, counters) {
  const { pickId, navigationPosted } = pickAt(x, y, meta);
  counters.picks += 1;
  if (navigationPosted) {
    counters.navigations += 1;
    const ack = await waitForAck(pickId);
    if (ack) counters.acks += 1; else counters.ack_timeouts += 1;
  } else {
    counters.no_navigation += 1;
  }
}

async function runTargetsAndGrid(phase, poses) {
  const counters = { picks: 0, navigations: 0, acks: 0, ack_timeouts: 0, no_navigation: 0,
    targets_projected: 0, targets_offscreen: 0, grid_points: 0 };
  for (const pose of poses) {
    if (pose) camera = { yaw: pose.yaw, pitch: pose.pitch, distance: clampZoom(pose.distance), pan: pose.pan.slice() };
    await nextFrame();
    await nextFrame();
    const [w, h] = canvasCss();
    const { projectionModel } = matrices();
    const poseId = pose ? pose.id : 'current';
    for (const target of manifest.targets) {
      const screen = projectToCss(projectionModel, target.world, w, h);
      if (!screen) { counters.targets_offscreen += 1; continue; }
      counters.targets_projected += 1;
      await pickAndWait(screen.x, screen.y, { phase: phase === 'auto' ? 'auto_target' : 'target_at_current_camera', poseId, target }, counters);
    }
    if (phase === 'auto') {
      for (const point of gridScreenPoints(w, h)) {
        counters.grid_points += 1;
        await pickAndWait(point.x, point.y, { phase: 'auto_grid', poseId }, counters);
      }
    }
  }
  return counters;
}

function runProbe(runIndex) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    activeProbe = {
      startedAt,
      probe: new FrameProbe({ startedAt, warmupMs: S1_PROBE_WARMUP_MS, measureMs: S1_PROBE_MEASURE_MS }),
      resolve,
    };
    setStatus(`L${levelEntry.level} · B10/B11 run ${runIndex}/${S1_PROBE_RUNS} · scripted orbit/pan/zoom · hands off`);
  }).then((result) => {
    post(framePayload({ level: levelEntry.level, runIndex, result, metadata: deviceMetadata() }));
    return result;
  });
}

function deviceMetadata() {
  return {
    user_agent: navigator.userAgent, page_url: window.location.href,
    viewport_css_px: canvasCss(), canvas_backing_px: [canvas.width, canvas.height],
    device_pixel_ratio: window.devicePixelRatio || 1,
    triangles: renderer ? renderer.count / 3 : null,
    level: levelEntry ? levelEntry.level : null, cluster_cell_voxels: levelEntry ? levelEntry.cluster_cell_voxels : null,
    obj_file: levelEntry ? levelEntry.obj_file : null, obj_sha256: levelEntry ? levelEntry.obj_sha256 : null,
    case_id: manifest ? manifest.case_id : null,
    geometry_contract_version: geometry ? geometry.geometry_contract_version : null,
    gl: glInfo, react_native_webview_bridge: Boolean(window.ReactNativeWebView),
    session_id: CONFIG.session_id || null, build_id: manifest ? manifest.build_id : null,
  };
}

async function runSuite() {
  if (busy || !renderer) return;
  busy = true;
  post({ kind: 's1_suite_start', level: levelEntry.level, runs: S1_PROBE_RUNS, poses: AUTO_POSES.map((p) => p.id),
    targets: manifest.targets.length, t_ms: performance.now() });
  const probes = [];
  for (let run = 1; run <= S1_PROBE_RUNS; run += 1) {
    const result = await runProbe(run);
    probes.push({ run, median_fps: result.median_fps ?? null, longest_stall_ms: result.longest_stall_ms ?? null });
    await sleep(1500);
  }
  setStatus(`L${levelEntry.level} · B6/B7/B9 automated picks · hands off`);
  const counters = await runTargetsAndGrid('auto', AUTO_POSES);
  camera = { ...FIT_CAMERA, pan: [0, 0] };
  post({ kind: 's1_suite_done', level: levelEntry.level, probes, picks: counters, t_ms: performance.now() });
  setStatus(`L${levelEntry.level} · suite done · now: manual rotate/zoom, then the RN buttons`);
  busy = false;
}

async function runTargetTestAtCurrentCamera() {
  if (busy || !renderer) return;
  busy = true;
  setStatus(`L${levelEntry.level} · target picks at the operator's camera · hands off`);
  const cam = cameraSnapshot();
  const counters = await runTargetsAndGrid('current', [null]);
  post({ kind: 's1_target_test_done', level: levelEntry.level, camera: cam, picks: counters, t_ms: performance.now() });
  setStatus(`L${levelEntry.level} · target test done`);
  busy = false;
}

// --- RN -> page --------------------------------------------------------------------------

window.__s1Receive = (raw) => {
  const command = parseCommand(raw);
  if (!command) return;
  if (command.cmd === 'nav_ack') {
    const resolve = pendingAcks.get(command.pick_id);
    if (resolve) { pendingAcks.delete(command.pick_id); resolve(command); }
  } else if (command.cmd === 'set_slice' && Number.isInteger(command.slice) && geometry) {
    // 2D -> 3D: the active slice is drawn as a band computed from source geometry.
    sliceWorldZ = geometry.origin_world_mm[2] + (command.slice + 0.5) * geometry.spacing_xyz_mm[2];
  } else if (command.cmd === 'run_suite') {
    runSuite();
  } else if (command.cmd === 'run_target_test') {
    runTargetTestAtCurrentCamera();
  } else if (command.cmd === 'set_tap_label' && (command.label === 'surface' || command.label === 'background')) {
    tapLabel = command.label;
    post({ kind: 's1_tap_label', level: levelEntry ? levelEntry.level : null, label: tapLabel, t_ms: performance.now() });
  } else if (command.cmd === 'fit_camera' && !busy) {
    camera = { ...FIT_CAMERA, pan: [0, 0] };
  }
};

// --- touch: orbit / two-finger pan / pinch, from app/viewer.js; a still tap picks ---------

const pointers = new Map();
let dragMode = null;
let pinchState = null;
let tapCandidate = false;
let interactionMoved = false;

function panBy(dx, dy) {
  const gain = (camera.distance * 1.25) / Math.max(1, canvas.clientHeight);
  camera.pan[0] += dx * gain;
  camera.pan[1] -= dy * gain;
}

canvas.addEventListener('pointerdown', (event) => {
  if (busy) return;
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
  if (pointers.size === 1) {
    dragMode = 'orbit';
    tapCandidate = true;
    interactionMoved = false;
  }
  if (pointers.size === 2) {
    tapCandidate = false;
    const [a, b] = [...pointers.values()];
    pinchState = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (busy || !pointers.has(event.pointerId)) return;
  const previous = pointers.get(event.pointerId);
  if (Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 5) interactionMoved = true;
  pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const next = Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinchState) {
      camera.distance = clampZoom(camera.distance * (pinchState.distance / Math.max(1, next)));
      panBy(midpoint.x - pinchState.x, midpoint.y - pinchState.y);
    }
    pinchState = { distance: next, ...midpoint };
  } else if (dragMode === 'orbit') {
    camera.yaw += (event.clientX - previous.x) * 0.009;
    camera.pitch = Math.max(-1.45, Math.min(1.45, camera.pitch + (event.clientY - previous.y) * 0.009));
  }
});
function releasePointer(event) {
  const shouldPick = !busy && event.type === 'pointerup' && pointers.size === 1 && dragMode === 'orbit'
    && tapCandidate && !interactionMoved && renderer;
  if (shouldPick) {
    const rect = canvas.getBoundingClientRect();
    const { pickId, navigationPosted } = pickAt(event.clientX - rect.left, event.clientY - rect.top, { phase: 'tap', label: tapLabel });
    setStatus(`tap ${pickId}: ${navigationPosted ? 'navigation posted' : 'no navigation'} (label ${tapLabel})`);
  }
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchState = null;
  if (pointers.size === 0) { dragMode = null; tapCandidate = false; }
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// --- boot ----------------------------------------------------------------------------------

async function boot() {
  if (!gl) {
    post({ kind: 's1_error', stage: 'webgl2', message: 'WebGL2 unavailable' });
    setStatus('WebGL2 unavailable');
    return;
  }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  glInfo.version = gl.getParameter(gl.VERSION);
  glInfo.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  glInfo.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const attrs = gl.getContextAttributes();
  glInfo.antialias = attrs ? attrs.antialias : null;

  const t0 = performance.now();
  manifest = JSON.parse(await loadText('s1_manifest.json'));
  // The level arrives twice from React Native: injected config and the URL fragment
  // (#level=N; a fragment never changes which asset file is read). They must agree.
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('level');
  const hashLevel = fromHash === null ? null : Number(fromHash);
  if (Number.isInteger(CONFIG.level) && hashLevel !== null && CONFIG.level !== hashLevel) {
    throw new Error(`level disagreement: config ${CONFIG.level}, URL #level=${hashLevel}`);
  }
  const level = Number.isInteger(CONFIG.level) ? CONFIG.level : (Number.isInteger(hashLevel) ? hashLevel : 0);
  const levelSource = Number.isInteger(CONFIG.level) ? 'injected_config' : (Number.isInteger(hashLevel) ? 'url_fragment' : 'default_0');
  levelEntry = manifest.levels.find((entry) => entry.level === level);
  if (!levelEntry) throw new Error(`level ${level} is not in s1_manifest.json`);
  geometry = manifest.geometry;
  const text = await loadText(`meshes/${levelEntry.obj_file}`);
  const t1 = performance.now();
  const mesh = parseObj(text);
  const t2 = performance.now();
  renderer = setup(gl, mesh);
  const values = mesh.positions;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      lo[axis] = Math.min(lo[axis], values[i + axis]);
      hi[axis] = Math.max(hi[axis], values[i + axis]);
    }
  }
  center = lo.map((v, axis) => (v + hi[axis]) / 2);
  let maxRadius = 0;
  for (let i = 0; i < values.length; i += 3) {
    maxRadius = Math.max(maxRadius, Math.hypot(values[i] - center[0], values[i + 1] - center[1], values[i + 2] - center[2]));
  }
  scale = maxRadius ? 1 / maxRadius : 1;
  post({
    kind: 's1_loaded', schema_version: S1_SCHEMA_VERSION, level: levelEntry.level,
    obj_file: levelEntry.obj_file, obj_chars: text.length, obj_sha256_expected: levelEntry.obj_sha256,
    triangles_parsed: mesh.triangles, triangles_expected: levelEntry.triangle_count,
    load_ms: t1 - t0, parse_ms: t2 - t1, center, scale, metadata: deviceMetadata(),
    slice_crop: manifest.slices
      ? { x0: manifest.slices.crop_x0, y0: manifest.slices.crop_y0, size: manifest.slices.size_px } : null,
    targets: manifest.targets.length, build_id: manifest.build_id, level_source: levelSource,
  });
  setStatus(`L${levelEntry.level} · ${mesh.triangles.toLocaleString()} triangles · loaded`);
  requestAnimationFrame(draw);
}

boot().catch((error) => {
  post({ kind: 's1_error', stage: 'boot', message: String(error && error.message ? error.message : error) });
  setStatus(`error: ${error && error.message ? error.message : error}`);
});
