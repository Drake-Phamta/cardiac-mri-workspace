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
 * needs, stage S4 — pinch-zoom and pan (A2), stage S5 — brush, stage S6 —
 * the bounded cache window below, and stage S8 — save and reload (A8).
 *
 * S8 (2026-09-19): A8 IS "THE SAME MASK CAME BACK", NOT "A FILE WAS WRITTEN".
 * The corrected working mask is run-length coded (app/persist.js), written to
 * a real file with expo-file-system, read back, decoded, and every slice is
 * re-hashed against the checksum the saver stored. A round trip that quietly
 * loses one corrected voxel would otherwise look exactly like a success, and
 * a reviewed mask in `11` is an artifact WITH a checksum for that reason.
 *
 * Two things the automated check deliberately cannot answer, so the session
 * script does them by hand:
 *   - persistence ACROSS PROCESS DEATH. The loop below saves and reloads in
 *     one process, which proves the codec and the file, not that the file
 *     survives the app being killed. The operator force-stops the app,
 *     relaunches, presses "Nạp lại" and compares volume_sha256 with the one
 *     the save printed. That comparison is the real A8.
 *   - whether the timing is release-build timing. A debug build skews it, and
 *     nothing in here can detect that.
 *
 * Why run-length and not raw bytes: 576x576x88 is 29.2 MB of one-byte voxels,
 * ~39 MB once base64 has padded it into a text file. Writing that would
 * measure JSON, not persistence. The mask is binary and spatially coherent,
 * so runs are what any real implementation would store.
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
import { File, Paths } from 'expo-file-system';

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
import {
  FORMAT, decodeRuns, editedSlices, encodeRuns, hashSlices, verifySlices, volumeHash,
} from './persist';

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

// Log tags the harness scripts grep for. Keep them stable.
const TAG = 'SPIKE_A_TIMING';
const TAG_A2 = 'SPIKE_A_A2';
const TAG_GESTURE = 'SPIKE_A_GESTURE';
const TAG_TAP = 'SPIKE_A_TAP';
const TAG_MAP = 'SPIKE_A_MAP';
const TAG_BRUSH = 'SPIKE_A_BRUSH';
const TAG_A5 = 'SPIKE_A_A5';
const TAG_OPS = 'SPIKE_A_OPS';
const TAG_A8 = 'SPIKE_A_A8';

