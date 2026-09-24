/*
 * SPIKE_A — 2D scientific viewer harness (React Native / Expo candidate)
 *
 * THROWAWAY SPIKE CODE. Not production. Boundary: spikes/spike_a_2d/**.
 * This harness exists to produce evidence for GATE-MOB-01, not to become the app.
 *
 * Canonical indexing — DR-008a, frozen:
 *   voxel (x,y,z): x = COLUMN, y = ROW, z = SLICE INDEX
 *   slice shape [Ny, Nx]; screen (u,v) -> (x=u, y=v, z=slice_index)
 *   origin top-left, +x right, +y down
 *
 * Covers so far: A1 (slice renders with n/total), the instrumentation A9
 * needs, stage S4 — pinch-zoom and pan (A2), stage S5 — brush, and stage S6 —
 * the bounded cache window below. A8/A10/A11 are later stages.
 *
 * S6 (2026-09-17): CACHE POLICY IS NOW A MEASURED VARIABLE, not an assumption.
 * Until today this harness prewarmed EVERY slice and never released one, which
 * is why RESULT.md could only extrapolate: 4.3 MB/slice measured over 16 slices,
 * multiplied by 88, giving 376 MB. Two things were needed to replace that
 * multiplication with a measurement — a fixture with real depth (generate.py
 * --nz) and a policy that actually bounds what stays resident. Both exist now.
 *
 *   policy 'all'     every slice mounted and held. The historical behaviour.
 *   policy 'window'  only z +/- WINDOW_RADIUS mounted; the rest are UNMOUNTED,
 *                    so the component drops its reference as z moves.
 *
 * WHAT THE WINDOW POLICY DOES AND DOES NOT PROVE. Unmounting releases the
 * component's hold on the bitmap. It does not by itself force the platform image
 * cache (Fresco on Android) to evict, and this spike deliberately does not reach
 * into native to make it. So the measurement answers a real question rather than
 * a rigged one: if graphics memory falls under 'window', a component-level bound
 * is sufficient; if it does not fall, the finding is that a real viewer must
 * bound the IMAGE CACHE too, not just its component tree. Either outcome is a
 * result. Neither is assumed here.
 *
 * A9 SCOPE UNDER A BOUNDED CACHE — read this before quoting a p95. NFR-PERF-001
 * bounds "switching among ALREADY AVAILABLE/CACHED slices". Under 'all' every
 * step is such a switch. Under 'window' a jump beyond the window is a cache MISS
 * and is NOT what the requirement governs. Every sample therefore records
 * in_window, and extract_timings.py reports the in-window p95 (the one comparable
 * to NFR-PERF-001) separately from the all-steps p95 (the one a user feels).
 * Conflating those two is exactly the scope error the Day-7 record made with
 * Spike E's E4, and it is not repeated here.
 *
 * S4 (2026-09-14): zoom and pan change ONLY a display transform
 * {zoom, panX, panY} (invariant 2 of `07` §8). The source mask is decoded once
 * into the lazily decoded mask and no transform code ever receives it. A2 is checked on the
 * device, not asserted: "kiểm A2" hashes every source-mask slice and compares
 * with the fixture's slice_sha256, before and after real gestures and after an
 * automated zoom/pan sequence. All transform math lives in viewerMath.js and is
 * tested offline by harness/test_viewer_math.mjs.
 *
 * S5 (2026-09-15): a brush on a WORKING mask, a per-slice copy of the source.
 * "Xem" keeps S4 exactly. In "Sửa" one finger paints; two fingers pinch/pan and
 * never paint - a second finger landing mid-stroke rolls the stroke back
 * exactly, and so does the system terminating the gesture. Every touch sample
 * goes through brushMath.js strokeSample, the function harness/test_brush.mjs
 * replays against fixtures/brush_ops.json. The decoded mask is only ever read, so
 * "kiểm A2" still hashes the untouched source.
 *
 * NOTHING here invents a number. Every sample is a real timestamp pair taken on
 * the device, emitted to logcat with a fixed tag so harness/extract_timings.py,
 * harness/extract_a2.py and harness/extract_brush.py can recover the raw record
 * rather than a summary.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Image, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

import volume from '../fixtures/volume_synthetic.json';
import maskFx from '../fixtures/mask_synthetic.json';
import brushFx from '../fixtures/brush_cases.json';
import opsFx from '../fixtures/brush_ops.json';
import {
  A2_SEQUENCE, applyStep, base64ToBytes, clampZoom, fitTransform, panBy,
  screenToSource, sha256Hex, zoomAbout,
} from './viewerMath';
import {
  END_RELEASE, END_SECOND_FINGER, END_TERMINATED, RADII, beginStroke, copySlices,
  createHistory, diffRuns, endStroke, redo, resetWorking, runA5, runOpsScript,
  strokeSample, undo,
} from './brushMath';

const [NX, NY, NZ] = volume.shape_xyz;
const SLICES = volume.slices_png_data_uri;
const MASKS = maskFx.slices_png_data_uri;

// --- S6: cache policy ------------------------------------------------------
// The radius a real viewer would plausibly hold around the slice in view. 3 gives
// a 7-slice window: the current slice, plus enough either side that a short
// forward or backward run stays resident.
const WINDOW_RADIUS = 3;
const POLICY_ALL = 'all';
const POLICY_WINDOW = 'window';

// Which slices a policy keeps mounted when the viewer is at z.
function residentSet(policy, z) {
  if (policy === POLICY_ALL) return null;          // null = every slice
  const lo = Math.max(0, z - WINDOW_RADIUS);
  const hi = Math.min(NZ - 1, z + WINDOW_RADIUS);
  const out = [];
  for (let i = lo; i <= hi; i += 1) out.push(i);
  return out;
}
const isResident = (policy, z, target) =>
  policy === POLICY_ALL || Math.abs(target - z) <= WINDOW_RADIUS;

// The source mask, decoded LAZILY. Read by the A2 checksum only - never by any
// zoom, pan or rendering code. Lazy since S6: at 576x576x88 decoding every mask
// slice at module scope costs ~29 MB of Uint8Array before the first frame, which
// would land in the memory measurement without being part of the cache policy
// under test. A2 is unchanged - it still hashes every slice, just on demand.
let _maskBytes = null;
function maskBytes() {
  if (_maskBytes === null) _maskBytes = maskFx.slices_b64.map(base64ToBytes);
  return _maskBytes;
}

// --- S7: WebView container for Spike B (GATE-MOB-01 measurement direction) ---
// Leader decision 2026-09-18: B10/B11 are measured INSIDE this React Native app
// rather than in Chrome, so one candidate carries evidence for both the brush
// (Spike A) and 3D (Spike B), as 09 section 7 requires.
//
// This container is TRANSPORT ONLY. It loads Vu Hung Anh's Spike B viewer over
// `adb reverse tcp:8765 tcp:8765` and forwards whatever the page posts to
// logcat under TAG_WEBVIEW. It computes no B number: B10/B11 come from the
// owner's own probe, and he interprets them.
//
// The environment probe below answers one question before anyone builds on this
// direction: does the system WebView on the A17 give a real, hardware WebGL2
// context, or a software fallback that would make every frame-time meaningless?
// Fixed by spikes/spike_b_3d/MEASUREMENT_B10_B11.md (PR #44) for the first B10/B11 session:
// synthetic mesh, level 0, and a second evidence path to the workstation through POST /probe.
const WEBVIEW_URL = 'http://127.0.0.1:8765/app/?mesh=synthetic&level=0&probe_sink=/probe';
const TAG_WEBVIEW = 'SPIKE_B_WEBVIEW';

// Android's logcat cuts every line at about 4 KB, so the first B10/B11 session (2026-09-18)
// received each 100 KB frame probe on this path truncated at 4,095 characters. Messages
// longer than one safe line are therefore split into numbered chunks that
// management/day09/b10_b11_session/session.py reassembles:
//   SPIKE_B_WEBVIEW_CHUNK <id> <index>/<count> <slice>
// Short messages keep the original single-line form, so earlier parsers still work.
const WEBVIEW_CHUNK_CHARS = 3000;
let webviewChunkSeq = 0;
function logWebViewMessage(data) {
  const text = String(data);
  if (text.length <= WEBVIEW_CHUNK_CHARS) {
    console.log(`${TAG_WEBVIEW} ${text}`);
    return;
  }
  webviewChunkSeq += 1;
  const id = `${Date.now()}-${webviewChunkSeq}`;
  const count = Math.ceil(text.length / WEBVIEW_CHUNK_CHARS);
  for (let i = 0; i < count; i += 1) {
    const slice = text.slice(i * WEBVIEW_CHUNK_CHARS, (i + 1) * WEBVIEW_CHUNK_CHARS);
    console.log(`${TAG_WEBVIEW}_CHUNK ${id} ${i + 1}/${count} ${slice}`);
  }
}

// Installed before the page's own scripts run, so load-time errors are caught.
const WEBVIEW_BEFORE_LOAD_JS = `
(function () {
  function post(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    post({ kind: 'webview_error', message: String(ev.message), source: ev.filename || null, line: ev.lineno || null });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    post({ kind: 'webview_rejection', reason: String(ev.reason) });
  });
  ['log', 'warn', 'error'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      post({ kind: 'webview_console', level: level, args: [].slice.call(arguments).map(String) });
      if (orig) { orig.apply(console, arguments); }
    };
  });
})();
true;
`;

// Runs after load: reports what kind of GL context this WebView really provides.
const WEBVIEW_ENV_JS = `
(function () {
  var out = {
    kind: 'webview_env', ts: Date.now(), url: location.href, ua: navigator.userAgent,
    viewport: [window.innerWidth, window.innerHeight], dpr: window.devicePixelRatio,
    canvases_on_page: document.querySelectorAll('canvas').length
  };
  try {
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl2');
    out.webgl2 = !!gl;
    if (gl) {
      out.gl_version = gl.getParameter(gl.VERSION);
      out.glsl_version = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var attrs = gl.getContextAttributes();
      out.antialias = attrs ? attrs.antialias : null;
    }
  } catch (e) { out.error = String(e); }
  window.ReactNativeWebView.postMessage(JSON.stringify(out));
})();
true;
`;

// Log tags the harness scripts grep for. Keep them stable.
const TAG = 'SPIKE_A_TIMING';
const TAG_A2 = 'SPIKE_A_A2';
const TAG_GESTURE = 'SPIKE_A_GESTURE';
const TAG_TAP = 'SPIKE_A_TAP';
const TAG_MAP = 'SPIKE_A_MAP';
const TAG_BRUSH = 'SPIKE_A_BRUSH';
const TAG_A5 = 'SPIKE_A_A5';
const TAG_OPS = 'SPIKE_A_OPS';
const now = () => (global.performance ? performance.now() : Date.now());
const round = (v) => +v.toFixed(3);

function hashAllMasks() {
  const hashes = maskBytes().map((b) => sha256Hex(b));
  const match = hashes.filter((h, z) => h === maskFx.slice_sha256[z]).length;
  return { hashes, match };
}

// The app's own screen->source mapping against the fixture's 60 brush cases.
// A precursor to A5, not A5: the brush itself is checked by "kiểm A5" (S5).
function mappingSelfCheck() {
  let pass = 0;
  for (const c of brushFx.cases) {
    const got = screenToSource(c.touch_u, c.touch_v, { zoom: c.zoom, panX: c.pan_x, panY: c.pan_y }, NX, NY);
    if (JSON.stringify(got) === JSON.stringify(c.expected_source_pixel)) pass += 1;
  }
  return { pass, of: brushFx.cases.length };
}

// S5 expectations come from the fixtures, never from this app's own code.
// A5: r = 0 is {expected_source_pixel} from brush_cases.json; r = 2 is the set
// generate.py computed into brush_ops.json.
const A5_EXPECTED = {
  0: brushFx.cases.map((c) => (c.expected_source_pixel
    ? [c.expected_source_pixel[1] * NX + c.expected_source_pixel[0]] : [])),
  2: opsFx.a5.cases.map((c) => c.painted_r2),
};

// "A3–A7 tự động": the hash each logged record must carry. Used for the
// on-screen count only; extract_brush.py recomputes the verdict from the log.
const OPS_EXPECTED = (() => {
  const m = {};
  opsFx.ops.forEach((o) => { m[o.id] = o.expected.slice_sha256_after; });
  opsFx.undo_walk.forEach((w) => { m[`undo:${w.undo_of}`] = w.slice_sha256; });
  opsFx.redo_walk.forEach((w) => { m[`redo:${w.redo_of}`] = w.slice_sha256; });
  m['undo-all'] = opsFx.after_undo_all_slice_sha256.join(',');
  m['redo-all'] = opsFx.after_redo_all_slice_sha256.join(',');
  m.reset = opsFx.after_reset_slice_sha256.join(',');
  return m;
})();
const opsRecordMatches = (r) => (r.hashes ? r.hashes.join(',') : r.hash) === OPS_EXPECTED[r.op];

/*
 * A9 asks for a "30-step navigation test" over "already available/cached
 * slices". The sequence is fixed rather than random so two runs are comparable:
 * forward run, backward run, then jumps, which is how a reader actually moves
 * through a stack.
 *
 * S6: the list below is written against a 16-slice stack and is generalised to any
 * Nz by its MOVES, not by its positions. That distinction is the whole point.
 *
 * Scaling positions would be wrong. At Nz = 88 a scaled position list turns every
 * step of the "forward run" into a ~6-slice jump, so a +/-3 window would miss on
 * all 30 steps and the comparison would measure nothing but misses. What the test
 * describes is a reader scrolling ONE slice at a time with occasional jumps across
 * the stack, and that is a statement about moves.
 *
 * So: a move of +/-1 stays +/-1 at any depth, and a jump is scaled by (Nz-1)/15.
 * At Nz = 16 the scale factor is 1 and the result is byte-identical to the list
 * below, so every run recorded before 2026-09-17 stays directly comparable. At
 * Nz = 88 the runs stay adjacent (cache hits under the window policy) and the 8
 * jumps become genuine cross-stack moves (cache misses) - which is exactly the
 * mix the policy is being asked about.
 */
