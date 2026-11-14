/*
 * SPIKE_B S-1 — pure helpers for the device session (no DOM, no WebGL).
 *
 * THROWAWAY SPIKE CODE under spikes/spike_b_3d/. Written on Day 22 (2026-10-01) by a
 * Claude agent under the leader's recovery override; Spike B owner Vu Hung Anh adopts or
 * rejects it on Day 23. Node-tested by s1/test_s1_core.mjs.
 *
 * What lives here is everything the extractor has to be able to reproduce: the scripted
 * camera of the B10/B11 probe, the fixed camera poses of the automated B6/B9 pick test,
 * how a world point becomes a screen point, and the exact shape of every record the page
 * emits. The page (s1_viewer.js) only wires these to WebGL, touch and the RN bridge.
 */

export const S1_SCHEMA_VERSION = '1.0';
export const S1_PROBE_WARMUP_MS = 3_000;
export const S1_PROBE_MEASURE_MS = 30_000;
export const S1_PROBE_RUNS = 3;

// The default camera of the B1 viewer (viewer.js "fit camera").
export const FIT_CAMERA = Object.freeze({ yaw: -0.55, pitch: 0.35, distance: 2.8, pan: [0, 0] });
export const ZOOM_MIN = 1.05;
export const ZOOM_MAX = 8;

/*
 * B10/B11 scripted interaction, as a function of time since the probe started (warm-up
 * included). One period of each gesture family, continuous so no frame is idle:
 *   0-13 s   orbit: one full yaw turn, pitch swinging +/-0.5 rad
 *   13-23 s  pan: a closed loop of the camera target
 *   23-33 s  zoom: distance swings 2.8 * e^(+/-0.8) = 1.26 .. 6.2 (inside the clamp)
 * Every frame of every level renders the WHOLE mesh at a moving camera; that is the load
 * B10 bounds. The operator does not touch the screen during a scripted run.
 */
export function scriptedCamera(tMs, base = FIT_CAMERA) {
  const t = Math.max(0, tMs) / 1000;
  const cam = { yaw: base.yaw, pitch: base.pitch, distance: base.distance, pan: [base.pan[0], base.pan[1]] };
  const tau = 2 * Math.PI;
  if (t < 13) {
    cam.yaw = base.yaw + tau * (t / 13);
    cam.pitch = base.pitch + 0.5 * Math.sin(tau * t / 6.5);
  } else if (t < 23) {
    const u = (t - 13) / 10;
    cam.yaw = base.yaw + tau;
    cam.pan = [0.35 * Math.sin(tau * u), 0.25 * (Math.cos(tau * u) - 1)];
  } else {
    const u = (t - 23) / 10;
    cam.yaw = base.yaw + tau;
    cam.distance = clampZoom(base.distance * Math.exp(0.8 * Math.sin(tau * u)));
  }
  cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch));
  return cam;
}

export function clampZoom(distance) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, distance));
}

/*
 * B6/B9 automated poses: rotations (yaw/pitch, including from below and nearly top-down)
 * crossed with zoom in/out and a pan. Fixed before the session so that every level and
 * every run is asked the same question.
 */
export const AUTO_POSES = Object.freeze([
  { id: 'P0_fit', yaw: -0.55, pitch: 0.35, distance: 2.8, pan: [0, 0] },
  { id: 'P1_zoom_in', yaw: 0.9, pitch: -0.6, distance: 1.6, pan: [0.1, -0.05] },
  { id: 'P2_zoom_out_high', yaw: 2.4, pitch: 1.0, distance: 4.2, pan: [0, 0] },
  { id: 'P3_from_below', yaw: -2.2, pitch: -1.2, distance: 2.2, pan: [-0.15, 0.1] },
  { id: 'P4_close_side', yaw: 3.14, pitch: 0.05, distance: 1.3, pan: [0, 0] },
  { id: 'P5_near_top_down', yaw: 1.6, pitch: 1.4, distance: 3.0, pan: [0.2, 0.2] },
]);

// Background/surface scan of the whole canvas at each pose (B9 and extra B6 samples).
export const GRID_COLUMNS = 6;
export const GRID_ROWS = 10;

export function gridScreenPoints(widthCss, heightCss, cols = GRID_COLUMNS, rows = GRID_ROWS) {
  // Cell centres, so no point sits on the canvas edge; fractional CSS pixels like a touch.
  const points = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      points.push({ id: `g${r}_${c}`, x: ((c + 0.5) / cols) * widthCss, y: ((r + 0.5) / rows) * heightCss });
    }
  }
  return points;
}