// --- S8: where a saved working mask lives ----------------------------------
// Paths.document, not Paths.cache: the cache directory is exactly the one the
// system may delete under storage pressure, and "the file was gone" would be
// an A8 failure caused by the harness rather than by the candidate.
const SAVE_NAME = 'spike_a_working_mask_v1.json';
const saveFile = () => new File(Paths.document, SAVE_NAME);
const A8_CYCLES = 5;
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

  // --- S8: save / reload (A8) -------------------------------------------------
  const [saved, setSaved] = useState(null);      // what the last save in THIS process wrote
  const [a8, setA8] = useState(null);            // last save, reload or A8 loop result
  const [a8Busy, setA8Busy] = useState(false);
  const [onDisk, setOnDisk] = useState(null);    // a file found at startup, from a previous process
  // A ref, not the `saved` state: the A8 loop calls doSave and doReload inside
  // one synchronous pass, where a state update has not landed yet, and reading
  // it there would label every cycle "cold" and make the loop look like proof
  // of exactly the thing it cannot prove.
  const savedThisProcess = useRef(false);
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
    // S8: record the outcome ON THE GESTURE, so A11 ("zero accidental edits")
    // is readable from one record instead of inferred by correlating two log
    // streams on timestamps. A verdict that rests on a correlation is a
    // verdict that can be wrong quietly.
    if (gest.current) {
      gest.current.strokeEnd = st.result.end;
      gest.current.strokeCommitted = st.result.committed;
    }
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
        // S8, for A11: did this gesture start a stroke, and did that stroke
        // commit? A committed stroke in a gesture that reached two fingers
        // would be an accidental edit, which A11 bounds at zero.
        stroke_started: cur.stroke === true,
        stroke_end: cur.strokeEnd ?? null,
        stroke_committed: cur.strokeCommitted ?? null,
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

  // --- S8: save, reload and the A8 loop ---------------------------------------
  /*
   * Phases are timed separately because a single "save took N ms" cannot be
   * acted on. Run-length coding, checksumming, JSON and the write itself scale
   * differently, and the decision GATE-MOB-01 has to make is whether the
   * CANDIDATE is slow, not whether JSON is.
   *
   * Every timing is measured around synchronous calls (File.write,
   * File.textSync), so no scheduler gap is counted as work.
   */
  const doSave = useCallback(() => {
    const slices = working.current;
    const t0 = now();
    const runs = encodeRuns(slices);
    const t1 = now();
    const sha256 = hashSlices(slices);
    const t2 = now();
    const volume_sha256 = volumeHash(slices);
    const t3 = now();
    const json = JSON.stringify({ format: FORMAT, nx: NX, ny: NY, nz: NZ, runs, sha256, volume_sha256 });
    const t4 = now();
    const f = saveFile();
    f.write(json);
    const t5 = now();

    const rec = {
      phase: 'save',
      nx: NX, ny: NY, nz: NZ,
      edited_slices: editedSlices(slices, maskBytes()).length,
      strokes: committed.current,
      rle_ms: round(t1 - t0),
      sha_ms: round(t2 - t1),
      volume_sha_ms: round(t3 - t2),
      json_ms: round(t4 - t3),
      write_ms: round(t5 - t4),
      save_ms: round(t5 - t0),
      bytes: json.length,
      raw_bytes: NX * NY * NZ,
      ratio: +(json.length / (NX * NY * NZ)).toFixed(4),
      volume_sha256,
      uri: f.uri,
    };
    console.log(`${TAG_A8} ${JSON.stringify(rec)}`);
    savedThisProcess.current = true;
    setSaved({ at: Date.now(), bytes: json.length, volume_sha256 });
    setOnDisk(null);
    return rec;
  }, []);

  /*
   * Reload REPLACES the live working mask with what came off disk. Anything
   * weaker would be checking a decoder, not a reload: the claim A8 makes is
   * that the reviewer gets their corrections back, in the buffer the screen
   * draws from.
   *
   * `cold` is the field that matters. false means a save happened in this
   * process, so the file may owe its contents to memory that is still warm;
   * true means this process never saved, so the file is genuinely from a
   * previous run of the app. Only a cold reload settles A8.
   */
  const doReload = useCallback(() => {
    const f = saveFile();
    if (!f.exists) {
      setA8({ phase: 'reload', error: 'không có tệp đã lưu' });
      console.log(`${TAG_A8} ${JSON.stringify({ phase: 'reload', error: 'no_file', uri: f.uri })}`);
      return null;
    }
    const cold = savedThisProcess.current === false;
    const t0 = now();
    const text = f.textSync();
    const t1 = now();
    const doc = JSON.parse(text);
    const t2 = now();
    const slices = decodeRuns(doc);
    const t3 = now();
    const mismatches = verifySlices(slices, doc.sha256);
    const t4 = now();
    for (let i = 0; i < slices.length; i++) working.current[i].set(slices[i]);
    const t5 = now();
    const after = volumeHash(working.current);
    const t6 = now();

    // Reloading discards the undo history: the strokes it holds refer to
    // pixel values that are no longer the ones in the buffer, and replaying
    // one would write a stale value back into the reviewed mask.
    history.current.undo.length = 0;
    history.current.redo.length = 0;
    committed.current = 0;
    if (overlayBump.current) overlayBump.current();
    refreshHist();

    const rec = {
      phase: 'reload',
      cold,
      nz: doc.nz,
      read_ms: round(t1 - t0),
      parse_ms: round(t2 - t1),
      rle_decode_ms: round(t3 - t2),
      verify_ms: round(t4 - t3),
      restore_ms: round(t5 - t4),
      volume_sha_ms: round(t6 - t5),
      reload_ms: round(t5 - t0),
      bytes: text.length,
      verified: doc.nz - mismatches.length,
      mismatches: mismatches.slice(0, 16),
      mismatches_total: mismatches.length,
      volume_sha256_file: doc.volume_sha256,
      volume_sha256_after: after,
      volume_sha256_match: doc.volume_sha256 === after,
    };
    console.log(`${TAG_A8} ${JSON.stringify(rec)}`);
    setA8(rec);
    return rec;
  }, [refreshHist]);

  const onSave = useCallback(() => {
    if (stroke.current || a8Busy) return;
    setA8Busy(true);
    try { setA8(doSave()); } finally { setA8Busy(false); }
  }, [a8Busy, doSave]);

  const onReload = useCallback(() => {
    if (stroke.current || a8Busy) return;
    // Reloading overwrites uncommitted work, so it asks first (`10` §9).
    const go = () => { setA8Busy(true); try { doReload(); } finally { setA8Busy(false); } };
    if (hist.strokes === 0 && hist.undo === 0) { go(); return; }
    Alert.alert(
      'Nạp lại bản đã lưu?',
      `${hist.strokes} nét tô và lịch sử hoàn tác hiện tại sẽ bị thay bằng nội dung tệp đã lưu.`,
      [{ text: 'Huỷ', style: 'cancel' }, { text: 'Nạp lại', style: 'destructive', onPress: go }],
    );
  }, [a8Busy, doReload, hist.strokes, hist.undo]);

  /*
   * "A8 tự động": A8_CYCLES save+reload round trips back to back. This is the
   * distribution, not the verdict - every cycle here is warm and in one
   * process. The verdict needs the cold reload the session script describes.
   */
  const runA8Check = useCallback(() => {
    if (stroke.current || a8Busy) return;
    setA8Busy(true);
    const results = [];
    try {
      for (let i = 0; i < A8_CYCLES; i++) {
        const before = volumeHash(working.current);
        const sv = doSave();
        const rl = doReload();
        if (!rl) break;
        results.push({
          cycle: i + 1,
          save_ms: sv.save_ms,
          reload_ms: rl.reload_ms,
          bytes: sv.bytes,
          verified: rl.verified,
          of: NZ,
          round_trip_exact: before === rl.volume_sha256_after && rl.mismatches_total === 0,
        });
        console.log(`${TAG_A8}_CYCLE ${JSON.stringify(results[results.length - 1])}`);
      }
    } finally {
      setA8Busy(false);
    }
    const exact = results.filter((r) => r.round_trip_exact).length;
    console.log(`${TAG_A8}_SUMMARY ${JSON.stringify({ cycles: results.length, exact, of: results.length })}`);
    setA8({ phase: 'loop', cycles: results.length, exact, results });
  }, [a8Busy, doReload, doSave]);

  // At startup, report whether a file from a PREVIOUS process is on disk. The
  // operator needs to know that before deciding whether a reload is cold.
  useEffect(() => {
    const f = saveFile();
    if (f.exists) {
      const info = { bytes: f.size, uri: f.uri };
      setOnDisk(info);
      console.log(`${TAG_A8}_STARTUP ${JSON.stringify({ found: true, ...info })}`);
    } else {
      console.log(`${TAG_A8}_STARTUP ${JSON.stringify({ found: false, uri: f.uri })}`);
    }
  }, []);

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
  const checksBusy = running || autoRunning || opsRunning || a8Busy;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Text style={s.h1}>SPIKE_A · 2D viewer harness</Text>
      <Text style={s.sub}>React Native / Expo candidate · fixture {NX}×{NY}×{NZ}</Text>

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
            {edit ? 'Sửa' : 'Xem'} · {tool === 'add' ? 'thêm' : 'xoá'} · r = {radius} · {hist.strokes} nét · hoàn tác {hist.undo} / làm lại {hist.redo} ·{' '}
            {saved
              ? `đã lưu ${(saved.bytes / 1024).toFixed(0)} KB`
              : (onDisk ? `có bản lưu từ lần chạy trước (${(onDisk.bytes / 1024).toFixed(0)} KB)` : 'chưa lưu')}
          </Text>
        </View>

        {/* S8 — A8. "Nạp lại" right after a fresh launch is the COLD one, the
            only reload that proves the file outlived the process. */}
        <View style={s.row}>
          <Btn label="lưu" onPress={onSave} disabled={checksBusy} />
          <Btn label="nạp lại" onPress={onReload} disabled={checksBusy || (!saved && !onDisk)} />
          <Btn label={a8Busy ? 'đang chạy A8…' : `A8 tự động (${A8_CYCLES})`} onPress={runA8Check} disabled={checksBusy} />
        </View>

        {a8 && (
          <View style={s.a2box}>
            {a8.error && <Text style={[s.statL, s.bad]}>A8: {a8.error}</Text>}
            {a8.phase === 'save' && (
              <Text style={s.statL}>
                A8 lưu: {(a8.bytes / 1024).toFixed(0)} KB ({(a8.ratio * 100).toFixed(1)}% của {(a8.raw_bytes / 1048576).toFixed(1)} MB thô)
                {' '}· {a8.save_ms} ms (rle {a8.rle_ms} · sha {a8.sha_ms} · json {a8.json_ms} · ghi {a8.write_ms})
                {' '}· {a8.edited_slices}/{NZ} slice đã sửa
              </Text>
            )}
            {a8.phase === 'reload' && !a8.error && (
              <Text style={[s.statL, a8.mismatches_total === 0 && a8.volume_sha256_match ? s.bold : s.bad]}>
                A8 nạp lại{a8.cold ? ' (NGUỘI — tệp từ lần chạy trước)' : ' (nóng — cùng phiên)'}:
                {' '}{a8.verified}/{a8.nz} slice khớp checksum · hash khối {a8.volume_sha256_match ? 'khớp' : 'LỆCH'}
                {' '}· {a8.reload_ms} ms (đọc {a8.read_ms} · parse {a8.parse_ms} · giải rle {a8.rle_decode_ms} · kiểm {a8.verify_ms} · khôi phục {a8.restore_ms})
              </Text>
            )}
            {a8.phase === 'loop' && (
              <Text style={[s.statL, a8.exact === a8.cycles ? s.bold : s.bad]}>
                A8 tự động: {a8.exact}/{a8.cycles} vòng lưu→nạp lại đúng từng byte
                {' '}· lưu {a8.results.map((r) => r.save_ms).join(' / ')} ms
                {' '}· nạp {a8.results.map((r) => r.reload_ms).join(' / ')} ms
              </Text>
            )}
            <Text style={s.note}>
              Vòng tự động chạy trong CÙNG tiến trình nên chỉ chứng minh mã hoá và tệp.
              A8 thật cần: lưu → force-stop ứng dụng → mở lại → "nạp lại" (khi đó ghi NGUỘI) → hash khối khớp.
            </Text>
          </View>
        )}

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