const NAV_SEQUENCE_16 = [
  1, 2, 3, 4, 5, 6, 7, 8,           // forward run
  7, 6, 5, 4, 3, 2, 1, 0,           // backward run
  8, 0, 15, 4, 11, 2, 13, 6,        // jumps
  7, 8, 9, 10, 11, 12,              // forward again
];

function buildNavSequence(nz) {
  const scale = (nz - 1) / 15;
  const out = [];
  let prev16 = 0;                   // the 16-slice list starts from slice 0
  let pos = 0;
  for (const target16 of NAV_SEQUENCE_16) {
    const delta16 = target16 - prev16;
    const delta = Math.abs(delta16) === 1 ? delta16 : Math.round(delta16 * scale);
    pos = Math.max(0, Math.min(nz - 1, pos + delta));
    out.push(pos);
    prev16 = target16;
  }
  return out;
}
const NAV_SEQUENCE = buildNavSequence(NZ);

/*
 * What "slice updated" means here, stated explicitly because the number is
 * meaningless without it:
 *   t0      the moment state changes (the user's press is handled)
 *   tLoad   the Image reports the new source decoded
 *   tFrame  the first frame rendered after that
 * NFR-PERF-001 says "update the VISIBLE slice", so tFrame is the honest
 * measure; tLoad is kept so the decode/paint split is visible.
 */