// Column-major 4x4 times a point (x, y, z, 1); returns clip coordinates.
export function transformClip(matrix, p) {
  return [
    matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
    matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
    matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14],
    matrix[3] * p[0] + matrix[7] * p[1] + matrix[11] * p[2] + matrix[15],
  ];
}

/*
 * World point -> CSS pixel on the canvas, through the same projection x model matrix the
 * page draws with. Returns null when the point is behind the camera or off the canvas,
 * so the pick test only taps points that could have been tapped.
 */
export function projectToCss(projectionModel, world, widthCss, heightCss) {
  const c = transformClip(projectionModel, world);
  if (!(c[3] > 1e-9)) return null;
  const ndc = [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
  if (ndc.some((v) => !Number.isFinite(v)) || Math.abs(ndc[0]) > 1 || Math.abs(ndc[1]) > 1 || Math.abs(ndc[2]) > 1) {
    return null;
  }
  return { x: ((ndc[0] + 1) / 2) * widthCss, y: ((1 - ndc[1]) / 2) * heightCss, ndc };
}

export function cssToNdc(x, y, widthCss, heightCss) {
  return [(x / widthCss) * 2 - 1, 1 - (y / heightCss) * 2];
}

const round = (v, digits = 6) => (v === null || v === undefined ? v : Number(v.toFixed(digits)));
const roundVec = (v, digits = 6) => (v ? Array.from(v, (x) => round(x, digits)) : null);

/*
 * One pick, exactly as the extractor needs it. The device's own resolution is recorded
 * (slice, voxel, triangle), and so is everything needed to recompute the truth on the
 * workstation: the world-space ray. The extractor marches the REAL mask along this ray;
 * the device never sees the mask.
 */
export function pickRecord({
  pickId, phase, level, poseId, camera, canvasCss, canvasBacking, dpr, screen, ndc, ray,
  hit, resolved, navigationPosted, target, label, elapsedMs,
}) {
  return {
    kind: 's1_pick',
    schema_version: S1_SCHEMA_VERSION,
    pick_id: pickId,
    phase,                       // auto_target | auto_grid | target_at_current_camera | tap
    level,
    pose_id: poseId ?? null,
    camera: camera ? {
      yaw: round(camera.yaw), pitch: round(camera.pitch), distance: round(camera.distance),
      pan: roundVec(camera.pan), scale: round(camera.scale, 9), center: roundVec(camera.center),
    } : null,
    canvas_css: canvasCss, canvas_backing: canvasBacking, dpr,
    screen_css: screen ? [round(screen.x, 3), round(screen.y, 3)] : null,
    ndc: roundVec(ndc, 7),
    ray_origin_world: ray ? roundVec(ray.origin, 6) : null,
    ray_direction_world: ray ? roundVec(ray.direction, 7) : null,
    hit_world: hit ? roundVec(hit.point, 6) : null,
    hit_triangle: hit ? hit.triangle : null,
    resolved_voxel: resolved ? resolved.voxel : null,
    resolved_slice: resolved ? resolved.sliceIndex : null,
    outcome: !hit ? 'no_hit' : (!resolved ? 'outside_volume' : 'resolved'),
    navigation_posted: Boolean(navigationPosted),
    target: target ? { id: target.id, expected_slice: target.expected_slice, world: target.world, face: target.face } : null,
    operator_label: label ?? null,     // tap phase only: what the operator meant to tap
    elapsed_ms: round(elapsedMs, 3),
    t_ms: round(typeof performance !== 'undefined' ? performance.now() : Date.now(), 3),
  };
}

export function framePayload({ level, runIndex, result, metadata }) {
  return {
    kind: 's1_frame_probe',
    schema_version: S1_SCHEMA_VERSION,
    recorded_at_utc: new Date().toISOString(),
    level,
    run_index: runIndex,
    interaction: 'scripted: orbit 0-13 s, pan 13-23 s, zoom 23-33 s (s1_core.scriptedCamera)',
    probe: result,
    device: metadata,
  };
}

// RN -> page commands are JSON objects with a `cmd`; anything else is ignored.
export function parseCommand(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return obj && typeof obj.cmd === 'string' ? obj : null;
  } catch (error) {
    return null;
  }
}
