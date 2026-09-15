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
 * needs, and stage S4 — pinch-zoom and pan (A2). A3/A4/A5/A6/A7/A8/A10/A11 are
 * later stages.
 *
 * S4 (2026-09-14): zoom and pan change ONLY a display transform
 * {zoom, panX, panY} (invariant 2 of `07` §8). The source mask is decoded once
 * into MASK_BYTES and no transform code ever receives it. A2 is checked on the
 * device, not asserted: "kiểm A2" hashes every source-mask slice and compares
 * with the fixture's slice_sha256, before and after real gestures and after an
 * automated zoom/pan sequence. All transform math lives in viewerMath.js and is
 * tested offline by harness/test_viewer_math.mjs.
 *
 * NOTHING here invents a number. Every sample is a real timestamp pair taken on
 * the device, emitted to logcat with a fixed tag so harness/extract_timings.py
 * and harness/extract_a2.py can recover the raw record rather than a summary.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import volume from '../fixtures/volume_synthetic.json';
import maskFx from '../fixtures/mask_synthetic.json';
import brushFx from '../fixtures/brush_cases.json';
import {
  A2_SEQUENCE, applyStep, base64ToBytes, clampZoom, fitTransform, panBy,
  screenToSource, sha256Hex, zoomAbout,
} from './viewerMath';

const [NX, NY, NZ] = volume.shape_xyz;
const SLICES = volume.slices_png_data_uri;
const MASKS = maskFx.slices_png_data_uri;

// The source mask, decoded once. Read by the A2 checksum only - never by any
// zoom, pan or rendering code.
const MASK_BYTES = maskFx.slices_b64.map(base64ToBytes);

// Log tags the harness scripts grep for. Keep them stable.
const TAG = 'SPIKE_A_TIMING';
const TAG_A2 = 'SPIKE_A_A2';
const TAG_GESTURE = 'SPIKE_A_GESTURE';
const TAG_TAP = 'SPIKE_A_TAP';
const TAG_MAP = 'SPIKE_A_MAP';
const now = () => (global.performance ? performance.now() : Date.now());
const round = (v) => +v.toFixed(3);

function hashAllMasks() {
  const hashes = MASK_BYTES.map((b) => sha256Hex(b));
  const match = hashes.filter((h, z) => h === maskFx.slice_sha256[z]).length;
  return { hashes, match };
}

// The app's own screen->source mapping against the fixture's 60 brush cases.
// A precursor to A5, not A5: no brush exists yet.
function mappingSelfCheck() {
  let pass = 0;
  for (const c of brushFx.cases) {
    const got = screenToSource(c.touch_u, c.touch_v, { zoom: c.zoom, panX: c.pan_x, panY: c.pan_y }, NX, NY);
    if (JSON.stringify(got) === JSON.stringify(c.expected_source_pixel)) pass += 1;
  }
  return { pass, of: brushFx.cases.length };
}

/*
 * A9 asks for a "30-step navigation test" over "already available/cached
 * slices". The sequence is fixed rather than random so two runs are comparable:
 * forward run, backward run, then jumps, which is how a reader actually moves
 * through a stack.
 */
const NAV_SEQUENCE = [
  1, 2, 3, 4, 5, 6, 7, 8,           // forward run
  7, 6, 5, 4, 3, 2, 1, 0,           // backward run
  8, 0, 15, 4, 11, 2, 13, 6,        // jumps
  7, 8, 9, 10, 11, 12,              // forward again
];

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

  const t0 = useRef(null);
  const pending = useRef(null);

  const allWarmed = warmed >= NZ;

  // --- prewarm -------------------------------------------------------------
  // A9 measures switching among CACHED slices, so every slice is decoded once
  // before any measurement is allowed. Until that finishes the measure button
  // stays disabled — measuring a cold cache would answer a different question.
  const onWarm = useCallback(() => setWarmed((n) => n + 1), []);

  const goTo = useCallback((target) => {
    if (target < 0 || target >= NZ) return;
    t0.current = global.performance ? performance.now() : Date.now();
    pending.current = target;
    setZ(target);
  }, []);

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
      };
      setSamples((prev) => [...prev, s]);
      // Raw sample to logcat. extract_timings.py reads these; the on-screen
      // table is only a fallback for when logcat is not available.
      console.log(`${TAG} ${JSON.stringify(s)}`);
    });
  }, []);

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
    console.log(`${TAG}_RUN_START steps=${NAV_SEQUENCE.length} nz=${NZ}`);
    step();
    return () => { cancelled = true; };
  }, [running, goTo]);

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
    requestAnimationFrame(frameLoop);
  }, []);

  const pagePoints = (evt) => evt.nativeEvent.touches.map((t) => ({
    x: t.pageX - origin.current.x, y: t.pageY - origin.current.y,
  }));

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const pts = pagePoints(evt);
      gest.current = {
        t0: now(), start: pts[0], prev: pts, kind: 'pan', moves: 0, travel: 0,
        maxFingers: pts.length, frames: 0, maxGap: 0, lastFrame: null,
        zoomStart: xfRef.current?.zoom,
      };
      requestAnimationFrame(frameLoop);
    },
    onPanResponderMove: (evt) => {
      const cur = gest.current;
      const t = xfRef.current;
      if (!cur || !t) return;
      const pts = pagePoints(evt);
      cur.moves += 1;
      cur.maxFingers = Math.max(cur.maxFingers, pts.length);
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
      const cur = gest.current;
      gest.current = null;
      if (!cur) return;
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
  }), [frameLoop, setTransform, z]);

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

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Text style={s.h1}>SPIKE_A · 2D viewer harness</Text>
      <Text style={s.sub}>React Native / Expo candidate · fixture {NX}×{NY}×{NZ}</Text>

      {/* prewarm: decode every slice once, offscreen */}
      {!allWarmed && (
        <View style={s.warm}>
          <Text style={s.warmT}>Đang nạp cache slice… {warmed}/{NZ}</Text>
          <View style={s.hidden}>
            {SLICES.map((uri, i) => (
              <Image key={i} source={{ uri }} style={s.tiny} onLoad={onWarm} onError={onWarm} />
            ))}
          </View>
        </View>
      )}

      {/* A1 — slice renders with n/total · S4 — pinch-zoom (2 fingers), pan (1 finger), tap = which pixel */}
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
      </View>
      <Text style={s.counter}>
        slice {z + 1} / {NZ}   (z = {z})   zoom ×{xf && fitRef.current ? (xf.zoom / fitRef.current.zoom).toFixed(2) : '1.00'}
      </Text>

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
            NFR-PERF-001 đòi p95 ≤ 200 ms. Con số này CHƯA phải bằng chứng nghiệm thu
            nếu build không phải release — debug build làm lệch timing.
          </Text>
        </View>
      )}

      <ScrollView style={s.log} contentContainerStyle={{ paddingBottom: 12 }}>
        {samples.length === 0
          ? <Text style={s.dim}>Chưa có mẫu nào. Nhấn nút chạy sau khi cache nạp xong.</Text>
          : samples.map((sm, i) => (
            <Text key={i} style={s.logLine}>
              {String(i + 1).padStart(2, ' ')}. z={String(sm.slice).padStart(2, ' ')}   frame {String(sm.ms_to_frame).padStart(7, ' ')} ms   load {String(sm.ms_to_load).padStart(7, ' ')} ms
            </Text>
          ))}
      </ScrollView>
    </View>
  );
}

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
  log: { flex: 1, marginTop: 10 },
  logLine: { color: '#b3bac1', fontSize: 11, fontFamily: 'monospace' },
  dim: { color: '#6d757d', fontSize: 12 },
});