export default function App() {
  const [z, setZ] = useState(0);
  const [warmed, setWarmed] = useState(0);
  const [samples, setSamples] = useState([]);
  const [running, setRunning] = useState(false);
  const [showMask, setShowMask] = useState(true);
  const [policy, setPolicy] = useState(POLICY_ALL);
  const [showWebView, setShowWebView] = useState(false);

  const t0 = useRef(null);
  const pending = useRef(null);
  const zRef = useRef(0);                    // z at the moment a step was issued
  const wasResident = useRef(true);          // was that step a cache hit?

  // Under 'all' the gate is the whole volume; under 'window' it is the opening
  // window, because the whole volume is never meant to be resident.
  const warmTarget = policy === POLICY_ALL
    ? NZ
    : Math.min(NZ, WINDOW_RADIUS + 1);
  const allWarmed = warmed >= warmTarget;

  // --- prewarm -------------------------------------------------------------
  // A9 measures switching among CACHED slices, so the slices a policy claims to
  // hold are decoded once before any measurement is allowed. Until that finishes
  // the measure button stays disabled — measuring a cold cache would answer a
  // different question. Note the gate is per POLICY: 'window' never waits for
  // slices it has no intention of keeping.
  const onWarm = useCallback(() => setWarmed((n) => n + 1), []);

  // Switching policy invalidates every sample taken under the previous one, and
  // it must re-warm. Mixing two policies in one record would be unreadable.
  const changePolicy = useCallback((next) => {
    if (next === policy) return;
    setPolicy(next);
    setWarmed(0);
    setSamples([]);
    setZ(0);
    zRef.current = 0;
    console.log(`${TAG}_POLICY ${JSON.stringify({ cache_policy: next, window_radius: WINDOW_RADIUS, nz: NZ })}`);
  }, [policy]);

  const goTo = useCallback((target) => {
    if (target < 0 || target >= NZ) return;
    // Recorded BEFORE z moves: whether the policy already held this slice is a
    // property of the state the step started from.
    wasResident.current = isResident(policy, zRef.current, target);
    t0.current = global.performance ? performance.now() : Date.now();
    pending.current = target;
    zRef.current = target;
    setZ(target);
  }, [policy]);

  const onSliceLoad = useCallback(() => {
    if (t0.current == null || pending.current == null) return;
    const tLoad = global.performance ? performance.now() : Date.now();
    const from = t0.current;
    const target = pending.current;
    t0.current = null;
    pending.current = null;
    requestAnimationFrame(() => {
      const tFrame = global.performance ? performance.now() : Date.now();
      const s = {
        slice: target,
        ms_to_load: +(tLoad - from).toFixed(2),
        ms_to_frame: +(tFrame - from).toFixed(2),
        cache_policy: policy,
        // in_window = the slice was already held when the step was issued, i.e.
        // this really is "switching among already available/cached slices".
        // Always true under 'all'. Under 'window' a false here marks a MISS, and
        // a miss is outside what NFR-PERF-001 governs.
        in_window: wasResident.current,
      };
      setSamples((prev) => [...prev, s]);
      // Raw sample to logcat. extract_timings.py reads these; the on-screen
      // table is only a fallback for when logcat is not available.
      console.log(`${TAG} ${JSON.stringify(s)}`);
    });
  }, [policy]);

  // --- scripted 30-step run ------------------------------------------------
  useEffect(() => {
    if (!running) return;
    let i = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled || i >= NAV_SEQUENCE.length) {
        setRunning(false);
        console.log(`${TAG}_RUN_END steps=${NAV_SEQUENCE.length}`);
        return;
      }
      goTo(NAV_SEQUENCE[i]);
      i += 1;
      // Settle gap so each step is a distinct interaction rather than a burst.
      setTimeout(step, 350);
    };
    // __DEV__ is false in a release bundle. Emitting it removes the last
    // hand-entered field from the evidence record: build_type used to be typed in
    // by the operator, and a typed field is a field that can be wrong.
    console.log(`${TAG}_RUN_START ${JSON.stringify({
      steps: NAV_SEQUENCE.length,
      nz: NZ,
      nx: NX,
      ny: NY,
      cache_policy: policy,
      window_radius: policy === POLICY_ALL ? null : WINDOW_RADIUS,
      dev_bundle: typeof __DEV__ !== 'undefined' ? __DEV__ : null,
      sequence: NAV_SEQUENCE,
    })}`);
    step();
    return () => { cancelled = true; };
  }, [running, goTo, policy]);

  // --- S4: display transform, pinch-zoom and pan --------------------------------
  const [view, setView] = useState(null);          // {w, h} of the viewport, from onLayout
  const [xf, setXf] = useState(null);              // {zoom, panX, panY}
  const xfRef = useRef(null);
  const fitRef = useRef(null);
  const viewRef = useRef(null);
  const origin = useRef({ x: 0, y: 0 });           // viewport position on the page
  const [a2, setA2] = useState(null);              // last A2 check shown on screen
  const [tap, setTap] = useState(null);
  const [mapCheck] = useState(mappingSelfCheck);
  const [autoRunning, setAutoRunning] = useState(false);
  // sinceCheck counts REAL finger gestures; autoSinceCheck counts scripted steps.
  const gestures = useRef({ total: 0, sinceCheck: 0, autoSinceCheck: 0, checks: 0 });

  useEffect(() => {
    console.log(`${TAG_MAP} ${JSON.stringify(mapCheck)}`);
  }, [mapCheck]);

  const setTransform = useCallback((t) => { xfRef.current = t; setXf(t); }, []);

  const onViewportLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setView({ w: width, h: height });
    const fit = fitTransform(width, height, NX, NY);
    fitRef.current = fit;
    if (!xfRef.current) setTransform(fit);
    viewRef.current?.measure((x, y, w, h, px, py) => { origin.current = { x: px, y: py }; });
  }, [setTransform]);

  const runA2Check = useCallback((label) => {
    const t0c = now();
    const { hashes, match } = hashAllMasks();
    const g = gestures.current;
    const rec = {
      check: g.checks,
      label,
      match,
      of: NZ,
      gestures_since_last_check: g.sinceCheck,
      auto_steps_since_last_check: g.autoSinceCheck,
      gestures_total: g.total,
      transform: xfRef.current && { zoom: round(xfRef.current.zoom), panX: round(xfRef.current.panX), panY: round(xfRef.current.panY) },
      fit_zoom: fitRef.current && round(fitRef.current.zoom),
      slice: z,
      ms_to_hash: +(now() - t0c).toFixed(2),
      hashes,
    };
    g.checks += 1;
    g.sinceCheck = 0;
    g.autoSinceCheck = 0;
    setA2(rec);
    console.log(`${TAG_A2} ${JSON.stringify(rec)}`);
  }, [z]);

  // --- S5: brush on the working mask ------------------------------------------
  // WORKING mask: one Uint8Array per slice, copied once from the source. Strokes,
  // undo, redo and reset write only here.
  const working = useRef(null);
  if (working.current === null) working.current = copySlices(maskBytes());
  const history = useRef(createHistory());
  const brush = useRef({ edit: false, tool: 'add', radius: 2 });   // what the gesture handlers read
  const [edit, setEdit] = useState(false);          // false = "Xem" (navigate), true = "Sửa" (correct)
  const [tool, setTool] = useState('add');
  const [radius, setRadius] = useState(2);
  const [hist, setHist] = useState({ strokes: 0, undo: 0, redo: 0 });
  const [a5, setA5] = useState(null);
  const [opsRunning, setOpsRunning] = useState(false);
  const [opsResult, setOpsResult] = useState(null);
  const stroke = useRef(null);                      // the stroke in progress, if any
  const committed = useRef(0);
  const overlayBump = useRef(null);                 // set by BrushOverlay: re-render only that layer

  const chooseEdit = useCallback((v) => { brush.current.edit = v; setEdit(v); }, []);
  const chooseTool = useCallback((v) => { brush.current.tool = v; setTool(v); }, []);
  const chooseRadius = useCallback((v) => { brush.current.radius = v; setRadius(v); }, []);
  const refreshHist = useCallback(() => {
    const h = history.current;
    setHist({ strokes: committed.current, undo: h.undo.length, redo: h.redo.length });
  }, []);

  const logStroke = useCallback((st) => {
    const v = st.feedback.slice().sort((a, b) => a - b);
    const p50 = v.length ? v[Math.min(v.length - 1, Math.ceil(0.5 * v.length) - 1)] : null;
    const rec = {
      slice: st.slice, mode: st.tool, radius: st.radius,
      samples_received: st.received, samples_applied: st.applied, samples_outside: st.outside,
      changed: st.result.changed, committed: st.result.committed, end: st.result.end,
      feedback_ms_p50: p50 == null ? null : +p50.toFixed(2),
      feedback_ms_max: v.length ? +v[v.length - 1].toFixed(2) : null,
    };
    console.log(`${TAG_BRUSH} ${JSON.stringify(rec)}`);
  }, []);

  /*
   * One touch sample of a stroke. feedback_ms is a JS-side NEXT-FRAME PROXY:
   * performance.now() on entering the PanResponder handler (tIn) -> the first
   * requestAnimationFrame callback after the overlay's state update. Native input
   * delivery before the handler runs is NOT included, and nativeEvent.timestamp is
   * on a different clock, so it is never mixed into this number. One value per
   * sample that lands in the image; a sample outside it has nothing to show.
   */
  const brushSample = useCallback((st, pt, tIn) => {
    const c = strokeSample(st, working.current[st.slice], pt.x, pt.y, xfRef.current, NX, NY);
    if (!c) return;
    if (overlayBump.current) overlayBump.current();
    st.pending += 1;
    requestAnimationFrame(() => {
      st.feedback.push(now() - tIn);
      st.pending -= 1;
      if (st.result && st.pending === 0) logStroke(st);
    });
  }, [logStroke]);

  // Release commits one undo step. A second finger or a system termination
  // restores the working mask exactly and records nothing in history. The log
  // line waits for the stroke's last feedback frame so its timings are complete.
  const finishStroke = useCallback((end) => {
    const st = stroke.current;
    if (!st) return;
    stroke.current = null;
    st.result = endStroke(history.current, st, working.current[st.slice], end);
    if (st.result.committed) committed.current += 1;
    else if (overlayBump.current) overlayBump.current();
    refreshHist();
    if (st.pending === 0) logStroke(st);
  }, [logStroke, refreshHist]);

  // One gesture = touch down to last finger up. While it lasts, frame gaps are
  // sampled with requestAnimationFrame so a stall (> 500 ms, TASK.md) is recorded,
  // not remembered.
  const gest = useRef(null);
  const frameLoop = useCallback(() => {
    const cur = gest.current;
    if (!cur) return;
    const tNow = now();
    if (cur.lastFrame != null) cur.maxGap = Math.max(cur.maxGap, tNow - cur.lastFrame);
    cur.lastFrame = tNow;
    cur.frames += 1;
    cur.raf = requestAnimationFrame(frameLoop);
  }, []);

  // Release and terminate both end a gesture here. S4 only cleared gest.current:
  // a terminated gesture was never cleared at all, and a frame callback already
  // queued could find the NEXT gesture's record and run a second loop on it,
  // corrupting its frame-gap accounting (PR #27 review). Now the queued callback
  // is cancelled too.
  const endGesture = useCallback(() => {
    const cur = gest.current;
    gest.current = null;
    if (cur && cur.raf != null) cancelAnimationFrame(cur.raf);
    return cur;
  }, []);

  const pagePoints = (evt) => evt.nativeEvent.touches.map((t) => ({
    x: t.pageX - origin.current.x, y: t.pageY - origin.current.y,
  }));

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const tIn = now();
      // Never inherit a gesture (or a stroke) whose end was not delivered.
      if (stroke.current) finishStroke(END_TERMINATED);
      endGesture();
      const pts = pagePoints(evt);
      gest.current = {
        t0: now(), start: pts[0], prev: pts, kind: 'pan', moves: 0, travel: 0,
        maxFingers: pts.length, frames: 0, maxGap: 0, lastFrame: null,
        zoomStart: xfRef.current?.zoom, raf: null, stroke: false,
      };
      gest.current.raf = requestAnimationFrame(frameLoop);
      // S5: in "Sửa" a single finger paints from the moment it lands.
      if (brush.current.edit && pts.length === 1 && xfRef.current) {
        const st = Object.assign(beginStroke(z, brush.current.tool, brush.current.radius),
          { feedback: [], pending: 0, result: null });
        stroke.current = st;
        gest.current.stroke = true;
        brushSample(st, pts[0], tIn);
      }
    },
    onPanResponderStart: (evt) => {
      // A finger landed while the gesture is live (the first finger also arrives
      // here, right after grant). Two fingers are navigation: undo the stroke.
      if (stroke.current && evt.nativeEvent.touches.length >= 2) finishStroke(END_SECOND_FINGER);
    },
    onPanResponderMove: (evt) => {
      const tIn = now();
      const cur = gest.current;
      const t = xfRef.current;
      if (!cur || !t) return;
      const pts = pagePoints(evt);
      cur.moves += 1;
      cur.maxFingers = Math.max(cur.maxFingers, pts.length);
      if (stroke.current) {
        if (pts.length === 1) {
          brushSample(stroke.current, pts[0], tIn);
          cur.prev = pts;
          return;
        }
        finishStroke(END_SECOND_FINGER);            // the second finger showed up on a move first
      }
      if (pts.length !== cur.prev.length) { cur.prev = pts; return; }   // finger added/lifted
      if (pts.length >= 2) {
        cur.kind = 'pinch';
        const d = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const mid = (p) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
        const d0 = d(cur.prev);
        const m0 = mid(cur.prev);
        const m1 = mid(pts);
        let next = t;
        if (d0 > 0) next = zoomAbout(next, clampZoom(t.zoom * (d(pts) / d0), fitRef.current.zoom), m0.x, m0.y);
        next = panBy(next, m1.x - m0.x, m1.y - m0.y);
        cur.travel += Math.hypot(m1.x - m0.x, m1.y - m0.y);
        setTransform(next);
      } else {
        const dx = pts[0].x - cur.prev[0].x;
        const dy = pts[0].y - cur.prev[0].y;
        cur.travel += Math.hypot(dx, dy);
        setTransform(panBy(t, dx, dy));
      }
      cur.prev = pts;
    },
    onPanResponderRelease: () => {
      if (stroke.current) finishStroke(END_RELEASE);
      const cur = endGesture();
      if (!cur) return;
      // A one-finger gesture in "Sửa" was a stroke, logged as SPIKE_A_BRUSH - not
      // navigation. A stroke undone by a second finger stays a gesture below.
      if (cur.stroke && cur.maxFingers === 1) return;
      const ms = now() - cur.t0;
      if (cur.maxFingers === 1 && cur.travel < 6 && ms < 400) {
        // A tap, not a gesture: show which source pixel is under the finger.
        const t = xfRef.current;
        const src = screenToSource(cur.start.x, cur.start.y, t, NX, NY);
        const rec = { u: round(cur.start.x), v: round(cur.start.y), src, slice: z,
          transform: { zoom: round(t.zoom), panX: round(t.panX), panY: round(t.panY) } };
        setTap(rec);
        console.log(`${TAG_TAP} ${JSON.stringify(rec)}`);
        return;
      }
      gestures.current.total += 1;
      gestures.current.sinceCheck += 1;
      const rec = {
        n: gestures.current.total, kind: cur.kind, fingers_max: cur.maxFingers,
        ms: +ms.toFixed(1), moves: cur.moves, frames: cur.frames,
        max_frame_gap_ms: +cur.maxGap.toFixed(1), stall_over_500ms: cur.maxGap > 500,
        zoom_from: cur.zoomStart && round(cur.zoomStart), zoom_to: round(xfRef.current.zoom),
      };
      console.log(`${TAG_GESTURE} ${JSON.stringify(rec)}`);
    },
    onPanResponderTerminate: () => {
      // Android can take a gesture away (PR #27 review). End it exactly as release
      // does - state cleared, frame loop cancelled - and roll a stroke back. No
      // SPIKE_A_GESTURE or SPIKE_A_TAP line: an interrupted gesture is not a
      // completed one, and leaving it out can only make A2's count conservative.
      if (stroke.current) finishStroke(END_TERMINATED);
      endGesture();
    },
  }), [frameLoop, endGesture, brushSample, finishStroke, setTransform, z]);

  // Automated half of A2: check, run the fixed sequence (changing slice as it
  // goes, so the transform is exercised across slices), check again.
  useEffect(() => {
    if (!autoRunning || !view || !fitRef.current) return;
    let i = 0;
    let cancelled = false;
    runA2Check('auto-before');
    console.log(`${TAG_A2}_AUTO_START steps=${A2_SEQUENCE.length}`);
    const step = () => {
      if (cancelled) return;
      if (i >= A2_SEQUENCE.length) {
        runA2Check('auto-after');
        console.log(`${TAG_A2}_AUTO_END steps=${A2_SEQUENCE.length}`);
        setAutoRunning(false);
        return;
      }
      setTransform(applyStep(xfRef.current, A2_SEQUENCE[i], view.w, view.h, fitRef.current));
      setZ((prev) => (prev + 1) % NZ);
      gestures.current.autoSinceCheck += 1;
      i += 1;
      setTimeout(step, 300);
    };
    step();
    return () => { cancelled = true; };
    // runA2Check changes with z; the sequence must not restart when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunning, view, setTransform]);

  // --- S5: undo, redo, reset and the two on-device checks ----------------------
  // None of these act while a finger is painting: the stroke in progress holds the
  // old values of the pixels it changed, and history moving underneath would break
  // its exact rollback.
  const onUndo = useCallback(() => {
    if (stroke.current) return;
    const e = undo(history.current, working.current);
    if (!e) return;
    if (overlayBump.current) overlayBump.current();
    refreshHist();
    const h = history.current;
    console.log(`${TAG_BRUSH}_UNDO ${JSON.stringify({ slice: e.slice, changed: e.indices.length, undo_depth: h.undo.length, redo_depth: h.redo.length })}`);
  }, [refreshHist]);

  const onRedo = useCallback(() => {
    if (stroke.current) return;
    const e = redo(history.current, working.current);
    if (!e) return;
    if (overlayBump.current) overlayBump.current();
    refreshHist();
    const h = history.current;
    console.log(`${TAG_BRUSH}_REDO ${JSON.stringify({ slice: e.slice, changed: e.indices.length, undo_depth: h.undo.length, redo_depth: h.redo.length })}`);
  }, [refreshHist]);

  // Reset loses every unsaved edit, so it asks first (`10` §9). It copies the exact
  // source bytes back into every working slice and clears history.
  const onReset = useCallback(() => {
    Alert.alert(
      'Đặt lại mask làm việc?',
      `Mọi chỉnh sửa chưa lưu trên cả ${NZ} slice sẽ mất: mask làm việc được chép lại đúng từ mask nguồn, lịch sử hoàn tác / làm lại bị xoá.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đặt lại',
          style: 'destructive',
          onPress: () => {
            if (stroke.current) return;
            const h = history.current;
            const rec = { undo_cleared: h.undo.length, redo_cleared: h.redo.length };
            resetWorking(h, working.current, maskBytes());
            if (overlayBump.current) overlayBump.current();
            refreshHist();
            console.log(`${TAG_BRUSH}_RESET ${JSON.stringify(rec)}`);
          },
        },
      ],
    );
  }, [refreshHist]);

  // "kiểm A5": the 60 brush cases through strokeSample on a scratch slice, at r = 0
  // and r = 2. One compact record per case lets extract_brush.py redo the
  // comparison itself; errors are capped so the line stays under logcat's ~4 KB
  // entry limit.
  const runA5Check = useCallback(() => {
    const shown = [];
    for (const r of [0, 2]) {
      const res = runA5(brushFx.cases, r, A5_EXPECTED[r], NX, NY);
      const rec = { radius: r, pass: res.pass, of: res.of, errors: res.errors.slice(0, 8),
        errors_total: res.errors.length, cases: res.cases };
      console.log(`${TAG_A5} ${JSON.stringify(rec)}`);
      shown.push({ radius: r, pass: res.pass, of: res.of });
    }
    setA5(shown);
  }, []);

  // "A3–A7 tự động": brush_ops.json on a scratch copy of the source through
  // runOpsScript (strokeSample, undo, redo, reset), then one log line per record.
  // The user's own working mask and history are never passed in.
  useEffect(() => {
    if (!opsRunning) return;
    const recs = runOpsScript(opsFx, maskBytes(), NX, NY);
    let i = 0;
    let cancelled = false;
    console.log(`${TAG_OPS}_START ops=${opsFx.op_count} records=${recs.length}`);
    const step = () => {
      if (cancelled) return;
      if (i >= recs.length) {
        console.log(`${TAG_OPS}_END records=${recs.length}`);
        setOpsResult({ match: recs.filter(opsRecordMatches).length, of: recs.length });
        setOpsRunning(false);
        return;
      }
      console.log(`${TAG_OPS} ${JSON.stringify(recs[i])}`);
      i += 1;
      setTimeout(step, 25);                         // spaced out, so a burst cannot overrun the log buffer
    };
    step();
    return () => { cancelled = true; };
  }, [opsRunning]);

  const imgStyle = xf
    ? { position: 'absolute', left: xf.panX, top: xf.panY, width: NX * xf.zoom, height: NY * xf.zoom }
    : s.img;

  // --- stats ---------------------------------------------------------------
  // p95 by nearest-rank on the sorted sample, which is the definition the
  // harness script uses too. No smoothing, no outlier removal.
  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const pick = (key) => {
      const v = samples.map((s) => s[key]).sort((a, b) => a - b);
      const rank = (p) => v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
      return { n: v.length, min: v[0], p50: rank(50), p95: rank(95), max: v[v.length - 1] };
    };
    return { load: pick('ms_to_load'), frame: pick('ms_to_frame') };
  }, [samples]);

  const reset = () => { setSamples([]); console.log(`${TAG}_RESET`); };
  const checksBusy = running || autoRunning || opsRunning;

  // S7: the WebView REPLACES the 2D harness while open, so the 2D screen - its
  // cached bitmaps, its timers - is unmounted and cannot run underneath a 3D
  // frame-time measurement.
  if (showWebView) {
    return (
      <View style={s.wvRoot}>
        <StatusBar style="light" />
        <View style={s.wvBar}>
          <TouchableOpacity
            style={s.wvBack}
            onPress={() => { console.log(`${TAG_WEBVIEW}_CLOSE`); setShowWebView(false); }}
          >
            <Text style={s.wvBackT}>◀ 2D</Text>
          </TouchableOpacity>
          <Text style={s.wvTitle} numberOfLines={1}>Spike B · WebView · {WEBVIEW_URL}</Text>
        </View>
        <WebView
          style={s.wvView}
          source={{ uri: WEBVIEW_URL }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={WEBVIEW_BEFORE_LOAD_JS}
          injectedJavaScript={WEBVIEW_ENV_JS}
          onLoadEnd={(e) => console.log(`${TAG_WEBVIEW}_LOADED ${JSON.stringify({ url: e.nativeEvent.url, loading: e.nativeEvent.loading })}`)}
          onError={(e) => console.log(`${TAG_WEBVIEW}_ERROR ${JSON.stringify(e.nativeEvent)}`)}
          onHttpError={(e) => console.log(`${TAG_WEBVIEW}_HTTP_ERROR ${JSON.stringify({ url: e.nativeEvent.url, status: e.nativeEvent.statusCode })}`)}
          onMessage={(e) => logWebViewMessage(e.nativeEvent.data)}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Text style={s.h1}>SPIKE_A · 2D viewer harness</Text>
      <Text style={s.sub}>React Native / Expo candidate · fixture {NX}×{NY}×{NZ}</Text>

      {/* S7 — opens the Spike B viewer inside this app (GATE-MOB-01 direction). */}
      <View style={s.row}>
        <Btn
          label="3D · WebView (B10/B11)"
          onPress={() => { console.log(`${TAG_WEBVIEW}_OPEN ${JSON.stringify({ url: WEBVIEW_URL })}`); setShowWebView(true); }}
          disabled={running}
        />
      </View>

      {/* S6 — the cache itself. Under 'all' this mounts every slice once and
          never unmounts one. Under 'window' it mounts z +/- WINDOW_RADIUS and
          STAYS mounted for the whole session, so that as z moves the slices
          leaving the window are unmounted and the component drops them. */}
      {!allWarmed && (
        <View style={s.warm}>
          <Text style={s.warmT}>
            Đang nạp cache slice… {warmed}/{warmTarget}
            {policy === POLICY_WINDOW ? `  ·  cửa sổ ±${WINDOW_RADIUS}` : '  ·  toàn bộ volume'}
          </Text>
        </View>
      )}
      <View style={s.hidden} pointerEvents="none">
        {(residentSet(policy, z) || SLICES.map((_, i) => i)).map((i) => (
          <Image
            key={`${policy}-${i}`}
            source={{ uri: SLICES[i] }}
            style={s.tiny}
            onLoad={onWarm}
            onError={onWarm}
          />
        ))}
      </View>

      {/* A1 — slice renders with n/total · S4 — pinch-zoom (2 fingers), pan (1 finger), tap = which pixel
          S5 — in "Sửa" one finger paints; two fingers still pinch/pan and never paint */}
      <View style={s.viewport} ref={viewRef} onLayout={onViewportLayout} {...responder.panHandlers}>
        <Image
          source={{ uri: SLICES[z] }}
          style={imgStyle}
          resizeMode="stretch"
          fadeDuration={0}
          onLoad={onSliceLoad}
          pointerEvents="none"
        />
        {showMask && (
          <Image
            source={{ uri: MASKS[z] }}
            style={[imgStyle, s.overlayOpacity]}
            resizeMode="stretch"
            fadeDuration={0}
            pointerEvents="none"
          />
        )}
        <BrushOverlay working={working.current} slice={z} xf={xf} bumpRef={overlayBump} />
      </View>
      <Text style={s.counter}>
        slice {z + 1} / {NZ}   (z = {z})   zoom ×{xf && fitRef.current ? (xf.zoom / fitRef.current.zoom).toFixed(2) : '1.00'}
      </Text>

      {/* Everything below the viewport scrolls; the viewport itself stays outside
          the ScrollView so painting and pinching never fight with scrolling. */}
      <ScrollView style={s.controls} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* S5 — brush toolbar (SCR-06): mode, add / erase, size, undo, redo, reset */}
        <View style={s.row}>
          <Btn label="Xem" onPress={() => chooseEdit(false)} primary={!edit} />
          <Btn label="Sửa" onPress={() => chooseEdit(true)} primary={edit} />
          <Btn label="thêm" onPress={() => chooseTool('add')} primary={tool === 'add'} />
          <Btn label="xoá" onPress={() => chooseTool('erase')} primary={tool === 'erase'} />
        </View>
        <View style={s.row}>
          {RADII.map((r) => (
            <Btn key={r} label={`r ${r}`} onPress={() => chooseRadius(r)} primary={radius === r} />
          ))}
        </View>
        <View style={s.row}>
          <Btn label="hoàn tác" onPress={onUndo} disabled={hist.undo === 0 || opsRunning} />
          <Btn label="làm lại" onPress={onRedo} disabled={hist.redo === 0 || opsRunning} />
          <Btn label="đặt lại…" onPress={onReset} disabled={opsRunning} />
        </View>
        <View style={s.a2box}>
          <View style={s.legend}>
            <View style={[s.swatch, s.swatchSource]} />
            <Text style={s.legendT}>nguồn</Text>
            <View style={[s.swatch, s.addRun, s.swatchInline]} />
            <Text style={s.legendT}>thêm</Text>
            <View style={[s.swatch, s.eraseRun, s.swatchInline]} />
            <Text style={s.legendT}>xoá</Text>
          </View>
          <Text style={[s.statL, edit && s.bold]}>
            {edit ? 'Sửa' : 'Xem'} · {tool === 'add' ? 'thêm' : 'xoá'} · r = {radius} · {hist.strokes} nét · hoàn tác {hist.undo} / làm lại {hist.redo} · chưa lưu
          </Text>
        </View>

        <View style={s.row}>
          <Btn label="◀ prev" onPress={() => goTo(z - 1)} disabled={running || autoRunning || z === 0} />
          <Btn label="next ▶" onPress={() => goTo(z + 1)} disabled={running || autoRunning || z === NZ - 1} />
          <Btn label={showMask ? 'mask on' : 'mask off'} onPress={() => setShowMask((v) => !v)} disabled={running} />
          <Btn label="fit" onPress={() => fitRef.current && setTransform({ ...fitRef.current })} disabled={running || autoRunning} />
        </View>

        <View style={s.row}>
          <Btn label="kiểm A2 (checksum)" onPress={() => runA2Check('manual')} disabled={running || autoRunning} />
          <Btn label={autoRunning ? 'đang zoom/pan…' : 'A2 tự động'} onPress={() => setAutoRunning(true)} disabled={running || autoRunning || !view} />
        </View>

        <View style={s.row}>
          <Btn label="kiểm A5" onPress={runA5Check} disabled={checksBusy} />
          <Btn label={opsRunning ? 'đang chạy A3–A7…' : 'A3–A7 tự động'} onPress={() => setOpsRunning(true)} disabled={checksBusy} />
        </View>

        <View style={s.a2box}>
          <Text style={s.statL}>
            ánh xạ chạm→pixel: {mapCheck.pass}/{mapCheck.of} ca fixture
            {tap ? `   ·   chạm (${tap.u.toFixed(0)}, ${tap.v.toFixed(0)}) → ${tap.src ? `(${tap.src[0]}, ${tap.src[1]})` : 'ngoài ảnh'}` : ''}
          </Text>
          {a2 && (
            <Text style={[s.statL, a2.match === a2.of ? s.bold : s.bad]}>
              A2 lần {a2.check} ({a2.label}): checksum mask {a2.match}/{a2.of} khớp fixture · {a2.gestures_since_last_check} thao tác tay
              {a2.auto_steps_since_last_check ? ` + ${a2.auto_steps_since_last_check} bước tự động` : ''} kể từ lần kiểm trước
            </Text>
          )}
          {a5 && (
            <Text style={[s.statL, a5.every((r) => r.pass === r.of) ? s.bold : s.bad]}>
              A5: {a5.map((r) => `r = ${r.radius}: ${r.pass}/${r.of}`).join(' · ')} ca tô đúng tập kỳ vọng
            </Text>
          )}
          {opsResult && (
            <Text style={[s.statL, opsResult.match === opsResult.of ? s.bold : s.bad]}>
              A3–A7 tự động: {opsResult.match}/{opsResult.of} bản ghi khớp fixture · chạy trên bản nháp, mask làm việc không bị đụng
            </Text>
          )}
        </View>

        {/* S6 — the variable under test. One build, two policies, so the only
            thing that differs between the two runs is this switch. */}
        <View style={s.row}>
          <Btn
            label={`cache: toàn bộ (${NZ})`}
            onPress={() => changePolicy(POLICY_ALL)}
            disabled={running}
            primary={policy === POLICY_ALL}
          />
          <Btn
            label={`cache: cửa sổ ±${WINDOW_RADIUS}`}
            onPress={() => changePolicy(POLICY_WINDOW)}
            disabled={running}
            primary={policy === POLICY_WINDOW}
          />
        </View>

        <View style={s.row}>
          <Btn
            label={running ? 'đang chạy…' : `chạy ${NAV_SEQUENCE.length} bước (A9)`}
            onPress={() => setRunning(true)}
            disabled={running || !allWarmed}
            primary
          />
          <Btn label="xoá mẫu" onPress={reset} disabled={running} />
        </View>

        {stats && (
          <View style={s.stats}>
            <Text style={s.statH}>n = {stats.frame.n} mẫu · ms tới frame hiển thị</Text>
            <Text style={s.statL}>
              min {stats.frame.min}  ·  p50 {stats.frame.p50}  ·  <Text style={s.bold}>p95 {stats.frame.p95}</Text>  ·  max {stats.frame.max}
            </Text>
            <Text style={s.statH}>ms tới decode xong</Text>
            <Text style={s.statL}>
              min {stats.load.min}  ·  p50 {stats.load.p50}  ·  p95 {stats.load.p95}  ·  max {stats.load.max}
            </Text>
            <Text style={s.note}>
              NFR-PERF-001 đòi p95 ≤ 200 ms cho slice ĐÃ CACHE. Con số này CHƯA phải
              bằng chứng nghiệm thu nếu build không phải release — debug build làm lệch timing.
              {policy === POLICY_WINDOW
              ? `  ⚠ Đang chạy cửa sổ ±${WINDOW_RADIUS}: bước nhảy ra ngoài cửa sổ là cache MISS, không thuộc phạm vi NFR-PERF-001. extract_timings.py tách riêng p95 trong cửa sổ.`
              : ''}
            </Text>
          </View>
        )}

        <View style={s.log}>
          {samples.length === 0
            ? <Text style={s.dim}>Chưa có mẫu nào. Nhấn nút chạy sau khi cache nạp xong.</Text>
            : samples.map((sm, i) => (
              <Text key={i} style={s.logLine}>
                {String(i + 1).padStart(2, ' ')}. z={String(sm.slice).padStart(2, ' ')}   frame {String(sm.ms_to_frame).padStart(7, ' ')} ms   load {String(sm.ms_to_load).padStart(7, ' ')} ms
              </Text>
            ))}
        </View>
      </ScrollView>
    </View>
  );
}

/*
 * S5: where the working mask differs from the source on this slice, as row runs
 * placed with the image's own transform - added pixels in one colour, erased
 * pixels in another, over the S4 source overlay. It owns its render counter, so
 * a brush sample re-renders this layer only, not the whole screen.
 */
const BrushOverlay = React.memo(function BrushOverlay({ working, slice, xf, bumpRef }) {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    bumpRef.current = () => setRev((n) => n + 1);
    return () => { bumpRef.current = null; };
  }, [bumpRef]);
  // The working buffer is edited in place, so rev is the dependency that matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runs = useMemo(() => diffRuns(working[slice], maskBytes()[slice], NX, NY), [working, slice, rev]);
  if (!xf) return null;
  return (
    <>
      {runs.map((r) => (
        <View
          key={`${r.y}:${r.x}`}
          pointerEvents="none"
          style={[r.kind === 'add' ? s.addRun : s.eraseRun, {
            left: xf.panX + r.x * xf.zoom, top: xf.panY + r.y * xf.zoom, width: r.len * xf.zoom, height: xf.zoom,
          }]}
        />
      ))}
    </>
  );
});

function Btn({ label, onPress, disabled, primary }) {
  return (
    <TouchableOpacity
      style={[s.btn, primary && s.btnP, disabled && s.btnD]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[s.btnT, primary && s.btnTP, disabled && s.btnTD]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wvRoot: { flex: 1, backgroundColor: '#000', paddingTop: 40 },
  wvBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0e1116' },
  wvBack: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#1c2430', marginRight: 10 },
  wvBackT: { color: '#e8eaed', fontSize: 14, fontWeight: '600' },
  wvTitle: { color: '#8b939b', fontSize: 11, fontFamily: 'monospace', flex: 1 },
  wvView: { flex: 1, backgroundColor: '#000' },
  root: { flex: 1, backgroundColor: '#0e1116', paddingTop: 48, paddingHorizontal: 14 },
  h1: { color: '#e8eaed', fontSize: 18, fontWeight: '700' },
  sub: { color: '#8b939b', fontSize: 12, marginBottom: 10, fontFamily: 'monospace' },
  warm: { backgroundColor: '#2a1f14', borderColor: '#4a3722', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  warmT: { color: '#e0a066', fontSize: 13, fontFamily: 'monospace' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden' },
  tiny: { width: 1, height: 1 },
  viewport: { width: '100%', aspectRatio: 1, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0, opacity: 0.35 },
  overlayOpacity: { opacity: 0.35 },
  addRun: { position: 'absolute', backgroundColor: '#3fb950', opacity: 0.8 },
  eraseRun: { position: 'absolute', backgroundColor: '#f85149', opacity: 0.8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  swatchSource: { backgroundColor: '#ffffff', opacity: 0.35 },
  swatchInline: { position: 'relative' },
  legendT: { color: '#b3bac1', fontSize: 12, marginRight: 8 },
  controls: { flex: 1, marginTop: 2 },
  a2box: { marginTop: 10, backgroundColor: '#161a20', borderColor: '#282e36', borderWidth: 1, borderRadius: 8, padding: 10 },
  bad: { color: '#f08a95', fontWeight: '700' },
  counter: { color: '#e8eaed', fontSize: 15, fontFamily: 'monospace', marginTop: 8, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, backgroundColor: '#1b2027', borderColor: '#282e36', borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnP: { backgroundColor: '#132437', borderColor: '#58a6ff' },
  btnD: { opacity: 0.4 },
  btnT: { color: '#b3bac1', fontSize: 13, fontWeight: '600' },
  btnTP: { color: '#58a6ff' },
  btnTD: { color: '#6d757d' },
  stats: { marginTop: 12, backgroundColor: '#161a20', borderColor: '#282e36', borderWidth: 1, borderRadius: 8, padding: 12 },
  statH: { color: '#8b939b', fontSize: 11, fontFamily: 'monospace', marginTop: 6 },
  statL: { color: '#e8eaed', fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  bold: { color: '#5fd39a', fontWeight: '700' },
  note: { color: '#8b939b', fontSize: 11, marginTop: 8, lineHeight: 15 },
  log: { marginTop: 10 },
  logLine: { color: '#b3bac1', fontSize: 11, fontFamily: 'monospace' },
  dim: { color: '#6d757d', fontSize: 12 },
});
