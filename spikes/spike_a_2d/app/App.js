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
 * Covers so far: A1 (slice renders with n/total) and the instrumentation A9
 * needs. A2/A3/A4/A5/A6/A7/A8/A10/A11 are later stages.
 *
 * NOTHING here invents a number. Every sample is a real timestamp pair taken on
 * the device, emitted to logcat with a fixed tag so harness/extract_timings.py
 * can recover the raw distribution rather than a summary.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import volume from '../fixtures/volume_synthetic.json';
import maskFx from '../fixtures/mask_synthetic.json';

const [NX, NY, NZ] = volume.shape_xyz;
const SLICES = volume.slices_png_data_uri;
const MASKS = maskFx.slices_png_data_uri;

// Log tag that extract_timings.py greps for. Keep it stable.
const TAG = 'SPIKE_A_TIMING';

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

      {/* A1 — slice renders with n/total */}
      <View style={s.viewport}>
        <Image
          source={{ uri: SLICES[z] }}
          style={s.img}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={onSliceLoad}
        />
        {showMask && (
          <Image
            source={{ uri: MASKS[z] }}
            style={[s.img, s.overlay]}
            resizeMode="contain"
            fadeDuration={0}
            pointerEvents="none"
          />
        )}
      </View>
      <Text style={s.counter}>slice {z + 1} / {NZ}   (z = {z})</Text>

      <View style={s.row}>
        <Btn label="◀ prev" onPress={() => goTo(z - 1)} disabled={running || z === 0} />
        <Btn label="next ▶" onPress={() => goTo(z + 1)} disabled={running || z === NZ - 1} />
        <Btn label={showMask ? 'mask on' : 'mask off'} onPress={() => setShowMask((v) => !v)} disabled={running} />
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
